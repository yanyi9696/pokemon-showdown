'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue real legacy invitations', function () {
	this.timeout(15000);
	let store, manager, users, oldLocal;
	const rooms = [];
	let serial = 0;
	function save(user, spirit) {
		store.change(user.id, account => {
			recordClear(account, { id: randomUUID(), owner: { id: user.id, name: user.name },
				team: [createRoguePokemon(set(), stats(2))], boosts: stats(2), bag: { potion: 12 }, money: 1500,
				floor: 200, contentVersion: 'test', spirit, encounter: 0 });
			account.cards.at(-1).public = true;
		});
		return store.get(user.id).cards.at(-1);
	}
	function edit(user, action, details) {
		return manager.command(user.connections[0], { id: randomUUID(), revision: store.get(user.id).revision, action, ...details });
	}
	beforeEach(() => {
		oldLocal = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1'; Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); manager = new RogueManager(new RogueEngine(store, content()));
		users = [0, 1, 2].map(() => makeUser(`Legacy Test ${++serial}`, `127.0.9.${serial}`));
	});
	afterEach(() => {
		for (const room of rooms.splice(0)) Rooms.get(room.roomid)?.destroy();
		for (const user of users) { user.disconnectAll(); user.destroy(); }
		store.close();
		Config.fantasyailocal = oldLocal.local; Config.bindaddress = oldLocal.bind; Config.fantasyrogue = oldLocal.rogue;
	});
	it('requires the invited player to accept, opens a two-human room once, and never writes battle results to cards', async () => {
		const [a, b, outsider] = users, ca = save(a), cb = save(b);
		const beforeA = store.get(a.id), beforeB = store.get(b.id);
		const invite = manager.duel(a, { action: 'challenge', card: ca.id, target: cb.id });
		assert.equal(manager.duels.list(b.id).length, 1);
		assert.equal(a.games.size, 0); assert.equal(b.games.size, 0);
		assert.deepEqual(manager.duel(a, { action: 'challenge', card: ca.id, target: cb.id }), invite);
		assert.throws(() => manager.duel(outsider, { action: 'accept', id: invite.invitation, card: cb.id }), /别人的/);
		const result = manager.duel(b, { action: 'accept', id: invite.invitation, card: cb.id });
		const room = Rooms.get(result.roomid); rooms.push(room);
		assert.equal(room.battle.p1.id, a.id); assert.equal(room.battle.p2.id, b.id);
		assert(!room.battle.fantasyAI); assert(!room.battle.rated);
		assert(!room.settings.isPrivate, 'explicit public access retains normal public duels');
		assert.deepEqual(manager.duel(b, { action: 'accept', id: invite.invitation, card: cb.id }), result);
		const start = Date.now();
		while (!room.battle.p1.request.request) {
			if (Date.now() - start > 6000) throw new Error('duel preview did not arrive');
			await delay(10);
		}
		assert(!JSON.parse(room.battle.p1.request.request).fantasyRogue);
		room.battle.forfeit(b);
		await delay(40);
		assert.deepEqual(store.get(a.id), beforeA); assert.deepEqual(store.get(b.id), beforeB);
	});
	it('keeps closed-beta duels out of battle listings and rejects uninvited direct spectators', async () => {
		const [a, b, outsider] = users, ca = save(a), cb = save(b);
		Config.fantasyailocal = false;
		Config.fantasyrogue = { enabled: true, publicAccess: false, betaAccounts: [a.id, b.id] };
		a.registered = b.registered = true;
		const invite = manager.duel(a, { action: 'challenge', card: ca.id, target: cb.id });
		const result = manager.duel(b, { action: 'accept', id: invite.invitation, card: cb.id });
		const room = Rooms.get(result.roomid); rooms.push(room);
		assert.equal(room.settings.isPrivate, 'hidden'); assert.equal(room.settings.modjoin, '%');
		assert(a.inRooms.has(room.roomid)); assert(b.inRooms.has(room.roomid));
		assert(!Rooms.global.getBattles('')[room.roomid]);
		assert.equal(await outsider.tryJoinRoom(room.roomid, outsider.connections[0]), false);
		assert(!outsider.inRooms.has(room.roomid));
	});
	it('checks both accounts before sending and again before accepting a beta invitation', () => {
		const [a, b] = users, ca = save(a), cb = save(b);
		Config.fantasyailocal = false;
		Config.fantasyrogue = { enabled: true, publicAccess: false, betaAccounts: [a.id] };
		a.registered = b.registered = true;
		assert.throws(() => manager.duel(a, { action: 'challenge', card: ca.id, target: cb.id }), /内测权限/);
		assert.equal(manager.duels.list(b.id).length, 0);
		Config.fantasyrogue.betaAccounts.push(b.id);
		const invite = manager.duel(a, { action: 'challenge', card: ca.id, target: cb.id });
		Config.fantasyrogue.betaAccounts = [b.id];
		assert.throws(() => manager.duel(b, { action: 'accept', id: invite.invitation, card: cb.id }), /内测权限/);
		assert.equal(a.games.size, 0); assert.equal(b.games.size, 0);
	});
	it('checks public status, ownership, spirit groups and blocked challenges before sending', () => {
		const [a, b] = users, ca = save(a), cb = save(b, 'kyogre');
		assert.throws(() => manager.duel(a, { action: 'challenge', card: cb.id, target: ca.id }), /不属于/);
		assert.throws(() => manager.duel(a, { action: 'challenge', card: ca.id, target: cb.id }), /相同塔灵/);
		const same = save(b);
		b.settings.blockChallenges = true;
		assert.throws(() => manager.duel(a, { action: 'challenge', card: ca.id, target: same.id }), /不接受/);
		b.settings.blockChallenges = false;
		edit(b, 'publishcard', { member: same.id, value: 'private' });
		assert.throws(() => manager.duel(a, { action: 'challenge', card: ca.id, target: same.id }), /未公开/);
	});
	it('rechecks deleted or unpublished cards on acceptance, and permits explicit cancellation', () => {
		const [a, b] = users, ca = save(a), cb = save(b);
		const invite = manager.duel(a, { action: 'challenge', card: ca.id, target: cb.id });
		edit(a, 'deletecard', { member: ca.id });
		assert.throws(() => manager.duel(b, { action: 'accept', id: invite.invitation }), /不存在/);
		manager.duel(a, { action: 'cancel', id: invite.invitation });
		assert.equal(manager.duels.list(b.id).length, 0);
	});
});
