'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { evolveMember } = require('../../dist/server/fantasy-rogue/progression');
const { starterMoves, starterTraits } = require('../../dist/server/fantasy-rogue/starter-traits');
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cross-run learned moves', () => {
	let store, engine;
	const user = 'moveunlocktest';
	const account = () => store.get(user);
	const cmd = (action, extra = {}) => commandAfterOpening(engine, user, {
		id: randomUUID(), revision: account().revision, action, ...extra,
	});
	beforeEach(() => {
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, createPreviewContent(), () => 0);
	});
	afterEach(() => store.close());

	for (const difficulty of [0, 'easy']) {
		for (const species of ['Popplio', 'Brionne', 'Primarina', 'Primarina-Fantasy']) {
			it(`keeps unequipped TM Scald from ${species} across runs only in regular mode (${difficulty})`, () => {
				cmd('start', { starters: ['popplio'], difficulty });
				store.change(user, saved => {
					if (species !== 'Popplio') evolveMember(saved.run, saved.run.team[0], species);
					saved.run.bag.roguetmscald = 1;
				});
				while (account().run.pendingMoves?.length) {
					cmd('learn', { member: account().run.pendingMoves[0].member, value: 'skip' });
				}
				const before = account().run.team[0];
				const request = {
					id: randomUUID(), revision: account().revision, action: 'use',
					member: before.id, value: 'roguetmscald',
				};
				engine.command(user, request);
				const learned = account();
				assert.deepEqual(learned.run.team[0].set.moves, before.set.moves);
				assert(learned.run.team[0].moveMemory.some(move => move.id === 'scald'));
				assert.equal(learned.run.bag.roguetmscald, 0);
				assert.equal(starterTraits(learned, 'popplio').moves.includes('scald'), difficulty !== 'easy');
				engine.command(user, request);
				assert.deepEqual(account(), learned, 'A retry must not consume another TM or rewrite unlocks');
				engine = new RogueEngine(store, createPreviewContent(), () => 0);
				engine.migrate(user);
				assert(account().run.team[0].moveMemory.some(move => move.id === 'scald'));
				cmd('abandon');
				assert.equal(starterMoves(account(), engine.content, 'popplio').includes('scald'), difficulty !== 'easy');
				cmd('start', { starters: ['popplio'], difficulty: 0 });
				const next = account().run.team[0];
				assert.equal(next.moveMemory.some(move => move.id === 'scald'), difficulty !== 'easy');
				if (difficulty !== 'easy') {
					cmd('setmove', { member: next.id, slot: 0, value: 'scald' });
					assert.equal(account().run.team[0].set.moves[0], 'scald');
				}
			});
		}
	}

	it('preserves already unlocked Scald when the next run accepts the charm', () => {
		cmd('start', { starters: ['popplio'], difficulty: 0 });
		store.change(user, saved => { saved.run.bag.roguetmscald = 1; });
		cmd('use', { member: account().run.team[0].id, value: 'roguetmscald' });
		cmd('abandon');
		cmd('start', { starters: ['popplio'], difficulty: 'easy' });
		assert(account().run.team[0].moveMemory.some(move => move.id === 'scald'));
		cmd('abandon');
		assert(starterMoves(account(), engine.content, 'popplio').includes('scald'));
	});

	it('rolls back an illegal TM use without consuming it or creating a permanent unlock', () => {
		cmd('start', { starters: ['popplio'] });
		store.change(user, saved => { saved.run.bag.roguetmspore = 1; });
		const before = account();
		assert.throws(() => cmd('use', { member: before.run.team[0].id, value: 'roguetmspore' }), /不能通过/);
		assert.deepEqual(account(), before);
	});

	it('retains a pre-update adventure and its learned TM through disk reopen and repeated migration', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-move-unlocks-'));
		try {
			store.close();
			const database = path.join(root, 'test.db');
			store = new RogueStore(database);
			engine = new RogueEngine(store, createPreviewContent(), () => 0);
			cmd('start', { starters: ['popplio'], difficulty: 0 });
			store.change(user, saved => {
				saved.run.bag.roguetmscald = 1;
				delete saved.run.boostRuleVersion;
			});
			cmd('use', { member: account().run.team[0].id, value: 'roguetmscald' });
			const before = account();
			store.close();
			store = new RogueStore(database);
			engine = new RogueEngine(store, createPreviewContent(), () => 0);
			engine.migrate(user);
			const migrated = account();
			for (const key of ['id', 'floor', 'team', 'money', 'bag', 'blessings']) {
				assert.deepEqual(migrated.run[key], before.run[key], key);
			}
			assert.deepEqual(migrated.starterTraits, before.starterTraits);
			engine.migrate(user);
			assert.deepEqual(account(), migrated);
			cmd('abandon');
			cmd('start', { starters: ['popplio'], difficulty: 0 });
			assert(account().run.team[0].moveMemory.some(move => move.id === 'scald'));
		} finally {
			store.close();
			store = new RogueStore(':memory:');
			assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
			assert(path.basename(root).startsWith('rogue-move-unlocks-'));
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it('unlocks level-up moves for the next run even when the player keeps the current four moves', () => {
		cmd('start', { starters: ['popplio'], difficulty: 0 });
		store.change(user, saved => { saved.run.bag.expcandym = 1; });
		cmd('use', { member: account().run.team[0].id, value: 'expcandym' });
		const pending = account().run.pendingMoves.map(move => move.move);
		assert(pending.length > 0, 'The test must reach the keep-current-moves prompt');
		const equipped = account().run.team[0].set.moves.slice();
		while (account().run.pendingMoves.length) {
			cmd('learn', { member: account().run.pendingMoves[0].member, value: 'skip' });
		}
		assert.deepEqual(account().run.team[0].set.moves, equipped);
		for (const move of pending) {
			assert(account().run.team[0].moveMemory.some(slot => slot.id === move));
		}
		cmd('abandon');
		cmd('start', { starters: ['popplio'], difficulty: 0 });
		for (const move of pending) {
			assert(account().run.team[0].moveMemory.some(slot => slot.id === move), `${move} must remain unlocked`);
		}
	});

	it('does not turn skipped level-up prompts in charm mode into permanent unlocks', () => {
		cmd('start', { starters: ['popplio'], difficulty: 'easy' });
		store.change(user, saved => { saved.run.bag.expcandym = 1; });
		cmd('use', { member: account().run.team[0].id, value: 'expcandym' });
		const pending = account().run.pendingMoves.map(move => move.move);
		assert(pending.length > 0);
		while (account().run.pendingMoves.length) {
			cmd('learn', { member: account().run.pendingMoves[0].member, value: 'skip' });
		}
		cmd('abandon');
		for (const move of pending) assert(!starterMoves(account(), engine.content, 'popplio').includes(move));
	});
});
