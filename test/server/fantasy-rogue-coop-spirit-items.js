'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { prepareCoopSpiritNode } = require('../../dist/server/fantasy-rogue/coop-spirit-items');
const { giveEquipment } = require('../../dist/server/fantasy-rogue/blessings');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative Mew item receipts', () => {
	let previous, store, engine, manager, host, guest;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content();
		data.items.push({ id: 'leftovers', name: '吃剩的东西', kind: 'held', price: 100, shopFloor: 1 });
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); manager = new RogueManager(engine);
		host = makeUser('Item Spirit Host', '127.99.2.1'); guest = makeUser('Item Spirit Guest', '127.99.2.2');
		for (const user of [host, guest]) engine.command(user.id, { id: crypto.randomUUID(),
			revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'] });
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(session => {
			session.spirit = 'hoopagift';
			Object.assign(session.adventure, { spirit: 'hoopagift', spiritVersion: 1, floor: 9, phase: 'route-interaction',
				node: { id: 'center', name: '测试中心', kind: 'rest', encounters: [], reward: { money: 0, items: {} } } });
			for (const member of Object.values(session.adventure.members)) member.money = 50000;
		});
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store?.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	const get = () => store.coopSessionForUser(host.id);
	const member = user => get().adventure.members[user.id];
	function change(update) {
		const session = get(), revision = session.revision;
		update(session); session.revision++; store.updateCoopSession(session, revision);
	}
	function rolls(random, action) {
		const original = crypto.randomInt; crypto.randomInt = random;
		try { return action(); } finally { crypto.randomInt = original; }
	}
	function purchase(user, extra = {}) {
		const command = { action: 'buy', id: crypto.randomUUID(), value: 'leftovers', ...extra };
		manager.coop.command(user, command); return command;
	}
	function capture(full = false) {
		change(session => {
			const a = session.adventure;
			a.phase = 'battle'; a.battleToken = 'item-capture-token'; a.encounterId = 'item-capture-encounter';
			if (full) while (a.members[host.id].team.length < 6) {
				a.members[host.id].team.push(createRoguePokemon(set(), stats(0)));
			}
			session.battleSelections = Object.fromEntries([host, guest].map(user => [user.id, [a.members[user.id].team[0].id]]));
		});
		const session = get();
		const mon = createRoguePokemon({ ...set('Magikarp', 'Swift Swim', 20, ['Splash']), item: 'Leftovers' }, stats(0), 'caught-item');
		const result = { encounterId: session.adventure.encounterId,
			team: [member(host).team[0]], partnerTeam: [member(guest).team[0]],
			bag: member(host).bag, partnerBag: member(guest).bag, captureOwners: { [mon.id]: 'p1' } };
		return { session, mon, result };
	}
	it('converts purchased held items per unit, charges only their owner and replays no purchase after reconnect', () => {
		const other = member(guest), solo = store.get(host.id).run;
		let halves = 0;
		const command = rolls(max => max === 2 ? halves++ % 2 : 0, () => purchase(host, { count: 2 }));
		assert.equal(halves, 2); assert.equal(member(host).money, 49800);
		assert.equal(member(host).bag.leftovers, 1); assert.equal(member(host).bag.fantasypowerlens, 1);
		assert.equal(member(host).spiritConversions[`purchase:${command.id}:0`], 'fantasypowerlens');
		assert.equal(member(host).spiritConversions[`purchase:${command.id}:1`], 'leftovers');
		assert.deepEqual(member(guest), other); assert.deepEqual(store.get(host.id).run, solo);
		manager = new RogueManager(engine); const saved = get();
		rolls(() => { throw new Error('purchase rerolled'); }, () => manager.coop.command(host, command));
		assert.deepEqual(get(), saved);
		change(session => { session.adventure.members[host.id].purchaseReceipts = []; });
		const trimmed = get(); manager.coop.command(host, command); assert.deepEqual(get(), trimmed);
	});
	it('keeps delegated purchases and their conversion ledger on the payer, including revocation', () => {
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		rolls(() => 0, () => purchase(host, { owner: guest.id }));
		assert.equal(member(guest).money, 49900); assert.equal(member(guest).bag.fantasypowerlens, 1);
		assert.equal(member(host).money, 50000); assert(!member(host).spiritConversions);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		const saved = get(); assert.throws(() => purchase(host, { owner: guest.id })); assert.deepEqual(get(), saved);
	});
	it('does not roll for non-held items or for other spirits', () => {
		rolls(() => { throw new Error('excluded conversion'); }, () => purchase(host, { value: 'revive' }));
		assert.equal(member(host).bag.revive, 1); assert(!member(host).spiritConversions);
		change(session => { session.adventure.spirit = 'hooh'; });
		rolls(() => { throw new Error('wrong spirit'); }, () => purchase(host));
		assert.equal(member(host).bag.leftovers, 1); assert(!member(host).spiritConversions);
	});
	it('atomically rolls back conversion, payment, stock and account receipts on a failed write', () => {
		change(session => {
			session.adventure.node.kind = 'trade';
			session.adventure.node.trade = { kind: 'held', purchases: 0,
				stock: [{ ...engine.content.items.find(item => item.id === 'leftovers'), remaining: 3 }] };
		});
		const before = get(), account = store.get(host.id);
		const command = { action: 'buy', id: crypto.randomUUID(), value: 'leftovers' };
		store.db.exec("CREATE TEMP TRIGGER spirit_item_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'item write failed'); END;");
		try {
			assert.throws(() => rolls(() => 0, () => manager.coop.command(host, command)), /item write failed/);
			assert.deepEqual(get(), before); assert.deepEqual(store.get(host.id), account);
		} finally { store.db.exec('DROP TRIGGER spirit_item_fail'); }
		rolls(() => 0, () => manager.coop.command(host, command));
		assert.equal(member(host).bag.fantasypowerlens, 1); assert.equal(member(host).money, 49900);
		assert.equal(get().adventure.node.trade.stock[0].remaining, 2);
	});
	it('stores route conversion once in the shared adventure without borrowing personal purchase receipts', () => {
		const a = get().adventure, personal = { 'purchase:old:0': 'leftovers' };
		const run = { spirit: 'hoopagift', spiritVersion: 1, floor: 9, spiritConversions: personal };
		const node = { id: 'gift', kind: 'reward', encounters: [], reward: { money: 0, items: { leftovers: 2, revive: 1 } } };
		let calls = 0;
		prepareCoopSpiritNode(a, run, node, engine.content, () => { calls++; return 0; });
		assert.equal(calls, 4); assert.strictEqual(run.spiritConversions, personal);
		assert.deepEqual(personal, { 'purchase:old:0': 'leftovers' });
		assert.deepEqual(node.reward.items, { fantasypowerlens: 2, revive: 1 });
		const saved = JSON.parse(JSON.stringify(a)), freshNode = { ...node, spiritPrepared: false,
			reward: { money: 0, items: { leftovers: 2, revive: 1 } } };
		prepareCoopSpiritNode(saved, { ...run, spiritConversions: undefined }, freshNode, engine.content,
			() => { throw new Error('shared route rerolled'); });
		assert.deepEqual(freshNode.reward, node.reward);
	});
	it('preserves personal equipment receipts through blessing and event run projections', () => {
		const session = get(), a = session.adventure, owner = a.members[host.id];
		const run = manager.coop.blessingRun(a, host.id);
		giveEquipment(run, engine.content, () => 0, 'leftovers');
		manager.coop.saveBlessingRun(a, host.id, run);
		assert.equal(owner.bag.fantasypowerlens, 1);
		const ledger = structuredClone(owner.spiritConversions);
		a.node.event = { id: 'mushrooms', key: 'item-event', stage: 'choice' };
		owner.coopEvent = structuredClone(a.node.event);
		for (const project of ['previewBlessingRun', 'eventRun']) {
			const next = manager.coop[project](a, host.id);
			manager.coop.saveBlessingRun(a, host.id, next); assert.deepEqual(owner.spiritConversions, ledger);
		}
	});
	it('credits the same prepared route equipment to both players through their real area choices', () => {
		engine.content.floors[2] = [{ id: 'gift', name: '共同赠礼', kind: 'reward', encounters: [],
			reward: { money: 0, items: { leftovers: 2 } } }];
		rolls(() => 0, () => change(session => {
			session.adventure.floor = 2; session.adventure.phase = 'area-selection';
			manager.coop.prepareRouteChoices(session.adventure);
		}));
		const sharedLedger = structuredClone(get().adventure.spiritConversions);
		assert.equal(Object.keys(sharedLedger).length, 2);
		manager = new RogueManager(engine);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'gift' });
		for (const user of [host, guest]) {
			assert.equal(member(user).bag.fantasypowerlens, 2); assert(!member(user).bag.leftovers);
			assert(!member(user).spiritConversions);
		}
		assert.deepEqual(get().adventure.spiritConversions, sharedLedger);
		const saved = get();
		assert.throws(() => manager.coop.command(host, { action: 'selectarea', value: 'gift' }));
		assert.deepEqual(get(), saved);
	});
	it('rolls back a failed capture save together with its permanent unlock and conversion receipt', () => {
		const { session, mon, result } = capture(), before = get(), account = store.get(host.id);
		store.db.exec("CREATE TEMP TRIGGER spirit_capture_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'capture write failed'); END;");
		try {
			assert.throws(() => rolls(() => 0, () => manager.coop.recordCapture(
				session.id, session.adventure.battleToken, mon, result)), /capture write failed/);
			assert.deepEqual(get(), before); assert.deepEqual(store.get(host.id), account);
		} finally { store.db.exec('DROP TRIGGER spirit_capture_fail'); }
		rolls(() => 0, () => manager.coop.recordCapture(session.id, session.adventure.battleToken, mon, result));
		assert.equal(member(host).team.find(entry => entry.id === mon.id).set.item, 'fantasypowerlens');
		assert.equal(store.get(host.id).coopCaptureReceipts.length, 1);
	});
	function equipmentOutcome(escaped = false) {
		const { result } = capture();
		change(session => {
			const a = session.adventure;
			a.node = { id: 'equipment-battle', name: '道具来源测试', kind: 'wild',
				encounters: [{ name: '野怪', catchable: false, team: [set()] }], reward: { money: 0, items: {} } };
			// Simulate an already persisted growth/capture snapshot: before/after item names are identical now.
			for (const owner of [host.id, guest.id]) a.members[owner].team[0].set.item = 'leftovers';
		});
		result.team[0].set.item = 'leftovers'; result.partnerTeam[0].set.item = 'leftovers';
		result.won = !escaped; result.coopExit = escaped ? 'retreat' : undefined;
		result.itemSources = {
			[result.team[0].id]: { key: 'initial:p2:0:leftovers', item: 'leftovers', owned: false },
			[result.partnerTeam[0].id]: { key: 'initial:p1:1:leftovers', item: 'leftovers', owned: true },
		};
		return { session: get(), result };
	}
	for (const escaped of [false, true]) it(`converts retained foreign battle equipment on ${escaped ? 'retreat' : 'victory'} without rerolling allied transfers`, () => {
		const { session, result } = equipmentOutcome(escaped);
		rolls(() => 0, () => manager.coop.settleBattle(session.id, session.adventure.battleToken, result));
		assert.equal(member(host).team[0].set.item, 'fantasypowerlens'); assert.equal(member(guest).team[0].set.item, 'leftovers');
		assert.equal(Object.keys(member(host).spiritConversions).length, 1); assert(!member(guest).spiritConversions);
		const saved = get(); manager = new RogueManager(engine);
		rolls(() => { throw new Error('battle conversion rerolled'); }, () =>
			manager.coop.settleBattle(session.id, session.adventure.battleToken, result));
		assert.deepEqual(get(), saved);
	});
	it('does not convert an owned item handed to a wild Pokemon and caught again', () => {
		const { session, mon, result } = capture();
		result.itemSources = { [mon.id]: { key: 'initial:p1:0:leftovers', item: 'leftovers', owned: true } };
		rolls(() => { throw new Error('owned capture equipment rerolled'); }, () =>
			manager.coop.recordCapture(session.id, session.adventure.battleToken, mon, result));
		assert.equal(member(host).team.find(entry => entry.id === mon.id).set.item, 'Leftovers');
		assert(!member(host).spiritConversions);
	});
	it('rolls back battle equipment and conversion receipts together when settlement fails', () => {
		const { session, result } = equipmentOutcome(), before = get(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER spirit_items_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'equipment write failed'); END;");
		try {
			assert.throws(() => rolls(() => 0, () => manager.coop.settleBattle(session.id, session.adventure.battleToken, result)), /equipment write failed/);
			assert.deepEqual(get(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		} finally { store.db.exec('DROP TRIGGER spirit_items_fail'); }
		rolls(() => 0, () => manager.coop.settleBattle(session.id, session.adventure.battleToken, result));
		assert.equal(member(host).team[0].set.item, 'fantasypowerlens');
	});
	for (const full of [false, true]) it(`converts a captured held item once with a ${full ? 'full' : 'free'} party`, () => {
		const { session, mon, result } = capture(full), other = member(guest);
		rolls(() => 0, () => manager.coop.recordCapture(session.id, session.adventure.battleToken, mon, result));
		const captured = [...member(host).team, ...(member(host).pendingCaptures || [])].find(entry => entry.id === mon.id);
		assert.equal(captured.set.item, 'fantasypowerlens'); assert.equal(mon.set.item, 'Leftovers');
		assert.equal(member(host).spiritConversions['capture:caught-item'], 'fantasypowerlens');
		assert.equal(!!member(host).pendingCaptures?.length, full);
		assert.deepEqual(member(guest), other);
		const saved = get(); manager = new RogueManager(engine);
		rolls(() => { throw new Error('capture rerolled'); }, () =>
			manager.coop.recordCapture(session.id, session.adventure.battleToken, mon, result));
		assert.deepEqual(get(), saved);
	});
});
