'use strict';
const assert = require('assert').strict;
const { devotionBonus } = require('../../dist/sim/rogue-devotion');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { measure } = require('../../tools/fantasy-rogue-devotion-balance');

describe('Fantasy Rogue Devotion', () => {
	const effects = { owned: [{ ...blessing('devotion'), species: 'pikachu', floor: 1 }] };
	it('locks species across regions and Fantasy forms but never evolves the lock', () => {
		const party = ['Pikachu', 'Pikachu-Fantasy', 'Pikachu-Gmax', 'Raichu', 'Pichu', 'Ditto'];
		assert.equal(devotionBonus(effects, 'Pikachu-Fantasy', party).count, 3);
		assert.equal(devotionBonus(effects, 'Raichu', party).power, 0);
		assert.equal(devotionBonus(effects, 'Pichu', party).reduction, 0);
		assert.equal(devotionBonus(undefined, 'Pikachu', party).power, 0);
	});
	it('grows power nonlinearly while retaining the confirmed five-point reduction steps', () => {
		const power = [0, 12, 25, 40, 60, 85];
		for (let count = 1; count <= 6; count++) {
			const bonus = devotionBonus(effects, 'Pikachu', Array(count).fill('Pikachu'));
			assert.equal(bonus.power, power[count - 1]); assert.equal(bonus.reduction, (count - 1) * 5);
		}
	});
	it('applies both effects through the actual battle engine, independently of damage category', () => {
		for (const c of [
			['Garchomp', 'Sand Veil', 'Dragon Claw', 'Snorlax', 'Immunity', 'Body Slam'],
			['Blastoise', 'Torrent', 'Surf', 'Snorlax', 'Immunity', 'Body Slam'],
		]) {
			const base = measure(6, undefined, c, 100), full = measure(6, 'devotion', c, 100);
			assert(full.out > base.out * 1.78 && full.out < base.out * 1.88);
			assert(Math.abs(full.incoming - base.incoming * 0.75) < 2);
			assert.deepEqual(measure(1, 'devotion', c, 100), measure(1, undefined, c, 100));
		}
	});
});
