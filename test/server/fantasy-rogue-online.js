'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

async function until(check, name) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > 8000) throw new Error(`Timed out: ${name}`);
		await delay(5);
	}
}

describe('Fantasy Rogue real rooms', function () {
	this.timeout(20000);
	let ai, store, manager, user, oldLocal, oldReporting;
	let serial = 0;
	const rooms = [];
	const account = () => store.get(user.id);
	function command(action, details = {}) {
		return manager.command(user.connections[0], { id: randomUUID(), revision: account().revision, action, ...details });
	}
	beforeEach(() => {
		oldReporting = Config.reportbattles;
		oldLocal = Config.fantasyailocal; Config.fantasyailocal = true;
		store = new RogueStore(':memory:');
		ai = new AIChallengeManager([], { enabled: true, decisionMs: 0, maxBattles: 1 }, 6);
		manager = new RogueManager(new RogueEngine(store, content()), () => ai);
		user = makeUser(`Rogue UI ${++serial}`, `127.0.3.${serial}`);
	});
	for (const win of [true, false]) it(`plays a complete native AI preview and ${win ? 'accepts the win' : 'discards the loss'}`, async () => {
		command('start', {starters: ['bulbasaur']}); command('select', {value: 'grass'});
		store.change(user.id, saved => {
			const {normalizeBlessings} = require('../../dist/server/fantasy-rogue/blessings');
			const {grantCompanion} = require('../../dist/server/fantasy-rogue/companions');
			const {blessing} = require('../../dist/sim/rogue-blessing-data');
			const run = saved.run;
			normalizeBlessings(run).owned.push({...blessing('companionai'), floor: 1}); grantCompanion(run, 'sada');
			run.team = [createRoguePokemon(win ? set('Mew', 'Synchronize', 100, ['Psychic']) : set('Magikarp', 'Swift Swim', 1, ['Splash']), stats(0))];
			run.node.encounters[0].team = [win ? set('Magikarp', 'Swift Swim', 1, ['Splash']) : set('Mew', 'Synchronize', 100, ['Psychic'])];
		});
		const before = structuredClone(account().run);
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		assert(room.battle.roguePreview);
		await until(() => room.battle.ended && account().run.preview?.stage === 'result', 'autonomous preview completion');
		assert.equal(account().run.preview.result.won, win);
		assert.deepEqual(account().run.team, before.team); assert.deepEqual(account().run.bag, before.bag);
		assert.equal(account().run.encounter, before.encounter); assert(!account().run.emergencyRecovery);
		command('previewresult', {value: win ? 'accept' : 'personal'});
		if (win) assert.equal(account().run.encounter, before.encounter + 1);
		else {
			const retry = Rooms.get(command('battle').run.roomid); rooms.push(retry);
			assert(!retry.battle.roguePreview); assert.deepEqual(account().run.team, before.team);
		}
	});
	afterEach(async () => {
		await ai.dispose();
		for (const room of rooms.splice(0)) Rooms.get(room.roomid)?.destroy();
		user.disconnectAll(); user.destroy(); store.close();
		Config.fantasyailocal = oldLocal;
		Config.reportbattles = oldReporting;
	});
	it('delivers king succession through real room requests and resumes the native replacement choice', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			const { normalizeBlessings, syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
			const { blessing } = require('../../dist/sim/rogue-blessing-data');
			const run = saved.run;
			run.team = [set('Dragonite', 'Inner Focus', 50, ['Splash']), set('Dratini', 'Shed Skin', 50, ['Splash'])]
				.map(s => createRoguePokemon(s, stats(0)));
			normalizeBlessings(run).owned.push({ ...blessing('dragonking'), floor: 50 }); syncBlessingParty(run);
			run.blessings.dragonKing.ability = 'drizzle'; run.team[0].hp = 1;
			run.node.encounters[0].team = [set('Snorlax', 'Immunity', 50, ['Dragon Rage'])];
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'AI preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'first turn');
		room.battle.choose(user, `move 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).fantasyRogue?.dragonKing?.pending, 'succession prompt');
		const request = JSON.parse(room.battle.p1.request.request), turn = room.battle.turn;
		assert(request.forceSwitch[0]); assert.equal(room.battle.p1.request.isWait, false);
		assert.equal(request.fantasyRogue.dragonKing.member, account().run.team[1].id);
		room.battle.choose(user, `rogueking longzhihuxi ${request.fantasyRogue.dragonKing.token}|${request.rqid}`);
		await until(() => room.battle.p1.request.rqid > request.rqid, 'ability accepted without taking a turn');
		assert.equal(room.battle.turn, turn);
		assert.equal(JSON.parse(room.battle.p1.request.request).fantasyRogue.dragonKing.pending, false);
		room.battle.choose(user, `switch 2|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'replacement enters battle');
		assert.equal(account().run.blessings.dragonKing.member, account().run.team[0].id);
	});
	for (const avatar of ['unknown', 'unknownf', 'brock', 'acerola', 'steven']) {
		it(`sends the ${avatar} portrait through a real AI room player message`, async () => {
			command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
			store.change(user.id, saved => {
				const encounter = saved.run.node.encounters[0];
				encounter.team[0].gender = avatar === 'unknownf' ? 'F' : 'M';
				if (!avatar.startsWith('unknown')) encounter.trainer = {
					id: avatar, avatar, name: avatar, role: 'gym', tera: true,
				};
			});
			const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
			await until(() => room.log.log.some(line => line.startsWith('|player|p2|')), 'opponent player message');
			assert(room.log.log.some(line => line.startsWith('|player|p2|') && line.split('|')[4] === avatar));
			assert.equal(room.battle.fantasyAI.options.trainer.avatar, avatar);
			assert.equal(room.battle.fantasyAI.options.rogue.wild, avatar.startsWith('unknown'));
			room.destroy();
		});
	}
	it('escapes an authored event through its real room and preserves the unfinished branch', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, a => { a.run.node.event = { id: 'room', key: 'locked-event', stage: 'battle' }; });
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'event preview');
		assert.equal(manager.state(user).run.canRetreat, true);
		assert.equal(room.battle.options.fantasyRogue.canRetreat, true);
		const before = account().run;
		manager.retreat(user.connections[0], room.roomid);
		await until(() => room.battle.ended && account().run.phase === 'ready', 'event escape');
		assert.equal(account().run.node.event.stage, 'battle'); assert.equal(account().run.recovery, 'retreat');
		assert.equal(account().run.money, before.money); assert.deepEqual(account().run.node.encounters, before.node.encounters);
	});
	it('commits wild moves before human input without submitting a worker search', async () => {
		ai.scheduler.submit = () => { throw new Error('Wild opponents must not enter the search queue'); };
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'instant wild preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.p2.request.choice.startsWith('move '), 'wild already chose a move');
		assert.equal(room.battle.p1.request.isWait, false);
		assert.equal(room.battle.fantasyAI.metrics.workerErrors, 0);
		assert.equal(room.battle.fantasyAI.metrics.rollouts, 0);
		const turn = room.battle.turn;
		room.battle.choose(user, `move 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.turn > turn || room.battle.ended, 'turn proceeds without thinking');
	});
	it('commits ordinary trainer moves before human input without the NPC search delay', async () => {
		ai.scheduler.submit = () => { throw new Error('Tower NPC must not enter the search queue'); };
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			const encounter = saved.run.node.encounters[0];
			encounter.catchable = false;
			encounter.team = [set('Bulbasaur', 'Overgrow', 5, ['Tackle', 'Growl'])];
			saved.run.node.kind = 'trainer';
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'instant NPC preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.p2.request.choice.startsWith('move '), 'NPC already chose');
		assert.equal(room.battle.p1.request.isWait, false);
		assert.equal(room.battle.fantasyAI.options.rogue.wild, false);
		assert.equal(room.battle.fantasyAI.metrics.workerErrors, 0);
		assert.equal(room.battle.fantasyAI.metrics.rollouts, 0);
	});
	it('opens a one-versus-one real AI room, captures, saves, and continues with two party members', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		for (let encounter = 0; encounter < 2; encounter++) {
			const response = command('battle');
			const room = Rooms.get(response.run.roomid); rooms.push(room);
			assert.equal(ai.getStatus().active, 1);
			await until(() => room.battle.p2.request.isWait === true, 'AI team preview').catch(error => {
				throw new Error(`${error.message}: ${JSON.stringify({ request: room.battle.p2.request, metrics: room.battle.fantasyAI.metrics,
					pending: room.battle.fantasyAI.pending, submitted: room.battle.fantasyAI.submitted,
					isAI: room.battle.p2.isAI, scheduler: ai.scheduler.metrics, log: room.log.log.slice(-4) })}`);
			});
			assert.equal(room.battle.options.fantasyRogue.state.team.length, encounter + 1);
			room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
			await until(() => JSON.parse(room.battle.p1.request.request).active, 'human move request');
			const request = JSON.parse(room.battle.p1.request.request);
			assert.equal(request.fantasyRogue.balls[0].count, 10 - encounter);
			room.battle.choose(user, `rogueball pokeball|${request.rqid}`);
			await until(() => room.battle.ended, 'capture win');
			assert.equal(account().run.encounter, encounter + 1);
			assert.equal(account().run.team.length, encounter + 2);
			assert.equal(account().captures.magikarp, encounter + 1);
			assert.equal(account().points, 0);
			assert.equal(ai.getStatus().active, 0);
			assert.equal(room.battle.fantasyAI.metrics.workerErrors, 0);
		}
	});
	it('shares the existing AI quota, prevents duplicate battle creation, and recovers a destroyed room', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		const request = { id: randomUUID(), revision: account().revision, action: 'battle' };
		const first = manager.command(user.connections[0], request);
		const again = manager.command(user.connections[0], request);
		assert.equal(first.run.roomid, again.run.roomid);
		assert.equal(ai.getStatus().active, 1);
		const room = Rooms.get(first.run.roomid); rooms.push(room);
		assert.throws(() => ai.createRogueBattle(user, room.battle.fantasyAI.options.trainer,
			room.battle.fantasyAI.options.trainer.packedTeam, room.battle.options.fantasyRogue), /已有/);
		const hp = account().run.team[0].hp;
		room.destroy();
		assert.equal(account().run.phase, 'ready');
		assert.equal(account().run.team[0].hp, hp);
		assert.equal(account().points, 0);
	});
	it('retreats through the real room, saves turn damage and PP, returns the owner and resets only the foe', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			saved.run.encounter = 2;
			saved.run.node.encounters[2].team = [set('Magikarp', 'Swift Swim', 5, ['Tackle'])];
		});
		const returned = [];
		const testedUser = user;
		const sendTo = testedUser.sendTo;
		testedUser.sendTo = function (roomid, data) { returned.push([roomid, data]); return sendTo.call(this, roomid, data); };
		try {
			const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
			await until(() => room.battle.p2.request.isWait === true, 'AI preview');
			room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
			await until(() => JSON.parse(room.battle.p1.request.request).active, 'first move');
			const first = room.battle.p1.request.rqid;
			room.battle.choose(user, `move 2|${first}`);
			await until(() => room.battle.p1.request.rqid > first, 'completed turn');
			const current = JSON.parse(room.battle.p1.request.request);
			assert.equal(current.active[0].moves[1].pp, 39);
			const hp = Number(current.side.pokemon[0].condition.split('/')[0]);
			assert(hp < account().run.team[0].hp);
			assert.throws(() => manager.retreat(user.connections[0], 'battle-wrong-room'), /自己当前/);
			manager.retreat(user.connections[0], room.roomid); manager.retreat(user.connections[0], room.roomid);
			await until(() => room.battle.ended && account().run.phase === 'ready', 'retreat settlement');
			assert.equal(account().run.encounter, 2); assert.equal(account().run.recovery, 'retreat');
			assert.equal(account().run.team[0].hp, hp); assert.equal(account().run.team[0].pp[1].pp, 39);
			assert(returned.some(([id, data]) => id === room.roomid && data === '|fantasyrogueend|'));
			assert.equal(ai.getStatus().active, 0);
			const next = Rooms.get(command('battle').run.roomid); rooms.push(next);
			await until(() => next.battle.p2.request.isWait === true, 'replay preview');
			next.battle.choose(user, `team 1|${next.battle.p1.request.rqid}`);
			await until(() => JSON.parse(next.battle.p1.request.request).active, 'replay moves');
			const resumed = JSON.parse(next.battle.p1.request.request);
			assert.equal(Number(resumed.side.pokemon[0].condition.split('/')[0]), hp);
			assert.equal(resumed.active[0].moves[1].pp, 39);
			assert.equal(next.battle.options.fantasyRogue.state.encounterId, room.battle.options.fantasyRogue.state.encounterId);
			const foe = JSON.parse(next.battle.p2.request.request).side.pokemon[0].condition.split('/');
			assert.equal(foe[0], foe[1]);
		} finally { testedUser.sendTo = sendTo; }
	});
	it('automatically rescues a real wipe once and restores its notice without closing battle playback', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			saved.run.encounter = 2; saved.run.money = 5000;
			saved.run.team = [createRoguePokemon(set('Magikarp', 'Swift Swim', 1, ['Splash']), stats(0))];
			saved.run.node.encounters[2].team = [set('Bulbasaur', 'Overgrow', 30, ['Tackle'])];
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		const notifications = [];
		const originalSendTo = user.sendTo;
		user.sendTo = function (roomid, data) { notifications.push([roomid, data]); return originalSendTo.call(this, roomid, data); };
		await until(() => room.battle.p2.request.isWait === true, 'wipe preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'wipe move');
		room.battle.choose(user, `move 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.ended && account().run.phase === 'ready', 'wipe settlement');
		assert.equal(account().run.team[0].hp, account().run.team[0].maxhp); assert.equal(account().run.encounter, 2);
		assert(!notifications.some(([, data]) => data === '|fantasyrogueend|'));
		const notice = notifications.find(([id, data]) => id === room.roomid && data.startsWith('|fantasyroguedefeat|'));
		assert(notice);
		assert.deepEqual(JSON.parse(notice[1].slice(20)), { floor: 1, encounter: 3, encounters: 3,
			retryFloor: false, noHealing: false, emergencyCost: 1900, emergencyRecovery: {cost: 1900, paid: true} });
		assert(room.log.log.some(line => line.startsWith('|faint|')));
		assert(room.log.log.some(line => line.startsWith('|win|')));
		const restored = [];
		const connection = user.connections[0], originalConnectionSendTo = connection.sendTo;
		try {
			connection.sendTo = (id, data) => { restored.push([id, data]); };
			room.battle.onConnect(user, connection);
		} finally { connection.sendTo = originalConnectionSendTo; user.sendTo = originalSendTo; }
		assert(restored.some(([id, data]) => id === room.roomid && data === notice[1]));
		assert.equal(manager.state(user).run.canEmergency, false);
		assert.throws(() => command('emergency'), /全队濒死/);
		assert.equal(account().run.team[0].hp, account().run.team[0].maxhp);
		assert.equal(account().run.money, 3100); assert.equal(account().run.encounter, 2);
	});
	it('sends the rescue receipt after a lost shop challenge advances the campaign', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			saved.run.money = 5000;
			saved.run.team = [createRoguePokemon(set('Magikarp', 'Swift Swim', 1, ['Splash']), stats(0))];
			saved.run.node.shopChallenge = {rewards: {revive: 5}, closed: false};
			saved.run.node.encounters[0].team = [set('Bulbasaur', 'Overgrow', 30, ['Tackle'])];
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'shop defeat preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'shop defeat move');
		room.battle.choose(user, `move 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.ended && account().run.floor === 2, 'shop defeat settlement');
		const receipt = room.battle.options.fantasyRogue.defeat;
		assert(receipt?.shopClosed); assert.equal(receipt.noHealing, false);
		assert.deepEqual(receipt.emergencyRecovery, {cost: 1900, paid: true});
		assert.equal(account().run.money, 3100); assert.equal(account().run.bag.revive || 0, 0);
	});
	it('binds production saves to authenticated accounts and excludes enemy teams from state replies', () => {
		Config.fantasyailocal = false;
		user.registered = false;
		assert.equal(manager.state(user).account, null);
		assert(manager.state(user).message.includes('当前仅使用昵称'));
		assert.throws(() => command('start', { starters: ['bulbasaur'] }), /登录注册账号/);
		user.registered = true;
		assert(manager.state(user).account);
		user.registered = false;
		Config.fantasyailocal = true;
		user.named = false;
		assert.equal(manager.state(user).account, null);
		assert(manager.state(user).message.includes('固定测试昵称'));
		user.named = true;
		command('start', { starters: ['bulbasaur'] });
		const publicState = manager.state(user);
		assert(!JSON.stringify(publicState.run.choices).includes('Magikarp'));
		assert(!('checkpoint' in publicState.run));
		assert(!('caught' in publicState.run));
	});
	it('rejects the campaign format through the normal imported-team challenge path', async () => {
		let message = '';
		const ready = await Ladders('gen9fantasyrogue').prepBattle(user.connections[0], 'challenge', '', false,
			text => { message = text; });
		assert.equal(ready, null);
		assert(message.includes('专用入口'));
	});
	it('announces a new adventure once and suppresses only rogue battle reports', async () => {
		const existing = Rooms.get('lobby');
		const lobby = existing || Rooms.createChatRoom('lobby', 'Lobby');
		const startIndex = lobby.log.log.length;
		Config.reportbattles = ['lobby'];
		try {
			const request = { id: randomUUID(), revision: account().revision, action: 'start', starters: ['bulbasaur'] };
			manager.command(user.connections[0], request);
			manager.command(user.connections[0], request);
			manager.state(user);
			assert.equal(lobby.log.log.slice(startIndex).filter(line => line.includes('开启了幻想杯肉鸽之旅')).length, 1);
			command('select', { value: 'grass' });
			const state = command('battle');
			const room = Rooms.get(state.run.roomid); rooms.push(room);
			await until(() => room.battle.started, 'battle start');
			assert(!lobby.log.log.slice(startIndex).some(line => line.startsWith('|b|')));
			// The ordinary battle report path is unaffected.
			Rooms.global.onCreateBattleRoom([user], { roomid: 'battle-normal-report-test', battle: { options: {} } }, {});
			assert(lobby.log.log.slice(startIndex).some(line => line.startsWith('|b|battle-normal-report-test|')));
			assert.equal(manager.state(user).run.node.reward.points, 0);
			const mon = manager.state(user).run.team[0];
			assert(mon.baseStats.hp && mon.stats.hp && mon.moveMemory.length && mon.abilityPool.length);
		} finally {
			if (!existing) lobby.destroy();
		}
	});
});
