'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { content, set } = require('../fixtures/fantasy-rogue');
const stats = value => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

describe('Fantasy Rogue co-op personal training camps', () => {
	let previous, store, engine, manager, host, guest, serial = 0;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content()); manager = new RogueManager(engine);
		host = makeUser(`Camp Host ${++serial}`, `127.0.61.${serial}`);
		guest = makeUser(`Camp Guest ${serial}`, `127.0.62.${serial}`);
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
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure;
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function route(floor = 61) {
		change(shared => {
			shared.adventure.floor = floor;
			shared.adventure.routeChoices = [{ id: 'camp', name: '训练营', kind: 'trade',
				trade: { kind: 'growth', stock: [], purchases: 0 }, encounters: [], reward: { money: 0, items: {} } }];
			for (const user of [host, guest]) {
				const state = shared.adventure.members[user.id]; state.money = 10000;
				state.team.push(createRoguePokemon(set('Squirtle', 'Torrent', 5), stats(0)));
				for (const mon of state.team) { mon.hp = 5; mon.pp[0].pp = 2; }
			}
		});
	}
	function enter(floor = 61) {
		route(floor);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'camp' });
	}
	function request(user, extra = {}) {
		return { action: 'buygrowth', id: randomUUID(), visit: view(user).trainingCamp?.visit,
			value: 'junior', trainingMembers: [member(user).team[0].id], trainingStats: ['atk'], ...extra };
	}
	it('keeps the existing level thresholds and price tiers without requiring stock items', () => {
		route(50); assert.equal(view(host).routeChoices[0].available, false);
		assert.throws(() => manager.coop.command(host, { action: 'selectarea', value: 'camp' }), /尚未接入/);
		for (const [floor, junior, master] of [[51, 150, 450], [99, 150, 450], [100, 200, 590], [150, 240, 720]]) {
			change(shared => {
				shared.adventure.floor = floor; shared.adventure.node = shared.adventure.routeChoices[0];
				shared.adventure.phase = 'route-interaction';
			});
			const quote = view(host).trainingCamp;
			assert.equal(quote.offers[0].price, junior); assert.equal(quote.offers[2].price, master);
			assert.deepEqual(quote.offers.map(offer => offer.amount), [300, 800, 1500]);
		}
	});
	it('spends only the selected owner wallet and keeps the partner camp opportunity', () => {
		enter(); const own = member(host), other = member(guest), solo = [store.get(host.id), store.get(guest.id)];
		const command = request(host, { trainingMembers: own.team.map(mon => mon.id), trainingStats: ['atk', 'spe'] });
		manager.coop.command(host, command);
		assert.equal(member(host).money, own.money - 600); assert.deepEqual(member(guest), other);
		assert(member(host).team.every(mon => mon.campTraining.atk === 300 && mon.campTraining.spe === 300));
		assert(member(host).team.every(mon => mon.hp === 5 && mon.pp[0].pp === 2));
		assert(view(host).trainingCamp.offers.every(offer => !offer.remaining));
		assert(view(guest).trainingCamp.offers.every(offer => offer.remaining === 1));
		const saved = session(); manager.coop.command(host, command); assert.deepEqual(session(), saved);
		assert.throws(() => manager.coop.command(host, request(host)), /已完成/);
		manager.coop.command(guest, request(guest, { value: 'master', trainingStats: ['def'] }));
		assert.equal(member(guest).money, other.money - 450); assert.equal(member(guest).team[0].campTraining.def, 1500);
		assert.deepEqual(store.get(host.id), solo[0]); assert.deepEqual(store.get(guest.id), solo[1]);
		assert.equal(session().adventure.node.trade.purchases, 0);
	});
	it('applies the existing cap, preserves wounds and PP, and resets only the acting owner exit vote', () => {
		enter(); change(shared => {
			shared.adventure.members[host.id].team[0].campTraining = { atk: 5900 };
			shared.adventure.routeExitSelections = { [host.id]: true };
		});
		manager.coop.command(host, request(host, { value: 'master' }));
		assert.equal(member(host).team[0].campTraining.atk, 6000); assert.equal(member(host).team[0].hp, 5);
		assert.equal(member(host).team[0].pp[0].pp, 2); assert.equal(view(host).routeExitSelection, false);
		manager = new RogueManager(engine); assert(view(host).trainingCamp.offers.every(offer => !offer.remaining));
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 62);
	});
	it('rejects stale quotes, foreign members, invalid stats, duplicate targets and unaffordable training atomically', () => {
		enter(); const before = session();
		const ownId = member(host).team[0].id, foreignId = member(guest).team[0].id;
		for (const extra of [{ visit: 'old-visit' }, { trainingMembers: [foreignId] }, { trainingMembers: [ownId, ownId] },
			{ trainingStats: ['hp'] }, { trainingStats: ['atk', 'atk'] }, { trainingMembers: [] }, { trainingStats: [] }]) {
			assert.throws(() => manager.coop.command(host, request(host, extra))); assert.deepEqual(session(), before);
		}
		change(shared => { shared.adventure.members[host.id].money = 149; });
		const poor = session(); assert.throws(() => manager.coop.command(host, request(host)), /余额不足/);
		assert.deepEqual(session(), poor);
	});
	it('rejects eggs, fusion members and capped stats without consuming the camp visit', () => {
		enter(); change(shared => {
			const team = shared.adventure.members[host.id].team;
			team[0].egg = { species: 'Bulbasaur', remaining: 10 }; team[1].fusion = { first: {}, second: {} };
		});
		assert.equal(view(host).trainingCamp.members.length, 0);
		for (const mon of member(host).team) assert.throws(() => manager.coop.command(host,
			request(host, { trainingMembers: [mon.id] })), /已孵化|融合/);
		change(shared => {
			const mon = shared.adventure.members[host.id].team[0]; delete mon.egg; mon.campTraining = { atk: 6000 };
		});
		assert.throws(() => manager.coop.command(host, request(host)), /上限/);
		assert(!member(host).campVisits?.length);
	});
	it('supports delegated owner selection but rejects it immediately after revocation', () => {
		enter(); const own = member(host);
		const delegated = request(host, { owner: guest.id, trainingMembers: [member(guest).team[0].id] });
		assert.throws(() => manager.coop.command(host, delegated), /移交|本人|权限|自己|指定/);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert(view(host).partnerTrainingCamp);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.equal(view(host).partnerTrainingCamp, null);
		assert.throws(() => manager.coop.command(host, delegated));
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		manager.coop.command(host, delegated);
		assert.deepEqual(member(host), own); assert.equal(member(guest).money, 9850);
	});
	it('does not persist calculated costs or training when the authoritative session write rejects', () => {
		enter(); const before = session(), update = store.updateCoopSession;
		try {
			store.updateCoopSession = () => { throw new Error('camp CAS failed'); };
			assert.throws(() => manager.coop.command(host, request(host)), /camp CAS failed/);
		} finally { store.updateCoopSession = update; }
		assert.deepEqual(session(), before);
	});
});
