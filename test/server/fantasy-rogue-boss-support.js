'use strict';
const assert = require('assert').strict;
const {Battle} = require('../../dist/sim');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {syncGrowthParty} = require('../../dist/server/fantasy-rogue/growth');
const {mentorTier, mentorCardAtFloor, routeCandyReward, CANDY_SHOP, restCandyOffer} = require('../../dist/server/fantasy-rogue/early-balance');
const {blessingAfterAction} = require('../../dist/sim/fantasy-rogue-blessings');
const {settleAdventure} = require('../../dist/server/fantasy-rogue/event-adventures');
const {set, stats} = require('../fixtures/fantasy-rogue');

function fight(kind, floor = 20, growth = true) {
	const mon = createRoguePokemon(set('Mew', 'No Ability', 60, ['Tackle']), stats(0));
	const run = {team: [mon], boosts: stats(0), growth: growth ? {offense: 800, defense: 400, experience: 0} : {}};
	syncGrowthParty(run);
	const battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
		fantasyRogue: {encounterId: 'support', team: [mon], boosts: stats(0), bag: {}, balls: [], catchable: false,
			mentorCard: kind, mentorTier: mentorTier(floor)},
		p1: {team: [mon.set]}, p2: {team: [set('Mew', 'No Ability', 60, ['Tackle'])]}});
	battle.makeChoices('team 1', 'team 1'); battle.randomizer = n => n;
	return battle;
}

describe('Fantasy Rogue boss support revision', () => {
	for (const [floor, tier] of [[10, 'elite'], [30, 'elite'], [150, 'elite'], [20, 'gym'], [160, 'gym'], [175, 'gym'], [200, 'gym']]) {
		it(`uses the ${tier} card tier at floor ${floor}`, () => assert.equal(mentorTier(floor), tier));
	}
	for (const [kind, offense, defense, speed] of [['attack', 1.8, 1.4, 1], ['guard', 1.4, 1.9, 1], ['balanced', 1.6, 1.6, 1.3]]) {
		for (const floor of [10, 20, 30, 175]) it(`combines ${kind} support at floor ${floor} with training and exposes gym-strength values privately`, () => {
			assert.deepEqual(mentorCardAtFloor(kind, floor), mentorCardAtFloor(kind, 20));
			const battle = fight(kind, floor), baseline = fight(undefined, floor), untrained = fight(undefined, floor, false);
			try {
				const own = battle.p1.active[0], foe = battle.p2.active[0], base = baseline.p1.active[0];
				assert.equal(own.storedStats.atk, Math.floor(untrained.p1.active[0].storedStats.atk * 1.08));
				assert.equal(own.getStat('def'), battle.modify(base.getStat('def'), defense));
				assert.equal(own.getStat('spe'), battle.modify(base.getStat('spe'), speed));
				const damage = battle.damage(battle.actions.getDamage(own, foe, 'tackle'), foe, own, battle.dex.getActiveMove('tackle'));
				const normal = baseline.damage(baseline.actions.getDamage(base, baseline.p2.active[0], 'tackle'), baseline.p2.active[0], base, baseline.dex.getActiveMove('tackle'));
				assert(Math.abs(damage / normal - offense) < .04);
				const info = own.getSwitchRequestData().rogueAbilityInfo;
				assert.equal(info.training.atk, .08); assert.equal(info.training.def, .04);
				assert.equal(info.mentor.damage, Math.round((offense - 1) * 100));
				assert.equal(info.mentor.text, mentorCardAtFloor(kind, 20).text);
				battle.sendUpdates(); const index = battle.log.findIndex(l => l.startsWith('|-rogueinfo|'));
				assert.equal(battle.log[index - 1], '|split|p1'); assert.equal(battle.log[index + 1], '');
				assert(!foe.getSwitchRequestData().rogueAbilityInfo);
			} finally {battle.destroy(); baseline.destroy(); untrained.destroy();}
		});
	}
	it('keeps candy budgets within the approved late-support bands and grade unlocks', () => {
		const xp = {expcandyxs: 100, expcandys: 800, expcandym: 3000, expcandyl: 10000, expcandyxl: 30000};
		assert.deepEqual(Object.values(CANDY_SHOP).map(x => x.floor), [1, 30, 50, 100, 150]);
		for (let floor = 1; floor <= 200; floor++) {
			const reward = routeCandyReward(floor, 'elite');
			const total = Object.entries(reward).reduce((n, [id, count]) => n + count * xp[id], 0);
			// The October 22 support raises late budgets, not the available candy grades.
			const support = floor <= 80 ? 1 : floor <= 100 ? 1.15 : floor <= 140 ? 1.25 : 1.35;
			assert(total <= Math.round((200 + 3 * floor ** 2) * (floor <= 50 ? 1 : 1.6) * support / 100) * 100);
			for (const id of Object.keys(reward)) assert(CANDY_SHOP[id].floor <= floor);
			assert(CANDY_SHOP[restCandyOffer(floor).id].floor <= floor);
			if (floor >= 30) assert((reward.expcandyxs || 0) < 8);
		}
	});
	it('pays fishing elite bonus only on success and at most once', () => {
		for (const won of [false, true]) {
			const run = {floor: 40, money: 1000, node: {event: {id: 'fishing', stage: 'battle'}}};
			settleAdventure(run, {}, () => 0, won);
			assert.equal(run.money > 1000, won);
			const before = structuredClone(run); settleAdventure(run, {}, () => 0, won); assert.deepEqual(run, before);
		}
	});
	it('uses 5% per complete 100 HP, requiring actual damage and strict threshold comparison', () => {
		for (const [hp, remaining, hit, faint] of [[199, 49, true, true], [199, 50, true, false], [200, 99, true, true], [200, 99, false, false], [2000, 999, true, true]]) {
			const battle = fight();
			try {
				const own = battle.p1.active[0], foe = battle.p2.active[0];
				battle.fantasyRogue.blessings = {owned: [{family: 'execute', tier: 'prismatic', id: 'execute', floor: 1}]};
				own.maxhp = hp; foe.maxhp = 1000; foe.hp = remaining;
				const move = battle.dex.getActiveMove('tackle');
				if (hit) move.rogueHitTargets = [foe.set.fantasyRogueId || foe.getSlot()];
				blessingAfterAction(battle, own, move);
				assert.equal(!!foe.faintQueued, faint);
			} finally {battle.destroy();}
		}
	});
});
