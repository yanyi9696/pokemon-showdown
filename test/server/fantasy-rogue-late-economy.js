'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { encounterCoins, eliteTreasureBudget, eventRewardBudget, eventCost, emergencyCost,
	grantEventTraining, journeyCoins } = require('../../dist/server/fantasy-rogue/early-balance');
const { TREASURES, rollWildLoot, prepareEconomy } = require('../../dist/server/fantasy-rogue/economy');
const { expectedWildLoot } = require('../../dist/server/fantasy-rogue/events');
const { rewardMoney, rewardSceneView, chooseReward } = require('../../dist/server/fantasy-rogue/reward-scenes');
const { settleRival } = require('../../dist/server/fantasy-rogue/rivals');
const { set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue income from floor 81', function () {
	this.timeout(20000);
	let content;
	before(() => { content = createPreviewContent(); });
	// Challenge routes now carry part of encounter income; other route budgets,
	// floor-81 extra wild drops and late recovery remain unchanged.
	const baseline = [
		[1, 550, 150, 541.344375, 100, 254.4],
		[40, 1500, 750, 1660.18125, 250, 254.4],
		[80, 2000, 1200, 2672.00856, 900, 511.05],
		[81, 2250, 1350, 3063.3396757891205, 1350, 572.376],
		[100, 3150, 1800, 4641.4368, 3000, 572.376],
		[150, 6150, 3750, 11112.48684, 16750, 2744.28],
		[200, 9250, 5700, 19665.828, 38700, 4999.68],
	];
	it('slows midgame income and applies late income once, including smoothed reward choice budgets', () => {
		for (const [floor, trainer, elite, event, reward, wild] of baseline) {
			const sources = [
				[encounterCoins(floor), trainer, 50], [eliteTreasureBudget(floor), elite, 150],
				[eventRewardBudget(floor), event, 1e-8],
				[expectedWildLoot(floor), wild, 1e-8],
			];
			for (const [actual, previous, rounding] of sources) {
				assert(Math.abs(actual - previous) < Math.min(rounding, 1e-7), `${floor}: ${actual} / ${previous}`);
			}
			assert.equal(rewardMoney(floor), reward, `reward choice at ${floor}`);
		}
		for (let floor = 1; floor <= 200; floor++) {
			assert.equal(eventCost(floor), Math.round((350 + 20 * floor + 0.15 * floor * floor) * 0.9 / 50) * 50);
			assert.equal(emergencyCost(floor), Math.ceil((1800 + 45 * floor) / 100) * 100);
		}
		assert.equal(TREASURES.find(item => item.id === 'nugget').sellPrice, 3000);
	});
	it('raises expected wild sale value by 12% without losing a base drop or rerolling a saved route', () => {
		for (const floor of [80, 81, 100, 121, 161, 200]) {
			const originalCount = floor < 161 ? 1 : 2;
			let total = 0;
			for (let roll = 0; roll < 100; roll++) {
				const loot = rollWildLoot(floor, max => max === 100 ? roll : 0);
				assert(loot.tinymushroom >= originalCount);
				total += loot.tinymushroom;
			}
			assert.equal(total, originalCount * (floor >= 81 ? 112 : 100));
			const node = { kind: 'wild', reward: { money: 0, items: {} }, encounters: [{ team: [] }] };
			prepareEconomy(node, floor, () => 0);
			const saved = structuredClone(node);
			prepareEconomy(node, floor, () => { throw Error('must not reroll'); });
			assert.deepEqual(node, saved);
		}
	});
	it('shows the increased reward before selection and keeps selection and event aid single-use', () => {
		for (const floor of [80, 81, 100, 150, 200]) {
			const run = { floor, phase: 'reward', money: 0, boosts: stats(0), bag: {},
				team: [createRoguePokemon(set(), stats(0))],
				node: { kind: 'reward', name: '补给', reward: { money: 0, items: {} }, rewardScene: { id: 'chest', key: 'chest' } } };
			const view = rewardSceneView(run), choice = view.choices.find(entry => entry.id === 'money');
			const base = Number(view.baseText.match(/以及 (\d+) 金币/)[1]);
			chooseReward(run, content, () => 0, 'money');
			assert.equal(run.node.reward.money, base + choice.money);
			assert.throws(() => chooseReward(run, content, () => 0, 'money'), /待领取/);
			run.node.event = { settled: true };
			grantEventTraining(run);
			const saved = structuredClone(run);
			grantEventTraining(run);
			assert.deepEqual(run, saved);
			assert.equal(run.money, run.lastReward.money);
		}
	});
	it('also increases rival chapter travel funds at the same boundary', () => {
		for (const floor of [80, 81, 100, 150]) {
			const run = { floor, phase: 'event', money: 0, boosts: stats(0), bag: {}, encounter: 0,
				team: [createRoguePokemon(set(), stats(0))], rival: { id: 'marnie', completed: 1, affection: 0, lastFloor: 1 },
				node: { name: '并肩阻敌', kind: 'adventure', encounters: [{}], event: { id: 'rivalstory', stage: 'battle', rival: { chapter: 2 } } } };
			settleRival(run, max => max - 1, true);
			assert.equal(run.money, journeyCoins(floor, (180 + floor * 14) * 1.15));
		}
	});
	it('credits the boosted gym prize exactly once through engine settlement and reload', () => {
		const store = new RogueStore(':memory:');
		try {
			const user = 'lateeconomy', engine = new RogueEngine(store, content, max => max - 1);
			const command = (action, extra = {}) => commandAfterOpening(engine, user,
				{ id: randomUUID(), revision: store.get(user).revision, action, ...extra });
			command('start', { starters: ['bulbasaur'] });
			store.change(user, account => {
				const run = account.run;
				run.floor = 120; run.phase = 'choose';
				run.encounter = 0; run.attempt = 0;
				delete run.node; delete run.choices; delete run.battle;
			});
			command('select', { value: 'boss' });
			const before = store.get(user).run;
			assert.equal(before.node.reward.money, journeyCoins(120, 5600));
			command('battle');
			const run = store.get(user).run;
			const result = { encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag };
			engine.settle(user, run.battle.token, result);
			assert.equal(store.get(user).run.money, before.money + before.node.reward.money);
			const paid = store.get(user);
			engine.settle(user, run.battle.token, result);
			assert.deepEqual(store.get(user), paid);
			engine.migrate(user);
			assert.equal(store.get(user).run.money, paid.run.money);
		} finally { store.close(); }
	});
});
