'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { chooseEventOption } = require('../../dist/server/fantasy-rogue/events');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { neededExclusiveItems } = require('../../dist/server/fantasy-rogue/exclusive-items');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { experienceAtLevel, rogueSpeciesData } = require('../../dist/sim/fantasy-rogue-rules');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op shared auction and personal buyers', () => {
	let previous, store, engine, manager, host, guest, serial = 0;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content(), items = createPreviewContent().items;
		data.items = [...items, ...data.items.filter(item => !items.some(entry => entry.id === item.id))];
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); manager = new RogueManager(engine);
		host = makeUser(`Auction Host ${++serial}`, `127.0.69.${serial}`);
		guest = makeUser(`Auction Guest ${serial}`, `127.0.70.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			for (const user of [host, guest]) {
				const m = shared.adventure.members[user.id]; m.money = user === host ? 50000 : 60000;
				m.team = [createRoguePokemon(set('Bulbasaur', 'Overgrow', 50), stats(0))];
				initializeExperience(m.team[0]); m.bag = { potion: 2 };
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
	const auction = () => session().adventure.coopAuction;
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function prepare(floor = 81) {
		change(shared => {
			const a = shared.adventure; a.floor = floor;
			a.phase = 'area-selection'; delete a.node;
			a.routeChoices = [{ id: 'auction', kind: 'trade', name: '落槌之前',
				trade: { kind: 'auction', stock: [], purchases: 0 }, encounters: [], reward: { money: 0, items: {} } }];
		});
	}
	function enter(floor = 81) {
		prepare(floor);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'auction' });
	}
	function request(user, value, action = 'eventchoice') { return { action, value, visit: view(user).coopEvent.key }; }
	function choose(user, value) { return manager.coop.command(user, request(user, value)); }
	function agree(value) { choose(host, value); choose(guest, value); }
	function fixedLots(count = 2) {
		change(shared => {
			const a = shared.adventure.coopAuction.state;
			a.lots = a.lots.slice(0, count);
			a.lots.forEach((lot, index) => Object.assign(lot, {
				item: { id: index ? 'leftovers' : 'lightball', name: index ? 'Leftovers' : 'Light Ball',
					kind: 'held', price: 0, shopFloor: false },
				opening: 3000, step: 500, price: 0, leader: -2, willingness: [0, 0, 0], dropped: [], talked: false,
			}));
		});
	}
	function shopping(user) {
		change(shared => {
			const m = shared.adventure.members[user.id];
			m.team = [createRoguePokemon(set('Bulbasaur', 'Overgrow', 8,
				['Tackle', 'Growl', 'Vine Whip', 'Growth']), stats(0))];
			initializeExperience(m.team[0]);
			m.team[0].experience = experienceAtLevel(rogueSpeciesData('Bulbasaur').growth, 9) - 1;
			const run = { team: m.team, floor: 81 }; normalizeBlessings(run);
			run.blessings.owned = [{ ...blessing('shoppingupgrade'), floor: 1 }]; m.blessings = run.blessings;
		});
	}
	it('opens from floor 31 and generates one shared catalogue including the guest missing exclusive item', () => {
		prepare(30); assert.equal(view(host).routeChoices[0].available, false);
		assert.throws(() => manager.coop.command(host, { action: 'selectarea', value: 'auction' }), /尚未接入/);
		change(shared => {
			for (const user of [host, guest]) {
				const m = shared.adventure.members[user.id];
				m.team = [createRoguePokemon(set('Pikachu', 'Static', 50), stats(0))];
				const run = { floor: 31, team: m.team, box: [], bag: m.bag };
				for (const entry of neededExclusiveItems(run)) run.exclusiveItems[entry.id].obtained = entry.id !== 'lightball';
				m.exclusiveItems = run.exclusiveItems;
			}
			shared.adventure.members[host.id].bag.lightball = 1;
		});
		enter(31); const before = session(), data = auction();
		assert(data.state.lots.length >= 3 && data.state.lots.length <= 5);
		assert.equal(data.state.lots[0].item.id, 'lightball'); assert.equal(data.state.npcs.length, 3);
		assert.equal(new Set(data.state.lots.map(lot => lot.item.id)).size, data.state.lots.length);
		assert.deepEqual(view(host).coopEvent.auction, view(guest).coopEvent.auction);
		assert(!JSON.stringify(view(host).coopEvent).includes('willingness'));
		assert.equal(view(host).shopItems.length, 0); assert.equal(view(host).recycling, null);
		manager = new RogueManager(engine); manager.coop.command(guest, { action: 'refresh' });
		assert.deepEqual(session(), before); assert.deepEqual(auction(), data);
	});
	it('requires common entry, supports cancellation and closes a skipped auction without spending', () => {
		enter(); const before = [member(host).money, member(guest).money];
		choose(host, 'enter'); choose(guest, 'leave'); assert.equal(auction().state.entered, false);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /目标步骤/);
		manager.coop.command(host, request(host, undefined, 'cancelevent')); assert.equal(view(host).coopEvent.ownChoice, null);
		choose(host, 'leave'); assert(view(host).coopEvent.ownComplete); assert(view(host).coopEvent.partnerComplete);
		assert.deepEqual([member(host).money, member(guest).money], before);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 82); assert.equal(auction(), undefined);
	});
	it('matches the native NPC auction for talks, bidding, jumps, passing and NPC budgets', () => {
		enter(); agree('enter');
		const sequence = ['pressure', `bid:${guest.id}`, `jump:${host.id}`, 'pass', 'bluff', 'pass'];
		for (const choice of sequence) {
			if (view(host).coopEvent.ownComplete) break;
			const [action, owner] = choice.split(':'), user = owner === guest.id ? guest : host;
			const a = session().adventure, m = a.members[user.id];
			const run = structuredClone({ ...store.get(user.id).run, floor: a.floor, phase: 'event',
				team: m.team, box: m.box, bag: m.bag, money: m.money, blessings: m.blessings,
				node: { ...a.node, event: m.coopEvent }, auction: a.coopAuction.state, lastReward: m.coopEventReward });
			const oldWallets = [member(host).money, member(guest).money];
			chooseEventOption(structuredClone(store.get(user.id)), run, engine.content, () => 0, run.node.event.key, action);
			agree(choice);
			assert.deepEqual(auction().state.lots, run.auction.lots); assert.deepEqual(auction().state.npcs, run.auction.npcs);
			assert.equal(auction().state.index, run.auction.index); assert.equal(member(user).money, run.money);
			assert.deepEqual(member(user).bag, run.bag);
			assert.equal(member(user === host ? guest : host).money, oldWallets[user === host ? 1 : 0]);
		}
	});
	it('credits different winning players once, keeps separate receipts and preserves both paused solo saves', () => {
		enter(); fixedLots(); agree('enter');
		const accounts = [store.get(host.id), store.get(guest.id)], first = request(guest, `bid:${guest.id}`);
		choose(host, first.value); manager.coop.command(guest, first);
		assert.equal(member(host).money, 50000); assert.equal(member(guest).money, 57000);
		assert.equal(member(guest).bag.lightball, 1); assert.equal(member(host).bag.lightball, undefined);
		assert.equal(auction().buyers[0], guest.id); assert(view(host).coopEvent.auction.catalog.includes('2P 已拍得'));
		assert(view(host).coopEvent.paragraphs.some(line => line.includes('2P花费')));
		assert.equal(view(guest).lastReward.money, -3000); assert.deepEqual(view(guest).lastReward.items, { lightball: 1 });
		const saved = session(); assert.throws(() => manager.coop.command(guest, first), /报价已变化/);
		assert.deepEqual(session(), saved); manager = new RogueManager(engine);
		agree(`jump:${host.id}`);
		assert.equal(member(host).money, 46000); assert.equal(member(host).bag.leftovers, 1);
		assert.equal(member(guest).money, 57000); assert.equal(member(guest).bag.leftovers, undefined);
		assert.equal(auction().buyers[1], host.id); assert(view(host).coopEvent.ownComplete);
		assert(view(guest).coopEvent.partnerComplete); assert.equal(view(host).coopEvent.branchOptions.length, 0);
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 82); assert.equal(auction(), undefined);
	});
	it('distinguishes both proposed buyers and rechecks funds before the second confirmation', () => {
		enter(); fixedLots(1); agree('enter');
		choose(host, `bid:${host.id}`); choose(guest, `bid:${guest.id}`); assert.equal(auction().state.index, 0);
		assert.equal(auction().state.lots[0].price, 0);
		change(shared => { shared.adventure.members[guest.id].money = 2999; });
		const before = session(); assert.throws(() => choose(host, `bid:${guest.id}`), /分支/); assert.deepEqual(session(), before);
		assert(view(host).coopEvent.branchOptions.find(option => option.id === `bid:${guest.id}`).disabled);
		choose(guest, `bid:${host.id}`); assert.equal(auction().buyers[0], host.id);
		assert.equal(member(host).money, 47000); assert.equal(member(guest).money, 2999);
	});
	it('fences old prices and malformed buyers, and applies each talk once per lot', () => {
		enter(); agree('enter'); const old = request(host, `bid:${host.id}`);
		agree('pressure'); const saved = session();
		assert.throws(() => manager.coop.command(host, old), /报价已变化/);
		for (const choice of ['pressure', 'bluff', 'enter', 'leave', 'bid', 'jump:outsider', `bid:${guest.id}:1`]) {
			assert.throws(() => choose(host, choice)); assert.deepEqual(session(), saved);
		}
		assert.throws(() => manager.coop.command(host, { action: 'eventchoice', value: 'pass' }), /报价已变化/);
		const oldCancel = request(host, undefined, 'cancelevent'); agree('pass');
		assert.throws(() => manager.coop.command(host, oldCancel), /报价已变化/);
	});
	it('pays from the selected delegated owner and stops unilateral bids after revocation', () => {
		enter(); fixedLots(); manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		choose(host, 'enter'); assert(auction().state.entered);
		assert.throws(() => choose(guest, `bid:${guest.id}`), /移交/);
		choose(host, `bid:${guest.id}`); assert.equal(member(guest).money, 57000); assert.equal(member(host).money, 50000);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		choose(host, `bid:${guest.id}`); assert.equal(auction().state.index, 1); assert.equal(member(guest).money, 57000);
		manager.coop.command(guest, request(guest, undefined, 'cancelevent'));
		choose(guest, 'pass'); assert.equal(auction().state.index, 1);
		choose(host, 'pass'); assert(view(host).coopEvent.ownComplete);
	});
	it('credits shopping experience and learned-move records only to the winning player', () => {
		enter(); fixedLots(); shopping(guest);
		agree('enter');
		const solo = store.get(guest.id).run, other = member(host);
		agree(`bid:${guest.id}`);
		assert.deepEqual(member(guest).shoppingSpend, { total: 3000, rewards: 1 });
		assert.equal(member(guest).team[0].set.level, 9); assert.equal(view(guest).pendingMove.move, 'leechseed');
		assert.deepEqual(member(host).team, other.team); assert.equal(member(host).shoppingSpend, undefined);
		assert.throws(() => choose(host, 'pass'), /待学/);
		manager.coop.command(guest, { action: 'learn', member: member(guest).team[0].id, value: '0', move: 'leechseed' });
		assert(store.get(guest.id).starterTraits.bulbasaur.moves.includes('leechseed'));
		assert.deepEqual(store.get(guest.id).run, solo); agree('pass'); assert(view(host).coopEvent.ownComplete);
	});
	it('rolls back money, item, XP, account records and common bidding state when persistence fails', () => {
		enter(); fixedLots(); shopping(guest);
		agree('enter'); choose(host, `bid:${guest.id}`);
		const before = session(), accounts = [store.get(host.id), store.get(guest.id)], command = request(guest, `bid:${guest.id}`);
		const send = host.send, messages = []; host.send = message => messages.push(message);
		store.db.exec("CREATE TEMP TRIGGER auction_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'auction write failed'); END;");
		try {
			assert.throws(() => manager.coop.command(guest, command), /auction write failed/);
			assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
			assert.equal(messages.length, 0);
		} finally { store.db.exec('DROP TRIGGER auction_fail'); host.send = send; }
		manager.coop.command(guest, command); assert.equal(member(guest).bag.lightball, 1);
		assert.equal(member(guest).money, 57000); assert.deepEqual(member(guest).shoppingSpend, { total: 3000, rewards: 1 });
	});
	it('retains the winning exclusive-item ledger across reload and subsequent visits after the item is sold', () => {
		change(shared => { shared.adventure.members[guest.id].team = [createRoguePokemon(set('Pikachu', 'Static', 50), stats(0))]; });
		enter(); fixedLots(1); agree('enter');
		agree(`bid:${guest.id}`);
		assert.equal(member(guest).exclusiveItems.lightball.obtained, true);
		assert.equal(member(host).exclusiveItems.lightball, undefined);
		manager = new RogueManager(engine);
		change(shared => { shared.adventure.members[guest.id].bag.lightball = 0; });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		enter(91); assert.equal(member(guest).exclusiveItems.lightball.obtained, true);
		const run = { ...member(guest), floor: 91 };
		assert(!neededExclusiveItems(run).some(item => item.id === 'lightball'));
	});
	it('rejects battle, secret-route, over-capacity inventory and old-visit submissions without partial effects', () => {
		enter(); fixedLots(1); agree('enter');
		const valid = request(host, `bid:${guest.id}`);
		change(shared => { shared.adventure.phase = 'battle'; });
		assert.throws(() => manager.coop.command(host, valid), /事件/);
		change(shared => { shared.adventure.phase = 'route-interaction'; shared.adventure.node.mainlineScene = 'forged'; });
		assert.equal(view(host).coopEvent, null); assert.throws(() => manager.coop.command(host, valid), /秘闻/);
		change(shared => { delete shared.adventure.node.mainlineScene; shared.adventure.members[guest.id].bag.lightball = Number.MAX_SAFE_INTEGER; });
		choose(host, valid.value); const before = session();
		assert.throws(() => choose(guest, valid.value), /可保存范围/); assert.deepEqual(session(), before);
		enter(91); assert.throws(() => manager.coop.command(host, valid), /报价已变化/);
	});
});
