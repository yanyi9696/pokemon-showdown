'use strict';
// Source-based budget scenarios, not a substitute for real player playthroughs.
// Read-only: no accounts, databases or live battles are opened.
const {createPreviewContent} = require('../dist/server/fantasy-rogue/preview-content');
const {routeCandyReward, eliteTreasureBudget, encounterCoins, emergencyCost, eventRewardBudget} = require('../dist/server/fantasy-rogue/early-balance');
const {expectedWildLoot} = require('../dist/server/fantasy-rogue/events');
const {centerCare} = require('../dist/server/fantasy-rogue/economy');
const content = createPreviewContent();
const item = id => content.items.find(i => i.id === id);
const xp = goods => Object.entries(goods).reduce((sum, [id, n]) => sum + item(id).amount * n, 0);
const curves = [1, 5, 10, 15, 20, 25, 30, 40, 50, 80, 120, 160, 200].map(floor => ({
	floor, eliteCandyEXP: xp(routeCandyReward(floor, 'elite')), encounterCandyEXP: xp(routeCandyReward(floor, 'trainer')),
	rewardCandyEXP: xp(routeCandyReward(floor, 'reward')), eliteGuaranteedTreasure: eliteTreasureBudget(floor),
	eliteAverageTreasure: Math.round(eliteTreasureBudget(floor) + expectedWildLoot(floor)),
	encounterCoins: encounterCoins(floor), eventBaseBudget: Math.round(eventRewardBudget(floor) / 50) * 50,
}));
const scenarios = [1, 11, 21].map(first => {
	const floor = first + 8, encounterFloor = first + 6;
	const care = centerCare({floor, team: [{hp: 19, maxhp: 20, pp: [], status: ''}]}).cost;
	// Eight ordinary floors: four wild routes, one elite, one encounter, one event, one reward.
	const wild = [0, 2, 5, 7].reduce((sum, offset) => sum + expectedWildLoot(first + offset) * 3, 0);
	const elite = eliteTreasureBudget(first + 3) + expectedWildLoot(first + 3);
	const bossNode = content.floors[first + 9][0];
	const trainerBoss = bossNode.encounters.some(e => e.trainer || e.trainerCandidates?.length);
	const boss = trainerBoss ? bossNode.reward.money : expectedWildLoot(first + 9) * bossNode.encounters.length;
	const supplies = 100 + (first + 4) * 8;
	const income = wild + elite + encounterCoins(encounterFloor) + supplies + boss;
	const upkeep = care + item('potion').price + item('ether').price;
	const wipe = emergencyCost(encounterFloor), penalty = 500 + encounterFloor * 20;
	return {floors: `${first}–${first + 9}`, expectedCashAndSaleValue: Math.round(income),
		cleanWinsNet: Math.round(income - upkeep),
		oneExtraRevivePurchaseNet: Math.round(income - upkeep - item('revive').price),
		lostEncounterThenWonNet: Math.round(income - penalty - wipe - upkeep),
		twoLossesThenWonNet: Math.round(income - penalty - wipe - emergencyCost(first + 2) - upkeep),
		care, emergency: wipe, extraRevive: item('revive').price};
});
console.log(JSON.stringify({method: 'Budget scenarios from production reward functions; not live difficulty measurements',
	assumptions: ['No tower spirit or economy blessing; no starting cash included',
		'All treasure is eventually sold; jackpot variation is represented by its expectation',
		'Event net coins assumed zero because choices include costs, non-cash rewards and losses',
		'Ordinary upkeep: one center visit, one bought potion and one bought Ether per ten floors',
		'Gifted balls and boss revive are not sold or valued as cash; extra training/TMs/equipment are discretionary',
		'Lost attempts pay the applicable penalty and emergency, then win on retry; victory income is paid only once'],
	curves, scenarios}, null, 2));
