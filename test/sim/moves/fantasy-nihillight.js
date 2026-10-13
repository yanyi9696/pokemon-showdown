'use strict';

const assert = require('../../assert');
const { Battle } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Fantasy Nihil Light conversion', () => {
	let battle;
	function createBattle(defender = {}, attacker = {}) {
		battle = new Battle({
			format: new Format({ name: 'Fantasy Nihil Light test', mod: 'gen9fantasy', gameType: 'doubles', ruleset: [] }),
			strictChoices: true,
			seed: [1, 2, 3, 4],
			p1: { team: [
				{ species: 'Zygarde-Complete', ability: 'Power Construct', item: 'Zygardite',
					level: 50, moves: ['coreenforcer', 'splash'], ...attacker },
				{ species: 'Magikarp', ability: 'Swift Swim', moves: ['splash'] },
			] },
			p2: { team: [
				{ species: 'Weezing-Galar-Fantasy', ability: 'Neutralizing Gas', moves: ['splash'], ...defender },
				{ species: 'Blissey', ability: 'Shell Armor', moves: ['splash'] },
			] },
		});
		battle.randomizer = damage => damage;
		battle.randomChance = (numerator, denominator) => numerator >= denominator;
		return battle.p1.active[0];
	}

	afterEach(() => {
		battle?.destroy();
		battle = null;
	});

	for (const defender of [
		{ species: 'Weezing-Galar-Fantasy', ability: 'Neutralizing Gas' },
		{ species: 'Weezing-Galar', ability: 'Neutralizing Gas' },
		{ species: 'Xerneas', ability: 'Fairy Aura' },
	]) {
		it(`hits ${defender.species} with ${defender.ability} on the first and second uses`, () => {
			const source = createBattle(defender);
			const [target, partner] = battle.p2.active;
			battle.makeChoices('move coreenforcer mega, move splash', 'move splash, move splash');
			assert.equal(source.species.id, 'zygardemega');
			assert.equal(source.moveSlots[0].id, 'nihillight');
			assert(target.hp < target.maxhp);
			assert(partner.hp < partner.maxhp);
			assert.false(target.volatiles.gastroacid);
			const firstDamage = target.maxhp - target.hp;
			const hp = target.hp;
			battle.makeChoices('move nihillight, move splash', 'move splash, move splash');
			assert.equal(hp - target.hp, firstDamage);
			if (defender.ability === 'Neutralizing Gas') {
				assert(target.hasAbility('Neutralizing Gas'));
				assert(source.ignoringAbility());
			}
		});
	}

	it('uses Nihil Light flags and leaves PP accounting intact on conversion', () => {
		const source = createBattle();
		const originalPP = source.moveSlots[0].pp;
		const maxPP = source.moveSlots[0].maxpp;
		battle.makeChoices('move coreenforcer mega, move splash', 'move splash, move splash');
		const used = source.lastMoveUsed;
		const expected = battle.dex.moves.get('nihillight');
		assert.equal(used.id, expected.id);
		assert.equal(used.basePower, expected.basePower);
		assert.deepEqual(used.flags, expected.flags);
		assert.equal(used.ignoreImmunity, true);
		assert.equal(used.ignoreDefensive, true);
		assert.equal(used.ignoreEvasion, true);
		assert.equal(used.onHit, expected.onHit);
		assert.equal(used.onAfterSubDamage, expected.onAfterSubDamage);
		assert.equal(source.moveSlots[0].pp, originalPP - 1);
		assert.equal(source.moveSlots[0].maxpp, maxPP);
		assert.equal(source.baseMoveSlots[0].id, 'nihillight');
	});

	it('ignores boosted Special Defense and evasion on the first use', () => {
		const source = createBattle({ species: 'Blissey', ability: 'Shell Armor' });
		const target = battle.p2.active[0];
		target.boosts.spd = 6;
		target.boosts.evasion = 6;
		battle.makeChoices('move coreenforcer mega, move splash', 'move splash, move splash');
		assert(target.hp < target.maxhp);
		const firstDamage = target.maxhp - target.hp;
		const hp = target.hp;
		battle.makeChoices('move nihillight, move splash', 'move splash, move splash');
		assert.equal(hp - target.hp, firstDamage);
		assert.equal(source.lastMoveUsed.id, 'nihillight');
	});

	it('does not suppress abilities with the old Core Enforcer hit callback', () => {
		createBattle({ species: 'Weezing', ability: 'Neutralizing Gas' });
		const target = battle.p2.active[0];
		battle.makeChoices('move coreenforcer mega, move splash', 'move splash, move splash');
		assert(target.hp < target.maxhp);
		assert.false(target.volatiles.gastroacid);
		assert(target.hasAbility('Neutralizing Gas'));
	});

	it('still respects Protect after conversion', () => {
		createBattle({ moves: ['protect'] });
		const target = battle.p2.active[0];
		battle.makeChoices('move coreenforcer mega, move splash', 'move protect, move splash');
		assert.equal(target.hp, target.maxhp);
		assert(battle.p2.active[1].hp < battle.p2.active[1].maxhp);
	});

	it('keeps Core Enforcer unchanged for Zygarde that has not Mega Evolved', () => {
		const source = createBattle({}, { species: 'Zygarde', item: '' });
		const target = battle.p2.active[0];
		battle.makeChoices('move coreenforcer, move splash', 'move splash, move splash');
		assert.equal(source.moveSlots[0].id, 'coreenforcer');
		assert.equal(target.hp, target.maxhp);
		assert.equal(source.lastMoveUsed.basePower, 100);
	});
});
