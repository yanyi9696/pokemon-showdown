'use strict';

const assert = require('assert').strict;
const { Battle, Dex, Teams, TeamValidator } = require('../../dist/sim');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { captureInitialTeam } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { RulePolicy, selectCandidates } = require('../../dist/server/fantasy-ai/policy');
const { readBattleMemory } = require('../../dist/server/fantasy-ai/memory');
const { HypothesisBuilder } = require('../../dist/server/fantasy-ai/hypotheses');
const { estimateMove } = require('../../dist/server/fantasy-ai/matchup');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { reconstructWorld } = require('../../dist/server/fantasy-ai/reconstruction');
const { simulateTurn, RolloutPolicy } = require('../../dist/server/fantasy-ai/rollout');
const { assessTrickRoom, trickRoomTurns, trickRoomPosition } = require('../../dist/server/fantasy-ai/trick-room');

const SEED = 'gen5,0011001200130014';
// The supplied Acerola team is a stable regression fixture, independent of editable trainer configuration.
const TEAM = [
	{
		species: 'Gengar-Fantasy', ability: 'Prankster', item: 'Heavy-Duty Boots', nature: 'Timid',
		evs: { spa: 252, spd: 4, spe: 252 }, ivs: { atk: 0 },
		moves: ['wasitihuan', 'bittermalice', 'encore', 'destinybond'],
	},
	{
		species: 'Cursola-Fantasy', ability: 'Persistent', item: 'fantasydefensegem', nature: 'Quiet', teraType: 'Fairy',
		evs: { hp: 252, spa: 4, spd: 252 }, ivs: { atk: 0 },
		moves: ['hex', 'willowisp', 'trickroom', 'strengthsap'],
	},
	{
		species: 'Golurk-Mega', ability: 'Iron Fist', item: 'golurkite', nature: 'Adamant',
		evs: { hp: 252, atk: 252, spd: 4 }, moves: ['poltergeist', 'closecombat', 'earthquake', 'knockoff'],
	},
	{
		species: 'Dusknoir-Fantasy', ability: 'shouhun', item: 'fantasyprotector', nature: 'Relaxed', teraType: 'Fairy',
		evs: { hp: 252, atk: 4, def: 252 }, moves: ['poltergeist', 'recover', 'trickroom', 'teleport'],
	},
	{
		species: 'Aegislash', ability: 'Stance Change', item: 'Leftovers', nature: 'Modest', ivs: { atk: 0 },
		evs: { hp: 252, spa: 56, spd: 156, spe: 44 }, moves: ['substitute', 'toxic', 'kingsshield', 'shadowball'],
	},
	{
		species: 'Marowak-Alola-Fantasy', ability: 'Rock Head', item: 'Thick Club', nature: 'Adamant',
		evs: { hp: 248, atk: 252, spd: 8 }, moves: ['shadowbone', 'flareblitz', 'shadowsneak', 'swordsdance'],
	},
];
const ENEMY = [
	['Mew', 'Synchronize'], ['Crobat', 'Inner Focus'], ['Raikou', 'Pressure'],
	['Entei', 'Pressure'], ['Starmie', 'Natural Cure'], ['Flygon', 'Levitate'],
].map(([species, ability]) => ({ species, ability, item: 'Leftovers', nature: 'Timid',
	evs: { hp: 252, spe: 252, spd: 4 }, moves: ['protect'] }));

