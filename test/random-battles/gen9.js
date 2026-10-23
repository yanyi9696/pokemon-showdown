/**
 * Tests for Gen 9 randomized formats
 */
'use strict';

const { testTeam, testAlwaysHasMove } = require('./tools');
const assert = require('../assert');
const { Teams } = require('../../dist/sim/teams');

describe('Gen 9 random team candidate filtering', () => {
	it('does not select the typeless placeholder for a monotype team', () => {
		const generator = Teams.getGenerator('gen9monotyperandombattle', '8,8,8,8');
		const team = generator.getTeam();
		assert.equal(team.length, 6);
		assert.legalTeam(team, 'gen9customgame@@@sametypeclause');
		assert(team.every(set => !Dex.species.get(set.species).types.includes('???')));
	});

	it('rejects computer-generated candidates without obtainable moves or required items', () => {
		const generator = Teams.getGenerator('gen9computergeneratedteams', '0,0,0,0');
		// Exercise both guards independently of the formes' current availability metadata.
		const species = generator.dex.species;
		const candidates = species.all().map(entry => {
			if (entry.id === 'absolmegaz') return { ...entry, isNonstandard: null, requiredItems: ['Leftovers'] };
			if (entry.id === 'froslassmega') return { ...entry, isNonstandard: null };
			return entry;
		});
		generator.dex = Object.assign(Object.create(generator.dex), {
			species: Object.assign(Object.create(species), { all: () => candidates }),
		});
		const makeSet = generator.makeSet;
		generator.makeSet = function (species, ...args) {
			assert(!['absolmegaz', 'froslassmega'].includes(species.id), `Invalid candidate: ${species.name}`);
			assert(this.dex.species.getMovePool(species.id).size, `No obtainable moves: ${species.name}`);
			return makeSet.call(this, species, ...args);
		};
		// Prefer imported formes that lack obtainable moves or their required item.
		const sample = generator.prng.sample.bind(generator.prng);
		generator.prng.sample = array => array.find(entry => ['absolmegaz', 'froslassmega'].includes(entry.id)) || sample(array);
		const team = generator.getTeam();
		assert.equal(team.length, 6);
		assert(team.every(set => set.moves.length && !set.moves.includes('struggle')));
		assert(team.every(set => !set.item || generator.itemPool.some(item => item.id === toID(set.item))));
	});
});

describe('[Gen 9] Random Battle (slow)', () => {
	const options = { format: 'gen9randombattle' };
	it("should always give Iron Bundle Freeze-Dry", () => {
		testAlwaysHasMove('ironbundle', options, 'freezedry');
	});
});

describe('[Gen 9] Monotype Random Battle (slow)', () => {
	const options = { format: 'gen9monotyperandombattle' };

	it('all Pokemon should share a common type', () => {
		testTeam({ ...options, rounds: 100 }, team => {
			assert.legalTeam(team, 'gen9customgame@@@sametypeclause');
		});
	});
});
