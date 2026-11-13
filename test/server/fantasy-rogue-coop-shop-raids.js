'use strict';
const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue shared Persian shop raids', () => {
	let previous, store, engine, manager, host, guest, battle;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content();
		data.items.push({ id: 'potion', name: '伤药', kind: 'heal', price: 100, amount: 20, shopFloor: 1 });
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue, partner) {
			battle = { user, trainer, team, rogue, partner }; return { roomid: 'battle-shared-rocket' };
		} }));
		host = makeUser('Raid Host', '127.99.3.1'); guest = makeUser('Raid Guest', '127.99.3.2');
		for (const user of [host, guest]) engine.command(user.id, { id: crypto.randomUUID(),
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
	const view = user => manager.coop.view(user).session.adventure;
	function change(update) {
		const session = get(), revision = session.revision; update(session);
		session.revision++; store.updateCoopSession(session, revision);
	}
	function open(kind = 'rest', floor = 9, roll = 0) {
		const node = { id: 'shop', name: '测试商店', kind: kind === 'rest' ? 'rest' : 'trade', encounters: [],
			reward: { money: 0, items: {} }, ...(kind === 'rest' ? {} : { trade: { kind, purchases: 0,
				stock: [{ ...engine.content.items.find(item => item.id === 'potion'), remaining: 5 }] } }) };
		engine.content.floors[floor] = [node];
		const original = crypto.randomInt; crypto.randomInt = max => max === 100 ? roll : 0;
		try {
			change(session => {
				Object.assign(session.adventure, { spirit: 'persian', spiritVersion: 1, floor, phase: 'area-selection' });
				manager.coop.prepareRouteChoices(session.adventure);
			});
		} finally { crypto.randomInt = original; }
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'shop' });
	}
	function fight(won, escape = false) {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [view(user).team[0].id] });
		assert.equal(battle.partner.user.id, guest.id); assert.equal(battle.rogue.state.catchable, false);
		const state = battle.rogue.state;
		const result = { encounterId: state.encounterId, won, turns: 1, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			...(escape ? { coopExit: 'retreat' } : {}) };
		for (const mon of [...result.team, ...result.partnerTeam]) {
			mon.hp = Math.max(1, mon.hp - 1); mon.pp[0].pp = Math.max(0, mon.pp[0].pp - 1);
		}
		battle.rogue.onResult(result); return { result, callback: battle.rogue.onResult };
	}
	function continueBoth() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
	}
	for (const [kind, floor, bounty] of [['rest', 9, 3000], ['balls', 49, 6000],
		['mushroom', 89, 10000], ['auction', 129, 16000], ['growth', 169, 25000]]) {
		it(`unlocks the same ${kind} shop after victory and pays each owner ${bounty} once`, () => {
			open(kind, floor); assert.equal(view(host).phase, 'battle-selection');
			assert.equal(view(host).shopRaid.reward, bounty); assert.deepEqual(view(host).shopRaid, view(guest).shopRaid);
			assert(!get().adventure.coopAuction); assert(!get().adventure.node.event);
			assert.throws(() => manager.coop.command(host, { action: 'buy', id: crypto.randomUUID(), value: 'potion' }));
			assert.throws(() => manager.coop.command(host, { action: 'finishroute' }));
			const money = [view(host).money, view(guest).money], solo = store.get(host.id).run;
			const { result, callback } = fight(true);
			const settled = get(); callback(result); assert.deepEqual(get(), settled);
			continueBoth();
			assert.equal(view(host).floor, floor); assert.equal(view(host).phase, 'route-interaction');
			assert(view(host).shopRaid.cleared); assert.equal(get().adventure.node.encounters.length, 0);
			for (const [i, user] of [host, guest].entries()) assert.equal(view(user).money, money[i] + bounty);
			assert.deepEqual(store.get(host.id).run, solo);
			if (kind === 'auction') assert(get().adventure.coopAuction);
			if (kind === 'mushroom') assert.equal(get().adventure.node.event.id, 'mushroomcollector');
			const reopened = get();
			manager.coop.command(host, { action: 'refresh' }); manager.coop.command(guest, { action: 'refresh' });
			assert.deepEqual(get(), reopened);
			assert.throws(() => manager.coop.command(host, { action: 'continuebattle' })); assert.deepEqual(get(), reopened);
			if (kind === 'rest') {
				manager.coop.command(host, { action: 'buy', id: crypto.randomUUID(), value: 'potion' });
				assert.equal(view(host).money, money[0] + bounty - 100);
				for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
				assert.equal(view(host).floor, floor + 1);
			}
		});
	}
	it('keeps the original raid across defeat, retreat and retry without opening the shop or paying early', () => {
		open(); const opponents = structuredClone(get().adventure.node.encounters), balance = view(host).money;
		fight(false);
		assert.equal(view(host).money, balance); assert(!view(host).shopRaid.cleared);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		assert.deepEqual(get().adventure.node.encounters, opponents);
		fight(false, true);
		assert.equal(view(host).phase, 'settlement'); assert.equal(view(host).money, balance);
		assert(view(host).team[0].hp < view(host).team[0].maxhp);
		assert.deepEqual(get().adventure.node.encounters, opponents);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		fight(true); continueBoth(); assert.equal(view(host).money, balance + 3000);
	});
	it('atomically restores the pending continuation and both wallets if opening the shop fails', () => {
		open(); fight(true); manager.coop.command(host, { action: 'continuebattle' });
		const before = get(), accounts = [host, guest].map(user => store.get(user.id));
		store.db.exec("CREATE TEMP TRIGGER raid_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'raid write failed'); END;");
		try {
			assert.throws(() => manager.coop.command(guest, { action: 'continuebattle' }), /raid write failed/);
			assert.deepEqual(get(), before);
			for (const [i, user] of [host, guest].entries()) assert.deepEqual(store.get(user.id), accounts[i]);
		} finally { store.db.exec('DROP TRIGGER raid_fail'); }
		manager.coop.command(guest, { action: 'continuebattle' }); assert(view(host).shopRaid.cleared);
		for (const user of [host, guest]) assert.equal(view(user).money, before.adventure.members[user.id].money + 3000);
	});
	it('keeps the 15 percent boundary and does not turn an unraided shop into a battle on refresh', () => {
		open('rest', 9, 15); assert.equal(view(host).phase, 'route-interaction'); assert.equal(view(host).shopRaid, null);
		const saved = get(); manager.coop.command(host, { action: 'refresh' }); assert.deepEqual(get(), saved);
		open('rest', 9, 14); assert.equal(view(host).phase, 'battle-selection'); assert(view(host).shopRaid);
	});
});
