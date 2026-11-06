'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { DAILY_CUP_V1 } = require('../../dist/server/fantasy-rogue/daily-cup-data');
const { cupDay, dailyCupSummary, dailyCupView, dailyCupReplay, submitDailyCup, settleDailyCup, needsCupSettlement } =
	require('../../dist/server/fantasy-rogue/daily-crate-cup');
const { emptyCrates } = require('../../dist/server/fantasy-rogue/starter-crates');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { content, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue daily crate predictions', function () {
	this.timeout(30000);
	const dayOne = Date.parse('2026-11-03T12:00:00+08:00');
	const dayTwo = dayOne + 86400000;
	const prediction = (day = '2026-11-03', index = 0) => `${day}:${DAILY_CUP_V1[index].winners.map(n => 'ABCD'[n]).join(':')}`;

	it('shares the roster and Shanghai midnight boundary without leaking unreleased winners or replays', () => {
		const midnight = Date.parse('2026-11-04T00:00:00+08:00');
		assert.equal(cupDay(midnight - 1), '2026-11-03');
		assert.equal(cupDay(midnight), '2026-11-04');
		const first = dailyCupView(undefined, dayOne), second = dailyCupView(emptyCrates(), dayOne);
		assert.deepEqual(first, second); assert.equal(first.teams.length, 4);
		assert(first.teams.every(team => team.length === 3));
		assert.equal(new Set(first.teams.flat()).size, 12);
		assert.equal(first.refreshAt, midnight);
		assert(!JSON.stringify(first).includes('winners')); assert(!JSON.stringify(first).includes('replays'));
		assert.throws(() => dailyCupReplay('2026-11-03', 0, dayOne), /尚未公布/);
		assert.throws(() => dailyCupReplay('2026-11-04', 0, dayOne), /尚未公布/);
		assert.equal(dailyCupView(undefined, midnight).results[0].day, '2026-11-03');
	});

	it('provides complete fixed level-50 replay brackets for every published day', () => {
		assert(DAILY_CUP_V1.length >= 366);
		for (let index = 0; index < DAILY_CUP_V1.length; index++) {
			const day = new Date(Date.UTC(2026, 10, 3) + index * 86400000).toISOString().slice(0, 10);
			const now = Date.parse(`${day}T12:00:00+08:00`) + 86400000, entry = DAILY_CUP_V1[index];
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
						assert(entry.teams[pair[side]].includes(details.split(',')[0]), details);
					}
				}
				assert(!replay.log.some(line => /Error:|\|tie\|/.test(line)));
			}
		}
	});

	it('rejects malformed, unpublished and out-of-range replay queries', () => {
		for (const day of ['2026-02-30', '2026-11-02', '../data', '2026-1-3']) {
			assert.throws(() => dailyCupReplay(day, 0, dayTwo));
		}
		for (const match of [-1, 3, 0.5, NaN]) assert.throws(() => dailyCupReplay('2026-11-03', match, dayTwo));
		assert.equal(dailyCupView(undefined, Date.UTC(2040, 0, 1)).teams.length, 0);
	});

	it('accepts one consistent prediction per day, without revealing its result', () => {
		const ledger = emptyCrates();
		for (const value of ['2026-11-02:A:C:A', '2026-11-03:C:D:C', '2026-11-03:A:B:A',
			'2026-11-03:A:C:D', '2026-11-03:A:C:A:extra']) {
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
		submitDailyCup(ledger, 'two', prediction('2026-11-04', 1), dayTwo);
		settleDailyCup(ledger, dayTwo + 30 * 86400000);
		assert.equal(ledger.freeDraws, 6);
		assert.equal(dailyCupView(ledger, dayTwo + 30 * 86400000).results.length, 3);
		const wrong = emptyCrates(), picks = [...DAILY_CUP_V1[0].winners];
		picks[2] = picks[2] === picks[0] ? picks[1] : picks[0];
		submitDailyCup(wrong, 'wrong', '2026-11-03:' + picks.map(n => 'ABCD'[n]).join(':'), dayOne);
		settleDailyCup(wrong, dayTwo);
		assert.equal(wrong.freeDraws, 0); assert.equal(wrong.predictions['2026-11-03'].reward, 0);
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
			assert.equal(after.crates.predictions['2026-11-03'].reward, 1); assert.equal(after.points, 0);
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
});
