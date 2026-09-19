'use strict';

// Isolated test data, deliberately absent from config/fantasy-rogue.ts.
const { fixedFloor } = require('../../dist/server/fantasy-rogue/content');
const stats = value => ({hp: value, atk: value, def: value, spa: value, spd: value, spe: value});
function set(species = 'Bulbasaur', ability = 'Overgrow', level = 5, moves = ['Tackle', 'Growl']) {
	return {species, ability, level, moves, nature: 'Hardy', item: '', evs: stats(0), ivs: stats(31), gender: 'M', name: species};
}
function content() {
	const wild = id => ({
		id, name: '测试草地', kind: 'wild', reward: {money: 30, items: {}},
		encounters: Array.from({length: 3}, () => ({
			name: '测试野怪', team: [set('Magikarp', 'Swift Swim', 1, ['Splash'])], style: 'balanced',
			catchable: true, catchChances: {pokeball: 1, failball: 0},
		})),
	});
	const floors = {};
	for (let floor = 1; floor <= 20; floor++) {
		const fixed = fixedFloor(floor);
		if (fixed === 'rest') {
			floors[floor] = [{id: 'center', name: '测试中心', kind: 'rest', encounters: [], reward: {money: 0, items: {}}}];
		} else if (fixed === 'boss') {
			floors[floor] = [{id: 'boss', name: '测试首领', kind: 'boss', reward: {money: 0, items: {}}, encounters: [{
				name: '测试首领', team: [set('Magikarp', 'Swift Swim', 5, ['Splash'])], style: 'balanced',
				catchable: false, catchChances: {},
			}]}];
		} else {
			floors[floor] = [wild('grass'), {...wild('lake'), name: '测试湖泊'}, {...wild('grove'), name: '测试林地'}];
		}
	}
	return {
		version: 'test-only-v1', initialMoney: 100, initialBag: {pokeball: 10, failball: 2},
		items: [
			{id: 'pokeball', name: '测试必捕球', kind: 'ball', price: 10},
			{id: 'failball', name: '测试失败球', kind: 'ball', price: 10},
			{id: 'revive', name: '活力碎片', kind: 'revive', price: 20, amount: 0.5},
		],
		starters: [
			{id: 'bulbasaur', set: set(), availableInitially: true},
			{id: 'magikarp', set: set('Magikarp', 'Swift Swim', 5, ['Splash']), availableInitially: false},
			{id: 'mew', set: set('Mew', 'Synchronize', 5, ['Pound']), availableInitially: false},
		],
		unlocks: {magikarp: {starter: 'magikarp', captures: 1}, gyarados: {starter: 'magikarp', captures: 1}, mew: {starter: 'mew', captures: 10}},
		floors,
	};
}
module.exports = {content, set, stats};
