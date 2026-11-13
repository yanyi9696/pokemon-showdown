'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { sharedRewardRoll, withSharedRewardRolls } = require('../../dist/server/fantasy-rogue/shared-reward-rolls');
const { giveEquipment, toolbox, treasure } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue scoped shared reward rolls', () => {
	const run = (serial = 0) => ({ floor: 51, spirit: 'hoopagift', bag: {}, money: 0,
		blessings: { itemGifts: serial, pending: [] }, spiritConversions: {} });
	it('shares independent named rolls without sharing mutable reward objects or personal calls', () => {
		const rolls = new Map(), a = {}, b = {};
		withSharedRewardRolls(a, rolls, () => {
			const value = sharedRewardRoll(a, 'items', () => ({ items: ['lifeorb'] })); value.items.push('leftovers');
			assert.equal(sharedRewardRoll(a, 'weather', () => 7), 7);
			assert.equal(sharedRewardRoll(a, 'items', () => 3), 3);
		});
		withSharedRewardRolls(b, rolls, () => {
			assert.equal(sharedRewardRoll(b, 'weather', () => 0), 7);
			assert.deepEqual(sharedRewardRoll(b, 'items', () => ({})), { items: ['lifeorb'] });
			assert.equal(sharedRewardRoll(b, 'items', () => 9), 3);
		});
		assert.equal(sharedRewardRoll(a, 'weather', () => 0), 0); assert.deepEqual(a, {}); assert.deepEqual(b, {});
	});
	it('clears a throwing scope and restores its outer context without leaking into another grant', () => {
		const owner = {}, outer = new Map();
		withSharedRewardRolls(owner, outer, () => {
			assert.equal(sharedRewardRoll(owner, 'test', () => 1), 1);
			assert.throws(() => withSharedRewardRolls(owner, new Map(), () => {
				sharedRewardRoll(owner, 'test', () => 2); throw new Error('failed grant');
			}), /failed grant/);
			assert.equal(sharedRewardRoll(owner, 'test', () => 3), 3);
		});
		assert.equal(outer.get('test:0'), 1); assert.equal(outer.get('test:1'), 3);
		assert.equal(sharedRewardRoll(owner, 'test', () => 4), 4);
	});
	it('uses one Mew outcome for the same common equipment and saves each personal serial independently', () => {
		const a = run(3), b = run(91), rolls = new Map(), data = content();
		data.items.push({ id: 'lifeorb', kind: 'held', price: 3000, name: '生命宝珠' },
			{ id: 'leftovers', kind: 'held', price: 3000, name: '吃剩的东西' });
		a.spiritConversions.previous = 'leftovers'; b.spiritConversions.previous = 'lifeorb';
		withSharedRewardRolls(a, rolls, () => giveEquipment(a, data, () => 0, 'lifeorb'));
		withSharedRewardRolls(b, rolls, () => giveEquipment(b, data, max => max - 1, 'leftovers'));
		assert.deepEqual(a.bag, b.bag); assert.equal(a.spiritConversions['blessing-item:4'], b.spiritConversions['blessing-item:92']);
		assert.equal(a.spiritConversions.previous, 'leftovers'); assert.equal(b.spiritConversions.previous, 'lifeorb');
		assert(!a.bag.lifeorb); assert(!a.bag.leftovers);
		giveEquipment(b, data, max => max - 1, 'lifeorb'); assert.equal(b.bag.lifeorb, 1);
		assert.equal(b.spiritConversions['blessing-item:93'], 'lifeorb');
	});
	it('shares toolbox choices and complete treasure contents while retaining private IDs and balances', () => {
		const a = run(), b = run(40), rolls = new Map(), data = content(); b.money = 750; b.bag.potion = 9;
		withSharedRewardRolls(a, rolls, () => { toolbox(a, () => 0); treasure(a, data, () => 0); });
		withSharedRewardRolls(b, rolls, () => { toolbox(b, max => max - 1); treasure(b, data, max => max - 1); });
		assert.deepEqual(a.blessings.pending[0].options, b.blessings.pending[0].options);
		assert.notEqual(a.blessings.pending[0].id, b.blessings.pending[0].id);
		const delta = { ...b.bag }; delta.potion -= 9; if (!delta.potion) delete delta.potion;
		assert.deepEqual(a.bag, delta); assert.equal(b.money - 750, a.money);
	});
});

