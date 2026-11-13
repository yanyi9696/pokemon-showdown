'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { editSpiritBox, mergeSpiritPokemon } = require('../../dist/server/fantasy-rogue/spirits');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op personal storage and star merging', () => {
	let previous, store, engine, manager, host, guest;
	function pokemon(species = 'Bulbasaur', stars = 1) {
		const mon = createRoguePokemon(set(species, 'Overgrow', 50), stats(0), undefined, stars);
		initializeExperience(mon); return mon;
	}
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content()); manager = new RogueManager(engine);
		host = makeUser('Box Host', '127.99.5.1'); guest = makeUser('Box Guest', '127.99.5.2');
		for (const user of [host, guest]) engine.command(user.id, { id: randomUUID(),
			revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'] });
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(session => {
			Object.assign(session.adventure, { spirit: 'zygarde', spiritVersion: 1, floor: 9, phase: 'route-interaction',
				node: { id: 'center', name: '测试中心', kind: 'rest', encounters: [], reward: { money: 0, items: {} } } });
			for (const m of Object.values(session.adventure.members)) {
				m.team = [pokemon(), pokemon()]; m.box = [pokemon()];
			}
		});
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	const get = () => store.coopSessionForUser(host.id);
	const member = (user = host) => get().adventure.members[user.id];
	const view = (user = host) => manager.coop.view(user).session.adventure;
	function change(update) {
		const session = get(), revision = session.revision;
		update(session); session.revision++; store.updateCoopSession(session, revision);
	}
	function request(extra = {}, user = host) {
		const owner = extra.owner === guest.id ? guest : user;
		return { action: 'box', id: randomUUID(), member: member(owner).team[0].id,
			value: 'deposit', quote: view(owner).storage?.quote, ...extra };
	}
	function send(extra = {}, user = host) {
		const cmd = request(extra, user); manager.coop.command(user, cmd); return cmd;
	}
	function merge(extra = {}) {
		const m = member();
		return send({ action: 'merge', member: m.team[0].id, members: [m.team[1].id, m.box[0].id], confirmed: true, ...extra });
	}
	it('stores, withdraws and swaps only personal members without healing HP, PP or status', () => {
		change(s => {
			const mon = s.adventure.members[host.id].team[0];
			mon.hp -= 17; mon.status = 'psn'; mon.pp[0].pp = 1;
			mon.set.item = 'Life Orb'; mon.emblem = 'emblemfire';
		});
		const original = member().team[0], other = member(guest), account = store.get(host.id);
		send();
		let mon = member().box.find(entry => entry.id === original.id);
		for (const key of ['hp', 'maxhp', 'status', 'pp', 'set', 'emblem', 'experience']) assert.deepEqual(mon[key], original[key]);
		const replacement = member().team[0].id;
		send({ value: 'swap', member: original.id, target: replacement });
		assert.equal(member().team[0].id, original.id); assert(member().box.some(entry => entry.id === replacement));
		send({ value: 'withdraw', member: replacement });
		mon = member().team.find(entry => entry.id === original.id);
		assert.equal(mon.hp, original.hp); assert.equal(mon.pp[0].pp, 1); assert.equal(mon.status, 'psn');
		assert.deepEqual(member(guest), other); assert.deepEqual(store.get(host.id), account);
	});
	it('enforces thirty box slots, the party limit and at least one hatched member', () => {
		change(s => { s.adventure.members[host.id].box = Array.from({ length: 30 }, () => pokemon()); });
		assert.throws(() => send(), /至少保留/);
		change(s => { s.adventure.members[host.id].box.pop(); s.adventure.members[host.id].team = [pokemon()]; });
		assert.throws(() => send(), /至少保留/);
		change(s => { s.adventure.members[host.id].team = Array.from({ length: 6 }, () => pokemon()); });
		assert.throws(() => send({ value: 'withdraw', member: member().box[0].id }), /队伍已满/);
		send({ value: 'swap', member: member().box[0].id, target: member().team[0].id });
		assert.equal(member().team.length, 6); assert.equal(member().box.length, 29);
	});
	it('keeps egg identity hidden and prevents swapping out the last hatched partner for an egg', () => {
		change(s => {
			const m = s.adventure.members[host.id]; m.team = [pokemon()];
			m.box[0].egg = { hatch: 15, found: 9 };
		});
		const egg = view().storage.box[0]; assert.equal(egg.species, 'Egg'); assert.deepEqual(egg.ivs, {});
		assert.throws(() => send({ value: 'swap', member: egg.id, target: member().team[0].id }), /已孵化/);
		send({ value: 'withdraw', member: egg.id }); assert.equal(member().team.length, 2);
		assert.throws(() => send(), /至少保留/);
	});
	it('requires current quotes, ignores duplicate requests and rejects replays even after receipt trimming', () => {
		const command = send(), saved = get(); manager = new RogueManager(engine);
		manager.coop.command(host, command); assert.deepEqual(get(), saved);
		const boxed = member().box.find(mon => mon.id === command.member);
		send({ member: boxed.id, value: 'withdraw' });
		change(s => { s.adventure.members[host.id].supplyReceipts = []; });
		assert.throws(() => manager.coop.command(host, command), /已变化/);
		const stale = request(); change(s => { s.adventure.members[host.id].team[0].hp--; });
		assert.throws(() => manager.coop.command(host, stale), /已变化/);
		assert.throws(() => send({ value: 'withdraw', member: member().team[0].id }), /存入、取出/);
	});
	it('checks owner permissions and permits delegated storage only while delegation remains active', () => {
		assert.equal(view().partnerStorage, undefined);
		assert.throws(() => send({ owner: guest.id }), /自己的选择/);
		assert.throws(() => send({ member: member(guest).team[0].id }), /存入、取出/);
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert(view().partnerStorage); const own = member();
		send({ owner: guest.id, member: member(guest).team[0].id });
		assert.equal(member(guest).team.length, 1); assert.deepEqual(member(), own);
		const stale = request({ owner: guest.id, member: member(guest).box[0].id, value: 'withdraw' });
		manager.coop.command(guest, { action: 'delegate', value: 'revoke' });
		assert.throws(() => manager.coop.command(host, stale), /自己的选择/);
	});
	it('blocks battle, settlement, forced chains and pending trades, captures or moves', () => {
		const initial = get();
		for (const modify of [
			s => { s.adventure.phase = 'battle'; }, s => { s.adventure.phase = 'settlement'; },
			s => { s.adventure.node.noHealing = true; s.adventure.encounter = 1; },
			s => { s.adventure.tradeProposal = { id: 'trade' }; },
			s => { s.adventure.members[host.id].pendingCaptures = [{ id: 'pending' }]; },
			s => { s.adventure.members[host.id].pendingMoves = [{ member: member().team[0].id, move: 'growl' }]; },
			s => { s.adventure.members[host.id].coopEvent = { id: 'kubfuscroll', stage: 'battle', activity: { solo: member().team[0].id } }; },
		]) {
			change(s => { s.adventure = structuredClone(initial.adventure); modify(s); });
			const before = get(), command = { action: 'box', id: randomUUID(), member: member().team[0].id, value: 'deposit', quote: 'stale' };
			assert.throws(() => manager.coop.command(host, command)); assert.deepEqual(get(), before);
		}
	});
	it('merges three matching members with explicit consent and preserves the selected identity and damage', () => {
		change(s => {
			const m = s.adventure.members[host.id];
			m.team[0].hp -= 21; m.team[0].status = 'brn'; m.team[0].pp[0].pp = 1;
			m.team[1].set.item = 'Life Orb'; m.box[0].emblem = 'emblemfire';
		});
		const kept = member().team[0], other = member(guest), account = store.get(host.id);
		assert.throws(() => merge({ confirmed: false }), /请确认/);
		const cmd = merge(), mon = member().team[0];
		assert.equal(member().team.length, 1); assert.equal(member().box.length, 0); assert.equal(mon.id, kept.id);
		assert.equal(mon.stars, 2); assert.equal(mon.maxhp, Math.floor(kept.maxhp * 1.2)); assert.equal(mon.maxhp - mon.hp, 21);
		for (const key of ['set', 'status', 'experience']) assert.deepEqual(mon[key], kept[key]);
		assert.equal(mon.pp[0].pp, 1); assert.equal(member().bag.lifeorb, 1); assert.equal(member().bag.emblemfire, 1);
		assert.deepEqual(member(guest), other); assert.deepEqual(store.get(host.id), account);
		const saved = get(); manager.coop.command(host, cmd); assert.deepEqual(get(), saved);
	});
	it('moves the retained boxed adult into an otherwise all-egg party and never revives a fainted member', () => {
		change(s => {
			const m = s.adventure.members[host.id], egg = pokemon();
			egg.egg = { hatch: 15, found: 9 }; m.team.push(egg); m.box[0].hp = 0;
		});
		const m = member(), keep = m.box[0].id;
		merge({ member: keep, members: m.team.slice(0, 2).map(mon => mon.id) });
		assert.equal(member().team.length, 2); assert.equal(member().box.length, 0);
		assert.equal(member().team.find(mon => mon.id === keep).hp, 0);
		// The shared helper also protects the established single-player path.
		const a = pokemon(), b = pokemon(), c = pokemon(), egg = pokemon(); egg.egg = { hatch: 15, found: 9 };
		const run = { spirit: 'zygarde', phase: 'ready', team: [a, b, egg], box: [c], boosts: stats(0), bag: {} };
		mergeSpiritPokemon(run, c.id, [a.id, b.id]); assert(run.team.some(mon => mon.id === c.id));
		assert.throws(() => editSpiritBox(run, c.id), /已孵化/);
	});
	it('rejects mismatched species, forms, stars, duplicate materials, eggs, fusion and stars beyond four', () => {
		const original = get().adventure;
		for (const edit of [
			m => { m.box[0] = pokemon('Ivysaur'); },
			m => { m.team[0] = pokemon('Pikachu'); m.team[1] = pokemon('Pikachu'); m.box[0] = pokemon('Pikachu-Alola'); },
			m => { m.box[0].stars = 2; }, m => { m.team[0].stars = 4; },
			m => { m.box[0].egg = { hatch: 15, found: 9 }; }, m => { m.box[0].fusion = { source: 'test' }; },
		]) {
			change(s => { s.adventure = structuredClone(original); edit(s.adventure.members[host.id]); });
			const saved = get(); assert.throws(() => merge()); assert.deepEqual(get(), saved);
		}
		change(s => { s.adventure = structuredClone(original); });
		assert.throws(() => merge({ members: [member().team[1].id, member().team[1].id] }), /请保留/);
		assert.throws(() => merge({ members: [member().team[1].id, member(guest).box[0].id] }), /同物种/);
	});
	it('allows the independent blessing box without granting Zygarde star merging', () => {
		change(s => {
			s.adventure.spirit = 'xerneas';
			s.adventure.members[host.id].blessings.owned = [{ ...blessing('sololeveling'), floor: 1 }];
		});
		assert(view().storage); assert.equal(view().storage.canMerge, false); assert.equal(view(guest).storage, null);
		send(); assert.throws(() => send({ action: 'merge', confirmed: true }), /不能升星/);
	});
	it('invalidates only the edited player preview and pending route votes', () => {
		change(s => {
			s.adventure.phase = 'battle-selection';
			s.battleSelections = { [host.id]: [member().team[0].id], [guest.id]: [member(guest).team[0].id] };
			s.battlePreviews = structuredClone(s.battleSelections);
			s.adventure.routeExitSelections = { [host.id]: true, [guest.id]: true };
		});
		const other = get().battleSelections[guest.id]; send();
		assert.deepEqual(get().battleSelections[host.id], []); assert.deepEqual(get().battleSelections[guest.id], other);
		assert.equal(get().battlePreviews[host.id], undefined); assert.equal(get().adventure.routeExitSelections[host.id], undefined);
		assert.equal(get().adventure.routeExitSelections[guest.id], true);
	});
	it('rolls back consumed members, returned items and request receipts when saving fails', () => {
		change(s => { s.adventure.members[host.id].box[0].set.item = 'Life Orb'; });
		const before = get(), accounts = [store.get(host.id), store.get(guest.id)], m = member();
		const cmd = request({ action: 'merge', confirmed: true, members: [m.team[1].id, m.box[0].id] });
		store.db.exec("CREATE TEMP TRIGGER box_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'box write failed'); END;");
		try {
			assert.throws(() => manager.coop.command(host, cmd), /box write failed/); assert.deepEqual(get(), before);
			assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		} finally { store.db.exec('DROP TRIGGER box_fail'); }
		manager.coop.command(host, cmd); assert.equal(member().team[0].stars, 2); assert.equal(member().bag.lifeorb, 1);
	});
});
