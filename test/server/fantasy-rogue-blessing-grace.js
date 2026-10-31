'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { stats, set } = require('../fixtures/fantasy-rogue');
const b = require('../../dist/server/fantasy-rogue/blessings');
const { blessingLevelsAt, blessingLevelStart, activateBlessingLevels } = require('../../dist/server/fantasy-rogue/blessing-levels');
const { bossRoster } = require('../../dist/server/fantasy-rogue/story');

describe('Fantasy Rogue blessing grace period', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); });
	function fixture(floor = 1) {
		const run = {id: 'grace', floor, phase: 'blessing', team: [createRoguePokemon(set(), stats(0))],
			boosts: stats(0), bag: {}, money: 0, caught: [], encounter: 0, attempt: 0};
		b.normalizeBlessings(run);
		return {run, account: {run, revision: 0, points: 0, slots: 2, boosts: stats(0), captures: {}, unlocked: []}};
	}
	function choose(account, id) {
		const run = account.run, def = blessing(id);
		run.phase = 'blessing';
		run.blessings.round = {floor: run.floor, tier: def.tier, remaining: 1, options: [{id, chosen: false, refreshes: 1}], familiesSeen: [def.family]};
		b.handleBlessingCommand(account, run, content, {action: 'blessing', slot: 0}, () => 0);
	}
	for (const [floor, startsAt, normal, boss] of [[1, 11, 0, 10], [50, 61, 10, 20], [100, 111, 20, 30], [150, 161, 30, 40]]) {
		it(`keeps the ${floor} selection inactive through ${startsAt - 1} and activates once at ${startsAt}`, () => {
			const {account, run} = fixture(floor);
			choose(account, 'speedpower');
			assert.equal(blessingLevelStart(floor), startsAt);
			assert.equal(run.blessings.levels, 0); assert.equal(run.blessings.bossLevels, 0);
			assert.deepEqual(run.blessings.deferredLevels, [{floor, startsAt, normal, boss}]);
			run.floor = startsAt - 1; b.normalizeBlessings(run);
			assert.deepEqual(blessingLevelsAt(run), {normal: 0, boss: 0});
			const restored = JSON.parse(JSON.stringify(run)); restored.floor = startsAt;
			b.normalizeBlessings(restored);
			assert.deepEqual(blessingLevelsAt(restored), {normal, boss});
			const saved = JSON.parse(JSON.stringify(restored));
			b.normalizeBlessings(restored); activateBlessingLevels(restored);
			assert.deepEqual(restored, saved, 'reloads and repeated normalization do not charge twice');
		});
	}
	it('preserves legacy active costs and charges only the outer Fate at the original rate', () => {
		const {account, run} = fixture(100);
		run.blessings.levels = 7; run.blessings.bossLevels = 19;
		choose(account, 'fategold');
		assert.equal(run.blessings.owned.length, 2);
		assert.equal(run.blessings.deferredLevels.length, 1);
		assert.deepEqual(blessingLevelsAt(run, 110), {normal: 7, boss: 19});
		assert.deepEqual(blessingLevelsAt(run, 111), {normal: 17, boss: 34});
		assert.equal(run.blessings.levels, 7); assert.equal(run.blessings.bossLevels, 19);
	});
	it('does not invent a grace period or recalculate a legacy owned list', () => {
		const {run} = fixture(73);
		run.blessings.levels = 15; delete run.blessings.bossLevels;
		run.blessings.owned = [{...blessing('speedpower'), floor: 50}];
		b.normalizeBlessings(run);
		assert.deepEqual(blessingLevelsAt(run), {normal: 15, boss: 15});
		assert(!run.blessings.deferredLevels);
	});
	it('previews future costs without mutating the current save or base roster', () => {
		const {run, account} = fixture(50); choose(account, 'speedpower');
		const node = {id: 'preview', name: '馆主', kind: 'boss', encounters: [{team: [set('Bulbasaur', 'Overgrow', 30)]}]};
		run.bossPreviews = {60: structuredClone(node), 80: structuredClone(node)};
		const before = structuredClone(run);
		assert.deepEqual(bossRoster(run, 60).levels, [30]);
		assert.deepEqual(bossRoster(run, 80).levels, [50]);
		assert.deepEqual(run, before);
	});
	it('records exact active capture offsets and never inflates an encounter twice', () => {
		const {account, run} = fixture(50); choose(account, 'speedpower');
		const node = () => ({id: 'grass', kind: 'wild', encounters: [{catchable: true, team: [set('Bulbasaur', 'Overgrow', 30)]}]});
		run.floor = 60; run.node = node(); b.prepareBlessingEncounter(run, () => 0);
		assert.deepEqual(run.node.encounters[0].blessingLevelOffsets, [0]);
		run.floor = 61; b.beginBlessingFloor(run, () => 0); run.node = node();
		b.prepareBlessingEncounter(run, () => 0); b.prepareBlessingEncounter(run, () => 0);
		const encounter = run.node.encounters[0];
		assert.equal(encounter.team[0].level, 40);
		assert.deepEqual(encounter.blessingLevelOffsets, [10]);
		assert.equal(encounter.team[0].level - encounter.blessingLevelOffsets[0], 30);
	});
	it('retains the deferred receipt across actual store migration and duplicate commands', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content, () => 0), user = 'graceqa';
			engine.command(user, {id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur']});
			store.change(user, account => {
				account.run.blessings.round = {floor: 1, tier: 'prismatic', remaining: 1,
					options: [{id: 'speedpower', chosen: false, refreshes: 1}], familiesSeen: ['speedpower']};
			});
			const command = {id: randomUUID(), revision: store.get(user).revision, action: 'blessing', slot: 0};
			engine.command(user, command); engine.command(user, command);
			const before = store.get(user); engine.migrate(user);
			assert.deepEqual(store.get(user), before);
			assert.equal(before.run.blessings.deferredLevels.length, 1);
			assert.equal(before.run.blessings.bossLevels, 0);
		} finally {store.close();}
	});
});
