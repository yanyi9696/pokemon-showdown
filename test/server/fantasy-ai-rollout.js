'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { PRNG } = require('../../dist/sim/prng');
const { State } = require('../../dist/sim/state');
const { Teams } = require('../../dist/sim/teams');
const { Dex } = require('../../dist/sim/dex');
const { TeamValidator } = require('../../dist/sim/team-validator');
const { TrainerRegistry, validatePlayerTeam } = require('../../dist/server/fantasy-ai/trainers');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { captureInitialTeam } = require('../../dist/server/fantasy-ai/initial-snapshot');
const { enumerateRequestChoices } = require('../../dist/server/fantasy-ai/actions');
const { HypotheticalSets, compatibleSpreads } = require('../../dist/server/fantasy-ai/sets');
const { readBattleMemory } = require('../../dist/server/fantasy-ai/memory');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { reconstructWorld } = require('../../dist/server/fantasy-ai/reconstruction');
const { simulateTurn, RolloutPolicy } = require('../../dist/server/fantasy-ai/rollout');
const { DecisionScheduler } = require('../../dist/server/fantasy-ai/scheduler');
const { runOfflineBattle } = require('../../dist/server/fantasy-ai/offline');
const examples = require('../../config/fantasy-ai-trainers.example.json');
const trainer = new TrainerRegistry(examples, { enabled: true, allowDevelopmentTrainers: true }).get(examples[0].id);
const SEED = 'gen5,0011001200130014';

function fixture(first, second, side = 'p1', difficulty = 'hard') {
	const teams = [Teams.unpack(trainer.packedTeam), Teams.unpack(trainer.packedTeam)];
	if (first) teams[0][0] = { ...teams[0][0], ...first };
	if (second) teams[1][0] = { ...teams[1][0], ...second };
	for (const team of teams) {
		assert.deepEqual(validatePlayerTeam(trainer.format, Teams.pack(team)).problems, []);
	}
	const battle = new Battle({ formatid: trainer.format, seed: SEED, p1: { team: teams[0] }, p2: { team: teams[1] } });
	const snapshot = captureInitialTeam(battle, side === 'p1' ? 'p2' : 'p1');
	battle.makeChoices();
	const ownTrainer = { ...trainer, packedTeam: Teams.pack(teams[side === 'p1' ? 0 : 1]) };
	return {
		battle, trainer: ownTrainer,
		observe() {
			const view = new InformationView({ ownSide: side, difficulty, initialOpponent: snapshot });
			view.receiveUpdate(battle.log.join('\n'));
			return view.observe(battle.getSide(side).activeRequest);
		},
	};
}

function comparable(decision) {
	const { elapsedMs, ...rest } = decision;
	return rest;
}

