'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { eventCost } = require('../../dist/server/fantasy-rogue/early-balance');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op room event and shared follow-up choices', () => {
	let oldConfig, store, engine, manager, host, guest, created, items;
	let serial = 0;
	before(() => { items = createPreviewContent().items; });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true; fixture.wildTreasures = true;
		fixture.items = [...fixture.items, ...items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-room-fixture' };
		} }));
		host = makeUser(`Room Host ${++serial}`, `127.0.53.${serial}`);
		guest = makeUser(`Room Guest ${serial}`, `127.0.54.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: crypto.randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			const round = { floor: 1, tier: 'silver', remaining: 1, familiesSeen: [], idsSeen: ['swapstats'],
				options: [{ id: 'swapstats', tier: 'silver', refreshes: 1, chosen: false }] };
			shared.adventure.coopBlessingRound = round;
			for (const user of [host, guest]) shared.adventure.members[user.id].blessings.round = structuredClone(round);
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 0 });
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const event = user => manager.coop.view(user).session.adventure.coopEvent;
	const choose = (user, value) => manager.coop.command(user, { action: 'eventchoice', value });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(floor = 56) {
		change(shared => {
			shared.adventure.floor = floor;
			shared.adventure.routeChoices = [{ id: 'roomroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(id => id !== 'room')
				.map(id => ({ id, floor: 1 }));
			for (const user of [host, guest]) {
				const state = shared.adventure.members[user.id];
				state.money = user === host ? 100 : 10000;
				state.bag = { pokeball: user === host ? 5 : 12 };
				state.team[0].hp -= 1;
			}
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'roomroute' });
		assert.equal(event(host).id, 'room');
	}
	function fight() {
		choose(host, 'fight'); choose(guest, 'fight');
		const shared = session();
		assert.equal(shared.adventure.phase, 'battle-selection');
		assert.equal(shared.adventure.node.encounters[0].team.length, 3);
		assert(shared.adventure.node.wildLoot?.[0]);
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
	}
	function settle(won = true, retreat = false) {
		const state = created.rogue.state;
		const result = { encounterId: state.encounterId, won, turns: 1, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			defeated: [], ...(retreat ? { coopExit: 'retreat' } : {}) };
		created.rogue.onResult(result);
		return result;
	}
	function continueBoth() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
	}
	function claimToolboxes() {
		const first = member(host).blessings.pending[0], second = member(guest).blessings.pending[0];
		assert.equal(first.kind, 'toolbox'); assert.deepEqual(first.options, second.options);
		assert.equal(new Set(first.options).size, 4);
		for (const user of [host, guest]) {
			const reward = member(user).blessings.pending[0];
			manager.coop.command(user, { action: 'blessingreward', member: reward.id, value: reward.options[0] });
		}
	}
	for (const [roll, kind] of [[0, 'gift'], [65, 'nothing'], [99, 'lost']]) {
		it(`shares one sleep ${kind} result while preserving separate wallets and wounds`, () => {
			enter();
			const before = session().adventure.members, random = crypto.randomInt;
			let rolls = 0;
			try {
				crypto.randomInt = max => max === 100 ? (++rolls === 1 ? roll : 0) : 0;
				choose(host, 'sleep'); assert.equal(rolls, 0);
				choose(guest, 'sleep');
			} finally { crypto.randomInt = random; }
			assert.equal(rolls, 1);
			const first = member(host), second = member(guest);
			assert.equal(first.coopEvent.roomSleepOutcome.kind, kind);
			assert.deepEqual(first.coopEvent.roomSleepOutcome, second.coopEvent.roomSleepOutcome);
			for (const user of [host, guest]) {
				const state = member(user), previous = before[user.id];
				assert.equal(state.coopEvent.settled, true);
				assert.equal(state.team[0].hp, previous.team[0].hp);
				if (kind === 'lost') assert.equal(state.money, previous.money - Math.min(previous.money, eventCost(56, 0.5)));
				else if (kind === 'nothing') {
					assert.equal(state.money, previous.money); assert.deepEqual(state.bag, previous.bag);
				} else {
					const gift = state.coopEvent.roomSleepOutcome;
					assert.equal(state.money, previous.money + gift.money);
					for (const [id, count] of Object.entries(gift.items)) assert.equal(state.bag[id] - (previous.bag[id] || 0), count);
				}
			}
			assert.throws(() => choose(host, 'sleep'), /选项已变化/);
		});
	}
	for (const choice of ['fragments', 'supplies']) {
		it(`requires new shared consensus on ${choice} after winning, then returns to the same event`, () => {
			enter(); fight();
			const before = session().adventure.members, node = session().adventure.node;
			const outcome = settle();
			assert.equal(session().adventure.phase, 'settlement');
			assert.equal(session().adventure.coopEventBranchResolved, false);
			for (const user of [host, guest]) {
				assert.equal(member(user).coopEvent.stage, 'fragments');
				for (const [id, count] of Object.entries(node.wildLoot[0])) assert.equal(member(user).bag[id] - (before[user.id].bag[id] || 0), count);
			}
			const prize = member(host).coopEvent.roomBattlePrize;
			assert.deepEqual(prize, member(guest).coopEvent.roomBattlePrize);
			const saved = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), saved);
			continueBoth();
			assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
			choose(host, 'fragments'); choose(guest, 'supplies');
			assert.equal(session().adventure.coopEventBranchResolved, false);
			assert.equal(member(host).blessings.shards, before[host.id].blessings.shards);
			manager.coop.command(host, { action: 'cancelevent' });
			choose(guest, choice); choose(host, choice);
			if (choice === 'supplies') {
				assert.equal(session().adventure.phase, 'blessing-reward');
				assert.equal(session().adventure.coopBlessingResume, 'event');
				claimToolboxes();
			} else {
				for (const user of [host, guest]) assert.equal(member(user).eventFragments['51'], prize.fragments.amount);
			}
			assert.equal(session().adventure.phase, 'route-interaction');
			assert.equal(session().adventure.floor, 56);
			for (const user of [host, guest]) {
				assert.equal(member(user).coopEvent.settled, true);
				assert.equal(member(user).blessings.shards - before[user.id].blessings.shards, choice === 'supplies' ? 3 : prize.fragments.amount);
			}
			assert.throws(() => choose(guest, choice), /选项已变化/);
			for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
			assert.equal(session().adventure.floor, 57);
			if (choice === 'fragments') assert.equal(member(guest).eventFragments['51'], prize.fragments.amount);
		});
	}
	it('caps the common fragment offer at both personal ledgers and preserves them after a reload', () => {
		enter();
		change(shared => {
			shared.adventure.members[host.id].eventFragments = { '51': 25 };
			shared.adventure.members[guest.id].eventFragments = { '51': 30 };
		});
		fight(); settle(); continueBoth();
		assert.equal(member(host).coopEvent.fragmentOffer.amount, 10);
		assert.equal(member(guest).coopEvent.fragmentOffer.amount, 10);
		manager = new RogueManager(new RogueEngine(store, engine.content));
		choose(host, 'fragments'); choose(guest, 'fragments');
		assert.equal(member(host).eventFragments['51'], 35); assert.equal(member(guest).eventFragments['51'], 40);
	});
	for (const floor of [21, 56]) {
		it(`gives the ordinary shared toolbox when the floor ${floor} fragment offer is unavailable`, () => {
			enter(floor);
			if (floor === 56) change(shared => { shared.adventure.members[guest.id].eventFragments = { '51': 40 }; });
			fight(); settle();
			assert.equal(session().adventure.phase, 'blessing-reward');
			assert.equal(session().adventure.coopBlessingResume, 'battle');
			assert.equal(member(host).coopEvent.roomBattlePrize.fragments, null);
			claimToolboxes();
			assert.equal(session().adventure.phase, 'settlement');
			continueBoth(); assert.equal(session().adventure.phase, 'route-interaction');
			assert.equal(member(host).coopEvent.settled, true);
		});
	}
	for (const retreat of [false, true]) {
		it(`settles a ${retreat ? 'retreated' : 'lost'} challenge without a prize or an unfinishable reward`, () => {
			enter(); fight();
			const before = session().adventure.members;
			settle(false, retreat);
			assert(session().adventure.battleResult.eventResolved);
			assert.throws(() => manager.coop.command(host, { action: 'retrybattle' }), /不能重试/);
			continueBoth();
			for (const user of [host, guest]) {
				assert.equal(member(user).coopEvent.settled, true);
				assert.equal(member(user).coopEvent.roomBattlePrize, undefined);
				assert.deepEqual(member(user).bag, before[user.id].bag);
				assert.equal(member(user).blessings.shards, before[user.id].blessings.shards);
			}
		});
	}
	it('keeps both fragment choices and ledgers unchanged on a failed write and supports delegated retry', () => {
		enter(); fight(); settle();
		continueBoth(); choose(host, 'fragments');
		const before = session(), update = store.updateCoopSession;
		try {
			store.updateCoopSession = () => { throw new Error('event write failed'); };
			assert.throws(() => choose(guest, 'fragments'), /event write failed/);
		} finally { store.updateCoopSession = update; }
		assert.deepEqual(session(), before);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		choose(host, 'fragments');
		assert.equal(member(host).coopEvent.settled, true); assert.equal(member(guest).coopEvent.settled, true);
	});
});
