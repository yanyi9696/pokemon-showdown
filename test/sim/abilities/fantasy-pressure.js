'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Fantasy Pressure', () => {
	let battle;
	afterEach(() => battle?.destroy());

	function create(attacker = {}, defenders, allies = []) {
		battle = new Battle({
			format: new Format({
				name: 'Fantasy Pressure test', mod: 'gen9fantasy', ruleset: [],
				gameType: allies.length ? 'doubles' : 'singles',
			}),
			seed: [1, 2, 3, 4], strictChoices: true,
			p1: { team: [{ species: 'Mew', ability: 'No Ability', moves: ['shadowball'], ...attacker }, ...allies] },
			p2: { team: defenders || [{ species: 'Giratina', ability: 'Pressure', moves: ['splash'] }] },
		});
		battle.randomizer = damage => damage;
		return battle.p1.active[0];
	}

	function used(pokemon, move) {
		const slot = pokemon.getMoveData(battle.dex.moves.get(move));
		return slot.maxpp - slot.pp;
	}

	for (const move of ['shadowball', 'recover', 'swordsdance', 'healbell', 'stealthrock', 'stickyweb', 'raindance', 'protect', 'poltergeist']) {
		it(`should deduct one extra PP from ${move}, including self/side targets and failed moves`, () => {
			const attacker = create({ moves: [move] });
			battle.makeChoices();
			assert.equal(used(attacker, move), 2);
			assert.equal(used(battle.p2.active[0], 'splash'), 1);
		});
	}

	it('should let a move with only one PP remaining execute', () => {
		const attacker = create({ moves: ['recover'] });
		attacker.hp = Math.ceil(attacker.maxhp / 2);
		attacker.moveSlots[0].pp = 1;
		battle.makeChoices();
		assert.equal(attacker.hp, attacker.maxhp);
		assert.equal(attacker.moveSlots[0].pp, 0);
		assert(!battle.log.some(line => line.includes('|nopp|')));
	});

	it('should charge Sleep Talk only once without consuming the called move', () => {
		const attacker = create({ moves: ['sleeptalk', 'shadowball'] });
		attacker.setStatus('slp');
		attacker.statusState.time = 3;
		battle.makeChoices('move sleeptalk', 'move splash');
		assert(battle.log.some(line => line.includes('|Shadow Ball|') && line.includes('[from] move: Sleep Talk')));
		assert.equal(used(attacker, 'sleeptalk'), 2);
		assert.equal(used(attacker, 'shadowball'), 0);
	});

	it('should charge Nature Power only once without consuming the called move', () => {
		const attacker = create({ moves: ['naturepower', 'triattack'] });
		battle.makeChoices('move naturepower', 'move splash');
		assert(battle.log.some(line => line.includes('|Tri Attack|') && line.includes('[from] move: Nature Power')));
		assert.equal(used(attacker, 'naturepower'), 2);
		assert.equal(used(attacker, 'triattack'), 0);
	});

	for (const [move, item] of [['shadowball', 'ghostiumz'], ['recover', 'normaliumz'], ['weatherball', 'normaliumz']]) {
		it(`should charge the original ${move} slot when using a Z-Move`, () => {
			const attacker = create({ moves: [move], item });
			if (move === 'weatherball') {
				battle.field.setWeather('raindance', attacker);
				battle.makeRequest('move');
			}
			battle.makeChoices('move 1 zmove', 'move splash');
			assert(battle.p1.zMoveUsed);
			assert.equal(used(attacker, move), 2);
		});
	}

	it('should charge only the first turn of a two-turn move', () => {
		const attacker = create({ moves: ['fly'] });
		battle.makeChoices();
		assert.equal(used(attacker, 'fly'), 2);
		battle.makeChoices();
		assert.equal(used(attacker, 'fly'), 2);
	});

	it('should not deduct PP when sleep prevents the move', () => {
		const attacker = create();
		attacker.setStatus('slp');
		attacker.statusState.time = 3;
		battle.makeChoices();
		assert.equal(used(attacker, 'shadowball'), 0);
	});

	it('should not deduct PP when flinching prevents the move', () => {
		const attacker = create();
		attacker.addVolatile('flinch');
		battle.makeChoices();
		assert.equal(used(attacker, 'shadowball'), 0);
	});

	for (const suppression of ['neutralizinggas', 'gastroacid']) {
		it(`should respect ${suppression} suppressing Pressure`, () => {
			const attacker = create({ ability: suppression === 'neutralizinggas' ? suppression : 'No Ability' });
			if (suppression === 'gastroacid') battle.p2.active[0].addVolatile('gastroacid');
			battle.makeChoices();
			assert.equal(used(attacker, 'shadowball'), 1);
		});
	}

	it('should ignore Mold Breaker because Pressure is not breakable', () => {
		const attacker = create({ ability: 'Mold Breaker' });
		battle.makeChoices();
		assert.equal(used(attacker, 'shadowball'), 2);
	});

	it('should stop on switching out and resume on switching in', () => {
		const attacker = create({ moves: ['recover'] }, [
			{ species: 'Giratina', ability: 'Pressure', moves: ['splash'] },
			{ species: 'Blissey', ability: 'No Ability', moves: ['splash'] },
		]);
		battle.makeChoices('move recover', 'switch 2');
		assert.equal(used(attacker, 'recover'), 1);
		battle.makeChoices('move recover', 'switch 2');
		assert.equal(used(attacker, 'recover'), 3);
	});

	it('should stack once per opposing holder without affecting allies', () => {
		const attacker = create({ moves: ['surf'] }, [
			{ species: 'Giratina', ability: 'Pressure', moves: ['recover'] },
			{ species: 'Dialga', ability: 'Pressure', moves: ['recover'] },
		], [{ species: 'Mew', ability: 'No Ability', moves: ['recover'] }]);
		battle.makeChoices();
		assert.equal(used(attacker, 'surf'), 3);
		assert.equal(used(battle.p1.active[1], 'recover'), 3);
		for (const holder of battle.p2.active) assert.equal(used(holder, 'recover'), 1);
	});

	it('should affect attacks aimed at the holder\'s ally', () => {
		const attacker = create({}, [
			{ species: 'Giratina', ability: 'Pressure', moves: ['splash'] },
			{ species: 'Blissey', ability: 'No Ability', moves: ['splash'] },
		], [{ species: 'Mew', ability: 'No Ability', moves: ['splash'] }]);
		battle.makeChoices('move shadowball 2, move splash', 'move splash, move splash');
		assert.equal(used(attacker, 'shadowball'), 2);
	});

	it('should not charge a reflected move to Magic Bounce', () => {
		const attacker = create({ ability: 'Magic Bounce', moves: ['splash', 'confuseray'] }, [
			{ species: 'Giratina', ability: 'Pressure', moves: ['confuseray'] },
		]);
		battle.makeChoices('move splash', 'move confuseray');
		assert(battle.p2.active[0].volatiles.confusion);
		assert.equal(used(attacker, 'splash'), 2);
		assert.equal(used(attacker, 'confuseray'), 0);
	});

	it('should not charge a move copied by Dancer', () => {
		const attacker = create({ ability: 'Dancer', moves: ['splash', 'quiverdance'] }, [
			{ species: 'Giratina', ability: 'Pressure', moves: ['quiverdance'] },
		]);
		battle.makeChoices('move splash', 'move quiverdance');
		assert.equal(attacker.boosts.spa, 1);
		assert.equal(used(attacker, 'splash'), 2);
		assert.equal(used(attacker, 'quiverdance'), 0);
	});

	it('should allow Struggle when all PP is exhausted', () => {
		const attacker = create();
		attacker.moveSlots[0].pp = 0;
		battle.makeRequest('move');
		battle.makeChoices();
		assert.equal(attacker.lastMove.id, 'struggle');
		assert.equal(attacker.moveSlots[0].pp, 0);
		assert(battle.p2.active[0].hp < battle.p2.active[0].maxhp);
	});
});
