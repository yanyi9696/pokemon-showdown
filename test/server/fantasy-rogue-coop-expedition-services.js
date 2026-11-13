'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { chooseEvent } = require('../../dist/server/fantasy-rogue/events');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { affectionThemeGift } = require('../../dist/server/fantasy-rogue/affection-gifts');
const { content, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op fossil and snack services', () => {
	let previous, store, engine, manager, host, guest, serial = 0;
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(), preview = createPreviewContent(); fixture.blessings = true;
		fixture.items = [...preview.items, ...fixture.items.filter(item => !preview.items.some(entry => entry.id === item.id))];
		for (const id of ['omanyte', 'kabuto', 'dracovish']) fixture.unlocks[id] = preview.unlocks[id];
		fixture.starters.push(...preview.starters.filter(entry => ['omanyte', 'kabuto', 'dracovish'].includes(entry.id)));
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true }));
		host = makeUser(`Service Host ${++serial}`, `127.0.89.${serial}`);
		guest = makeUser(`Service Guest ${serial}`, `127.0.90.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			const round = { floor: 1, tier: 'silver', remaining: 1, familiesSeen: [], idsSeen: ['swapstats'],
				options: [{ id: 'swapstats', tier: 'silver', refreshes: 1, chosen: false }] };
			shared.adventure.coopBlessingRound = round;
			for (const user of [host, guest]) {
				const own = shared.adventure.members[user.id];
				own.blessings.round = structuredClone(round); own.money = 1000; own.bag = {};
			}
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 0 });
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure;
	const event = () => view(host).coopEvent;
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(id, floor = 70) {
		change(shared => {
			shared.adventure.floor = floor; shared.adventure.phase = 'area-selection';
			shared.adventure.routeChoices = [{ id: 'service-route', kind: 'event', name: '共同事件',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id)
				.map(other => ({ id: other, floor: 1 }));
			shared.areaSelections = { [host.id]: null, [guest.id]: null };
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'service-route' });
		});
		return event();
	}
	function choose(user, value, visit = event().key) {
		return manager.coop.command(user, { action: 'eventchoice', value, visit });
	}
	function agree(value) {
		const key = event().key; choose(host, value, key); choose(guest, value, key);
	}
	function fossil(user, bag = { helixfossil: 1 }) {
		change(shared => Object.assign(shared.adventure.members[user.id].bag, bag));
	}
	const fossilChoice = user => event().branchOptions.find(option => option.id.startsWith(`restore:${user.id}:`));
	const snackChoice = user => `snackmon:${user.id}:${member(user).team[0].id}`;
	function admit(user, value = 'join', confirmed = false) {
		const pending = member(user).blessings.pending[0];
		return manager.coop.command(user, { action: 'blessingreward', member: pending.id, value, confirmed });
	}
	function companion(user, score = 0) {
		change(shared => {
			const own = shared.adventure.members[user.id];
			own.blessings.companions = [{ id: 'olivia', preferences: 0 }];
			own.trainerBonds = { olivia: { score, pending: [], gifts: score >= 50 ? [50] : [] } };
		});
	}
	function reply(value = 'thanks') {
		const visit = view(host).coopAffection.visit;
		for (const user of [host, guest]) manager.coop.command(user, { action: 'affection', value, visit });
	}

	it('admits a guest-only complete fossil recipe without merging the bags or changing read-only views', () => {
		fossil(guest, { fossilizedfish: 1, fossilizeddrake: 1, fossilizeddino: 2 });
		assert.equal(enter('fossillab').id, 'fossillab');
		const option = fossilChoice(guest); assert(option); assert(!fossilChoice(host));
		assert.deepEqual(option.items, ['fossilizedfish', 'fossilizeddrake']); assert.equal(option.pokemon, 'Dracovish');
		assert.equal(option.seat, 2); assert(option.text.includes('2P'));
		const saved = session(); assert.deepEqual(event().branchOptions, view(guest).coopEvent.branchOptions);
		manager = new RogueManager(engine); manager.coop.command(guest, { action: 'refresh' });
		assert.deepEqual(session(), saved);
	});
	it('retains floor gating and never qualifies fossils split between the two players', () => {
		fossil(host, { fossilizedbird: 1 }); fossil(guest, { fossilizeddrake: 1 });
		assert.notEqual(enter('fossillab').id, 'fossillab');
		const shared = session(), first = manager.coop.previewBlessingRun(shared.adventure, host.id);
		const second = manager.coop.previewBlessingRun(shared.adventure, guest.id);
		assert.throws(() => chooseEvent(first, () => 0, new Set(['fossillab']), [second]), /没有可用事件/);
		second.bag.fossilizedbird = 1;
		assert.equal(chooseEvent(first, () => 0, new Set(['fossillab']), [second]), 'fossillab');
		first.floor = 30; second.floor = 30;
		assert.throws(() => chooseEvent(first, () => 0, new Set(['fossillab']), [second]), /没有可用事件/);
	});
	it('consumes the named guest recipe once, preserves unmatched pieces, and saves only the guest discovery', () => {
		fossil(guest, { fossilizedfish: 1, fossilizeddrake: 1, fossilizeddino: 2 }); enter('fossillab');
		const solo = [store.get(host.id).run, store.get(guest.id).run], key = event().key;
		const choice = fossilChoice(guest).id; agree(choice);
		assert.equal(member(host).blessings.pending.length, 0);
		const pending = member(guest).blessings.pending[0];
		assert.equal(pending.pokemon.set.species, 'Dracovish'); assert.equal(pending.pokemon.set.level, 35);
		assert.equal(member(guest).bag.fossilizedfish, 0); assert.equal(member(guest).bag.fossilizeddrake, 0);
		assert.equal(member(guest).bag.fossilizeddino, 2); assert.equal(member(guest).money, 1000);
		assert.equal(store.get(guest.id).captures.dracovish, 1); assert(!store.get(host.id).captures.dracovish);
		assert(store.get(guest.id).unlocked.includes('dracovish')); admit(guest);
		assert.equal(member(guest).team[1].set.species, 'Dracovish'); assert.equal(member(host).team.length, 1);
		assert.equal(store.get(guest.id).captures.dracovish, 1);
		const saved = session(); assert.throws(() => choose(host, choice, key), /服务已变化/); assert.deepEqual(session(), saved);
		assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], solo);
	});
	it('rejects a stale fossil recipe rather than silently reviving the next available species', () => {
		fossil(host, { helixfossil: 1, domefossil: 1 }); enter('fossillab');
		const old = fossilChoice(host).id; choose(host, old);
		change(shared => { shared.adventure.members[host.id].bag.helixfossil = 0; });
		const saved = session(); assert.throws(() => choose(guest, old), /共同分支/); assert.deepEqual(session(), saved);
		const next = fossilChoice(host).id; assert.notEqual(next, old); agree(next);
		assert.equal(member(host).blessings.pending[0].pokemon.set.species, 'Kabuto');
		assert.equal(store.get(host.id).captures.kabuto, 1); assert(!store.get(host.id).captures.omanyte);
	});
	it('supports disagreements, cancellation, and a no-cost exit even after the last recipe disappears', () => {
		fossil(host); fossil(guest, { domefossil: 1 }); enter('fossillab');
		choose(host, fossilChoice(host).id); choose(guest, fossilChoice(guest).id);
		assert(!event().branchResolved); assert.equal(member(host).bag.helixfossil, 1);
		manager.coop.command(host, { action: 'cancelevent', visit: event().key }); assert.equal(event().ownChoice, null);
		change(shared => { for (const user of [host, guest]) shared.adventure.members[user.id].bag = {}; });
		assert.deepEqual(event().branchOptions.map(option => option.id), ['leave']); agree('leave');
		assert(event().ownComplete && event().partnerComplete); assert.equal(member(host).money, 1000);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 71);
	});
	for (const accept of [true, false]) it(`handles a full-party fossil ${accept ? 'admission' : 'decline'} without duplicating discovery`, () => {
		change(shared => {
			const own = shared.adventure.members[host.id];
			for (let i = 0; i < 5; i++) own.team.push({ ...structuredClone(own.team[0]), id: randomUUID() });
		});
		fossil(host); enter('fossillab'); agree(fossilChoice(host).id);
		assert.throws(() => manager.coop.command(guest, { action: 'finishroute' }), /当前|步骤/);
		if (accept) {
			const target = member(host).team[1].id, saved = session();
			assert.throws(() => admit(host, target), /确认放生/); assert.deepEqual(session(), saved);
			admit(host, target, true); assert(member(host).team.some(mon => mon.set.species === 'Omanyte'));
		} else admit(host, 'release');
		assert.equal(member(host).team.length, 6); assert.equal(store.get(host.id).captures.omanyte, 1);
		assert.equal(member(guest).team.length, 1); assert(event().ownComplete && event().partnerComplete);
	});
	for (const hp of [0, 1]) it(`applies the original snack friendship and healing to its paying owner at HP ${hp}`, () => {
		change(shared => {
			const own = shared.adventure.members[guest.id]; own.team[0].hp = hp; own.team[0].set.happiness = 240;
			own.shoppingSpend = { total: 0, rewards: 0 };
		});
		assert.equal(enter('snacks').id, 'snacks'); const before = member(host);
		const option = event().branchOptions.find(entry => entry.id === snackChoice(guest));
		assert.equal(option.price, 290); assert.equal(option.service, 'snack'); agree(option.id);
		const own = member(guest); assert.equal(own.money, 710); assert.equal(own.team[0].set.happiness, 255);
		assert.equal(own.team[0].hp, hp ? Math.min(own.team[0].maxhp, hp + Math.max(1, Math.floor(own.team[0].maxhp * 0.15))) : 0);
		assert.equal(member(host).money, before.money); assert.deepEqual(member(host).team, before.team);
		assert.deepEqual(member(host).bag, before.bag); assert.equal(own.shoppingSpend.total, 0);
		assert.equal(own.coopEventReward.money, -290); assert.equal(member(host).coopEventReward, undefined);
	});
	it('only disables the unaffordable payer and refuses a forged cheaper, foreign, or stale target', () => {
		change(shared => { shared.adventure.members[host.id].money = 5; }); enter('snacks');
		assert(event().branchOptions.find(option => option.id === snackChoice(host)).disabled);
		assert(!event().branchOptions.find(option => option.id === snackChoice(guest)).disabled);
		const key = event().key;
		for (const choice of [snackChoice(host), `snackmon:${host.id}:${member(guest).team[0].id}`, 'snackmon:unknown:target']) {
			assert.throws(() => choose(host, choice), /共同分支/);
		}
		const chosen = snackChoice(guest); choose(host, chosen);
		change(shared => { shared.adventure.members[guest.id].money = 1; });
		assert.throws(() => choose(guest, chosen), /共同分支/);
		change(shared => {
			const own = shared.adventure.members[guest.id]; own.money = 1000; own.team[0].id = randomUUID();
		});
		assert.throws(() => choose(guest, chosen, key), /共同分支/); agree('leave');
		assert.equal(member(guest).money, 1000); assert.equal(member(host).money, 5);
	});
	it('excludes eggs and permanently lost companions while retaining ordinary fainted partners', () => {
		change(shared => {
			const own = shared.adventure.members[host.id]; own.team[0].hp = 0;
			own.team.push({ ...structuredClone(own.team[0]), id: 'dead-partner', nuzlockeDead: true });
			own.team.push({ ...structuredClone(own.team[0]), id: 'egg-partner', egg: { found: 1, hatch: 99 } });
		});
		enter('snacks'); const options = event().branchOptions.map(option => option.id);
		assert(options.includes(snackChoice(host))); assert(!options.some(id => /dead-partner|egg-partner/.test(id)));
		const before = session(); assert.throws(() => choose(host, `snackmon:${host.id}:dead-partner`), /共同分支/);
		assert.deepEqual(session(), before);
	});
	it('stores the paying companion affection and gift once, then requires a shared milestone response', () => {
		companion(host, 47); companion(guest, 5); enter('snacks');
		const key = event().key, choice = `snacktrainer:${host.id}:olivia`;
		const solo = [store.get(host.id).run, store.get(guest.id).run]; agree(choice);
		assert.equal(member(host).trainerBonds.olivia.score, 50); assert.equal(member(guest).trainerBonds.olivia.score, 5);
		assert.equal(member(host).bag.superpotion, 1); assert(!member(guest).bag.superpotion);
		assert.equal(member(host).bag[affectionThemeGift('olivia', 50).id], 1);
		assert(member(host).affectionClaims.some(receipt => receipt.startsWith('olivia:snack:')));
		assert.equal(view(host).coopAffection.owner, host.id); reply();
		const saved = session(); assert.throws(() => choose(guest, choice, key), /服务已变化/); assert.deepEqual(session(), saved);
		manager = new RogueManager(engine); assert.equal(view(host).trainerBonds[0].score, 50);
		assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], solo);
	});
	it('resolves a 100-point snack reward, shared reply and event exit in the right order', () => {
		companion(guest, 99); enter('snacks'); agree(`snacktrainer:${guest.id}:olivia`);
		assert.equal(session().adventure.phase, 'blessing-reward'); assert(!view(host).coopAffection);
		assert.equal(member(guest).bag.rarecandy, 2); assert(!member(host).bag.rarecandy);
		const pending = member(guest).blessings.pending[0];
		admit(guest, pending.options[0]); assert.equal(session().adventure.phase, 'route-interaction');
		reply('friends'); assert.equal(member(guest).trainerBonds.olivia.relationship, 'bestfriend');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 71); assert.equal(member(guest).bag.rarecandy, 2);
	});
	it('revalidates companion presence and requires fresh votes after delegation is revoked', () => {
		companion(host); enter('snacks'); const choice = `snacktrainer:${host.id}:olivia`;
		choose(host, choice);
		change(shared => { shared.adventure.members[host.id].blessings.companions[0].away = true; });
		assert.throws(() => choose(guest, choice), /共同分支/);
		change(shared => { shared.adventure.members[host.id].blessings.companions[0].away = false; });
		manager.coop.command(host, { action: 'delegate', value: 'partner' }); assert.equal(event().ownChoice, null);
		assert.throws(() => choose(host, choice), /移交/);
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		choose(guest, choice); assert(!event().branchResolved); assert.equal(member(host).money, 1000);
		choose(host, choice); assert.equal(member(host).money, 710); assert.equal(member(guest).money, 1000);
	});
	it('lets the delegated controller purchase for either owner and preserves the proposal through pause/resume', () => {
		enter('snacks'); const choice = snackChoice(guest), key = event().key;
		choose(host, choice);
		manager.coop.command(guest, { action: 'leave', id: session().id });
		manager = new RogueManager(engine);
		manager.coop.command(guest, { action: 'resume', id: session().id });
		assert.equal(event().key, key); assert.equal(event().ownChoice, choice);
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		choose(guest, choice); assert.equal(member(guest).money, 710); assert.equal(member(host).money, 1000);
	});
	for (const id of ['fossillab', 'snacks']) it(`requires the current visit for ${id} choices and cancellation`, () => {
		if (id === 'fossillab') fossil(host); enter(id);
		const saved = session();
		assert.throws(() => manager.coop.command(host, { action: 'eventchoice', value: 'leave' }), /服务已变化/);
		assert.throws(() => manager.coop.command(host, { action: 'cancelevent', visit: 'old' }), /服务已变化/);
		assert.deepEqual(session(), saved);
	});
	for (const id of ['fossillab', 'snacks']) it(`rolls back ${id} costs, permanent unlocks and member effects on a session write failure`, () => {
		if (id === 'fossillab') fossil(guest);
		else companion(guest, 47);
		enter(id); const choice = id === 'fossillab' ? fossilChoice(guest).id : `snacktrainer:${guest.id}:olivia`;
		choose(host, choice); const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
		store.db.exec("CREATE TEMP TRIGGER service_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'service write failure'); END;");
		try {
			assert.throws(() => choose(guest, choice), /service write failure/);
			assert.deepEqual(session(), saved); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		} finally {
			store.db.exec('DROP TRIGGER service_fail');
		}
		choose(guest, choice);
		if (id === 'fossillab') assert.equal(store.get(guest.id).captures.omanyte, 1);
		else assert.equal(member(guest).trainerBonds.olivia.score, 50);
	});
	it('rolls back a fossil account failure after discovery has been written and allows one safe retry', () => {
		fossil(host); enter('fossillab'); const choice = fossilChoice(host).id;
		choose(host, choice);
		const saved = session(), account = store.get(host.id), original = store.change;
		store.change = function (userid, ...args) {
			const result = original.call(this, userid, ...args);
			if (userid === host.id) throw new Error('service account failure');
			return result;
		};
		try {
			assert.throws(() => choose(guest, choice), /service account failure/);
			assert.deepEqual(session(), saved); assert.deepEqual(store.get(host.id), account);
		} finally {
			store.change = original;
		}
		choose(guest, choice); assert.equal(store.get(host.id).captures.omanyte, 1);
	});
});
