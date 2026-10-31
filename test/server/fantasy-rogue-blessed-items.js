'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { assignedExtraAbilities } = require('../../dist/sim/rogue-blessing-permanent');
const { rogueAbilityInfo } = require('../../dist/sim/fantasy-rogue-blessings');
const { createRoguePokemon, evolveMember } = require('../../dist/server/fantasy-rogue/progression');
const { partyEvolutions } = require('../../dist/server/fantasy-rogue/party-evolution');
const { editParty } = require('../../dist/server/fantasy-rogue/team');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue blessed Life Orbs and Eviolites', function () {
	this.timeout(10000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	const effects = ids => ({ owned: ids.map(id => ({ id, family: id, tier: blessing(id).tier, floor: 1 })) });
	function begin(ids = ['lifepower'], options = {}) {
		battle?.destroy(); battle = undefined;
		const team = (options.team || [{ ...set('Mew', options.ability || 'Synchronize', 50,
			options.moves || ['Tackle', 'Double-Edge', 'Double Hit', 'Splash']), item: options.item ?? 'Life Orb' }])
			.map(s => createRoguePokemon(s, stats(0)));
		if (options.extraAbilities) team[0].extraAbilities = options.extraAbilities;
		battle = new Battle({ formatid: options.ordinary ? 'gen9customgame' : 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: options.ordinary ? undefined : { encounterId: 'blessed-items', team, boosts: stats(0),
				bag: {}, balls: [], catchable: false, blessings: effects(ids) },
			p1: { team: team.map(mon => mon.set) },
			p2: { team: options.foes || [set('Blissey', 'Natural Cure', 100, ['Splash'])] },
		});
		battle.makeChoices('team ' + team.map((_, i) => i + 1).join(''), 'team 1');
		battle.randomizer = damage => damage;
		return battle.p1.active[0];
	}
	function hit(move = 'move 1', foeMove = 'move 1') {
		const mon = battle.p1.active[0], foe = battle.p2.active[0], hp = mon.hp, targetHP = foe.hp;
		battle.makeChoices(move, foeMove);
		return { damage: targetHP - foe.hp, cost: hp - mon.hp };
	}
	it('preserves saved IDs and tiers while publishing the new names and precise bonuses', () => {
		assert.equal(blessing('lifepower').name, '自损一千，伤敌一万');
		assert.equal(blessing('lifepower').tier, 'gold');
		for (const text of ['【舍身】', '60%', '20%', '【强行】', '【魔法防守】']) assert(blessing('lifepower').text.includes(text));
		assert.equal(blessing('kid').tier, 'silver');
		assert(blessing('kid').text.includes('攻击与特攻提升 30%'));
	});
	it('grants Reckless to later party members without duplicating existing extra abilities or affecting eggs', () => {
		const mon = createRoguePokemon(set(), stats(0)), later = createRoguePokemon(set('Pikachu'), stats(0));
		mon.extraAbilities = ['reckless'];
		const team = [mon, later], state = effects(['lifepower']);
		assert.deepEqual(assignedExtraAbilities(mon, team, state), ['reckless']);
		assert.deepEqual(assignedExtraAbilities(later, team, state), ['reckless']);
		later.egg = {}; assert.deepEqual(assignedExtraAbilities(later, team, state), []);
	});
	it('applies Reckless to recoil moves but no blanket damage or HP cost without a Life Orb', () => {
		const mon = begin(['lifepower'], { item: '' });
		assert(mon.hasAbility('reckless')); assert(!battle.p2.active[0].hasAbility('reckless'));
		const move = battle.dex.getActiveMove('doubleedge');
		assert.equal(battle.runEvent('BasePower', mon, battle.p2.active[0], move, 120), 144);
		assert(!rogueAbilityInfo(mon).moves.tackle.damage.some(s => s.includes('生命宝珠')));
		const blessed = hit(); begin([], { item: '' });
		assert.deepEqual(blessed, hit()); assert.equal(blessed.cost, 0);
	});
	it('replaces the Life Orb factor with 1.6, preserves ordinary 1.3, and does not modify the opponent', () => {
		for (const [ids, factor] of [[['lifepower'], 1.6], [[], 1.3]]) {
			const mon = begin(ids), foe = battle.p2.active[0], move = battle.dex.getActiveMove('tackle');
			assert.equal(battle.runEvent('ModifyDamage', mon, foe, move, 1000), 1000 * factor);
			foe.setItem('lifeorb');
			assert.equal(battle.runEvent('ModifyDamage', foe, mon, move, 1000), 1300);
		}
		const mon = begin([], { ordinary: true }), move = battle.dex.getActiveMove('tackle');
		assert.equal(battle.runEvent('ModifyDamage', mon, battle.p2.active[0], move, 1000), 1300);
		assert(!mon.hasAbility('reckless'));
	});
	it('charges 20% once for a multi-hit move and retains the item effect after battle serialization', () => {
		let mon = begin();
		const expected = Math.floor(mon.baseMaxhp / 5);
		assert.equal(hit('move 3').cost, expected);
		const json = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(json);
		mon = battle.p1.active[0]; assert(mon.hasAbility('reckless'));
		assert.equal(hit().cost, expected);
	});
	for (const reason of ['protect', 'immune', 'miss', 'status']) {
		it(`does not charge Life Orb for ${reason}`, () => {
			const options = reason === 'protect' ? { foes: [set('Blissey', 'Natural Cure', 100, ['Protect'])] } :
				reason === 'immune' ? { foes: [set('Gastly', 'Levitate', 100, ['Splash'])] } : {};
			begin(['lifepower'], options);
			if (reason === 'miss') {
				const original = battle.runEvent.bind(battle);
				battle.runEvent = (name, ...args) => name === 'Accuracy' ? 0 : original(name, ...args);
			}
			assert.deepEqual(hit(reason === 'status' ? 'move 4' : 'move 1'), { damage: 0, cost: 0 });
		});
	}
	for (const ability of ['magicguard', 'sheerforce']) {
		it(`respects extra ${ability} as well as its native counterpart`, () => {
			const mon = begin(['lifepower'], { moves: ['Flamethrower'], extraAbilities: [ability] });
			assert(mon.hasAbility(ability));
			const result = hit(); assert(result.damage > 0); assert.equal(result.cost, 0);
		});
	}
	for (const suppression of ['klutz', 'magicroom', 'embargo']) {
		it(`disables both Life Orb multipliers during ${suppression}`, () => {
			const mon = begin(['lifepower'], { ability: suppression === 'klutz' ? 'Klutz' : 'Synchronize' });
			if (suppression === 'magicroom') battle.field.addPseudoWeather('magicroom', mon);
			if (suppression === 'embargo') mon.addVolatile('embargo');
			const move = battle.dex.getActiveMove('tackle');
			assert.equal(battle.runEvent('ModifyDamage', mon, battle.p2.active[0], move, 1000), 1000);
			assert(mon.hasAbility('reckless')); assert.equal(hit().cost, 0);
		});
	}
	it('shares one enhanced Life Orb through the electric family without applying its callback twice', () => {
		const team = ['Pikachu', 'Raichu', 'Plusle', 'Minun', 'Pachirisu', 'Dedenne'].map((name, i) =>
			({ ...set(name, 'Run Away', 50, ['Tackle']), item: i < 2 ? 'Life Orb' : '' }));
		let mon = begin(['lifepower', 'mousefamily'], { team });
		assert.equal(battle.runEvent('ModifyDamage', mon, battle.p2.active[0], battle.dex.getActiveMove('tackle'), 1000), 1600);
		assert.equal(hit().cost, Math.floor(mon.baseMaxhp / 5));
		battle.makeChoices('switch 3', 'move 1'); mon = battle.p1.active[0];
		assert.equal(mon.item, ''); assert(mon.hasItem('lifeorb'));
		assert.equal(hit().cost, Math.floor(mon.baseMaxhp / 5));
	});
	for (const species of ['Bulbasaur', 'Ivysaur', 'Venusaur']) {
		it(`adds 30% offense for ${species} while retaining native Eviolite defense eligibility`, () => {
			const mon = begin(['kid'], { team: [{ ...set(species, 'Run Away', 50, ['Tackle']), item: 'Eviolite' }] });
			assert.equal(mon.getStat('atk'), Math.floor(mon.storedStats.atk * 1.3));
			assert.equal(mon.getStat('spa'), Math.floor(mon.storedStats.spa * 1.3));
			for (const stat of ['def', 'spd']) assert.equal(mon.getStat(stat),
				mon.baseSpecies.nfe ? battle.modify(mon.storedStats[stat], 1.5) : mon.storedStats[stat]);
			assert.equal(mon.takeItem(battle.p2.active[0]), false);
			mon.addVolatile('embargo');
			assert.equal(mon.getStat('atk'), mon.storedStats.atk); assert.equal(mon.getStat('spa'), mon.storedStats.spa);
			assert(!rogueAbilityInfo(mon).statSources.some(s => s.includes('小鬼当家')));
			assert.equal(mon.takeItem(), false);
		});
	}
	for (const move of ['Knock Off', 'Trick']) {
		it(`keeps Eviolite attached when the opponent uses ${move}`, () => {
			const mon = begin(['kid'], { item: 'Eviolite', moves: ['Splash'],
				foes: [{ ...set('Mew', 'Synchronize', 50, [move]), item: 'Leftovers' }] });
			hit(); assert.equal(mon.item, 'eviolite'); assert.equal(battle.p2.active[0].item, 'leftovers');
		});
	}
	it('prevents Eviolite removal and final evolution outside battle without spending inventory', () => {
		const mon = createRoguePokemon(set('Bulbasaur', 'Overgrow', 40), stats(0));
		const run = { team: [mon], floor: 50, phase: 'ready', boosts: stats(0), bag: { eviolite: 2, leftovers: 1 }, blessings: effects(['kid']) };
		const content = { items: [{ id: 'eviolite', kind: 'held' }, { id: 'leftovers', kind: 'held' }] };
		editParty(run, { action: 'equip', member: mon.id, value: 'eviolite' }, content);
		assert.equal(run.bag.eviolite, 1);
		for (const value of ['', 'leftovers']) {
			assert.throws(() => editParty(run, { action: 'equip', member: mon.id, value }, content), /不可取下/);
			assert.equal(mon.set.item, 'eviolite'); assert.deepEqual(run.bag, { eviolite: 1, leftovers: 1 });
		}
		assert(partyEvolutions(mon, run).find(e => e.species === 'Ivysaur').ready);
		evolveMember(run, mon, 'Ivysaur'); assert.equal(mon.set.item, 'eviolite');
		assert(!partyEvolutions(mon, run).find(e => e.species === 'Venusaur').ready);
		assert.throws(() => evolveMember(run, mon, 'Venusaur'), /不能进化为最终形态/);
		assert.equal(mon.set.species, 'Ivysaur');
		const restored = JSON.parse(JSON.stringify(run));
		assert.throws(() => editParty(restored, { action: 'equip', member: mon.id, value: '' }, content), /不可取下/);
		assert.throws(() => evolveMember(restored, restored.team[0], 'Venusaur'), /不能进化为最终形态/);
	});
});
