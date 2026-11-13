'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { content, set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { chooseCollection, collectionView, stonePrice } = require('../../dist/server/fantasy-rogue/collection-events');
const { settleRival } = require('../../dist/server/fantasy-rogue/rivals');
const { settleCoopRival, chooseCoopRival } = require('../../dist/server/fantasy-rogue/coop-rivals');
const { inventoryItem } = require('../../dist/server/fantasy-rogue/team');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');

function run(chapter = 5) {
	const r = { id: randomUUID(), contentVersion: 'test', floor: 81, phase: 'event', encounter: 0, attempt: 0,
		spirit: 'hoopagift', affectionVersion: 1, spiritVersion: 1, difficulty: 0, boosts: stats(0), caught: [],
		team: [createRoguePokemon(set(), stats(0))], money: 30000, bag: {},
		trainerBonds: { nemona: { score: 0, gifts: [], pending: [] } },
		rival: { id: 'nemona', completed: chapter - 1, lastFloor: 60, affection: 0 },
		node: { id: 'test', name: '测试', kind: 'event', encounters: [{ team: [set()] }], reward: { money: 0, items: {} },
			event: { id: 'rivalstory', key: 'shared-event', stage: 'battle', rival: { chapter } } } };
	normalizeBlessings(r); return r;
}
function stone(items = [{ id: 'leftovers', name: '吃剩的东西', kind: 'held', price: 1000 }]) {
	const r = run(), data = content(); data.items = items;
	r.node.event = { id: 'stones', key: 'stone-visit', stage: 'choice' };
	return { r, data };
}
const never = () => { throw new Error('unexpected roll'); };

