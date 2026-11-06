'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { rebalanceCandyReward, candyExperience, candyRewardPreview,
	grantCandyTraining } = require('../../dist/server/fantasy-rogue/candy-rewards');
const { routeCandyReward, grantEventTraining, restCandyOffer } = require('../../dist/server/fantasy-rogue/early-balance');
const { prepareEconomy } = require('../../dist/server/fantasy-rogue/economy');
const { rewardChoices, rewardMoney } = require('../../dist/server/fantasy-rogue/reward-scenes');
const { challengeNode, prepareChallengePrizes, chooseChallengePrize,
	optionalChallengeView } = require('../../dist/server/fantasy-rogue/optional-challenges');
const { chooseLuckEvent } = require('../../dist/server/fantasy-rogue/luck-events');
const { syncGrowthParty, GROWTH_LIMITS } = require('../../dist/server/fantasy-rogue/growth');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { content, set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue free candy budgets and late training conversion', () => {
	const runAt = floor => ({ floor, phase: 'reward', bag: {}, money: 0, boosts: stats(0),
		team: [createRoguePokemon(set(), stats(0))], box: [], notices: [], caught: [] });
	it('conserves the reduced budget through conversion without removing small gifts or advancing candy grades', () => {
		for (let floor = 1; floor <= 200; floor++) for (const kind of ['trainer', 'elite', 'event', 'reward']) {
			const original = { ...routeCandyReward(floor, kind), potion: 2 };
			const saved = structuredClone(original), before = candyExperience(original);
			const reward = rebalanceCandyReward(floor, original), after = candyExperience(reward.items);
			assert.deepEqual(original, saved); assert.equal(reward.items.potion, 2);
			assert(after > 0 && after <= before);
			assert(Math.abs(after + (reward.candyTraining || 0) * 1000 - before * (floor > 150 ? 0.9 : 0.96)) <= 50);
			if (floor <= 150) assert.equal(reward.candyTraining, undefined);
			else assert((reward.candyTraining || 0) * 1000 <= (after + (reward.candyTraining || 0) * 1000) / 10);
			for (const [id, from] of [['expcandys', 30], ['expcandym', 50], ['expcandyl', 100], ['expcandyxl', 150]]) {
				if (floor < from) assert(!reward.items[id]);
			}
		}
		assert.deepEqual(rebalanceCandyReward(200, { expcandyxs: 1, ether: 1 }).items, { ether: 1, expcandyxs: 1 });
		assert.equal(rewardMoney(200), 38700, 'money alternative retains its independent baseline');
		assert.deepEqual(restCandyOffer(150), { id: 'expcandyxl', stock: 1, price: 12000 });
	});
	it('preserves prepared legacy drops and persists each encounter conversion without rerolling', () => {
		const legacy = { economyPrepared: true, kind: 'trainer', encounters: [{}],
			reward: { money: 500, items: { expcandyxl: 3 } } };
		const saved = structuredClone(legacy);
		prepareEconomy(legacy, 180, () => { throw Error('legacy reroll'); });
		assert.deepEqual(legacy, saved);
		const node = { kind: 'elite', encounters: [{ team: [] }, { team: [] }], reward: { money: 0, items: {} } };
		prepareEconomy(node, 180, max => max - 1);
		assert.equal(node.wildCandyTraining.length, 2);
		assert(node.wildCandyTraining.every(amount => amount > 0));
		const restored = JSON.parse(JSON.stringify(node));
		prepareEconomy(restored, 180, () => { throw Error('prepared reroll'); });
		assert.deepEqual(restored, node);
		const supplies = { kind: 'reward', encounters: [], reward: { money: 200, items: { expcandyxl: 10, potion: 1 } } };
		prepareEconomy(supplies, 180, () => { throw Error('supplies do not roll'); });
		assert.equal(supplies.reward.candyTraining, 27); assert.equal(candyExperience(supplies.reward.items), 243000);
		const prepared = structuredClone(supplies);
		prepareEconomy(supplies, 180, () => 0); assert.deepEqual(supplies, prepared);
	});
	it('refunds capped conversion, keeps preview pure, preserves HP and PP, and includes later recruits', () => {
		const run = runAt(180), reward = rebalanceCandyReward(180, { expcandyxl: 10 });
		run.growth = { offense: GROWTH_LIMITS.offense - 3, defense: 20, experience: 0 };
		syncGrowthParty(run); run.team[0].hp--; run.team[0].pp[0].pp = 1;
		const before = structuredClone(run), shown = candyRewardPreview(run, reward);
		assert.deepEqual(run, before); assert.equal(shown.amount, 3);
		assert.equal(candyExperience(shown.items) + shown.amount * 1000, 270000);
		const actual = grantCandyTraining(run, reward);
		assert.deepEqual(actual, shown); assert.equal(run.growth.offense, 12000); assert.equal(run.growth.defense, 23);
		assert.equal(run.team[0].hp, before.team[0].hp); assert.equal(run.team[0].pp[0].pp, 1);
		const newcomer = createRoguePokemon(set(), stats(0)); run.team.push(newcomer); syncGrowthParty(run);
		assert.equal(newcomer.statModifiers.training.atk, 1.2);
		assert.equal(newcomer.statModifiers.training.spd, 0.0023);
		assert.equal(candyRewardPreview(run, reward).amount, 0);
		assert.equal(candyExperience(candyRewardPreview(run, reward).items), 270000);
		assert.equal(grantCandyTraining(run, { items: { expcandyxl: 10 } }).effect, '', 'legacy grant is not converted');
	});
	it('credits a reward scene once through the engine command ledger and shows the actual training in its receipt', () => {
		const data = content(), full = createPreviewContent();
		data.items.push(...full.items.filter(item => !data.items.some(existing => existing.id === item.id)));
		data.floors[181] = structuredClone(data.floors[1]); data.floors[182] = structuredClone(data.floors[2]);
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, data, max => max - 1), user = 'candyreceipt';
			commandAfterOpening(engine, user, { id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'] });
			store.change(user, account => Object.assign(account.run, { floor: 181, phase: 'reward',
				node: { id: 'chest', kind: 'reward', name: '补给箱', encounters: [], reward: { money: 0, items: {} },
					rewardScene: { id: 'chest', key: 'candy-scene' } } }));
			const account = store.get(user), choice = rewardChoices(account.run).find(option => option.id === 'experience');
			assert(choice.candyTraining > 0); assert.match(choice.text, /本局双攻、双防/);
			const request = { id: randomUUID(), revision: account.revision, action: 'rewardchoice', value: 'experience' };
			engine.command(user, request);
			const finish = { id: randomUUID(), revision: store.get(user).revision, action: 'continue' };
			engine.command(user, finish);
			const paid = store.get(user);
			assert.equal(paid.run.growth.offense, choice.candyTraining);
			assert.equal(candyExperience(paid.run.bag), candyExperience(choice.items));
			assert.match(paid.run.lastReward.effect, /训练心得/);
			engine.command(user, finish); assert.deepEqual(store.get(user), paid);
		} finally { store.close(); }
	});
	it('keeps event aid single-use after reload and excludes blocked outcomes', () => {
		const run = runAt(180); run.node = { name: '事件', event: { settled: true } };
		grantEventTraining(run); assert(run.growth.offense > 0); assert.match(run.lastReward.effect, /训练心得/);
		const restored = JSON.parse(JSON.stringify(run)), before = structuredClone(restored);
		grantEventTraining(restored); assert.deepEqual(restored, before);
		const blocked = runAt(180); blocked.node = { event: { settled: true, trainingAidBlocked: true } };
		grantEventTraining(blocked); assert.equal(blocked.growth, undefined); assert.deepEqual(blocked.bag, {});
	});
	for (const kind of ['wild', 'trainer']) it(`pays single-player ${kind} conversion only once on a successful settlement`, () => {
		const data = content(), payout = rebalanceCandyReward(181, { expcandyxl: 10 });
		data.items.push(...createPreviewContent().items.filter(item => !data.items.some(existing => existing.id === item.id)));
		const node = structuredClone(data.floors[1][0]);
		node.kind = kind; node.economyPrepared = true;
		if (kind === 'trainer') {
			node.encounters = node.encounters.slice(0, 1); node.encounters[0].catchable = false;
		}
		node.reward = kind === 'wild' ? { money: 0, items: {} } : { money: 30, ...payout };
		if (kind === 'wild') { node.wildLoot = [payout.items, {}, {}]; node.wildCandyTraining = [payout.candyTraining, 0, 0]; }
		// Static content only permits treasure drops; candy is added by runtime economy preparation.
		data.floors[181] = structuredClone(data.floors[1]);
		data.floors[182] = structuredClone(data.floors[1]);
		const store = new RogueStore(':memory:');
		try {
			const user = 'candybattle', engine = new RogueEngine(store, data, max => max - 1);
			const cmd = (action, extra = {}) => commandAfterOpening(engine, user,
				{ id: randomUUID(), revision: store.get(user).revision, action, ...extra });
			cmd('start', { starters: ['bulbasaur'] });
			store.change(user, a => {
				a.run.floor = 181; a.run.choices = [node]; a.run.phase = 'choose';
			});
			cmd('select', { value: node.id }); cmd('battle');
			const run = store.get(user).run, token = run.battle.token;
			const result = { encounterId: run.battle.encounterId, won: true,
				team: run.team, bag: run.bag, defeated: [] };
			engine.settle(user, token, result);
			const paid = store.get(user);
			assert.equal(paid.run.growth.offense, 27); assert.equal(paid.run.growth.defense, 27);
			assert.equal(candyExperience(paid.run.bag), 243000); assert.match(paid.run.lastReward.effect, /训练心得/);
			engine.settle(user, token, result); assert.deepEqual(store.get(user), paid);
		} finally { store.close(); }
	});
	it('pays late challenge conversion separately from the existing victory bonus and prevents a second claim', () => {
		const run = runAt(180); run.phase = 'event'; run.node = challengeNode('dojoinvitation', 180);
		prepareChallengePrizes(run, () => 0);
		const prize = run.node.challenge.prizes.find(entry => entry.id === 'supplies');
		assert(prize.candyTraining > 0);
		run.node.challenge.stage = 'won'; chooseChallengePrize(run, 'supplies');
		assert.equal(run.growth.offense, 100 + prize.candyTraining);
		assert.equal(candyExperience(run.bag), candyExperience(prize.items));
		assert.match(run.lastReward.effect, /训练心得/);
		const before = structuredClone(run);
		assert.throws(() => chooseChallengePrize(run, 'supplies'), /胜利后/); assert.deepEqual(run, before);
		const capped = runAt(180); capped.phase = 'event'; capped.node = challengeNode('dojoinvitation', 180);
		capped.growth = { offense: 11950, defense: 11950, experience: 0 };
		prepareChallengePrizes(capped, () => 0);
		const shown = optionalChallengeView(capped).prizes.find(p => p.id === 'supplies');
		assert.match(shown.effect, /保留为糖果/);
		capped.node.challenge.stage = 'won'; chooseChallengePrize(capped, 'supplies');
		assert.equal(candyExperience(capped.bag), candyExperience(shown.items));
	});
	it('keeps the Delibird parcel multiplier and converts its training once, without reducing other items', () => {
		const run = runAt(180); run.phase = 'event'; normalizeBlessings(run);
		run.node = { event: { id: 'delibirddice', key: 'dice', stage: 'choice' } };
		const expected = rebalanceCandyReward(180, routeCandyReward(180, 'reward'));
		chooseLuckEvent(run, createPreviewContent(), max => max - 1, 'roll');
		assert.equal(candyExperience(run.bag), candyExperience(expected.items) * 4);
		assert.equal(run.bag.ether, 1); assert.equal(run.growth.offense, expected.candyTraining * 4);
		assert(run.node.event.result.some(line => line.includes('训练心得')));
		const before = structuredClone(run);
		assert.throws(() => chooseLuckEvent(run, createPreviewContent(), () => 0, 'roll'), /更新/);
		assert.deepEqual(run, before);
	});
});
