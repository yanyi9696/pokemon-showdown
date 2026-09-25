'use strict';

const assert = require('assert').strict;
const { Battle, Dex, Teams } = require('../../dist/sim');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { captureInitialTeam } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { RulePolicy } = require('../../dist/server/fantasy-ai/policy');
const { RolloutPolicy } = require('../../dist/server/fantasy-ai/rollout');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { estimateEntry, estimateMove, canEscapeMatchup } = require('../../dist/server/fantasy-ai/matchup');
const { teamResourceValues } = require('../../dist/server/fantasy-ai/planning');
const { readBattleMemory, ownSeen } = require('../../dist/server/fantasy-ai/memory');
const { TrainerRegistry } = require('../../dist/server/fantasy-ai/trainers');
const definitions = require('../fixtures/fantasy-ai-trainers.json');
const base = new TrainerRegistry(definitions, { enabled: true, allowDevelopmentTrainers: true }).get(definitions[0].id);
const SEED = 'gen5,0011001200130014';

describe('Fantasy AI shared tactical reasoning', function () {
	this.timeout(30000);
	let battle, trainer, policy, initialOpponent;
	afterEach(() => { battle?.destroy(); battle = null; });
	function setup(first, foe, bench) {
		const teams = [Teams.unpack(base.packedTeam), Teams.unpack(base.packedTeam)];
		teams[0][0] = first;
		teams[1][0] = foe;
		if (bench) teams[0][1] = bench;
		trainer = { ...base, packedTeam: Teams.pack(teams[0]), keyMembers: [] };
		policy = new RulePolicy(trainer);
		battle = new Battle({ formatid: trainer.format, seed: SEED, p1: { team: teams[0] }, p2: { team: teams[1] } });
		initialOpponent = captureInitialTeam(battle, 'p2');
		battle.makeChoices('team 123456', 'team 123456');
	}
	function observe(difficulty = 'hard', selected) {
		const view = new InformationView(difficulty === 'hard' ? { ownSide: 'p1', difficulty, initialOpponent } : {
			ownSide: 'p1', difficulty, opponentMoves: initialOpponent.map(mon => ({ species: mon.species, moves: mon.moves })),
		});
		view.receiveUpdate(battle.log.join('\n'));
		return view.observe(battle.p1.activeRequest, selected);
	}
	function state(view = observe()) {
		const dex = Dex.forFormat(trainer.format);
		const memory = readBattleMemory(view.publicLog, dex);
		const own = view.request.side.pokemon.map(mon =>
			policy.hypotheses.own(mon, ownSeen(memory, 'p1', mon.ident, mon.active)));
		return { own, memory, foe: policy.hypotheses.build(memory.sides.p2.active, view, memory)[0] };
	}
	function probe(id, own, foe, memory, reply) {
		return estimateMove(trainer.format, own, foe, id, '', memory, 'p1', 2, reply);
	}
	function lastPair() {
		for (const side of battle.sides) for (const mon of side.pokemon.slice(1)) mon.faint();
		battle.faintMessages();
		battle.makeRequest('move');
	}

	it('simulates Intimidate on entry and respects an immune opposing ability', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
			{ species: 'Garchomp', ability: 'Rough Skin', moves: ['earthquake'] },
			{ species: 'Gyarados', ability: 'Intimidate', moves: ['waterfall'] });
		const { own, foe, memory } = state();
		const before = structuredClone({ own, foe, memory });
		const entry = estimateEntry(trainer.format, own[1], foe, memory, 'p1');
		assert.equal(entry.opponent.boosts.atk, -1);
		const blocked = estimateEntry(trainer.format, own[1], { ...foe, ability: 'clearbody' }, memory, 'p1');
		assert.equal(blocked.opponent.boosts.atk || 0, 0);
		assert.deepEqual({ own, foe, memory }, before);
		battle.makeChoices('switch 2', 'move 1');
		assert.equal(entry.opponent.boosts.atk, battle.p2.active[0].boosts.atk);
	});

	it('uses entry weather to recalculate native damage, including suppressed weather', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
			{ species: 'Charizard', ability: 'Blaze', moves: ['flamethrower'] },
			{ species: 'Pelipper', ability: 'Drizzle', moves: ['surf'] });
		const { own, foe, memory } = state();
		const entry = estimateEntry(trainer.format, own[1], foe, memory, 'p1');
		assert.equal(entry.memory.weather, 'raindance');
		const damage = (field, target = foe) => estimateMove(trainer.format, target, entry.entrant,
			'flamethrower', '', field, 'p2').damage;
		assert(damage(entry.memory) < damage(memory) * 0.6);
		assert(damage(entry.memory, { ...foe, ability: 'cloudnine' }) > damage(entry.memory) * 1.8);
		assert.equal(memory.weather, '');
	});

	it('applies Toxic Spikes and Sticky Web on entry and lets Boots prevent both', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
			{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
			{ species: 'Garchomp', ability: 'Rough Skin', moves: ['earthquake'] });
		const { own, foe, memory } = state();
		memory.sides.p1.conditions = { toxicspikes: 2, stickyweb: 1 };
		const entry = estimateEntry(trainer.format, own[1], foe, memory, 'p1');
		assert.equal(entry.entrant.status, 'tox');
		assert.equal(entry.entrant.boosts.spe, -1);
		const boots = estimateEntry(trainer.format, { ...own[1], item: 'heavydutyboots' }, foe, memory, 'p1');
		assert.equal(boots.entrant.status, '');
		assert.equal(boots.entrant.boosts.spe || 0, 0);
		const poison = estimateEntry(trainer.format, { ...own[1], species: 'Toxapex', ability: 'regenerator' }, foe, memory, 'p1');
		assert.equal(poison.memory.sides.p1.conditions.toxicspikes, undefined);
	});

	it('models an entry knockout without allowing the entrant to attack', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
			{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
			{ species: 'Charizard', ability: 'Blaze', moves: ['flamethrower'] });
		const { own, foe, memory } = state();
		memory.sides.p1.conditions.stealthrock = 1;
		const entry = estimateEntry(trainer.format, { ...own[1], health: { lower: 0.1, upper: 0.1 } }, foe, memory, 'p1');
		assert.equal(entry.entrant.health.upper, 0);
	});

	for (const difficulty of ['normal', 'hard']) {
		it(`${difficulty}: uses a lethal Sucker Punch against a predicted attacking opponent`, () => {
			setup({ species: 'Tyranitar', ability: 'Unnerve', nature: 'Adamant', evs: { atk: 252 },
				moves: ['suckerpunch', 'crunch'] },
			{ species: 'Alakazam', ability: 'Synchronize', nature: 'Timid', evs: { spa: 252, spe: 252 }, moves: ['focusblast'] });
			lastPair();
			const view = observe(difficulty, { move: 'focusblast', baseMove: 'focusblast' });
			const result = policy.decide(view, SEED);
			assert(result.choice === 'move 1' || result.choice.startsWith('move 1 '), JSON.stringify(result));
			assert(result.candidates[0].reasons.includes('conditional-attack-prediction'));
		});
	}

	it('does not use Sucker Punch against a disclosed status move or switch', () => {
		setup({ species: 'Tyranitar', ability: 'Unnerve', moves: ['suckerpunch', 'crunch'] },
			{ species: 'Alakazam', ability: 'Synchronize', moves: ['focusblast', 'recover'] });
		lastPair();
		const { own, foe, memory } = state();
		assert.equal(probe('suckerpunch', own[0], foe, memory, { id: 'recover' }).damage, 0);
		assert.equal(probe('suckerpunch', own[0], foe, memory, null).damage, 0);
		const result = policy.decide(observe('hard', { move: 'recover', baseMove: 'recover' }), SEED);
		assert.equal(result.choice, 'move 2', JSON.stringify(result));
	});

	it('keeps first-turn attacks usable only for their native first-action window', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['fakeout', 'psychic'] },
			{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] });
		let { own, foe, memory } = state();
		assert(probe('fakeout', own[0], foe, memory).damage > 0);
		battle.makeChoices('move 2', 'move 1');
		({ own, foe, memory } = state());
		assert.equal(probe('fakeout', own[0], foe, memory).damage, 0);
	});

	it('uses public Choice lock and releases it when Magic Room suppresses the item', () => {
		setup({ species: 'Mew', ability: 'Synchronize', item: 'Choice Scarf', moves: ['psychic', 'icebeam'] },
			{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] });
		battle.makeChoices('move 1', 'move 1');
		const { own, foe, memory } = state();
		assert.equal(probe('icebeam', own[0], foe, memory).damage, 0);
		const entry = estimateEntry(trainer.format, own[0], foe, memory, 'p1');
		assert(probe('icebeam', entry.entrant, entry.opponent, entry.memory).damage > 0,
			're-entering must clear the old Choice lock');
		memory.pseudoWeather.push('magicroom');
		assert(probe('icebeam', own[0], foe, memory).damage > 0);
	});

	it('respects publicly suppressed abilities in native move estimates', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['earthquake'] },
			{ species: 'Pecharunt-Fantasy', ability: 'Levitate', moves: ['recover'] });
		const { own, foe, memory } = state();
		assert.equal(probe('earthquake', own[0], foe, memory).damage, 0);
		assert(probe('earthquake', own[0], { ...foe, volatiles: ['gastroacid'] }, memory).damage > 0);
	});

	it('distinguishes damage rolls from guaranteed KOs and preserves Sturdy', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['psychic'] },
			{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] });
		const { own, foe, memory } = state();
		const full = probe('psychic', own[0], foe, memory);
		assert(full.damageRange.max > full.damageRange.min);
		const hp = full.damageRange.min * 0.7 + full.damageRange.max * 0.3;
		const roll = probe('psychic', own[0], { ...foe, health: { lower: hp, upper: hp } }, memory);
		assert(roll.knockout > 0.5 && roll.knockout < 1, JSON.stringify(roll));
		const guaranteed = probe('psychic', own[0], { ...foe, health: { lower: 0.01, upper: 0.01 } }, memory);
		assert.equal(guaranteed.knockout, 1);
		const powerful = { ...own[0], stats: { ...own[0].stats, spa: 5000 } };
		assert.equal(probe('psychic', powerful, { ...foe, ability: 'sturdy' }, memory).knockout, 0);
	});

	it('has identical tactical choices for identical permitted information in both tiers', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['psychic', 'icebeam', 'toxic'] },
			{ species: 'Garchomp', ability: 'Rough Skin', moves: ['earthquake', 'swordsdance'] });
		const normal = observe('normal');
		// Only change the label; no initial stats or current move was disclosed.
		assert.deepEqual(policy.decide(normal, SEED), policy.decide({ ...normal, difficulty: 'hard' }, SEED));
		assert.deepEqual(policy.decide(normal, SEED), policy.decide({ ...normal,
			initialOpponent, opponentMove: null }, SEED), 'private-looking fields cannot affect normal mode');
	});

	it('updates speed hypotheses from public move order without turning them into known stats', () => {
		setup({ species: 'Mew', ability: 'Synchronize', nature: 'Timid', evs: { spe: 184 }, moves: ['psychic'] },
			{ species: 'Mew', ability: 'Synchronize', nature: 'Timid', evs: { spe: 252 }, item: 'Leftovers',
				moves: ['psychic', 'recover'] });
		battle.add('-item', battle.p2.active[0], 'Leftovers');
		const fastMass = view => {
			const { memory } = state(view);
			const hypotheses = policy.hypotheses.build(memory.sides.p2.active, view, memory);
			assert(hypotheses.every(mon => mon.source === 'prior'));
			return hypotheses.filter(mon => mon.stats.spe > view.request.side.pokemon[0].stats.spe)
				.reduce((sum, mon) => sum + mon.probability, 0);
		};
		const before = fastMass(observe('normal'));
		battle.makeChoices('move 1', 'move 1');
		const after = fastMass(observe('normal'));
		assert(after > before + 0.2 && after < 1, JSON.stringify({ before, after }));
	});

	it('does not predict illegal trapping, and allows Ghosts and Shed Shell to escape', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['psychic'] },
			{ species: 'Gothitelle', ability: 'Shadow Tag', moves: ['psychic'] });
		const { own, foe, memory } = state();
		assert.equal(canEscapeMatchup(trainer.format, own[0], foe, memory, 'p1'), false);
		assert.equal(canEscapeMatchup(trainer.format, { ...own[0], item: 'shedshell' }, foe, memory, 'p1'), true);
		assert.equal(canEscapeMatchup(trainer.format, { ...own[0], species: 'Gengar', types: ['Ghost', 'Poison'] },
			foe, memory, 'p1'), true);
	});

	it('learns defensive bulk from damage without reading the hidden spread', () => {
		setup({ species: 'Mew', ability: 'Synchronize', evs: { spa: 252 }, nature: 'Modest', moves: ['flamethrower'] },
			{ species: 'Mew', ability: 'Synchronize', evs: { hp: 252, spd: 252 }, nature: 'Calm',
				item: 'Leftovers', moves: ['recover'] });
		battle.add('-item', battle.p2.active[0], 'Leftovers');
		const bulkMass = () => {
			const view = observe('normal');
			const { memory } = state(view);
			return policy.hypotheses.build(memory.sides.p2.active, view, memory)
				.filter(mon => mon.stats.spd > 250).reduce((sum, mon) => sum + mon.probability, 0);
		};
		const before = bulkMass();
		battle.makeChoices('move 1', 'move 1');
		const after = bulkMass();
		assert(after > before + 0.05 && after < 1, JSON.stringify({ before, after }));
	});

	it('preserves the only remaining answer to an Electric threat using native immunity', () => {
		setup({ species: 'Garchomp', ability: 'Rough Skin', moves: ['earthquake'], evs: { atk: 252 } },
			{ species: 'Regieleki', ability: 'Transistor', item: 'Choice Specs', moves: ['thunderbolt'],
				evs: { spa: 252, spe: 252 } },
			{ species: 'Gyarados', ability: 'Intimidate', moves: ['waterfall'] });
		const { own, foe, memory } = state();
		const values = teamResourceValues(own.slice(0, 2), [{ profile: foe, probability: 1, active: true }],
			Dex.forFormat(trainer.format), memory, 'p1', (user, target, id, event = '', side = 'p1') =>
				estimateMove(trainer.format, user, target, id, event, memory, side));
		assert(values[0] > values[1] + 20, JSON.stringify(values));
	});

	it('covers Psychic Terrain priority immunity and a native weather change', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['suckerpunch', 'raindance'] },
			{ species: 'Mew', ability: 'Synchronize', moves: ['psychic'] });
		const { own, foe, memory } = state();
		memory.terrain = 'psychicterrain';
		assert.equal(probe('suckerpunch', own[0], foe, memory, { id: 'psychic' }).damage, 0);
		const rain = probe('raindance', own[0], foe, memory);
		assert.equal(rain.fieldAfter.weather, 'raindance');
		assert.equal(memory.weather, '');
	});

	it('uses equal search work and decisions for equal information in both tiers', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['psychic', 'icebeam'] },
			{ species: 'Garchomp', ability: 'Rough Skin', moves: ['earthquake'] });
		const view = observe('normal');
		const decisions = ['normal', 'hard'].map(difficulty => {
			const { elapsedMs, ...decision } = new RolloutPolicy(trainer)
				.decide({ ...view, difficulty }, SEED, { maxRollouts: 12, budgetMs: null });
			return decision;
		});
		assert.deepEqual(decisions[0], decisions[1]);
		assert.equal(decisions[0].method, 'rollout');
	});

	it('keeps normal-mode search available after a revealed Mega switches to the bench', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
			{ species: 'Absol-Fantasy', ability: 'Justified', item: 'Absolite Z', moves: ['knockoff'],
				evs: { atk: 252, spe: 252 }, nature: 'Jolly' });
		battle.makeChoices('move 1', 'move 1 mega');
		battle.makeChoices('move 1', 'switch 2');
		const view = observe('normal');
		assert(new WorldBuilder(trainer).build(view).length > 0);
		const decision = new RolloutPolicy(trainer).decide(view, SEED, { maxRollouts: 12, budgetMs: null });
		assert.equal(decision.method, 'rollout', JSON.stringify(decision));
	});

	it('models consecutive Fantasy Yuan Neng Shi Fang damage and keeps search available', () => {
		setup({ species: 'Rotom-Fantasy', ability: 'Prankster', moves: ['yuannengshifang', 'destinybond'],
			nature: 'Timid', evs: { spa: 252, spe: 252 } },
		{ species: 'Mew', ability: 'Synchronize', moves: ['roost'], evs: { hp: 252, spd: 252 } });
		let { own, foe, memory } = state();
		const before = probe('yuannengshifang', own[0], foe, memory);
		battle.makeChoices('move 1', 'move 1');
		({ own, foe, memory } = state());
		assert(own[0].volatiles.includes('yuannengshifang'));
		const after = probe('yuannengshifang', own[0], foe, memory);
		assert(after.damageRange.max > before.damageRange.max * 1.4);
		assert(after.status > 0);
		const decision = new RolloutPolicy(trainer).decide(observe(), SEED, { maxRollouts: 12, budgetMs: null });
		assert.equal(decision.method, 'rollout', JSON.stringify(decision));
	});

	it('retains the public Shi Ying Li boost after a native immunity activation', () => {
		setup({ species: 'Absol-Fantasy', ability: 'Justified', item: 'Absolite Z', moves: ['shadowclaw', 'knockoff'],
			nature: 'Jolly', evs: { atk: 252, spe: 252 } },
		{ species: 'Mew', ability: 'Synchronize', moves: ['psychic'], evs: { hp: 252, def: 252 } });
		battle.makeChoices('move 1 mega', 'move 1');
		const { own, foe, memory } = state();
		assert(own[0].volatiles.includes('shiyingli'));
		const boosted = probe('shadowclaw', own[0], foe, memory);
		const ordinary = probe('shadowclaw', { ...own[0], volatiles: [] }, foe, memory);
		assert(boosted.damageRange.max > ordinary.damageRange.max * 1.4);
		const decision = new RolloutPolicy(trainer).decide(observe(), SEED, { maxRollouts: 12, budgetMs: null });
		assert.equal(decision.method, 'rollout', JSON.stringify(decision));
	});
});