describe('Fantasy AI Trick Room teams', function () {
	this.timeout(30000);
	const dex = Dex.forFormat('gen9fcuu');
	let battle;
	let trainer;
	let initialOpponent;
	afterEach(() => { if (battle) battle.destroy(); battle = null; });
	function setup(lead = 2, enemy = ENEMY) {
		const own = structuredClone(TEAM);
		const opponent = structuredClone(enemy);
		assert.equal(new TeamValidator('gen9fcuu').validateTeam(own), null);
		assert.equal(new TeamValidator('gen9fcuu').validateTeam(opponent), null);
		trainer = { format: 'gen9fcuu', style: 'balanced', packedTeam: Teams.pack(own),
			keyMembers: [3, 4, 6], resourcePreferences: ['mega', 'terastallize'] };
		battle = new Battle({ formatid: trainer.format, seed: SEED, p1: { team: own }, p2: { team: opponent } });
		initialOpponent = captureInitialTeam(battle, 'p2');
		const order = [lead, ...[1, 2, 3, 4, 5, 6].filter(slot => slot !== lead)].join('');
		battle.makeChoices(`team ${order}`, 'team 123456');
	}
	function observe(difficulty = 'hard') {
		const view = new InformationView({ ownSide: 'p1', difficulty, initialOpponent });
		view.receiveUpdate(battle.log.join('\n'));
		return view.observe(battle.p1.activeRequest);
	}
	function choose(difficulty = 'hard') { return new RulePolicy(trainer).decide(observe(difficulty), SEED); }
	const describe = result => JSON.stringify(result.candidates.map(({ choice, score, reasons }) => ({ choice, score, reasons })));

	for (const lead of [2, 4]) {
		it(`opens Trick Room with setter ${lead} when the breakers have a safe window`, () => {
			setup(lead);
			const decision = choose();
			assert(decision.choice.startsWith('move 3'), describe(decision));
			assert(decision.candidates.find(entry => entry.choice === decision.choice).reasons.includes('trick-room-setup'));
		});
		it(`restores setter ${lead}'s real remaining room duration without refreshing it`, () => {
			setup(lead);
			battle.makeChoices('move 3', 'move 1');
			const memory = readBattleMemory(observe().publicLog, dex);
			assert.equal(trickRoomTurns(memory), lead === 2 ? 6 : 4);
			const world = new WorldBuilder(trainer).build(observe())[0];
			const copy = reconstructWorld(world, SEED);
			try {
				assert.equal(copy.field.pseudoWeather.trickroom.duration, battle.field.pseudoWeather.trickroom.duration);
				copy.makeChoices('move 1', 'move 1');
				assert.equal(copy.field.pseudoWeather.trickroom.duration, trickRoomTurns(memory) - 1);
			} finally { copy.destroy(); }
		});
	}
	it('keeps a beneficial room instead of treating a second use as a refresh', () => {
		setup();
		battle.makeChoices('move 3', 'move 1');
		const decision = choose();
		assert(!decision.choice.startsWith('move 3'), describe(decision));
	});
	it('uses Teleport to bring a stronger breaker into an active room', () => {
		const enemy = structuredClone(ENEMY);
		enemy[0] = { ...enemy[0], species: 'Miltank', ability: 'Thick Fat' };
		setup(4, enemy);
		battle.makeChoices('move 3', 'move 1');
		const decision = choose();
		assert.equal(decision.choice, 'move 4', describe(decision));
		battle.makeChoices('move 4', 'move 1');
		const replacement = choose();
		const target = battle.p1.pokemon[Number(replacement.choice.split(' ')[1]) - 1];
		assert(['golurk', 'marowakalolafantasy'].includes(target.baseSpecies.id), describe(replacement));
	});
	it('switches to a safe setter when the active member cannot set room or pivot', () => {
		const enemy = structuredClone(ENEMY);
		enemy[0] = { ...enemy[0], species: 'Miltank', ability: 'Thick Fat' };
		setup(1, enemy);
		battle.p1.active[0].moveSlots[0].pp = 0;
		battle.makeRequest('move');
		const decision = choose();
		assert(decision.candidates.find(entry => entry.choice === decision.choice).reasons.includes('trick-room-setter-entry'),
			describe(decision));
	});
	it('attacks with Marowak instead of spending the window on Swords Dance or weak priority', () => {
		setup(6);
		battle.field.addPseudoWeather('trickroom', battle.p1.active[0]);
		const decision = choose();
		assert(/^move [12](?: |$)/.test(decision.choice), describe(decision));
	});
	it('reopens room after it expires while its slow attackers are still alive', () => {
		setup();
		battle.makeChoices('move 3', 'move 1');
		while (battle.field.pseudoWeather.trickroom) battle.makeChoices('move 4', 'move 1');
		assert.equal(trickRoomTurns(readBattleMemory(observe().publicLog, dex)), 0);
		const decision = choose();
		assert(decision.choice.startsWith('move 3'), describe(decision));
	});
	it('does not spend a lethal turn trying to set room', () => {
		const enemy = structuredClone(ENEMY);
		enemy[0].moves = ['shadowball'];
		setup(2, enemy);
		battle.p1.active[0].hp = 1;
		battle.add('-damage', battle.p1.active[0], battle.p1.active[0].getHealth);
		battle.makeRequest('move');
		const decision = choose();
		assert(!decision.choice.startsWith('move 3'), describe(decision));
	});
	it('sets room through a survivable attack instead of requiring a passive opponent', () => {
		const enemy = structuredClone(ENEMY);
		enemy[0].moves = ['psychic'];
		setup(2, enemy);
		const decision = choose();
		assert(decision.choice.startsWith('move 3'), describe(decision));
		battle.makeChoices(decision.choice, 'move 1');
		assert(battle.p1.active[0].hp > 0 && battle.p1.active[0].hp < battle.p1.active[0].maxhp);
		assert.equal(battle.field.pseudoWeather.trickroom.duration, 6);
	});
	it('does not set a room that benefits a slower opposing team and can reverse one', () => {
		const enemy = [
			['Escavalier', 'Overcoat', 'Iron Head'], ['Torkoal', 'White Smoke', 'Lava Plume'],
			['Slowbro', 'Regenerator', 'Scald'], ['Reuniclus', 'Magic Guard', 'Psychic'],
			['Snorlax', 'Thick Fat', 'Body Slam'], ['Pincurchin', 'Lightning Rod', 'Discharge'],
		].map(([species, ability, move]) => ({ species, ability, item: 'Leftovers', nature: 'Relaxed',
			evs: { hp: 252, def: 252, spd: 4 }, ivs: { spe: 0 }, moves: [move] }));
		setup(2, enemy);
		const before = choose();
		assert(!before.choice.startsWith('move 3'), describe(before));
		battle.field.addPseudoWeather('trickroom', battle.p1.active[0]);
		const after = choose();
		assert(after.candidates.some(entry => entry.reasons.includes('trick-room-reverse')), describe(after));
	});
	it('recognizes actual room changes and does not reward a Taunt-blocked attempt', () => {
		setup();
		const observation = observe();
		const memory = readBattleMemory(observation.publicLog, dex);
		const builder = new HypothesisBuilder(trainer.format);
		const mon = builder.own(observation.request.side.pokemon[0]);
		const foe = builder.build(memory.sides.p2.active, observation, memory)[0];
		const probe = own => estimateMove(trainer.format, own, foe, 'trickroom', '', memory, 'p1', 1);
		assert.equal(probe(mon).trickRoom, 1);
		assert.equal(probe({ ...mon, volatiles: ['taunt'] }).trickRoom, 0);
		memory.pseudoWeather.push('trickroom');
		assert.equal(probe(mon).trickRoom, -1);
	});
	it('does not plan a setter entry through a disclosed Imprison', () => {
		const enemy = structuredClone(ENEMY);
		enemy[0].moves = ['imprison', 'trickroom', 'psychic'];
		setup(1, enemy);
		battle.makeChoices('move 2', 'move 1');
		assert(battle.p2.active[0].volatiles.imprison);
		const decision = choose();
		assert(!decision.candidates.some(entry => entry.reasons.includes('trick-room-setter-entry')), describe(decision));
		const world = new WorldBuilder(trainer).build(observe())[0];
		const copy = reconstructWorld(world, SEED);
		try {
			assert.equal(copy.p2.active[0].volatiles.imprison.source, copy.p2.active[0]);
		} finally { copy.destroy(); }
	});
	it('takes an immediate knockout instead of delaying it for room', () => {
		setup(4);
		battle.p2.active[0].hp = 1;
		battle.add('-damage', battle.p2.active[0], battle.p2.active[0].getHealth);
		battle.makeRequest('move');
		const decision = choose();
		assert(decision.choice.startsWith('move 1'), describe(decision));
	});
	it('preserves a threatened setter with recovery or a safe switch during room', () => {
		const enemy = structuredClone(ENEMY);
		enemy[0].moves = ['psychic'];
		setup(4, enemy);
		battle.field.addPseudoWeather('trickroom', battle.p1.active[0]);
		battle.p1.active[0].hp = Math.floor(battle.p1.active[0].maxhp * 0.1);
		battle.add('-damage', battle.p1.active[0], battle.p1.active[0].getHealth);
		battle.makeRequest('move');
		const decision = choose();
		assert(decision.choice.startsWith('move 2') || decision.choice.startsWith('switch '), describe(decision));
		assert(decision.candidates.some(entry => entry.choice === 'move 2' && entry.reasons.includes('urgent-recovery')));
		const setter = battle.p1.active[0];
		battle.makeChoices(decision.choice, 'move 1');
		assert(setter.hp > 0 && battle.p1.active[0].hp > 0);
	});
	it('does not Teleport away the final turn when its active attacker can make progress', () => {
		setup(4);
		battle.makeChoices('move 3', 'move 1');
		while (battle.field.pseudoWeather.trickroom.duration > 1) battle.makeChoices('move 2', 'move 1');
		const decision = choose();
		assert(decision.choice.startsWith('move 1'), describe(decision));
		assert(!decision.candidates.some(entry => entry.reasons.includes('trick-room-pivot')), describe(decision));
	});
	it('retains a useful room candidate when the short search narrows its beam', () => {
		const candidates = [
			{ choice: 'move 1', score: 90, reasons: ['attack'] },
			{ choice: 'move 2', score: 80, reasons: ['recovery'] },
			{ choice: 'switch 2', score: 70, reasons: ['switch-matchup'] },
			{ choice: 'move 3', score: 60, reasons: ['trick-room-setup'] },
		];
		assert(selectCandidates(candidates, 3).some(entry => entry.choice === 'move 3'));
	});
	it('values the setup in whole-turn search instead of discarding it for doing no damage', () => {
		setup();
		const world = new WorldBuilder(trainer).build(observe())[0];
		const continuation = view => new RulePolicy(trainer).decide(view, SEED, [], { quick: true }).choice;
		const room = simulateTurn(world, { p1: 'move 3', p2: 'move 1' }, SEED, continuation);
		const attack = simulateTurn(world, { p1: 'move 1', p2: 'move 1' }, SEED, continuation);
		assert(room.value > attack.value, JSON.stringify({ room: room.value, attack: attack.value }));
	});
	it('retains the room plan after a completed native search round', () => {
		const enemy = structuredClone(ENEMY);
		enemy[0] = { ...enemy[0], species: 'Miltank', ability: 'Thick Fat' };
		setup(2, enemy);
		const decision = new RolloutPolicy(trainer).decide(observe(), SEED, { budgetMs: 10000, maxRollouts: 36 });
		assert.equal(decision.method, 'rollout', JSON.stringify(decision.diagnostics));
		assert(decision.rounds > 0);
		assert(decision.choice.startsWith('move 3'), describe(decision));
		assert(decision.elapsedMs < 10000);
	});
	it('does not use hidden opponent changes in normal difficulty or mutate the observation', () => {
		setup();
		const observation = observe('normal');
		const before = structuredClone(observation);
		const policy = new RulePolicy(trainer);
		const decision = policy.decide(observation, SEED);
		battle.p2.pokemon[1].storedStats.spe = 1;
		battle.p2.pokemon[1].item = 'ironball';
		assert.deepEqual(policy.decide(observe('normal'), SEED), decision);
		assert.deepEqual(observation, before);
	});
	it('does not count fainted breakers or assume room beats higher-priority attacks', () => {
		setup();
		const observation = observe();
		const builder = new HypothesisBuilder(trainer.format);
		const profiles = observation.request.side.pokemon.map(mon => builder.own(mon));
		const own = profiles.map((profile, index) => ({ profile, active: index === 0, probability: 1 }));
		const fastFoe = { ...own[0], profile: { ...profiles[0], stats: { ...profiles[0].stats, spe: 500 }, moves: ['psychic'] } };
		const field = { weather: '', terrain: '', pseudoWeather: [] };
		assert(assessTrickRoom(own, [fastFoe], dex, field).value > 0);
		assert.equal(assessTrickRoom(own, [{ ...fastFoe, profile: { ...fastFoe.profile, moves: ['extremespeed'] } }], dex, field).value, 0);
		const fainted = own.map(member => ({ ...member, profile: { ...member.profile, health: { lower: 0, upper: 0 } } }));
		assert.equal(assessTrickRoom(fainted, [fastFoe], dex, field).value, 0);
		const slower = { ...fastFoe, speed: 1 };
		assert(assessTrickRoom(own, [slower], dex, field).value < 0);
		assert.equal(trickRoomPosition({ value: 1.5, benefits: [0] }, 0, 1), 0);
	});
});
