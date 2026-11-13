'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { LUCK_EVENT_NAMES, LUCK_EVENT_TEXT } = require('../../dist/server/fantasy-rogue/luck-event-data');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { candyExperience } = require('../../dist/server/fantasy-rogue/candy-rewards');
const { content, stats, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op shared coin and die gifts', () => {
	let oldConfig, store, engine, manager, host, guest, items, fixture;
	let serial = 0;
	const ids = Object.keys(LUCK_EVENT_NAMES);
	before(() => { items = createPreviewContent().items; });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		fixture = content();
		fixture.items = [...fixture.items, ...items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture); manager = new RogueManager(engine);
		host = makeUser(`Luck Host ${++serial}`, `127.0.51.${serial}`);
		guest = makeUser(`Luck Guest ${serial}`, `127.0.52.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: crypto.randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
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
	function enter(id, floor = 61) {
		change(shared => {
			const adventure = shared.adventure;
			adventure.floor = floor;
			adventure.routeChoices = [{ id: 'luck', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			adventure.coopEventHistory = Object.keys(EVENT_NAMES)
				.filter(key => key !== id).map(key => ({ id: key, floor: 1 }));
			for (const user of [host, guest]) {
				const state = adventure.members[user.id];
				state.money = user === host ? 1 : 10001;
				state.bag = { pokeball: user === host ? 1 : 9 };
				state.notices ||= [];
				state.pendingMoves ||= [];
				state.growth = { offense: 0, defense: 0, experience: 0 };
				state.blessings = normalizeBlessings({ floor, team: state.team, box: [], bag: {}, boosts: stats(0) });
				state.blessings.shards = user === host ? 2 : 17;
			}
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'luck' });
		});
	}
	function agree(id, face, beforeSecond) {
		const kind = LUCK_EVENT_TEXT[id].kind, value = kind === 'coin' ? 'coin' : 'roll';
		const original = crypto.randomInt;
		let rolls = 0;
		try {
			crypto.randomInt = max => {
				assert.equal(max, kind === 'coin' ? 2 : 6);
				return ++rolls === 1 ? face - 1 : 0;
			};
			choose(host, value);
			assert.equal(rolls, 0, 'the first vote cannot draw or settle the event');
			beforeSecond?.();
			choose(guest, value);
		} finally { crypto.randomInt = original; }
		return rolls;
	}
	const gainedBag = (after, before) => Object.fromEntries(Object.entries(after.bag)
		.map(([id, count]) => [id, count - (before.bag[id] || 0)]).filter(([, count]) => count));

	for (const id of ids) {
		it(`${id} rolls once after consensus and credits both independent saves without duplicate rewards`, () => {
			enter(id);
			assert.equal(event(host).id, id);
			assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
			const before = session().adventure.members, accounts = [host, guest].map(user => store.get(user.id));
			const kind = LUCK_EVENT_TEXT[id].kind, face = kind === 'coin' ? 2 : 6;
			assert.equal(agree(id, face, () => {
				assert.deepEqual(session().adventure.members, before);
			}), 1);
			const after = session().adventure.members;
			for (const [index, user] of [host, guest].entries()) {
				assert.deepEqual(after[user.id].coopEvent.luck, { kind, face, loaded: false });
				assert.equal(after[user.id].coopEvent.settled, true);
				assert.deepEqual(store.get(user.id), accounts[index], 'personal solo runs and account progression stay intact');
				assert.equal(event(user).options.length, 0);
				assert(event(user).paragraphs.some(line => line.includes(kind === 'coin' ? '反面' : '6 点')));
			}
			assert.equal(after[guest.id].money - before[guest.id].money, after[host.id].money - before[host.id].money);
			assert.deepEqual(gainedBag(after[guest.id], before[guest.id]), gainedBag(after[host.id], before[host.id]));
			assert.equal(after[guest.id].blessings.shards - before[guest.id].blessings.shards,
				after[host.id].blessings.shards - before[host.id].blessings.shards);
			assert(after[host.id].money > before[host.id].money || Object.keys(gainedBag(after[host.id], before[host.id])).length ||
				after[host.id].blessings.shards > before[host.id].blessings.shards);
			const settled = session();
			manager = new RogueManager(new RogueEngine(store, fixture));
			assert.equal(event(host).ownComplete, true); assert.equal(event(guest).partnerComplete, true);
			assert.throws(() => choose(host, kind === 'coin' ? 'coin' : 'roll'), /选项已变化/);
			assert.deepEqual(session(), settled);
		});
	}
	for (const owner of ['host', 'guest']) {
		it(`applies the ${owner}'s Loaded Dice to the one shared result`, () => {
			const id = owner === 'host' ? 'meowthcoin' : 'clefairydice';
			enter(id);
			change(shared => shared.adventure.members[owner === 'host' ? host.id : guest.id].blessings.owned
				.push({ id: 'dice', family: 'dice', tier: 'silver', floor: 1 }));
			assert.equal(agree(id, 2), 0);
			for (const user of [host, guest]) {
				assert.deepEqual(member(user).coopEvent.luck,
					{ kind: owner === 'host' ? 'coin' : 'die', face: owner === 'host' ? 1 : 6, loaded: true });
				assert(event(user).paragraphs.some(line => line.includes('灌铅骰子')));
			}
		});
	}
	it('permits cancellation and differing choices, and declining never rolls or gives a reward', () => {
		enter('shuckledice');
		const before = session().adventure.members, original = crypto.randomInt;
		try {
			crypto.randomInt = () => { throw new Error('unexpected roll'); };
			choose(host, 'roll'); choose(guest, 'leave');
			assert.equal(event(host).branchResolved, false);
			assert.equal(event(host).partnerChoice, 'leave');
			manager.coop.command(host, { action: 'cancelevent' });
			assert.equal(event(guest).partnerChoice, null);
			choose(host, 'leave');
		} finally { crypto.randomInt = original; }
		for (const user of [host, guest]) {
			const state = member(user);
			assert.equal(state.coopEvent.luck, undefined); assert.equal(state.coopEvent.settled, true);
			assert.equal(state.money, before[user.id].money); assert.deepEqual(state.bag, before[user.id].bag);
			assert.equal(state.blessings.shards, before[user.id].blessings.shards);
		}
	});
	it('keeps the moon fragment game locked until floor 51', () => {
		enter('clefairydice', 50); assert.notEqual(event(host).id, 'clefairydice');
		change(shared => { shared.adventure.phase = 'area-selection'; delete shared.adventure.node; });
		enter('clefairydice', 51); assert.equal(event(host).id, 'clefairydice');
	});
	it('shares the late candy budget but independently refunds a capped member', () => {
		enter('delibirddice', 161);
		change(shared => {
			shared.adventure.members[host.id].growth = { offense: 12000, defense: 12000, experience: 0 };
		});
		assert.equal(agree('delibirddice', 6), 1);
		const capped = member(host), growing = member(guest);
		assert.equal(capped.growth.offense, 12000); assert.equal(capped.growth.defense, 12000);
		assert(growing.growth.offense > 0); assert.equal(growing.growth.offense, growing.growth.defense);
		assert.equal(candyExperience(capped.bag), candyExperience(growing.bag) + growing.growth.offense * 1000);
		assert(event(host).paragraphs.some(line => line.includes('未转换')));
		assert(event(guest).paragraphs.some(line => line.includes('训练心得')));
	});
	it('honors delegation, and cancellation immediately restores independent event votes', () => {
		enter('chanseycoin');
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		choose(host, 'coin'); assert.equal(member(host).coopEvent.settled, undefined);
		assert.equal(event(host).partnerChoice, null);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		choose(host, 'coin');
		assert.equal(member(host).coopEvent.settled, true); assert.equal(member(guest).coopEvent.settled, true);
		assert.deepEqual(member(host).coopEvent.luck, member(guest).coopEvent.luck);
	});
	it('rolls back both members on a failed session write and safely retries the pending vote', () => {
		enter('meowthcoin'); choose(host, 'coin');
		const before = session(), original = store.updateCoopSession;
		try {
			store.updateCoopSession = () => { throw new Error('write failed'); };
			assert.throws(() => choose(guest, 'coin'), /write failed/);
		} finally { store.updateCoopSession = original; }
		assert.deepEqual(session(), before);
		choose(guest, 'coin');
		assert(member(host).money > before.adventure.members[host.id].money);
		assert.deepEqual(member(host).coopEvent.luck, member(guest).coopEvent.luck);
	});
});
