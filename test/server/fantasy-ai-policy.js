'use strict';

const assert = require('assert').strict;
const common = require('../common');
const { Teams } = require('../../dist/sim/teams');
const { Dex } = require('../../dist/sim/dex');
const { RulePolicy } = require('../../dist/server/fantasy-ai/policy');
const { enumerateRequestChoices } = require('../../dist/server/fantasy-ai/actions');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { captureInitialTeam } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { readBattleMemory, parseHealth } = require('../../dist/server/fantasy-ai/memory');
const { HypothesisBuilder } = require('../../dist/server/fantasy-ai/hypotheses');
const { estimateMove } = require('../../dist/server/fantasy-ai/matchup');
const { TrainerRegistry } = require('../../dist/server/fantasy-ai/trainers');
const { runOfflineBattle } = require('../../dist/server/fantasy-ai/offline');
const examples = require('../../config/fantasy-ai-trainers.example.json');
const trainer = new TrainerRegistry(examples, { enabled: true, allowDevelopmentTrainers: true }).get(examples[0].id);
const dex = Dex.forFormat(trainer.format);
const SEED = 'gen5,0123012301230123';

describe('Fantasy AI public memory and hypotheses', () => {
	it('keeps public HP intervals, boosts, hazards, resources and equal-priority order', () => {
		const memory = readBattleMemory([
			'|poke|p1|Mew', '|poke|p2|Marowak-Alola-Fantasy',
			'|switch|p1a: Mew|Mew|100/100', '|switch|p2a: Marowak|Marowak-Alola-Fantasy|100/100',
			'|turn|1', '|move|p1a: Mew|Psychic|p2a: Marowak', '|-damage|p2a: Marowak|79/100',
			'|move|p2a: Marowak|Flame Wheel|p1a: Mew', '|-boost|p2a: Marowak|spe|2',
			'|-start|p2a: Marowak|Aura Burst Spe|[silent]', '|-sidestart|p1: Player|move: Stealth Rock',
		], dex);
		assert.deepEqual(memory.sides.p2.active.health, { lower: 0.78, upper: 0.79 });
		assert.equal(memory.sides.p2.active.boosts.spe, 2);
		assert.equal(memory.sides.p1.conditions.stealthrock, 1);
		assert(memory.sides.p2.resources.aura && memory.sides.p2.resources.zmove);
		assert.equal(memory.speedEvidence.length, 1);
		assert.deepEqual(parseHealth('40/100', true), { lower: 0.4, upper: 0.4 });
	});

	it('preserves revealed moves across unambiguous switches and resets temporary boosts', () => {
		const memory = readBattleMemory([
			'|poke|p2|Mew', '|poke|p2|Snorlax', '|switch|p2a: Mew|Mew|100/100',
			'|move|p2a: Mew|Thunderbolt|p1a: Target', '|-boost|p2a: Mew|spa|2',
			'|switch|p2a: Snorlax|Snorlax|100/100', '|switch|p2a: Mew|Mew|79/100',
		], dex);
		assert.deepEqual(memory.sides.p2.active.moves, ['thunderbolt']);
		assert.deepEqual(memory.sides.p2.active.boosts, {});
		assert.equal(memory.switches.length, 3);
	});

	it('attributes public item and ability activation to the named holder and excludes called moves', () => {
		const memory = readBattleMemory([
			'|poke|p1|Mew', '|poke|p2|Mew', '|switch|p1a: Mew|Mew|100/100', '|switch|p2a: Mew|Mew, L50|100/100',
			'|-heal|p2a: Mew|100/100|[from] item: Leftovers',
			'|-damage|p1a: Mew|90/100|[from] ability: Rough Skin|[of] p2a: Mew',
			'|move|p2a: Mew|Metronome|p2a: Mew', '|move|p2a: Mew|Surf|p1a: Mew|[from] move: Metronome',
			'|-formechange|p2a: Mew|Mewtwo',
		], dex);
		assert.equal(memory.sides.p2.active.item, 'leftovers');
		assert.equal(memory.sides.p2.active.ability, 'roughskin');
		assert.equal(memory.sides.p1.active.ability, undefined);
		assert.deepEqual(memory.sides.p2.active.moves, ['metronome']);
		assert.equal(memory.sides.p2.active.moveUses.surf, undefined);
		assert.equal(memory.sides.p2.active.level, 50);
	});

	it('keeps disguise appearances separate until the public replace event', () => {
		const log = [
			'|poke|p2|Zoroark', '|poke|p2|Mew', '|switch|p2a: Mew|Mew|100/100',
			'|move|p2a: Mew|Night Daze|p1a: Target', '|switch|p2a: Mew|Mew|100/100',
		];
		const memory = readBattleMemory(log, dex);
		assert.deepEqual(memory.sides.p2.active.moves, []);
		assert(memory.sides.p2.active.ambiguousIdentity);
		const hypotheses = new HypothesisBuilder(trainer.format).build(memory.sides.p2.active, { difficulty: 'normal' }, memory);
		assert(hypotheses.some(mon => mon.species === 'Zoroark' && mon.identity === 'illusion'));
		assert(hypotheses.some(mon => mon.species === 'Mew'));
		assert(Math.abs(hypotheses.reduce((total, mon) => total + mon.probability, 0) - 1) < 1e-9);
		const revealed = readBattleMemory([...log, '|replace|p2a: Zoroark|Zoroark|100/100'], dex);
		assert(!revealed.sides.p2.active.ambiguousIdentity);
		assert.equal(revealed.sides.p2.active.species, 'Zoroark');
	});

	it('uses local legal movepools for normal priors and overlays public item changes on hard snapshots', () => {
		const memory = readBattleMemory(['|poke|p2|Mew', '|switch|p2a: Mew|Mew|100/100', '|-enditem|p2a: Mew|Leftovers'], dex);
		const builder = new HypothesisBuilder(trainer.format);
		const normal = builder.build(memory.sides.p2.active, { difficulty: 'normal' }, memory);
		const pool = dex.species.getMovePool(dex.species.get('Mew').id, true);
		assert(normal.every(mon => mon.moves.length <= 4 && mon.moves.every(id => pool.has(id))));
		const initial = { species: 'Mew', level: 100, moves: ['psychic'], item: 'leftovers', ability: 'synchronize', teraType: 'Fire', stats: normal[0].stats };
		const hard = builder.build(memory.sides.p2.active, { difficulty: 'hard', initialOpponent: [initial] }, memory);
		assert.equal(hard[0].item, '');
		assert.deepEqual(hard[0].moves, ['psychic']);
		assert.equal(initial.item, 'leftovers');
	});
});

