'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { chooseEvent, chooseEventOption, settleEventBattle } = require('../../dist/server/fantasy-rogue/events');
const { journeyCoins } = require('../../dist/server/fantasy-rogue/early-balance');
const { honeymoonEligible, HONEYMOON_REGIONS } = require('../../dist/server/fantasy-rogue/honeymoon');
const { lowerToEligibleStage } = require('../../dist/server/fantasy-rogue/evolution');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue co-op honeymoon and personal persistent trips', () => {
	let oldConfig, store, engine, manager, host, guest, created, preview, oldRandom;
	let serial = 0;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldRandom = crypto.randomInt;
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-honeymoon-fixture' };
		} }));
		host = makeUser(`Trip Host ${++serial}`, `127.0.87.${serial}`);
		guest = makeUser(`Trip Guest ${serial}`, `127.0.88.${serial}`);
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
		crypto.randomInt = oldRandom;
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const event = user => manager.coop.view(user).session.adventure.coopEvent;
	const choose = (user, value, visit = event(user).key) => manager.coop.command(user, { action: 'eventchoice', value, visit });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function trip(user, region, run = `solo-${user.id}`, floor = 80) {
		store.change(user.id, account => { account.honeymoon = { region, run, floor }; });
	}
	function fixed(random, work) {
		crypto.randomInt = random;
		try { return work(); } finally { crypto.randomInt = oldRandom; }
	}
	function enter(id, floor = 88, happy = false) {
		change(shared => {
			shared.adventure.floor = floor; shared.adventure.phase = 'area-selection';
			shared.areaSelections = { [host.id]: null, [guest.id]: null };
			shared.adventure.routeChoices = [{ id: 'triproute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id)
				.map(other => ({ id: other, floor: 1 }));
		});
		fixed(max => max === 100 && !happy ? 99 : 0, () => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'triproute' });
		});
		assert.equal(event(host).id, id);
	}
	function agree(choice) {
		const key = event(host).key; choose(host, choice, key); choose(guest, choice, key);
	}
	function startBattle() {
		assert.equal(session().adventure.phase, 'battle-selection');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		assert(created.rogue.cooperative);
	}
	function result(won = true, retreat = false) {
		const state = created.rogue.state;
		return { encounterId: state.encounterId, won, turns: 3, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			defeated: [], ...(retreat ? { coopExit: 'retreat' } : {}) };
	}
	function soloEvent(user, id) {
		const account = store.get(user.id), run = structuredClone(account.run);
		run.floor = 88; run.phase = 'event'; run.honeymoon = structuredClone(account.honeymoon);
		run.node = { id: 'solo-trip', name: '蜜月', kind: 'event', encounters: [], reward: { money: 0, items: {} },
			event: { id, key: 'solo-visit', stage: 'choice', honeymoonHappy: true } };
		return run;
	}
	it('offers ten common destinations, waits for consensus and sends one random tip to each owner', () => {
		enter('honeymoon', 80); const solo = [store.get(host.id).run, store.get(guest.id).run];
		assert.equal(event(host).branchOptions.length, 10);
		assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
		const before = session().adventure.members, key = event(host).key;
		assert.throws(() => choose(host, 'region:alola', 'old-visit'), /已变化/);
		choose(host, 'region:alola'); assert.equal(store.get(host.id).honeymoon, undefined);
		choose(guest, 'region:kalos'); assert.equal(store.get(guest.id).honeymoon, undefined);
		manager.coop.command(guest, { action: 'cancelevent', visit: key });
		let tips = 0;
		fixed(max => {
			if (max === 4) { tips++; return 3; }
			return 0;
		}, () => choose(guest, 'region:alola'));
		assert.equal(tips, 1);
		for (const user of [host, guest]) {
			assert.deepEqual(store.get(user.id).honeymoon, { region: 'alola', run: `${session().adventure.id}:${user.id}`, floor: 80 });
			assert.equal(member(user).money - before[user.id].money, journeyCoins(80, 150 + 160 + 150));
			assert.equal(member(user).bag.superpotion - (before[user.id].bag.superpotion || 0), 1);
		}
		assert.deepEqual([store.get(host.id).run, store.get(guest.id).run], solo);
		const saved = session(); assert.throws(() => choose(host, 'region:alola', key)); assert.deepEqual(session(), saved);
	});
	it('gates floor 80 and eight same-adventure floors without requiring the host to own a pending trip', () => {
		const a = { id: 'a', floor: 79, team: [], bag: {} }, b = { id: 'b', floor: 79, team: [], bag: {} };
		const allowed = new Set(['honeymoon', 'honeymoonreturn']);
		assert.throws(() => chooseEvent(a, () => 0, allowed, [b]), /没有可用事件/);
		a.floor = b.floor = 87; b.honeymoon = { region: 'alola', run: 'b', floor: 80 };
		assert.throws(() => chooseEvent(a, () => 0, allowed, [b]), /没有可用事件/);
		a.floor = b.floor = 88; assert.equal(chooseEvent(a, () => 0, allowed, [b]), 'honeymoonreturn');
		b.honeymoon.run = 'earlier-solo'; a.floor = b.floor = 80;
		assert.equal(chooseEvent(a, () => 0, allowed, [b]), 'honeymoonreturn');
	});
	it('shares the guest-owned return and gift without creating a personal trip for the host', () => {
		trip(guest, 'alola'); enter('honeymoonreturn');
		assert.deepEqual(event(host).paragraphs, event(guest).paragraphs);
		assert(event(host).paragraphs.join('').includes('阿罗拉'));
		const before = session().adventure.members; agree('honeymoongift');
		assert.equal(store.get(host.id).honeymoon, undefined); assert(store.get(guest.id).honeymoon.returned);
		for (const user of [host, guest]) {
			assert.equal(member(user).money - before[user.id].money, journeyCoins(88, 200 + 88 * 3));
			assert.equal(member(user).bag.pearlstring - (before[user.id].bag.pearlstring || 0), 1);
			assert(event(user).ownComplete && event(user).partnerComplete);
		}
	});
	it('preserves a different pending trip and offers that couple on a later shared encounter', () => {
		trip(host, 'alola'); trip(guest, 'galar'); const guestTrip = store.get(guest.id).honeymoon;
		enter('honeymoonreturn'); agree('honeymoongift');
		assert(store.get(host.id).honeymoon.returned); assert.deepEqual(store.get(guest.id).honeymoon, guestTrip);
		enter('honeymoonreturn', 89); assert(event(host).paragraphs.join('').includes('伽勒尔'));
		agree('honeymoongift'); assert(store.get(guest.id).honeymoon.returned);
	});
	it('does not combine unrelated same-region solo journeys', () => {
		trip(host, 'alola'); trip(guest, 'alola');
		enter('honeymoonreturn'); agree('honeymoongift');
		assert(store.get(host.id).honeymoon.returned); assert(!store.get(guest.id).honeymoon.returned);
	});
	it('recognizes a joint trip from an earlier co-op adventure when both owners return together', () => {
		for (const user of [host, guest]) trip(user, 'kalos', `earlier-coop:${user.id}`);
		enter('honeymoonreturn', 80); agree('honeymoongift');
		assert(store.get(host.id).honeymoon.returned); assert(store.get(guest.id).honeymoon.returned);
	});
	it('completes both records for a shared recommendation even after reconstructing the manager', () => {
		enter('honeymoon', 80); agree('region:hisui');
		manager = new RogueManager(engine, () => ({ enabled: true }));
		enter('honeymoonreturn', 88); agree('honeymoongift');
		for (const user of [host, guest]) {
			const saved = store.get(user.id).honeymoon; assert(saved.returned); assert.equal(saved.region, 'hisui');
			assert(!honeymoonEligible({ id: 'next-solo', floor: 80, honeymoon: saved }, 'honeymoonreturn'));
		}
	});
	it('clears pending votes on delegation and lets the receiver choose for both', () => {
		enter('honeymoon'); choose(host, 'region:alola');
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(event(host).ownChoice, null); assert.throws(() => choose(host, 'region:alola'), /操作权/);
		choose(guest, 'region:hisui');
		assert.equal(store.get(host.id).honeymoon.region, 'hisui'); assert.equal(store.get(guest.id).honeymoon.region, 'hisui');
	});
	it('resolves a stale proposal without overwriting a trip started elsewhere', () => {
		enter('honeymoon'); choose(host, 'region:alola'); trip(guest, 'galar');
		assert.throws(() => choose(guest, 'region:alola'), /共同分支/);
		const before = session().adventure.members, accounts = [store.get(host.id), store.get(guest.id)];
		agree('honeymoonclose');
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		for (const user of [host, guest]) assert.equal(member(user).money, before[user.id].money);
		assert(event(host).ownComplete && event(guest).ownComplete);
	});
	it('closes a stale return without deleting a newer trip or paying another souvenir', () => {
		trip(host, 'alola'); enter('honeymoonreturn'); trip(host, 'sinnoh', 'new-trip');
		const before = session().adventure.members; agree('honeymoonclose');
		assert.equal(store.get(host.id).honeymoon.run, 'new-trip');
		assert.deepEqual(member(host).bag, before[host.id].bag); assert.deepEqual(member(guest).bag, before[guest.id].bag);
	});
	for (const won of [true, false]) it(`uses one shared native battle and restores both full parties after a ${won ? 'win' : 'loss'}`, () => {
		trip(host, 'hisui'); enter('honeymoonreturn', 100, true);
		change(shared => {
			for (const user of [host, guest]) {
				const party = shared.adventure.members[user.id].team;
				while (party.length < 6) {
					const mon = structuredClone(party[0]); mon.id = crypto.randomUUID(); party.push(mon);
				}
				for (const mon of party) {
					mon.hp = 1; mon.status = 'par'; mon.pp[0].pp = 0;
				}
			}
		});
		agree('honeymoonbattle'); const node = session().adventure.node;
		assert.equal(node.encounters[0].team.length, 3);
		const eligible = HONEYMOON_REGIONS.hisui.team.map(species => lowerToEligibleStage(species, 50));
		assert(node.encounters[0].team.every(mon => eligible.includes(mon.species)));
		startBattle(); assert(!created.rogue.state.catchable);
		assert.deepEqual(session().adventure.node.encounters, node.encounters);
		const outcome = result(won); created.rogue.onResult(outcome);
		for (const user of [host, guest]) {
			assert.equal(member(user).team.length, 6);
			assert(member(user).team.every(mon => mon.hp === mon.maxhp && !mon.status && mon.pp.every(p => p.pp === p.maxpp)));
			assert(member(user).bag.starpiece > 0); assert(event(user).ownComplete);
		}
		assert(store.get(host.id).honeymoon.returned); assert.equal(store.get(guest.id).honeymoon, undefined);
		const saved = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), saved);
	});
	it('retreats without finishing the trip and retries the identical encounter', () => {
		trip(host, 'alola'); enter('honeymoonreturn', 100, true); agree('honeymoonbattle');
		const enemies = session().adventure.node.encounters; startBattle(); const before = member(host).bag;
		created.rogue.onResult(result(false, true));
		assert(!store.get(host.id).honeymoon.returned); assert.deepEqual(member(host).bag, before);
		assert(!session().adventure.battleResult.eventResolved);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		assert.deepEqual(session().adventure.node.encounters, enemies); startBattle();
		created.rogue.onResult(result()); assert(store.get(host.id).honeymoon.returned);
	});
	for (const phase of ['proposal', 'return', 'battle']) it(`rolls back both rewards and account trips if ${phase} persistence fails`, () => {
		if (phase !== 'proposal') trip(host, 'alola');
		enter(phase === 'proposal' ? 'honeymoon' : 'honeymoonreturn', 100, phase === 'battle');
		const choice = phase === 'proposal' ? 'region:alola' : 'honeymoongift';
		if (phase === 'battle') {
			agree('honeymoonbattle'); startBattle();
		} else {
			choose(host, choice);
		}
		const before = session(), accounts = [store.get(host.id), store.get(guest.id)], update = store.updateCoopSession;
		store.updateCoopSession = () => { throw Error('injected persistence fault'); };
		try {
			assert.throws(() => phase === 'battle' ? manager.coop.settleBattle(before.id, before.adventure.battleToken, result()) :
				choose(guest, choice), /persistence fault/);
		} finally { store.updateCoopSession = update; }
		assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
	it('rejects an overflowing payout atomically', () => {
		enter('honeymoon'); change(shared => { shared.adventure.members[guest.id].money = Number.MAX_SAFE_INTEGER; });
		choose(host, 'region:alola'); const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		assert.throws(() => choose(guest, 'region:alola'), /可保存范围/);
		assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
	for (const stage of ['choice', 'battle']) it(`prevents a stale solo ${stage} from paying a trip completed in co-op twice`, () => {
		trip(host, 'alola'); const solo = soloEvent(host, 'honeymoonreturn');
		solo.node.event.honeymoonHappy = stage === 'battle';
		if (stage === 'battle') chooseEventOption(store.get(host.id), solo, engine.content, () => 0, 'solo-visit', 'honeymoonbattle');
		enter('honeymoonreturn'); agree('honeymoongift');
		const money = solo.money, bag = { ...solo.bag }, account = store.get(host.id);
		if (stage === 'battle') settleEventBattle(solo, engine.content, () => 0, true, false, account);
		else chooseEventOption(account, solo, engine.content, () => 0, 'solo-visit', 'honeymoongift');
		assert.equal(solo.money, money); assert.deepEqual(solo.bag, bag); assert(solo.node.event.settled);
		assert(solo.honeymoon.returned);
	});
	it('keeps a newer account journey when resuming an old solo recommendation', () => {
		const solo = soloEvent(host, 'honeymoon'); trip(host, 'galar');
		const money = solo.money, account = store.get(host.id);
		chooseEventOption(account, solo, engine.content, () => 0, 'solo-visit', 'region:alola');
		assert.equal(solo.money, money); assert.equal(account.honeymoon.region, 'galar'); assert(solo.node.event.settled);
	});
	it('does not award a completed trip again if it changed while the shared battle was running', () => {
		trip(host, 'alola'); enter('honeymoonreturn', 100, true);
		agree('honeymoonbattle'); startBattle();
		store.change(host.id, account => { account.honeymoon.returned = true; });
		const before = session().adventure.members; created.rogue.onResult(result());
		for (const user of [host, guest]) {
			assert.deepEqual(member(user).bag, before[user.id].bag); assert(event(user).ownComplete);
		}
	});
});
