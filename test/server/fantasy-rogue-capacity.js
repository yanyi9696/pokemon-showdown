'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { performance } = require('perf_hooks');
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');
const { DecisionScheduler } = require('../../dist/server/fantasy-ai/scheduler');
const { TrainerRegistry } = require('../../dist/server/fantasy-ai/trainers');
const { createRogueAIManager, getRogueAIManager, DEFAULT_ROGUE_BATTLES } = require('../../dist/server/fantasy-rogue/battle-capacity');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { content, set, stats } = require('../fixtures/fantasy-rogue');
const definitions = require('../fixtures/fantasy-ai-trainers.json');
const trainer = new TrainerRegistry(definitions, { enabled: true, allowDevelopmentTrainers: true }).get(definitions[0].id);

describe('Fantasy Rogue dedicated battle capacity', function () {
	this.timeout(30000);
	let ordinary, campaign, store, manager, oldConfig, users;
	let serial = 0;
	async function until(check, label) {
		for (const start = Date.now(); !check();) {
			if (Date.now() - start > 20000) throw new Error(`Timeout: ${label}`);
			await delay(5);
		}
	}
	function human() {
		const index = ++serial;
		const user = makeUser(`Capacity Test ${index}`, `127.21.${Math.floor(index / 250)}.${index % 250 + 1}`);
		users.push(user); return user;
	}
	function command(user, action, extra = {}) {
		return manager.command(user.connections[0], {
			id: randomUUID(), revision: store.get(user.id).revision, action, ...extra,
		});
	}
	function prepare(user = human(), doubleBattle = false) {
		command(user, 'start', { starters: ['bulbasaur'] });
		command(user, 'select', { value: 'grass' });
		if (doubleBattle) store.change(user.id, saved => {
			saved.run.spirit = 'latios';
			saved.run.doubleBattle = true;
			saved.run.team.push(createRoguePokemon(set('Charmander', 'Blaze'), stats(0)));
		});
		return user;
	}
	const startBattle = user => Rooms.get(command(user, 'battle').run.roomid);
	const ordinaryBattle = user => ordinary.challenge(user.connections[0], trainer.id, 'normal', trainer.packedTeam);
	async function firstTurn(room, players) {
		await until(() => players.every(user => room.battle.playerTable[user.id]?.request.request), 'team preview');
		for (const user of players) {
			if (JSON.parse(room.battle.playerTable[user.id].request.request).teamPreview) room.battle.choose(user, 'default');
		}
		await until(() => room.battle.turn >= 1 && players.every(user => !room.battle.playerTable[user.id].request.isWait), 'move request');
		for (const user of players) room.battle.choose(user, 'default');
		await until(() => room.battle.turn >= 2 || room.battle.ended, 'native turn completion');
		assert.equal(room.battle.fantasyAI.metrics.illegalChoices, 0);
	}
	beforeEach(() => {
		oldConfig = { fantasyailocal: Config.fantasyailocal, bindaddress: Config.bindaddress, fantasyrogue: Config.fantasyrogue };
		// Loopback-only fixtures do not fill the shared lobby's 100-line announcement buffer.
		Object.assign(Config, { fantasyailocal: true, bindaddress: '127.0.0.1', fantasyrogue: { enabled: true, publicAccess: false } });
		users = []; store = new RogueStore(':memory:');
		ordinary = new AIChallengeManager(definitions, { enabled: true, allowDevelopmentTrainers: true, decisionMs: 0 });
		campaign = createRogueAIManager({ enabled: true }, { decisionMs: 0 });
		manager = new RogueManager(new RogueEngine(store, content(), () => 0), () => campaign);
	});
	afterEach(async () => {
		await campaign.dispose(); await ordinary.dispose();
		for (const user of users) { user.disconnectAll(); user.destroy(); }
		store.close(); Object.assign(Config, oldConfig);
	});
	it('wires the production Rogue manager to a separate server-owned pool with 128 slots and bounded workers', () => {
		assert.equal(new RogueManager(manager.engine).ai, getRogueAIManager);
		assert.notEqual(campaign.scheduler, ordinary.scheduler);
		assert.equal(campaign.settings.maxBattles, DEFAULT_ROGUE_BATTLES);
		assert.equal(DEFAULT_ROGUE_BATTLES, 128);
		assert(campaign.settings.workers >= 1 && campaign.settings.workers <= 2);
		assert.equal(campaign.settings.maxBattlesPerPlayer, 1);
	});
	it('does not inherit ordinary capacity, workers or the ordinary feature switch', async () => {
		const independent = createRogueAIManager({ enabled: true, maxBattles: 31, battleWorkers: 1 },
			{ enabled: false, maxBattles: 1, maxBattlesPerPlayer: 4, workers: 7, decisionMs: 1234 });
		try {
			assert.equal(independent.settings.enabled, true);
			assert.equal(independent.settings.maxBattles, 31);
			assert.equal(independent.settings.maxBattlesPerPlayer, 1);
			assert.equal(independent.settings.workers, 1);
			assert.equal(independent.settings.decisionMs, 1234, 'Existing search budgets remain unchanged');
			assert.deepEqual(independent.list(), []);
		} finally { await independent.dispose(); }
		const disabled = createRogueAIManager({ enabled: false }, { enabled: true });
		assert.equal(disabled.settings.enabled, false); await disabled.dispose();
		for (const maxBattles of [0, -1, 1.5, 1025, Infinity]) {
			assert.throws(() => createRogueAIManager({ enabled: true, maxBattles }), /limits/);
		}
		assert.throws(() => createRogueAIManager({ enabled: true, battleWorkers: 17 }), /limits/);
	});
	it('continues solo and doubles when both ordinary AI slots are full, including the same player', async () => {
		const first = human(), second = human();
		await ordinaryBattle(first); await ordinaryBattle(second);
		await assert.rejects(() => ordinaryBattle(human()), /名额已满/);
		const solo = startBattle(prepare(first)), doubles = startBattle(prepare(second, true));
		assert.equal(campaign.getStatus().active, 2); assert.equal(ordinary.getStatus().active, 2);
		assert.equal(ordinary.getPublicState(first).activeBattles.includes(solo.roomid), false);
		await firstTurn(solo, [first]); await firstTurn(doubles, [second]);
		assert.equal(doubles.battle.gameType, 'doubles');
	});
	it('keeps ordinary AI usable at the Rogue limit and releases room-creation failures without losing a save', async () => {
		const previous = campaign;
		campaign = createRogueAIManager({ enabled: true, maxBattles: 1 }, { decisionMs: 0 });
		await previous.dispose();
		const first = prepare(), second = prepare();
		const room = startBattle(first), before = store.get(second.id);
		assert.throws(() => startBattle(second), /肉鸽战斗名额暂满/);
		const after = store.get(second.id);
		assert.equal(after.run.phase, 'ready'); assert.equal(after.points, before.points);
		assert.equal(after.run.money, before.run.money); assert.deepEqual(after.run.bag, before.run.bag);
		assert.deepEqual(after.run.team, before.run.team);
		assert(await ordinaryBattle(second));
		room.destroy(); assert.equal(campaign.getStatus().active, 0);
		for (const [object, method] of [[Rooms.global, 'prepBattleRoom'], [Rooms, 'createBattle']]) {
			const original = object[method]; object[method] = () => { throw new Error('fixture-create-failure'); };
			try { assert.throws(() => startBattle(second), /fixture-create-failure/); } finally { object[method] = original; }
			assert.equal(campaign.getStatus().active, 0, 'failed creation releases its reservation');
			assert.equal(store.get(second.id).run.phase, 'ready');
		}
		assert(startBattle(second));
	});
	it('counts co-op as one room while guarding both participants when ordinary AI slots are full', async () => {
		const host = human(), guest = human();
		const busyPlayer = human();
		await ordinaryBattle(busyPlayer); await ordinaryBattle(human());
		assert.throws(() => manager.coop.command(busyPlayer, { action: 'invite', target: guest.id, difficulty: 0 }),
			/玩家正在對战中/, 'Existing co-op invitation restrictions remain intact');
		manager.coop.command(host, { action: 'invite', target: guest.id, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
		manager.coop.command(host, { action: 'preparebattle', visit: manager.coop.view(host).session.adventure.battleSelectionKey });
		const room = Rooms.get(store.coopSessionForUser(host.id).roomid);
		assert(room); assert.equal(campaign.getStatus().active, 1);
		const options = room.battle.options;
		assert.throws(() => campaign.createRogueBattle(guest, options.fantasyAI.trainer,
			options.fantasyAI.trainer.packedTeam, options.fantasyRogue), /已有/);
		assert.throws(() => campaign.createRogueBattle(human(), options.fantasyAI.trainer,
			options.fantasyAI.trainer.packedTeam, options.fantasyRogue,
			{ user: guest, team: options.fantasyAI.trainer.packedTeam }), /已有/);
		await firstTurn(room, [host, guest]);
	});
	it('executes a real boss worker search in the dedicated pool while ordinary slots are full', async () => {
		await ordinaryBattle(human()); await ordinaryBattle(human());
		const previous = campaign;
		campaign = createRogueAIManager({ enabled: true, battleWorkers: 1 }, { decisionMs: 5000 });
		await previous.dispose();
		const user = prepare(), results = [];
		store.change(user.id, saved => {
			saved.run.node.kind = 'boss';
			saved.run.node.encounters[0].catchable = false;
			saved.run.node.encounters[0].trainer = { id: 'capacityboss', name: 'Capacity Boss', avatar: 'brock', role: 'gym' };
			saved.run.node.encounters[0].team = [set('Magikarp', 'Swift Swim', 5, ['Splash', 'Tackle'])];
		});
		const submit = campaign.scheduler.submit.bind(campaign.scheduler);
		campaign.scheduler.submit = async input => {
			const result = await submit(input); results.push(result); return result;
		};
		const room = startBattle(user);
		await firstTurn(room, [user]);
		assert.equal(room.battle.fantasyAI.options.rogue.immediate, false);
		assert(results.some(result => result.status === 'completed'), JSON.stringify(results));
		assert.equal(campaign.scheduler.metrics.workerErrors, 0);
		assert.equal(ordinary.getStatus().active, 2);
	});
	it('does not expose capacity status to an unprivileged caller', () => {
		const { commands } = require('../../dist/server/chat-plugins/fantasy-rogue');
		assert.throws(() => commands.fantasyrogue.status.call({
			checkCan(permission) { assert.equal(permission, 'lock'); throw new Error('permission-denied'); },
			sendReplyBox() { assert.fail('Unprivileged callers must not receive capacity status'); },
		}), /permission-denied/);
	});
	for (const count of [17, 64, 128]) it(`runs ${count} native Rogue rooms beyond the old 16-instance ceiling without extra workers`, async function () {
		this.timeout(60000);
		const baseMemory = process.memoryUsage(), started = performance.now();
		const entries = [];
		for (let i = 0; i < count; i++) {
			const user = prepare(); entries.push({ user, room: startBattle(user) });
		}
		const createdMs = performance.now() - started;
		assert.equal(campaign.getStatus().active, count);
		assert(campaign.scheduler.getStatus().workers <= 2);
		await Promise.all(entries.map(({ room, user }) => firstTurn(room, [user])));
		for (const { room } of entries) assert.equal(room.battle.fantasyAI.metrics.workerErrors, 0);
		if (count === DEFAULT_ROGUE_BATTLES) {
			const next = prepare(); assert.throws(() => startBattle(next), /肉鸽战斗名额暂满/);
			entries[0].room.destroy(); assert(startBattle(next));
		}
		const memory = process.memoryUsage();
		console.log('ROGUE_CAPACITY_SAMPLE', JSON.stringify({ rooms: count, createdMs: Math.round(createdMs),
			firstTurnsMs: Math.round(performance.now() - started), rssMB: Math.round(memory.rss / 1048576),
			heapDeltaMB: Math.round((memory.heapUsed - baseMemory.heapUsed) / 1048576),
			worker: campaign.scheduler.getStatus(), errors: campaign.scheduler.metrics.workerErrors }));
	});
	it('can configure a larger registration ceiling without spawning one worker per room', async () => {
		const scheduler = new DecisionScheduler({ maxBattles: 1024, workers: 2 });
		try {
			for (let i = 0; i < 1024; i++) scheduler.register(`quota-${i}`, `instance-${i}`);
			assert.throws(() => scheduler.register('excess', 'excess'), /capacity/);
			assert.deepEqual(scheduler.getStatus(), { workers: 2, active: 0, queued: 0 });
			scheduler.unregister('quota-0', 'instance-0'); scheduler.register('replacement', 'new');
		} finally { await scheduler.dispose(); }
	});
});
