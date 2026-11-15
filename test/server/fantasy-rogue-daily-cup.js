'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { DAILY_CUP_V2 } = require('../../dist/server/fantasy-rogue/daily-cup-data');
const { cupDay, dailyCupSummary, dailyCupView, dailyCupReplay, submitDailyCup, settleDailyCup, needsCupSettlement } =
	require('../../dist/server/fantasy-rogue/daily-crate-cup');
const { Dex } = require('../../dist/sim/dex');
const { emptyCrates } = require('../../dist/server/fantasy-rogue/starter-crates');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { content, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue daily crate predictions', function () {
	this.timeout(30000);
	const dayOne = Date.parse('2026-11-15T12:00:00+08:00');
	const dayTwo = dayOne + 86400000;
	const prediction = (day = '2026-11-15', index = 0) => `2:${day}:${DAILY_CUP_V2[index].winners.map(n => 'ABCD'[n]).join(':')}`;

	it('shares the roster and Shanghai midnight boundary without leaking unreleased winners or replays', () => {
		const midnight = Date.parse('2026-11-16T00:00:00+08:00');
		assert.equal(cupDay(midnight - 1), '2026-11-15');
		assert.equal(cupDay(midnight), '2026-11-16');
		const first = dailyCupView(undefined, dayOne), second = dailyCupView(emptyCrates(), dayOne);
		assert.deepEqual(first, second); assert.equal(first.teams.length, 4);
		assert(first.teams.every(team => team.length === 3));
		assert.equal(new Set(first.teams.flat()).size, 12);
		assert.equal(first.refreshAt, midnight);
		assert(!JSON.stringify(first).includes('winners')); assert(!JSON.stringify(first).includes('replays'));
		assert.throws(() => dailyCupReplay('2026-11-15', 0, dayOne), /尚未公布/);
		assert.throws(() => dailyCupReplay('2026-11-16', 0, dayOne), /尚未公布/);
		assert.equal(dailyCupView(undefined, midnight).results[0].day, '2026-11-15');
	});

	it('provides complete fixed level-50 replay brackets for every published day', () => {
		assert(DAILY_CUP_V2.length >= 366);
		const dex = Dex.mod('gen9fantasy');
		for (let index = 0; index < DAILY_CUP_V2.length; index++) {
			const day = new Date(Date.UTC(2026, 10, 15) + index * 86400000).toISOString().slice(0, 10);
			const now = Date.parse(`${day}T12:00:00+08:00`) + 86400000, entry = DAILY_CUP_V2[index];
			assert([0, 1].includes(entry.winners[0]) && [2, 3].includes(entry.winners[1]));
			assert(entry.winners.slice(0, 2).includes(entry.winners[2]));
			for (let match = 0; match < 3; match++) {
				const replay = dailyCupReplay(day, match, now), pair = match < 2 ? [match * 2, match * 2 + 1] : entry.winners.slice(0, 2);
				assert.equal(replay.winner, entry.winners[match]);
				assert(replay.log.includes(`|win|${'ABCD'[entry.winners[match]]}队`), `${day}/${match}`);
				for (let side = 0; side < 2; side++) {
					assert(replay.log.includes(`|teamsize|p${side + 1}|3`));
					const appearances = replay.log.filter(line => line.startsWith(`|switch|p${side + 1}a:`));
					assert(appearances.length > 0);
					for (const line of appearances) {
						const details = line.split('|')[3];
						assert(details.includes(', L50'), `${day}/${match}: ${details}`);
						const species = details.split(',')[0];
						if (!entry.teams[pair[side]].includes(species)) {
							const base = dex.species.get(species).battleOnly;
							assert(typeof base === 'string' && entry.teams[pair[side]].includes(base), details);
							// A legal battle-only transition (e.g. broken Disguise) must precede its later switches.
							assert(replay.log.slice(0, replay.log.indexOf(line)).some(event =>
								(event.startsWith(`|detailschange|p${side + 1}a:`) || event.startsWith(`|-formechange|p${side + 1}a:`)) &&
								event.split('|')[3].split(',')[0] === species), details);
						}
					}
				}
				assert(!replay.log.some(line => /Error:|\|tie\|/.test(line)));
				assert(!replay.log.some(line => /^\|-(?:end)?item\|/.test(line)), `${day}/${match}: unexpected held item`);
			}
		}
	});

	it('rotates without the previous two days, exposes all four moves and keeps every held item empty', () => {
		const dex = Dex.mod('gen9fantasy');
		for (let i = 0; i < DAILY_CUP_V2.length; i++) {
			const entry = DAILY_CUP_V2[i], recent = new Set(DAILY_CUP_V2.slice(Math.max(0, i - 2), i).flatMap(day => day.teams.flat()));
			assert(entry.teams.flat().every(name => !recent.has(name)), 'recent repeat at day ' + i);
			assert(entry.teams.flat().some(name => dex.species.get(name).forme.includes('Fantasy')));
			assert.equal(new Set(entry.teams.flat()).size, 12);
			assert(entry.diagnostics.every(match => match.rollouts > 0), 'must use native search, not the old spectator heuristic');
			for (const team of entry.sets) for (const set of team) {
				assert.equal(set.item, ''); assert.equal(set.moves.length, 4);
				assert(set.moves.every(move => dex.moves.get(move).exists));
			}
		}
		assert.deepEqual(dailyCupView(undefined, dayOne).sets, DAILY_CUP_V2[0].sets);
		assert.deepEqual(dailyCupView(undefined, dayOne), dailyCupView(undefined, dayOne + 60000));
	});
	it('resets only legacy predictions once, fences stale pages and preserves every other crate resource', () => {
		const ledger = { ...emptyCrates(), freeDraws: 7, points: 18, total: 33, legendaryMisses: 21,
			predictions: { '2026-11-15': { id: 'old', picks: [0, 2, 0] }, '2026-11-03': { id: 'earned', picks: [0, 2, 0], settled: true, reward: 1 } } };
		delete ledger.cupSeason;
		const before = structuredClone(ledger);
		assert(needsCupSettlement(ledger, dayOne));
		assert(!dailyCupSummary(ledger, dayOne).submitted);
		assert.throws(() => submitDailyCup(ledger, 'stale', '2026-11-15:A:C:A', dayOne), /赛程已更新/);
		assert.deepEqual(ledger, before);
		settleDailyCup(ledger, dayOne);
		assert.deepEqual(ledger, { ...before, predictions: {}, cupSeason: 2 });
		submitDailyCup(ledger, 'fresh', prediction(), dayOne);
		const saved = structuredClone(ledger); settleDailyCup(ledger, dayOne);
		assert.deepEqual(ledger, saved);
		settleDailyCup(ledger, dayTwo); settleDailyCup(ledger, dayTwo);
		assert.equal(ledger.freeDraws, 8);
		assert.equal(ledger.points, before.points); assert.equal(ledger.total, before.total);
	});

	it('rejects malformed, unpublished and out-of-range replay queries', () => {
		for (const day of ['2026-02-30', '2026-11-14', '../data', '2026-1-3']) {
			assert.throws(() => dailyCupReplay(day, 0, dayTwo));
		}
		for (const match of [-1, 3, 0.5, NaN]) assert.throws(() => dailyCupReplay('2026-11-15', match, dayTwo));
		assert.equal(dailyCupView(undefined, Date.UTC(2040, 0, 1)).teams.length, 0);
	});

	it('accepts one consistent prediction per day, without revealing its result', () => {
		const ledger = emptyCrates();
		for (const value of ['2:2026-11-14:A:C:A', '2:2026-11-15:C:D:C', '2:2026-11-15:A:B:A',
			'2:2026-11-15:A:C:D', '2:2026-11-15:A:C:A:extra']) {
			assert.throws(() => submitDailyCup(ledger, 'bad', value, dayOne));
			assert.deepEqual(ledger, emptyCrates());
		}
		submitDailyCup(ledger, 'receipt', prediction(), dayOne);
		assert.throws(() => submitDailyCup(ledger, 'changed', prediction(), dayOne), /已提交/);
		assert.equal(dailyCupSummary(ledger, dayOne).requestId, 'receipt');
		assert.equal(ledger.freeDraws, undefined);
		assert(!needsCupSettlement(ledger, dayOne));
		assert.equal(dailyCupView(ledger, dayOne).prediction.reward, undefined);
	});

	it('settles all three correct only once, retains free draws and catches up missed days', () => {
		const ledger = emptyCrates(); ledger.freeDraws = 4;
		submitDailyCup(ledger, 'one', prediction(), dayOne);
		assert(needsCupSettlement(ledger, dayTwo));
		settleDailyCup(ledger, dayTwo); settleDailyCup(ledger, dayTwo);
		assert.equal(ledger.freeDraws, 5); assert(!needsCupSettlement(ledger, dayTwo));
		submitDailyCup(ledger, 'two', prediction('2026-11-16', 1), dayTwo);
		settleDailyCup(ledger, dayTwo + 30 * 86400000);
		assert.equal(ledger.freeDraws, 6);
		assert.equal(dailyCupView(ledger, dayTwo + 30 * 86400000).results.length, 3);
		const wrong = emptyCrates(), picks = [...DAILY_CUP_V2[0].winners];
		picks[2] = picks[2] === picks[0] ? picks[1] : picks[0];
		submitDailyCup(wrong, 'wrong', '2:2026-11-15:' + picks.map(n => 'ABCD'[n]).join(':'), dayOne);
		settleDailyCup(wrong, dayTwo);
		assert.equal(wrong.freeDraws, 0); assert.equal(wrong.predictions['2026-11-15'].reward, 0);
	});

	it('keeps predictions idempotent across active runs and settles free draws inside crate transactions', () => {
		const store = new RogueStore(':memory:'), engine = new RogueEngine(store, content(), n => n - 1);
		const originalNow = Date.now, user = 'cupqa';
		const request = extra => ({ id: randomUUID(), revision: store.get(user).revision, ...extra });
		try {
			Date.now = () => dayOne;
			commandAfterOpening(engine, user, request({ action: 'start', starters: ['bulbasaur'], difficulty: 0 }));
			const run = store.get(user).run, command = request({ action: 'crateprediction', value: prediction() });
			engine.command(user, command); const saved = store.get(user);
			assert.deepEqual(saved.run, run);
			engine.command(user, command); assert.deepEqual(store.get(user), saved);
			assert.throws(() => engine.command(user, request({ action: 'crateprediction', value: prediction() })), /已提交/);
			engine.command(user, request({ action: 'abandon' }));
			store.change(user, a => { a.points = 0; });
			Date.now = () => dayTwo;
			const open = request({ action: 'opencrate', count: 1, value: 'none' });
			engine.command(user, open); const after = store.get(user);
			assert.equal(after.crates.total, 1); assert.equal(after.crates.freeDraws, 0);
			assert.equal(after.crates.predictions['2026-11-15'].reward, 1); assert.equal(after.points, 0);
			engine.command(user, open); assert.deepEqual(store.get(user), after);
		} finally { Date.now = originalNow; store.close(); }
	});

	it('rolls back prediction settlement and free opening together and survives database reopening', () => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-cup-')), file = path.join(folder, 'test.db');
		const originalNow = Date.now, user = 'cupsqlite';
		let store, db;
		try {
			store = new RogueStore(file); const engine = new RogueEngine(store, content(), n => n - 1);
			Date.now = () => dayOne;
			engine.command(user, { id: randomUUID(), revision: store.get(user).revision, action: 'crateprediction', value: prediction() });
			db = new Database(file);
			db.exec("CREATE TRIGGER fail_cup_receipt BEFORE INSERT ON rogue_requests BEGIN SELECT RAISE(ABORT, 'cup failure'); END");
			Date.now = () => dayTwo;
			const before = store.get(user), open = { id: randomUUID(), revision: before.revision, action: 'opencrate', count: 1, value: 'none' };
			assert.throws(() => engine.command(user, open), /cup failure/);
			assert.deepEqual(store.get(user), before);
			db.exec('DROP TRIGGER fail_cup_receipt'); engine.command(user, open);
			const after = store.get(user); store.close(); store = new RogueStore(file);
			const restarted = new RogueEngine(store, content(), n => n - 1);
			restarted.migrate(user); restarted.command(user, open);
			assert.deepEqual(store.get(user).crates, after.crates); assert.equal(store.get(user).points, after.points);
		} finally {
			Date.now = originalNow; if (db) db.close(); if (store) store.close();
			for (const name of fs.readdirSync(folder)) fs.unlinkSync(path.join(folder, name));
			fs.rmdirSync(folder);
		}
	});
	it('migrates a legacy SQLite ledger atomically, preserving the active run, resources and other accounts', () => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-cup-reset-')), file = path.join(folder, 'test.db');
		const originalNow = Date.now, user = 'cupold';
		let store, db;
		try {
			Date.now = () => dayOne; store = new RogueStore(file);
			const engine = new RogueEngine(store, content(), n => n - 1);
			commandAfterOpening(engine, user, { id: randomUUID(), revision: store.get(user).revision, action: 'start', starters: ['bulbasaur'], difficulty: 0 });
			store.change(user, account => {
				account.crates = { ...emptyCrates(), freeDraws: 9, predictions: { '2026-11-15': { id: 'legacy', picks: [0, 2, 0] } } };
				delete account.crates.cupSeason;
			});
			const before = store.get(user), other = store.get('untouched');
			const request = { id: randomUUID(), revision: before.revision, action: 'crateprediction', value: prediction() };
			db = new Database(file);
			db.exec("CREATE TRIGGER fail_reset BEFORE INSERT ON rogue_requests BEGIN SELECT RAISE(ABORT, 'reset failure'); END");
			assert.throws(() => engine.command(user, request), /reset failure/); assert.deepEqual(store.get(user), before);
			db.exec('DROP TRIGGER fail_reset'); engine.command(user, request);
			const after = store.get(user); assert.deepEqual(after.run, before.run);
			assert.equal(after.crates.freeDraws, 9); assert.equal(after.points, before.points);
			assert.deepEqual(after.captures, before.captures); assert.equal(after.crates.cupSeason, 2);
			assert.deepEqual(store.get('untouched'), other);
			store.close(); store = new RogueStore(file); const restarted = new RogueEngine(store, content(), n => n - 1);
			restarted.command(user, request); assert.deepEqual(store.get(user), after);
			Date.now = () => dayTwo;
			const manager = Object.create(RogueManager.prototype); manager.engine = restarted;
			manager.settleCrates(user); manager.settleCrates(user);
			assert.equal(store.get(user).crates.freeDraws, 10); assert.deepEqual(store.get(user).run, before.run);
		} finally {
			Date.now = originalNow; if (db) db.close(); if (store) store.close();
			for (const name of fs.readdirSync(folder)) fs.unlinkSync(path.join(folder, name));
			fs.rmdirSync(folder);
		}
	});
});