describe('Fantasy Rogue common blessing equipment rewards', () => {
	let previous, store, engine, manager, host, guest;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content(); data.blessings = true;
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); manager = new RogueManager(engine);
		host = makeUser('Common Gift Host', '127.99.6.1'); guest = makeUser('Common Gift Guest', '127.99.6.2');
		for (const user of [host, guest]) engine.command(user.id, { id: randomUUID(),
			revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'] });
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	const get = () => store.coopSessionForUser(host.id);
	function prepare(id, floor = 1) {
		const session = get(), revision = session.revision, def = blessing(id), a = session.adventure;
		const round = { floor, tier: def.tier, remaining: 1, topClearMindEligible: false, familiesSeen: [], idsSeen: [id],
			options: [{ id, tier: def.tier, refreshes: 1, chosen: false }] };
		a.floor = floor; a.spirit = 'hoopagift'; a.spiritVersion = 1;
		a.coopBlessingRound = structuredClone(round);
		for (const [i, owner] of [host.id, guest.id].entries()) {
			const m = a.members[owner]; m.blessings.round = structuredClone(round); m.blessings.itemGifts = i * 53;
			m.spiritConversions = { old: i ? 'lifeorb' : 'leftovers' }; m.bag = {}; m.money = 100 + i * 700;
		}
		session.revision++; store.updateCoopSession(session, revision);
	}
	for (const id of ['weakness', 'renewable', 'lifepower', 'pandorasilver', 'itemcontest', 'capturebonus']) {
		it(`persists a common ${id} reward across different personal inventories and gift counters`, () => {
			prepare(id, id === 'capturebonus' ? 51 : 1);
			const solo = [store.get(host.id).run, store.get(guest.id).run];
			manager.coop.command(host, { action: 'blessingchoice', slot: 0 });
			assert.deepEqual(get().adventure.members[host.id].bag, {});
			manager.coop.command(guest, { action: 'blessingchoice', slot: 0 });
			const saved = get(), a = saved.adventure.members[host.id], b = saved.adventure.members[guest.id];
			assert.deepEqual(a.bag, b.bag); assert.equal(a.money - 100, b.money - 800);
			assert.equal(a.blessings.itemGifts, b.blessings.itemGifts - 53);
			assert.equal(a.spiritConversions.old, 'leftovers'); assert.equal(b.spiritConversions.old, 'lifeorb');
			assert.deepEqual(a.blessings.pending.filter(r => r.kind === 'toolbox').map(r => r.options),
				b.blessings.pending.filter(r => r.kind === 'toolbox').map(r => r.options));
			if (id === 'itemcontest') assert.equal(a.blessings.pending.filter(r => r.kind === 'toolbox').length, 1);
			else assert(Object.keys(a.bag).length > 0);
			manager = new RogueManager(engine); manager.coop.command(host, { action: 'refresh' }); assert.deepEqual(get(), saved);
			assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], solo);
		});
	}
	it('rolls back both shared grants and personal conversion receipts when the common save fails', () => {
		prepare('lifepower'); manager.coop.command(host, { action: 'blessingchoice', slot: 0 });
		const before = get(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER common_gift_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'gift write failed'); END;");
		try {
			assert.throws(() => manager.coop.command(guest, { action: 'blessingchoice', slot: 0 }), /gift write failed/);
			assert.deepEqual(get(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		} finally { store.db.exec('DROP TRIGGER common_gift_fail'); }
		manager.coop.command(guest, { action: 'blessingchoice', slot: 0 });
		const a = get().adventure.members[host.id], b = get().adventure.members[guest.id];
		assert.deepEqual(a.bag, b.bag); assert.equal(Object.values(a.bag).reduce((sum, n) => sum + n, 0), 1);
	});
});