describe('Fantasy AI rule decisions', function () {
	this.timeout(20000);
	let battle;
	let view;
	let policy;

	afterEach(() => { if (battle) battle.destroy(); battle = null; });
	function setup(first, opponent, difficulty = 'hard', others) {
		const team = Teams.unpack(trainer.packedTeam);
		team[0] = first;
		if (others) for (const [index, mon] of others.entries()) team[index + 1] = mon;
		const enemy = Teams.unpack(trainer.packedTeam);
		enemy[0] = opponent;
		battle = common.createBattle({ formatid: trainer.format }, [team, enemy]);
		policy = new RulePolicy({ ...trainer, packedTeam: Teams.pack(team) });
		view = new InformationView({ ownSide: 'p1', difficulty, initialOpponent: captureInitialTeam(battle, 'p2') });
		battle.makeChoices();
	}
	function observe() {
		// A fresh view replay avoids duplicate delivery when tests edit the live fixture.
		const snapshot = view.observe(battle.p1.activeRequest).initialOpponent;
		view = new InformationView({ ownSide: 'p1', difficulty: snapshot ? 'hard' : 'normal', initialOpponent: snapshot });
		view.receiveUpdate(battle.log.join('\n'));
		return view.observe(battle.p1.activeRequest);
	}
	function choose() {
		const decision = policy.decide(observe(), SEED);
		assert.deepEqual(decision.diagnostics, [], JSON.stringify(decision));
		assert(battle.p1.choose(decision.choice), JSON.stringify(decision));
		battle.p1.clearChoice();
		return decision;
	}

	it('chooses reliable cleanup without spending an unnecessary Tera resource', () => {
		setup({ species: 'Mewtwo', ability: 'Pressure', moves: ['thunder', 'thunderbolt'] }, { species: 'Mew', ability: 'Synchronize', moves: ['splash'] });
		battle.p2.active[0].hp = 10;
		battle.add('-damage', battle.p2.active[0], battle.p2.active[0].getHealth);
		assert.equal(choose().choice, 'move 2');
	});

	it('avoids known type immunity and ability absorption using the native Fantasy engine', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['surf', 'thunderbolt'] }, { species: 'Vaporeon', ability: 'Water Absorb', moves: ['splash'] });
		assert(choose().choice.startsWith('move 2'));
	});

	it('recovers when injured against a harmless revealed opponent', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['recover', 'tackle'] }, { species: 'Mew', ability: 'Synchronize', moves: ['splash'] });
		battle.p1.active[0].hp = Math.floor(battle.p1.active[0].maxhp * 0.25);
		battle.makeRequest('move');
		assert.equal(choose().choice, 'move 1');
	});

	it('boosts on a safe turn but does not repeatedly boost a capped stat', () => {
		setup({ species: 'Scizor', ability: 'Technician', moves: ['swordsdance', 'bulletpunch'] }, { species: 'Steelix', ability: 'Sturdy', moves: ['splash'] });
		assert.equal(choose().choice, 'move 1');
		battle.p1.active[0].boosts.atk = 6;
		battle.add('-setboost', battle.p1.active[0], 'atk', 6);
		assert(choose().choice.startsWith('move 2'));
	});

	it('switches out of a lethal matchup into an immune teammate', () => {
		setup({ species: 'Charizard', ability: 'Blaze', moves: ['ember'] }, { species: 'Kyogre', ability: 'Drizzle', moves: ['water spout'] }, 'hard', [
			{ species: 'Gastrodon', ability: 'Storm Drain', moves: ['earthpower'] },
		]);
		assert.equal(choose().choice, 'switch 2');
	});

	it('penalizes repeated switching to the same public identity', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['tackle'] }, { species: 'Mew', ability: 'Synchronize', moves: ['splash'] });
		const observation = observe();
		const excluded = enumerateRequestChoices(observation.request).filter(choice => !['move 1', 'switch 2'].includes(choice));
		const before = policy.decide(observation, SEED, excluded);
		const copy = structuredClone(observation);
		copy.publicLog.unshift('|switch|p1a: Garchomp|Garchomp|100/100', '|switch|p1a: Mew|Mew|100/100');
		const after = policy.decide(copy, SEED, excluded);
		const oldSwitch = before.candidates.find(candidate => candidate.choice === 'switch 2');
		const newSwitch = after.candidates.find(candidate => candidate.choice === 'switch 2');
		assert(oldSwitch && newSwitch);
		assert(newSwitch.score < oldSwitch.score);
		assert(after.choice.startsWith('move'));
	});

	for (const difficulty of ['normal', 'hard']) {
		it(`${difficulty}: reproduces decisions despite changes to hidden state, pending action and RNG`, () => {
			setup({ species: 'Mew', ability: 'Synchronize', moves: ['psychic', 'flamethrower'] }, { species: 'Mew', ability: 'Synchronize', moves: ['tackle'] }, difficulty);
			const observation = observe();
			const observationBefore = structuredClone(observation);
			const serialized = JSON.stringify(battle);
			const before = policy.decide(observation, SEED);
			assert.equal(JSON.stringify(battle), serialized);
			battle.p2.choose('switch 2');
			battle.p2.active[0].hp--;
			battle.p2.active[0].moveSlots[0].pp--;
			battle.p2.active[0].item = 'choiceband';
			battle.prng.random();
			assert.deepEqual(policy.decide(observe(), SEED), before);
			assert.deepEqual(observation, observationBefore);
		});
	}

	it('evaluates Aura Burst as an alternative and retains separate Z and Tera candidates', () => {
		setup({ species: 'Marowak-Alola-Fantasy', ability: 'Rock Head', item: 'Firium Z', moves: ['flamewheel'] }, { species: 'Mew', ability: 'Synchronize', moves: ['splash'] });
		const observation = observe();
		const builder = new HypothesisBuilder(trainer.format);
		const memory = readBattleMemory(observation.publicLog, dex);
		const own = builder.own(observation.request.side.pokemon[0]);
		const opponent = builder.build(memory.sides.p2.active, observation, memory)[0];
		const ordinary = estimateMove(trainer.format, own, opponent, 'flamewheel', '', memory, 'p1');
		const burst = estimateMove(trainer.format, own, opponent, 'flamewheel', 'ultra', memory, 'p1');
		assert(burst.speed > ordinary.speed);
		const decision = choose();
		assert(decision.candidates.every(candidate => candidate.choice.split(' ').length <= 3));
	});

	it('does not credit reflected hazards as a successful opposing field effect', () => {
		setup({ species: 'Mew', ability: 'Synchronize', moves: ['stealthrock', 'psychic'] }, { species: 'Espeon', ability: 'Magic Bounce', moves: ['splash'] });
		const observation = observe();
		const builder = new HypothesisBuilder(trainer.format);
		const memory = readBattleMemory(observation.publicLog, dex);
		const own = builder.own(observation.request.side.pokemon[0]);
		const opponent = builder.build(memory.sides.p2.active, observation, memory)[0];
		assert.equal(estimateMove(trainer.format, own, opponent, 'stealthrock', '', memory, 'p1').field, 0);
		assert(choose().choice !== 'move 1');
	});

	it('uses native weather and Z-move accuracy instead of the base move accuracy', () => {
		setup({ species: 'Mew', ability: 'Synchronize', item: 'Electrium Z', moves: ['thunder'] }, { species: 'Mew', ability: 'Synchronize', moves: ['splash'] });
		const observation = observe();
		const builder = new HypothesisBuilder(trainer.format);
		const memory = readBattleMemory(observation.publicLog, dex);
		const own = builder.own(observation.request.side.pokemon[0]);
		const opponent = builder.build(memory.sides.p2.active, observation, memory)[0];
		const probe = event => estimateMove(trainer.format, own, opponent, 'thunder', event, memory, 'p1');
		assert.equal(probe('').accuracy, 0.7);
		assert.equal(probe('zmove').accuracy, 1);
		memory.weather = 'raindance';
		assert.equal(probe('').accuracy, 1);
		memory.weather = 'sunnyday';
		assert.equal(probe('').accuracy, 0.5);
	});
});

