'use strict';

const assert = require('../../assert');
const { Battle, Dex, TeamValidator } = require('../../../dist/sim');

describe('Fantasy original Kyurem legality', () => {
	let battle;
	const createSet = () => ({
		species: 'Kyurem-Original-Fantasy', ability: 'Original Dragon', item: 'Leftovers',
		moves: ['Ice Beam', 'Flamethrower', 'Thunderbolt', 'Dragon Pulse'],
		nature: 'Modest', level: 100, evs: { spa: 252, spe: 252, hp: 4 },
	});

	afterEach(() => {
		battle?.destroy();
		battle = null;
	});
	it('keeps legacy teams compatible and changes only the species name', () => {
		const dex = Dex.mod('gen9fantasy'), renamed = dex.species.get('Kyurem-Original-Fantasy');
		assert.equal(dex.species.get('Kyurem-Original'), renamed);
		assert.equal(renamed.name, 'Kyurem-Original-Fantasy');
		assert.equal(renamed.forme, 'Original');
		assert.equal(renamed.spriteid, 'kyurem-original');
		assert.deepEqual(renamed.baseStats, { hp: 125, atk: 170, def: 100, spa: 170, spd: 100, spe: 95 });
		assert.deepEqual(renamed.abilities, { 0: 'Original Dragon' });
		const legacy = { ...createSet(), species: 'Kyurem-Original' };
		assert.legalTeam([legacy], 'gen9fcuber');
		assert.equal(legacy.species, 'Kyurem-Original-Fantasy');
	});

	it('has its own Uber tier instead of inheriting ordinary Kyurem tiering', () => {
		const species = Dex.mod('gen9fantasy').species.get('Kyurem-Original');
		assert.equal(species.tier, 'Uber');
		assert.equal(species.natDexTier, 'Uber');
	});

	for (const format of ['gen9fcag', 'gen9fcuber']) {
		it(`accepts the species, ability and legal moves in ${format}`, () => {
			assert.legalTeam([createSet()], format);
		});
	}

	for (const format of ['gen9fcubersuu', 'gen9fcou']) {
		it(`retains the intended ban in ${format}`, () => {
			const problems = TeamValidator.get(format).validateTeam([createSet()]);
			assert(problems?.some(problem => problem.includes('banned')));
			assert(!problems.some(problem => problem.includes('does not exist') || problem.includes('not in this game')));
		});
	}

	it('does not introduce Fantasy species into standard National Dex battles', () => {
		assert(TeamValidator.get('gen9nationaldexubers').validateTeam([createSet()])?.length);
	});

	it('starts a validated FC Uber battle and uses Original Dragon on successive attacks', () => {
		const team = [createSet()];
		assert.legalTeam(team, 'gen9fcuber');
		battle = new Battle({ formatid: 'gen9fcuber', strictChoices: true, seed: [1, 2, 3, 4] });
		battle.setPlayer('p1', { team });
		battle.setPlayer('p2', { team: [{
			species: 'Blissey', ability: 'Natural Cure', moves: ['Soft-Boiled'],
			level: 100, nature: 'Calm', evs: { hp: 252, spd: 252 },
		}] });
		battle.makeChoices('team 1', 'team 1');
		const kyurem = battle.p1.active[0];
		assert.equal(kyurem.species.name, 'Kyurem-Original-Fantasy');
		assert.equal(kyurem.ability, 'originaldragon');
		for (const [move, type] of [['flamethrower', 'Fire'], ['thunderbolt', 'Electric'], ['icebeam', 'Ice']]) {
			battle.makeChoices(`move ${move}`, 'move softboiled');
			assert.deepEqual(kyurem.getTypes(), ['Dragon', type]);
		}
		assert(battle.log.some(line => line.startsWith('|-damage|p2a:')));
	});
});
