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
// Older focused tests start at route selection with no blessing effects. Keep that explicit
// fixture boundary; the opening suite and 200-floor smoke use unwrapped real commands.
function commandAfterOpening(engine, user, command) {
	const result = engine.command(user, command);
	if (result.run?.floor !== 1 || result.run.phase !== 'blessing' || !result.run.blessings?.beforeAdventure) return result;
	return engine.store.change(user, account => {
		delete account.run.blessings.beforeAdventure;
		delete account.run.blessings.round;
		engine.enterFloor(account.run);
	});
}
function chooseCompanions(engine, user, cmd) {
	const { companionView } = require('../../dist/server/fantasy-rogue/companions');
	let run = engine.store.get(user).run;
	for (const [family, members, choice] of [
		['companionai', ['sada', 'turo'], 'chooseai'], ['companionstreamer', ['iono', 'canari'], 'choosestreamer'],
		['companionwinter', ['grusha', 'rika'], 'choosewinter'], ['companionband', ['marnie', 'roxie'], 'chooseband'],
	]) {
		if (run.blessings?.owned.some(b => b.family === family) && !run.blessings.companions?.some(c => members.includes(c.id))) {
			cmd('companion', {member: members[0], value: choice});
		}
	}
	for (let n = 0; n < 8; n++) {
		run = engine.store.get(user).run;
		const entry = companionView(run).find(c => !c.ability && (!c.type && c.typeOptions.some(t => t.member) || c.abilityOptions.length));
		if (!entry) return;
		const type = !entry.type && entry.typeOptions.find(t => t.member);
		cmd('companion', {member: entry.id, value: type ? 'type:' + type.id : 'ability:' + entry.abilityOptions[0]});
	}
	throw new Error('Unresolved companion choices');
}
// Select an authored event through the current weighted pool, without coupling to array order.
function eventRoll(run, id) {
	const { chooseEvent } = require('../../dist/server/fantasy-rogue/events');
	let maximum;
	chooseEvent(run, n => { maximum = n; return 0; });
	for (let roll = 0; roll < maximum; roll++) if (chooseEvent(run, () => roll) === id) return roll;
	throw new Error(`Event ${id} is unavailable at floor ${run.floor}`);
}
function prepareCompanionParty(run, family, level = 50) {
	const types = require('../../dist/sim/rogue-companions').companionFamilyTypes(family);
	if (!types.length) return;
	const names = {Fire: 'Charmander', Water: 'Squirtle', Ice: 'Snorunt', Rock: 'Rockruff', Ground: 'Diglett',
		Steel: 'Magnemite', Fighting: 'Machop', Ghost: 'Gastly', Electric: 'Pikachu', Bug: 'Caterpie', Dragon: 'Dratini',
		Dark: 'Poochyena', Poison: 'Ekans', Fairy: 'Clefairy', Flying: 'Pidgey', Grass: 'Bulbasaur', Psychic: 'Abra'};
	const { Dex } = require('../../dist/sim/dex');
	const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
	const species = Dex.mod('gen9fantasy').species.get(names[types[0]]);
	run.team[0] = createRoguePokemon(set(species.name, species.abilities[0], level), run.boosts);
}
function compoundCommand(run, reward) {
	const { compoundView } = require('../../dist/server/fantasy-rogue/compound');
	const view = compoundView(run, reward);
	return {member: reward.id, value: view.compound.stage === 'allocate' ? 'allocate' : view.options[0].id,
		...(view.compound.stage === 'allocate' ? {evs: {...stats(0), atk: view.compound.points}} : {})};
}
module.exports = { content, set, stats, commandAfterOpening, chooseCompanions, eventRoll, prepareCompanionParty, compoundCommand };
