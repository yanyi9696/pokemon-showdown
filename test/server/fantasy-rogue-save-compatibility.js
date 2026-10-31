'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const Database = require('better-sqlite3');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { content, stats } = require('../fixtures/fantasy-rogue');
const { offerMainline, beginMainline, mainlineView } = require('../../dist/server/fantasy-rogue/mainline');
const { rogueSaveCompatibilityIssues } = require('../../dist/server/fantasy-rogue/save-compatibility');
const { check } = require('../../tools/check-fantasy-rogue-compatibility');
const { challengeNode, prepareChallengePrizes } = require('../../dist/server/fantasy-rogue/optional-challenges');

describe('Fantasy Rogue forward-compatible emergency continuation', function () {
	this.timeout(20000);
	let directory, filename, store, engine;
	const user = 'syntheticcompat';
	const account = () => store.get(user);
	const request = (action, extra = {}) => ({ id: randomUUID(), revision: account().revision, action, ...extra });
	const cmd = (action, extra) => engine.command(user, request(action, extra));
	const rows = () => {
		const db = new Database(filename, { readonly: true });
		try {
			return Object.fromEntries(['rogue_accounts', 'rogue_cards', 'rogue_requests', 'rogue_history'].map(table =>
				[table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
		} finally { db.close(); }
	};
	const reopen = (continueOnly = true, story = false) => {
		store.close();
		store = new RogueStore(filename);
		engine = new RogueEngine(store, { ...content(), story }, () => 0, false, continueOnly);
	};
	const scene = () => {
		store.change(user, a => {
			Object.assign(a.run, { floor: 21, phase: 'choose', difficulty: 0, mainline: { scene: 's0-1', floor: 21 },
				choices: [{ id: 'event', kind: 'event', name: '事件', encounters: [], reward: { money: 0, items: {} } }] });
			offerMainline(a.run);
			a.run.node = a.run.choices[0];
			beginMainline(a, a.run, a.run.node);
		});
		engine.content.story = true;
	};
	beforeEach(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-compat-'));
		filename = path.join(directory, 'synthetic.db');
		store = new RogueStore(filename);
		engine = new RogueEngine(store, content(), () => 0);
	});
	afterEach(() => {
		store.close();
		// Only the unique directory created by this test may be removed.
		assert(path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('rogue-compat-'));
		fs.rmSync(directory, { recursive: true, force: true });
	});
	it('keeps legacy additive growth and new percentage growth separate through repeated migration', () => {
		cmd('start', { starters: ['bulbasaur'] });
		store.change(user, a => {
			a.boosts = stats(4);
			a.run.boosts = stats(4);
			a.run.money = 12345;
			a.captures.magikarp = 7;
			a.unlocked.push('magikarp');
		});
		const legacy = account();
		delete legacy.saveVersion;
		delete legacy.run.boostRuleVersion;
		delete legacy.run.team[0].set.fantasyRogueBoostPercent;
		const db = new Database(filename);
		db.prepare('UPDATE rogue_accounts SET data = ? WHERE userid = ?').run(JSON.stringify(legacy), user);
		db.close();
		reopen();
		engine.migrate(user);
		assert.equal(account().run.boostRuleVersion, undefined);
		assert(!account().run.team[0].set.fantasyRogueBoostPercent);
		assert.deepEqual(account().run.team, legacy.run.team);
		assert.equal(account().run.money, 12345);
		assert.equal(account().captures.magikarp, 7);
		const once = rows();
		engine.migrate(user);
		assert.deepEqual(rows(), once);
		// Future runs use the new rule; they never reinterpret the old run in place.
		cmd('abandon');
		reopen(false);
		cmd('start', { starters: ['bulbasaur'] });
		assert.equal(account().run.boostRuleVersion, 2);
		const current = account();
		reopen();
		engine.migrate(user);
		assert.deepEqual(account().run.team, current.run.team);
		assert.equal(account().run.boostRuleVersion, 2);
		assert.deepEqual(account().run.boosts, stats(4));
		assert.equal(store.history(user).total, 1);
	});
	it('continues a persisted mainline choice, settles once, rejects stale keys and retains history', () => {
		cmd('start', { starters: ['bulbasaur'] });
		scene();
		cmd('storyskip', { value: mainlineView(account()).key });
		const view = mainlineView(account());
		assert(view.options);
		const before = account();
		reopen(true, true);
		assert.deepEqual(account(), before);
		const choice = request('mainlinechoice', { value: view.key, member: '1' });
		engine.command(user, choice);
		const chosen = rows();
		engine.command(user, choice);
		assert.deepEqual(rows(), chosen);
		reopen(true, true);
		cmd('storyskip', { value: mainlineView(account()).key });
		assert.deepEqual(account().mainline.completed, ['s0-1']);
		assert(account().run.money > before.run.money);
		assert.equal(account().run.phase, 'reward');
		const settled = rows();
		assert.throws(() => cmd('mainlinechoice', { value: view.key, member: '1' }));
		assert.deepEqual(rows(), settled);
		cmd('continue');
		assert.equal(account().run.floor, 22);
		cmd('abandon');
		const history = rows().rogue_history;
		assert.equal(history.length, 1);
		reopen(true, true);
		engine.migrate(user);
		assert.deepEqual(rows().rogue_history, history);
		assert.deepEqual(account().mainline.completed, ['s0-1']);
	});
	it('blocks new runs but honors an already committed start receipt', () => {
		const start = request('start', { starters: ['bulbasaur'] });
		engine.command(user, start);
		reopen();
		const before = rows();
		engine.command(user, start);
		assert.deepEqual(rows(), before);
		assert.throws(() => cmd('start', { starters: ['bulbasaur'] }), /应急续玩/);
		assert.throws(() => cmd('newstory'), /应急续玩/);
		assert.deepEqual(rows(), before);
		cmd('onboarding');
		assert(account().onboardingSeen);
	});
	it('resumes an unclaimed challenge reward with training and inventory intact', () => {
		cmd('start', { starters: ['bulbasaur'] });
		store.change(user, a => {
			a.run.floor = 51;
			a.run.phase = 'event';
			a.run.node = challengeNode('dojoinvitation', 51);
			prepareChallengePrizes(a.run, () => 0);
			a.run.node.challenge.stage = 'won';
		});
		const before = account();
		reopen();
		assert.deepEqual(account(), before);
		const claim = request('challenge', { value: 'supplies' });
		engine.command(user, claim);
		assert.deepEqual(account().run.growth, { offense: 100, defense: 100, experience: 0 });
		const prize = before.run.node.challenge.prizes.find(entry => entry.id === 'supplies');
		assert.equal(account().run.money, before.run.money + prize.money);
		for (const [item, amount] of Object.entries(prize.items)) {
			assert.equal(account().run.bag[item], (before.run.bag[item] || 0) + amount);
		}
		const rewarded = rows();
		engine.command(user, claim);
		assert.deepEqual(rows(), rewarded);
		reopen();
		assert.deepEqual(rows(), rewarded);
	});
	it('rolls back account, history and receipt together on a late SQL failure, then retries once', () => {
		cmd('start', { starters: ['bulbasaur'] });
		const abort = request('abandon');
		const db = new Database(filename);
		try {
			db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON rogue_requests BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
			const before = rows();
			assert.throws(() => engine.command(user, abort), /injected failure/);
			assert.deepEqual(rows(), before);
			db.exec('DROP TRIGGER fail_receipt');
			engine.command(user, abort);
			const after = rows();
			engine.command(user, abort);
			assert.deepEqual(rows(), after);
			assert.equal(after.rogue_history.length, 1);
			assert.equal(account().run, undefined);
		} finally { db.close(); }
	});
	it('rejects unknown writer and growth rules without normalizing or overwriting the row', () => {
		cmd('start', { starters: ['bulbasaur'] });
		const original = account();
		const db = new Database(filename);
		try {
			for (const future of [{ ...original, saveVersion: 3 },
				{ ...original, run: { ...original.run, boostRuleVersion: 3 } }]) {
				db.prepare('UPDATE rogue_accounts SET data = ? WHERE userid = ?').run(JSON.stringify(future), user);
				const before = rows();
				assert.throws(() => store.get(user), /不支持的版本/);
				assert.throws(() => engine.migrate(user), /不支持的版本/);
				assert.deepEqual(rows(), before);
			}
		} finally { db.close(); }
		assert.deepEqual(rogueSaveCompatibilityIssues({ cards: [{ snapshot: { boostRuleVersion: 9 } }] }),
			['unsupported-growth-rule']);
	});
	it('preflights a backup read-only, closes connections and refuses uncertified old builds', () => {
		cmd('start', { starters: ['bulbasaur'] });
		cmd('abandon');
		const before = rows();
		const target = path.resolve(__dirname, '../..');
		assert.equal(check(filename, target).rows.rogue_history, 1);
		assert.deepEqual(rows(), before);
		assert.throws(() => check(filename, directory), /old-code rollback/);
		const missing = path.join(directory, 'missing.db');
		assert.throws(() => check(missing, target));
		assert(!fs.existsSync(missing));
		const db = new Database(filename);
		db.prepare('UPDATE rogue_accounts SET data = ?').run('{"saveVersion":99}');
		db.close();
		assert.throws(() => check(filename, target), /unsupported data contract/);
		const writer = new Database(filename);
		writer.exec('BEGIN EXCLUSIVE; ROLLBACK;');
		writer.close();
	});
});
