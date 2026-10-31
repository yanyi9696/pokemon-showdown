'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {compoundPoints} = require('../../dist/sim/rogue-compound');
const {stats, set} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue deferred Compound V', () => {
	let store, engine, content;
	const user = 'compoundstorageqa';
	before(() => { content = {...createPreviewContent(), story: false}; });
	afterEach(() => { store?.close(); });
	function cmd(action, value, extra = {}) {
		return engine.command(user, {id: randomUUID(), revision: store.get(user).revision, action, value, ...extra});
	}
	function start() {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content, () => 0);
		cmd('start', undefined, {starters: ['bulbasaur'], difficulty: 0});
		store.change(user, account => {
			const run = account.run;
			run.floor = 50; run.phase = 'blessing'; run.blessingRewardResume = 'ready';
			run.team = [createRoguePokemon(set('Paras', 'Effect Spore', 30, ['Scratch']), stats(0))];
			run.blessings.owned = [{...blessing('compoundgold'), floor: 50}];
			run.blessings.pending = [{id: 'compound-claim', blessing: 'compoundgold', kind: 'compound', title: '五号化合物·金', compound: {}}];
			delete run.blessings.round; delete run.blessings.beforeAdventure; delete run.blessings.stage;
			delete run.story; delete run.dialogue; delete run.pendingMoves;
		});
		engine.migrate(user);
	}
	it('stores the reward across reloads, resumes its original page, and prevents repeat allocation', () => {
		start(); const before = store.get(user).run.team;
		cmd('blessingreward', 'store', {member: 'compound-claim'});
		let run = store.get(user).run;
		assert.equal(run.phase, 'ready'); assert.equal(run.blessings.pending.length, 0);
		assert.deepEqual(run.team, before); assert(!run.blessings.owned[0].completed);
		engine = new RogueEngine(store, content, () => 0); engine.migrate(user);
		cmd('usecompound', 'compoundgold'); run = store.get(user).run;
		assert.equal(run.phase, 'blessing'); assert.equal(run.blessingRewardResume, 'ready');
		const reward = run.blessings.pending[0].id;
		assert.throws(() => cmd('usecompound', 'compoundgold'));
		cmd('blessingreward', run.team[0].id, {member: reward});
		cmd('blessingreward', 'allocate', {member: reward, evs: {...stats(0), atk: compoundPoints('Parasect', 'gold')}});
		run = store.get(user).run;
		assert.equal(run.phase, 'ready'); assert.equal(run.blessingRewardResume, undefined);
		assert.equal(run.blessings.owned[0].completed, true);
		assert.equal(run.team[0].compound.finalSpecies, 'Parasect');
		assert.throws(() => cmd('usecompound', 'compoundgold'));
	});
	it('rejects combat, unresolved rewards, and ineligible teams without consuming the stored reward', () => {
		start(); cmd('blessingreward', 'store', {member: 'compound-claim'});
		for (const phase of ['battle', 'story', 'complete', 'defeated']) {
			store.change(user, account => { account.run.phase = phase; });
			assert.throws(() => cmd('usecompound', 'compoundgold'));
			assert(!store.get(user).run.blessings.owned[0].completed);
		}
		store.change(user, account => {
			account.run.phase = 'ready'; account.run.pendingMoves = [{member: account.run.team[0].id, move: 'tackle'}];
		});
		assert.throws(() => cmd('usecompound', 'compoundgold'));
		store.change(user, account => {
			delete account.run.pendingMoves;
			account.run.team = [createRoguePokemon(set('Mew', 'Synchronize', 30, ['Pound']), stats(0))];
		});
		assert.throws(() => cmd('usecompound', 'compoundgold'), /没有符合/);
		assert.equal(store.get(user).run.blessings.pending.length, 0);
	});
});
