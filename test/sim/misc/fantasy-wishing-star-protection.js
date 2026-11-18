'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Fantasy Wishing Star protection', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function create(p1, p2, mod = 'gen9fantasy', gameType = 'singles') {
		battle = new Battle({ format: new Format({ name: 'Fantasy announcement test', mod, ruleset: [], gameType }),
			seed: [1, 2, 3, 4], strictChoices: true, p1: { team: p1 }, p2: { team: p2 } });
		battle.randomizer = damage => damage;
		return battle;
	}
	for (const species of ['Pikachu', 'Corviknight-Fantasy', 'Corviknight-G-Mega-Fantasy']) {
		it(`does not knock off the Wishing Star from ${species}`, () => {
			create([{ species, item: 'G-Mega Wishing Star', moves: ['Splash'] }],
				[{ species: 'Shuckle', moves: ['Knock Off'] }]);
			battle.makeChoices(); assert.equal(battle.p1.active[0].item, 'gmegawishingstar');
			assert(!battle.log.some(line => line.startsWith('|-enditem|')));
		});
	}
	for (const move of ['Trick', 'Thief']) it(`does not transfer the Wishing Star with ${move}`, () => {
		create([{ species: 'Snorlax', item: 'G-Mega Wishing Star', moves: ['Splash'] }],
			[{ species: 'Shuckle', moves: [move] }]);
		battle.makeChoices(); assert.equal(battle.p1.active[0].item, 'gmegawishingstar');
		assert.equal(battle.p2.active[0].item, '');
	});
	it('still removes ordinary items, and does not grant G-Mega eligibility to arbitrary holders', () => {
		create([{ species: 'Snorlax', item: 'Choice Band', moves: ['Splash'] }], [{ species: 'Shuckle', moves: ['Knock Off'] }]);
		battle.makeChoices(); assert.equal(battle.p1.active[0].item, '');
		battle.destroy(); create([{ species: 'Pikachu', item: 'G-Mega Wishing Star', moves: ['Splash'] }], [{ species: 'Shuckle', moves: ['Splash'] }]);
		assert.equal(battle.p1.active[0].canMegaEvo, null);
	});
});
