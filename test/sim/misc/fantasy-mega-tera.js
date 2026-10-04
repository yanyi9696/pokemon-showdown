'use strict';

const assert = require('../../assert');
const { Battle } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Fantasy Mega and Terastallization exclusion', () => {
	let battle;
	afterEach(() => battle?.destroy());

	function createBattle(set = {}) {
		battle = new Battle({
			format: new Format({ name: 'Fantasy Mega Tera test', mod: 'gen9fantasy', ruleset: [] }),
			strictChoices: true,
			seed: 'gen5,1,2,3,4',
			p1: { team: [
				{ species: 'Zygarde', ability: 'Power Construct', item: 'Zygardite', moves: ['Splash'], teraType: 'Steel', ...set },
				{ species: 'Mew', ability: 'Synchronize', moves: ['Splash'], teraType: 'Water' },
			] },
			p2: { team: [{ species: 'Blissey', ability: 'Natural Cure', moves: ['Splash'] }] },
		});
		return battle.p1.active[0];
	}

	for (const species of ['Zygarde', 'Zygarde-10%']) {
		it(`does not offer Tera to ${species} holding Zygardite before Power Construct`, () => {
			const zygarde = createBattle({ species });
			assert.equal(zygarde.canMegaEvo, null);
			assert.equal(zygarde.canTerastallize, null);
			assert.false(!!zygarde.getMoveRequestData().canTerastallize);
			assert.throws(() => battle.choose('p1', 'move splash terastallize'));
		});

		it(`allows Mega after Power Construct from ${species}, without retaining Tera`, () => {
			const zygarde = createBattle({ species });
			zygarde.hp = Math.floor(zygarde.maxhp / 2);
			battle.makeChoices('move splash', 'move splash');
			assert.equal(zygarde.species.name, 'Zygarde-Complete');
			assert.equal(zygarde.canMegaEvo, 'Zygarde-Mega');
			assert(zygarde.getMoveRequestData().canMegaEvo);
			assert.false(!!zygarde.getMoveRequestData().canTerastallize);
			assert.throws(() => battle.choose('p1', 'move splash terastallize'));
			battle.makeChoices('move splash mega', 'move splash');
			assert.equal(zygarde.species.name, 'Zygarde-Mega');
			assert.false(!!zygarde.terastallized);
			battle.makeChoices('switch 2', 'move splash');
			battle.makeChoices('move splash terastallize', 'move splash');
			assert.equal(battle.p1.active[0].terastallized, 'Water');
			battle.makeChoices('switch 2', 'move splash');
			assert.equal(battle.p1.active[0], zygarde);
			assert.false(!!zygarde.getMoveRequestData().canTerastallize);
		});

		it(`keeps Tera and Power Construct available to ${species} without Zygardite`, () => {
			const zygarde = createBattle({ species, item: '' });
			zygarde.hp = Math.floor(zygarde.maxhp / 2);
			battle.makeChoices('move splash terastallize', 'move splash');
			assert.equal(zygarde.species.name, 'Zygarde-Complete');
			assert.equal(zygarde.terastallized, 'Steel');
			assert.equal(zygarde.canMegaEvo, null);
		});
	}

	it('does not execute a stale Mega request after Terastallization', () => {
		const zygarde = createBattle({ item: '' });
		zygarde.hp = Math.floor(zygarde.maxhp / 2);
		battle.makeChoices('move splash terastallize', 'move splash');
		// Model the cached eligibility that previously survived the Tera action.
		zygarde.canMegaEvo = 'Zygarde-Mega';
		assert.false(battle.actions.runMegaEvo(zygarde));
		assert.equal(zygarde.species.name, 'Zygarde-Complete');
		assert.equal(zygarde.terastallized, 'Steel');
	});

	it('does not let a Pokemon already in a Mega forme Terastallize', () => {
		const zygarde = createBattle({ species: 'Zygarde-Mega', ability: 'Aura Break', item: '' });
		assert.equal(zygarde.canTerastallize, null);
		assert.throws(() => battle.choose('p1', 'move splash terastallize'));
	});

	it('does not block an unrelated Pokemon carrying Zygardite', () => {
		const mew = createBattle({ species: 'Mew', ability: 'Synchronize' });
		battle.makeChoices('move splash terastallize', 'move splash');
		assert.equal(mew.terastallized, 'Steel');
	});
});
