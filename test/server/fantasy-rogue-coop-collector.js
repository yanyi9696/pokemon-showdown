'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { chooseEventOption } = require('../../dist/server/fantasy-rogue/events');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op mushroom collector', () => {
	let previous, store, engine, manager, host, guest, serial = 0;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content(), items = createPreviewContent().items;
		data.items = [...items, ...data.items.filter(item => !items.some(entry => entry.id === item.id))];
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); manager = new RogueManager(engine);
		host = makeUser(`Collector Host ${++serial}`, `127.0.67.${serial}`);
		guest = makeUser(`Collector Guest ${serial}`, `127.0.68.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			for (const user of [host, guest]) {
				const own = shared.adventure.members[user.id];
				own.money = user === host ? 1000 : 2000;
				own.bag = { tinymushroom: 2, bigmushroom: 1, nugget: 1, potion: 2 };
			}
			shared.adventure.members[guest.id].team.push(createRoguePokemon({
				name: '蘑菇伙伴', species: 'Amoonguss', ability: 'Regenerator', moves: ['spore'], level: 30,
			}));
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
	function enter(floor = 81) {
		change(shared => {
			const adventure = shared.adventure;
			adventure.floor = floor; adventure.phase = 'area-selection'; delete adventure.node;
			adventure.routeChoices = [{ id: 'collector', kind: 'trade', name: '蘑菇收藏家',
				trade: { kind: 'mushroom', stock: [], purchases: 0 }, encounters: [], reward: { money: 0, items: {} } }];
		});
		assert(view(host).routeChoices[0].available);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'collector' });
	}
	function request(user, value, action = 'eventchoice') {
		return { action, value, visit: view(user).coopEvent.key };
	}
	function choose(user, value) { return manager.coop.command(user, request(user, value)); }
	function agree(value) { choose(host, value); choose(guest, value); }
	function showcase() { return view(host).coopEvent.branchOptions.find(option => option.id.startsWith('show:')).id; }
	function sell(user, value, count) {
		return manager.coop.command(user, { action: 'sell', id: randomUUID(), value, count,
			confirmed: true, quote: view(user).recycling?.quote });
	}
	it('shows the same union of eligible party members and requires consensus before rewards or recycling', () => {
		enter(1);
		const event = view(host).coopEvent;
		assert.equal(event.id, 'mushroomcollector');
		assert.deepEqual(event.branchOptions, view(guest).coopEvent.branchOptions);
		assert.equal(event.branchOptions.length, 2);
		assert(event.branchOptions[0].id.includes(guest.id)); assert.equal(event.branchOptions[0].seat, 2);
		assert.equal(event.branchOptions[0].pokemon, 'Amoonguss');
		const before = [member(host).bag, member(guest).bag];
		assert.equal(view(host).recycling, null);
		assert.throws(() => sell(host, 'tinymushroom', 1), /报价/);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /目标步骤/);
		choose(host, showcase()); choose(guest, 'collectorshop');
		assert(!view(host).coopEvent.branchResolved); assert.equal(view(host).recycling, null);
		assert.deepEqual([member(host).bag, member(guest).bag], before);
		manager.coop.command(guest, request(guest, undefined, 'cancelevent'));
		assert.equal(view(guest).coopEvent.ownChoice, null);
		choose(guest, showcase()); assert(view(host).coopEvent.ownComplete); assert(view(host).recycling);
	});
	it('shares one original observation gift even if only the guest has a mushroom and preserves solo saves', () => {
		enter(); const before = [member(host), member(guest)], accounts = [store.get(host.id), store.get(guest.id)];
		const reference = structuredClone(accounts[1].run), shared = session().adventure;
		Object.assign(reference, { floor: shared.floor, phase: 'event', team: before[1].team, money: before[1].money,
			bag: structuredClone(before[1].bag), node: structuredClone(shared.node), lastReward: undefined });
		chooseEventOption(structuredClone(accounts[1]), reference, engine.content, () => 0,
			reference.node.event.key, `show:${before[1].team[1].id}`);
		const command = request(guest, showcase()); choose(host, showcase()); manager.coop.command(guest, command);
		for (const [index, user] of [host, guest].entries()) {
			assert.equal(member(user).money - before[index].money, reference.money - before[1].money);
			assert.deepEqual(member(user).bag, reference.bag);
			for (const [slot, mon] of member(user).team.entries()) {
				// Native event entry also fills missing legacy join-order metadata.
				const { joinOrder, ...actual } = mon;
				const { joinOrder: oldOrder, ...expected } = before[index].team[slot];
				assert.deepEqual(actual, expected); assert.equal(joinOrder, oldOrder ?? slot);
			}
			assert.deepEqual(view(user).lastReward.items, { tinymushroom: 3 });
			assert.equal(view(user).lastReward.money, reference.lastReward.money);
		}
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		const saved = session(); manager = new RogueManager(engine);
		assert(view(host).coopEvent.ownComplete); assert(view(host).recycling);
		assert.throws(() => manager.coop.command(guest, command), /已变化/); assert.deepEqual(session(), saved);
	});
	it('allows browsing without a qualifying partner, without granting a gift or accepting eggs and boxed members', () => {
		change(shared => {
			const own = shared.adventure.members[guest.id];
			own.box = [structuredClone(own.team[1])]; own.team[1].egg = { species: 'Amoonguss', remaining: 1 };
		});
		enter(); assert.deepEqual(view(host).coopEvent.branchOptions.map(option => option.id), ['collectorshop']);
		const before = [member(host), member(guest)]; agree('collectorshop');
		for (const [index, user] of [host, guest].entries()) {
			assert.equal(member(user).money, before[index].money); assert.deepEqual(member(user).bag, before[index].bag);
			assert.deepEqual(view(user).lastReward.items, {}); assert.equal(view(user).lastReward.money, 0);
		}
	});
	it('rejects changed showcase targets, forged visits, repeated claims and requests from battle or secret routes', () => {
		enter(); const selected = showcase(); choose(host, selected);
		change(shared => { shared.adventure.members[guest.id].team[1].set.species = 'Bulbasaur'; });
		const before = session(); assert.throws(() => choose(guest, selected), /分支/); assert.deepEqual(session(), before);
		assert.throws(() => manager.coop.command(guest, { action: 'eventchoice', value: 'collectorshop' }), /来访/);
		assert.throws(() => manager.coop.command(guest, { ...request(guest, 'collectorshop'), visit: 'old-visit' }), /来访/);
		assert.throws(() => choose(guest, `show:${host.id}:${member(guest).team[1].id}`), /分支/);
		const valid = request(guest, 'collectorshop');
		change(shared => { shared.adventure.phase = 'battle'; });
		assert.throws(() => manager.coop.command(guest, valid), /事件/);
		change(shared => { shared.adventure.phase = 'route-interaction'; shared.adventure.node.mainlineScene = 'forged'; });
		assert.equal(view(host).coopEvent, null); assert.equal(view(host).recycling, null);
		assert.throws(() => manager.coop.command(guest, valid), /秘闻/);
	});
	it('uses original 125 percent mushroom prices and ordinary treasure prices with independent wallets', () => {
		enter(); agree('collectorshop');
		const quote = view(host).recycling, other = member(guest), before = member(host);
		assert.equal(quote.mushroomPremium, true); assert.equal(quote.fullPrice, false);
		assert.equal(view(host).partnerRecycling, null);
		assert(!quote.items.some(item => item.id === 'potion'));
		for (const item of quote.items) {
			const native = engine.content.items.find(entry => entry.id === item.id);
			assert.equal(item.price, Math.floor(native.sellPrice * (item.id.endsWith('mushroom') ? 1.25 : 1)));
		}
		assert.equal(quote.items.find(item => item.id === 'tinymushroom').price, 187);
		sell(host, 'tinymushroom', 1); assert.equal(member(host).money, before.money + 187);
		assert.deepEqual(member(guest), other); assert.equal(member(host).bag.tinymushroom, 1);
		assert.throws(() => sell(host, 'potion', 1), /没有/);
		manager.coop.command(host, { action: 'finishroute' });
		assert(view(host).routeExitSelection); sell(host, 'all'); assert(!view(host).routeExitSelection);
		manager.coop.command(guest, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 81);
		manager.coop.command(host, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 82); assert.equal(view(host).coopEvent, null);
	});
	it('honors delegated choices and revocation, and rejects a previous collector visit after moving on', () => {
		enter(); const old = request(host, 'collectorshop');
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert.throws(() => choose(guest, 'collectorshop'), /移交/);
		choose(host, showcase()); assert(view(host).coopEvent.partnerComplete);
		assert(view(host).partnerRecycling);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' }); assert.equal(view(host).partnerRecycling, null);
		manager.coop.command(host, { action: 'finishroute' }); assert.equal(session().adventure.floor, 81);
		manager.coop.command(guest, { action: 'finishroute' }); enter(91);
		assert.notEqual(view(host).coopEvent.key, old.visit);
		assert.throws(() => manager.coop.command(host, old), /来访/);
		assert.equal(view(host).lastReward, null); assert.equal(view(host).recycling, null);
	});
	it('rolls back both gifts and notifications on a failed session write and permits exactly one retry', () => {
		enter(); choose(host, showcase()); const command = request(guest, showcase()), before = session();
		const accounts = [store.get(host.id), store.get(guest.id)];
		const send = host.send, messages = []; host.send = message => messages.push(message);
		store.db.exec("CREATE TEMP TRIGGER collector_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'collector write failed'); END;");
		try {
			assert.throws(() => manager.coop.command(guest, command), /collector write failed/);
			assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
			assert.equal(messages.length, 0);
		} finally { store.db.exec('DROP TRIGGER collector_fail'); host.send = send; }
		manager.coop.command(guest, command);
		assert.equal(member(host).bag.tinymushroom, 5); assert.equal(member(guest).bag.tinymushroom, 5);
	});
	it('rejects unsafe reward arithmetic without saving either player gift', () => {
		enter(); choose(host, showcase());
		change(shared => { shared.adventure.members[guest.id].money = Number.MAX_SAFE_INTEGER; });
		const before = session(); assert.throws(() => choose(guest, showcase()), /可保存范围/);
		assert.deepEqual(session(), before);
	});
});
