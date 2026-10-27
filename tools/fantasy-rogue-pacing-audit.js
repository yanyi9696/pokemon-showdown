'use strict';
/** Resource-only fixed-route simulation. No battles/saves/network, no claim of win-rate prediction. */
const path = require('path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const withAI = process.argv.includes('--ai');
const load = file => require(path.join(root, 'dist', file));
const { createPreviewContent } = load('server/fantasy-rogue/preview-content');
const { createBiomeRoutes } = load('server/fantasy-rogue/biome-routes');
const { fixedFloor } = load('server/fantasy-rogue/content');
const balance = load('server/fantasy-rogue/early-balance');
const { prepareEconomy, TREASURES } = load('server/fantasy-rogue/economy');
const rewards = load('server/fantasy-rogue/reward-scenes');
const late = load('server/fantasy-rogue/late-support');
const { experienceAtLevel, levelAtExperience, rogueSpeciesData } = load('sim/fantasy-rogue-rules');
const { blessingLevelCost } = load('sim/rogue-blessing-data');
const { companionExperience } = load('server/fantasy-rogue/companions');
const content = createPreviewContent();
const candies = Object.fromEntries(content.items.filter(i => i.kind === 'candy').map(i => [i.id, i.amount]));
const price = Object.fromEntries(TREASURES.map(i => [i.id, i.sellPrice]));
const checkpoints = [20, 30, 40, 50, 60, 80, 100, 160, 180, 200];
function model(seed, size, feed) {
	let rng = seed;
	const random = max => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return Math.floor(rng / 4294967296 * max); };
	const team = [], snapshots = {}; let money = content.initialMoney, lastReward, catchupCheckpoint = 0;
	const level = p => levelAtExperience(p.growth, p.experience);
	const give = items => {
		for (const [id, n] of Object.entries(items || {})) {
			if (candies[id]) for (let i = 0; i < n; i++) {
				const sorted = team.slice().sort((a, b) => level(a) - level(b) || a.experience - b.experience);
				sorted[feed === 'strongest' ? sorted.length - 1 : 0].experience += candies[id];
			} else money += (price[id] || 0) * n;
		}
	};
	for (let floor = 1; floor <= 200; floor++) {
		if (team.length < size && (floor === 1 || floor === 3 || floor === 6 || floor === 12 || floor === 18 || floor === 24)) {
			const species = ['Fuecoco', 'Froakie', 'Nacli', 'Rookidee', 'Shinx', 'Houndour'][team.length], growth = rogueSpeciesData(species).growth;
			team.push({ id: String(team.length), set: { species, level: Math.max(5, Math.ceil(floor / 2)) }, growth, experience: experienceAtLevel(growth, Math.max(5, Math.ceil(floor / 2))) });
		}
		if (floor === 1)give(content.initialBag);
		if (fixedFloor(floor) !== 'rest') {
			const kind = fixedFloor(floor) === 'boss' ? 'boss' : ({ 1: 'wild', 2: 'wild', 3: 'event', 4: 'wild', 5: 'elite', 6: 'wild', 7: 'trainer', 8: 'reward' })[floor % 10] || 'wild';
			const template = (content.routePools[floor] || content.floors[floor]).find(n => n.kind === kind) || content.floors[floor][0];
			const node = createBiomeRoutes(floor, [template], undefined, random)[0];
			prepareEconomy(node, floor, random);
			for (const encounter of node.encounters) {
				const foes = encounter.trainerCandidates ? encounter.trainerCandidates[random(encounter.trainerCandidates.length)].team : encounter.candidates ? [encounter.candidates[random(encounter.candidates.length)]] : encounter.team;
				for (const foe of foes) {
					const cost = [1, 50, 100, 150].filter(f => f <= floor).reduce((n, f) => n + blessingLevelCost(withAI && f === 1 ? 'gold' : 'silver', f, kind === 'boss'), 0);
					const carry = feed === 'strongest' ? team.reduce((a, b) => level(a) >= level(b) ? a : b) : team[random(team.length)];
					for (const p of team) {
						const boost = withAI ? companionExperience({ blessings: { companions: [{ id: 'sada' }] } }, p, { species: foe.species }) : 1;
						p.experience += Math.floor(balance.towerExperience(rogueSpeciesData(foe.species).baseExperience, foe.level + cost, level(p), p === carry, floor, kind === 'wild') * boost);
					}
				}
			}
			if (kind === 'reward') {
				const run = { floor, team: team.map(p => ({ ...p, set: { ...p.set, level: level(p) } })), node, catchupCheckpoint, rewardHistory: lastReward ? [lastReward] : [] };
				rewards.prepareRewardScene(run, random); lastReward = node.rewardScene.id;
				if (lastReward === 'catchup') {
					const plan = late.catchupPlan ? late.catchupPlan(run) : run.team.sort((a, b) => a.set.level - b.set.level).slice(0, 2).map(p => ({ member: p.id, level: Math.min(100, p.set.level + late.catchupLevels(floor)) }));
					for (const entry of plan) { const p = team.find(p => p.id === entry.member); p.experience = Math.max(p.experience, experienceAtLevel(p.growth, entry.level)); }
					if (node.rewardScene.catchupCheckpoint)catchupCheckpoint = node.rewardScene.catchupCheckpoint;
				} else if (!['breederegg', 'pprest'].includes(lastReward))give(rewards.rewardCandies(floor, rewards.rewardExperience(floor)));
			} else { give(node.reward.items); for (const items of node.wildLoot || [])give(items); money += node.reward.money; }
			if (kind === 'event')money += balance.eventRewardBudget(floor); // successful modest cash event; no paid candy or rare EXP jackpots
		}
		if (checkpoints.includes(floor))snapshots[floor] = { levels: team.map(level), money: Math.round(money) };
	}
	return snapshots;
}
const results = { assumptions: 'All wins; regular route: four wild, one elite, one trainer, one event, one reward per ten floors; fixed bosses/rest override. One silver blessing per round (AI comparison replaces the opening blessing with gold Paradise). No other EXP blessings, candy purchases, paid training, shinies or deaths. Basic event cash only. This models resource supply, not combat success.', withAI, seeds: 40, scenarios: {} };
for (const size of [3, 6]) for (const feed of ['weakest', 'strongest']) {
	const runs = Array.from({ length: results.seeds }, (_, i) => model(i + 1, size, feed)), summary = {};
	for (const floor of checkpoints) { const mean = f => +(runs.reduce((sum, r) => sum + f(r[floor]), 0) / runs.length).toFixed(1); summary[floor] = { mean: mean(s => s.levels.reduce((a, b) => a + b, 0) / s.levels.length), highest: mean(s => Math.max(...s.levels)), lowest: mean(s => Math.min(...s.levels)), grossCoins: mean(s => s.money) }; }
	results.scenarios[size + '-' + feed] = summary;
}
console.log(JSON.stringify(results, null, 2));
