'use strict';
const assert = require('assert').strict;
const { Battle, Dex, TeamValidator } = require('../../dist/sim');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { editParty } = require('../../dist/server/fantasy-rogue/team');
const { prepareUniversalConfiguration } = require('../../dist/server/fantasy-rogue/universal-evolution');
const { blessingCandidates, handleBlessingCommand } = require('../../dist/server/fantasy-rogue/blessings');
const { validUniversalBonus, UNIVERSAL_ITEMS } = require('../../dist/sim/rogue-universal-data');
const { universalConfiguration } = require('../../dist/sim/rogue-universal-evolution');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { randomUUID } = require('crypto');
const { set, stats, content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue universal evolution', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	const mega = 'rogueuniversalmegastone', gmega = 'rogueuniversalwishingstar', z = 'rogueuniversalpsychicz';
	const bonuses = { [mega]: { hp: 0, atk: 30, def: 30, spa: 20, spd: 20, spe: 0 },
		[gmega]: { hp: 40, atk: 20, def: 10, spa: 10, spd: 10, spe: 10 },
		[z]: { hp: 0, atk: 20, def: 20, spa: 10, spd: 0, spe: 0 } };
	function run(item = mega, species = 'Mew') {
		const mon = createRoguePokemon({ ...set(species, 'Intimidate', 50, ['Tackle']), item: '' }, stats(0));
		return { phase: 'ready', floor: 50, team: [mon], bag: { [item]: 1 }, boosts: stats(0),
			megaUnlocked: true, gmegaUnlocked: true, zUnlocked: true };
	}
	function begin(item, configure = true, extra = []) {
		const r = run(item);
		if (configure) editParty(r, { action: 'configureuniversal', member: r.team[0].id, value: item, evs: bonuses[item], aura: 'atk' }, content());
		else r.team[0].set.item = item;
		r.team.push(...extra);
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'universal', team: r.team, boosts: stats(0), bag: {}, balls: [], catchable: false,
			systems: { player: { mega: true, gmega: true, z: true } },
		}, p1: { team: r.team.map(p => p.set) }, p2: { team: [set('Blissey', 'Natural Cure', 100, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1');
		return battle.p1.active[0];
	}
	function beginCoop(item) {
		const host = run(item), guest = run(item);
		for (const r of [host, guest]) {
			r.team[0].set.moves = ['Splash']; r.team[0].pp = [{ id: 'splash', pp: 40, maxpp: 40 }];
			editParty(r, { action: 'configureuniversal', member: r.team[0].id, value: item,
				evs: bonuses[item], aura: r === host ? 'atk' : 'def' }, content());
		}
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'universal-coop', team: host.team, partner: { team: guest.team, boosts: stats(0) },
			cooperative: { opponentOffset: 1 }, boosts: stats(0), bag: {}, balls: [], catchable: false,
			systems: { player: { mega: true, gmega: true, z: true }, partner: { mega: true, gmega: true, z: true } },
		}, p1: { team: host.team.map(p => p.set) }, p3: { team: guest.team.map(p => p.set) },
		p2: { team: [set('Blissey', 'Natural Cure', 100, ['Splash'])] },
		p4: { team: [set('Blissey', 'Natural Cure', 100, ['Splash'])] } });
		for (const side of ['p1', 'p2', 'p3', 'p4']) assert(battle.choose(side, 'team 1'));
		return battle.p3.active[0];
	}
	for (const [kind, item] of [['mega', mega], ['gmega', gmega], ['z', z]]) {
		it(`activates the guest’s configured ${kind} through native Multi choices without consuming the host’s slot`, () => {
			const mon = beginCoop(item), host = battle.p1.active[0], hp = mon.maxhp, foe = battle.p2.active[0];
			assert.equal(universalConfiguration(mon).item, item);
			assert.equal(foe.boosts.atk, -2);
			assert(kind === 'z' ? mon.canUltraBurst : mon.canMegaEvo);
			if (kind === 'gmega') assert(mon.getMoveRequestData().canGMegaEvo);
			for (const side of ['p1', 'p2', 'p3', 'p4']) {
				assert(battle.choose(side, `move splash${side === 'p3' ? (kind === 'z' ? ' ultra' : ' mega') : ''}`));
			}
			assert.equal(mon.m.rogueUniversalKind, kind); assert.equal(mon.species.name, 'Mew');
			assert.equal(mon.ability, 'intimidate'); assert.equal(foe.boosts.atk, -3);
			assert.equal(mon.species.baseStats.atk, 100 + bonuses[item].atk);
			assert.equal(mon.maxhp, hp + (kind === 'gmega' ? 40 : 0));
			assert.equal(mon.hp, mon.maxhp); assert.equal(mon.takeItem(foe), false);
			assert(battle.fantasyRogue.evolutionUses.p3[kind]);
			assert(!battle.fantasyRogue.evolutionUses.p1?.[kind]);
			assert(kind === 'z' ? host.canUltraBurst : host.canMegaEvo);
			if (kind === 'z') { assert(mon.volatiles.auraburstdef); assert(!host.side.zMoveUsed); }
			for (const side of ['p1', 'p2', 'p3', 'p4']) {
				assert(battle.choose(side, `move splash${side === 'p1' ? (kind === 'z' ? ' ultra' : ' mega') : ''}`));
			}
			assert.equal(host.m.rogueUniversalKind, kind); assert.equal(foe.boosts.atk, -4);
			assert(battle.fantasyRogue.evolutionUses.p1[kind]);
		});
	}
	it('keeps guest configuration separate from duel opponents and never lends it to the other NPC side', () => {
		const mon = beginCoop(mega), state = battle.fantasyRogue, guest = state.partner.team[0];
		for (const side of [battle.p2, battle.p4]) {
			side.active[0].set.fantasyRogueId = guest.id; side.active[0].item = mega;
			assert.equal(universalConfiguration(side.active[0]), undefined);
		}
		state.duel = { team: [guest] }; delete state.partner;
		assert.equal(universalConfiguration(mon), undefined);
		assert.equal(universalConfiguration(battle.p2.active[0]).item, mega);
		assert.equal(universalConfiguration(battle.p4.active[0]), undefined);
	});
	it('validates exact totals, per-stat bounds and fixed HP on the server', () => {
		for (const item of [mega, gmega, z]) {
			assert(validUniversalBonus(item, bonuses[item]));
			assert(!validUniversalBonus(item, { ...bonuses[item], hp: bonuses[item].hp + 1 }));
			assert(!validUniversalBonus(item, { ...bonuses[item], atk: -1 }));
			assert(!validUniversalBonus(item, { ...bonuses[item], atk: 1.5 }));
			assert(!validUniversalBonus(item, { ...bonuses[item], atk: 41 }));
		}
		const dex = Dex.mod('gen9fantasy');
		for (const item of UNIVERSAL_ITEMS) {
			assert.equal(dex.items.get(item.id).spritenum,
				item.kind === 'mega' ? 768 : dex.items.get(item.icon).spritenum, item.id);
		}
	});
	it('rejects forged equip fields, missing inventory and ineligible partners without changing inventory', () => {
		const r = run(), mon = r.team[0], before = JSON.stringify(r);
		assert.throws(() => editParty(r, { action: 'equip', member: mon.id, value: mega, evs: bonuses[mega] }, content()), /先在万用道具配置/);
		assert.equal(JSON.stringify(r), before);
		r.bag[mega] = 0;
		assert.throws(() => editParty(r, { action: 'configureuniversal', member: mon.id, value: mega, evs: bonuses[mega] }, content()), /背包/);
		assert(!mon.universalEvolution);
		for (const species of ['Bulbasaur', 'Pikachu']) {
			const invalid = run(mega, species);
			assert.throws(() => prepareUniversalConfiguration(invalid, invalid.team[0], mega, bonuses[mega]), /最终形态/);
		}
	});
	it('keeps system and type requirements, chooses only tied highest final stats and preserves ability', () => {
		const r = run(z), mon = r.team[0];
		assert.throws(() => prepareUniversalConfiguration(r, mon, z, bonuses[z]), /最高/);
		assert.throws(() => prepareUniversalConfiguration(r, mon, z, bonuses[z], 'spe'), /最高/);
		editParty(r, { action: 'configureuniversal', member: mon.id, value: z, evs: bonuses[z], aura: 'def' }, content());
		assert.equal(mon.universalEvolution.aura, 'def'); assert.equal(mon.set.ability, 'Intimidate');
		r.zUnlocked = false;
		assert.throws(() => prepareUniversalConfiguration(r, mon, z, bonuses[z], 'atk'), /系统/);
		const other = run(z, 'Blissey');
		assert.throws(() => prepareUniversalConfiguration(other, other.team[0], z, bonuses[z], 'atk'), /属性/);
	});
	it('allows unfinished evolution stages to use the Wishing Star, while Mega and Totem still require final forms', () => {
		const r = run(gmega, 'Pikachu'), mon = r.team[0];
		editParty(r, { action: 'configureuniversal', member: mon.id, value: gmega, evs: bonuses[gmega] }, content());
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'young-gmega', team: r.team, boosts: stats(0), bag: {}, balls: [], catchable: false,
			systems: { player: { mega: true, gmega: true, z: true } },
		}, p1: { team: [mon.set] }, p2: { team: [set('Blissey', 'Natural Cure', 100, ['Splash'])] } });
		battle.makeChoices('team 1', 'team 1');
		assert.equal(battle.p1.active[0].getMoveRequestData().canGMegaEvo, true);
		battle.makeChoices('move 1 mega', 'move 1');
		assert.equal(battle.p1.active[0].m.rogueUniversalKind, 'gmega');
		assert.equal(battle.p1.active[0].species.baseStats.hp, Dex.mod('gen9fantasy').species.get('Pikachu').baseStats.hp + 40);
	});
	it('retains immutable Kid equipment and rolls back an unfinishable allocation', () => {
		const r = run(), mon = r.team[0]; mon.set.item = 'eviolite';
		r.blessings = { owned: [{ id: 'kid', family: 'kid' }] };
		assert.throws(() => editParty(r, { action: 'configureuniversal', member: mon.id, value: mega, evs: bonuses[mega] }, content()), /不可取下/);
		assert(!mon.universalEvolution); assert.equal(mon.set.item, 'eviolite'); assert.equal(r.bag[mega], 1);
	});
	it('persists a manual allocation transaction and deduplicates the exact client request', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content(), () => 0), userid = 'universal-request';
			engine.command(userid, { id: randomUUID(), revision: store.get(userid).revision, action: 'start', starters: ['bulbasaur'] });
			store.change(userid, account => {
				const configured = run(), mon = configured.team[0]; mon.set.item = 'Leftovers';
				Object.assign(account.run, { phase: 'choose', team: configured.team, megaUnlocked: true, bag: { [mega]: 1 } });
				if (account.run.blessings) {
					delete account.run.blessings.beforeAdventure; delete account.run.blessings.round;
				}
			});
			const command = { id: randomUUID(), revision: store.get(userid).revision, action: 'configureuniversal',
				member: store.get(userid).run.team[0].id, value: mega, evs: bonuses[mega] };
			engine.command(userid, command); const after = store.get(userid);
			engine.command(userid, command); assert.deepEqual(store.get(userid), after);
			assert.equal(after.run.bag[mega], 0); assert.equal(after.run.bag.leftovers, 1);
			assert.deepEqual(after.run.team[0].universalEvolution.bonus, bonuses[mega]);
		} finally { store.close(); }
	});
	it('activates ordinary Mega through a real move choice, retains model, retriggers ability and shares the slot', () => {
		const native = createRoguePokemon({ ...set('Charizard', 'Blaze', 50, ['Tackle']), item: 'Charizardite X' }, stats(0));
		const mon = begin(mega, true, [native]), foe = battle.p2.active[0], oldAtk = mon.storedStats.atk;
		assert.equal(foe.boosts.atk, -1); assert(mon.canMegaEvo); assert(battle.p1.pokemon[1].canMegaEvo);
		assert.equal(mon.takeItem(foe), false);
		battle.makeChoices('move tackle mega', 'move splash');
		assert.equal(mon.species.name, 'Mew'); assert.equal(mon.ability, 'intimidate');
		assert.equal(foe.boosts.atk, -2); assert.equal(mon.species.baseStats.atk, 130);
		assert(mon.storedStats.atk > oldAtk); assert.equal(battle.p1.pokemon[1].canMegaEvo, null);
		assert.equal(Dex.mod('gen9fantasy').species.get('Mew').baseStats.atk, 100);
	});
	it('gives G-Mega its independent request flag, correct HP increase and ordinary G-Mega slot', () => {
		const native = createRoguePokemon({ ...set('Charizard', 'Blaze', 50, ['Tackle']), item: 'Charizardite X' }, stats(0));
		const mon = begin(gmega, true, [native]), hp = mon.maxhp;
		assert(mon.getMoveRequestData().canGMegaEvo);
		battle.makeChoices('move tackle mega', 'move splash');
		assert.equal(mon.maxhp, hp + 40); assert.equal(mon.hp, hp + 40);
		assert(mon.species.isGMega); assert(battle.p1.pokemon[1].canMegaEvo, 'ordinary Mega retains its separate slot');
	});
	it('uses the normal Z permission and slot with the chosen aura, without offering an ordinary Z attack', () => {
		const mon = begin(z);
		assert(mon.canUltraBurst); assert(!mon.getMoveRequestData().canZMove);
		battle.makeChoices('move tackle ultra', 'move splash');
		assert(battle.p1.zMoveUsed); assert(mon.volatiles.auraburstatk);
		assert.equal(mon.species.name, 'Mew'); assert.equal(mon.canUltraBurst, null);
		assert.equal(battle.runEvent('ModifyAtk', mon, null, null, 100), 150);
	});
	it('rejects unconfigured items and does not expose the items in ordinary National Dex', () => {
		const mon = begin(mega, false);
		assert(!mon.canMegaEvo);
		assert(TeamValidator.get('gen9nationaldexubers').validateTeam([{ ...set('Mew', 'Synchronize', 100), item: mega }])?.length);
	});
	it('preserves custom stats and model through an AI state clone and subsequent switches', () => {
		const extra = createRoguePokemon(set('Blissey', 'Natural Cure', 50, ['Splash']), stats(0));
		const mon = begin(mega, true, [extra]);
		battle.makeChoices('move tackle mega', 'move splash');
		const copy = Battle.fromJSON(JSON.parse(JSON.stringify(battle.toJSON())));
		try {
			assert.equal(copy.p1.active[0].species.baseStats.atk, 130);
			copy.makeChoices('switch 2', 'move splash');
			const slot = copy.p1.pokemon.findIndex(p => p.set.fantasyRogueId === mon.set.fantasyRogueId) + 1;
			copy.makeChoices(`switch ${slot}`, 'move splash');
			assert.equal(copy.p1.active[0].species.baseStats.atk, 130);
			assert.equal(copy.p1.active[0].storedStats.atk, mon.storedStats.atk);
			assert.equal(copy.p1.active[0].species.name, 'Mew');
		} finally { copy.destroy(); }
	});
	it('offers the new blessings only after their own system is unlocked', () => {
		const r = run(), c = content(); c.blessings = true;
		const ids = () => blessingCandidates(r, c).map(b => b.id);
		assert(ids().includes('universalmega')); r.megaUnlocked = false; assert(!ids().includes('universalmega'));
		assert(ids().includes('universalgmega')); r.gmegaUnlocked = false; assert(!ids().includes('universalgmega'));
		assert(ids().includes('universaltotem')); r.zUnlocked = false; assert(!ids().includes('universaltotem'));
		r.megaUnlocked = true; r.phase = 'blessing';
		r.blessings.round = { floor: 50, tier: 'gold', remaining: 1, topClearMindEligible: false,
			familiesSeen: [], options: [{ id: 'universalmega', chosen: false, refreshes: 0 }] };
		handleBlessingCommand({ unlocks: {} }, r, c, { action: 'blessing', slot: 0 }, () => 0);
		assert.equal(r.bag[mega], 2);
	});
});
