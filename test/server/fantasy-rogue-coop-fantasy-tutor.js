'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { fantasyTutorMoves } = require('../../dist/server/fantasy-rogue/fantasy-tutor');
const { recordStarterMoves, recordStarterTraits } = require('../../dist/server/fantasy-rogue/starter-traits');
const { content, set, firstEventRoute } = require('../fixtures/fantasy-rogue');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const stats = value => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

describe('Fantasy Rogue co-op Fantasy tutor and atomic unlocks', () => {
	let oldConfig, store, engine, manager, host, guest;
	let serial = 0;
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true;
		Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content());
		manager = new RogueManager(engine);
		host = makeUser(`Tutor Host ${++serial}`, `127.0.45.${serial}`);
		guest = makeUser(`Tutor Guest ${serial}`, `127.0.46.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
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
	const choose = (user, value, owner) => manager.coop.command(user, { action: 'eventchoice', value, owner });
	function enter(shards = 30, floor = 81, species = 'Mewtwo-Fantasy') {
		const shared = session(), revision = shared.revision;
		shared.adventure.floor = floor;
		shared.adventure.routeChoices = [{ id: 'teaching', name: '共同事件', kind: 'event',
			encounters: [], reward: { money: 0, items: {} } }];
		shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(id => id !== 'fantasytutor')
			.map(id => ({ id, floor: 1 }));
		for (const user of [host, guest]) {
			const state = shared.adventure.members[user.id];
			state.team = [createRoguePokemon(set(species, 'Pressure', 40, ['Psychic']), stats(0))];
			state.blessings = normalizeBlessings({ floor, team: state.team, box: [], bag: {}, boosts: stats(0) });
			state.blessings.shards = user === host ? 30 : shards;
		}
		shared.revision++;
		store.updateCoopSession(shared, revision);
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'teaching' });
		});
		return session();
	}
	function agree() { choose(host, 'lesson'); choose(guest, 'lesson'); }
	function pick(user, owner) {
		const target = owner === guest.id ? guest : user;
		const mon = member(target).team[0], moves = fantasyTutorMoves(mon);
		assert(moves.length > 0);
		choose(user, `member:${encodeURIComponent(mon.id)}`, owner);
		return { mon, value: `fantasymove:${moves[0]}`, move: moves[0] };
	}

	it('draws the new event only from floor 81 and requires matching shared choices', () => {
		enter(30, 80);
		assert.notEqual(event(host).id, 'fantasytutor');
	});
	for (const species of ['Kyurem-Original', 'Kyurem-Original-Fantasy']) {
		it(`offers and teaches Fantasy additions to ${species} in a real shared event`, () => {
			enter(30, 81, species); assert.equal(event(host).id, 'fantasytutor');
			assert(!event(host).branchOptions.find(option => option.id === 'lesson').disabled);
			agree();
			const picked = pick(host); choose(host, picked.value);
			assert(member(host).team[0].moveMemory.some(slot => slot.id === picked.move));
			assert.equal(member(host).blessings.shards, 20);
			assert.equal(member(guest).blessings.shards, 30);
		});
	}
	it('shares the opening branch, then teaches and charges each owner only once', () => {
		enter(); assert.equal(event(host).id, 'fantasytutor');
		assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
		choose(host, 'lesson'); choose(guest, 'leave');
		assert.equal(event(host).branchResolved, false);
		assert.equal(member(host).blessings.shards, 30);
		manager.coop.command(guest, { action: 'cancelevent' }); choose(guest, 'lesson');
		assert.equal(event(host).branchResolved, true);
		const personal = [store.get(host.id).run, store.get(guest.id).run];
		const picked = pick(host);
		assert.throws(() => choose(guest, `member:${encodeURIComponent(picked.mon.id)}`), /变化/);
		assert.throws(() => choose(host, 'fantasymove:tackle'), /变化/);
		choose(host, picked.value);
		assert.equal(member(host).blessings.shards, 20);
		assert.equal(member(guest).blessings.shards, 30);
		assert(member(host).team[0].moveMemory.some(slot => slot.id === picked.move));
		assert(!member(guest).team[0].moveMemory.some(slot => slot.id === picked.move));
		const paid = session();
		assert.throws(() => choose(host, picked.value), /变化/);
		assert.deepEqual(session(), paid);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /双方|奖励|事件|完成/);
		manager = new RogueManager(engine);
		assert.equal(event(host).ownComplete, true);
		const other = pick(guest); choose(guest, other.value);
		assert.equal(member(guest).blessings.shards, 20);
		assert(event(host).ownComplete && event(host).partnerComplete);
		assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], personal);
	});
	it('does not open a paid branch when either owner lacks fragments', () => {
		enter(9);
		assert(event(host).branchOptions.find(option => option.id === 'lesson').disabled);
		const before = session();
		assert.throws(() => choose(host, 'lesson'), /不能选择/);
		assert.deepEqual(session(), before);
		choose(host, 'leave'); choose(guest, 'leave');
		assert(event(host).ownComplete && event(host).partnerComplete);
		assert.equal(member(guest).blessings.shards, 9);
	});
	it('allows delegated private choices and revokes that access immediately', () => {
		enter();
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		choose(host, 'lesson');
		const picked = pick(host, guest.id); choose(host, picked.value, guest.id);
		assert.equal(member(guest).blessings.shards, 20);
		assert.equal(member(host).blessings.shards, 30);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.throws(() => choose(host, 'back', guest.id), /权限|本人|移交|目标/);
	});
	it('rolls a failed account write back together with the learned move and fragment payment', () => {
		enter(); agree(); const picked = pick(host);
		const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		const original = store.change.bind(store);
		store.change = (userid, update, command) => original(userid, account => {
			update(account); account.points++;
			throw new Error('injected-account-write-failure');
		}, command);
		try { assert.throws(() => choose(host, picked.value), /injected-account-write-failure/); } finally { store.change = original; }
		assert.deepEqual(session(), before);
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		choose(host, picked.value); assert.equal(member(host).blessings.shards, 20);
	});
	it('checks session revision and account membership before committing associated unlocks', () => {
		const shared = session(), revision = shared.revision, before = store.get(host.id);
		shared.revision++;
		const updates = new Map([[host.id, account => account.points++]]);
		assert.throws(() => store.updateCoopSession(shared, revision - 1, updates), /进度已更新/);
		assert.deepEqual(store.get(host.id), before);
		updates.set('unrelated-account', () => {});
		assert.throws(() => store.updateCoopSession(shared, revision, updates), /成员以外/);
		assert.deepEqual(store.get(host.id), before, 'earlier member update rolls back on a later invalid owner');
		assert.equal(session().revision, revision);
	});
	it('uses the co-op unlock source instead of a paused solo charm/build run, preserving solo restrictions', () => {
		const account = store.get(host.id);
		account.run.difficulty = 'easy'; account.run.startingBuilds = {};
		const mon = set('Bulbasaur', 'Chlorophyll', 5, ['Energy Ball']); mon.nature = 'Modest';
		const before = structuredClone(account);
		recordStarterMoves(account, engine.content, mon);
		recordStarterTraits(account, engine.content, mon, true);
		assert.deepEqual(account, before);
		recordStarterMoves(account, engine.content, mon, { difficulty: 0 });
		recordStarterTraits(account, engine.content, mon, true, { difficulty: 0 });
		assert(account.starterTraits.bulbasaur.moves.includes('energyball'));
		assert(account.starterTraits.bulbasaur.abilities.includes('chlorophyll'));
		assert(account.starterTraits.bulbasaur.natures.includes('modest'));
		assert.deepEqual(account.run, before.run);
	});
});
