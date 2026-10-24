'use strict';
const assert = require('assert').strict;
const { PRNG } = require('../../dist/sim/prng');
const { difficultyScale, difficultyRewardScale } = require('../../dist/sim/rogue-difficulty');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { prepareEconomy, TREASURES } = require('../../dist/server/fantasy-rogue/economy');
const { shopStock } = require('../../dist/server/fantasy-rogue/trading');
const { eventFragmentTier, offerEventFragments, claimEventFragments } = require('../../dist/server/fantasy-rogue/event-fragments');
const { rewardChoices } = require('../../dist/server/fantasy-rogue/reward-scenes');
const { normalizeBlessings, completeBlessingFloor } = require('../../dist/server/fantasy-rogue/blessings');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { grantEventTraining } = require('../../dist/server/fantasy-rogue/early-balance');
const { stats, set } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue progressive difficulty rewards', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); });
	const run = (difficulty, floor) => ({ id: 'rewards', difficulty, floor, phase: 'ready', team: [createRoguePokemon(set(), stats(0))],
		boosts: stats(0), money: 0, bag: {}, notices: [], caught: [] });
	const node = kind => ({ kind, encounters: [{ team: [set()], ...(kind === 'trainer' ? { trainer: { role: 'traveller' } } : {}) }], reward: { money: 1000, items: {} } });
	const xp = items => Object.entries(items).reduce((sum, [id, n]) => sum + n * ({ expcandyxs: 100, expcandys: 800, expcandym: 3000, expcandyl: 10000, expcandyxl: 30000 }[id] || 0), 0);
	const money = items => Object.entries(items).reduce((sum, [id, n]) => sum + n * (TREASURES.find(t => t.id === id)?.sellPrice || 0), 0);
	it('leaves easy/zero payouts and RNG unchanged, and increases trainer budgets without duplicating them', () => {
		for (const floor of [1, 30, 50, 80, 100, 150, 200]) {
			for (const kind of ['wild', 'elite', 'trainer', 'boss']) {
				const a = node(kind), b = node(kind), c = node(kind); let callsA = 0, callsB = 0;
				prepareEconomy(a, floor, n => { callsA++; return n - 1; });
				prepareEconomy(b, floor, n => { callsB++; return n - 1; }, 'easy');
				prepareEconomy(c, floor, n => n - 1, 0);
				assert.deepEqual(a, b); assert.deepEqual(a, c); assert.equal(callsA, callsB);
			}
			const base = node('trainer'); prepareEconomy(base, floor, n => n - 1);
			let previous = base;
			for (let tier = 1; tier <= 5; tier++) {
				const n = node('trainer'); prepareEconomy(n, floor, x => x - 1, tier);
				assert(n.reward.money > previous.reward.money); assert(xp(n.reward.items) >= xp(previous.reward.items));
				assert(Math.abs(n.reward.money / base.reward.money - difficultyRewardScale(tier, floor)) < 0.002);
				const saved = structuredClone(n);
				prepareEconomy(n, floor, () => { throw Error('rerolled'); }, tier);
				assert.deepEqual(n, saved);
				previous = n;
			}
		}
	});
	it('raises expected wild treasure value without changing sale prices or turning every single drop into two', () => {
		const totals = [];
		for (const tier of [0, 5]) {
			const rng = new PRNG([101, 202, 303, 404]); let total = 0, single = 0;
			for (let i = 0; i < 20000; i++) {
				const n = node('wild'); prepareEconomy(n, 1, max => rng.random(max), tier);
				total += money(n.wildLoot[0]); if (Object.values(n.wildLoot[0]).reduce((a, b) => a + b, 0) === 1) single++;
			}
			totals.push(total); assert(single > 15000);
		}
		assert(totals[1] / totals[0] > 1.08 && totals[1] / totals[0] < 1.23, totals.join('/'));
		assert.equal(TREASURES.find(i => i.id === 'pearl').sellPrice, 600);
	});
	it('brings shop supplies forward while retaining prices, stock limits and unavailable unique items', () => {
		for (const [floor, id] of [[29, 'firestone'], [29, 'miracleseed'], [69, 'protein'], [89, 'expcandyl']]) {
			const base = run(0, floor), high = run(5, floor); base.node = { kind: 'rest' }; high.node = { kind: 'rest' };
			assert(!shopStock(content, base).some(i => i.id === id), `${floor}/${id} baseline`);
			const item = shopStock(content, high).find(i => i.id === id); assert(item, `${floor}/${id} high`);
			if (id === 'expcandyl') {
				assert(item.remaining > 0);
				high.node.restCandyPurchases = { [id]: item.remaining };
				assert.equal(shopStock(content, high).find(i => i.id === id).remaining, 0);
			} else {
				assert.equal(item.price, content.items.find(i => i.id === id).price);
			}
			assert(!shopStock(content, high).some(i => ['gmegawishingstar', 'masterball', 'goldbottlecap'].includes(i.id)));
			assert.deepEqual(shopStock(content, { ...base, difficulty: 'easy' }), shopStock(content, base));
		}
	});
	it('moves fragment thresholds and caps together, preserving persisted choice and bounded payouts', () => {
		assert.equal(eventFragmentTier(50), undefined); assert.equal(eventFragmentTier(35, 5), undefined);
		assert.deepEqual(eventFragmentTier(36, 5), { key: '51', min: 10, max: 14, cap: 36 });
		const r = run(5, 36); normalizeBlessings(r); r.node = { event: {} };
		assert(offerEventFragments(r, 'forest', () => 0)); const saved = JSON.parse(JSON.stringify(r));
		claimEventFragments(saved); assert.equal(saved.blessings.shards, 10); assert.equal(saved.eventFragments['51'], 10);
		saved.eventFragments['51'] = 30; assert.equal(offerEventFragments(saved, 'forest', () => 0), false);
		assert.throws(() => claimEventFragments(saved), /阶段碎片/);
	});
	it('pays a gym bonus only once for a real win and accelerates guaranteed shard completion moderately', () => {
		const first = [];
		for (const tier of [0, 1, 2, 3, 4, 5]) {
			const r = run(tier, 10), a = { points: 20 }; normalizeBlessings(r);
			for (let floor = 10; floor <= 160; floor += 10) {
				r.floor = floor; r.node = { kind: 'boss', encounters: [{ trainer: { role: floor % 20 ? 'elite' : 'gym' } }] };
				completeBlessingFloor(a, r, content, () => 0);
				const before = r.blessings.shards; completeBlessingFloor(a, r, content, () => 0); assert.equal(r.blessings.shards, before);
				if (before >= 100) { first.push(floor); break; }
			}
		}
		assert.equal(first[0], 120); assert.equal(first[5], 100); assert(first.every((n, i) => !i || n <= first[i - 1]));
		const lost = run(5, 20); normalizeBlessings(lost); lost.node = { kind: 'boss', companionLoss: true, encounters: [{ trainer: { role: 'gym' } }] };
		completeBlessingFloor({ points: 20 }, lost, content, () => 0); assert.equal(lost.blessings.shards, 0);
	});
	it('scales selectable supplies and event training, but not permanent growth or blessing odds', () => {
		const a = run(0, 65), b = run(5, 65); b.team = structuredClone(a.team);
		for (const r of [a, b]) r.node = { kind: 'reward', rewardScene: { id: 'chest', key: 'x' }, reward: { money: 0, items: {} } };
		const ca = rewardChoices(a), cb = rewardChoices(b); assert(!ca.some(c => c.id === 'shards')); assert(cb.some(c => c.id === 'shards'));
		assert(cb.find(c => c.id === 'money').money > ca.find(c => c.id === 'money').money);
		assert.deepEqual(ca.filter(c => ['offense', 'defense', 'efficiency'].includes(c.id)), cb.filter(c => ['offense', 'defense', 'efficiency'].includes(c.id)));
		for (const r of [a, b]) {
			r.node.event = { settled: true };
			grantEventTraining(r);
			const paid = r.money;
			grantEventTraining(r);
			assert.equal(r.money, paid);
		}
		assert(b.money > a.money);
		assert.equal(difficultyScale(5, 200), 1.25); assert.equal(difficultyScale(5, 200, true), 1.5);
	});
});