describe('Fantasy AI offline driver', function () {
	this.timeout(60000);
	it('completes a six-on-six match with the same policies through isolated observations', () => {
		const team = Teams.unpack(trainer.packedTeam);
		for (const mon of team) mon.moves = mon.moves.filter(id => dex.moves.get(id).category !== 'Status');
		const offensive = { ...trainer, packedTeam: Teams.pack(team) };
		const result = runOfflineBattle({
			trainers: [offensive, offensive], difficulties: ['normal', 'hard'],
			battleSeed: 'gen5,0001000200030004', decisionSeed: SEED, maxTurns: 150,
		});
		assert.equal(result.endReason, 'finished', JSON.stringify(result));
		assert(result.winner);
		assert.equal(result.illegalChoices, 0);
		assert.equal(result.probeFailures, 0);
		assert(result.decisions > 12);
	});

	it('terminates explicitly at a test limit instead of reporting a completed win', () => {
		const result = runOfflineBattle({
			trainers: [trainer, trainer], difficulties: ['hard', 'normal'],
			battleSeed: 'gen5,0001000200030004', decisionSeed: SEED, maxTurns: 1,
		});
		assert.equal(result.endReason, 'turn-limit');
		assert.equal(result.turns, 1);
		assert.equal(result.winner, '');
	});
});
