'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { content, set, stats } = require('../fixtures/fantasy-rogue');
const { Battle } = require('../../dist/sim/battle');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { collapseGasActive } = require('../../dist/sim/rogue-collapse');

describe('Fantasy Rogue cooperative collapse selection and rewards', function () {
	this.timeout(25000);
	let store, manager, data, host, guest, before, created;
	let serial = 0;
	beforeEach(() => {
		before = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); data = content();
		host = makeUser(`Collapse Host ${++serial}`, `127.0.93.${serial}`);
		guest = makeUser(`Collapse Guest ${serial}`, `127.0.94.${serial}`);
		for (const user of [host, guest]) store.change(user.id, account => {
			account.difficulties = { highest: 1, cleared: ['0'], spirits: [] };
		});
		rebuild();
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store?.close();
		Config.fantasyailocal = before.local; Config.bindaddress = before.bind; Config.fantasyrogue = before.rogue;
	});
	function rebuild() {
		manager = new RogueManager(new RogueEngine(store, data), () => ({ enabled: true,
			createRogueBattle(user, trainer, team, rogue) { created = rogue; return { roomid: 'battle-coop-collapse' }; },
		}));
	}
	function get() { return store.coopSessionForUser(host.id); }
	function write(session) { const revision = session.revision++; store.updateCoopSession(session, revision); }
	function begin(tier = 1) {
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: tier });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
	}
	function vote(user, ids, confirmed = true, visit = get().adventure.collapseChoice?.key) {
		return manager.coop.command(user, { action: 'collapse', collapse: ids, confirmed, visit });
	}
	function agree(ids = ['power', 'inflation']) { vote(host, ids); vote(guest, ids.slice().reverse()); }
	function history(user) { return Object.values(store.get(user.id).collapseHistory || {}); }
	function start() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle',
			members: get().adventure.members[user.id].team.slice(0, 3).map(mon => mon.id) });
		return structuredClone(created.state);
	}
	function settle(state, won = true) {
		created.onResult({ encounterId: state.encounterId, won, turns: 3, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			collapseMetrics: { triggers: { power: 2 } } });
	}
	it('starts tier zero directly with current rules and no unwanted old numeric scaling', () => {
		begin(0);
		assert.equal(get().adventure.phase, 'area-selection');
		assert.equal(get().adventure.difficultyRulesVersion, 5);
		assert.deepEqual(get().adventure.collapse, []);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
		assert.equal(start().difficulty.version, 5);
	});
	it('requires matching confirmed sets, preserves live previews across reconstruction and rejects stale requests', () => {
		begin(); const key = get().adventure.collapseChoice.key;
		assert.equal(get().adventure.phase, 'collapse-selection');
		assert.throws(() => manager.coop.command(host, { action: 'selectarea', value: 'grass' }), /区域|路线|选择/);
		for (const ids of [['power'], ['power', 'power'], ['power', 'medicine'], ['power', 'vitality', 'inflation']]) {
			assert.throws(() => vote(host, ids), /崩坏词条/);
		}
		vote(host, ['inflation', 'power']); rebuild();
		const view = manager.coop.view(guest).session.adventure.collapseChoice;
		assert.deepEqual(view.partner, ['power', 'inflation']); assert.equal(view.partnerConfirmed, true);
		vote(guest, ['power', 'vitality']); assert.equal(get().adventure.phase, 'collapse-selection');
		vote(host, ['inflation', 'power'], false); vote(guest, ['power', 'inflation']);
		assert.equal(get().adventure.phase, 'collapse-selection');
		vote(host, ['inflation', 'power']); assert.equal(get().adventure.phase, 'area-selection');
		assert.deepEqual(get().adventure.collapse, ['power', 'inflation']);
		assert.deepEqual(manager.coop.view(host).session.adventure.collapseRules.map(entry => entry.id), ['power', 'inflation']);
		assert.throws(() => vote(host, ['power', 'inflation'], true, key), /已更新/);
		for (const user of [host, guest]) assert.equal(history(user)[0].runs, 1);
	});
	it('clears confirmations on delegation changes and lets the authorized partner confirm for both', () => {
		begin(); vote(host, ['power', 'inflation']);
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.deepEqual(get().adventure.collapseChoice.confirmed, {});
		assert.throws(() => vote(host, ['power', 'inflation']), /已移交/);
		vote(guest, ['power', 'inflation']); assert.equal(get().adventure.phase, 'area-selection');
		for (const user of [host, guest]) assert.equal(history(user)[0].runs, 1);
	});
	it('rolls back both player records and choice completion if the second account cannot be written', () => {
		begin(); vote(host, ['power', 'inflation']); const snapshot = get();
		const original = store.change;
		store.change = function (userid, ...args) {
			if (userid === guest.id) throw new Error('injected second account failure');
			return original.call(this, userid, ...args);
		};
		try { assert.throws(() => vote(guest, ['power', 'inflation']), /injected/); } finally { store.change = original; }
		assert.deepEqual(get(), snapshot);
		for (const user of [host, guest]) assert.deepEqual(history(user), []);
		agree(); assert.equal(history(host)[0].runs, 1);
	});
	it('does not generate the opening blessing pool until the collapse rules are settled', () => {
		data.blessings = true; rebuild();
		begin(); assert.equal(get().adventure.coopBlessingRound, undefined);
		agree(); assert.equal(get().adventure.phase, 'blessing-selection');
	});
	it('passes version and rules into the battle and records one settlement per token', () => {
		begin(); agree();
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
		const state = start();
		assert.equal(state.difficulty.version, 5); assert.deepEqual(state.collapse, ['power', 'inflation']);
		settle(state); settle(state);
		for (const user of [host, guest]) {
			const h = history(user)[0];
			assert.equal(h.battles, 1); assert.equal(h.wins, 1);
			assert.equal(h.turns, 3); assert.equal(h.triggers.power, 2);
		}
	});
	it('keeps old unversioned adventures on their original rule version', () => {
		begin(0); const session = get();
		delete session.adventure.difficultyRulesVersion; delete session.adventure.collapse;
		write(session); rebuild();
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
		const state = start(); assert.equal(state.difficulty.version, 1); assert.equal(state.collapse, undefined);
	});
	it('charges inflation separately to each buyer and counts a duplicate receipt only once', () => {
		begin(); agree(); const session = get();
		session.adventure.floor = 5; session.adventure.phase = 'route-interaction';
		session.adventure.node = { id: 'center', name: '中心', kind: 'rest', encounters: [], reward: { money: 0, items: {} } };
		write(session);
		const snapshot = get().adventure.members;
		const request = { action: 'buy', value: 'pokeball', count: 1, id: randomUUID() };
		manager.coop.command(host, request); manager.coop.command(host, request);
		assert.equal(get().adventure.members[host.id].money, snapshot[host.id].money - 12);
		assert.equal(get().adventure.members[guest.id].money, snapshot[guest.id].money);
		assert.equal(history(host)[0].triggers.inflation, 1);
		assert.equal(history(guest)[0].triggers.inflation, undefined);
	});
	for (const legacy of [false, true]) it(`settles tower and God echo without duplication (legacy ${legacy})`, () => {
		const pack = createPreviewContent({ doubleBattle: true });
		data.floors[200] = structuredClone(pack.floors[200]); data.arceusMoves = { ...pack.arceusMoves };
		data.items.push(...pack.items.filter(item => !data.items.some(existing => existing.id === item.id))); rebuild();
		begin(); agree(); const session = get();
		if (legacy) {
			delete session.adventure.difficultyRulesVersion; delete session.adventure.collapse;
			for (const user of [host, guest]) store.change(user.id, account => { delete account.collapseHistory; });
		}
		session.adventure.floor = 199; session.adventure.phase = 'route-interaction';
		session.adventure.node = { id: 'center', name: '中心', kind: 'rest', encounters: [], reward: { money: 0, items: {} } };
		write(session);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		const route = get().adventure.routeChoices[0].id;
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: route });
		const tower = start(); settle(tower); settle(tower);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		for (const user of [host, guest]) {
			assert.equal(store.get(user.id).echo?.points || 0, legacy ? 0 : 2);
			assert.equal(history(user)[0]?.clears || 0, legacy ? 0 : 1);
			manager.coop.command(user, { action: 'godchallenge', value: 'accept', visit: get().adventure.postgame.key });
		}
		const god = start(); assert.deepEqual(god.collapse, legacy ? undefined : ['power', 'inflation']);
		settle(god); settle(god);
		for (const user of [host, guest]) {
			assert.equal(store.get(user.id).echo?.points || 0, legacy ? 0 : 4);
			assert.equal(history(user)[0]?.clears || 0, legacy ? 0 : 1);
			assert.equal(manager.coop.view(user).session.adventure.postgame.echoPoints, legacy ? 0 : 2);
		}
	});
});

