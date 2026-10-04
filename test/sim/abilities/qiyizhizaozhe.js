'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Qi Yi Zhi Zao Zhe [Gen 9 Fantasy]', () => {
	let battle;
	afterEach(() => battle?.destroy());

	const idle = () => ({ species: 'Mew', ability: 'No Ability', moves: ['celebrate'] });
	function create({ mega = true, position = 0, moves, bench = false, foe, ally, singles = false } = {}) {
		const holderSet = {
			species: mega ? 'Orbeetle-Fantasy' : 'Beheeyem-Fantasy',
			ability: mega ? 'Telepathy' : 'Qi Yi Zhi Zao Zhe',
			item: mega ? 'G-Mega Wishing Star' : '',
			moves: moves || ['allyswitch', 'trickroom', 'protect', 'calmmind'],
		};
		const team = singles ? [holderSet] : [idle(), idle()];
		if (ally) team[1 - position] = ally;
		if (bench) team.push(holderSet);
		else team[position] = holderSet;
		battle = new Battle({
			format: new Format({
				name: 'Fantasy Qi Yi Zhi Zao Zhe test', effectType: 'Format', mod: 'gen9fantasy', ruleset: [],
				gameType: singles ? 'singles' : 'doubles',
			}),
			seed: [1, 2, 3, 4], strictChoices: true,
			p1: { team }, p2: { team: singles ? [foe || idle()] : [foe || idle(), idle()] },
		});
		battle.randomizer = damage => damage;
		return battle.p1.pokemon[bench ? 2 : position];
	}

	function choose(holder, move, foeChoice = 'move celebrate, move celebrate') {
		const choices = battle.p1.active.map(pokemon => pokemon === holder ? `move ${move}` : 'move celebrate');
		battle.makeChoices(choices.join(', '), foeChoice);
	}

	function assertRoom() {
		assert(battle.field.pseudoWeather.trickroom, 'Trick Room should start at the end of the first actionable turn');
		assert.equal(battle.field.pseudoWeather.trickroom.duration, 4, 'End-of-turn activation should leave four turns');
	}

	for (const position of [0, 1]) {
		it(`should start Trick Room after G-Mega Evolution and Ally Switch from slot ${position + 1}`, () => {
			const holder = create({ position });
			choose(holder, 'allyswitch mega');
			assert.equal(holder.species.name, 'Orbeetle-G-Mega-Fantasy');
			assert.equal(holder.position, 1 - position);
			assertRoom();
		});
	}

	it('should start Trick Room after G-Mega Evolution on a later turn', () => {
		const holder = create();
		choose(holder, 'protect');
		assert(!battle.field.pseudoWeather.trickroom);
		choose(holder, 'allyswitch mega');
		assertRoom();
	});

	it('should also count other Psychic moves on the evolution turn', () => {
		const holder = create();
		choose(holder, 'calmmind mega');
		assert.equal(holder.boosts.spa, 1);
		assertRoom();
	});

	it('should expire after four further turns and not trigger again', () => {
		const holder = create();
		choose(holder, 'allyswitch mega');
		assertRoom();
		for (const remaining of [3, 2, 1]) {
			choose(holder, 'calmmind');
			assert.equal(battle.field.pseudoWeather.trickroom.duration, remaining);
		}
		choose(holder, 'calmmind');
		assert(!battle.field.pseudoWeather.trickroom);
		choose(holder, 'calmmind');
		assert(!battle.field.pseudoWeather.trickroom);
	});

	it('should consume the first-turn opportunity when the evolution turn uses a non-Psychic move', () => {
		const holder = create();
		choose(holder, 'protect mega');
		assert(!battle.field.pseudoWeather.trickroom);
		choose(holder, 'allyswitch');
		assert(!battle.field.pseudoWeather.trickroom, 'A later Psychic move must not get another opportunity');
	});

	it('should consume the first-turn opportunity if Fake Out prevents the Psychic move', () => {
		const holder = create({ foe: { ...idle(), moves: ['fakeout', 'celebrate'] } });
		choose(holder, 'allyswitch mega', 'move fakeout 1, move celebrate');
		assert(battle.log.some(line => line.includes('|cant|p1a: Orbeetle|flinch')));
		assert(!battle.field.pseudoWeather.trickroom);
		choose(holder, 'allyswitch');
		assert(!battle.field.pseudoWeather.trickroom);
	});

	it('should respect an opponent Imprisoning Trick Room on the evolution turn', () => {
		const holder = create({ foe: { ...idle(), moves: ['imprison', 'trickroom', 'protect'] } });
		choose(holder, 'allyswitch mega', 'move imprison, move celebrate');
		assert(battle.p2.active[0].volatiles.imprison);
		assert(!battle.field.pseudoWeather.trickroom);
		battle.p2.active[0].removeVolatile('imprison');
		choose(holder, 'calmmind', 'move protect, move celebrate');
		assert(!battle.field.pseudoWeather.trickroom, 'Removing Imprison must not restore the spent opportunity');
	});

	it('should still work for a lead that already has the ability', () => {
		const holder = create({ mega: false });
		assert(battle.field.pseudoWeather.gravity);
		choose(holder, 'allyswitch');
		assert.equal(holder.position, 1);
		assertRoom();
	});

	it('should wait for the next turn after switching in mid-turn', () => {
		const holder = create({ mega: false, bench: true });
		battle.makeChoices('switch 3, move celebrate', 'move celebrate, move celebrate');
		assert(battle.field.pseudoWeather.gravity);
		assert(!battle.field.pseudoWeather.trickroom);
		choose(holder, 'allyswitch');
		assertRoom();
	});

	it('should not count a teammate using Ally Switch', () => {
		const holder = create({ ally: { ...idle(), moves: ['allyswitch'] } });
		battle.makeChoices('move protect mega, move allyswitch', 'move celebrate, move celebrate');
		assert.equal(holder.position, 1);
		assert(!battle.field.pseudoWeather.trickroom);
	});

	it('should still require Trick Room in the moveset', () => {
		const holder = create({ moves: ['allyswitch', 'protect'] });
		choose(holder, 'allyswitch mega');
		assert(battle.field.pseudoWeather.gravity);
		assert(!battle.field.pseudoWeather.trickroom);
	});

	it('should retain automatic activation with no surviving teammates', () => {
		const holder = create({ singles: true });
		choose(holder, 'protect mega', 'move celebrate');
		assertRoom();
	});
});
