'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
describe('Fantasy Rogue immediate form and HP consistency', function () {
	this.timeout(15000);
	let battle;
	afterEach(() => battle?.destroy());
	function begin(species, item, stars = 1, bonus = 0, missing = 0, customize = () => { }) {
		const modifiers = { hp: bonus };
		const mon = createRoguePokemon({ ...set(species, 'Torrent', 80, ['Splash']), item }, stats(3), 'ours', stars, modifiers);
		mon.statModifiers = modifiers;
		mon.hp -= missing;
		customize(mon);
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'forms-consistency', team: [mon], boosts: stats(3), bag: {}, balls: [], catchable: false,
			systems: { player: { mega: true, gmega: true, z: true } }, tera: { player: true, opponent: true },
		}, p1: { team: [mon.set] }, p2: { team: [set('Blissey', 'Natural Cure', 80, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1');
		return battle.p1.active[0];
	}
	for (const stone of ['Swampertite X', 'Swampertite Y']) {
		for (const stars of [1, 2, 3, 4, 5]) {
			for (const missing of [0, 47]) {
				it(`preserves ${stars}-star HP and permanent growth immediately at ${stone}, missing ${missing}`, () => {
					const mon = begin('Swampert-Fantasy', stone, stars, 450, missing);
					const before = { hp: mon.hp, maxhp: mon.maxhp };
					assert(before.maxhp > 700);
					assert.equal(before.maxhp - before.hp, missing);
					assert(battle.actions.runMegaEvo(mon));
					assert.equal(mon.maxhp, before.maxhp, 'must not need an end-of-turn correction');
					assert.equal(mon.hp, before.hp);
					assert.equal(mon.baseStoredStats.hp, mon.baseMaxhp);
					const saved = rogueBattleResult(battle).team[0];
					assert.equal(saved.maxhp, before.maxhp);
					assert.equal(saved.hp, before.hp);
				});
			}
		}
	}
	it('preserves the saved damage amount when entry recalculates a changed HP maximum', () => {
		const mon = begin('Swampert-Fantasy', 'Swampertite X', 2, 0, 17, saved => {
			// Older snapshots can have a different maxHP after a stat update.
			saved.hp -= 3;
			saved.maxhp -= 3;
		});
		assert.equal(mon.maxhp - mon.hp, 17);
	});
	it('publishes the converted Fire/Dark typing in the Mega event before any next turn', () => {
		const mon = begin('Gyarados', 'Gyaradosite', 1, 0, 0, saved => {
			saved.emblem = 'rogueemblemfire';
			saved.emblemSlot = 0;
		});
		assert.deepEqual(mon.getTypes(), ['Fire', 'Flying']);
		assert(battle.actions.runMegaEvo(mon));
		assert.deepEqual(mon.getTypes(), ['Fire', 'Dark']);
		assert(battle.log.filter(line => line.includes('|typechange|')).at(-1).includes('|Fire/Dark|'));
		assert.equal(mon.runEffectiveness(battle.dex.getActiveMove('surf')), 1);
		assert.equal(mon.runEffectiveness(battle.dex.getActiveMove('thunderbolt')), 0);
	});
	for (const stars of [1, 3, 5])
		it(`preserves ${stars}-star growth and missing HP at Stellar Terapagos`, () => {
			const mon = begin('Terapagos-Terastal', '', stars, 450, 47, saved => { saved.set.teraType = 'Stellar'; });
			battle.actions.terastallize(mon);
			assert.equal(mon.species.name, 'Terapagos-Stellar');
			assert(mon.maxhp > 700);
			assert.equal(mon.maxhp, mon.baseStoredStats.hp);
			assert.equal(mon.maxhp - mon.hp, 47);
			const saved = rogueBattleResult(battle).team[0];
			assert.equal(saved.maxhp - saved.hp, 47);
		});
	for (const stone of ['Swampertite X', 'Swampertite Y'])
		it(`uses the corrected HP immediately for damage, healing, save and re-entry at ${stone}`, () => {
			const mon = begin('Swampert-Fantasy', stone, 4, 450, 47);
			battle.actions.runMegaEvo(mon);
			const maximum = mon.maxhp;
			battle.damage(83, mon, battle.p2.active[0], battle.dex.moves.get('tackle'));
			assert.equal(maximum - mon.hp, 130);
			battle.heal(29, mon, mon, battle.dex.moves.get('recover'));
			assert.equal(maximum - mon.hp, 101);
			battle.makeChoices('move splash', 'move splash');
			assert.equal(maximum - mon.hp, 101);
			const saved = JSON.parse(JSON.stringify(rogueBattleResult(battle).team[0]));
			battle.destroy();
			assert.equal(saved.set.species, 'Swampert-Fantasy');
			assert.equal(saved.maxhp - saved.hp, 101);
			battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
				encounterId: 'return', team: [saved], boosts: stats(3), bag: {}, balls: [], catchable: false,
			}, p1: { team: [saved.set] }, p2: { team: [set('Blissey', 'Natural Cure', 80, ['Splash'])] } });
			battle.makeChoices('team 1', 'team 1');
			assert.equal(battle.p1.active[0].maxhp - battle.p1.active[0].hp, 101);
		});
});
