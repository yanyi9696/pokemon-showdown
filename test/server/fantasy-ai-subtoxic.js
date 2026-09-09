'use strict';

const assert = require('assert').strict;
const { Battle, Dex, Teams, TeamValidator } = require('../../dist/sim');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { captureInitialTeam } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { RulePolicy } = require('../../dist/server/fantasy-ai/policy');
const { readBattleMemory, ownSeen } = require('../../dist/server/fantasy-ai/memory');
const { estimateMove } = require('../../dist/server/fantasy-ai/matchup');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { reconstructWorld } = require('../../dist/server/fantasy-ai/reconstruction');
const { RolloutPolicy } = require('../../dist/server/fantasy-ai/rollout');

const SEED = 'gen5,0011001200130014';
const AEGISLASH = {
	species: 'Aegislash', ability: 'Stance Change', item: 'Leftovers', nature: 'Modest',
	evs: { hp: 252, spa: 56, spd: 156, spe: 44 }, ivs: { atk: 0 },
	moves: ['substitute', 'toxic', 'kingsshield', 'shadowball'],
};
const BENCH = [
	{ species: 'Cursola-Fantasy', ability: 'Persistent', item: 'fantasydefensegem', nature: 'Quiet',
		evs: { hp: 252, spa: 4, spd: 252 }, ivs: { atk: 0 }, moves: ['hex', 'willowisp', 'trickroom', 'strengthsap'] },
	{ species: 'Golurk-Mega', ability: 'Iron Fist', item: 'golurkite', nature: 'Adamant',
		evs: { hp: 252, atk: 252, spd: 4 }, moves: ['poltergeist', 'closecombat', 'earthquake', 'knockoff'] },
	{ species: 'Dusknoir-Fantasy', ability: 'shouhun', item: 'fantasyprotector', nature: 'Relaxed',
		evs: { hp: 252, atk: 4, def: 252 }, moves: ['poltergeist', 'recover', 'trickroom', 'teleport'] },
	{ species: 'Gengar-Fantasy', ability: 'Prankster', item: 'Heavy-Duty Boots', nature: 'Timid',
		evs: { spa: 252, spd: 4, spe: 252 }, ivs: { atk: 0 }, moves: ['wasitihuan', 'bittermalice', 'encore', 'destinybond'] },
	{ species: 'Marowak-Alola-Fantasy', ability: 'Rock Head', item: 'Thick Club', nature: 'Adamant',
		evs: { hp: 248, atk: 252, spd: 8 }, moves: ['shadowbone', 'flareblitz', 'shadowsneak', 'swordsdance'] },
];
const FOE = { species: 'Slowking', ability: 'Regenerator', item: 'Leftovers', nature: 'Bold',
	evs: { hp: 252, def: 252, spd: 4 }, moves: ['scald', 'slackoff', 'futuresight', 'teleport'] };
const WALL = { ...FOE, species: 'Hippowdon', ability: 'Sand Force', moves: ['earthquake', 'slackoff', 'stealthrock', 'toxic'] };

