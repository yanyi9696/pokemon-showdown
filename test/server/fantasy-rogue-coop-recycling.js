'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op personal recycling', () => {
	let previous, store, engine, manager, host, guest, serial = 0;
	const items = createPreviewContent().items;
	const shard = items.find(item => item.kind === 'terashard').id;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content();
		data.items = [...items, ...data.items.filter(item => !items.some(entry => entry.id === item.id))];
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); manager = new RogueManager(engine);
		host = makeUser(`Recycle Host ${++serial}`, `127.0.65.${serial}`);
		guest = makeUser(`Recycle Guest ${serial}`, `127.0.66.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			for (const user of [host, guest]) {
				const member = shared.adventure.members[user.id]; member.money = 1000;
				member.bag = { potion: 3, tinymushroom: 5, roguetmthunderbolt: 1, rogueemblemfire: 1,
					leftovers: 2, masterball: 1, [shard]: 2, doesnotexist: 4 };
				member.team[0].set.item = 'leftovers'; member.shoppingSpend = { total: 2900, rewards: 0 };
			}
		});
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure;
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function prepare(floor = 80, kind = 'buyback') {
		change(shared => {
			const adventure = shared.adventure;
			adventure.floor = floor;
			adventure.routeChoices = [{ id: 'recycling', name: '测试回收站', kind: kind === 'rest' ? 'rest' : 'trade',
				...(kind === 'rest' ? {} : { trade: { kind, stock: [], purchases: 0 } }),
				encounters: [], reward: { money: 0, items: {} } }];
		});
	}
	function enter(floor = 80, kind = 'buyback') {
		prepare(floor, kind);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'recycling' });
	}
	function request(user, extra = {}) {
		return { action: 'sell', id: randomUUID(), value: 'tinymushroom', count: 2, confirmed: true,
			quote: view(user).recycling?.quote, ...extra };
	}
	it('opens full-price buyback from floor 80 with native prices and protected-item exclusions', () => {
		prepare(79); assert.equal(view(host).routeChoices[0].available, false);
		assert.throws(() => manager.coop.command(host, { action: 'selectarea', value: 'recycling' }), /尚未接入/);
		enter(); const quote = view(host).recycling;
		assert(quote.fullPrice); assert.equal(view(host).shopItems.length, 0);
		assert.equal(quote.items.find(item => item.id === 'potion').price, items.find(item => item.id === 'potion').price);
		assert.equal(quote.items.find(item => item.id === 'tinymushroom').price, 150);
		assert.equal(quote.items.find(item => item.id === 'roguetmthunderbolt').price, 2500);
		assert.equal(quote.items.find(item => item.id === 'rogueemblemfire').price, 4000);
		assert(!quote.items.some(item => ['masterball', shard, 'doesnotexist'].includes(item.id)));
		assert.equal(quote.items.find(item => item.id === 'leftovers').count, 2);
		change(shared => { shared.adventure.floor = 79; });
		assert.equal(view(host).recycling, null); assert.throws(() => manager.coop.command(host, request(host)), /报价/);
	});
	it('exchanges only ordinary treasures at a center and preserves both solo runs and the partner', () => {
		enter(9, 'rest'); const before = member(host), other = member(guest);
		const accounts = [store.get(host.id), store.get(guest.id)];
		assert.deepEqual(view(host).recycling.items.map(item => item.id), ['tinymushroom']);
		assert.throws(() => manager.coop.command(host, request(host, { value: 'potion' })), /没有/);
		const command = request(host); manager.coop.command(host, command);
		assert.equal(member(host).bag.tinymushroom, 3); assert.equal(member(host).money, before.money + 300);
		assert.deepEqual(member(guest), other); assert.deepEqual(member(host).shoppingSpend, before.shoppingSpend);
		assert.deepEqual(member(host).team, before.team);
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		const saved = session(); manager = new RogueManager(engine); manager.coop.command(host, command);
		assert.deepEqual(session(), saved);
		manager.coop.command(host, request(host, { value: 'all', count: undefined }));
		assert.equal(member(host).bag.potion, 3);
		assert.equal(member(host).bag.doesnotexist, 4); assert.equal(view(host).recycling.items.length, 0);
	});
	it('sells only quoted bag inventory and credits the correct total without touching equipped items', () => {
		enter(); const before = member(host), quote = view(host).recycling;
		const amount = quote.items.reduce((sum, item) => sum + item.price * item.count, 0);
		change(shared => { shared.adventure.routeExitSelections = { [host.id]: true, [guest.id]: true }; });
		manager.coop.command(host, request(host, { value: 'all', count: undefined }));
		const after = member(host);
		assert.equal(after.money, before.money + amount);
		for (const item of quote.items) assert.equal(after.bag[item.id], 0, item.id);
		assert.equal(after.bag.masterball, 1); assert.equal(after.bag[shard], 2); assert.equal(after.bag.doesnotexist, 4);
		assert.equal(after.team[0].set.item, 'leftovers'); assert.deepEqual(after.shoppingSpend, before.shoppingSpend);
		assert.equal(view(host).routeExitSelection, false); assert.equal(view(host).partnerRouteExitSelection, true);
		assert.equal(session().adventure.node.trade.purchases, 0);
	});
	it('keeps treasure exchange open after a standard trade stall sells out', () => {
		enter(9, 'rest'); change(shared => {
			shared.adventure.node.kind = 'trade'; shared.adventure.node.trade = { kind: 'balls', stock: [], purchases: 0 };
		});
		assert.equal(view(host).shopItems.length, 0); assert.equal(view(host).recycling.fullPrice, false);
		manager.coop.command(host, request(host)); assert.equal(member(host).money, 1300);
	});
	it('rejects stale inventory, changed prices, changed visits and unconfirmed or invalid quantities', () => {
		enter(); const quote = request(host);
		change(shared => { shared.adventure.members[host.id].bag.tinymushroom++; });
		assert.throws(() => manager.coop.command(host, quote), /已变化/);
		const fresh = request(host), item = engine.content.items.find(entry => entry.id === 'tinymushroom');
		item.sellPrice++; assert.throws(() => manager.coop.command(host, fresh), /已变化/); item.sellPrice--;
		change(shared => { shared.adventure.node.id = 'another-visit'; });
		assert.throws(() => manager.coop.command(host, fresh), /已变化/);
		const before = session();
		for (const extra of [{ confirmed: false }, { value: 'masterball' }, { value: shard }, { quote: 'forged' },
			{ count: 0 }, { count: -1 }, { count: 0.5 }, { count: 7 }, { count: Infinity }, { value: 'all', count: 1 }]) {
			assert.throws(() => manager.coop.command(host, request(host, extra))); assert.deepEqual(session(), before);
		}
	});
	it('honors delegated ownership and revocation without revealing partner quotations to unassigned players', () => {
		enter(); assert.equal(view(host).partnerRecycling, null);
		const command = request(guest, { owner: guest.id }), own = member(host);
		assert.throws(() => manager.coop.command(host, command));
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert.equal(view(host).partnerRecycling.quote, view(guest).recycling.quote);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.equal(view(host).partnerRecycling, null); assert.throws(() => manager.coop.command(host, command));
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		manager.coop.command(host, command); assert.equal(member(guest).money, 1300); assert.deepEqual(member(host), own);
	});
	it('blocks recycling during battle and existing personal or trade pending steps', () => {
		enter();
		change(shared => { shared.adventure.members[host.id].pendingMoves = [{ member: member(host).team[0].id, move: 'growth' }]; });
		assert.match(view(host).recycling.locked, /待学/);
		assert.throws(() => manager.coop.command(host, request(host)), /待学/);
		change(shared => {
			delete shared.adventure.members[host.id].pendingMoves;
			shared.adventure.tradeProposal = { id: 'trade', fromUser: host.id, fromMember: member(host).team[0].id,
				toMember: member(guest).team[0].id, fee: 2500, createdAt: Date.now() };
		});
		assert.throws(() => manager.coop.command(host, request(host)), /交换/);
		change(shared => { delete shared.adventure.tradeProposal; shared.adventure.phase = 'battle'; });
		assert.equal(view(host).recycling, null); assert.throws(() => manager.coop.command(host, request(host)), /报价/);
	});
	it('does not partially sell items or notify when the session write fails or money would overflow', () => {
		enter(); const before = session(), command = request(host, { value: 'all', count: undefined });
		const send = guest.send, messages = []; guest.send = message => messages.push(message);
		store.db.exec("CREATE TEMP TRIGGER recycle_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'recycle write failed'); END;");
		try {
			assert.throws(() => manager.coop.command(host, command), /recycle write failed/);
			assert.deepEqual(session(), before); assert.equal(messages.length, 0);
		} finally { store.db.exec('DROP TRIGGER recycle_fail'); guest.send = send; }
		change(shared => { shared.adventure.members[host.id].money = Number.MAX_SAFE_INTEGER - 100; });
		const overflow = session(); assert.throws(() => manager.coop.command(host, request(host)), /金额无效/);
		assert.deepEqual(session(), overflow);
		change(shared => { shared.adventure.members[host.id].money = 1000; });
		manager.coop.command(host, command); assert.equal(member(host).bag.tinymushroom, 0);
	});
});