describe('Fantasy Rogue stone and rival Mew rewards', () => {
	it('records each stone separately across single and five purchases without changing their prices', () => {
		const { r, data } = stone();
		let conversions = 0;
		const random = max => max === 100 ? 50 : max === 2 ? conversions++ % 2 : 0;
		chooseCollection(r, data, random, 'stone:1');
		r.node.event.key = 'new-step';
		chooseCollection(r, data, random, 'stone:5');
		assert.equal(r.money, 30000 - 6 * stonePrice(81)); assert.equal(r.node.event.stonesOpened, 6);
		assert.equal(conversions, 6); assert.equal(r.bag.fantasypowerlens, 3); assert.equal(r.bag.leftovers, 3);
		assert.deepEqual(Object.keys(r.spiritConversions), Array.from({ length: 6 }, (_, i) => `stone:81:${i}`));
		assert(r.node.event.result[0].includes('其中 2 件'));
		assert(r.node.event.result[0].includes(inventoryItem(data, 'fantasypowerlens').name));
		assert(collectionView(r).options[0].text.includes('50%'));
	});
	it('leaves empty stones empty and does not create item rolls for them', () => {
		const { r, data } = stone();
		chooseCollection(r, data, max => max === 100 ? 49 : never(), 'stone:5');
		assert.deepEqual(r.bag, {}); assert(!r.spiritConversions); assert.equal(r.node.event.stonesOpened, 5);
		assert(r.node.event.result[0].includes('空石'));
	});
	for (const [id, kind, premium] of [
		['firestone', 'evolution', false], ['pearl', 'treasure', false],
		['charizarditex', 'held', true], ['firiumz', 'held', false], ['rogueuniversalmegastone', 'held', false],
	]) it(`does not convert the excluded stone prize ${id}`, () => {
		const { r, data } = stone([{ id, name: id, kind, price: premium ? 3000 : 1000 }]);
		const random = max => max === 100 ? premium ? 99 : 50 : max === 1 ? 0 : never();
		chooseCollection(r, data, random, 'stone:1');
		assert.equal(r.bag[id], 1); assert(!r.spiritConversions);
	});
	it('does not convert existing Fantasy equipment or add it to the stone pool', () => {
		const { r, data } = stone([{ id: 'fantasypowerlens', name: '幻想道具', kind: 'held', price: 1000 }]);
		chooseCollection(r, data, max => max === 100 ? 50 : never(), 'stone:1');
		assert.deepEqual(r.bag, {}); assert(!r.spiritConversions);
	});
	it('completes the original exclusive item search even when the actual prize is transformed', () => {
		const { r, data } = stone([{ id: 'lightball', name: '电气球', kind: 'held', price: 1000 }]);
		r.team = [createRoguePokemon(set('Pikachu', 'Static'), stats(0))];
		chooseCollection(r, data, max => max === 100 ? 50 : 0, 'stone:1');
		assert.equal(r.bag.fantasypowerlens, 1); assert(!r.bag.lightball); assert(r.exclusiveItems.lightball.obtained);
	});
	it('preserves the non-Mew stone draw sequence', () => {
		const { r, data } = stone(); delete r.spirit;
		chooseCollection(r, data, max => max === 100 ? 50 : max === 1 ? 0 : never(), 'stone:5');
		assert.equal(r.bag.leftovers, 5); assert(!r.spiritConversions);
	});
	it('converts the chapter two belt while retaining healing, machines and candy', () => {
		const r = run(2), data = content();
		settleRival(r, () => 99, true, { content: data, random: () => 0 });
		assert.equal(r.bag.fantasypowerlens, 1); assert(!r.bag.expertbelt);
		assert.equal(r.bag.superpotion, 2); assert.equal(r.bag.roguetmprotect, 1);
		assert(Object.keys(r.bag).some(id => id.startsWith('expcandy')));
		assert.deepEqual(Object.keys(r.spiritConversions), ['rival:nemona:2:expertbelt:0']);
		assert(r.node.event.result.some(line => line.includes('梦幻的奇赠')));
	});
	it('draws all three chapter five berries independently and preserves retained originals', () => {
		const r = run(), data = content(); let calls = 0;
		settleRival(r, () => 99, true, { content: data, random: max => max === 2 ? calls++ % 2 : 0 });
		assert.equal(calls, 3); assert.equal(r.bag.fantasypowerlens, 2); assert.equal(r.bag.sitrusberry, 1);
		assert.equal(r.bag.abilitycapsule, 1); assert.equal(r.bag.superpotion, 2);
		assert.equal(r.spiritConversions['rival:nemona:5:sitrusberry:1'], 'sitrusberry');
	});
	it('shares the three common conversions and does not shift world-event random replay', () => {
		const runs = [run(), run()], data = content(); let calls = 0;
		const random = max => max === 2 ? calls++ % 2 : max === 100 ? 99 : 0;
		settleCoopRival(runs, random, true, { content: data, random });
		assert.equal(calls, 3); assert.deepEqual(runs[0].bag, runs[1].bag);
		assert.deepEqual(runs[0].spiritConversions, runs[1].spiritConversions);
		assert.equal(runs[0].bag.fantasypowerlens, 2);
	});
	it('keeps a personal milestone independent of common rewards resolved by a search choice', () => {
		const runs = [run(), run()], data = content(); let calls = 0;
		runs[0].trainerBonds.nemona.score = runs[0].rival.affection = 49;
		for (const r of runs) {
			r.node.event.stage = 'choice';
			Object.assign(r.node.event.rival, { step: 'search', task: 'search', answer: 0, found: [] });
		}
		chooseCoopRival(runs, data, max => max === 2 ? calls++ % 2 : max === 100 ? 99 : 0, 'search:0');
		assert.equal(calls, 4);
		assert.equal(runs[0].bag.fantasypowerlens, runs[1].bag.fantasypowerlens + 1);
		for (let i = 0; i < 3; i++) {
			const key = `rival:nemona:5:sitrusberry:${i}`;
			assert.equal(runs[0].spiritConversions[key], runs[1].spiritConversions[key]);
		}
	});
	it('does not award equipment or roll conversions after a lost chapter', () => {
		const r = run();
		settleRival(r, never, false, { content: content(), random: never });
		assert(!r.spiritConversions); assert(!r.bag.sitrusberry); assert.equal(r.bag.superpotion, 1);
	});
	it('requires runtime dependencies for newly earned Mew chapter equipment', () => {
		const r = run(), before = structuredClone(r);
		assert.throws(() => settleRival(r, never, true), /缺少道具配置/); assert.deepEqual(r, before);
	});

	describe('actual solo shop challenge settlement', () => {
		let store, engine, halves;
		const account = () => store.get('mew-shop');
		const command = (action, extra = {}) => engine.command('mew-shop', {
			id: randomUUID(), revision: account().revision, action, ...extra,
		});
		beforeEach(() => {
			halves = 0; store = new RogueStore(':memory:');
			engine = new RogueEngine(store, content(), max => max === 2 ? halves++ % 2 : 0);
			command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
			store.change('mew-shop', a => {
				a.run.spirit = 'hoopagift'; a.run.spiritVersion = 1;
				a.run.node.shopChallenge = { rewards: { leftovers: 2, revive: 1 }, closed: false };
			});
			command('battle'); halves = 0;
		});
		afterEach(() => { store.close(); });
		function settle(won) {
			const r = account().run;
			const result = { encounterId: r.battle.encounterId, won, team: r.team, bag: r.bag };
			const apply = () => engine.settle('mew-shop', r.battle.token, result);
			apply(); return apply;
		}
		it('shows actual converted and retained prizes and never grants them again on duplicate results', () => {
			const before = account().run.bag, again = settle(true), saved = account();
			assert.deepEqual(saved.run.lastReward.items, { fantasypowerlens: 1, leftovers: 1, revive: 1 });
			assert.equal(saved.run.bag.fantasypowerlens, 1); assert.equal(saved.run.bag.leftovers, 1);
			assert.equal(saved.run.bag.revive, (before.revive || 0) + 1);
			assert.equal(saved.run.spiritConversions['shopchallenge:1:leftovers'], 'fantasypowerlens');
			assert.equal(saved.run.spiritConversions['shopchallenge:1:leftovers:1'], 'leftovers');
			again(); assert.deepEqual(account(), saved);
		});
		it('keeps failed challenges empty in both inventory and receipt', () => {
			const before = account().run.bag; settle(false);
			assert.deepEqual(account().run.bag, before); assert.deepEqual(account().run.lastReward.items, {});
			assert(!account().run.spiritConversions);
		});
	});
});
