'use strict';

const assert = require('../../assert');
const { Battle, Dex } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Fantasy Charge Beam', () => {
	let battle;
	function createBattle(secondary = false, attacker = {}, defender = {}) {
		battle = new Battle({
			format: new Format({ name: 'Fantasy Charge Beam test', mod: 'gen9fantasy', ruleset: [] }),
			seed: [1, 2, 3, 4],
		});
		battle.setPlayer('p1', { team: [{
			species: 'Melmetal-Fantasy', ability: 'Iron Fist', moves: ['chargebeam', 'charge'], ...attacker,
		}] });
		battle.setPlayer('p2', { team: [{
			species: 'Blissey', ability: 'Shell Armor', moves: ['splash'], ...defender,
		}] });
		battle.randomizer = damage => damage;
		const randomChance = battle.randomChance.bind(battle);
		battle.randomChance = (numerator, denominator) => {
			if (numerator === 90 && denominator === 100) return true;
			return randomChance(numerator, denominator);
		};
		const random = battle.random.bind(battle);
		battle.random = (from, to) => from === 100 && to === undefined ? (secondary ? 69 : 70) : random(from, to);
		return battle.p1.active[0];
	}

	afterEach(() => {
		battle?.destroy();
		battle = null;
	});

	it('changes only the Fantasy version of Charge Beam', () => {
		const move = Dex.mod('gen9fantasy').moves.get('chargebeam');
		assert.equal(move.basePower, 75);
		assert.equal(move.accuracy, 90);
		assert.equal(move.pp, 10);
		assert.equal(move.secondaries[0].chance, 70);
		assert.equal(Dex.mod('gen9').moves.get('chargebeam').basePower, 50);
		assert.equal(Dex.mod('gen9').moves.get('chargebeam').onTryMove, undefined);
	});

	for (const species of ['Melmetal-Fantasy', 'Melmetal-G-Mega-Fantasy']) {
		it(`allows ${species} to use Charge Beam and Wide Guard in FC AG`, () => {
			const dex = Dex.mod('gen9fantasy');
			const learnset = dex.species.getLearnsetData(dex.species.get(species).id).learnset;
			assert.deepEqual(learnset.chargebeam, ['9M']);
			assert.deepEqual(learnset.wideguard, ['9M']);
			assert.legalTeam([{
				species, item: 'G-Mega Wishing Star', ability: 'Iron Fist',
				moves: ['chargebeam', 'wideguard'], evs: { hp: 4 },
			}], 'gen9fcag');
		});
	}

	for (const secondary of [false, true]) {
		it(`has only the normal post-hit boost when uncharged (secondary: ${secondary})`, () => {
			const source = createBattle(secondary);
			const target = battle.p2.active[0];
			const expected = battle.actions.getDamage(source, target, 'chargebeam');
			const hp = target.hp;
			battle.makeChoices('move chargebeam', 'move splash');
			assert.equal(hp - target.hp, expected);
			assert.equal(source.boosts.spa, Number(secondary));
		});

		it(`boosts before damage while preserving Charge and the post-hit roll (secondary: ${secondary})`, () => {
			const source = createBattle(secondary);
			battle.makeChoices('move charge', 'move splash');
			assert(source.volatiles.charge);
			const target = battle.p2.active[0];
			source.boosts.spa = 1;
			const expected = battle.actions.getDamage(source, target, 'chargebeam');
			source.boosts.spa = 0;
			const hp = target.hp;
			const start = battle.log.length;
			battle.makeChoices('move chargebeam', 'move splash');
			assert.equal(hp - target.hp, expected);
			assert.equal(source.boosts.spa, 1 + Number(secondary));
			assert.false(source.volatiles.charge);
			const events = battle.log.slice(start).filter(line =>
				line.startsWith('|-boost|p1a:') || line.startsWith('|-damage|p2a:'));
			assert(events[0].includes('|spa|1'));
			assert(events[1].startsWith('|-damage|p2a:'));
			if (secondary) assert(events[events.length - 1].includes('|spa|1'));
		});
	}

	it('recognizes Charge granted by Electromorphosis earlier in the same turn', () => {
		const source = createBattle(false, { ability: 'Electromorphosis' }, { moves: ['tackle'] });
		battle.makeChoices('move chargebeam', 'move tackle');
		assert(battle.log.some(line => line.includes('[from] ability: Electromorphosis')));
		assert.equal(source.boosts.spa, 1);
		assert.false(source.volatiles.charge);
	});

	for (const blocked of ['protect', 'immune', 'miss']) {
		it(`keeps the pre-attack boost but not the secondary when the attack is blocked by ${blocked}`, () => {
			const source = createBattle(true, {}, blocked === 'immune' ? { species: 'Clodsire' } :
				{ moves: ['splash', 'protect'] });
			battle.makeChoices('move charge', 'move splash');
			if (blocked === 'miss') battle.randomChance = () => false;
			const target = battle.p2.active[0];
			const hp = target.hp;
			battle.makeChoices('move chargebeam', blocked === 'protect' ? 'move protect' : 'move splash');
			assert.equal(target.hp, hp);
			assert.equal(source.boosts.spa, 1);
			assert.false(source.volatiles.charge);
		});
	}
});
