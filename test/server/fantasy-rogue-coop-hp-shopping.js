'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { hpPurchaseCost } = require('../../dist/server/fantasy-rogue/spirits');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op Yveltal HP shopping', () => {
	let previous, store, engine, manager, host, guest;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content();
		data.items.push({ id: 'potion', name: '伤药', kind: 'heal', price: 100, amount: 20, shopFloor: 1 },
			{ id: 'maxpotion', name: '全满药', kind: 'heal', price: 1000, amount: 999, shopFloor: 1 },
			{ id: 'lifeorb', name: '生命宝珠', kind: 'held', price: 3000, shopFloor: 1 },
			{ id: 'masterball', name: '大师球', kind: 'ball', price: 10000, shopFloor: 1 });
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); manager = new RogueManager(engine);
		host = makeUser('Hp Shopping Host', '127.99.4.1'); guest = makeUser('Hp Shopping Guest', '127.99.4.2');
		for (const user of [host, guest]) engine.command(user.id, { id: randomUUID(),
			revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'] });
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(session => {
			Object.assign(session.adventure, { spirit: 'yveltal', spiritVersion: 1, floor: 9, phase: 'route-interaction',
				node: { id: 'center', name: '测试中心', kind: 'rest', encounters: [], reward: { money: 0, items: {} } } });
			for (const m of Object.values(session.adventure.members)) {
				m.money = 50000; m.team = [createRoguePokemon(set('Bulbasaur', 'Overgrow', 50), stats(0))];
				initializeExperience(m.team[0]); assert.equal(m.team[0].maxhp, 120);
			}
		});
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	const get = () => store.coopSessionForUser(host.id);
	const member = user => get().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure;
	function change(update) {
		const session = get(), revision = session.revision;
		update(session); session.revision++; store.updateCoopSession(session, revision);
	}
	function buy(user = host, extra = {}) {
		const owner = extra.owner === guest.id ? guest : user;
		const command = { action: 'buyhp', id: randomUUID(), value: 'potion', count: 1,
			member: member(owner).team[0].id, visit: view(owner).hpShop?.visit, ...extra };
		manager.coop.command(user, command); return command;
	}
	it('allows three personal purchases, including recovery goods, without spending coins or the partner allowance', () => {
		const other = member(guest), solo = store.get(host.id).run;
		for (const value of ['potion', 'revive', 'pokeball']) buy(host, { value });
		assert.equal(member(host).team[0].hp, 84); assert.equal(member(host).money, 50000);
		assert.equal(view(host).hpShop.remaining, 0); assert.equal(view(guest).hpShop.remaining, 3);
		assert.equal(member(host).bag.potion, 1); assert.equal(member(host).bag.revive, 1);
		assert.deepEqual(member(guest), other); assert.deepEqual(store.get(host.id).run, solo);
		const saved = get(); assert.throws(() => buy(), /限额/); assert.deepEqual(get(), saved);
		for (let n = 0; n < 3; n++) buy(guest); assert.equal(view(guest).hpShop.remaining, 0);
		manager.coop.command(host, { action: 'buy', id: randomUUID(), value: 'potion' });
		assert.equal(member(host).money, 49900); assert.equal(view(host).hpShop.remaining, 0);
	});
	it('retains HP cost, allowance and the request receipt on refresh, including a trimmed generic receipt list', () => {
		const command = buy(), saved = get(); manager = new RogueManager(engine);
		manager.coop.command(host, { action: 'refresh' }); manager.coop.command(host, command); assert.deepEqual(get(), saved);
		change(session => { session.adventure.members[host.id].purchaseReceipts = []; });
		const trimmed = get(); manager.coop.command(host, command); assert.deepEqual(get(), trimmed);
		assert.equal(view(host).hpShop.remaining, 2);
		const oldVisit = command.visit;
		change(session => { session.adventure.floor = 19; }); assert.equal(view(host).hpShop.remaining, 3);
		assert.throws(() => buy(host, { visit: oldVisit }), /已变化/);
		buy(); assert.equal(view(host).hpShop.remaining, 2); assert.equal(member(host).hpPurchases.receipts.length, 1);
	});
	it('uses the current server price, rounds costs upward and preserves at least one HP', () => {
		assert.equal(hpPurchaseCost({ price: 150 }, 101), 11);
		assert.equal(hpPurchaseCost({ price: 1000 }, 101), 21);
		assert.equal(hpPurchaseCost({ price: 3000 }, 101), 61);
		buy(host, { value: 'lifeorb' }); assert.equal(member(host).team[0].hp, 48);
		buy(host, { value: 'maxpotion' }); assert.equal(member(host).team[0].hp, 24);
		const saved = get(); assert.throws(() => buy(host, { value: 'maxpotion' }), /至少保留/); assert.deepEqual(get(), saved);
		change(session => { session.adventure.members[host.id].team[0].hp = 13; });
		buy(); assert.equal(member(host).team[0].hp, 1);
	});
	it('does not require coin balance and caps the most expensive goods at eighty percent maximum HP', () => {
		change(session => { session.adventure.members[host.id].money = 0; });
		buy(host, { value: 'masterball' });
		assert.equal(member(host).team[0].hp, 24); assert.equal(member(host).money, 0);
		assert.equal(member(host).bag.masterball, 1);
	});
	it('charges only the delegated owner and rejects payment using another owner or revoked authority', () => {
		assert.equal(view(host).partnerHpShop, null);
		const saved = get(); assert.throws(() => buy(host, { owner: guest.id })); assert.deepEqual(get(), saved);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert.equal(view(host).partnerHpShop.remaining, 3); buy(host, { owner: guest.id });
		assert.equal(member(guest).team[0].hp, 108); assert.equal(member(guest).bag.potion, 1);
		assert.equal(member(host).team[0].hp, 120); assert(!member(host).bag.potion);
		assert.throws(() => buy(host, { member: member(guest).team[0].id }), /自己队伍/);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.throws(() => buy(host, { owner: guest.id }));
	});
	it('rejects invalid payers, quantities, spirits, phases and stale shop visits without mutation', () => {
		for (const count of [0, 2, 1.5, -1]) {
			const before = get(); assert.throws(() => buy(host, { count })); assert.deepEqual(get(), before);
		}
		for (const flag of ['egg', 'nuzlockeDead', 'fainted']) {
			change(session => {
				const mon = session.adventure.members[host.id].team[0]; delete mon.egg; delete mon.nuzlockeDead;
				mon.hp = flag === 'fainted' ? 0 : 120;
				if (flag === 'egg') mon.egg = { species: 'Bulbasaur', hatch: 20 };
				if (flag === 'nuzlockeDead') mon.nuzlockeDead = true;
			});
			const before = get(); assert.throws(() => buy()); assert.deepEqual(get(), before);
		}
		change(session => { session.adventure.spirit = 'hooh'; });
		assert.equal(view(host).hpShop, null); assert.throws(() => buy());
		change(session => { session.adventure.spirit = 'yveltal'; session.adventure.phase = 'battle-selection'; });
		assert.equal(view(host).hpShop, null); assert.throws(() => buy());
	});
	it('consumes shared trade stock while retaining independent limits and leaves rejected buyers untouched', () => {
		change(session => {
			session.adventure.node.kind = 'trade'; session.adventure.node.trade = { kind: 'balls', purchases: 0,
				stock: [{ ...engine.content.items.find(item => item.id === 'potion'), price: 1000, remaining: 1 }] };
		});
		buy(); assert.equal(member(host).team[0].hp, 96); assert.equal(get().adventure.node.trade.stock[0].remaining, 0);
		const saved = get(); assert.throws(() => buy(guest)); assert.deepEqual(get(), saved);
		assert.equal(view(guest).hpShop.remaining, 3);
	});
	it('does not grant coin-spending experience for HP purchases or reset HP and allowance during center care', () => {
		change(session => {
			const m = session.adventure.members[host.id];
			m.blessings.owned = [{ ...blessing('shoppingupgrade'), floor: 1 }];
			m.shoppingSpend = { total: 2900, rewards: 0 }; m.team[0].pp[0].pp = 0;
		});
		const xp = member(host).team[0].experience;
		buy(); assert.equal(member(host).team[0].experience, xp); assert.equal(member(host).shoppingSpend.total, 2900);
		manager.coop.command(host, { action: 'heal' });
		assert.equal(member(host).team[0].hp, 108); assert(member(host).team[0].pp[0].pp > 0);
		assert.equal(view(host).hpShop.remaining, 2);
		manager.coop.command(host, { action: 'buy', id: randomUUID(), value: 'potion' });
		assert.equal(member(host).shoppingSpend.total, 3000); assert(member(host).team[0].experience > xp);
	});
	it('atomically rolls back HP, allowance, goods, stock and account state on a session write failure', () => {
		change(session => {
			session.adventure.node.kind = 'trade'; session.adventure.node.trade = { kind: 'balls', purchases: 0,
				stock: [{ ...engine.content.items.find(item => item.id === 'potion'), remaining: 2 }] };
		});
		const before = get(), account = store.get(host.id), command = { action: 'buyhp', id: randomUUID(),
			visit: view(host).hpShop.visit, member: member(host).team[0].id, value: 'potion' };
		store.db.exec("CREATE TEMP TRIGGER hp_buy_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'HP write failed'); END;");
		try {
			assert.throws(() => manager.coop.command(host, command), /HP write failed/);
			assert.deepEqual(get(), before); assert.deepEqual(store.get(host.id), account);
		} finally { store.db.exec('DROP TRIGGER hp_buy_fail'); }
		manager.coop.command(host, command); assert.equal(member(host).team[0].hp, 108);
		assert.equal(view(host).hpShop.remaining, 2); assert.equal(member(host).bag.potion, 1);
		assert.equal(get().adventure.node.trade.stock[0].remaining, 1);
	});
	it('keeps a pending Pokemon exchange immutable until the players resolve it', () => {
		change(session => {
			session.adventure.tradeProposal = { id: 'pending-swap', fromUser: host.id, fee: 2500, createdAt: Date.now(),
				fromMember: member(host).team[0].id, toMember: member(guest).team[0].id };
		});
		assert(view(host).hpShop.locked.includes('交换'));
		const saved = get(); assert.throws(() => buy(), /交换/); assert.deepEqual(get(), saved);
		change(session => { delete session.adventure.tradeProposal; }); buy();
		assert.equal(member(host).team[0].hp, 108);
	});
});
