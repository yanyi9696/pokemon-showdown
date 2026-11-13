'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Dex } = require('../../dist/sim/dex');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { firstClearSpeciesKey } = require('../../dist/server/fantasy-rogue/first-clears');
const { challengeMonth, monthlyRoster, recordMonthlyClear, claimMonthlyChallenge, monthlyChallengeView } =
	require('../../dist/server/fantasy-rogue/monthly-challenges');
const { MONTHLY_CANDIDATES_V1 } = require('../../dist/server/fantasy-rogue/monthly-candidates-v1');
const { content, set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue monthly challenges', function () {
	this.timeout(30000);
	const time = Date.parse('2026-11-11T00:00:00Z'), month = challengeMonth(time);
	const mon = species => ({ set: { species } });
	const run = (tier = 4) => ({ floor: 200, phase: 'complete', difficulty: tier,
		team: monthlyRoster(month).slice(0, 2).map(entry => mon(entry.species)) });
	const account = () => ({ points: 0 });
	it('retains earned entries removed by the new legend cap and does not grant unearned legacy entries', () => {
		const oldIDs = ['calyrexice', 'grimmsnarl', 'torterra', 'nihilego', 'pyroar', 'jellicent',
			'dialgaorigin', 'pawmot', 'ledian', 'meganium']; // Frozen January v1 evidence.
		const current = monthlyRoster('2026-01'), removed = oldIDs.filter(id => !current.some(e => e.id === id));
		assert(removed.length);
		const a = account();
		a.monthlyChallenges = { '2026-01': { version: 1, entries: { [removed[0]]: { best: 4, claimed: -1 } } } };
		const view = monthlyChallengeView(a, Date.UTC(2026, 0, 15)).months[0];
		assert.equal(view.entries.filter(e => !e.retired).length, 10);
		assert.deepEqual(view.entries.filter(e => e.retired).map(e => e.id), [removed[0]]);
		claimMonthlyChallenge(a, `2026-01|${removed[0]}`);
		assert.equal(a.points, 10); assert.equal(a.echo.points, 4);
		assert.throws(() => claimMonthlyChallenge(a, `2026-01|${removed[0]}`), /没有可领取/);
		for (const id of removed.slice(1)) assert.throws(() => claimMonthlyChallenge(a, `2026-01|${id}`));
	});
	it('changes the month at Beijing midnight, not at browser or UTC midnight', () => {
		assert.equal(challengeMonth(Date.parse('2026-11-30T15:59:59.999Z')), '2026-11');
		assert.equal(challengeMonth(Date.parse('2026-11-30T16:00:00Z')), '2026-12');
		assert.throws(() => monthlyRoster('2026-00')); assert.throws(() => monthlyRoster('__proto__'));
	});
	it('uses ten different evolution families covering all eighteen types and at most two legends for 120 months', () => {
		let first;
		for (let year = 2026; year < 2036; year++) for (let m = 1; m <= 12; m++) {
			const key = `${year}-${String(m).padStart(2, '0')}`, entries = monthlyRoster(key);
			assert.equal(entries.length, 10, key);
			assert.equal(new Set(entries.flatMap(entry => entry.types)).size, 18, key);
			assert.equal(new Set(entries.map(entry => entry.eligible.at(-1))).size, 10, key);
			assert(entries.filter(entry => entry.legendary).length <= 2, key);
			if (!first) first = structuredClone(entries);
		}
		assert.deepEqual(monthlyRoster('2026-01'), first, 'deterministic after cache eviction');
		assert.notDeepEqual(monthlyRoster('2026-01'), monthlyRoster('2026-02'));
	});
	it('counts Mega, Gmax, totem and Fantasy forms but keeps regional identities distinct', () => {
		for (const [name, ordinary] of [
			['Charizard-Mega-X', 'Charizard'], ['Charizard-Gmax', 'Charizard'],
			['Togedemaru-Totem', 'Togedemaru'], ['Primarina-Fantasy', 'Primarina'],
			['Swampert-Mega-X-Fantasy', 'Swampert'], ['Kyurem-Original-Fantasy', 'Kyurem'],
			['Golem-Alola-Fantasy', 'Golem-Alola'],
		]) {
			assert(firstClearSpeciesKey(name), name);
			assert.equal(firstClearSpeciesKey(name), firstClearSpeciesKey(ordinary), name);
		}
		assert.notEqual(firstClearSpeciesKey('Golem-Alola-Fantasy'), firstClearSpeciesKey('Golem'));
		assert.notEqual(firstClearSpeciesKey('Raichu-Alola'), firstClearSpeciesKey('Raichu'));
		for (const [variant, ordinary] of [['Charizard-Mega-X', 'Charizard'], ['Primarina-Fantasy', 'Primarina'],
			['Golem-Alola-Fantasy', 'Golem-Alola']]) {
			let found = false;
			for (let y = 2026; y < 2036 && !found; y++) for (let m = 1; m <= 12 && !found; m++) {
				const now = Date.UTC(y, m - 1, 15), current = challengeMonth(now);
				const entry = monthlyRoster(current).find(e => e.species === ordinary);
				if (!entry) continue;
				const a = account(); recordMonthlyClear(a, { ...run(5), team: [mon(variant)] }, now);
				assert.equal(a.monthlyChallenges[current].entries[entry.id].best, 5, variant);
				claimMonthlyChallenge(a, `${current}|${entry.id}`);
				assert.equal(a.points, 10); assert.equal(a.echo.points, 5); found = true;
			}
			assert(found, 'Monthly integration case not found: ' + ordinary);
		}
	});
	it('freezes only real final evolutions and their direct ancestors, keeping regional identities and excluding siblings', () => {
		const dex = Dex.mod('gen9');
		for (const entry of MONTHLY_CANDIDATES_V1) {
			const species = dex.species.get(entry.species);
			assert(species.exists && !species.evos.length && !species.battleOnly && !species.isMega, entry.id);
			assert(!/Totem|Gmax/.test(species.forme), entry.id);
			const eligible = [];
			for (let s = species; s.exists; s = s.prevo ? dex.species.get(s.prevo) : { exists: false }) {
				eligible.push(firstClearSpeciesKey(s.name));
			}
			assert.deepEqual(entry.eligible, [...new Set(eligible)], entry.id);
		}
		const vaporeon = MONTHLY_CANDIDATES_V1.find(e => e.id === 'vaporeon');
		assert(vaporeon.eligible.includes(firstClearSpeciesKey('Eevee')));
		assert(!vaporeon.eligible.includes(firstClearSpeciesKey('Jolteon')));
		const ninetales = MONTHLY_CANDIDATES_V1.find(e => e.id === 'ninetalesalola');
		assert(ninetales.eligible.includes(firstClearSpeciesKey('Vulpix-Alola')));
		assert(!ninetales.eligible.includes(firstClearSpeciesKey('Vulpix')));
	});
	it('records every matching party member including ancestors once, but not eggs, the box or dead Nuzlocke members', () => {
		const a = account(), r = run(), entries = monthlyRoster(month);
		const ancestor = Dex.mod('gen9').species.all().find(s => firstClearSpeciesKey(s.name) === entries[0].eligible.at(-1));
		r.team = [mon(ancestor.name), mon(entries[1].species), { ...mon(entries[2].species), egg: {} },
			{ ...mon(entries[3].species), nuzlockeDead: true }];
		r.box = [mon(entries[4].species)];
		recordMonthlyClear(a, r, time);
		assert.deepEqual(Object.keys(a.monthlyChallenges[month].entries).sort(), entries.slice(0, 2).map(e => e.id).sort());
		const saved = structuredClone(a);
		recordMonthlyClear(a, JSON.parse(JSON.stringify(r)), Date.parse('2026-12-11T00:00:00Z'));
		assert.deepEqual(a, saved, 'old completed runs do not become new monthly clears');
	});
	it('excludes charm, practice, incomplete and invalid difficulty results', () => {
		for (const extra of [{ difficulty: 'easy' }, { difficultyTest: true }, { phase: 'ready' }, { floor: 199 },
			{ difficulty: -1 }, { difficulty: 6 }, { difficulty: 1.5 }]) {
			const a = account(); recordMonthlyClear(a, { ...run(), ...extra }, time); assert(!a.monthlyChallenges);
		}
	});
	it('grants ten plus four for tier four and only the last point for five, independently for each species', () => {
		const a = account(), entries = monthlyRoster(month); recordMonthlyClear(a, run(4), time);
		claimMonthlyChallenge(a, `${month}|${entries[0].id}`); assert.equal(a.points, 10); assert.equal(a.echo.points, 4);
		claimMonthlyChallenge(a, `${month}|${entries[1].id}`); assert.equal(a.points, 20); assert.equal(a.echo.points, 8);
		assert.throws(() => claimMonthlyChallenge(a, `${month}|${entries[0].id}`), /没有可领取/);
		recordMonthlyClear(a, run(5), time); claimMonthlyChallenge(a, `${month}|${entries[0].id}`);
		assert.equal(a.points, 20); assert.equal(a.echo.points, 9); assert.equal(a.echo.earned, 9);
		recordMonthlyClear(a, run(0), time); assert.equal(a.monthlyChallenges[month].entries[entries[0].id].best, 5);
	});
	it('grants only ten at tier zero, keeps monthly caps fixed in Nuzlocke and preserves purchased upgrades', () => {
		const a = account(), entry = monthlyRoster(month)[0];
		recordMonthlyClear(a, { ...run(0), nuzlocke: true }, time); claimMonthlyChallenge(a, `${month}|${entry.id}`);
		assert.equal(a.points, 10); assert(!a.echo);
		recordMonthlyClear(a, { ...run(5), nuzlocke: true }, time); claimMonthlyChallenge(a, `${month}|${entry.id}`);
		assert.equal(a.points, 10); assert.equal(a.echo.points, 5);
		const upgrades = structuredClone(a.echo.upgrades);
		claimMonthlyChallenge(a, `${month}|${monthlyRoster(month)[1].id}`);
		assert.deepEqual(a.echo.upgrades, upgrades); assert.equal(a.echo.points, 10);
	});
	it('shows old unclaimed rewards without writes and accepts them after rollover, never inventing older clears', () => {
		const a = account(); recordMonthlyClear(a, run(0), time); const saved = structuredClone(a);
		const view = monthlyChallengeView(a, Date.parse('2026-12-11T00:00:00Z'));
		assert.deepEqual(view.months.map(e => e.month), ['2026-12', month]); assert.deepEqual(a, saved);
		for (const entry of monthlyRoster(month).slice(0, 2)) claimMonthlyChallenge(a, `${month}|${entry.id}`);
		assert.equal(monthlyChallengeView(a, Date.parse('2026-12-11T00:00:00Z')).months.length, 1);
		assert.equal(a.points, 20);
		for (const value of ['__proto__|x', `${month}|__proto__`, `${month}|${monthlyRoster(month)[0].id}|`,
			`2026-12|${monthlyRoster('2026-12')[0].id}`]) assert.throws(() => claimMonthlyChallenge(a, value));
	});
	it('keeps each claim atomic, revision-checked and idempotent on the real command route, even during an adventure', () => {
		const store = new RogueStore(':memory:'), engine = new RogueEngine(store, content());
		try {
			const user = 'monthlyqa', entry = monthlyRoster(month)[0];
			commandAfterOpening(engine, user, { id: randomUUID(), revision: store.get(user).revision, action: 'start', starters: ['bulbasaur'] });
			store.change(user, a => recordMonthlyClear(a, run(4), time));
			const before = store.get(user), request = { id: randomUUID(), revision: before.revision,
				action: 'monthlyclaim', value: `${month}|${entry.id}` };
			store.db.exec("CREATE TEMP TRIGGER reject_monthly BEFORE INSERT ON rogue_accounts BEGIN SELECT RAISE(ABORT, 'claim failure'); END");
			assert.throws(() => engine.command(user, request), /claim failure/); assert.deepEqual(store.get(user), before);
			store.db.exec('DROP TRIGGER reject_monthly');
			engine.command(user, request); const claimed = store.get(user); engine.command(user, request);
			assert.deepEqual(store.get(user), claimed); assert.deepEqual(claimed.run, before.run);
			assert.equal(claimed.points, before.points + 10); assert.equal(claimed.echo.points, 4);
			assert.throws(() => engine.command(user, { ...request, id: randomUUID() }));
			assert.throws(() => engine.command('othermonthly', { ...request, id: randomUUID(), revision: store.get('othermonthly').revision }));
		} finally { store.close(); }
	});
	it('records a real solo finish before optional postgame without re-awarding on repeated settlement', () => {
		const store = new RogueStore(':memory:'), engine = new RogueEngine(store, content());
		try {
			const user = 'monthlyfinish', entry = monthlyRoster()[0];
			commandAfterOpening(engine, user, { id: randomUUID(), revision: store.get(user).revision, action: 'start', starters: ['bulbasaur'] });
			store.change(user, a => {
				a.run.floor = 200; a.run.team = [createRoguePokemon(set(entry.species), stats(0))];
				engine.finishAdventure(a, a.run);
			});
			assert.equal(store.get(user).monthlyChallenges[challengeMonth()].entries[entry.id].best, 0);
			const saved = structuredClone(store.get(user).monthlyChallenges);
			store.change(user, a => engine.finishAdventure(a, a.run));
			assert.deepEqual(store.get(user).monthlyChallenges, saved);
		} finally { store.close(); }
	});
});