describe('Fantasy Rogue collapse on native multi battle sides', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function begin(ids) {
		battle?.destroy();
		const mon = createRoguePokemon(set('Mew', 'Synchronize', 50, ['Splash']), stats(0));
		const partner = createRoguePokemon(set('Mew', 'Synchronize', 50, ['Splash']), stats(0));
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'multi-collapse', team: [mon], boosts: stats(0), bag: {}, balls: [],
				partner: { team: [partner], boosts: stats(0) }, partnerBag: {}, collapse: ids,
				difficulty: { tier: 1, floor: 10, version: 5 }, persistCoop: true,
				cooperative: { opponentOffset: 1 }, opponentCount: 2, opponentSlots: [0, 1] },
			p1: { name: 'Host', team: [structuredClone(mon.set)] }, p3: { name: 'Guest', team: [structuredClone(partner.set)] },
			p2: { name: 'Enemy One', team: [structuredClone(mon.set)] },
			p4: { name: 'Enemy Two', team: [structuredClone(mon.set)] } });
		for (const id of ['p1', 'p2', 'p3', 'p4']) assert(battle.choose(id, 'team'));
		return battle.sides.map(side => ({ hp: side.active[0].maxhp, atk: side.active[0].getStat('atk') }));
	}
	it('applies enemy stat and HP gains to p2/p4 only, including after checkpoint restoration', () => {
		const base = begin([]); begin(['statbloat', 'vitality']);
		const check = () => {
			for (const [i, side] of battle.sides.entries()) {
				const enemy = i === 1 || i === 3;
				assert.equal(side.active[0].maxhp, enemy ? Math.floor(Math.floor(base[i].hp * 1.1) * 1.2) : base[i].hp);
				assert.equal(side.active[0].getStat('atk'), enemy ? Math.floor(base[i].atk * 1.1) : base[i].atk);
			}
		};
		check(); const saved = JSON.stringify(battle.toJSON());
		battle.destroy(); battle = Battle.fromJSON(saved); check();
	});
	it('suppresses both human sides with ability gas without suppressing either enemy side', () => {
		begin(['abilitygas', 'power']);
		assert(collapseGasActive(battle));
		assert(!battle.p1.active[0].hasAbility('synchronize')); assert(!battle.p3.active[0].hasAbility('synchronize'));
		assert(battle.p2.active[0].hasAbility('synchronize')); assert(battle.p4.active[0].hasAbility('synchronize'));
	});
});
