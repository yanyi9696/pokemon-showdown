/**
 * Tests for Gen 9 Fantasy randomized formats
 */
'use strict';

const { Dex } = require('../../dist/sim/dex');
const { testTeam, assertSetValidity } = require('./tools');
const assert = require('../assert');

global.Dex = Dex;

describe('[Gen 9] Fantasy Random Battle (slow)', () => {
	const format = Dex.formats.get('gen9fantasyrandombattle');
	const dex = Dex.forFormat(format);
	const fantasyItems = new Set([
		'fantasypowerlens', 'fantasyscopelens', 'fantasylifeorb',
		'fantasysyrupyapple', 'fantasyprotector', 'fantasyicestone',
	]);
	const fantasyMoves = new Set(Object.entries(dex.data.Moves)
		.filter(([id]) => !Dex.moves.get(id).exists)
		.map(([id]) => id));

	it('should generate valid Fantasy-only teams with Fantasy content', () => {
		let fantasyItemCount = 0;
		let fantasyMoveCount = 0;

		testTeam({ format: 'gen9fantasyrandombattle', rounds: 100 }, team => {
			assert.equal(team.length, 6);
			for (const set of team) {
				const species = dex.species.get(set.species);
				assert(species.exists, `${set.species} should exist`);
				assert(!Dex.species.get(species.id).exists, `${species.name} should be a Fantasy Pokemon`);
				assert.equal(set.moves.length, 4, `${species.name} should have 4 moves`);
				assertSetValidity(format, set);
				if (fantasyItems.has(dex.items.get(set.item).id)) fantasyItemCount++;
				for (const move of set.moves) {
					if (fantasyMoves.has(dex.moves.get(move).id)) fantasyMoveCount++;
				}
			}
		});

		assert(fantasyMoveCount > 0, 'Fantasy Random Battle should generate Fantasy moves');
		assert(fantasyItemCount > 0, 'Fantasy Random Battle should generate Fantasy items');
	});
});
