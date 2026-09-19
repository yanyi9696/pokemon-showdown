'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { content } = require('../fixtures/fantasy-rogue');

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
	afterEach(async () => {
		await ai.dispose();
		for (const room of rooms.splice(0)) Rooms.get(room.roomid)?.destroy();
		user.disconnectAll(); user.destroy(); store.close();
		Config.fantasyailocal = oldLocal;
		Config.reportbattles = oldReporting;
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
