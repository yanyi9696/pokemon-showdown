'use strict';

const assert = require('assert').strict;
const { setTimeout: delay } = require('timers/promises');
const { Battle, extractChannelMessages } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { State } = require('../../dist/sim/state');
const { DecisionScheduler } = require('../../dist/server/fantasy-ai/scheduler');
const { decideDoubles } = require('../../dist/server/fantasy-ai/doubles-worker');
const { prepareMultiChoices } = require('../../dist/server/fantasy-ai/multi-policy');
const { RogueCoopController } = require('../../dist/server/fantasy-rogue/coop-controller');

const seed = 'gen5,0001000200030004';
const trainer = { id: 'worker-test', format: 'gen9fantasy', packedTeam: '', keyMembers: [], resourcePreferences: [] };
const mon = (species, moves, item = '') => ({ species, moves, item, level: 50, nature: 'Serious', ability: '' });
const publicLog = battle => extractChannelMessages(battle.log.join('\n'), [0])[0];

describe('Fantasy doubles bounded background decisions', function () {
	this.timeout(20000);
	let battle, scheduler;
	beforeEach(() => { scheduler = new DecisionScheduler({ workers: 1, decisionMs: 5000 }); });
	afterEach(async () => { await scheduler.dispose(); battle?.destroy(); });
	function create(multi = false) {
		const own = [mon('Garchomp', ['Earthquake', 'Dragon Claw', 'Protect']), mon('Gardevoir', ['Moonblast', 'Protect'])];
		const foes = [mon('Blastoise', ['Water Gun', 'Protect']), mon('Blastoise', ['Water Gun', 'Protect'])];
		battle = new Battle({
			format: new Format({ name: 'Detached background fixture', mod: 'gen9fantasy',
				gameType: multi ? 'multi' : 'doubles', ruleset: [] }),
			strictChoices: true, seed,
			p1: { team: multi ? foes.slice(0, 1) : foes }, p2: { team: multi ? own.slice(0, 1) : own },
			...(multi ? { p3: { team: foes.slice(1) }, p4: { team: own.slice(1) } } : {}),
		});
		for (const side of battle.sides) for (const active of side.activeRequest.active) delete active.canTerastallize;
		return { ownSide: 'p2', difficulty: 'normal', request: structuredClone(battle.p2.activeRequest),
			publicLog: publicLog(battle) };
	}
	function input(observation, extras = {}) {
		return { key: { roomId: 'background', instanceId: 'first', rqid: 1, revision: 1 }, trainer,
			observation, seed, doubles: { allowSwitch: false }, ...extras };
	}

	it('matches the existing scorer in a real worker while the main-thread timer stays responsive', async () => {
		const observation = create(), before = JSON.stringify(observation), state = State.serializeBattle(battle);
		const expected = decideDoubles(observation, trainer.format, [], { allowSwitch: false });
		scheduler.register('background', 'first');
		let ticks = 0;
		const interval = setInterval(() => ticks++, 5);
		try {
			const result = await scheduler.submit(input(observation));
			assert.equal(result.status, 'completed');
			assert.equal(result.decision.choice, expected.choice);
			assert.deepEqual(result.decision.candidates, expected.candidates);
			assert(result.decision.doubles.candidates > 0);
			assert(ticks > 0);
			assert.equal(JSON.stringify(observation), before);
			assert.deepEqual(State.serializeBattle(battle), state, 'no live battle or RNG mutation');
			assert(battle.p2.choose(result.decision.choice));
		} finally { clearInterval(interval); }
	});
	it('returns a completed baseline before native-turn scoring and preserves it on timeout', async () => {
		const observation = create();
		const expected = decideDoubles(observation, trainer.format, [], { allowSwitch: false });
		scheduler.register('background', 'first');
		const pending = scheduler.submit(input(observation, { doubles: { allowSwitch: false, jointTurns: true } }));
		const slot = scheduler.slots[0], job = slot.active;
		slot.worker.on('message', message => {
			if (message.type === 'progress' && message.token === job.token) scheduler.timeout(job);
		});
		const result = await pending;
		assert.equal(result.status, 'timeout');
		assert.equal(result.decision.choice, expected.choice);
		assert.deepEqual(result.decision.candidates, expected.candidates);
		assert.equal(result.decision.doubles.jointTurn, undefined);
		assert(result.decision.doubles.candidates > 0);
	});
	it('completes the same native-turn comparison off-thread when requested', async () => {
		const observation = create(), options = { allowSwitch: false, jointTurns: true };
		const expected = decideDoubles(observation, trainer.format, [], options);
		scheduler.register('background', 'first');
		const result = await scheduler.submit(input(observation, { doubles: options }));
		assert.equal(result.status, 'completed');
		assert.equal(result.decision.choice, expected.choice);
		assert.deepEqual(result.decision.candidates, expected.candidates);
		assert(result.decision.doubles.jointTurn?.hypotheses > 0);
		assert(battle.p2.choose(result.decision.choice));
	});
	it('keeps the joint choice intact in zero-budget fallback and filters rejected actions', async () => {
		const observation = create();
		scheduler.register('background', 'first');
		const first = await scheduler.submit(input(observation, { budgetMs: 0 }));
		assert.equal(first.status, 'timeout');
		assert(first.decision.choice.includes(','));
		assert(battle.p2.choose(first.decision.choice)); battle.p2.clearChoice();
		const second = await scheduler.submit(input(observation, {
			key: { roomId: 'background', instanceId: 'first', rqid: 1, revision: 2 },
			excluded: [first.decision.choice], budgetMs: 0,
		}));
		assert.notEqual(second.decision.choice, first.decision.choice);
		assert(battle.p2.choose(second.decision.choice));
	});
	it('uses only enemy requests and the public log for Multi and maps the result to both native owners', async () => {
		create(true);
		const requests = { p2: structuredClone(battle.p2.activeRequest), p4: structuredClone(battle.p4.activeRequest) };
		const before = JSON.stringify(requests);
		const prepared = prepareMultiChoices(requests, publicLog(battle), { allowSwitch: false });
		scheduler.register('background', 'first');
		const result = await scheduler.submit(input(prepared.observation, {
			doubles: { allowSwitch: false, candidates: prepared.candidates },
		}));
		assert.equal(result.status, 'completed');
		const commands = prepared.commands.get(result.decision.choice);
		assert(commands);
		for (const seat of ['p2', 'p4']) assert(battle[seat].choose(commands[seat]));
		assert.equal(JSON.stringify(requests), before);
		assert.equal(prepared.observation.fullState, undefined);
		assert.equal(prepared.observation.opponentMove, undefined);
	});
	it('cancels a replaced revision and never accepts the old worker result', async () => {
		const observation = create();
		scheduler.register('background', 'first');
		const first = scheduler.submit(input(observation));
		const slot = scheduler.slots[0], worker = slot.worker, token = slot.active.token;
		const next = scheduler.submit(input(observation, {
			key: { roomId: 'background', instanceId: 'first', rqid: 2, revision: 2 },
		}));
		assert.equal((await first).status, 'cancelled');
		worker.emit('message', { token, type: 'complete', decision: { choice: 'switch 6, switch 6' } });
		const result = await next;
		assert.equal(result.status, 'completed');
		assert.equal(result.key.rqid, 2);
		assert(battle.p2.choose(result.decision.choice));
		assert.equal(scheduler.metrics.staleResults, 1);
	});
	it('falls back to a native joint action when the worker dies', async () => {
		const observation = create();
		scheduler.register('background', 'first');
		const pending = scheduler.submit(input(observation));
		await scheduler.slots[0].worker.terminate();
		const result = await pending;
		assert.equal(result.status, 'worker-error');
		assert(battle.p2.choose(result.decision.choice));
	});

	function asynchronousController(backgroundScheduler) {
		create(true);
		const jobs = [], writes = [];
		let cancels = 0;
		const room = { roomid: 'joint-room', ended: false, options: {
			fantasyRogue: { wild: false }, fantasyAI: { trainer, instanceId: 'room-instance', scheduler: backgroundScheduler || {
				cancel: () => cancels++,
				submit: request => new Promise(resolve => { jobs.push({ request, resolve }); }),
			} },
		}, stream: { write: chunk => { writes.push(chunk); } } };
		for (const seat of ['p2', 'p4']) room[seat] = { isAI: true,
			request: { rqid: 1, isWait: false, choice: '', request: JSON.stringify(battle[seat].activeRequest) } };
		for (const key of ['p1', 'p3']) Object.defineProperty(room, key, { get() { throw new Error('Human private data'); } });
		Object.defineProperty(room.stream, 'battle', { get() { throw new Error('Live simulator access'); } });
		const controller = new RogueCoopController(room);
		controller.update(battle.log.join('\n'));
		const request = (seat, rqid = 1) => {
			room[seat].request.rqid = rqid;
			controller.request(seat, structuredClone(battle[seat].activeRequest), rqid);
		};
		const complete = async index => {
			const job = jobs[index], data = job.request;
			job.resolve({ status: 'completed', decision: decideDoubles(data.observation, trainer.format, [], data.doubles) });
			await Promise.resolve();
		};
		return { jobs, writes, room, controller, request, complete, cancelled: () => cancels };
	}
	it('allows a real worker retry when the rejected seat has the lower native request ID', async () => {
		const { controller, request, writes, room } = asynchronousController(scheduler);
		scheduler.register('joint-room', 'room-instance');
		const untilWrites = async count => {
			const started = Date.now();
			while (writes.length < count) {
				assert(Date.now() - started < 8000, 'background retry did not finish');
				await delay(5);
			}
		};
		request('p2', 2); request('p4', 4);
		controller.flush(); await untilWrites(1);
		const original = room.p2.request.choice, partner = room.p4.request.choice;
		controller.invalidChoice('p2'); controller.flush(); await untilWrites(2);
		assert.notEqual(room.p2.request.choice, original);
		assert.equal(room.p4.request.choice, partner);
		assert(!writes[1].includes('>p4'));
		assert.equal(scheduler.metrics.completed, 2);
		controller.finish();
	});
	it('invalidates an in-flight batch but preserves the other pending enemy, then commits both only once', async () => {
		const context = asynchronousController();
		const { controller, request, jobs, writes, room, complete } = context;
		request('p2'); request('p4');
		controller.flush(); controller.flush();
		assert.equal(jobs.length, 1);
		assert.equal(writes.length, 0);
		request('p2', 2); controller.flush();
		assert.equal(jobs.length, 2);
		assert.equal(context.cancelled(), 1);
		await complete(0); assert.equal(writes.length, 0);
		await complete(1);
		assert.equal(writes.length, 1);
		assert.equal(writes[0].split('\n').length, 2);
		assert(room.p2.request.isWait && room.p4.request.isWait);
		controller.flush(); assert.equal(jobs.length, 2);
	});
	it('retries only an invalidated seat while preserving the accepted partner command', async () => {
		const { controller, request, jobs, writes, room, complete } = asynchronousController();
		request('p2'); request('p4');
		controller.flush(); await complete(0);
		const rejected = room.p2.request.choice, partner = room.p4.request.choice;
		controller.invalidChoice('p2'); controller.flush();
		assert.equal(jobs.length, 2);
		await complete(1);
		assert.notEqual(room.p2.request.choice, rejected);
		assert.equal(room.p4.request.choice, partner);
		assert(!writes[1].includes('>p4'));
		assert(battle.p2.choose(room.p2.request.choice));
	});
	it('discards a completed result after room destruction', async () => {
		const context = asynchronousController();
		context.request('p2'); context.request('p4'); context.controller.flush();
		context.controller.finish(); await context.complete(0);
		assert.equal(context.writes.length, 0);
		assert.equal(context.cancelled(), 1);
	});
});
