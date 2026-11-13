'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { toID } = require('../../dist/sim/dex');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { permanentMemberTypes, blessingPartyRoles } = require('../../dist/sim/rogue-blessing-permanent');
const { robeActive, robeMultiplier } = require('../../dist/sim/fantasy-rogue-awakening');
const { ghidorahActive } = require('../../dist/sim/rogue-ghidorah');
const { veteranSniper } = require('../../dist/sim/rogue-sniper');
const { spindaDamage } = require('../../dist/sim/rogue-spinda');
const { blessingParty, battleDevotionBonus, weaknessArmorCount, roguePowerModifiers, rogueDamageSources,
	eeveeZAvailable, blessingEffectiveness, battleDragonKing, dragonKingRequest, chooseDragonKing,
	ROGUE_BLESSING_EVENTS } = require('../../dist/sim/fantasy-rogue-blessings');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative full personal roster conditions', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function party(species, ids, moves = ['Splash']) {
		const run = { id: 'roster', floor: 30, phase: 'ready', money: 0, bag: {}, boosts: stats(0),
			team: species.map(name => createRoguePokemon(set(name, 'Run Away', 30, moves), stats(0))) };
		syncBlessingParty(run); run.blessings.owned = ids.map(id => ({ ...blessing(id), floor: 1 }));
		syncBlessingParty(run);
		run.blessings.party = run.team.filter(mon => !mon.egg).map(mon => ({ id: mon.id, species: mon.set.species,
			types: permanentMemberTypes(mon), moves: mon.set.moves.map(toID) }));
		return run;
	}
	function begin(host, guest = party(['Pikachu'], []), preview = true) {
		for (const run of [host, guest]) if (run.blessings.party) {
			run.blessings.partyRoles = blessingPartyRoles(run.team, run.blessings);
		}
		const state = { encounterId: 'roster', team: structuredClone(host.team.slice(0, 3)), boosts: stats(0),
			blessings: structuredClone(host.blessings), bag: {}, partnerBag: {},
			partner: { team: structuredClone(guest.team.slice(0, 3)), boosts: stats(0), blessings: structuredClone(guest.blessings) },
			balls: [], catchable: false, cooperative: { opponentOffset: 1 } };
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Host', team: state.team.map(mon => mon.set) }, p3: { name: 'Guest', team: state.partner.team.map(mon => mon.set) },
			p2: { name: 'Enemy A', team: [set('Blissey', 'Run Away', 100, ['Splash'])] },
			p4: { name: 'Enemy B', team: [set('Blissey', 'Run Away', 100, ['Splash'])] } });
		if (preview) battle.makeChoices('team ' + state.team.map((_, i) => i + 1).join(''), 'team 1',
			'team ' + state.partner.team.map((_, i) => i + 1).join(''), 'team 1');
		return battle.p1.active[0];
	}
	const six = species => Array(6).fill(species);
	it('counts all six personal Devotion members rather than selected three or human partner', () => {
		const host = party(six('Pikachu'), ['devotion']); host.blessings.owned[0].species = 'pikachu';
		const guest = party(['Eevee', 'Eevee'], ['devotion']); guest.blessings.owned[0].species = 'eevee';
		const mon = begin(host, guest);
		assert.equal(battle.p1.pokemon.length, 3);
		assert.deepEqual(battleDevotionBonus(mon), { count: 6, power: 85, reduction: 25 });
		assert.deepEqual(battleDevotionBonus(battle.p3.active[0]), { count: 2, power: 12, reduction: 5 });
		assert.equal(battleDevotionBonus(battle.p2.active[0]).count, 0);
		assert.equal(roguePowerModifiers(mon, battle.dex.getActiveMove('tackle')).find(x => x.source === '专一').factor, 1.85);
		battle.fantasyRogue.blessings.party[5].species = 'Raichu';
		assert.equal(battleDevotionBonus(mon).count, 5);
	});
	it('does not activate Ordinary by hiding a high-BST member among unselected reserves', () => {
		const mon = begin(party(['Pikachu', 'Pikachu', 'Pikachu', 'Mewtwo'], ['ordinary']));
		const move = battle.dex.getActiveMove('tackle'), foe = battle.p2.active[0];
		assert.equal(ROGUE_BLESSING_EVENTS.onModifyDamage.call(battle, 100, mon, foe, move), 100);
		assert(!rogueDamageSources(mon, move).some(text => text.includes('普通宝可梦')));
		battle.fantasyRogue.blessings.party[3].species = 'Pikachu';
		assert.equal(ROGUE_BLESSING_EVENTS.onModifyDamage.call(battle, 100, mon, foe, move), 115);
		assert(rogueDamageSources(mon, move).some(text => text.includes('普通宝可梦')));
	});
	it('counts reserve Bug Buzz and sound moves while using live selected move slots', () => {
		begin(party(['Pikachu'], []), party(six('Yanma'), ['bugchoir', 'sound'], ['Bug Buzz']));
		const mon = battle.p3.active[0], move = battle.dex.getActiveMove('bugbuzz');
		assert.equal(roguePowerModifiers(mon, move).find(x => x.add).add, 60);
		assert.equal(ROGUE_BLESSING_EVENTS.onModifyDamage.call(battle, 100, mon, battle.p4.active[0], move), 130);
		assert(rogueDamageSources(mon, move).some(text => text.includes('30%')));
		mon.moveSlots[0].id = 'splash';
		assert.equal(roguePowerModifiers(mon, move).find(x => x.add).add, 50);
		assert.equal(ROGUE_BLESSING_EVENTS.onModifyDamage.call(battle, 100, mon, battle.p4.active[0], move), 125);
		assert.equal(blessingParty(battle.p1.active[0]).length, 1);
	});
	it('counts reserve starters for personal defensive reduction', () => {
		begin(party(['Pikachu'], []), party(['Bulbasaur', 'Charmander', 'Squirtle', 'Treecko', 'Torchic', 'Mudkip'], ['starters']));
		const target = battle.p3.active[0], move = battle.dex.getActiveMove('tackle');
		assert.equal(ROGUE_BLESSING_EVENTS.onModifyDamage.call(battle, 100, battle.p4.active[0], target, move), 70);
		assert.equal(ROGUE_BLESSING_EVENTS.onModifyDamage.call(battle, 100, battle.p2.active[0], battle.p1.active[0], move), 100);
	});
	it('uses reserve types and current selected types for weakness armor, including checkpoints', () => {
		const mon = begin(party(six('Aggron'), ['weaknessarmor']));
		assert.equal(weaknessArmorCount(mon), 12);
		battle.p1.pokemon[1].setType(['Normal']); assert.equal(weaknessArmorCount(mon), 10);
		const before = battle.toJSON(); battle.destroy(); battle = Battle.fromJSON(JSON.stringify(before));
		assert.equal(weaknessArmorCount(battle.p1.active[0]), 10);
		assert.equal(weaknessArmorCount(battle.p3.active[0]), 0);
	});
	it('allows an Eevee family owner to execute its extra Z with only three selected', () => {
		begin(party(['Pikachu'], []), party(['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon'], ['eeveefamily']));
		const mon = battle.p3.active[0]; assert(eeveeZAvailable(mon)); assert(!eeveeZAvailable(battle.p1.active[0]));
		battle.makeChoices('move splash', 'move splash', 'rogueeeveez move splash', 'move splash');
		assert.equal(mon.boosts.atk, 2); assert(!eeveeZAvailable(mon)); assert(!battle.p3.zMoveUsed);
	});
	it('keeps old snapshots valid and does not count another owner to complete a family', () => {
		const host = party(['Eevee', 'Vaporeon', 'Jolteon'], ['eeveefamily']);
		const guest = party(['Flareon', 'Espeon', 'Umbreon'], ['eeveefamily']);
		delete host.blessings.party; delete guest.blessings.party;
		const mon = begin(host, guest); assert(!eeveeZAvailable(mon)); assert(!eeveeZAvailable(battle.p3.active[0]));
		assert.equal(blessingParty(mon).length, 3);
	});
	const strongestCases = [
		['Golduck', 'duck', mon => mon.hasAbility('neuroforce')],
		['Meloetta', 'singer', mon => mon.hasAbility('tianlaizhiyin')],
		['Meloetta', 'dancer', mon => mon.hasAbility('dancer')],
		['Hydreigon', 'ghidorah', mon => ghidorahActive(mon)],
		['Zangoose', 'godrobe', mon => robeActive(mon, 'godrobe')],
		['Meowstic-F', 'puregodrobe', mon => robeActive(mon, 'puregodrobe')],
		['Infernape', 'monkeyking', mon => mon.hasAbility('rockhead')],
		['Kingdra', 'veteransniper', mon => !!veteranSniper(mon)],
		['Spinda', 'spindance', mon => spindaDamage(mon.hp, mon, mon.battle.p2.active[0],
			mon.battle.dex.moves.get('tackle')) !== undefined],
		['Melmetal', 'meltan', mon => {
			mon.battle.activePokemon = mon;
			return blessingEffectiveness(-1, mon.battle.p2.active[0], 'Water', mon.battle.dex.getActiveMove('ironhead')) === 0;
		}],
		['Hoopa', 'hoopa', mon => roguePowerModifiers(mon, mon.battle.dex.getActiveMove('shadowball'))
			.some(entry => entry.factor === 1.5 && entry.source.includes('猜猜下一招'))],
	];
	for (const [species, family, active] of strongestCases) {
		it(`does not reassign ${family} to a weaker selected member while the strongest is in reserve`, () => {
			const run = party([species, 'Pikachu', 'Pikachu', species], [family]);
			for (const mon of run.team) {
				if (family === 'monkeyking') mon.emblem = 'rogueemblemrock';
				if (family === 'veteransniper') mon.set.ability = 'Sniper';
			}
			run.team[3].set.level = 40;
			// Sniper uses final stat total instead of level; make the reserve unambiguously stronger.
			if (family === 'veteransniper') run.team[3].stats.atk += 100;
			syncBlessingParty(run);
			begin(run, structuredClone(run));
			assert(!active(battle.p1.active[0])); assert(!active(battle.p3.active[0]));
			const checkpoint = battle.toJSON(); battle.destroy(); battle = Battle.fromJSON(JSON.stringify(checkpoint));
			assert(!active(battle.p3.active[0]), 'checkpoint keeps the full-party owner');
		});
	}
	for (const kind of ['godrobe', 'puregodrobe']) it(`applies ${kind} durability and abilities to its selected guest owner`, () => {
		const guest = party([kind === 'godrobe' ? 'Zangoose' : 'Meowstic-F'], [kind]);
		begin(party(['Pikachu'], []), guest);
		const mon = battle.p3.active[0]; assert(robeActive(mon, kind));
		assert(mon.hasAbility(kind === 'godrobe' ? 'sharpness' : 'sheerforce'));
		mon.hp = Math.floor(mon.maxhp / 4); assert(robeMultiplier(mon) >= 3);
		assert(mon.getStat('def') >= Math.floor(mon.storedStats.def * 3));
		if (kind === 'godrobe') {
			battle.damage(mon.maxhp * 10, mon, battle.p2.active[0], battle.dex.moves.get('tackle'));
			assert.equal(mon.hp, Math.floor(mon.maxhp / 2));
		} else {
			battle.runEvent('Update', mon); assert.equal(mon.boosts.spa, 1);
		}
		assert.equal(robeMultiplier(battle.p1.active[0]), 1); assert.equal(robeMultiplier(battle.p2.active[0]), 1);
	});
	it('counts all six distinct personal dogs on entry without counting the partner', () => {
		const dogs = ['Growlithe', 'Vulpix', 'Houndour', 'Smeargle', 'Poochyena', 'Electrike'];
		begin(party(dogs.slice(0, 2), ['dogs']), party(dogs, ['dogs']));
		assert.equal(Object.values(battle.p1.active[0].boosts).reduce((a, b) => a + b), 1);
		assert.deepEqual(['atk', 'def', 'spa', 'spd', 'spe'].map(stat => battle.p3.active[0].boosts[stat]), [1, 1, 1, 1, 1]);
	});
	it('lets Hoopa call the owner reserve move, but never a partner-only move', () => {
		const host = party(['Hoopa', 'Pikachu', 'Pikachu', 'Pikachu'], ['hoopa'], ['Hyperspace Hole']);
		host.team[3].set.moves = ['growl']; host.blessings.party[3].moves = ['growl'];
		begin(host, party(['Pikachu'], [], ['Swords Dance']));
		battle.makeChoices('move hyperspacehole 1', 'move splash', 'move swordsdance', 'move splash');
		assert.equal(battle.p2.active[0].boosts.atk, -1); assert.equal(battle.p4.active[0].boosts.atk, -1);
		assert.equal(battle.p1.active[0].boosts.atk, 0);
	});
	for (const alive of [true, false]) it(`handles a ${alive ? 'living' : 'fainted'} unselected campaign dragon king`, () => {
		const guest = party(['Dragonair', 'Pikachu', 'Pikachu', 'Dragonite'], ['dragonking']);
		guest.blessings.dragonKing = { member: guest.team[3].id, ability: 'drizzle' };
		if (!alive) guest.team[3].hp = 0;
		begin(party(['Pikachu'], []), guest, false);
		const king = battleDragonKing(battle.p3);
		assert.equal(king.member, alive ? '' : guest.team[0].id);
		assert.equal(king.pending, !alive); assert(!battle.p3.pokemon[0].hasAbility('drizzle'));
		assert.equal(!!dragonKingRequest(battle.p3), !alive);
		assert.equal(battleDragonKing(battle.p1), undefined);
		if (!alive) assert(chooseDragonKing(battle.p3, `drizzle ${king.token}`));
		battle.makeChoices('team 1', 'team 1', 'team 123', 'team 1');
		assert.equal(battle.p3.active[0].hasAbility('drizzle'), !alive);
	});
	it('still elects a selected successor when the actual guest king falls in battle', () => {
		const guest = party(['Dragonite', 'Dragonair'], ['dragonking']);
		guest.blessings.dragonKing = { member: guest.team[0].id, ability: 'drizzle' };
		begin(party(['Pikachu'], []), guest);
		const mon = battle.p3.active[0]; assert(mon.hasAbility('drizzle'));
		battle.damage(mon.hp + 100, mon, battle.p2.active[0], battle.dex.moves.get('tackle'));
		battle.faintMessages();
		const king = battleDragonKing(battle.p3);
		assert.equal(king.member, guest.team[1].id); assert(king.pending);
		assert.equal(battle.fantasyRogue.partner.blessings.dragonKing.member, guest.team[0].id);
	});
});
