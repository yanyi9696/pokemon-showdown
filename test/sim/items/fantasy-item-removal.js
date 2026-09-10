'use strict';

const assert = require('../../assert');
const { Battle, Dex } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

const dex = Dex.mod('gen9fantasy');
const megaCases = [
	['steelixitex', 'Steelix-Fantasy', 'Steelix-Mega-X-Fantasy'],
	['steelixitey', 'Steelix-Fantasy', 'Steelix-Mega-Y-Fantasy'],
	['steelixitez', 'Steelix-Fantasy', 'Steelix-Mega-Z-Fantasy'],
	['swampertitex', 'Swampert-Fantasy', 'Swampert-Mega-X-Fantasy'],
	['swampertitey', 'Swampert-Fantasy', 'Swampert-Mega-Y-Fantasy'],
	['flygonite', 'Flygon-Fantasy', 'Flygon-Mega-Fantasy'],
	['rayquazite', 'Rayquaza-Fantasy', 'Rayquaza-Mega-Fantasy'],
	['zygardite', 'Zygarde-Complete', 'Zygarde-Mega'],
];
let battle;

function createBattle(holder, attacker = {}) {
	battle = new Battle({
		format: new Format({ name: 'Fantasy item removal test', mod: 'gen9fantasy', ruleset: [] }),
		seed: [1, 2, 3, 4],
	});
	battle.randomizer = damage => damage;
	battle.randomChance = (numerator, denominator) => numerator >= denominator;
	battle.setPlayer('p1', { team: [
		{ species: 'Mew', ability: 'No Ability', moves: ['knockoff', 'splash'], ...attacker },
	] });
	battle.setPlayer('p2', { team: [
		{ ability: 'No Ability', moves: ['splash'], ...holder },
		{ species: 'Blissey', ability: 'No Ability', moves: ['splash'] },
	] });
	return battle.p2.active[0];
}

