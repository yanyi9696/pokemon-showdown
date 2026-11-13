'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { rogueBattleResult, snapshotRoguePokemon } = require('../../dist/sim/fantasy-rogue');
const { companionZRequest } = require('../../dist/sim/rogue-companion-z');
const { battleAffection, affectionAccuracy, affectionEndure, affectionResidual } = require('../../dist/sim/rogue-affection');
const { captureCoopCheckpoint, validCoopCheckpoint } = require('../../dist/sim/rogue-coop-checkpoint');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { emptyEchoUpgrades, echoPowerMultiplier, echoDamage } = require('../../dist/sim/rogue-echo');
const { rogueAbilityInfo } = require('../../dist/sim/fantasy-rogue-blessings');

describe('Fantasy Rogue cooperative personal battle effects', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function party(species, moves, ids = []) {
		const run = { id: 'effects', floor: 30, phase: 'ready', money: 0, bag: {}, boosts: stats(0),
			team: [createRoguePokemon(set(species, 'Run Away', 30, moves), stats(0))] };
		syncBlessingParty(run); run.blessings.owned = ids.map(id => ({ ...blessing(id), floor: 1 }));
		syncBlessingParty(run); return run;
	}
	function begin(host = party('Pikachu', ['Splash']), guest = party('Primeape', ['Rage Fist'])) {
		const state = { encounterId: 'personal-effects', team: structuredClone(host.team), boosts: stats(0),
			blessings: structuredClone(host.blessings), bag: { ...host.bag }, echo: host.echo && structuredClone(host.echo),
			mentorCard: host.mentorCard,
			partner: { team: structuredClone(guest.team), boosts: stats(0), blessings: structuredClone(guest.blessings),
				echo: guest.echo && structuredClone(guest.echo), mentorCard: guest.mentorCard },
			partnerBag: { ...guest.bag }, balls: [], catchable: false, progression: true, persistCoop: true,
			cooperative: { opponentOffset: 1 }, opponentCount: 2, opponentSlots: [0, 1] };
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Host', team: host.team.map(m => m.set) },
			p3: { name: 'Guest', team: guest.team.map(m => m.set) },
			p2: { name: 'Foe A', team: [set('Blissey', 'Run Away', 100, ['Splash'])] },
			p4: { name: 'Foe B', team: [set('Blissey', 'Run Away', 100, ['Splash'])] } });
		for (const side of ['p1', 'p2', 'p3', 'p4']) battle.choose(side, 'team 1');
		return battle.p3.active[0];
	}
	for (const owner of ['p1', 'p3']) for (const card of ['attack', 'guard', 'speed', 'balanced']) {
		it(`applies ${owner}'s ${card} mentor stats and display after checkpoint restoration`, () => {
			const { mentorCardProfile } = require('../../dist/sim/rogue-mentor');
			const { blessingModifyStat } = require('../../dist/sim/fantasy-rogue-blessings');
			const host = party('Pikachu', ['Splash']), guest = party('Pikachu', ['Splash']);
			(owner === 'p1' ? host : guest).mentorCard = card;
			begin(host, guest); restore();
			const profile = mentorCardProfile(card), mon = battle[owner].active[0];
			for (const [key, percent] of [['atk', profile.offense], ['spa', profile.offense],
				['def', profile.defense], ['spd', profile.defense], ['spe', profile.speed]]) {
				assert.equal(blessingModifyStat(100, mon, key), battle.modify(100, 1 + percent / 100));
				const effects = owner === 'p1' ? battle.fantasyRogue : battle.fantasyRogue.partner;
				const boosted = mon.getStat(key); delete effects.mentorCard;
				const base = mon.getStat(key); effects.mentorCard = card;
				assert.equal(boosted, battle.modify(base, 1 + percent / 100));
				for (const id of ['p1', 'p2', 'p3', 'p4'].filter(id => id !== owner)) {
					assert.equal(blessingModifyStat(100, battle[id].active[0], key), 100);
				}
			}
			assert.equal(rogueAbilityInfo(mon).mentor.name, profile.name);
			assert.equal(mon.getSwitchRequestData().rogueAbilityInfo.mentor.name, profile.name);
		});
	}
	function restore() {
		const checkpoint = captureCoopCheckpoint(battle); assert(validCoopCheckpoint(checkpoint, 'personal-effects'));
		battle.destroy(); battle = Battle.fromJSON(JSON.stringify(checkpoint.state)); return battle.p3.active[0];
	}
	for (const owner of ['p1', 'p3']) it(`isolates ${owner}'s echo power and guard through battle restoration`, () => {
		const host = party('Pikachu', ['Thunderbolt']), guest = party('Primeape', ['Rage Fist']);
		(owner === 'p1' ? host : guest).echo = { ...emptyEchoUpgrades(), types: ['Water'], guard: true };
		begin(host, guest);
		for (let restored = 0; restored < 2; restored++) {
			for (const id of ['p1', 'p2', 'p3', 'p4']) {
				const mon = battle[id].active[0], foe = battle[id === 'p2' || id === 'p4' ? 'p1' : 'p2'].active[0];
				const water = battle.dex.getActiveMove('watergun');
				assert.equal(echoPowerMultiplier(mon, water), id === owner ? 1.1 : 1);
				assert.equal(echoPowerMultiplier(mon, battle.dex.getActiveMove('tackle')), 1);
				assert.equal(echoDamage(100, mon, foe, water), id === owner ? 90 : 100);
				if (id === 'p1' || id === 'p3') {
					const info = rogueAbilityInfo(mon);
					assert.equal(info.statSources.some(text => text.includes('崩坏回响')), id === owner);
					assert.equal(!!Object.values(info.moves)[0].types, id === owner);
				}
			}
			const mon = battle[owner].active[0], ally = battle[owner === 'p1' ? 'p3' : 'p1'].active[0];
			assert.equal(echoDamage(100, mon, ally, battle.dex.getActiveMove('surf')), 100);
			assert.equal(echoDamage(100, mon, battle.p2.active[0], { effectType: 'Condition' }), 100);
			if (!restored) restore();
		}
	});
	it('keeps single-player NPC echo sharing and disables echoes in archived player duels', () => {
		const host = party('Pikachu', ['Thunderbolt']); host.echo = { ...emptyEchoUpgrades(), types: ['Water'], guard: true };
		const npc = begin(host); delete battle.fantasyRogue.cooperative;
		assert.equal(echoPowerMultiplier(npc, battle.dex.getActiveMove('watergun')), 1.1);
		battle.fantasyRogue.duel = { team: [], boosts: stats(0) };
		assert.equal(echoPowerMultiplier(npc, battle.dex.getActiveMove('watergun')), 1);
		assert.equal(echoPowerMultiplier(battle.p1.active[0], battle.dex.getActiveMove('watergun')), 1);
	});
	for (const [id, species, base, move] of [['roxie', 'Bulbasaur', 'Sludge Wave', 'roguecitypoison'],
		['marnie', 'Umbreon', 'Snarl', 'roguecitydark'], ['lacey', 'Azumarill', 'Play Rough', 'rogueflawless']]) {
		it(`lets the guest actually execute ${id}'s Z without spending the host or normal Z slot`, () => {
			const guest = party(species, [base]);
			guest.blessings.companions = [{ id, preferences: 0 }];
			guest.blessings.companionZ = { companion: id, member: guest.team[0].id };
			let mon = begin(undefined, guest);
			const pp = mon.moveSlots[0].pp;
			assert.equal(companionZRequest(mon).move, move);
			assert(!companionZRequest(battle.p1.active[0])); assert(!companionZRequest(battle.p4.active[0]));
			battle.makeChoices('move splash', 'move splash', 'roguecompanionz 1', 'move splash');
			assert.equal(mon.lastMove.id, move); assert.equal(mon.moveSlots[0].pp, pp - 1);
			assert(!battle.p3.zMoveUsed); assert(!battle.p1.zMoveUsed);
			assert(rogueBattleResult(battle).partnerCompanionZUsed); assert(!rogueBattleResult(battle).companionZUsed);
			assert(!companionZRequest(mon));
			mon = restore(); assert(!companionZRequest(mon));
			assert(!battle.choose('p3', 'roguecompanionz 1'));
		});
	}
	it('does not spend a sleeping guest Z and can execute it after waking', () => {
		const guest = party('Bulbasaur', ['Sludge Wave']);
		guest.blessings.companions = [{ id: 'roxie', preferences: 0 }];
		guest.blessings.companionZ = { companion: 'roxie', member: guest.team[0].id };
		const mon = begin(undefined, guest), pp = mon.moveSlots[0].pp;
		mon.setStatus('slp'); mon.statusState.time = 3;
		battle.makeChoices('move splash', 'move splash', 'roguecompanionz 1', 'move splash');
		assert(companionZRequest(mon)); assert.equal(mon.moveSlots[0].pp, pp);
		mon.cureStatus(); battle.makeChoices('move splash', 'move splash', 'roguecompanionz 1', 'move splash');
		assert.equal(mon.moveSlots[0].pp, pp - 1);
	});
	it('keeps spent guest grants disabled in a later battle', () => {
		const guest = party('Bulbasaur', ['Sludge Wave']);
		guest.blessings.companions = [{ id: 'roxie', preferences: 0 }];
		guest.blessings.companionZ = { companion: 'roxie', member: guest.team[0].id, spent: true };
		assert(!companionZRequest(begin(undefined, guest)));
	});
	it('returns consumed guest policies only in final personal snapshots and survives a checkpoint', () => {
		const guest = party('Aggron', ['Splash'], ['weakness']); guest.team[0].set.item = 'Weakness Policy';
		guest.bag.weaknesspolicy = 2;
		let mon = begin(undefined, guest);
		assert(mon.useItem());
		assert.equal(mon.item, '');
		assert.equal(rogueBattleResult(battle, false).partnerBag.weaknesspolicy, 2);
		assert.equal(rogueBattleResult(battle).partnerBag.weaknesspolicy, 3);
		assert.equal(rogueBattleResult(battle).bag.weaknesspolicy, undefined);
		mon = restore(); assert.equal(mon.item, '');
		assert.equal(rogueBattleResult(battle).partnerBag.weaknesspolicy, 3);
		assert.equal(rogueBattleResult(battle).partnerBag.weaknesspolicy, 3);
		assert.equal(battle.fantasyRogue.partnerBag.weaknesspolicy, 2);
	});
	it('keeps host and guest policy counts separate', () => {
		const host = party('Aggron', ['Splash'], ['weakness']), guest = party('Aggron', ['Splash'], ['weakness']);
		for (const p of [host, guest]) p.team[0].set.item = 'Weakness Policy';
		const mon = begin(host, guest); assert(mon.useItem());
		assert(battle.p1.active[0].useItem());
		assert.equal(rogueBattleResult(battle).bag.weaknesspolicy, 1);
		assert.equal(rogueBattleResult(battle).partnerBag.weaknesspolicy, 1);
	});
	it('does not refund unowned, removed, enemy or renewable policies to the guest', () => {
		const guest = party('Aggron', ['Splash'], ['weakness', 'renewable']); guest.team[0].set.item = 'Weakness Policy';
		const mon = begin(undefined, guest); assert(mon.useItem()); assert.equal(mon.item, 'weaknesspolicy');
		assert.equal(rogueBattleResult(battle).partnerBag.weaknesspolicy, undefined);
		mon.takeItem(battle.p4.active[0]);
		battle.p4.active[0].setItem('weaknesspolicy'); battle.p4.active[0].useItem();
		assert.equal(rogueBattleResult(battle).partnerBag.weaknesspolicy, undefined);
	});
	it('records the guest move requirement across turns and checkpoints without copying host progress', () => {
		begin(undefined, party('Primeape', ['Rage Fist']));
		battle.makeChoices('move splash', 'move splash', 'move ragefist 1', 'move splash');
		assert.equal(rogueBattleResult(battle).partnerTeam[0].evolutionProgress.moves.ragefist, 1);
		assert(!rogueBattleResult(battle).team[0].evolutionProgress?.moves?.ragefist);
		restore(); battle.makeChoices('move splash', 'move splash', 'move ragefist 1', 'move splash');
		assert.equal(rogueBattleResult(battle).partnerTeam[0].evolutionProgress.moves.ragefist, 2);
		assert.equal(rogueBattleResult(battle).partnerTeam[0].evolutionProgress.moves.ragefist, 2);
	});
	it('counts guest critical hits against enemies but not allies', () => {
		const mon = begin(undefined, party('Urshifu', ['Wicked Blow']));
		battle.makeChoices('move splash', 'move splash', 'move wickedblow 1', 'move splash');
		assert.equal(rogueBattleResult(battle).partnerTeam[0].evolutionProgress.criticals, 1);
		const ally = battle.p1.active[0], move = battle.dex.getActiveMove('wickedblow');
		ally.getMoveHitData(move).crit = true;
		require('../../dist/sim/rogue-evolution-progress').recordEvolutionHit(1, ally, mon, move);
		assert.equal(rogueBattleResult(battle).partnerTeam[0].evolutionProgress.criticals, 1);
		assert(!battle.p4.active[0].m.rogueEvolution);
	});
	it('counts guest recoil and resets damage requirements after fainting even when revived', () => {
		const guest = party('Basculin', ['Splash']); guest.team[0].evolutionProgress = { recoil: 250, lostHP: 60 };
		const mon = begin(undefined, guest), original = battle.fantasyRogue.partner.team[0];
		battle.damage(10, mon, mon, battle.dex.conditions.get('recoil'));
		let saved = snapshotRoguePokemon(mon, original);
		assert.equal(saved.evolutionProgress.recoil, 260); assert.equal(saved.evolutionProgress.lostHP, 70);
		mon.faint(); battle.faintMessages();
		mon.fainted = false; mon.hp = 20;
		saved = snapshotRoguePokemon(mon, original);
		assert.equal(saved.evolutionProgress.recoil, 0); assert.equal(saved.evolutionProgress.lostHP, 0);
	});
	it('uses only the guest bond for endure, accuracy and native residual curing', () => {
		const guest = party('Primeape', ['Splash']); guest.team[0].bond = 100;
		const mon = begin(undefined, guest), host = battle.p1.active[0], enemy = battle.p4.active[0];
		assert.equal(battleAffection(mon), 100); assert.equal(battleAffection(host), 0); assert.equal(battleAffection(enemy), 0);
		assert.equal(affectionAccuracy(100, mon, enemy), 90); assert.equal(affectionAccuracy(100, mon, host), 100);
		battle.randomChance = () => true;
		assert.equal(affectionEndure(mon.hp, mon, enemy, battle.dex.moves.get('tackle')), mon.hp - 1);
		assert.equal(affectionEndure(mon.hp, mon, host, battle.dex.moves.get('tackle')), undefined);
		mon.setStatus('brn'); host.setStatus('brn'); affectionResidual(battle);
		assert.equal(mon.status, ''); assert.equal(host.status, 'brn');
		assert.equal(battleAffection(restore()), 100);
	});
	it('does not count enemy or NPC actions as the guest evolution progress', () => {
		const mon = begin(), move = battle.dex.getActiveMove('ragefist');
		const { recordEvolutionMove, recordEvolutionDamage } = require('../../dist/sim/rogue-evolution-progress');
		for (const enemy of [battle.p2.active[0], battle.p4.active[0]]) {
			recordEvolutionMove(enemy, move); recordEvolutionDamage(10, enemy, move);
			assert(!enemy.m.rogueEvolution);
		}
		delete battle.fantasyRogue.cooperative;
		recordEvolutionMove(mon, move); recordEvolutionDamage(10, mon, move);
		assert(!mon.m.rogueEvolution);
	});
	it('activates the guest strongest Hydreigon and changes its type through an actual move', () => {
		const mon = begin(undefined, party('Hydreigon', ['Flamethrower'], ['ghidorah']));
		assert.deepEqual(mon.getTypes(), ['???', 'Dragon']);
		assert(mon.volatiles.rogueghidorah); assert(!battle.p1.active[0].volatiles.rogueghidorah);
		battle.makeChoices('move splash', 'move splash', 'move flamethrower 1', 'move splash');
		assert.deepEqual(mon.getTypes(), ['Fire', 'Dragon']);
		assert.deepEqual(restore().getTypes(), ['Fire', 'Dragon']);
	});
	it('makes the guest Spinda confuse both opponents without confusing its human partner', () => {
		begin(undefined, party('Spinda', ['Splash'], ['spindance']));
		for (const foe of [battle.p2.active[0], battle.p4.active[0]]) {
			assert(foe.volatiles.confusion); assert.equal(foe.boosts.accuracy, -1);
		}
		assert(!battle.p1.active[0].volatiles.confusion);
	});
	it('uses the guest railgun and rulebreaker grants without borrowing host grants', () => {
		const guest = party('Magnezone', ['Zap Cannon'], ['railgun', 'rulebreaker']);
		guest.team[0].set.ability = 'Mold Breaker';
		const mon = begin(undefined, guest);
		const { railgunActive, rulebreakerActive } = require('../../dist/sim/rogue-special-blessings');
		const { roguePowerModifiers } = require('../../dist/sim/fantasy-rogue-blessings');
		assert(railgunActive(mon)); assert(rulebreakerActive(mon));
		assert(roguePowerModifiers(mon, battle.dex.getActiveMove('zapcannon')).some(b => b.factor === 2));
		for (const other of [battle.p1.active[0], battle.p2.active[0], battle.p4.active[0]]) {
			assert(!railgunActive(other)); assert(!rulebreakerActive(other));
		}
	});
	it('awards a guest critical shooting KO to its own sniper training and checkpoint', () => {
		const guest = party('Inteleon', ['Snipe Shot'], ['veteransniper']);
		guest.team[0].set.ability = 'Sniper'; guest.team[0].sniperKOs = 14;
		let mon = begin(undefined, guest);
		const { veteranSniper, sniperTrainingProgress } = require('../../dist/sim/rogue-sniper');
		assert.equal(veteranSniper(mon).id, guest.team[0].id); assert.equal(sniperTrainingProgress(mon), 14);
		battle.randomChance = () => true;
		battle.p2.active[0].hp = 1; battle.p4.active[0].hp = 1;
		battle.makeChoices('move splash', 'move splash', 'move snipeshot 1', 'move splash');
		assert.equal(sniperTrainingProgress(mon), 15);
		assert.equal(rogueBattleResult(battle).partnerBlessingProgress.kos.filter(ko => ko.sniper).length, 1);
		assert.equal(rogueBattleResult(battle).blessingProgress.kos.length, 0);
		mon = restore(); assert.equal(sniperTrainingProgress(mon), 15);
	});
	for (const [id, stat, attack, key] of [['bignumber', 'atk', 3000, 'numberUpgrade'],
		['supernumber', 'all', 3000, 'numberPrize']]) {
		it(`records the guest ${id} threshold in the guest result only`, () => {
			const mon = begin(undefined, party('Mew', ['Splash'], [id]));
			mon.storedStats.atk = attack;
			battle.makeChoices('move splash', 'move splash', `roguenumber ${stat} move splash`, 'move splash');
			assert(rogueBattleResult(battle).partnerBlessingProgress[key]);
			assert(!rogueBattleResult(battle).blessingProgress[key]);
			assert(battle.fantasyRogue.numberUses.p3); assert(!battle.fantasyRogue.numberUses.p1);
			restore(); assert(rogueBattleResult(battle).partnerBlessingProgress[key]);
		});
	}
});
