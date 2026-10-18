'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { migrateRetiredBalls } = require('../../dist/server/fantasy-rogue/capture-items');
const { prepareTrade } = require('../../dist/server/fantasy-rogue/trading');
const { rogueBallMultiplier, rogueBallCatchRate } = require('../../dist/sim/rogue-balls');
const { throwRogueBall } = require('../../dist/sim/fantasy-rogue');
const { changeFriendship } = require('../../dist/server/fantasy-rogue/friendship');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue official ball rules and retired-ball migration', function () {
	this.timeout(20000);
	let battle, content, balls;
	before(() => {
		content = createPreviewContent();
		balls = content.items.filter(i => i.kind === 'ball').map(i => ({id: i.id, name: i.name, multiplier: i.multiplier, rule: i.ballRule}));
	});
	afterEach(() => { battle?.destroy(); battle = null; });
	const ball = id => balls.find(b => b.id === id);
	function start(playerSet = set('Pikachu', 'Static', 80), targetSet = set('Pikachu', 'Static', 20)) {
		const player = createRoguePokemon(playerSet, stats(0));
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: {encounterId: 'official-balls', team: [player], boosts: stats(0), bag: {friendball: 1, luxuryball: 1}, balls, catchable: true},
			p1: {team: [player.set]}, p2: {team: [targetSet]}});
		battle.makeChoices('team 1', 'team 1'); return battle.p2.active[0];
	}
	it('checks speed, level, opposite gender, fishing and Moon Stone families', () => {
		const target = start();
		assert.equal(rogueBallMultiplier(battle, ball('fastball')), 1);
		target.formeChange('Jolteon'); assert.equal(rogueBallMultiplier(battle, ball('fastball')), 4);
		target.formeChange('Pikachu');
		for (const [level, expected] of [[19, 1], [21, 2], [40, 4], [80, 8]]) {
			battle.p1.active[0].level = level; assert.equal(rogueBallMultiplier(battle, ball('levelball')), expected);
		}
		battle.p1.active[0].gender = 'M'; target.gender = 'F'; assert.equal(rogueBallMultiplier(battle, ball('loveball')), 8);
		target.gender = 'M'; assert.equal(rogueBallMultiplier(battle, ball('loveball')), 1);
		target.gender = ''; assert.equal(rogueBallMultiplier(battle, ball('loveball')), 1);
		assert.equal(rogueBallMultiplier(battle, ball('lureball')), 1);
		battle.fantasyRogue.captureEnvironment = {water: true, fishing: true};
		assert.equal(rogueBallMultiplier(battle, ball('lureball')), 4); assert.equal(rogueBallMultiplier(battle, ball('diveball')), 3.5);
		assert.equal(rogueBallMultiplier(battle, ball('moonball')), 1);
	});
	it('recognizes an entire Moon Stone evolution family', () => {
		start(set(), set('Cleffa'));
		assert.equal(rogueBallMultiplier(battle, ball('moonball')), 4);
	});
	it('applies Heavy Ball catch-rate adjustments rather than a generic multiplier', () => {
		const target = start();
		assert.equal(rogueBallCatchRate(battle, ball('heavyball'), 30), 10);
		assert.equal(rogueBallCatchRate(battle, ball('heavyball'), 3), 1);
		target.formeChange('Onix'); assert.equal(rogueBallCatchRate(battle, ball('heavyball'), 30), 50);
		target.formeChange('Groudon'); assert.equal(rogueBallCatchRate(battle, ball('heavyball'), 30), 60);
		assert.equal(rogueBallCatchRate(battle, ball('pokeball'), 30), 30);
	});
	it('records Friend Ball capture happiness and Luxury Ball gains without reducing fainting penalties', () => {
		start(); battle.randomChance = () => true; throwRogueBall(battle, 'friendball');
		assert.equal(battle.fantasyRogue.captured.set.happiness, 150);
		assert.equal(battle.fantasyRogue.captured.set.pokeball, 'friendball');
		const mon = createRoguePokemon({...set(), happiness: 70, pokeball: 'luxuryball'}, stats(0));
		changeFriendship(mon, 3); assert.equal(mon.set.happiness, 76);
		changeFriendship(mon, -5); assert.equal(mon.set.happiness, 71);
	});
	it('converts old bags once, removes custom stock and adds missing official stock without refilling sold items', () => {
		const bag = () => ({roguetypeballfire: 3, roguetypeballwater: 2, ultraball: 4});
		const run = {floor: 50, bag: bag(), checkpoint: {bag: bag()}, postgame: {before: {bag: bag()}},
			preview: {result: {bag: bag()}}, lastReward: {items: bag()}, choices: [],
			node: {kind: 'trade', trade: {kind: 'balls', purchases: 15, stock: [{id: 'pokeball', price: 225, remaining: 0}, {id: 'roguetypeballfire', remaining: 15}]}}};
		migrateRetiredBalls(run); migrateRetiredBalls(run); prepareTrade(run, content, () => 0);
		for (const actual of [run.bag, run.checkpoint.bag, run.postgame.before.bag, run.preview.result.bag, run.lastReward.items]) assert.deepEqual(actual, {ultraball: 9});
		assert.equal(run.notices.length, 1); assert.equal(run.node.trade.stock.length, 24);
		assert.equal(run.node.trade.purchases, 15); assert.equal(run.node.trade.stock.find(i => i.id === 'pokeball').remaining, 0);
		assert(!run.node.trade.stock.some(i => i.id.startsWith('roguetypeball')));
	});
});
