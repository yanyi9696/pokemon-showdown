'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {commandAfterOpening} = require('../fixtures/fantasy-rogue');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {RogueManager} = require('../../dist/server/fantasy-rogue/manager');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {shopStock} = require('../../dist/server/fantasy-rogue/trading');
const {CANDY_SHOP, restCandyOffer} = require('../../dist/server/fantasy-rogue/early-balance');
const {experienceProgress, createRoguePokemon, initializeExperience, gainExperience} = require('../../dist/server/fantasy-rogue/progression');
const {experienceAtLevel, rogueSpeciesData, levelAtExperience} = require('../../dist/sim/fantasy-rogue-rules');

describe('Fantasy Rogue rest candy and batch training', function () {
	this.timeout(20000);
	let store, engine, content;
	const user = 'resttraining';
	const account = () => store.get(user);
	const cmd = (action, details = {}) => commandAfterOpening(engine, user, {
		id: randomUUID(), revision: account().revision, action, ...details,
	});
	const rest = floor => store.change(user, a => {
		a.run.floor = floor; a.run.phase = 'rest'; a.run.node = structuredClone(content.floors[floor][0]);
		a.run.money = 1000000;
	});
	beforeEach(() => {
		store = new RogueStore(':memory:'); content = createPreviewContent(); engine = new RogueEngine(store, content, () => 0);
		cmd('start', {starters: ['bulbasaur']}); rest(9);
	});
	afterEach(() => store.close());
	it('offers only the current grade, with less stock than a random candy shop and no free candy', () => {
		const bag = account().run.bag;
		for (const [floor, id, stock] of [[9, 'expcandyxs', 2], [19, 'expcandyxs', 3], [29, 'expcandyxs', 4],
			[39, 'expcandys', 1], [49, 'expcandys', 2], [79, 'expcandym', 2], [89, 'expcandym', 3],
			[119, 'expcandyl', 1], [129, 'expcandyl', 2], [159, 'expcandyxl', 1], [169, 'expcandyxl', 1], [199, 'expcandyxl', 2]]) {
			rest(floor); const candies = shopStock(content, account().run).filter(item => item.kind === 'candy');
			assert.equal(candies.length, 1); assert.equal(candies[0].id, id); assert.equal(candies[0].remaining, stock);
			assert.equal(candies[0].price, CANDY_SHOP[id].price); assert(stock < CANDY_SHOP[id].stock);
			assert.deepEqual(account().run.bag, bag);
		}
	});
	it('persists limited purchases and sold-out state, rejects overbuying atomically, and resets only at a new shop', () => {
		const old = account().run, request = {id: randomUUID(), revision: account().revision, action: 'buy', value: 'expcandyxs'};
		engine.command(user, request); engine.command(user, request);
		assert.equal(account().run.money, old.money - 80);
		assert.equal(account().run.bag.expcandyxs, (old.bag.expcandyxs || 0) + 1);
		for (let i = 1; i < restCandyOffer(9).stock; i++) cmd('buy', {value: 'expcandyxs'});
		for (let i = 0; i < 3; i++) engine.migrate(user);
		assert.equal(shopStock(content, account().run).find(i => i.id === 'expcandyxs').remaining, 0);
		const exhausted = account(); assert.throws(() => cmd('buy', {value: 'expcandyxs'}), /售罄/);
		assert.deepEqual(account(), exhausted);
		rest(19); assert.equal(shopStock(content, account().run).find(i => i.id === 'expcandyxs').remaining, 3);
	});
	it('publishes price, quantity and growth thresholds without mutating the save or shared content', () => {
		const before = account(), item = structuredClone(content.items.find(i => i.id === 'expcandyxs'));
		const manager = new RogueManager(engine);
		const oldAccess = Config.fantasyrogue; Config.fantasyrogue = { enabled: true, publicAccess: true };
		const state = manager.state({id: user, name: user, named: true, registered: true, connected: true});
		Config.fantasyrogue = oldAccess;
		assert(state.shopItems.includes('expcandyxs'));
		assert.equal(state.items.find(i => i.id === 'expcandyxs').remaining, 2);
		assert.equal(state.items.find(i => i.id === 'expcandyxs').price, 80);
		assert.equal(state.run.team[0].experienceProgress.levels.length, 100);
		assert.deepEqual(content.items.find(i => i.id === 'expcandyxs'), item);
		assert.deepEqual(account(), before);
	});
	it('shares the center quota between coin and HP purchases without removing Meowth special stock', () => {
		rest(29); store.change(user, a => {a.run.spirit = 'yveltal';});
		const mon = account().run.team[0]; cmd('buyhp', {value: 'expcandyxs', member: mon.id});
		assert.equal(shopStock(content, account().run).find(i => i.id === 'expcandyxs').remaining, 3);
		cmd('buy', {value: 'expcandyxs'});
		assert.equal(shopStock(content, account().run).find(i => i.id === 'expcandyxs').remaining, 2);
		store.change(user, a => {a.run.spirit = 'meowth';});
		const special = shopStock(content, account().run).find(i => i.id === 'expcandyxs');
		assert.equal(special.remaining, undefined); assert.equal(special.price, 325);
	});
	it('consumes a batch once, preserves damage/PP and still offers all learned moves and evolution', () => {
		store.change(user, a => {
			a.run.bag.expcandyxs = 50; const m = a.run.team[0]; m.hp -= 3; m.pp[0].pp = 1;
		});
		const before = account().run.team[0], request = {id: randomUUID(), revision: account().revision,
			action: 'use', member: before.id, value: 'expcandyxs', count: 40};
		engine.command(user, request); engine.command(user, request);
		const run = account().run, mon = run.team[0];
		assert.equal(run.bag.expcandyxs, 10); assert.equal(mon.experience, before.experience + 4000);
		assert.equal(mon.maxhp - mon.hp, 3); assert.equal(mon.pp.find(p => p.id === before.pp[0].id).pp, 1);
		assert(mon.evolutionNotice); assert.equal(mon.set.species, 'Bulbasaur');
		const expected = structuredClone(before), other = {...structuredClone(run), pendingMoves: [], notices: []};
		gainExperience(other, expected, 4000);
		assert.deepEqual(mon.moveMemory, expected.moveMemory); assert.deepEqual(run.pendingMoves, other.pendingMoves);
	});
	it('rejects invalid quantities, missing inventory and batch use on non-candy without consuming anything', () => {
		store.change(user, a => {a.run.bag.expcandyxs = 10; a.run.bag.potion = 10;});
		const mon = account().run.team[0];
		for (const count of [0, -1, 1.5, 11, NaN, Infinity, '3']) {
			const before = account(); assert.throws(() => cmd('use', {value: 'expcandyxs', member: mon.id, count}), /数量/);
			assert.deepEqual(account(), before);
		}
		assert.throws(() => cmd('use', {value: 'potion', member: mon.id, count: 2}), /仅经验糖果/);
	});
	it('stops at level 100 without consuming unused candy', () => {
		store.change(user, a => {
			const mon = a.run.team[0], growth = rogueSpeciesData(mon.set.species).growth;
			mon.set.level = 99; mon.experience = experienceAtLevel(growth, 100) - 50;
			a.run.bag.expcandyxs = 10;
		});
		cmd('use', {value: 'expcandyxs', member: account().run.team[0].id, count: 10});
		assert.equal(account().run.team[0].set.level, 100); assert.equal(account().run.bag.expcandyxs, 9);
	});
	it('uses the same growth thresholds as actual leveling for all six growth groups', () => {
		const groups = new Set();
		for (const species of ['Bulbasaur', 'Magikarp', 'Clefairy', 'Caterpie', 'Shroomish', 'Nincada']) {
			const mon = createRoguePokemon({...account().run.team[0].set, species, level: 15}, account().run.boosts);
			initializeExperience(mon); const exp = experienceProgress(mon), growth = rogueSpeciesData(species).growth;
			groups.add(growth);
			for (const amount of [100, 800, 4000, 30000, 3000000]) {
				const total = Math.min(exp.levels[99], exp.total + amount); let predicted = 1;
				while (predicted < 100 && total >= exp.levels[predicted]) predicted++;
				assert.equal(predicted, levelAtExperience(growth, total));
			}
		}
		assert.equal(groups.size, 6);
	});
});
