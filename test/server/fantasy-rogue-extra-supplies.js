'use strict';
const assert = require('assert').strict;
const { addBattleSupply, battleSupplyPlan, prepareEconomy } = require('../../dist/server/fantasy-rogue/economy');
const { set } = require('../fixtures/fantasy-rogue');

describe('Additive early and midgame battle supplies', () => {
	for (const [floor, chance] of [[1, 20], [29, 20], [30, 20], [59, 20], [60, 15], [99, 15], [100, 10], [149, 10], [150, 0], [200, 0]]) {
		it(`adds at most one item with exact ${chance}% probability on floor ${floor}`, () => {
			let total = 0;
			for (let roll = 0; roll < 100; roll++) {
				let calls = 0;
				const items = { nugget: 2 };
				addBattleSupply(items, floor, max => { calls++; return max === 100 ? roll : 0; });
				assert.equal(items.nugget, 2);
				total += Object.values(items).reduce((a, b) => a + b, 0) - 2;
				if (!chance) assert.equal(calls, 0);
			}
			assert.equal(total, chance); assert.equal(battleSupplyPlan(floor).chance, chance);
		});
	}
	for (const kind of ['wild', 'elite', 'trainer']) it(`persists ${kind} supply rolls without refresh rerolls`, () => {
		const node = { kind, encounters: [{ team: [set()], ...(kind === 'trainer' ? { trainer: { id: 'test' } } : {}) }], reward: { money: 100, items: {} } };
		prepareEconomy(node, 30, () => 0);
		assert.equal((node.wildLoot?.[0] || node.reward.items).superpotion, 1);
		const before = structuredClone(node);
		prepareEconomy(node, 30, () => { throw Error('reroll'); }); assert.deepEqual(node, before);
	});
});