describe('Fantasy AI SubToxic and Stance Change', function () {
	this.timeout(30000);
	let battle;
	let trainer;
	let initialOpponent;
	let policy;
	const dex = Dex.forFormat('gen9fcuu');
	afterEach(() => { if (battle) battle.destroy(); battle = null; });
	function setup(foe = FOE, own = AEGISLASH, wall = WALL) {
		const team = structuredClone([own, ...BENCH]);
		const enemy = structuredClone([foe, wall,
			{ ...FOE, species: 'Crobat', ability: 'Inner Focus', moves: ['bravebird', 'roost', 'taunt', 'uturn'] },
			{ ...FOE, species: 'Raikou', ability: 'Pressure', moves: ['thunderbolt', 'shadowball', 'calmmind', 'protect'] },
			{ ...FOE, species: 'Entei', ability: 'Pressure', moves: ['sacredfire', 'extremespeed', 'stoneedge', 'protect'] },
			{ ...FOE, species: 'Flygon', ability: 'Levitate', moves: ['earthquake', 'uturn', 'roost', 'defog'] },
		]);
		for (let index = 1; index < enemy.length; index++) {
			if (enemy[index].species === foe.species) enemy[index] = structuredClone(FOE);
		}
		const format = own.species.includes('Fantasy') ? 'gen9fcubersuu' : 'gen9fcuu';
		assert.equal(new TeamValidator(format).validateTeam(team), null);
		assert.equal(new TeamValidator(format).validateTeam(enemy), null);
		trainer = { format, style: 'balanced', packedTeam: Teams.pack(team), keyMembers: [1, 3, 6],
			resourcePreferences: ['mega', 'terastallize'] };
		policy = new RulePolicy(trainer);
		battle = new Battle({ formatid: trainer.format, seed: SEED, p1: { team }, p2: { team: enemy } });
		initialOpponent = captureInitialTeam(battle, 'p2');
		battle.makeChoices('team 123456', 'team 123456');
	}
	function observe(difficulty = 'hard') {
		const view = new InformationView({ ownSide: 'p1', difficulty, initialOpponent });
		view.receiveUpdate(battle.log.join('\n'));
		return view.observe(battle.p1.activeRequest);
	}
	function state() {
		const observation = observe();
		const memory = readBattleMemory(observation.publicLog, dex);
		const slot = observation.request.side.pokemon[0];
		return { memory, mon: policy.hypotheses.own(slot, ownSeen(memory, 'p1', slot.ident, slot.active)),
			foe: policy.hypotheses.build(memory.sides.p2.active, observation, memory)[0] };
	}
	function probe(move, source, target) {
		const { memory, mon, foe } = state();
		return estimateMove(trainer.format, source || mon, target || foe, move, '', memory, 'p1', 1);
	}
	const explain = result => JSON.stringify({ choice: result.choice, candidates: result.candidates, diagnostics: result.diagnostics });
	function choose() { return policy.decide(observe(), SEED); }

	for (const species of ['Aegislash', 'Aegislash-Fantasy']) {
		it(`${species}: probes the configured Blade/Shield stats and a successful first King's Shield`, () => {
			setup({ ...FOE, moves: ['slackoff'] }, { ...AEGISLASH, species });
			const attack = probe('shadowball');
			battle.makeChoices('move 4', 'move 1');
			assert.deepEqual(attack.userAfterMove.stats, { hp: battle.p1.active[0].maxhp, ...battle.p1.active[0].storedStats });
			assert(attack.postAction[0].profile.species.includes('Blade'));
			const shield = probe('kingsshield');
			assert.equal(shield.protection, 1);
			assert.equal(shield.ineffective, 0);
			battle.makeChoices('move 3', 'move 1');
			assert.deepEqual(shield.userAfterMove.stats, { hp: battle.p1.active[0].maxhp, ...battle.p1.active[0].storedStats });
		});
	}
	it('uses native protection against attacks but cannot shield against status moves', () => {
		setup();
		const { mon, foe, memory } = state();
		const guard = probe('kingsshield').postAction[0].profile;
		const sporeFoe = { ...foe, moves: ['spore', 'scald'] };
		const reply = (id, target) => estimateMove(trainer.format, sporeFoe, target, id, '', memory, 'p2', 1);
		assert.equal(reply('scald', guard).damage, 0);
		assert(reply('scald', mon).damage > 0);
		assert(reply('spore', guard).status > 0);
	});
	it('models substitute HP, blocked status, damage to the barrier and sound bypass', () => {
		setup();
		const { foe, memory } = state();
		const sub = probe('substitute').postAction[0].profile;
		const attacker = { ...foe, moves: ['scald', 'spore', 'bugbuzz'], ability: '' };
		const reply = id => estimateMove(trainer.format, attacker, sub, id, '', memory, 'p2', 1);
		assert.equal(reply('spore').status, 0);
		const scald = reply('scald');
		assert.equal(scald.damage, 0);
		assert(scald.substituteDamage > 0);
		assert.equal(scald.ineffective, 0);
		assert(reply('bugbuzz').damage > 0);
	});
	it('preserves public protection success odds and fresh substitute HP in reconstruction', () => {
		setup({ ...FOE, moves: ['slackoff'] });
		battle.makeChoices('move 3', 'move 1');
		assert.equal(probe('kingsshield').protection, 1 / 3);
		const world = new WorldBuilder(trainer).build(observe())[0];
		const copy = reconstructWorld(world, SEED);
		try {
			assert.equal(copy.p1.active[0].volatiles.stall.counter, battle.p1.active[0].volatiles.stall.counter);
		} finally { copy.destroy(); }
		battle.makeChoices('move 1', 'move 1');
		assert.equal(probe('kingsshield').protection, 1);
		const subWorld = new WorldBuilder(trainer).build(observe())[0];
		const subCopy = reconstructWorld(subWorld, SEED);
		try {
			assert.equal(subCopy.p1.active[0].volatiles.substitute.hp, battle.p1.active[0].volatiles.substitute.hp);
		} finally { subCopy.destroy(); }
	});
	it('counts multi-hit damage after the substitute breaks', () => {
		setup({ ...FOE, species: 'Cloyster', ability: 'Skill Link', nature: 'Adamant',
			evs: { hp: 252, atk: 252, spd: 4 }, moves: ['iciclespear', 'shellsmash'] });
		battle.makeChoices('move 1', 'move 2');
		const { mon, foe, memory } = state();
		const attack = estimateMove(trainer.format, foe, mon, 'iciclespear', '', memory, 'p2', 1);
		assert.equal(attack.substituteBroken, 1);
		assert(attack.substituteDamage > 0 && attack.damage > 0);
	});
	it('does not assume Substitute blocks Infiltrator', () => {
		setup({ ...FOE, species: 'Crobat', ability: 'Infiltrator', moves: ['bravebird', 'roost'] });
		battle.makeChoices('move 1', 'move 2');
		const { mon, foe, memory } = state();
		const attack = estimateMove(trainer.format, foe, mon, 'bravebird', '', memory, 'p2', 1);
		assert(attack.damage > 0);
		assert.equal(attack.substituteDamage, 0);
	});
	it('prices Blade exposure according to move order, including Trick Room', () => {
		setup({ ...FOE, species: 'Excadrill', ability: 'Mold Breaker', nature: 'Jolly',
			evs: { atk: 252, spe: 252, spd: 4 }, moves: ['earthquake'] });
		const excluded = [1, 2, 3, 4].map(slot => `move ${slot} terastallize`);
		const before = policy.decide(observe(), SEED, excluded);
		const world = new WorldBuilder(trainer).build(observe())[0];
		const normalCopy = reconstructWorld(world, SEED);
		const roomCopy = reconstructWorld(world, SEED);
		try {
			normalCopy.makeChoices('move 4', 'move 1');
			assert(normalCopy.p1.active[0].hp > 0);
			roomCopy.field.addPseudoWeather('trickroom', roomCopy.p1.active[0]);
			roomCopy.makeChoices('move 4', 'move 1');
			assert.equal(roomCopy.p1.pokemon[0].hp, 0);
		} finally { normalCopy.destroy(); roomCopy.destroy(); }
		battle.field.addPseudoWeather('trickroom', battle.p1.active[0]);
		const after = policy.decide(observe(), SEED, excluded);
		assert(after.candidates.find(entry => entry.choice === 'move 4').score <
			before.candidates.find(entry => entry.choice === 'move 4').score - 30, explain(after));
	});
	it('establishes Substitute against a passive status user before attacking', () => {
		setup({ ...FOE, species: 'Amoonguss', ability: 'Regenerator', moves: ['spore', 'gigadrain', 'sludgebomb', 'synthesis'] });
		const decision = choose();
		assert.equal(decision.choice, 'move 1', explain(decision));
		battle.makeChoices(decision.choice, 'move 1');
		assert.equal(battle.p1.active[0].status, '');
		assert(battle.p1.active[0].volatiles.substitute);
	});
	it('lands Toxic behind a substitute on a wall and uses shield to advance the poison clock', () => {
		setup(FOE, AEGISLASH, { ...WALL, moves: ['earthquake'] });
		battle.makeChoices('move 1', 'switch 2');
		const toxic = choose();
		assert.equal(toxic.choice, 'move 2', explain(toxic));
		battle.makeChoices(toxic.choice, 'move 1');
		assert.equal(battle.p2.active[0].status, 'tox');
		const shield = choose();
		assert.equal(shield.choice, 'move 3', explain(shield));
		battle.makeChoices(shield.choice, 'move 1');
		const following = choose();
		assert.notEqual(following.choice, 'move 3', explain(following));
		assert.notEqual(following.choice, 'move 2', explain(following));
	});
	it('does not sacrifice itself by using Substitute below its HP cost', () => {
		setup();
		battle.p1.active[0].hp = Math.floor(battle.p1.active[0].maxhp / 4);
		battle.add('-damage', battle.p1.active[0], battle.p1.active[0].getHealth);
		battle.makeRequest('move');
		const decision = choose();
		assert(!decision.choice.startsWith('move 1'), explain(decision));
	});
	it('returns to Shield forme under pressure instead of attacking with Blade defenses', () => {
		setup({ ...WALL, moves: ['earthquake'] });
		battle.makeChoices('move 4', 'switch 2');
		battle.makeChoices('move 2', 'switch 2');
		assert(battle.p1.active[0].species.id.includes('blade'));
		const decision = choose();
		assert.equal(decision.choice, 'move 3', explain(decision));
		battle.makeChoices(decision.choice, 'move 1');
		assert.equal(battle.p1.active[0].species.id, 'aegislash');
	});
	it('does not treat a shield as an answer to free setup', () => {
		setup({ ...FOE, species: 'Scizor', ability: 'Technician', moves: ['swordsdance', 'roost', 'bulletpunch', 'knockoff'] });
		const decision = choose();
		assert.notEqual(decision.choice, 'move 3', explain(decision));
	});
	for (const [species, ability, moves] of [
		['Clefable', 'Magic Guard', ['moonblast', 'softboiled']],
		['Breloom', 'Poison Heal', ['seedbomb', 'substitute']],
	]) {
		it(`does not build a poison-stalling plan against ${ability}`, () => {
			setup({ ...FOE, species, ability, moves });
			const decision = choose();
			assert(!decision.choice.startsWith('move 2'), explain(decision));
			assert(!decision.candidates.some(entry => entry.reasons.includes('toxic-pressure')), explain(decision));
		});
	}
	it('prefers a shield poison knockout even during Trick Room', () => {
		setup({ ...WALL, moves: ['earthquake'] });
		battle.p2.active[0].setStatus('tox', battle.p1.active[0]);
		battle.p2.active[0].hp = Math.floor(battle.p2.active[0].maxhp / 10);
		battle.p2.active[0].statusState.stage = 3;
		battle.add('-damage', battle.p2.active[0], battle.p2.active[0].getHealth);
		// Supply actual public poison ticks to the observer, rather than exposing the private counter.
		for (let count = 0; count < 3; count++) battle.add('-damage', battle.p2.active[0], battle.p2.active[0].getHealth, '[from] psn');
		battle.field.addPseudoWeather('trickroom', battle.p1.active[0]);
		battle.makeRequest('move');
		const decision = choose();
		assert.equal(decision.choice, 'move 3', explain(decision));
	});
	for (const [species, ability] of [['Excadrill', 'Mold Breaker'], ['Sableye-Mega', 'Magic Bounce']]) {
		it(`pressures ${species} with Shadow Ball instead of Toxic`, () => {
			setup({ ...FOE, species, ability, item: species === 'Sableye-Mega' ? 'Sablenite' : 'Leftovers',
				moves: [species === 'Sableye-Mega' ? 'recover' : 'protect'] });
			if (species === 'Sableye-Mega') battle.makeChoices('move 3', 'move 1 mega');
			const decision = choose();
			assert(decision.choice.startsWith('move 4'), explain(decision));
		});
	}
	it('keeps useful defensive options in a completed search and respects normal information', () => {
		setup({ ...FOE, species: 'Amoonguss', ability: 'Regenerator', moves: ['spore', 'gigadrain', 'sludgebomb', 'synthesis'] });
		const observation = observe();
		const before = structuredClone(observation);
		const decision = new RolloutPolicy(trainer).decide(observation, SEED, { maxRollouts: 36, budgetMs: 10000 });
		assert.equal(decision.method, 'rollout', explain(decision));
		assert.equal(decision.choice, 'move 1', explain(decision));
		assert.deepEqual(observation, before);
		const normal = chooseNormal();
		battle.p2.pokemon[1].item = 'choicespecs';
		battle.p2.pokemon[1].storedStats.spa = 999;
		assert.deepEqual(chooseNormal(), normal);
		function chooseNormal() { return policy.decide(observe('normal'), SEED); }
	});
});
