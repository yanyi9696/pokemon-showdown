'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Personal move weather', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function create(ability = 'Chao Ji Yu Shui', weather = '', move = 'watergun', options = {}) {
		battle?.destroy();
		battle = new Battle({
			format: new Format({ name: 'Personal weather test', mod: 'gen9fantasy', ruleset: [], gameType: 'singles' }),
			seed: [1, 2, 3, 4], strictChoices: true,
			p1: { team: [{ species: 'Mew', ability, moves: [move], ...options.attacker }] },
			p2: { team: [{ species: 'Mew', ability: 'No Ability', moves: ['splash'], ...options.defender }] },
		});
		battle.randomizer = damage => damage;
		battle.randomChance = (numerator, denominator) => numerator >= denominator;
		if (weather) battle.field.setWeather(weather, battle.p1.active[0]);
		return battle.p1.active[0];
	}
	function damage(ability, weather, move, options) {
		create(ability, weather, move, options);
		const target = battle.p2.active[0];
		const hp = target.hp;
		battle.makeChoices();
		return hp - target.hp;
	}
	for (const [ability, weather, move] of [
		['Chao Ji Yu Shui', 'raindance', 'watergun'],
		['Chao Ji Yu Shui', 'raindance', 'ember'],
		['Mega Sol', 'sunnyday', 'ember'],
		['Mega Sol', 'sunnyday', 'watergun'],
	]) {
		for (const actual of ['', 'sunnyday', 'raindance']) {
			it(`${ability}: ${move} under ${actual || 'clear'} matches ${weather} once`, () => {
				const expected = damage('No Ability', weather, move);
				assert.equal(damage(ability, actual, move), expected);
				assert.equal(battle.field.weather, actual);
			});
		}
	}
	for (const move of ['thunder', 'hurricane', 'bleakwindstorm', 'wildboltstorm', 'sandsearstorm']) {
		it(`personal rain makes ${move} accurate even in sun and at -6 accuracy`, () => {
			const source = create('Chao Ji Yu Shui', 'sunnyday', move);
			source.boosts.accuracy = -6;
			battle.makeChoices();
			assert(battle.p2.active[0].hp < battle.p2.active[0].maxhp);
			assert(!battle.log.some(line => line.startsWith('|-miss|')));
		});
	}
	for (const weather of ['', 'sunnyday', 'sandstorm', 'snowscape']) {
		it(`personal rain makes Weather Ball Water/100 in ${weather || 'clear'}`, () => {
			const source = create('Chao Ji Yu Shui', weather, 'weatherball');
			battle.makeChoices();
			assert.equal(source.lastMoveUsed.type, 'Water');
			assert.equal(source.lastMoveUsed.basePower, 100);
		});
	}
	it('does not borrow rain accuracy when the opponent is the ability holder', () => {
		create('No Ability', '', 'thunder', { defender: { ability: 'Chao Ji Yu Shui' } });
		battle.makeChoices();
		assert(battle.log.some(line => line.startsWith('|-miss|')));
	});
	it('does not activate a target weather-dependent ability', () => {
		create('Chao Ji Yu Shui', '', 'watergun', { defender: { ability: 'Dry Skin' } });
		const target = battle.p2.active[0];
		target.hp -= 100;
		battle.makeChoices();
		assert.equal(target.hp, target.maxhp - 100 + Math.floor(target.maxhp / 4));
		assert.equal(battle.field.weather, '');
	});
	it('is suppressed by Gastro Acid and Neutralizing Gas, but not Cloud Nine', () => {
		const normal = damage('No Ability', '', 'watergun');
		create(); battle.p1.active[0].addVolatile('gastroacid');
		const target = battle.p2.active[0]; battle.makeChoices();
		assert.equal(target.maxhp - target.hp, normal);
		assert.equal(damage('Chao Ji Yu Shui', '', 'watergun', { defender: { ability: 'Neutralizing Gas' } }), normal);
		const rain = damage('No Ability', 'raindance', 'watergun');
		assert.equal(damage('Chao Ji Yu Shui', 'sunnyday', 'watergun', { defender: { ability: 'Cloud Nine' } }), rain);
	});
	it('uses rain healing without installing global rain', () => {
		const source = create('Chao Ji Yu Shui', 'sunnyday', 'synthesis');
		source.hp = 1;
		battle.makeChoices();
		assert.equal(source.hp, 1 + Math.round(source.maxhp / 4));
		assert.equal(battle.field.weather, 'sunnyday');
	});
	for (const [weather, species, move] of [['sandstorm', 'Sudowoodo', 'psychic'], ['snowscape', 'Glaceon', 'tackle']]) {
		it(`ignores ${weather} defensive bonus only for the holder's move`, () => {
			const options = { defender: { species, ability: 'No Ability' } };
			const clear = damage('No Ability', '', move, options);
			assert.equal(damage('Chao Ji Yu Shui', weather, move, options), clear);
			assert(damage('No Ability', weather, move, options) < clear);
		});
	}
	it('retains real field weather between moves and does not give opponents the boost', () => {
		create('Chao Ji Yu Shui', 'sunnyday', 'watergun', { defender: { moves: ['watergun'] } });
		battle.makeChoices();
		const source = battle.p1.active[0], target = battle.p2.active[0];
		assert.equal(source.maxhp - source.hp, 17);
		assert.equal(target.maxhp - target.hp, 52);
		assert(battle.log.some(line => line === '|-activate|p1a: Mew|ability: Chao Ji Yu Shui'));
		assert(!battle.log.some(line => line.startsWith('|-weather|RainDance')));
	});
	it('treats personal sun Thunder/Hurricane as 50 accuracy even when the field is rainy', () => {
		for (const move of ['thunder', 'hurricane']) {
			const source = create('Mega Sol', 'raindance', move);
			battle.makeChoices();
			assert.equal(source.lastMoveUsed.accuracy, 50);
			assert(battle.log.some(line => line.startsWith('|-miss|')));
		}
	});
	it('skips solar charging under personal sun, but keeps it under personal rain', () => {
		for (const move of ['solarbeam', 'solarblade']) {
			create('Mega Sol', 'raindance', move);
			battle.makeChoices();
			assert(battle.p2.active[0].hp < battle.p2.active[0].maxhp);
			create('Chao Ji Yu Shui', 'sunnyday', move);
			battle.makeChoices();
			assert.equal(battle.p2.active[0].hp, battle.p2.active[0].maxhp);
		}
	});
	it('personal weather is not negated by Utility Umbrella on either battler', () => {
		const rain = damage('No Ability', 'raindance', 'watergun');
		for (const side of ['attacker', 'defender']) {
			assert.equal(damage('Chao Ji Yu Shui', 'sunnyday', 'watergun', { [side]: { item: 'Utility Umbrella' } }), rain);
		}
	});
	it('does not give Blizzard snow accuracy to a personal-weather holder', () => {
		for (const ability of ['Chao Ji Yu Shui', 'Mega Sol']) {
			const source = create(ability, 'snowscape', 'blizzard');
			battle.makeChoices();
			assert.equal(source.lastMoveUsed.accuracy, 70);
			assert(battle.log.some(line => line.startsWith('|-miss|')));
		}
	});
	it('uses the same rain damage through the native Showdex calculator', () => {
		const { calculateFantasyDamage: calc } = require('../../../dist/server/fantasy-calc/engine');
		for (const move of ['watergun', 'ember', 'weatherball', 'hydrosteam']) {
			const input = { attacker: { species: 'Mew', ability: 'No Ability' }, defender: { species: 'Mew' }, move };
			const expected = calc({ ...input, weather: 'Rain Dance' }).damage;
			assert.deepEqual(calc({ ...input, weather: 'Sunny Day', attacker: { ...input.attacker, ability: 'Chao Ji Yu Shui' } }).damage, expected);
		}
	});
	it('supports Rogue extra personal weather without double weather damage', () => {
		const expected = damage('No Ability', 'raindance', 'watergun');
		create('No Ability', 'sunnyday', 'watergun');
		// An extra ability is the same native volatile used by companion Lana.
		battle.fantasyRogue = {};
		const source = battle.p1.active[0];
		source.addVolatile('ability:chaojiyushui');
		assert(source.hasAbility('chaojiyushui'));
		const target = battle.p2.active[0];
		battle.actions.useMove('watergun', source, { target });
		assert.equal(target.maxhp - target.hp, expected);
		battle.fantasyRogue = undefined;
	});
	it('keeps rain priority when Rogue grants both personal weather abilities', () => {
		const expected = damage('No Ability', 'raindance', 'watergun');
		create('Mega Sol', 'sunnyday', 'watergun');
		battle.fantasyRogue = {};
		const source = battle.p1.active[0], target = battle.p2.active[0];
		source.addVolatile('ability:chaojiyushui');
		battle.actions.useMove('watergun', source, { target });
		assert.equal(target.maxhp - target.hp, expected);
		battle.fantasyRogue = undefined;
	});
	it('does not grant sand-only move effects to personal rain or sun', () => {
		for (const ability of ['Chao Ji Yu Shui', 'Mega Sol']) {
			const source = create(ability, 'sandstorm', 'shoreup');
			source.hp = 1;
			battle.actions.useMove('shoreup', source);
			assert.equal(source.hp, 1 + Math.floor(source.maxhp / 2));
		}
	});
	for (const ability of ['Chao Ji Yu Shui', 'Mega Sol']) {
		for (const [weather, move] of [['primordialsea', 'ember'], ['desolateland', 'watergun']]) {
			it(`${ability} preserves ${weather}'s prohibition of ${move}`, () => {
				create(ability, weather, move);
				battle.makeChoices();
				assert.equal(battle.p2.active[0].hp, battle.p2.active[0].maxhp);
				assert(battle.log.some(line => line.startsWith('|-fail|p1a:')));
			});
		}
	}
});
