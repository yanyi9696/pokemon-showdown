'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { normalizeBlessings, sharedBlessingCandidates } = require('../../dist/server/fantasy-rogue/blessings');
const { ROGUE_BLESSINGS } = require('../../dist/sim/rogue-blessing-data');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative shop guard challenge', () => {
	let previous, store, engine, manager, host, guest, battle;
	const get = () => store.coopSessionForUser(host.id);
	const view = user => manager.coop.view(user).session.adventure;
	function change(update) {
		const session = get(), revision = session.revision; update(session);
		session.revision++; store.updateCoopSession(session, revision);
	}
	beforeEach(() => {
		previous = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const data = content();
		for (const item of data.items) item.shopFloor = false;
		data.items.push(...['leftovers', 'sitrusberry', 'expertbelt'].map(id => ({ id, name: id, kind: 'held', price: 100, shopFloor: 1 })));
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, data);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue, partner) {
			battle = { user, trainer, team, rogue, partner }; return { roomid: 'battle-coop-shopchallenge' };
		} }));
		host = makeUser('Shop Host', '127.99.4.1'); guest = makeUser('Shop Guest', '127.99.4.2');
		for (const user of [host, guest]) engine.command(user.id, { id: crypto.randomUUID(),
			revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'] });
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(session => {
			const a = session.adventure;
			a.floor = 9; a.phase = 'route-interaction';
			a.node = { id: 'center', name: '宝可梦中心', kind: 'rest', encounters: [], reward: { money: 9999, items: { potion: 10 } } };
			for (const owner of [host.id, guest.id]) {
				const run = manager.coop.blessingRun(a, owner); normalizeBlessings(run);
				run.blessings.owned.push({ ...ROGUE_BLESSINGS.find(entry => entry.family === 'shopraid'), level: 1 });
				manager.coop.saveBlessingRun(a, owner, run);
			}
		});
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store.close();
		Config.fantasyailocal = previous.local; Config.bindaddress = previous.bind; Config.fantasyrogue = previous.rogue;
	});
	function choose(user, confirmed = true, key = view(user).shopChallenge.key) {
		return manager.coop.command(user, { action: 'shopchallenge', confirmed, visit: key });
	}
	function start() { choose(host); choose(guest); }
	function fight(won, retreat = false) {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [view(user).team[0].id] });
		assert.equal(battle.partner.user.id, guest.id); assert.equal(battle.rogue.state.catchable, false);
		const state = battle.rogue.state;
		const result = { encounterId: state.encounterId, won, turns: 1, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			...(retreat ? { coopExit: 'retreat' } : {}) };
		for (const mon of [...result.team, ...result.partnerTeam]) mon.hp = Math.max(1, mon.hp - 1);
		battle.rogue.onResult(result); return { result, callback: battle.rogue.onResult };
	}
	function both(action) { for (const user of [host, guest]) manager.coop.command(user, { action }); }
	it('keeps the blessing in the shared pool and offers an actionable shop entry', () => {
		const a = get().adventure;
		const runs = [host.id, guest.id].map(owner => manager.coop.blessingRun(a, owner));
		for (const run of runs) run.blessings.owned = [];
		assert(sharedBlessingCandidates(runs, engine.content).some(entry => entry.family === 'shopraid'));
		assert(view(host).shopChallenge); assert.equal(view(host).shopChallenge.count, 3);
		choose(host); assert.equal(view(host).phase, 'route-interaction'); assert(view(guest).shopChallenge.partnerChoice);
		choose(host, false); assert(!view(guest).shopChallenge.partnerChoice);
		start(); assert.equal(view(host).phase, 'battle-selection'); assert(!view(host).shopChallenge);
		assert(get().adventure.node.shopChallenge); assert.equal(get().adventure.node.encounters.length, 1);
	});
	it('opens the existing native team preview after agreement rather than auto-selecting members', () => {
		start(); assert(!battle);
		manager.coop.command(host, { action: 'preparebattle', visit: view(host).battleSelectionKey });
		assert(battle); assert(get().adventure.nativeTeamPreview);
		assert.equal(battle.rogue.state.catchable, false);
	});
	for (const won of [true, false]) it(`closes the shop after ${won ? 'victory' : 'defeat'} and settles exactly once`, () => {
		const solo = store.get(host.id).run, before = [host, guest].map(user => ({ bag: view(user).bag, money: view(user).money }));
		start(); const { result, callback } = fight(won);
		assert(view(host).battleResult.shopClosed); assert(get().adventure.node.shopChallenge.closed);
		for (const [i, user] of [host, guest].entries()) {
			const bag = view(user).bag;
			for (const id of ['leftovers', 'sitrusberry', 'expertbelt']) assert.equal(bag[id] || 0, (before[i].bag[id] || 0) + (won ? 1 : 0));
			assert.equal(view(user).money, before[i].money);
		}
		const settled = get(); callback(result); assert.deepEqual(get(), settled);
		assert.throws(() => manager.coop.command(host, { action: 'retrybattle' }));
		assert.throws(() => manager.coop.command(host, { action: 'buy', id: crypto.randomUUID(), value: 'leftovers' }));
		both('continuebattle'); assert.equal(view(host).floor, 10); assert.equal(view(host).phase, 'area-selection');
		assert.equal(view(host).money, before[0].money); assert.deepEqual(store.get(host.id).run, solo);
		assert.throws(() => manager.coop.command(host, { action: 'continuebattle' }));
	});
	it('preserves the original guard and prizes across retreat, refresh and retry', () => {
		start(); const node = get().adventure.node, bag = view(host).bag;
		fight(false, true); assert(!view(host).battleResult.shopClosed);
		assert(!get().adventure.node.shopChallenge.closed); assert.deepEqual(view(host).bag, bag);
		manager.coop.command(host, { action: 'refresh' }); both('retrybattle');
		assert.deepEqual(get().adventure.node, node); fight(true); both('continuebattle');
		assert.equal(view(host).floor, 10);
	});
	it('honors delegated consensus and rejects a stale visit or a read-only sender', () => {
		const key = view(host).shopChallenge.key;
		assert.throws(() => choose(host, true, 'stale'));
		change(session => { session.delegatedTo = host.id; });
		assert.throws(() => choose(guest, true, key));
		choose(host); assert.equal(view(host).phase, 'battle-selection');
		assert.throws(() => choose(guest, true, key));
	});
	for (const kind of ['growth', 'buyback']) it(`excludes the ${kind} service route`, () => {
		change(session => { session.adventure.node.kind = 'trade'; session.adventure.node.trade = { kind, stock: [] }; });
		assert.equal(view(host).shopChallenge, null); assert.throws(() => choose(host, true, 'anything'));
	});
	for (const obstacle of ['trade', 'moves', 'capture', 'egg', 'dead', 'mentor', 'event', 'stock', 'blessing']) {
		it(`blocks premature challenge with ${obstacle} pending`, () => {
			const key = view(host).shopChallenge.key;
			change(session => {
				const a = session.adventure, member = a.members[guest.id];
				if (obstacle === 'trade') a.tradeProposal = { id: 'pending', fromUser: host.id, fromMember: a.members[host.id].team[0].id,
					toMember: member.team[0].id, fee: 2500, createdAt: Date.now() };
				if (obstacle === 'moves') member.pendingMoves = [{ member: member.team[0].id, move: 'tackle', moves: [] }];
				if (obstacle === 'capture') member.pendingCaptures = [structuredClone(member.team[0])];
				if (obstacle === 'egg') member.team[0].egg = { hatch: 20 };
				if (obstacle === 'dead') member.team[0].hp = 0;
				if (obstacle === 'mentor') a.mentor = { key: 'mentor', floor: 10, choices: {} };
				if (obstacle === 'event') a.node.event = { id: 'mushroomcollector', key: 'event', stage: 'choice' };
				if (obstacle === 'stock') { a.node.kind = 'trade'; a.node.trade = { kind: 'balls', stock: [] }; }
				if (obstacle === 'blessing') member.blessings.owned = [];
			});
			assert.throws(() => choose(host, true, key)); assert.equal(get().adventure.phase, 'route-interaction');
		});
	}
	it('shares Mew conversion rolls and records both personal ledgers without borrowing solo saves', () => {
		change(session => { session.adventure.spirit = 'hoopagift'; session.adventure.spiritVersion = 1; });
		start(); const original = crypto.randomInt; crypto.randomInt = () => 0;
		try { fight(true); } finally { crypto.randomInt = original; }
		const a = get().adventure;
		assert.deepEqual(a.members[host.id].spiritConversions, a.members[guest.id].spiritConversions);
		assert.equal(Object.keys(a.members[host.id].spiritConversions).length, 3);
		assert.deepEqual(view(host).battleResult.reward.items, view(host).battleResult.partnerReward.items);
		assert(!view(host).battleResult.reward.items.leftovers);
	});
	it('invalidates a pending vote after shared limited stock changes, excluding sold-out goods', () => {
		change(session => {
			session.adventure.node.kind = 'trade'; session.adventure.node.trade = { kind: 'balls', purchases: 0,
				stock: engine.content.items.filter(item => item.kind === 'held').map(item => ({ ...item, remaining: 1 })) };
		});
		const oldKey = view(host).shopChallenge.key;
		choose(host);
		manager.coop.command(guest, { action: 'buy', id: crypto.randomUUID(), value: 'leftovers' });
		assert(!view(guest).shopChallenge.partnerChoice); assert.equal(view(host).shopChallenge.count, 2);
		assert.throws(() => choose(guest, true, oldKey));
		start(); assert(!get().adventure.node.shopChallenge.rewards.leftovers);
		assert.equal(Object.keys(get().adventure.node.shopChallenge.rewards).length, 2);
	});
	it('clears consent on delegation changes and never reuses an old confirmation', () => {
		choose(host); const oldKey = view(host).shopChallenge.key;
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		assert(!view(host).shopChallenge.ownChoice); assert.throws(() => choose(host, true, oldKey));
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		choose(guest); assert.equal(view(host).phase, 'route-interaction');
		choose(host); assert.equal(view(host).phase, 'battle-selection');
	});
	it('requires a Persian raid to finish and does not fight it or pay its bounty again', () => {
		change(session => { session.adventure.node.rocket = { reward: 3000, cleared: false }; });
		assert.equal(view(host).shopChallenge, null);
		change(session => {
			const node = session.adventure.node; node.rocket.cleared = true;
			node.encounters = [{ name: '火箭队', catchable: false, style: 'aggressive', team: [] }];
		});
		const money = view(host).money;
		start(); assert.equal(get().adventure.node.encounters.length, 1);
		assert.equal(get().adventure.node.encounters[0].name, '乔伊小姐');
		assert.equal(view(host).shopRaid, null);
		fight(true); both('continuebattle'); assert.equal(view(host).money, money);
	});
	it('atomically rolls back the second consent if preparing the guard cannot be saved', () => {
		choose(host); const before = get();
		store.db.exec("CREATE TEMP TRIGGER guard_start_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'guard start failed'); END;");
		try {
			assert.throws(() => choose(guest), /guard start failed/); assert.deepEqual(get(), before);
		} finally { store.db.exec('DROP TRIGGER guard_start_fail'); }
		choose(guest); assert.equal(view(host).phase, 'battle-selection');
	});
	it('rolls back a failed result transaction and retries without double rewards', () => {
		start();
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [view(user).team[0].id] });
		const state = battle.rogue.state, before = get(), accounts = [host, guest].map(user => store.get(user.id));
		const result = { encounterId: state.encounterId, won: true, turns: 1, team: state.team,
			partnerTeam: state.partner.team, bag: state.bag, partnerBag: state.partnerBag };
		store.db.exec("CREATE TEMP TRIGGER guard_fail BEFORE UPDATE ON rogue_coop_sessions BEGIN SELECT RAISE(ABORT, 'guard write failed'); END;");
		try {
			assert.throws(() => battle.rogue.onResult(result), /guard write failed/);
			assert.deepEqual(get(), before);
			for (const [i, user] of [host, guest].entries()) assert.deepEqual(store.get(user.id), accounts[i]);
		} finally { store.db.exec('DROP TRIGGER guard_fail'); }
		battle.rogue.onResult(result); assert(get().adventure.node.shopChallenge.closed);
		assert.equal(view(host).bag.leftovers, 1);
	});
});
