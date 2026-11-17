'use strict';
const assert = require('assert').strict;
const { shopGuardTeam } = require('../../dist/server/fantasy-rogue/shop-guard-teams');
const { encounterSetProblems } = require('../../dist/server/fantasy-rogue/encounter-legality');
const { minimumEvolutionLevel } = require('../../dist/server/fantasy-rogue/evolution');

describe('Shop raid guard progression', () => {
	for (const kind of ['nurse', 'merchant', 'mint', 'candy', 'machine', 'auction', 'balls', 'crowns', 'mushroom']) {
		it(`keeps ${kind} singles and doubles legal with the original level/IV budget`, () => {
			for (const floor of [1, 9, 19, 29, 39, 40, 49, 59, 60, 61, 79, 89, 99, 109, 110, 111, 129, 139, 149, 150]) {
				for (const doubleBattle of [false, true]) {
					const team = shopGuardTeam({ floor, doubleBattle, node: { trade: { kind } } }, kind === 'nurse');
					assert.equal(team.length, floor <= 60 ? 3 : floor <= 110 ? 4 : 5);
					for (const set of team) {
						assert.deepEqual(encounterSetProblems(set), [], `${kind} ${floor} ${set.species}`);
						assert.equal(set.level, Math.max(3, Math.ceil(floor / 2)));
						assert(minimumEvolutionLevel(set.species) <= set.level);
						assert(Object.values(set.ivs).every(v => v === 25));
						assert(set.moves.length && set.moves.length <= 4);
					}
				}
			}
		});
	}
	it('varies shop themes and successive pre-boss guards instead of repeating one merchant roster', () => {
		const names = (floor, kind, nurse = false) => shopGuardTeam({ floor, node: kind ? { trade: { kind } } : {} }, nurse).map(s => s.species).join('/');
		assert.notEqual(names(79, 'mint'), names(79, 'balls'));
		assert.notEqual(names(79, null, true), names(89, null, true));
	});
});
