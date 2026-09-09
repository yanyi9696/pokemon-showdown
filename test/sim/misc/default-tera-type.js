'use strict';

const assert = require('assert').strict;
const { Battle, Dex, Teams, TeamValidator } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Default Tera types', () => {
	const format = new Format({
		name: 'Default Tera type test', effectType: 'Format', mod: 'gen9fantasy', ruleset: [],
	});
	const validator = new TeamValidator(format);
	const cases = [
		['Pikachu', 'Electric'],
		['Charizard', 'Fire'],
		['Mewtwo-Fantasy', 'Psychic'],
		['Silvally-Fire-Fantasy', 'Fire'],
		['Silvally-Water-Fantasy', 'Water'],
		['Silvally-Fantasy', 'Normal'],
		['Type: Null-Fantasy', 'Normal'],
	];
	let battle;

	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
	});

	function team(species, teraType) {
		return [{ species, teraType, ability: Dex.mod('gen9fantasy').species.get(species).abilities[0], moves: ['splash'] }];
	}

	function checkBattle(sets, expectedType) {
		battle = new Battle({
			format,
			p1: { name: 'P1', team: sets },
			p2: { name: 'P2', team: [{ species: 'Mew', moves: ['splash'] }] },
		});
		const pokemon = battle.p1.active[0];
		assert.equal(pokemon.teraType, expectedType);
		assert.equal(pokemon.canTerastallize, expectedType);
		battle.makeChoices('move 1 terastallize', 'move 1');
		assert.equal(pokemon.terastallized, expectedType);
		assert.deepEqual(pokemon.getTypes(), [expectedType]);
	}

	for (const [species, expectedType] of cases) {
		it(`defaults ${species} to ${expectedType} after packing and validation`, () => {
			const sets = Teams.unpack(Teams.pack(team(species)));
			assert(!sets[0].teraType, 'Packing must leave the default to the format Dex');
			assert.equal(validator.validateTeam(sets), null);
			assert.equal(sets[0].teraType, expectedType);
			checkBattle(sets, expectedType);
		});

		it(`defaults ${species} to ${expectedType} without validation`, () => {
			checkBattle(team(species), expectedType);
		});
	}

	for (const teraType of ['Normal', 'Water']) {
		it(`preserves an explicit ${teraType} Tera type`, () => {
			const sets = Teams.unpack(Teams.pack(team('Silvally-Fire-Fantasy', teraType)));
			assert.equal(sets[0].teraType, teraType);
			assert.equal(validator.validateTeam(sets), null);
			checkBattle(sets, teraType);
		});
	}

	it('treats a legacy ??? Tera type as unspecified', () => {
		const sets = team('Silvally-Fire-Fantasy', '???');
		assert(!Teams.unpack(Teams.pack(sets))[0].teraType);
		assert.equal(validator.validateTeam(sets), null);
		assert.equal(sets[0].teraType, 'Fire');
		checkBattle(team('Silvally-Fire-Fantasy', '???'), 'Fire');
	});

	it('preserves forced Tera types during validation', () => {
		const sets = team('Ogerpon-Wellspring', 'Fire');
		assert.equal(validator.validateTeam(sets), null);
		assert.equal(sets[0].teraType, 'Water');
	});
});
