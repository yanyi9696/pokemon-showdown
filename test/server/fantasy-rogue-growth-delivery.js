'use strict';

const assert = require('assert').strict;
const { setImmediate: nextTurn } = require('timers/promises');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { Monitor } = require('../../dist/server/monitor');
const { content, commandAfterOpening } = require('../fixtures/fantasy-rogue');
const { randomUUID } = require('crypto');

describe('Fantasy Rogue growth delivery failure recovery', () => {
	let store, engine, manager, originalGet, originalCrashlog, room, errors, unhandled;
	const userid = 'growthdeliveryqa';
	const onUnhandled = error => unhandled.push(error);
	beforeEach(() => {
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, content(), () => 0);
		manager = new RogueManager(engine, () => { throw new Error('No AI needed'); });
		for (const request of [{ action: 'start', starters: ['bulbasaur'] }, { action: 'select', value: 'grass' }, { action: 'battle' }]) {
			commandAfterOpening(engine, userid, { id: randomUUID(), revision: store.get(userid).revision, ...request });
		}
		store.change(userid, account => {
			account.run.battle.roomid = 'battle-growthdeliveryqa';
			account.run.battle.growthSequence = 1;
		});
		const token = store.get(userid).run.battle.token;
		room = { battle: { ended: false, stream: { write() {} } }, destroyed: 0,
			destroy() { this.destroyed++; engine.recover(userid, token); } };
		originalGet = Rooms.get;
		Rooms.get = function (id) { return id === 'battle-growthdeliveryqa' ? room : originalGet.call(this, id); };
		originalCrashlog = Monitor.crashlog; errors = []; unhandled = [];
		Monitor.crashlog = (error, phase) => errors.push({ error, phase });
		process.on('unhandledRejection', onUnhandled);
	});
	afterEach(() => {
		Rooms.get = originalGet; Monitor.crashlog = originalCrashlog;
		process.removeListener('unhandledRejection', onUnhandled);
		store.close();
	});
	for (const kind of ['synchronous', 'asynchronous']) it(`recovers an interrupted ${kind} acknowledgement without losing the party`, async () => {
		const before = store.get(userid).run;
		room.battle.stream.write = () => {
			if (kind === 'synchronous') throw new Error('injected transport failure');
			return Promise.reject(new Error('injected transport failure'));
		};
		assert.doesNotThrow(() => manager.resumeGrowth(userid));
		await nextTurn(); await nextTurn();
		assert.equal(unhandled.length, 0);
		assert.equal(errors.length, 1);
		assert.equal(room.destroyed, 1);
		const after = store.get(userid).run;
		assert.equal(after.phase, 'ready'); assert(!after.battle);
		assert.deepEqual(after.team, before.team); assert.deepEqual(after.bag, before.bag);
		assert.equal(after.money, before.money);
	});
	it('does not close a newer encounter when an old acknowledgement rejects late', async () => {
		let reject;
		room.battle.stream.write = () => new Promise((resolve, fail) => { reject = fail; });
		manager.resumeGrowth(userid);
		store.change(userid, account => { account.run.battle.token = 'new-battle-token'; });
		const before = store.get(userid);
		reject(new Error('late transport failure'));
		await nextTurn(); await nextTurn();
		assert.equal(unhandled.length, 0); assert.equal(errors.length, 1);
		assert.equal(room.destroyed, 0); assert.deepEqual(store.get(userid), before);
	});
	it('keeps the active encounter and growth revision when delivery succeeds', async () => {
		let packet;
		room.battle.stream.write = data => { packet = JSON.parse(data.slice('>rogueprogress '.length)); return Promise.resolve(); };
		manager.resumeGrowth(userid); await nextTurn();
		assert.equal(packet.sequence, 1); assert.equal(packet.revision, 1);
		assert.deepEqual(packet.team, store.get(userid).run.team);
		assert.equal(room.destroyed, 0); assert.equal(errors.length, 0);
	});
	it('records a recovery failure without starting another unhandled rejection', async () => {
		room.battle.stream.write = () => Promise.reject(new Error('injected transport failure'));
		room.destroy = () => { throw new Error('injected recovery failure'); };
		manager.resumeGrowth(userid); await nextTurn(); await nextTurn();
		assert.equal(unhandled.length, 0); assert.equal(errors.length, 2);
		assert.equal(errors[1].phase, 'Rogue battle growth recovery');
		assert(store.get(userid).run.battle, 'failed recovery must not erase the saved encounter');
	});
});
