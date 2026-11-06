'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { experienceAtLevel, rogueSpeciesData } = require('../../dist/sim/fantasy-rogue-rules');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op shopping rewards and safe-phase learning', () => {
	let previous, store, engine, manager, host, guest, serial = 0;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content();
		data.items.push({ id: 'potion', name: '伤药', kind: 'heal', price: 100, shopFloor: 1, amount: 20 });
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data); manager = new RogueManager(engine);
		host = makeUser(`Shopping Host ${++serial}`, `127.0.63.${serial}`);
		guest = makeUser(`Shopping Guest ${serial}`, `127.0.64.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			const a = shared.adventure;
			a.floor = 9; a.phase = 'route-interaction';
			a.node = { id: 'shop', name: '测试中心', kind: 'rest', encounters: [], reward: { money: 0, items: {} } };
			for (const user of [host, guest]) {
				const m = a.members[user.id]; m.money = 50000;
				m.team = [createRoguePokemon(set('Bulbasaur', 'Overgrow', 50), stats(0))];
				initializeExperience(m.team[0]); m.team[0].hp = 5; m.team[0].pp[0].pp = 2;
				const run = { team: m.team, floor: 9 }; normalizeBlessings(run);
				run.blessings.owned = [{ ...blessing('shoppingupgrade'), floor: 1 }]; m.blessings = run.blessings;
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
	function buy(user, count, extra = {}) {
		const command = { action: 'buy', id: randomUUID(), value: 'potion', count, ...extra };
		manager.coop.command(user, command); return command;
	}
	function prepareLearning() {
		change(shared => {
			const mon = createRoguePokemon(set('Bulbasaur', 'Overgrow', 8,
				['Tackle', 'Growl', 'Vine Whip', 'Growth']), stats(0));
			initializeExperience(mon);
			mon.hp = 5; mon.pp[0].pp = 2;
			mon.experience = experienceAtLevel(rogueSpeciesData(mon.set.species).growth, 9) - 1;
			shared.adventure.members[host.id].team = [mon];
		});
	}
	it('persists the personal partial threshold, rewards exactly once and leaves solo runs and the partner unchanged', () => {
		const before = member(host), other = member(guest), solo = store.get(host.id).run;
		buy(host, 29); assert.equal(member(host).team[0].experience, before.team[0].experience);
		assert.deepEqual(member(host).shoppingSpend, { total: 2900, rewards: 0 });
		manager = new RogueManager(engine);
		const command = buy(host, 1), mon = member(host).team[0], growth = rogueSpeciesData(mon.set.species).growth;
		const quarter = Math.floor((experienceAtLevel(growth, 51) - experienceAtLevel(growth, 50)) / 4);
		assert.equal(mon.experience, before.team[0].experience + quarter);
		assert.equal(mon.hp, 5); assert.equal(mon.pp[0].pp, 2);
		assert.equal(member(host).money, before.money - 3000); assert.equal(member(host).bag.potion, 30);
		assert.deepEqual(member(guest), other); assert.deepEqual(store.get(host.id).run, solo);
		const committed = session(), account = store.get(host.id);
		manager.coop.command(host, command); assert.deepEqual(session(), committed); assert.deepEqual(store.get(host.id), account);
		buy(host, 60); assert.equal(member(host).team[0].experience, before.team[0].experience + quarter * 3);
		assert.deepEqual(member(host).shoppingSpend, { total: 9000, rewards: 3 });
	});
	it('uses the real trade price and keeps each owner ledger independent, including delegation', () => {
		change(shared => {
			shared.adventure.node.kind = 'trade';
			shared.adventure.node.trade = { kind: 'balls', purchases: 0,
				stock: [{ ...engine.content.items.find(item => item.id === 'potion'), price: 150, remaining: 40 }] };
		});
		const other = member(guest); buy(host, 20);
		assert.equal(member(host).money, 47000); assert.equal(session().adventure.node.trade.stock[0].remaining, 20);
		assert.deepEqual(member(host).shoppingSpend, { total: 3000, rewards: 1 }); assert.deepEqual(member(guest), other);
		assert.throws(() => buy(host, 1, { owner: guest.id }));
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		buy(host, 20, { owner: guest.id }); assert.equal(member(guest).shoppingSpend.total, 3000);
		assert.equal(member(host).shoppingSpend.total, 3000);
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		const committed = session(); assert.throws(() => buy(host, 1, { owner: guest.id })); assert.deepEqual(session(), committed);
	});
	it('shares the same personal ledger with training camps and does not count healing or rejected purchases', () => {
		change(shared => { shared.adventure.members[host.id].shoppingSpend = { total: 2850, rewards: 0 }; });
		manager.coop.command(host, { action: 'heal' }); assert.equal(member(host).shoppingSpend.total, 2850);
		const before = session(); assert.throws(() => buy(host, 999)); assert.deepEqual(session(), before);
		change(shared => {
			shared.adventure.floor = 61; shared.adventure.node.kind = 'trade';
			shared.adventure.node.trade = { kind: 'growth', stock: [], purchases: 0 };
		});
		const original = member(host), command = { action: 'buygrowth', id: randomUUID(),
			visit: view(host).trainingCamp.visit, value: 'junior', trainingMembers: [original.team[0].id], trainingStats: ['atk'] };
		manager.coop.command(host, command); assert.equal(member(host).money, original.money - 150);
		assert.deepEqual(member(host).shoppingSpend, { total: 3000, rewards: 1 });
		assert(member(host).team[0].experience > original.team[0].experience);
		assert.equal(member(host).team[0].campTraining.atk, 300);
		const committed = session(); manager.coop.command(host, command); assert.deepEqual(session(), committed);
		assert(!member(guest).shoppingSpend);
	});
	it('does not count unblessed purchases or level capped, fixed-level and egg members', () => {
		change(shared => {
			const m = shared.adventure.members[host.id];
			m.team = [100, 50, 5].map(level => createRoguePokemon(set('Bulbasaur', 'Overgrow', level), stats(0)));
			m.team.forEach(initializeExperience); m.team[1].fixedLevel = true;
			m.team[2].egg = { species: 'Bulbasaur', remaining: 10 };
			shared.adventure.members[guest.id].blessings.owned = [];
		});
		const before = member(host).team.map(mon => mon.experience), other = member(guest).team[0].experience;
		buy(host, 30); assert.deepEqual(member(host).team.map(mon => mon.experience), before);
		buy(guest, 30); assert.equal(member(guest).team[0].experience, other); assert(!member(guest).shoppingSpend);
	});
	it('finishes shopping level-up learning before route progression and preserves rewards across refresh and failure', () => {
		prepareLearning(); const solo = store.get(host.id).run, command = buy(host, 30);
		assert.equal(member(host).team[0].set.level, 9); assert.equal(view(host).pendingMove.move, 'leechseed');
		assert.throws(() => manager.coop.command(guest, { action: 'finishroute' }), /待学习/);
		assert.throws(() => buy(host, 1), /待学习/);
		manager.coop.command(host, command);
		manager = new RogueManager(engine); assert.equal(view(host).pendingMove.move, 'leechseed');
		const learned = { action: 'learn', member: member(host).team[0].id, value: '0', move: 'leechseed' };
		manager.coop.command(host, learned);
		assert.equal(member(host).team[0].set.moves[0], 'leechseed'); assert.equal(view(host).pendingMove, null);
		assert(store.get(host.id).starterTraits.bulbasaur.moves.includes('leechseed'));
		assert.deepEqual(store.get(host.id).run, solo);
		assert.throws(() => manager.coop.command(host, learned), /待学习/);
		change(shared => { shared.adventure.members[host.id].pendingMoves = [{ member: learned.member, move: 'razorleaf' }]; });
		assert.throws(() => manager.coop.command(host, learned), /已变化/);
		assert.equal(view(host).pendingMove.move, 'razorleaf');
		manager.coop.command(host, { ...learned, move: 'razorleaf', value: 'skip' });
		manager.coop.command(host, { action: 'heal' });
		assert.deepEqual(member(host).shoppingSpend, { total: 3000, rewards: 1 });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 10);
	});
	it('permits queued learning only in safe phases and honors revocable delegated control', () => {
		for (const phase of ['area-selection', 'battle-selection', 'route-interaction', 'settlement', 'blessing-selection', 'blessing-reward']) {
			change(shared => {
				shared.adventure.phase = phase;
				shared.adventure.members[guest.id].pendingMoves = [{ member: member(guest).team[0].id, move: 'leechseed' }];
			});
			const command = { action: 'learn', member: member(guest).team[0].id, owner: guest.id, value: 'skip' };
			assert.throws(() => manager.coop.command(host, command));
			manager.coop.command(guest, { action: 'delegate', value: 'partner' });
			manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
			assert.throws(() => manager.coop.command(host, command));
			manager.coop.command(guest, { action: 'delegate', value: 'partner' });
			manager.coop.command(host, command); assert.equal(view(guest).pendingMove, null);
			manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		}
		for (const phase of ['battle-starting', 'battle', 'complete']) {
			change(shared => {
				shared.adventure.phase = phase;
				shared.adventure.members[host.id].pendingMoves = [{ member: member(host).team[0].id, move: 'leechseed' }];
			});
			assert.throws(() => manager.coop.command(host, { action: 'learn', member: member(host).team[0].id, value: 'skip' }));
		}
	});
	it('rolls back payment, stock, XP, receipts and account unlocks if the session SQL write fails', () => {
		prepareLearning();
		const before = session(), account = store.get(host.id), messages = [], send = guest.send;
		const command = { action: 'buy', id: randomUUID(), value: 'potion', count: 30 };
		guest.send = message => messages.push(message);
		store.db.exec("CREATE TEMP TRIGGER shopping_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'shopping write failed'); END;");
		try {
			assert.throws(() => manager.coop.command(host, command), /shopping write failed/);
			assert.deepEqual(session(), before); assert.deepEqual(store.get(host.id), account); assert.equal(messages.length, 0);
		} finally { store.db.exec('DROP TRIGGER shopping_fail'); guest.send = send; }
		manager.coop.command(host, command); assert.equal(member(host).shoppingSpend.rewards, 1);
		assert.equal(member(host).money, 47000); assert.equal(view(host).pendingMove.move, 'leechseed');
	});
});
