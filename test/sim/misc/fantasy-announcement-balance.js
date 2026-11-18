'use strict';
const assert = require('assert').strict;
const { Battle, Dex } = require('../../../dist/sim');
const { Format } = require('../../../dist/sim/dex-formats');

describe('Fantasy-only announced balance', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function create(p1, p2, mod = 'gen9fantasy', gameType = 'singles') {
		battle = new Battle({ format: new Format({ name: 'Fantasy announcement test', mod, ruleset: [], gameType }),
			seed: [1, 2, 3, 4], strictChoices: true, p1: { team: p1 }, p2: { team: p2 } });
		battle.randomizer = damage => damage;
		return battle;
	}
	it('applies the five move changes only in the Fantasy dex', () => {
		const changes = { screech: [85, 100], rockslide: [90, 95], steelwing: [90, 100], metalsound: [85, 100], frostbreath: [90, 100] };
		for (const [id, [oldAccuracy, newAccuracy]] of Object.entries(changes)) {
			assert.equal(Dex.mod('gen9fantasy').moves.get(id).accuracy, newAccuracy);
			assert.equal(Dex.mod('gen9').moves.get(id).accuracy, oldAccuracy);
			assert.equal(Dex.mod('gen8').moves.get(id).accuracy, oldAccuracy);
		}
		assert.equal(Dex.mod('gen9fantasy').moves.get('rockslide').secondaries[0].chance, 20);
		assert.equal(Dex.mod('gen9').moves.get('rockslide').secondaries[0].chance, 30);
	});
	for (const move of ['Tackle', 'Toxic']) it(`lets Fantasy Stalwart use ${move} through Substitute`, () => {
		create([{ species: 'Duraludon', ability: 'Stalwart', moves: [move] }], [{ species: 'Blissey', moves: ['Splash'] }]);
		const target = battle.p2.active[0]; target.addVolatile('substitute');
		battle.makeChoices();
		assert(move === 'Tackle' ? target.hp < target.maxhp : target.status === 'tox');
		assert(target.volatiles.substitute, 'the substitute is bypassed, not damaged');
	});
	it('keeps ordinary Stalwart blocked by Substitute', () => {
		create([{ species: 'Duraludon', ability: 'Stalwart', moves: ['Tackle'] }], [{ species: 'Blissey', moves: ['Splash'] }], 'gen9');
		const target = battle.p2.active[0]; target.addVolatile('substitute');
		battle.makeChoices(); assert.equal(target.hp, target.maxhp);
	});
	it('keeps redirection bypass and consecutive-use power on Stalwart+', () => {
		create([{ species: 'Duraludon', ability: 'Stalwart', moves: ['Tackle'] }, { species: 'Magikarp', moves: ['Splash'] }],
			[{ species: 'Blissey', moves: ['Splash'] }, { species: 'Clefable', moves: ['Follow Me'] }], 'gen9fantasy', 'doubles');
		battle.makeChoices('move 1 1, move 1', 'move 1, move 1');
		const [target, redirector] = battle.p2.active, damage = target.maxhp - target.hp;
		assert.equal(redirector.hp, redirector.maxhp); assert(damage > 0);
		const hp = target.hp;
		battle.makeChoices('move 1 1, move 1', 'move 1, move 1');
		assert(hp - target.hp > damage, 'existing consecutive damage boost is preserved');
	});
	for (const mod of ['gen9fantasy', 'gen9']) it(`handles activated Flash Fire across Mega in ${mod}`, () => {
		create([{ species: 'Houndoom', ability: 'Flash Fire', item: 'Houndoominite', moves: ['Splash', 'Flamethrower'] },
			{ species: 'Magikarp', moves: ['Splash'] }], [{ species: 'Blissey', moves: ['Ember', 'Splash'] }], mod);
		battle.makeChoices('move 1', 'move 1');
		const mon = battle.p1.active[0]; assert(mon.volatiles.flashfire); assert.equal(mon.hp, mon.maxhp);
		battle.makeChoices('move 1 mega', 'move 2'); assert(mon.species.isMega);
		if (mod === 'gen9') { assert(!mon.volatiles.flashfire); return; }
		assert(mon.volatiles.flashfire?.megaInherited); assert.equal(mon.ability, 'solarpower');
		const target = battle.p2.active[0], boosted = battle.actions.getDamage(mon, target, 'flamethrower');
		const boost = mon.volatiles.flashfire; delete mon.volatiles.flashfire;
		const plain = battle.actions.getDamage(mon, target, 'flamethrower'); mon.volatiles.flashfire = boost;
		assert(boosted > plain * 1.4 && boosted < plain * 1.6);
		battle.makeChoices('switch 2', 'move 2'); assert(!mon.volatiles.flashfire);
	});
	it('does not preserve an ordinary Flash Fire boost across Skill Swap', () => {
		create([{ species: 'Houndoom', ability: 'Flash Fire', moves: ['Splash'] }],
			[{ species: 'Blissey', ability: 'Natural Cure', moves: ['Ember', 'Skill Swap'] }]);
		battle.makeChoices('move 1', 'move 1'); assert(battle.p1.active[0].volatiles.flashfire);
		battle.makeChoices('move 1', 'move 2'); assert(!battle.p1.active[0].volatiles.flashfire);
	});
	it('keeps Substitute bypass distinct from immunity, Protect and screens', () => {
		create([{ species: 'Duraludon', ability: 'Stalwart', moves: ['Tackle'] }],
			[{ species: 'Gengar', moves: ['Splash'] }]);
		battle.makeChoices(); assert.equal(battle.p2.active[0].hp, battle.p2.active[0].maxhp);
		battle.destroy(); create([{ species: 'Duraludon', ability: 'Stalwart', moves: ['Tackle'] }],
			[{ species: 'Blissey', moves: ['Protect'] }]);
		battle.makeChoices(); assert.equal(battle.p2.active[0].hp, battle.p2.active[0].maxhp);
		const move = battle.dex.getActiveMove('tackle'), mon = battle.p1.active[0], target = battle.p2.active[0];
		battle.singleEvent('ModifyMove', mon.getAbility(), mon.abilityState, mon, target, move, move);
		const plain = battle.actions.getDamage(mon, target, move);
		target.side.addSideCondition('reflect', target);
		assert(battle.actions.getDamage(mon, target, move) < plain, 'Reflect must still reduce damage');
	});
	it('does not gain Flash Fire on Mega without first absorbing a Fire move', () => {
		create([{ species: 'Houndoom', ability: 'Flash Fire', item: 'Houndoominite', moves: ['Splash'] }],
			[{ species: 'Blissey', moves: ['Splash'] }]);
		battle.makeChoices('move 1 mega', 'move 1');
		assert(battle.p1.active[0].species.isMega); assert(!battle.p1.active[0].volatiles.flashfire);
	});
	for (const item of ['Houndoominite', 'rogueuniversalmegastone', 'rogueuniversalwishingstar']) {
		it(`retains activated Flash Fire in an actual Rogue battle with ${item}`, () => {
			const { createRoguePokemon } = require('../../../dist/server/fantasy-rogue/progression');
			const { stats, set, content } = require('../../fixtures/fantasy-rogue');
			const { editParty } = require('../../../dist/server/fantasy-rogue/team');
			const mon = createRoguePokemon(set('Houndoom', 'Flash Fire', 50, ['Splash', 'Flamethrower']), stats(0));
			mon.set.item = item;
			if (item.startsWith('rogue')) {
				mon.set.item = '';
				editParty({ phase: 'ready', floor: 50, team: [mon], bag: { [item]: 1 }, boosts: stats(0),
					megaUnlocked: true, gmegaUnlocked: true }, { action: 'configureuniversal', member: mon.id,
					value: item, evs: item === 'rogueuniversalwishingstar' ?
						{ hp: 40, atk: 20, def: 10, spa: 10, spd: 10, spe: 10 } :
						{ hp: 0, atk: 30, def: 30, spa: 20, spd: 20, spe: 0 } }, content());
			}
			battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
				encounterId: 'announcement', team: [mon], boosts: stats(0), bag: {}, balls: [], catchable: false,
				systems: { player: { mega: true, gmega: true } },
			}, p1: { team: [mon.set] }, p2: { team: [set('Blissey', 'Natural Cure', 50, ['Ember', 'Splash'])] } });
			battle.makeChoices('team 1', 'team 1'); battle.makeChoices('move 1', 'move 1');
			assert(battle.p1.active[0].volatiles.flashfire);
			battle.makeChoices('move 1 mega', 'move 2');
			assert(battle.p1.active[0].volatiles.flashfire?.megaInherited);
		});
	}
});
