'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { Dex, toID } = require('../../dist/sim/dex');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { cratePool, crateView, crateWeekly, CRATE_RULES } = require('../../dist/server/fantasy-rogue/starter-crates');
const { rogueCaptureCount, rogueStarterSpecies } = require('../../dist/sim/fantasy-rogue-rules');
const { rogueSaveCompatibilityIssues } = require('../../dist/server/fantasy-rogue/save-compatibility');
const { emptyEchoUpgrades } = require('../../dist/sim/rogue-echo');
const { content, set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue permanent starter crates', function () {
	this.timeout(30000);
	const user = 'crateqa';
	let store, engine, data;
	const account = () => store.get(user);
	const request = (extra = {}) => ({ id: randomUUID(), revision: account().revision, action: 'opencrate', count: 1, value: 'none', ...extra });
	const draw = (extra = {}) => engine.command(user, request(extra));
	const ledger = overrides => store.change(user, a => {
		a.crates = { version: 1, total: 0, legendaryMisses: 0, targetedMisses: 0, points: 0, target: 'none', unlocked: [], ...overrides };
	});
	// Select an exact result while exercising the real candidate and trait selection code.
	function rolls(entry, { legendary = false, target = 'none', forced = false, shinyRoll = 999999 } = {}) {
		const candidates = cratePool(data).filter(p => p.legendary === legendary &&
			(!forced || target === 'none' || (target.startsWith('type:') ? p.types.includes(target.slice(5)) : String(p.gen) === target.slice(4))));
		const index = candidates.findIndex(p => p.id === entry);
		assert(index >= 0, `Missing candidate ${entry}`);
		const species = Dex.mod('gen9fantasy').species.get(entry);
		const expected = [];
		if (!forced || !legendary) expected.push([1000000, legendary ? 0 : 999999]);
		expected.push([candidates.length, index], [25, 0], [new Set(Object.values(species.abilities)).size, 0]);
		if (!species.gender) expected.push([1000, 999]);
		expected.push([1000000, shinyRoll]);
		engine.random = max => {
			assert(expected.length, `Unexpected random draw ${max}`);
			const [wanted, result] = expected.shift();
			assert.equal(max, wanted);
			return result;
		};
		return () => assert.equal(expected.length, 0);
	}
	beforeEach(() => {
		store = new RogueStore(':memory:');
		data = content();
		for (const [name, move] of [['Charmander', 'Scratch'], ['Moltres', 'Gust'], ['Mewtwo', 'Confusion'], ['Kyogre', 'Water Pulse']]) {
			const mon = Dex.mod('gen9fantasy').species.get(name);
			data.starters.push({ id: mon.id, set: set(name, mon.abilities[0], 5, [move]), availableInitially: false });
			data.unlocks[mon.id] = { starter: mon.id, captures: rogueCaptureCount(name) };
		}
		engine = new RogueEngine(store, data, n => n - 1);
		store.change(user, a => { a.points = 10000; });
	});
	afterEach(() => store.close());

	it('validates the real pool: only initial forms, all five legendary categories and every offered target', () => {
		const real = require('../../dist/config/fantasy-rogue').FantasyRogueContent;
		const pool = cratePool(real);
		assert(pool.length > 500);
		for (const entry of pool) {
			const species = Dex.mod('gen9').species.get(entry.species);
			assert(species.exists && !species.prevo && !species.battleOnly && !species.isMega, entry.id);
			assert.equal(species.id, toID(rogueStarterSpecies(species.name)), entry.id);
			assert(!/gmax|mega|fantasy/.test(entry.id), entry.id);
		}
		for (const id of ['mewtwo', 'moltres', 'mew', 'buzzwole', 'fluttermane', 'cosmog', 'kubfu', 'meltan']) {
			assert(pool.some(p => p.id === id && p.legendary), id);
		}
		assert(!pool.some(p => ['ivysaur', 'venusaur', 'melmetal', 'eeveegmax'].includes(p.id)));
		const view = crateView(account(), real);
		assert.deepEqual(view.generations, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
		assert.equal(view.types.length, 18);
		for (const subset of [...view.generations.map(gen => pool.filter(p => p.gen === gen)),
			...view.types.map(type => pool.filter(p => p.types.includes(type)))]) {
			assert(subset.some(p => p.legendary) && subset.some(p => !p.legendary));
		}
	});

	it('charges ten points, grants one token and unlocks only standard starter traits without captures', () => {
		const complete = rolls('magikarp');
		draw(); complete();
		const a = account(), traits = a.starterTraits.magikarp;
		assert.equal(a.points, 9990); assert.equal(a.crates.points, 1); assert.equal(a.crates.total, 1);
		assert(a.unlocked.includes('magikarp')); assert.deepEqual(a.captures, {});
		assert.deepEqual(traits.ivs, { min: stats(15), max: stats(15) });
		assert.deepEqual(traits.moves, []); assert.deepEqual(traits.natures, ['adamant']);
		assert.deepEqual(traits.abilities, ['swiftswim']); assert(!traits.shiny);
		assert.equal(a.crates.lastBatch.results.length, 1); assert(a.crates.lastBatch.results[0].newUnlock);
	});

	it('ten draws cost 100 and share the target counter with singles and target switches', () => {
		ledger({ total: 8, legendaryMisses: 8, targetedMisses: 8 });
		draw({ value: 'type:Fire' });
		const complete = rolls('magikarp', { target: 'type:Water', forced: true });
		draw({ value: 'type:Water' }); complete();
		assert.equal(account().crates.lastBatch.results[0].guarantee, 'target');
		assert.equal(account().crates.targetedMisses, 10);
		engine.random = n => n - 1;
		draw({ count: 10, value: 'type:Fire' });
		const a = account(), last = a.crates.lastBatch.results;
		assert.equal(a.points, 9880); assert.equal(a.crates.points, 12); assert.equal(a.crates.total, 20);
		assert.equal(last.length, 10); assert.equal(last[9].guarantee, 'target');
		assert(Dex.species.get(last[9].species).types.includes('Fire'));
	});

	it('resets the ninety counter on an early off-target legend but preserves targeted progress', () => {
		ledger({ total: 26, legendaryMisses: 26, targetedMisses: 80 });
		const complete = rolls('mewtwo', { legendary: true });
		draw({ value: 'type:Fire' }); complete();
		assert.equal(account().crates.legendaryMisses, 0);
		assert.equal(account().crates.targetedMisses, 81);
		assert(account().unlocked.includes('mewtwo'));
		assert.deepEqual(account().captures, {});
	});

	it('resets both counters on an early legend matching the current target', () => {
		ledger({ total: 26, legendaryMisses: 26, targetedMisses: 80 });
		const complete = rolls('moltres', { legendary: true });
		draw({ value: 'type:Fire' }); complete();
		assert.equal(account().crates.legendaryMisses, 0);
		assert.equal(account().crates.targetedMisses, 0);
	});

	it('guarantees a legend on ninety and a current-target legend on one eighty without charging extras', () => {
		ledger({ total: 98, legendaryMisses: 89, targetedMisses: 120 });
		let complete = rolls('mewtwo', { legendary: true, forced: true });
		draw({ value: 'type:Fire' }); complete();
		assert.equal(account().crates.lastBatch.results[0].guarantee, 'legendary');
		assert.equal(account().crates.targetedMisses, 121);
		ledger({ total: 198, legendaryMisses: 20, targetedMisses: 179, target: 'type:Fire' });
		complete = rolls('kyogre', { legendary: true, forced: true, target: 'type:Water' });
		draw({ value: 'type:Water' }); complete();
		const a = account();
		assert.equal(a.crates.lastBatch.results[0].guarantee, 'targetedLegendary');
		assert.equal(a.crates.legendaryMisses, 0); assert.equal(a.crates.targetedMisses, 0);
		assert.equal(a.points, 9980);
	});

	it('combines coincident target/legend guarantees in one draw and resumes from no-target mode', () => {
		ledger({ total: 89, legendaryMisses: 89, targetedMisses: 89 });
		let complete = rolls('moltres', { legendary: true, forced: true, target: 'type:Fire' });
		draw({ value: 'type:Fire' }); complete();
		assert.equal(account().crates.lastBatch.results[0].species, 'Moltres');
		ledger({ total: 188, legendaryMisses: 0, targetedMisses: 180 });
		complete = rolls('magikarp'); draw(); complete();
		assert.equal(account().crates.targetedMisses, 180);
		complete = rolls('moltres', { legendary: true, forced: true, target: 'type:Fire' });
		draw({ value: 'type:Fire' }); complete();
		assert.equal(account().crates.lastBatch.results[0].guarantee, 'targetedLegendary');
	});

	it('keeps legendary unlocks through migration and makes them available to the real starter selector', () => {
		const complete = rolls('mewtwo', { legendary: true }); draw(); complete();
		engine.random = n => n - 1;
		store.change(user, a => { a.slots = 6; });
		engine = new RogueEngine(store, data, n => n - 1);
		engine.migrate(user);
		assert(account().unlocked.includes('mewtwo')); assert(!account().captures.mewtwo);
		commandAfterOpening(engine, user, request({ action: 'start', starters: ['mewtwo'], difficulty: 0 }));
		assert.equal(account().run.team[0].set.species, 'Mewtwo');
		assert.deepEqual(account().run.team[0].set.ivs, stats(15));
	});

	it('preserves stronger old IVs, learned moves, shininess and the same legendary capture ledger', () => {
		store.change(user, a => {
			a.unlocked = ['mew']; a.captures = { mew: 10 };
			a.starterTraits = { mew: { natures: ['timid'], abilities: ['synchronize'], genders: ['N'], moves: ['scald'],
				ivs: { min: stats(0), max: stats(31) }, shiny: true } };
		});
		const complete = rolls('mew', { legendary: true }); draw(); complete();
		const a = account();
		assert.deepEqual(a.captures, { mew: 10 });
		assert.deepEqual(a.starterTraits.mew.ivs, { min: stats(0), max: stats(31) });
		assert.deepEqual(a.starterTraits.mew.moves, ['scald']); assert(a.starterTraits.mew.shiny);
		assert(a.starterTraits.mew.natures.includes('timid'));
		assert(!a.crates.lastBatch.results[0].newUnlock);
		assert.equal(a.crates.lastBatch.results[0].refund, 2);
		assert.equal(a.points, 9992);
	});

	it('raises base fifteen to thirty-one in sixteen duplicates, then refunds two exactly once', () => {
		let complete = rolls('magikarp'); draw(); complete();
		for (let duplicate = 1; duplicate <= 16; duplicate++) {
			complete = rolls('magikarp'); draw(); complete();
			assert.deepEqual(account().starterTraits.magikarp.ivs.max, stats(15 + duplicate));
			assert.equal(account().crates.lastBatch.results[0].refund, 0);
			assert(account().crates.lastBatch.results[0].ivImproved);
		}
		const payload = request(), before = account().points;
		complete = rolls('magikarp'); engine.command(user, payload); complete();
		const after = account();
		assert.equal(after.points, before - 10 + 2);
		assert.deepEqual(after.starterTraits.magikarp.ivs.max, stats(31));
		assert.equal(after.crates.lastBatch.results[0].refund, 2);
		assert(!after.crates.lastBatch.results[0].ivImproved);
		engine.command(user, payload); assert.deepEqual(account(), after);
	});

	it('caps mixed IVs independently and refunds only draws after all six were already full', () => {
		store.change(user, a => {
			a.unlocked = ['magikarp'];
			a.starterTraits = { magikarp: { natures: [], abilities: [], genders: [], moves: ['tackle'],
				ivs: { min: stats(0), max: { ...stats(31), atk: 29, spe: 30 } } } };
		});
		let complete = rolls('magikarp'); draw(); complete();
		assert.deepEqual(account().starterTraits.magikarp.ivs.max, { ...stats(31), atk: 30 });
		assert.equal(account().crates.lastBatch.results[0].refund, 0);
		complete = rolls('magikarp'); draw(); complete();
		assert.deepEqual(account().starterTraits.magikarp.ivs.max, stats(31));
		assert.equal(account().crates.lastBatch.results[0].refund, 0);
		assert.deepEqual(account().starterTraits.magikarp.moves, ['tackle']);
	});

	it('counts initially available starters as owned and spends stored free draws before growth points', () => {
		const complete = rolls('bulbasaur'); draw(); complete();
		assert.deepEqual(account().starterTraits.bulbasaur.ivs.max, stats(16));
		assert(!account().crates.lastBatch.results[0].newUnlock);
		ledger({ freeDraws: 3 });
		engine.random = n => n - 1;
		const before = account().points;
		draw({ count: 10 });
		assert.equal(account().points, before - 70);
		assert.equal(account().crates.freeDraws, 0);
		assert.equal(account().crates.points, 10);
		assert.equal(account().crates.total, 10);
	});

	it('allows a free draw with no growth balance and includes it in normal pity and duplicate refunds', () => {
		ledger({ freeDraws: 2, total: 9 });
		store.change(user, a => {
			a.points = 0; a.unlocked = ['magikarp'];
			a.starterTraits = { magikarp: { natures: [], abilities: [], genders: [], moves: [], ivs: { min: stats(15), max: stats(31) } } };
		});
		const complete = rolls('magikarp', { target: 'type:Water', forced: true });
		draw({ value: 'type:Water' }); complete();
		assert.equal(account().points, 2);
		assert.equal(account().crates.freeDraws, 1);
		assert.equal(account().crates.lastBatch.results[0].guarantee, 'target');
	});

	it('uses Rogue base shiny odds and the permanent Echo bonus with exact boundary rolls', () => {
		let complete = rolls('magikarp', { shinyRoll: 1999 }); draw(); complete();
		assert(account().crates.lastBatch.results[0].shiny);
		complete = rolls('magikarp', { shinyRoll: 2000 }); draw(); complete();
		assert(!account().crates.lastBatch.results[0].shiny);
		store.change(user, a => { a.echo = { unlocked: true, points: 0, earned: 50, upgrades: { ...emptyEchoUpgrades(), shiny: 5 } }; });
		assert.equal(crateView(account(), data).shinyPerMillion, 3000);
		complete = rolls('magikarp', { shinyRoll: 2999 }); draw(); complete();
		assert(account().crates.lastBatch.results[0].shiny);
		complete = rolls('magikarp', { shinyRoll: 3000 }); draw(); complete();
		assert(!account().crates.lastBatch.results[0].shiny);
		assert.equal(CRATE_RULES.legendaryPerMillion, 1000);
	});
	it('starts shiny targeting from old ledgers without applying ten-draw or targeted-legend guarantees', () => {
		ledger({ total: 9, legendaryMisses: 20, targetedMisses: 179 });
		assert.equal(crateView(account(), data).ledger.shinyTargetMisses, 0);
		const complete = rolls('magikarp'); draw({ value: 'shiny' }); complete();
		const a = account(), result = a.crates.lastBatch.results[0];
		assert(!result.shiny && !result.legendary && !result.guarantee);
		assert.equal(a.crates.shinyTargetMisses, 1);
		assert.equal(a.crates.targetedMisses, 180);
		assert.equal(a.crates.legendaryMisses, 21);
		assert.equal(CRATE_RULES.shinyTargetPity, 180);
		assert.equal(CRATE_RULES.legendaryPerMillion, 1000);
		assert.equal(CRATE_RULES.shinyPerMillion, 2000);
	});
	it('counts only shiny-target draws, preserves progress through switches and resets on an early targeted shiny', () => {
		ledger({ total: 20, shinyTargetMisses: 37 });
		let complete = rolls('magikarp', { shinyRoll: 0 }); draw({ value: 'type:Water' }); complete();
		assert.equal(account().crates.shinyTargetMisses, 37);
		complete = rolls('magikarp'); draw(); complete();
		assert.equal(account().crates.shinyTargetMisses, 37);
		complete = rolls('magikarp', { shinyRoll: 1999 }); draw({ value: 'shiny' }); complete();
		assert.equal(account().crates.shinyTargetMisses, 0);
		assert(account().crates.lastBatch.results[0].shiny);
		complete = rolls('magikarp', { shinyRoll: 2000 }); draw({ value: 'shiny' }); complete();
		assert.equal(account().crates.shinyTargetMisses, 1);
		assert(!account().crates.lastBatch.results[0].shiny);
	});
	it('guarantees the 180th shiny-target draw exactly once and retains the separate species-target pity', () => {
		ledger({ total: 9, legendaryMisses: 20, targetedMisses: 179, shinyTargetMisses: 179 });
		const payload = request({ value: 'shiny' });
		let complete = rolls('magikarp'); engine.command(user, payload); complete();
		const a = account(), result = a.crates.lastBatch.results[0];
		assert(result.shiny && result.shinyGuaranteed && !result.legendary);
		assert(a.starterTraits.magikarp.shiny);
		assert.equal(a.crates.shinyTargetMisses, 0);
		assert.equal(a.crates.targetedMisses, 180);
		assert.equal(a.crates.legendaryMisses, 21);
		engine.command(user, payload); assert.deepEqual(account(), a);
		complete = rolls('kyogre', { legendary: true, forced: true, target: 'type:Water' });
		draw({ value: 'type:Water' }); complete();
		assert.equal(account().crates.lastBatch.results[0].guarantee, 'targetedLegendary');
		assert.equal(account().crates.targetedMisses, 0);
		assert.equal(account().crates.shinyTargetMisses, 0);
	});
	it('combines the existing ninety-draw legend with shiny pity in one charged draw and receipt', () => {
		ledger({ total: 89, legendaryMisses: 89, targetedMisses: 99, shinyTargetMisses: 179 });
		const complete = rolls('mewtwo', { legendary: true, forced: true });
		draw({ value: 'shiny' }); complete();
		const a = account(), result = a.crates.lastBatch.results[0];
		assert(result.legendary && result.shiny && result.shinyGuaranteed);
		assert.equal(result.guarantee, 'legendary');
		assert.equal(a.crates.legendaryMisses, 0); assert.equal(a.crates.shinyTargetMisses, 0);
		assert.equal(a.crates.targetedMisses, 100);
		assert.equal(a.points, 9990); assert.equal(a.crates.points, 1);
	});
	it('shares shiny pity across singles and tens, including free draws, and preserves it through migration', () => {
		ledger({ total: 7, legendaryMisses: 20, targetedMisses: 7, shinyTargetMisses: 175, freeDraws: 10 });
		draw({ value: 'shiny', count: 10 });
		const a = account(), results = a.crates.lastBatch.results;
		assert.deepEqual(results.map(result => !!result.shinyGuaranteed), [false, false, false, false, true, false, false, false, false, false]);
		assert.equal(a.crates.shinyTargetMisses, 5);
		assert.equal(a.points, 10000); assert.equal(a.crates.freeDraws, 0);
		assert(results.every(result => !result.guarantee));
		engine.migrate(user);
		assert.equal(account().crates.shinyTargetMisses, 5);
		assert.deepEqual(account().crates.lastBatch, a.crates.lastBatch);
		assert.equal(rogueSaveCompatibilityIssues(account()).length, 0);
	});

	it('can roll hidden abilities and all natures without adding extra stats or moves', () => {
		const expected = [[1000000, 999999], [3, 0], [25, 24], [2, 1], [1000, 0], [1000000, 999999]];
		engine.random = max => {
			const [wanted, value] = expected.shift();
			assert.equal(max, wanted);
			return value;
		};
		draw(); assert.equal(expected.length, 0);
		const result = account().crates.lastBatch.results[0];
		assert.equal(result.species, 'Bulbasaur'); assert.equal(result.ability, 'Chlorophyll');
		assert.equal(result.nature, Dex.natures.all()[24].name); assert.equal(result.gender, 'F');
		assert.deepEqual(account().starterTraits.bulbasaur.moves, []);
	});

	it('rejects malformed counts, mixed/unknown targets and insufficient funds without changing saves', () => {
		for (const extra of [{ count: 0 }, { count: 2 }, { count: -1 }, { count: 1.5 }, { count: '1' },
			{ value: 'gen:10' }, { value: 'type:Water,gen:1' }, { value: 'shiny,type:Water' }, { value: 'type:__proto__' }, { value: 'type:Dragon' }]) {
			const before = account(); assert.throws(() => draw(extra)); assert.deepEqual(account(), before);
		}
		store.change(user, a => { a.points = 9; });
		const before = account(); assert.throws(() => draw(), /不足/); assert.deepEqual(account(), before);
	});

	it('allows crates and exchange during adventures while preserving the run and emergency guard', () => {
		commandAfterOpening(engine, user, request({ action: 'start', starters: ['bulbasaur'], difficulty: 0 }));
		const before = account(); assert(!crateView(before, data).locked);
		const payload = request(); engine.command(user, payload); const after = account();
		engine.command(user, payload); assert.deepEqual(account(), after, 'same receipt cannot charge twice');
		assert.equal(after.crates.total, 1); assert.deepEqual(after.run, before.run);
		ledger({ points: 100 });
		const weekly = crateWeekly(data);
		draw({ action: 'exchangecrate', value: `${weekly.key}:${weekly.featured[0]}` });
		assert.deepEqual(account().run, before.run); assert.equal(account().crates.points, 0);
		const current = request({ action: 'abandon' }); engine.command(user, current);
		engine.continueOnly = true;
		assert.throws(() => draw(), /应急续玩/);
		assert(rogueSaveCompatibilityIssues({ ...account(), crates: { version: 3 } }).includes('unsupported-starter-crates'));
	});

	it('rotates two distinct legends weekly, visits the whole pool before repeating and avoids adjacent repeats', () => {
		const real = require('../../dist/config/fantasy-rogue').FantasyRogueContent;
		const anchor = Date.UTC(2026, 10, 1, 16), weekLength = 7 * 86400000;
		const size = cratePool(real).filter(p => p.legendary).length, seen = new Set();
		let prior = [], count = 0;
		for (let week = 0; week < size + 3; week++) {
			const rotation = crateWeekly(real, anchor + week * weekLength);
			assert.equal(new Set(rotation.featured).size, 2);
			assert(!rotation.featured.some(id => prior.includes(id)));
			assert.equal(rotation.refreshAt, anchor + (week + 1) * weekLength);
			for (const id of rotation.featured) {
				if (count < size) assert(!seen.has(id));
				seen.add(id); count++;
			}
			assert.equal(rotation.catalog.filter(p => p.seen).length, Math.min(size, 2 * week + 2));
			assert.deepEqual(crateWeekly(real, anchor + week * weekLength), rotation);
			prior = rotation.featured;
		}
		assert.equal(seen.size, size);
	});

	it('exchanges exactly 100 tokens without spending growth or changing draw pity; rejects stale weeks', () => {
		ledger({ total: 130, legendaryMisses: 30, targetedMisses: 130, points: 100 });
		const weekly = crateWeekly(data), species = weekly.featured[0];
		const payload = request({ action: 'exchangecrate', value: `${weekly.key}:${species}` });
		engine.command(user, payload); engine.command(user, payload);
		const a = account();
		assert.equal(a.points, 10000); assert.equal(a.crates.points, 0);
		assert.equal(a.crates.total, 130); assert.equal(a.crates.legendaryMisses, 30); assert.equal(a.crates.targetedMisses, 130);
		assert.equal(a.crates.lastBatch.source, 'exchange'); assert(a.unlocked.includes(species));
		assert(crateView(a, data).weekly.catalog.find(p => p.id === species).owned);
		assert.throws(() => draw({ action: 'exchangecrate', value: `${weekly.key}:${species}` }), /不足/);
		assert.throws(() => draw({ action: 'exchangecrate', value: `expired:${species}` }), /更新/);
		assert.deepEqual(account(), a);
	});

	it('commits the receipt with the draw, rejects payload reuse/stale revisions and does not duplicate a retry', () => {
		const payload = request({ count: 10 });
		engine.command(user, payload); const after = account();
		engine.command(user, payload); assert.deepEqual(account(), after);
		assert.throws(() => engine.command(user, { ...payload, count: 1 }), /不一致/);
		assert.throws(() => engine.command(user, { ...payload, id: randomUUID() }), /已更新/);
		assert.deepEqual(account(), after);
	});

	it('rolls back a late SQLite failure, keeps old history, and resumes persisted results without another debit', () => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-crates-test-'));
		const file = path.join(folder, 'test.db');
		let database;
		try {
			store.close(); store = new RogueStore(file); engine = new RogueEngine(store, data, n => n - 1);
			store.change(user, a => { a.points = 200; a.captures = { mew: 3 }; });
			database = new Database(file);
			database.prepare('INSERT INTO rogue_history (userid, id, ended, data) VALUES (?, ?, ?, ?)')
				.run(user, 'old-journey', 1, '{"preserved":true}');
			database.exec("CREATE TRIGGER fail_crate_receipt BEFORE INSERT ON rogue_requests BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
			const before = account(), payload = request({ count: 10 });
			assert.throws(() => engine.command(user, payload), /injected failure/);
			assert.deepEqual(account(), before);
			assert.equal(database.prepare('SELECT count(*) AS n FROM rogue_requests').get().n, 0);
			database.exec('DROP TRIGGER fail_crate_receipt');
			engine.command(user, payload); const after = account();
			store.close(); store = new RogueStore(file); engine = new RogueEngine(store, data, n => n - 1);
			engine.command(user, payload); assert.deepEqual(account(), after);
			engine.migrate(user);
			assert.deepEqual(account().crates, after.crates); assert.equal(account().points, 100);
			assert.equal(database.prepare('SELECT data FROM rogue_history WHERE id = ?').get('old-journey').data, '{"preserved":true}');
			assert.deepEqual(account().captures, { mew: 3 });
		} finally {
			if (database) database.close(); store.close();
			for (const name of fs.readdirSync(folder)) fs.unlinkSync(path.join(folder, name));
			fs.rmdirSync(folder); store = new RogueStore(':memory:');
		}
	});
});