describe('Fantasy AI whole-team reconstruction', function () {
	this.timeout(20000);
	let game;
	const hypothetical = [];
	afterEach(() => {
		if (game) game.battle.destroy();
		game = null;
		for (const battle of hypothetical.splice(0)) battle.destroy();
	});

	for (const difficulty of ['normal', 'hard']) {
		for (const side of ['p1', 'p2']) {
			it(`${difficulty} ${side}: builds legal full teams solely from the allowed observation`, () => {
				game = fixture(null, null, side, difficulty);
				const observation = game.observe();
				const before = structuredClone(observation);
				const original = JSON.stringify(game.battle);
				const worlds = new WorldBuilder(game.trainer).build(observation);
				assert(worlds.length > 0 && worlds.length <= 4);
				assert(Math.abs(worlds.reduce((sum, world) => sum + world.probability, 0) - 1) < 1e-9);
				for (const world of worlds) {
					for (const members of Object.values(world.teams)) {
						assert.equal(members.length, 6);
						assert.equal(new TeamValidator(trainer.format).validateTeam(members.map(member => structuredClone(member.set))), null);
					}
					const copy = reconstructWorld(JSON.parse(JSON.stringify(world)), SEED);
					hypothetical.push(copy);
					assert.equal(copy.requestState, 'move');
					assert.deepEqual(copy.getSide(side).pokemon.map(mon => mon.baseStoredStats), game.battle.getSide(side).pokemon.map(mon => mon.baseStoredStats));
					assert.equal(copy.queue.list.length, 0);
					assert.equal(copy.getSide(side).active[0].hp, game.battle.getSide(side).active[0].hp);
				}
				assert.deepEqual(observation, before);
				assert.equal(JSON.stringify(game.battle), original);
			});
		}
	}

	it('infers spreads compatible with authorized exact stats without reading the actual nature', () => {
		game = fixture();
		const dex = Dex.forFormat(trainer.format);
		for (const snapshot of game.observe().initialOpponent) {
			const spreads = compatibleSpreads(dex, snapshot.species, snapshot.level, snapshot.stats);
			assert(spreads.length);
			for (const spread of spreads) {
				const calculated = game.battle.spreadModify(dex.species.get(snapshot.species).baseStats, { ...snapshot, ...spread });
				assert.deepEqual(calculated, snapshot.stats);
			}
		}
	});

	it('validates move-item combinations, not just independent learnset membership', () => {
		const format = 'gen9fcuber';
		const dex = Dex.forFormat(format);
		const species = dex.species.get('Gengar');
		const set = { species: 'Gengar', ability: 'Cursed Body', item: 'Gengarite', moves: ['Shadow Ball', 'Hypnosis'], level: 100, nature: 'Serious', evs: { hp: 252, spa: 252 }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } };
		game = fixture();
		const stats = game.battle.spreadModify(species.baseStats, { ...set, evs: { hp: 252, atk: 0, def: 0, spa: 252, spd: 0, spe: 0 } });
		const profile = { ...set, stats, moves: ['shadowball', 'hypnosis'], health: { lower: 1, upper: 1 }, status: '', boosts: {}, volatiles: [], teraType: 'Ghost' };
		const sets = new HypotheticalSets(format);
		assert.throws(() => sets.create(profile, true, 0), /legal-configuration/);
		const inferred = sets.create(profile, false, 0);
		assert.equal(new TeamValidator(format).validateSet(inferred, {}), null);
	});

	it('retains an Illusion alternative without importing an actual opponent team order', () => {
		game = fixture(null, { species: 'Zoroark', name: 'Zoroark', ability: 'Illusion', moves: ['Dark Pulse', 'Flamethrower'], nature: 'Timid' });
		const observation = game.observe();
		const worlds = new WorldBuilder(game.trainer).build(observation);
		assert(worlds.some(world => world.teams.p2[0].profile.species === 'Zoroark' && world.teams.p2[0].disguise));
		assert(worlds.some(world => world.teams.p2[0].profile.species !== 'Zoroark'));
		for (const world of worlds) hypothetical.push(reconstructWorld(world, SEED));
	});

	it('preserves own exhausted PP and binds move numbers to the current request', () => {
		game = fixture();
		for (const move of game.battle.p1.active[0].moveSlots) move.pp = 0;
		game.battle.makeRequest('move');
		const world = new WorldBuilder(game.trainer).build(game.observe())[0];
		const copy = reconstructWorld(world, SEED);
		hypothetical.push(copy);
		assert.equal(copy.p1.activeRequest.active[0].moves[0].id, 'struggle');
	});

	it('resets Choice lock and first-action counters on returning to the field', () => {
		game = fixture({ item: 'Choice Scarf', moves: ['Psychic', 'Fake Out'] }, { moves: ['Psychic'] });
		game.battle.makeChoices('move 1', 'move 1');
		game.battle.makeChoices('switch 2', 'move 1');
		game.battle.makeChoices('switch 2', 'move 1');
		const world = new WorldBuilder(game.trainer).build(game.observe())[0];
		const copy = reconstructWorld(world, SEED);
		hypothetical.push(copy);
		assert.equal(copy.p1.active[0].activeMoveActions, game.battle.p1.active[0].activeMoveActions);
		assert.equal(copy.p1.active[0].lastMove, null);
		assert(!copy.p1.active[0].volatiles.choicelock);
		assert(!copy.p1.activeRequest.active[0].moves[1].disabled);
		copy.makeChoices('move 2', 'move 1');
		assert(copy.log.includes('|cant|p2a: Mew|flinch'));
	});

	it('does not extend fixed Trick Room duration with a hypothetical weather extender', () => {
		game = fixture();
		const observation = game.observe();
		observation.publicLog.push('|-fieldstart|move: Trick Room', '|turn|5');
		for (const world of new WorldBuilder(game.trainer).build(observation)) {
			const copy = reconstructWorld(world, SEED);
			hypothetical.push(copy);
			assert.equal(copy.field.pseudoWeather.trickroom.duration, 1);
		}
	});

	it('moves public hazard layers with Court Change and retains public Rest status attribution', () => {
		game = fixture();
		const observation = game.observe();
		observation.publicLog.push(
			'|-sidestart|p1: Player|Spikes', '|-sidestart|p1: Player|Spikes',
			'|-sidestart|p2: Player|Reflect', '|-swapsideconditions',
			'|move|p1a: Mew|Rest|p1a: Mew', '|-status|p1a: Mew|slp|[from] move: Rest'
		);
		observation.request.side.pokemon[0].condition += ' slp';
		const world = new WorldBuilder(game.trainer).build(observation)[0];
		const copy = reconstructWorld(world, SEED);
		hypothetical.push(copy);
		assert.equal(copy.p2.sideConditions.spikes.layers, 2);
		assert(copy.p1.sideConditions.reflect);
		assert(!copy.p1.sideConditions.spikes);
		assert.equal(copy.p1.active[0].statusState.source, copy.p1.active[0]);
	});

	it('does not infer Struggle as an illegal fifth move or lose identity on a permanent forme switch', () => {
		const dex = Dex.forFormat(trainer.format);
		const memory = readBattleMemory([
			'|poke|p2|Charizard', '|switch|p2a: Charizard|Charizard|100/100',
			'|detailschange|p2a: Charizard|Charizard-Mega-X', '|move|p2a: Charizard|Flamethrower|p1a: Mew',
			'|move|p2a: Charizard|Struggle|p1a: Mew', '|switch|p2a: Charizard|Charizard-Mega-X|10/100',
		], dex);
		assert.deepEqual(memory.sides.p2.active.moves, ['flamethrower']);
		assert(!memory.sides.p2.active.ambiguousIdentity);
		assert.equal(memory.sides.p2.appearances[0].lastMove, 'struggle');
		assert.equal(memory.sides.p2.active.lastMove, undefined);
	});
});

