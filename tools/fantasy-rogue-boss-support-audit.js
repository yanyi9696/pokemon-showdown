'use strict';
// Controlled native-battle measurements, not a player difficulty score or a campaign clear.
const fs = require('fs');
const {Battle} = require('../dist/sim');
const {createRoguePokemon} = require('../dist/server/fantasy-rogue/progression');
const {routeCandyReward, CANDY_SHOP, restCandyOffer, mentorCardAtFloor, mentorTier} = require('../dist/server/fantasy-rogue/early-balance');
const stats = n => ({hp: n, atk: n, def: n, spa: n, spd: n, spe: n});
const set = level => ({species: 'Mew', ability: 'No Ability', level, moves: ['Tackle'], nature: 'Hardy', item: '', evs: stats(0), ivs: stats(31)});
function measure(kind, floor) {
	const mon = createRoguePokemon(set(50), stats(0));
	const battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
		fantasyRogue: {encounterId: 'audit', team: [mon], boosts: stats(0), bag: {}, balls: [], catchable: false,
			mentorCard: kind, mentorTier: mentorTier(floor)}, p1: {team: [mon.set]}, p2: {team: [set(60)]}});
	try {
		battle.makeChoices('team 1', 'team 1'); battle.randomizer = n => n;
		const own = battle.p1.active[0], foe = battle.p2.active[0];
		const dealt = battle.damage(battle.actions.getDamage(own, foe, 'tackle'), foe, own, battle.dex.getActiveMove('tackle'));
		const taken = battle.damage(battle.actions.getDamage(foe, own, 'tackle'), own, foe, battle.dex.getActiveMove('tackle'));
		return {dealt, taken, defense: own.getStat('def'), speed: own.getStat('spe')};
	} finally {battle.destroy();}
}
const report = {method: 'Native engine, level 50 player versus level 60 opponent; same neutral spread and move; no blessings, items or permanent training. No campaign-clear claim.',
	candyUnlocks: CANDY_SHOP, rewards: [], restShops: [], bossCards: []};
for (const floor of [9, 10, 19, 20, 29, 30, 39, 40, 49, 50, 69, 99, 100, 149, 150, 199, 200]) {
	report.rewards.push({floor, oldEliteEXP: Math.round((200 + 3 * floor ** 2) / 100) * 100,
		elite: routeCandyReward(floor, 'elite'), encounter: routeCandyReward(floor, 'trainer'), reward: routeCandyReward(floor, 'reward')});
	if (floor % 10 === 9) report.restShops.push({floor, ...restCandyOffer(floor)});
}
for (const floor of [10, 20]) {
	const baseline = measure(undefined, floor);
	for (const kind of ['attack', 'guard', 'balanced']) {
		const result = measure(kind, floor);
		report.bossCards.push({tier: mentorTier(floor), kind, ...mentorCardAtFloor(kind, floor), baseline, actual: result,
			damageMultiplier: result.dealt / baseline.dealt, incomingMultiplier: result.taken / baseline.taken});
	}
}
const root = 'docs/playtests/2026-10-17/boss-support'; fs.mkdirSync(root, {recursive: true});
fs.writeFileSync(`${root}/audit.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({bossCards: report.bossCards, sampleRewards: report.rewards.filter(r => [20, 30, 40, 50].includes(r.floor))}, null, 2));
