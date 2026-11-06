'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue item module', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function begin(item, full = false, ids = [], species = 'Mew') {
		battle?.destroy();
		const team = [createRoguePokemon({ ...set(species, full ? 'Zeng Fu Xi Tong' : 'Synchronize', 50,
			['Tackle', 'Psychic']), item }, stats(0))];
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'items', team, boosts: stats(0), bag: {}, balls: [], catchable: false,
			blessings: { owned: ['itemcontest', ...ids].map(id => ({ ...blessing(id), floor: 50 })) },
		}, p1: { team: team.map(p => p.set) }, p2: { team: [set('Blissey', 'Natural Cure', 100, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1');
		return battle.p1.active[0];
	}
	for (const full of [false, true]) {
		const factor = full ? 4 : 2;
		it(`amplifies only the Choice Band bonus with ${full ? 'both sources' : 'the module'}`, () => {
			const mon = begin('Choice Band', full);
			assert(mon.hasAbility('rogueitemmodule'));
			assert.equal(battle.runEvent('ModifyAtk', mon, null, null, 100), full ? 300 : 200);
		});
		it(`includes the Kid blessing and Eviolite without multiplying unrelated stats (${factor})`, () => {
			const mon = begin('Eviolite', full, ['kid'], 'Cubone');
			assert.equal(battle.runEvent('ModifyAtk', mon, null, null, 100), 100 + 30 * factor);
			assert.equal(battle.runEvent('ModifyDef', mon, null, null, 100), 100 + 50 * factor);
		});
		it(`amplifies item healing but leaves move healing alone (${factor})`, () => {
			const mon = begin('Leftovers', full); mon.hp = 1;
			assert.equal(battle.heal(10, mon, mon, battle.dex.items.get('leftovers')), 10 * factor);
			assert.equal(battle.heal(10, mon, mon, battle.dex.moves.get('recover')), 10);
		});
		it(`amplifies the strengthened Life Orb bonus while retaining its 20% cost (${factor})`, () => {
			const mon = begin('Life Orb', full, ['lifepower']);
			const move = battle.dex.getActiveMove('psychic');
			assert.equal(battle.runEvent('ModifyDamage', mon, battle.p2.active[0], move, 100), 100 + 60 * factor);
			const hp = mon.hp;
			battle.makeChoices('move psychic', 'move splash');
			assert.equal(hp - mon.hp, Math.floor(mon.baseMaxhp / 5));
		});
	}
	it('does not add non-STAB power or enlarge the Iron Ball speed penalty', () => {
		const mon = begin('Iron Ball');
		assert.equal(battle.runEvent('ModifySpe', mon, null, null, 100), 50);
		assert.equal(battle.runEvent('BasePower', mon, battle.p2.active[0], battle.dex.getActiveMove('tackle'), 100), 100);
	});
	it('keeps the native complete system non-STAB bonus exactly once', () => {
		const mon = begin('', true);
		assert.equal(battle.runEvent('BasePower', mon, battle.p2.active[0], battle.dex.getActiveMove('tackle'), 300), 400);
	});
	it('amplifies consumed gem power through its item-origin volatile', () => {
		const mon = begin('Psychic Gem');
		mon.addVolatile('gem', mon, battle.dex.items.get('psychicgem'));
		assert.equal(battle.runEvent('BasePower', mon, battle.p2.active[0], battle.dex.getActiveMove('psychic'), 100), 160);
	});
	it('amplifies positive item stages and retains negative stages', () => {
		const mon = begin('Weakness Policy');
		battle.boost({ atk: 2, def: -1 }, mon, mon, battle.dex.items.get('weaknesspolicy'));
		assert.equal(mon.boosts.atk, 4); assert.equal(mon.boosts.def, -1);
	});
	it('amplifies item damage to opponents while retaining self-inflicted item costs', () => {
		const mon = begin('Rocky Helmet'), foe = battle.p2.active[0];
		assert.equal(battle.damage(30, foe, mon, battle.dex.items.get('rockyhelmet')), 60);
		assert.equal(battle.damage(10, mon, mon, battle.dex.items.get('lifeorb')), 10);
	});
	it('retains the complete system Mold Breaker boundary for defensive item boosts', () => {
		const mon = begin('Eviolite', true, [], 'Cubone'), foe = battle.p2.active[0];
		foe.setAbility('moldbreaker', null, true);
		battle.activePokemon = foe; battle.activeMove = battle.dex.getActiveMove('tackle');
		battle.singleEvent('ModifyMove', foe.getAbility(), foe.abilityState, battle.activeMove, foe);
		assert.equal(battle.runEvent('ModifyDef', mon, foe, battle.activeMove, 100), 150);
	});
});