describe('Fantasy AI full-turn search', function () {
	this.timeout(30000);
	let game;
	afterEach(() => { if (game) game.battle.destroy(); game = null; });

	it('resolves a pivot, entry hazards, the other action and residuals through the next regular request', () => {
		game = fixture({ moves: ['U-turn', 'Psychic'] }, { moves: ['Shadow Ball'], nature: 'Bold', evs: { hp: 252, def: 252, spd: 4 } });
		game.battle.p1.addSideCondition('spikes', game.battle.p2.active[0]);
		game.battle.field.setWeather('sandstorm', game.battle.p2.active[0]);
		const before = JSON.stringify(game.battle);
		const world = new WorldBuilder(game.trainer).build(game.observe())[0];
		const result = simulateTurn(world, { p1: 'move 1', p2: 'move 1' }, SEED, view => {
			assert(view.request.forceSwitch);
			return 'switch 2';
		});
		assert.equal(result.turn, world.turn + 1);
		assert(result.additionalChoices > 0);
		assert(result.log.some(line => line.startsWith('|switch|p1a: Garchomp')));
		assert(result.log.some(line => line.includes('[from] Spikes')));
		assert(result.log.some(line => line.startsWith('|-damage|p1a: Garchomp')));
		assert(result.log.some(line => line.includes('[from] Sandstorm') || line.includes('[from] sandstorm')));
		assert(result.log.includes('|upkeep'));
		assert.equal(JSON.stringify(game.battle), before);
	});

	it('fills a fainted slot instead of stopping at the knockout', () => {
		game = fixture({ moves: ['Psychic'] }, { moves: ['Psychic'], nature: 'Bold', evs: { hp: 252, def: 252, spd: 4 } });
		game.battle.p2.active[0].hp = 1;
		game.battle.add('-damage', game.battle.p2.active[0], game.battle.p2.active[0].getHealth);
		const world = new WorldBuilder(game.trainer).build(game.observe())[0];
		const result = simulateTurn(world, { p1: 'move 1', p2: 'move 1' }, SEED, () => 'default');
		assert(result.additionalChoices > 0);
		assert.equal(result.turn, world.turn + 1);
		assert(result.log.some(line => line.startsWith('|faint|p2')));
		assert(result.log.some(line => line.startsWith('|switch|p2')));
	});

	it('resolves Revival Blessing using the fainted own teammate\'s real maximum HP', () => {
		game = fixture({ species: 'Pawmot', name: 'Pawmot', ability: 'Natural Cure', moves: ['Revival Blessing'] }, { moves: ['Protect'] });
		const target = game.battle.p1.pokemon[1];
		const maxhp = target.maxhp;
		target.faint();
		game.battle.faintMessages();
		game.battle.makeRequest('move');
		const world = new WorldBuilder(game.trainer).build(game.observe())[0];
		const copy = reconstructWorld(world, SEED);
		try { assert.equal(copy.p1.pokemon[1].maxhp, maxhp); } finally { copy.destroy(); }
		const result = simulateTurn(world, { p1: 'move 1', p2: 'move 1' }, SEED, view => {
			assert(view.request.side.pokemon[0].reviving);
			return 'switch 2';
		});
		assert(result.additionalChoices > 0);
		assert.equal(result.turn, world.turn + 1);
		assert(result.log.some(line => line.includes('[from] move: Revival Blessing')));
		assert(!result.log.some(line => line.startsWith('|switch|p1')));
	});

	for (const special of [
		{ species: 'Mewtwo-Fantasy', name: 'Mewtwo', ability: Dex.forFormat(trainer.format).species.get('Mewtwo-Fantasy').abilities['0'], item: 'Mewtwonite X', moves: ['Psychic'], event: 'mega' },
		{ species: 'Marowak-Alola-Fantasy', name: 'Marowak', ability: 'Rock Head', item: 'Firium Z', moves: ['Flame Wheel'], event: 'ultra' },
	]) {
		it(`matches native ${special.event} form, HP and stats from the same compatible own set`, () => {
			game = fixture(special, { moves: ['Protect'] });
			const world = new WorldBuilder(game.trainer).build(game.observe())[0];
			const copy = reconstructWorld(world, SEED);
			try {
				game.battle.prng = new PRNG(SEED);
				game.battle.makeChoices(`move 1 ${special.event}`, 'move 1');
				copy.makeChoices(`move 1 ${special.event}`, 'move 1');
				assert.equal(copy.p1.active[0].species.id, game.battle.p1.active[0].species.id);
				assert.equal(copy.p1.active[0].maxhp, game.battle.p1.active[0].maxhp);
				assert.equal(copy.p1.active[0].hp, game.battle.p1.active[0].hp);
				assert.deepEqual(copy.p1.active[0].baseStoredStats, game.battle.p1.active[0].baseStoredStats);
				assert.equal(copy.p1.zMoveUsed, game.battle.p1.zMoveUsed);
			} finally { copy.destroy(); }
		});
	}

	it('preserves a constructed world across JSON restoration before running a full turn', () => {
		game = fixture({ moves: ['Psychic'] }, { moves: ['Psychic'] });
		const world = new WorldBuilder(game.trainer).build(game.observe())[0];
		const one = reconstructWorld(world, SEED);
		const two = Battle.fromJSON(JSON.stringify(one));
		try {
			two.restart(() => {});
			one.makeChoices('move 1', 'move 1');
			two.makeChoices('move 1', 'move 1');
			assert.deepEqual(State.normalize(one.toJSON()), State.normalize(two.toJSON()));
		} finally { one.destroy(); two.destroy(); }
	});

	for (const difficulty of ['normal', 'hard']) {
		it(`${difficulty}: reproduces bounded searches despite changes to real hidden state and pending choices`, () => {
			game = fixture(null, null, 'p1', difficulty);
			const policy = new RolloutPolicy(game.trainer);
			const observation = game.observe();
			const before = comparable(policy.decide(observation, SEED, { maxRollouts: 12 }));
			assert.equal(before.method, 'rollout');
			assert.equal(before.rollouts, 12);
			assert.equal(before.rounds, 2);
			game.battle.p2.choose('switch 2');
			game.battle.p2.active[0].hp--;
			game.battle.p2.active[0].moveSlots[0].pp--;
			game.battle.p2.active[0].item = 'choiceband';
			game.battle.prng.random();
			assert.deepEqual(comparable(policy.decide(game.observe(), SEED, { maxRollouts: 12 })), before);
		});
	}

	it('recognizes Protect plus a trapped opponent\'s residual knockout rather than attacking an immunity', () => {
		game = fixture({ species: 'Gothitelle', name: 'Gothitelle', ability: 'Shadow Tag', moves: ['Protect', 'Psychic'] }, { species: 'Umbreon', name: 'Umbreon', ability: 'Synchronize', moves: ['Foul Play'], nature: 'Bold' });
		game.battle.p2.active[0].hp = 1;
		game.battle.p2.active[0].setStatus('tox', game.battle.p1.active[0]);
		game.battle.add('-damage', game.battle.p2.active[0], game.battle.p2.active[0].getHealth);
		game.battle.p1.active[0].hp = 1;
		game.battle.add('-damage', game.battle.p1.active[0], game.battle.p1.active[0].getHealth);
		game.battle.makeRequest('move');
		const observation = game.observe();
		const excluded = enumerateRequestChoices(observation.request).filter(choice => !['move 1', 'move 2'].includes(choice));
		const decision = new RolloutPolicy(game.trainer).decide(observation, SEED, { maxRollouts: 16, excluded });
		assert.equal(decision.method, 'rollout', JSON.stringify(decision));
		assert.equal(decision.choice, 'move 1');
	});

	it('falls back explicitly for exhausted budgets and unsupported observed Transform state', () => {
		game = fixture();
		const policy = new RolloutPolicy(game.trainer);
		const observation = game.observe();
		const expired = policy.decide(observation, SEED, { budgetMs: 0 });
		assert.equal(expired.method, 'rules');
		assert.equal(expired.rollouts, 0);
		assert.equal(expired.stopReason, 'budget');
		observation.publicLog.push('|-transform|p2a: Mew|p1a: Mew');
		const unsupported = policy.decide(observation, SEED);
		assert.equal(unsupported.method, 'rules');
		assert(unsupported.diagnostics.includes('unsupported-transform'));
	});

	it('invests in safe offensive setup instead of endlessly trading attacks and limited recovery PP', () => {
		game = fixture({ species: 'Clefable', name: 'Calm Clefable', ability: 'Magic Guard', moves: ['Moonblast', 'Calm Mind', 'Soft-Boiled'] }, { species: 'Corviknight', name: 'Corviknight', ability: 'Pressure', moves: ['Brave Bird'], nature: 'Impish', evs: { hp: 252, def: 252, spd: 4 } });
		const observation = game.observe();
		const excluded = enumerateRequestChoices(observation.request).filter(choice => !['move 1', 'move 2', 'move 3'].includes(choice));
		const decision = new RolloutPolicy(game.trainer).decide(observation, SEED, { maxRollouts: 24, excluded });
		assert.equal(decision.method, 'rollout', JSON.stringify(decision));
		assert.equal(decision.choice, 'move 2', JSON.stringify(decision));
	});

	it('switches an exhausted attacker instead of preserving unusable offensive boosts', () => {
		game = fixture({ moves: ['Psychic', 'Calm Mind'] }, { moves: ['Psychic'] });
		game.battle.p1.active[0].moveSlots[0].pp = 0;
		game.battle.boost({ spa: 6, spd: 6 }, game.battle.p1.active[0]);
		game.battle.makeRequest('move');
		const observation = game.observe();
		const excluded = enumerateRequestChoices(observation.request).filter(choice => !['move 2', 'switch 6'].includes(choice));
		const decision = new RolloutPolicy(game.trainer).decide(observation, SEED, { maxRollouts: 12, excluded });
		assert.equal(decision.method, 'rollout', JSON.stringify(decision));
		assert.equal(decision.choice, 'switch 6', JSON.stringify(decision));
	});

	it('finishes a legal attacking-team match through the search-enabled offline driver', () => {
		const dex = Dex.forFormat(trainer.format);
		const team = Teams.unpack(trainer.packedTeam);
		for (const mon of team) mon.moves = mon.moves.filter(id => dex.moves.get(id).category !== 'Status');
		const offensive = { ...trainer, packedTeam: Teams.pack(team) };
		const result = runOfflineBattle({
			trainers: [offensive, offensive], difficulties: ['normal', 'hard'], battleSeed: SEED, decisionSeed: SEED,
			strategy: 'rollout', maxRollouts: 6, maxTurns: 150,
		});
		assert.equal(result.endReason, 'finished', JSON.stringify(result));
		assert(result.winner);
		assert(result.rollouts > 0);
		assert.equal(result.illegalChoices, 0);
		assert.equal(result.probeFailures, 0);
	});

	it('limits development traces to spectator-visible protocol', () => {
		const updates = [];
		runOfflineBattle({
			trainers: [trainer, trainer], difficulties: ['normal', 'hard'], battleSeed: SEED, decisionSeed: SEED,
			maxTurns: 1, onPublicUpdate: update => updates.push(update),
		});
		const trace = updates.join('\n');
		assert(trace.includes('|switch|'));
		assert(!trace.includes('|split|'));
		assert(!trace.includes('|request|'));
		assert(!trace.includes('initialOpponent'));
		assert(!trace.includes('/404'));
	});
});

