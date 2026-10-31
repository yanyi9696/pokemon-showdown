'use strict';
const assert = require('assert').strict;
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty, blessingCandidates } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { grantCompanion, companionExperience } = require('../../dist/server/fantasy-rogue/companions');
const { gainAffection, affectionScene, affectionCommand, affectionFloor } = require('../../dist/server/fantasy-rogue/affection');
const { companionTravelGift, affectionThemeGift } = require('../../dist/server/fantasy-rogue/affection-gifts');
const { COMPANIONS } = require('../../dist/sim/rogue-companions');
const { TRAVELLERS } = require('../../dist/server/fantasy-rogue/traveller-profiles');
const { prepareFloorEnvironment } = require('../../dist/server/fantasy-rogue/floor-environment');
const { catchupPlan, catchupRoutes } = require('../../dist/server/fantasy-rogue/late-support');
const { chooseReward } = require('../../dist/server/fantasy-rogue/reward-scenes');
const { prepareTrade, shopStock } = require('../../dist/server/fantasy-rogue/trading');
const { routeCandyReward, restCandyOffer } = require('../../dist/server/fantasy-rogue/early-balance');
const { candySupplyMultiplier, coinSupplyMultiplier } = require('../../dist/server/fantasy-rogue/resource-pacing');
const { stats, set } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue October 27 pacing and companion regressions', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); });
	function run(levels = [5], floor = 50) {
		const r = { id: 'pacing', floor, phase: 'ready', bag: {}, money: 0, boosts: stats(0),
			team: levels.map(level => createRoguePokemon(set('Eevee', 'Run Away', level), stats(0))) };
		syncBlessingParty(r); return r;
	}
	it('soft-weights Detect by the current move pool, including memory, but not future learning or boxed partners', () => {
		const r = run(), m = r.team[0], weight = () => blessingCandidates(r, content).find(b => b.family === 'detect').appearanceWeight;
		m.set.species = 'Meditite'; // Can learn Detect later, but cannot equip it yet.
		assert.equal(weight(), 20);
		m.moveMemory.push({ id: 'detect', pp: 0, maxpp: 5 }); assert.equal(weight(), 100);
		m.moveMemory = []; m.set.moves = ['Detect']; assert.equal(weight(), 100);
		m.set.moves = ['Tackle']; m.blessingMoves = ['detect']; assert.equal(weight(), 100);
		m.egg = { remainingFloors: 10 }; assert.equal(weight(), 20);
		delete m.egg; delete m.blessingMoves;
		r.box = [{ ...m, set: { ...m.set, moves: ['Detect'] } }]; assert.equal(weight(), 20);
	});
	it('makes Paradise gold and grants either AI a single 30 percent battle EXP bonus to every partner', () => {
		assert.equal(blessing('companionai').tier, 'gold');
		assert(blessing('companionai').text.includes('30%'));
		for (const id of ['sada', 'turo']) {
			const r = run([10, 20]); grantCompanion(r, id);
			for (const m of r.team) {
				assert.equal(companionExperience(r, m, { species: 'Magikarp' }), 1.3);
				assert.equal(companionExperience(r, m, { species: 'Magikarp', captured: true }), 1.3);
			}
			r.blessings.companions[0].away = true;
			assert.equal(companionExperience(r, r.team[0], { species: 'Magikarp' }), 1);
			r.blessings.companions = [{ id: 'sada' }, { id: 'turo' }];
			assert.equal(companionExperience(r, r.team[0], { species: 'Magikarp' }), 1.3);
		}
	});
	it('gives both AIs the same once-per-run affection stages, improved second gift and daily supplies', () => {
		for (const id of ['sada', 'turo']) {
			const r = run(); grantCompanion(r, id);
			gainAffection(r, id, 50, 'first');
			const scene = affectionScene(r); assert.equal(scene.stage, 50);
			assert.equal(r.bag.elixir, 1); assert(scene.text.includes('PP 全项小补剂'));
			affectionCommand(r, { member: id, value: 'thanks' });
			gainAffection(r, id, 50, 'second'); assert.equal(affectionScene(r).stage, 100);
			assert.equal(r.bag.maxelixir, 1); assert.equal(r.bag.rarecandy, 2); assert.equal(r.bag.goldbottlecap, 1);
			assert(r.blessings.pending.some(p => p.kind === 'item' && p.options.length > 10));
			gainAffection(r, id, 100, 'repeat'); assert.equal(r.bag.rarecandy, 2);
			affectionFloor(r, () => 0); affectionFloor(r, () => 0); assert.equal(r.bag.expcandyxs, 1);
		}
	});
	it('keeps ordinary travel gifts modest and distinct from every 50-point themed gift', () => {
		for (const floor of [1, 30, 60, 120, 200]) {
			const gift = companionTravelGift(floor);
			assert(['potion', 'superpotion', 'hyperpotion'].includes(gift.id));
			for (const id of new Set([...Object.keys(COMPANIONS), ...Object.keys(TRAVELLERS)])) {
				assert.notEqual(gift.id, affectionThemeGift(id, 50).id, id);
			}
		}
	});
	it('reduces independent environment frequency, makes overlap rare, and favors compatible enemies', () => {
		let seed = 27;
		const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * max); };
		const r = { floor: 1, choices: [{ encounters: [{ team: [set('Pelipper', 'Drizzle')] }] }] };
		let weather = 0, terrain = 0, both = 0, rain = 0;
		for (let floor = 1; floor <= 20000; floor++) {
			r.floor = floor; prepareFloorEnvironment(r, random);
			weather += !!r.environment.weather; terrain += !!r.environment.terrain;
			both += !!(r.environment.weather && r.environment.terrain); rain += r.environment.weather === 'raindance';
		}
		assert(weather > 3700 && weather < 4300); assert(terrain > 2200 && terrain < 2700);
		assert(both > 140 && both < 270); assert(rain / weather > 0.75);
		const saved = structuredClone(r.environment);
		prepareFloorEnvironment(r, () => { throw Error('saved environment must not reroll'); });
		assert.deepEqual(r.environment, saved);
	});
	it('helps all lagging members of a large party, caps lessons, and leaves an overlevelled carry alone', () => {
		const large = run([20, 20, 20, 20, 20, 20], 60);
		assert.equal(catchupPlan(large).length, 6);
		large.phase = 'reward'; large.node = { kind: 'reward', encounters: [], reward: { money: 0, items: {} }, rewardScene: { id: 'catchup', key: 'lesson' } };
		chooseReward(large, content, () => 0, 'catchup');
		assert.deepEqual(large.team.map(p => p.set.level), [23, 23, 23, 23, 23, 23]);
		const small = run([60, 39, 20], 60), plan = catchupPlan(small);
		assert.deepEqual(plan.map(p => p.level), [23, 40]); assert(!plan.some(p => p.member === small.team[0].id));
		const strong = run([45, 45, 45, 45], 60); assert.deepEqual(catchupPlan(strong), []);
		const routes = [{ id: 'wild', kind: 'wild' }, { id: 'shop', kind: 'trade' }];
		assert.deepEqual(catchupRoutes(strong, routes, [{ id: 'lesson', kind: 'reward' }]), routes);
	});
	it('reduces opening candy stock without repricing old bags or rerolling saved stock, and recovers late supply', () => {
		assert.equal(restCandyOffer(19).stock, 3); assert.equal(restCandyOffer(39).stock, 1);
		assert.equal(candySupplyMultiplier(160), 1); assert.equal(coinSupplyMultiplier(160), 1);
		const r = run([5], 20); r.bag = { expcandyxs: 30, nugget: 2 }; r.money = 99999;
		r.node = { kind: 'trade', trade: { kind: 'candy', stock: [], purchases: 0 } };
		prepareTrade(r, content, () => 0); assert.equal(r.node.trade.stock[0].remaining, 12);
		const saved = structuredClone(r);
		prepareTrade(r, content, () => { throw Error('do not reroll'); }); assert.deepEqual(r, saved);
		const xp = floor => Object.entries(routeCandyReward(floor, 'elite')).reduce((sum, [id, n]) => sum + content.items.find(i => i.id === id).amount * n, 0);
		assert(xp(20) < 1000 && xp(40) < 3000); assert(xp(160) > 100000);
	});
	it('sells Peat Block at the same evolution shop tier as Black Augurite', () => {
		const peat = content.items.find(i => i.id === 'peatblock'), stone = content.items.find(i => i.id === 'blackaugurite');
		assert.equal(peat.kind, 'evolution'); assert.equal(peat.shopFloor, stone.shopFloor);
		const r = run([5], stone.shopFloor - 1); r.node = { kind: 'rest' };
		assert(!shopStock(content, r).some(i => i.id === peat.id));
		r.floor = stone.shopFloor; assert(shopStock(content, r).some(i => i.id === peat.id));
	});
});
