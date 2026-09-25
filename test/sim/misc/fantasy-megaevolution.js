'use strict';

const assert = require('../../assert');
const { Battle, TeamValidator } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Fantasy Mega Rayquaza', () => {
	let battle;

	afterEach(() => {
		battle?.destroy();
		battle = null;
	});

	function createBattle(set) {
		battle = new Battle({
			format: new Format({ name: 'Fantasy Mega Rayquaza test', mod: 'gen9fantasy', ruleset: [] }),
			strictChoices: true,
			seed: [1, 2, 3, 4],
		});
		battle.setPlayer('p1', { team: [
			{ species: 'Rayquaza-Fantasy', ability: 'Air Lock', moves: ['Dragon Dance'], ...set },
		] });
		battle.setPlayer('p2', { team: [
			{ species: 'Blissey', ability: 'Natural Cure', moves: ['Splash'] },
		] });
		return battle.p1.active[0];
	}

	for (const species of ['Rayquaza-Fantasy', 'Rayquaza-Mega-Fantasy']) {
		it(`should validate ${species} with Rayquazite and without Dragon Ascent`, () => {
			const team = [{ species, item: 'Rayquazite', ability: 'Air Lock', moves: ['Dragon Dance'], evs: { hp: 4 } }];
			assert.legalTeam(team, 'gen9fcag');
			assert.equal(team[0].species, 'Rayquaza-Fantasy');
		});
	}

	for (const moves of [['Dragon Dance'], ['Dragon Dance', 'Dragon Ascent']]) {
		it(`should Mega Evolve with Rayquazite and ${moves.join(' / ')}`, () => {
			const rayquaza = createBattle({ item: 'Rayquazite', moves });
			assert.equal(rayquaza.canMegaEvo, 'Rayquaza-Mega-Fantasy');
			battle.makeChoices('move dragondance mega', 'move splash');
			assert.equal(rayquaza.species.name, 'Rayquaza-Mega-Fantasy');
			assert.equal(rayquaza.ability, 'deltastream');
			assert.equal(rayquaza.item, 'rayquazite');
			assert.throws(() => battle.choose('p1', 'move dragondance mega'));
		});
	}

	for (const item of ['', 'Leftovers']) {
		it(`should not use Dragon Ascent to Mega Evolve with ${item || 'no item'}`, () => {
			const rayquaza = createBattle({ item, moves: ['Dragon Dance', 'Dragon Ascent'] });
			assert.equal(rayquaza.canMegaEvo, null);
			assert.throws(() => battle.choose('p1', 'move dragondance mega'));
			assert.equal(rayquaza.species.name, 'Rayquaza-Fantasy');
		});

		it(`should reject the Mega forme with ${item || 'no item'}`, () => {
			const team = [{
				species: 'Rayquaza-Mega-Fantasy', item, ability: 'Air Lock', moves: ['Dragon Dance'], evs: { hp: 4 },
			}];
			const problems = TeamValidator.get('gen9fcag').validateTeam(team);
			assert(problems?.some(problem => problem.includes('Rayquazite')));
		});
	}

	it('should preserve ordinary Rayquaza Mega Evolution with Dragon Ascent', () => {
		const rayquaza = createBattle({ species: 'Rayquaza', item: 'Leftovers', moves: ['Dragon Dance', 'Dragon Ascent'] });
		assert.equal(rayquaza.canMegaEvo, 'Rayquaza-Mega');
		battle.makeChoices('move dragondance mega', 'move splash');
		assert.equal(rayquaza.species.name, 'Rayquaza-Mega');
	});

	it('should not let ordinary Rayquaza Mega Evolve using Rayquazite alone', () => {
		const rayquaza = createBattle({ species: 'Rayquaza', item: 'Rayquazite' });
		assert.equal(rayquaza.canMegaEvo, null);
		assert.throws(() => battle.choose('p1', 'move dragondance mega'));
	});
});