describe('Fantasy AI decision worker scheduling', function () {
	this.timeout(20000);
	let game;
	let scheduler;
	beforeEach(() => { game = fixture(); scheduler = new DecisionScheduler(); });
	afterEach(async () => { await scheduler.dispose(); game.battle.destroy(); });
	function request(roomId, instanceId, rqid, extras = {}) {
		return { key: { roomId, instanceId, rqid }, trainer: game.trainer, observation: game.observe(), seed: SEED, maxRollouts: 6, ...extras };
	}

	it('runs native search off the main thread and returns the matching request identity', async () => {
		scheduler.register('test', 'first');
		let ticks = 0;
		const timer = setInterval(() => ticks++, 5);
		try {
			const result = await scheduler.submit(request('test', 'first', 1));
			assert.equal(result.status, 'completed', JSON.stringify(result));
			assert.deepEqual(result.key, { roomId: 'test', instanceId: 'first', rqid: 1 });
			assert.equal(result.decision.method, 'rollout');
			assert(ticks > 0);
			assert.equal(scheduler.metrics.completed, 1);
		} finally { clearInterval(timer); }
	});

	it('includes queued time in the deadline and preserves an already completed candidate on timeout', async () => {
		scheduler.register('first', 'a');
		scheduler.register('second', 'b');
		const first = scheduler.submit(request('first', 'a', 1, { budgetMs: 100, maxRollouts: 192 }));
		const active = scheduler.active;
		scheduler.worker.emit('message', { token: active.token, type: 'progress', decision: { ...active.best, choice: 'move 2', reasons: ['completed-rule-candidate'] } });
		const second = await scheduler.submit(request('second', 'b', 1, { budgetMs: 10 }));
		assert.equal(second.status, 'timeout');
		assert(second.queueMs >= 5 && second.totalMs < 1000);
		const result = await first;
		assert.equal(result.status, 'timeout');
		assert.equal(result.decision.choice, 'move 2');
		assert(result.totalMs < 1500);
	});

	it('cancels superseded requests and rejects results from an old battle instance', async () => {
		scheduler.register('test', 'old');
		const old = scheduler.submit(request('test', 'old', 1));
		const oldWorker = scheduler.worker;
		const oldToken = scheduler.active.token;
		scheduler.register('test', 'new');
		const stale = await scheduler.submit(request('test', 'old', 2));
		assert.equal(stale.status, 'cancelled');
		assert.equal(stale.decision, null);
		assert.equal((await old).status, 'cancelled');
		const pending = scheduler.submit(request('test', 'new', 1));
		oldWorker.emit('message', { type: 'complete', token: oldToken, decision: { choice: 'switch 6' } });
		const latest = await pending;
		assert.equal(latest.status, 'completed');
		assert.equal(latest.key.instanceId, 'new');
		assert.equal(scheduler.metrics.staleResults, 1);
		assert.equal((await scheduler.submit(request('test', 'new', 1))).status, 'cancelled');
	});

	it('returns a fallback on worker exit and restarts for the next queued request', async () => {
		scheduler.register('first', 'a');
		scheduler.register('second', 'b');
		const first = scheduler.submit(request('first', 'a', 1));
		const next = scheduler.submit(request('second', 'b', 1));
		await scheduler.worker.terminate();
		const failed = await first;
		assert.equal(failed.status, 'worker-error');
		assert(failed.decision.choice);
		assert.equal((await next).status, 'completed');
		assert.equal(scheduler.metrics.workerErrors, 1);
	});

	it('bounds registered instances and releases them without accepting old requests', async () => {
		scheduler.register('first', 'a');
		scheduler.register('second', 'b');
		assert.throws(() => scheduler.register('third', 'c'), /capacity/);
		scheduler.unregister('first', 'a');
		scheduler.register('third', 'c');
		assert.equal((await scheduler.submit(request('first', 'a', 1))).status, 'cancelled');
		const zero = await scheduler.submit(request('third', 'c', 1, { budgetMs: 0 }));
		assert.equal(zero.status, 'timeout');
		assert.equal(zero.decision.rollouts, 0);
	});
});