describe('Fantasy item removal', () => {
	afterEach(() => battle?.destroy());

	describe('all Mega Stones', () => {
		for (const item of dex.items.all().filter(item => item.megaStone)) {
			const formes = new Set([item.megaEvolves, item.megaStone, item.itemUser || []].flat());
			for (const forme of formes) {
				// Some items list reserved Fantasy formes which are not implemented yet.
				if (!dex.species.get(forme).exists) continue;
				it(`should keep ${item.name} on ${forme} when hit by Knock Off`, () => {
					const holder = createBattle({ species: forme, item: item.id });
					battle.makeChoices('move knockoff', 'move splash');
					assert.false.fullHP(holder);
					assert.equal(holder.item, item.id);
				});
			}
		}
	});

	for (const [item, species, mega] of megaCases) {
		describe(item, () => {
			it('should stay held through an actual Mega Evolution and switching', () => {
				const holder = createBattle({ species, item });
				battle.makeChoices('move knockoff', 'move splash mega');
				assert.equal(holder.species.name, mega);
				assert.equal(holder.item, item);
				battle.makeChoices('move splash', 'switch 2');
				battle.makeChoices('move knockoff', 'switch 2');
				assert.equal(holder.species.name, mega);
				assert.equal(holder.item, item);
			});

			it('should not give Knock Off its removable-item power boost', () => {
				const holder = createBattle({ species, item });
				const move = { ...dex.getActiveMove('knockoff'), onBasePower: undefined };
				const expectedDamage = battle.actions.getDamage(battle.p1.active[0], holder, move);
				const previousHP = holder.hp;
				battle.makeChoices('move knockoff', 'move splash');
				assert.equal(previousHP - holder.hp, expectedDamage);
			});

			for (const move of ['trick', 'switcheroo', 'thief', 'covet']) {
				it(`should not be removed by ${move}`, () => {
					const holder = createBattle({ species, item }, { moves: [move] });
					battle.makeChoices();
					assert.equal(holder.item, item);
					assert.equal(battle.p1.active[0].item, '');
				});
			}

			it('should not be given away by Trick or Fling', () => {
				const holder = createBattle({ species, item, moves: ['trick', 'fling'] });
				battle.makeChoices('move splash', 'move trick');
				assert.equal(holder.item, item);
				battle.makeChoices('move splash', 'move fling');
				assert.equal(holder.item, item);
				assert.equal(battle.p1.active[0].item, '');
				assert.fullHP(battle.p1.active[0]);
			});

			it('should still be removed from an unrelated holder', () => {
				const holder = createBattle({ species: 'Blissey', item });
				battle.makeChoices('move knockoff', 'move splash');
				assert.equal(holder.item, '');
			});
		});
	}

	for (const [species, item] of [
		['Steelix', 'steelixitex'],
		['Swampert', 'swampertitex'],
		['Flygon', 'flygonite'],
		['Rayquaza', 'rayquazite'],
		['Slowbro-Galar-Fantasy', 'slowbronite'],
		['Slowbro-Fantasy', 'slowbrogalarnite'],
	]) {
		it(`should remove ${item} from the incompatible forme ${species}`, () => {
			const holder = createBattle({ species, item });
			battle.makeChoices('move knockoff', 'move splash');
			assert.equal(holder.item, '');
		});
	}

	it('should protect the original holder after Transform', () => {
		const holder = createBattle({ species: 'Steelix-Fantasy', item: 'steelixitex', moves: ['transform'] });
		battle.makeChoices('move splash', 'move transform');
		assert.equal(holder.species.name, 'Mew');
		battle.makeChoices('move knockoff', 'move splash');
		assert.equal(holder.item, 'steelixitex');
	});

	it('should not protect a Ditto just because it transformed into a compatible holder', () => {
		const holder = createBattle(
			{ species: 'Ditto', item: 'steelixitex', moves: ['transform'] },
			{ species: 'Steelix-Fantasy' }
		);
		battle.makeChoices('move splash', 'move transform');
		assert.equal(holder.species.name, 'Steelix-Fantasy');
		battle.makeChoices('move knockoff', 'move splash');
		assert.equal(holder.item, '');
	});

	for (const suppression of ['klutz', 'embargo', 'magicroom']) {
		it(`should retain protection under ${suppression}`, () => {
			const holder = createBattle({
				species: 'Steelix-Fantasy', item: 'steelixitex',
				ability: suppression === 'klutz' ? 'Klutz' : 'No Ability',
			}, { moves: ['knockoff', 'embargo', 'magicroom'] });
			if (suppression !== 'klutz') battle.makeChoices(`move ${suppression}`, 'move splash');
			assert(holder.ignoringItem());
			battle.makeChoices('move knockoff', 'move splash');
			assert.equal(holder.item, 'steelixitex');
		});
	}

	for (const species of ['Zygarde', 'Zygarde-10%']) {
		it(`should protect Zygardite throughout Power Construct from ${species}`, () => {
			const holder = createBattle({ species, item: 'zygardite', ability: 'Power Construct' });
			holder.hp = Math.floor(holder.maxhp / 2);
			battle.makeChoices('move knockoff', 'move splash');
			assert.equal(holder.species.name, 'Zygarde-Complete');
			assert.equal(holder.item, 'zygardite');
			battle.makeChoices('move knockoff', 'move splash mega');
			assert.equal(holder.species.name, 'Zygarde-Mega');
			assert.equal(holder.item, 'zygardite');
		});
	}

	describe('other protected items', () => {
		const cases = new Map();
		function addCase(species, item) {
			if (dex.species.get(species).exists) cases.set(`${species}/${item}`, [species, item]);
		}
		for (const item of dex.items.all()) {
			if (item.megaStone) continue;
			if (item.zMove) {
				addCase('Blissey', item.id);
				for (const species of item.itemUser || []) addCase(species, item.id);
			}
			const family = item.onPlate ? 493 : item.onMemory ? 773 : item.onDrive ? 649 : 0;
			if (family) {
				for (const species of dex.species.all().filter(species => species.num === family)) {
					addCase(species.name, item.id);
				}
			}
			if (item.forcedForme || item.isPrimalOrb) {
				for (const species of item.itemUser || []) addCase(species, item.id);
			}
		}
		for (const species of dex.species.all()) {
			for (const itemName of [...(species.requiredItems || []), species.requiredItem].filter(Boolean)) {
				const item = dex.items.get(itemName);
				if (!item.megaStone && item.exists) addCase(species.name, item.id);
			}
		}
		for (const [species, item] of cases.values()) {
			it(`should keep ${item} on ${species} when hit by Knock Off`, () => {
				const holder = createBattle({ species, item });
				battle.makeChoices('move knockoff', 'move splash');
				assert.equal(holder.item, item);
			});
		}
	});
});
