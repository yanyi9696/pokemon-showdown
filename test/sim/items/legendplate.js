'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Legend Plate [Gen 9 Fantasy]', () => {
	let battle;
	let hits;
	afterEach(() => battle?.destroy());

	function create({ defender = {}, ally, currentType, weather = 'raindance' } = {}) {
		battle = new Battle({
			format: new Format({
				name: 'Fantasy Legend Plate test', effectType: 'Format', mod: 'gen9fantasy', ruleset: [],
				gameType: ally ? 'doubles' : 'singles',
			}),
			seed: [1, 2, 3, 4], strictChoices: true,
			p1: { team: [
				{ species: 'Arceus-Legend-Fantasy', ability: 'Chuan Shuo Zhi Li', item: 'Legend Plate', moves: ['judgment', 'splash'] },
				...(ally ? [{ species: 'Mew', ability: 'No Ability', moves: ['splash'] }] : []),
			] },
			p2: { team: [
				{ species: 'Lugia-Fantasy', ability: 'Yuan Hai Yang Liu', moves: ['splash'], ...defender },
				...(ally ? [ally] : []),
			] },
		});
		battle.randomizer = damage => damage;
		const arceus = battle.p1.active[0];
		if (currentType) arceus.setType(currentType, true);
		if (weather) battle.field.setWeather(weather, battle.p2.active[0]);
		hits = [];
		battle.onEvent('Damage', battle.format, (damage, target, source, move) => {
			if (move.id === 'judgment') {
				hits.push({ target, type: move.type, typeMod: target.getMoveHitData(move).typeMod, damage });
			}
		});
		return arceus;
	}

	function assertNeutralHit(arceus) {
		assert.equal(hits.length, 1);
		assert.equal(hits[0].target, battle.p2.active[0]);
		assert.equal(hits[0].typeMod, 0, 'Judgment should deal neutral damage after rain removes weaknesses');
		assert(hits[0].damage > 0);
		assert.equal(hits[0].type, arceus.getTypes()[0]);
		assert(battle.dex.types.names().every(type => battle.dex.getImmunity(hits[0].type, type)),
			'Without a weakness to exploit, prefer a type with no type-chart immunities');
	}

	for (const currentType of [undefined, 'Normal', 'Dragon', 'Electric', 'Grass', 'Ice']) {
		it(`should choose a neutral type without type-chart immunities in rain, starting from ${currentType || '???'}`, () => {
			const arceus = create({ currentType });
			battle.makeChoices('move judgment', 'move splash');
			assertNeutralHit(arceus);
		});
	}

	it('should apply the same preference in Primordial Sea', () => {
		const arceus = create({ currentType: 'Dragon', weather: 'primordialsea' });
		battle.makeChoices('move judgment', 'move splash');
		assertNeutralHit(arceus);
	});

	it('should keep an existing neutral type when it has no type-chart immunities', () => {
		const arceus = create({ currentType: 'Dark' });
		battle.makeChoices('move judgment', 'move splash');
		assertNeutralHit(arceus);
		assert.deepEqual(arceus.getTypes(), ['Dark']);
	});

	it('should hit Mega Audino after Follow Me redirects a neutral Judgment aimed at rainy Lugia', () => {
		const arceus = create({
			currentType: 'Dragon',
			ally: { species: 'Audino-Fantasy', ability: 'Healer', item: 'Audinite', moves: ['followme'] },
		});
		battle.makeChoices('move judgment 1, move splash', 'move splash, move followme mega');
		const audino = battle.p2.active[1];
		assert.equal(audino.species.name, 'Audino-Mega-Fantasy');
		assert.equal(hits.length, 1);
		assert.equal(hits[0].target, audino);
		assert(hits[0].damage > 0);
		assert(!arceus.hasType('Dragon'));
		assert.equal(battle.p2.active[0].hp, battle.p2.active[0].maxhp);
	});

	it('should still choose Electric for a 4x weakness, even when Follow Me redirects into a Ground type', () => {
		const arceus = create({
			weather: '',
			ally: { species: 'Gastrodon', ability: 'No Ability', moves: ['followme'] },
		});
		battle.makeChoices('move judgment 1, move splash', 'move splash, move followme');
		assert.deepEqual(arceus.getTypes(), ['Electric']);
		assert.equal(hits.length, 0);
		assert(battle.log.some(line => line.startsWith('|-immune|p2b: Gastrodon')));
		assert.equal(battle.p2.active[0].hp, battle.p2.active[0].maxhp);
	});

	it('should not inspect the other opponent to choose a neutral type', () => {
		const arceus = create({
			currentType: 'Dark',
			ally: { species: 'Audino-Fantasy', ability: 'Healer', moves: ['followme'] },
		});
		battle.makeChoices('move judgment 1, move splash', 'move splash, move followme');
		assert.deepEqual(arceus.getTypes(), ['Dark']);
		assert.equal(hits.length, 1);
		assert.equal(hits[0].target, battle.p2.active[1]);
		assert.equal(hits[0].typeMod, -1);
	});

	it('should use Electric again when rain ends', () => {
		const arceus = create({ currentType: 'Dark' });
		battle.makeChoices('move judgment', 'move splash');
		assertNeutralHit(arceus);
		battle.field.clearWeather();
		hits.length = 0;
		battle.makeChoices('move judgment', 'move splash');
		assert.deepEqual(arceus.getTypes(), ['Electric']);
		assert.equal(hits.length, 1);
		assert.equal(hits[0].typeMod, 2);
	});

	it('should still avoid the original target\'s ability immunity', () => {
		const arceus = create({ weather: '', defender: { ability: 'Volt Absorb' } });
		battle.makeChoices('move judgment', 'move splash');
		assert.deepEqual(arceus.getTypes(), ['Rock']);
		assert.equal(hits.length, 1);
		assert.equal(hits[0].typeMod, 1);
	});

	it('should not change type for a move other than Judgment', () => {
		const arceus = create({ currentType: 'Dragon' });
		battle.makeChoices('move splash', 'move splash');
		assert.deepEqual(arceus.getTypes(), ['Dragon']);
		assert.equal(hits.length, 0);
	});
});
