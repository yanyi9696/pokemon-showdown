'use strict';
const assert = require('assert').strict;
const { EVENT_FRAGMENT_TIERS_V2, eventFragmentTier, offerEventFragments, claimEventFragments } =
	require('../../dist/server/fantasy-rogue/event-fragments');
const { rogueSaveCompatibilityIssues } = require('../../dist/server/fantasy-rogue/save-compatibility');
describe('Fantasy Rogue frontloaded event fragments', () => {
	it('keeps 215 total, moves 30 ahead of floor 100 and respects all boundaries', () => {
		assert.equal(EVENT_FRAGMENT_TIERS_V2.reduce((sum, tier) => sum + tier.cap, 0), 215);
		assert.equal(EVENT_FRAGMENT_TIERS_V2.filter(tier => tier.floor < 100).reduce((sum, tier) => sum + tier.cap, 0), 105);
		assert.equal(eventFragmentTier(25, 0, 2), undefined);
		for (const floor of [26, 50, 51, 79, 80, 99, 100, 149, 150, 200]) {
			assert.deepEqual(eventFragmentTier(floor, 0, 2), eventFragmentTier(floor, 5, 2));
		}
		assert.equal(eventFragmentTier(50, 0, 2).cap, 20);
		assert.equal(eventFragmentTier(51, 0, 2).cap, 40);
		assert.equal(eventFragmentTier(150, 0, 2).cap, 60);
	});
	it('retains legacy schedules and never reinterprets a saved legacy offer', () => {
		assert.equal(eventFragmentTier(50), undefined);
		assert.equal(eventFragmentTier(150).cap, 80);
		const run = { floor: 51, blessings: { shards: 0 }, node: { event: {} }, eventFragments: { '51': 20 } };
		assert(offerEventFragments(run, 'forest', () => 0));
		claimEventFragments(run); assert.equal(run.eventFragments['51'], 28);
		assert(!offerEventFragments(run, 'forest', () => 0));
	});
	it('spends each new tier budget once and rejects over-cap saved claims', () => {
		const run = { floor: 26, eventFragmentRuleVersion: 2, blessings: { shards: 0 }, node: { event: {} } };
		for (let i = 0; i < 5; i++) { assert(offerEventFragments(run, 'forest', () => 0)); claimEventFragments(run); }
		assert.equal(run.blessings.shards, 20); assert(!offerEventFragments(run, 'forest', () => 0));
		assert.throws(() => claimEventFragments(run), /奖励已更新/);
	});
	it('rejects an unknown saved fragment rule without normalizing it', () => {
		assert(rogueSaveCompatibilityIssues({ run: { eventFragmentRuleVersion: 3 } }).includes('unsupported-fragment-rule'));
	});
});
