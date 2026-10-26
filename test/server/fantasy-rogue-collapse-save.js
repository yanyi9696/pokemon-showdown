'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { Battle } = require('../../dist/sim/battle');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { COLLAPSE_ENTRIES } = require('../../dist/sim/rogue-collapse-data');
const { difficultyScale } = require('../../dist/sim/rogue-difficulty');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { content, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue collapse selections, legacy saves, scouting and telemetry', function () {
	this.timeout(30000);
	let store, engine, config;
	const ids = COLLAPSE_ENTRIES.map(e => e.id), user = 'collapse-save';
	const account = () => store.get(user);
	const cmd = (action, extra = {}) => commandAfterOpening(engine, user,
		{ id: randomUUID(), revision: account().revision, action, ...extra });
	beforeEach(() => {
		store = new RogueStore(':memory:'); config = content();
		engine = new RogueEngine(store, config, () => 0, true);
	});
	afterEach(() => store.close());
	for (const tier of [1, 2, 3, 4, 5]) it(`requires exactly ${tier * 2} public, distinct entries at tier ${tier}`, () => {
		const selected = ids.slice(0, tier * 2);
		for (const collapse of [[], selected.slice(1), [...selected, 'invalid'], selected.map(() => ids[0]), 'erosion']) {
			assert.throws(() => cmd('start', { starters: ['bulbasaur'], difficulty: tier, collapse }), /幻想崩坏/);
			assert(!account().run); assert(!account().collapseHistory);
		}
		cmd('start', { starters: ['bulbasaur'], difficulty: tier, collapse: selected });
		assert.deepEqual(account().run.collapse, selected); assert.equal(account().run.difficultyRulesVersion, 5);
		assert.throws(() => cmd('select', { value: 'grass', collapse: selected.slice().reverse() }), /锁定/);
		engine = new RogueEngine(store, config, () => 0, true); engine.migrate(user);
		assert.deepEqual(account().run.collapse, selected);
		cmd('select', { value: 'grass' }); cmd('battle');
		const rules = engine.battleState(user);
		assert.deepEqual(rules.collapse, selected); assert.equal(rules.difficulty.version, 5);
		assert.equal(difficultyScale(tier, 200, true, rules.difficulty.version), 1);
	});
	for (const difficulty of [0, 'easy']) it(`rejects collapse rules in ${difficulty}`, () => {
		assert.throws(() => cmd('start', { starters: ['bulbasaur'], difficulty, collapse: ['erosion'] }), /幻想崩坏/);
		cmd('start', { starters: ['bulbasaur'], difficulty, collapse: [] });
		assert.deepEqual(account().run.collapse, []); assert(!account().collapseHistory);
	});
	it('retains version 2 selections and player scaling after migration', () => {
		cmd('start', {starters: ['bulbasaur'], difficulty: 1, collapse: ['power', 'vitality']});
		store.change(user, a => {a.run.collapse = ['statusshield', 'attachment']; a.run.difficultyRulesVersion = 2;});
		engine.migrate(user); cmd('select', {value: 'grass'}); cmd('battle');
		const rules = engine.battleState(user);
		assert.deepEqual(rules.collapse, ['statusshield', 'attachment']); assert.equal(rules.difficulty.version, 2);
		assert.equal(difficultyScale(5, 200, false, 2), 1.25);
		assert.equal(difficultyScale(5, 200, false, 3), 1.15);
	});
	it('charges adjusted shop prices once and applies medicine loss only to HP potions', () => {
		config.items.push({id: 'potion', name: '伤药', kind: 'heal', price: 40, amount: 12, shopFloor: 1});
		engine = new RogueEngine(store, config, () => 0, true);
		cmd('start', {starters: ['bulbasaur'], difficulty: 1, collapse: ['inflation', 'power']});
		store.change(user, a => {
			a.run.difficultyRulesVersion = 4; a.run.collapse = ['inflation', 'medicine']; delete a.collapseHistory;
			require('../../dist/server/fantasy-rogue/collapse').recordCollapseStart(a, a.run);
		});
		store.change(user, a => {a.run.phase = 'rest'; a.run.money = 1000; a.run.node = {kind: 'rest', encounters: [], reward: {money: 0, items: {}}};});
		const {shopStock} = require('../../dist/server/fantasy-rogue/trading');
		assert.equal(shopStock(config, account().run).find(i => i.id === 'potion').price, 48);
		assert.equal(shopStock(config, account().run).find(i => i.id === 'potion').price, 48);
		cmd('buy', {value: 'potion', count: 2}); assert.equal(account().run.money, 904);
		const member = account().run.team[0].id;
		store.change(user, a => {a.run.team[0].hp = 1;});
		cmd('use', {value: 'potion', member}); assert.equal(account().run.team[0].hp, 10);
		assert.equal(Object.values(account().collapseHistory)[0].triggers.inflation, 1);
		assert.equal(Object.values(account().collapseHistory)[0].triggers.medicine, 1);
		assert.equal(config.items.find(i => i.id === 'potion').price, 40);
	});
	for (const version of [undefined, 1]) it(`retains an active legacy difficulty-${version} run without choosing entries`, () => {
		cmd('start', { starters: ['bulbasaur'], difficulty: 5, collapse: ids });
		store.change(user, a => { delete a.run.collapse; a.run.difficultyRulesVersion = version; });
		engine.migrate(user); assert.equal(account().run.difficultyRulesVersion, version);
		cmd('select', { value: 'grass' }); cmd('battle');
		const rules = engine.battleState(user);
		assert(!rules.collapse); assert.equal(rules.difficulty.version, 1);
		assert.equal(difficultyScale(5, 200, true, rules.difficulty.version), 1.5);
	});
	it('records each start and real battle settlement once, and resets per-Pokemon effects next battle', () => {
		const request = { id: randomUUID(), revision: account().revision, action: 'start', starters: ['bulbasaur'], difficulty: 5, collapse: ids };
		commandAfterOpening(engine, user, request); engine.command(user, request);
		cmd('select', { value: 'grass' }); cmd('battle');
		const run = account().run;
		let b = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: engine.battleState(user),
			p1: { name: 'Player', team: run.team.map(m => m.set) }, p2: { name: 'Enemy', team: run.node.encounters[0].team } });
		try {
			b.makeChoices('team 1', 'team 1');
			const serialized = JSON.stringify(b.toJSON()); b.destroy(); b = Battle.fromJSON(serialized);
			for (let i = 0; i < 20 && !b.ended; i++) b.makeChoices('move 1', 'move 1');
			assert(b.ended); const result = rogueBattleResult(b);
			assert(result.won); assert(result.turns > 0);
			engine.settle(user, run.battle.token, result); engine.settle(user, run.battle.token, result);
			const h = Object.values(account().collapseHistory)[0];
			assert.equal(h.runs, 1); assert.equal(h.battles, 1);
			assert.equal(h.wins, 1); assert.equal(h.turns, result.turns);
			assert.equal(Object.keys(h.selections).length, 10);
			assert(account().run.team.every(m => !m.m?.rogueCollapse && !m.set.rogueCollapse));
			cmd('battle'); const next = engine.battleState(user); assert(!next.collapseMetrics);
			b.destroy(); b = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: next,
				p1: { team: account().run.team.map(m => m.set) }, p2: { team: account().run.node.encounters[1].team } });
			assert(!b.p2.pokemon[0].m.rogueCollapse?.shieldUsed); assert(!b.p2.pokemon[0].m.rogueCollapse?.emergencyUsed);
		} finally { b.destroy(); }
	});
	it('scouts the next boss within ten floors, stores its roster and does not redraw it on reconnect', () => {
		assert.equal(blessing('futuresight').tier, 'silver');
		config.floors[10][0].encounters[0].candidates = config.starters.map(s => s.set);
		cmd('start', { starters: ['bulbasaur'], difficulty: 0, collapse: [] });
		store.change(user, a => {
			const state = normalizeBlessings(a.run);
			state.owned.push({ id: 'futuresight', family: 'futuresight', tier: 'silver', floor: 1 });
		});
		engine.migrate(user); const first = structuredClone(account().run.bossPreviews[10]);
		assert.equal(account().run.futureBossFloor, 10); assert(!first.encounters[0].candidates);
		engine = new RogueEngine(store, config, n => n - 1, true); engine.migrate(user);
		assert.deepEqual(account().run.bossPreviews[10], first);
		store.change(user, a => {
			a.run.floor = 10; a.run.phase = 'choose'; delete a.run.node;
			engine.enterFloor(a.run);
		});
		assert.deepEqual(account().run.node.encounters[0].team, first.encounters[0].team);
		engine.migrate(user); assert.equal(account().run.futureBossFloor, 20);
		store.change(user, a => { a.run.floor = 20; }); engine.migrate(user);
		assert(!account().run.futureBossFloor);
	});
});
