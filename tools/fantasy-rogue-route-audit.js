'use strict';
// Reproducible, read-only route and EXP sensitivity audit. No account or battle database access.
const {PRNG} = require('../dist/sim/prng');
const {createPreviewContent} = require('../dist/server/fantasy-rogue/preview-content');
const {createBiomeRoutes} = require('../dist/server/fantasy-rogue/biome-routes');
const {rollRoutes, RED_ROUTES, ROUTE_STAGES} = require('../dist/server/fantasy-rogue/routes');
const {fixedFloor} = require('../dist/server/fantasy-rogue/content');
const {prepareEconomy, TREASURES, centerCare} = require('../dist/server/fantasy-rogue/economy');
const {towerExperience, CANDY_SHOP, eventRewardBudget} = require('../dist/server/fantasy-rogue/early-balance');
const {prepareTrade, tradeKind} = require('../dist/server/fantasy-rogue/trading');
const {rogueSpeciesData, experienceAtLevel, levelAtExperience} = require('../dist/sim/fantasy-rogue-rules');
const {blessingLevelCost, blessingCoins} = require('../dist/sim/rogue-blessing-data');
const content = createPreviewContent();
const kinds = ['wild', 'elite', 'trainer', 'event', 'reward', 'trade'];
const simplePool = kinds.map(kind => ({id: kind, kind, name: kind, encounters: [], reward: {money: 0, items: {}}}));
const candyEXP = Object.fromEntries(content.items.filter(i => i.kind === 'candy').map(i => [i.id, i.amount]));
const rngFor = seed => { const rng = new PRNG([17, 10, 2026, seed]); return max => rng.random(max); };
const median = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const round = v => Math.round(v * 10) / 10;
const percentile = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
const checkpointFloors = [10, 20, 30, 40, 50, 80, 100, 150, 190, 200];
const prices = Object.fromEntries(content.items.map(item => [item.id, item.price]));
const treasurePrices = Object.fromEntries(TREASURES.map(item => [item.id, item.sellPrice]));

// Baseline immediately before this revision: event weight was already reduced to 22.
function oldRoutes(run, pool, random) {
	const weights = {wild: 26, elite: 20, trainer: 16, event: 22, reward: 20,
		trade: ROUTE_STAGES[Math.min(4, Math.floor((run.floor - 1) / 40))]};
	const pick = choices => {
		let draw = random(choices.reduce((sum, n) => sum + weights[n.kind], 0));
		return choices.find(n => (draw -= weights[n.kind]) < 0);
	};
	const selected = [pick(pool.filter(n => RED_ROUTES.includes(n.kind))), pick(pool.filter(n => !RED_ROUTES.includes(n.kind)))];
	const repeat = random(100) < 15;
	selected.push(pick(pool.filter(n => !selected.some(s => n.kind === s.kind) || repeat && ['wild', 'event'].includes(n.kind))));
	return selected.map(node => {
		const copy = structuredClone(node);
		if (copy.trade) copy.trade.kind = tradeKind(run.floor, random);
		return copy;
	});
}

function routeDistribution(revised, samples = 2000) {
	const stages = Array.from({length: 5}, (_, i) => ({floors: `${i * 40 + 1}-${(i + 1) * 40}`, rooms: 0,
		offers: Object.fromEntries(kinds.map(k => [k, 0])), following: Object.fromEntries(kinds.map(k => [k, [0, 0]]))}));
	const firstTrades = [], eliteCounts = [], earlyElites = [], firstPity = [];
	for (let seed = 1; seed <= samples; seed++) {
		const random = rngFor(seed), run = {floor: 1}; let previous = [], firstTrade = 0, elites = 0, early = 0;
		for (let floor = 1; floor <= 200; floor++) {
			if (fixedFloor(floor)) { previous = []; continue; }
			run.floor = floor;
			const choices = (revised ? rollRoutes : oldRoutes)(run, simplePool, random).map(n => n.kind);
			const stage = stages[Math.floor((floor - 1) / 40)]; stage.rooms++;
			for (const kind of kinds) {
				stage.offers[kind] += choices.includes(kind) ? 1 : 0;
				if (previous.includes(kind)) {stage.following[kind][1]++; if (choices.includes(kind)) stage.following[kind][0]++;}
			}
			if (choices.includes('trade') && !firstTrade) firstTrade = floor;
			if (choices.includes('elite')) { elites++; if (floor < 40) early++; }
			previous = choices;
		}
		firstTrades.push(firstTrade || 201); eliteCounts.push(elites); earlyElites.push(early); firstPity.push(firstTrade === 18);
	}
	return {samples, stages: stages.map(s => ({floors: s.floors,
		// A room offers three cards; these are probabilities of at least one card, not slot shares.
		offerPercent: Object.fromEntries(kinds.map(k => [k, round(100 * s.offers[k] / s.rooms)])),
		nextConsecutiveFloorPercent: Object.fromEntries(kinds.map(k => [k, round(100 * s.following[k][0] / s.following[k][1])]))})),
		firstTrade: {medianFloor: median(firstTrades), latestFloor: Math.max(...firstTrades),
			missingBy18Percent: round(100 * firstTrades.filter(n => n > 18).length / samples),
			firstAt18Percent: round(100 * firstPity.filter(Boolean).length / samples)},
		meanEliteOffers: round(eliteCounts.reduce((a, b) => a + b, 0) / samples),
		meanEliteOffersBefore40: round(earlyElites.reduce((a, b) => a + b, 0) / samples)};
}

function trajectory(seed, revised, tier, style) {
	const routeRandom = rngFor(seed), contentRandom = rngFor(seed + 10000), run = {floor: 1};
	const species = ['Mudkip', 'Rookidee', 'Shinx', 'Houndour', 'Oddish', 'Wooper'], joins = [1, 3, 6, 12, 18, 24];
	const team = [], snapshots = {};
	const level = mon => levelAtExperience(mon.growth, mon.exp);
	const grantCandy = items => {
		for (const [id, count] of Object.entries(items)) {
			if (!candyEXP[id]) continue;
			for (let i = 0; i < count; i++) {
				const weakest = team.slice().sort((a, b) => level(a) - level(b) || a.exp - b.exp)[0];
				weakest.exp += candyEXP[id];
			}
		}
	};
	for (let floor = 1; floor <= 200; floor++) {
		run.floor = floor;
		if (joins.includes(floor)) {
			const name = species[joins.indexOf(floor)], growth = rogueSpeciesData(name).growth;
			team.push({name, growth, exp: experienceAtLevel(growth, floor === 1 ? 5 : Math.max(3, Math.ceil(floor / 2)))});
		}
		if (floor === 1) grantCandy(content.initialBag);
		if (fixedFloor(floor) === 'rest') continue;
		let node;
		if (fixedFloor(floor) === 'boss') {
			node = structuredClone(content.floors[floor][0]);
			for (const encounter of node.encounters) {
				if (encounter.candidates) encounter.team = [encounter.candidates[contentRandom(encounter.candidates.length)]];
				if (encounter.trainerCandidates) encounter.team = encounter.trainerCandidates[contentRandom(encounter.trainerCandidates.length)].team;
			}
		} else {
			const offered = (revised ? rollRoutes : oldRoutes)(run, content.routePools[floor], routeRandom);
			// Sustainable route preference versus perfect-success high-reward preference.
			const priority = style === 'steady' ? ['wild', 'event', 'reward', 'trade', 'elite', 'trainer'] :
				['elite', 'trainer', 'wild', 'event', 'reward', 'trade'];
			const picked = priority.map(k => offered.find(n => n.kind === k)).find(Boolean);
			node = createBiomeRoutes(floor, [picked], undefined, contentRandom)[0];
		}
		prepareEconomy(node, floor, contentRandom);
		// Isolate opening tier. Later rounds use silver and add no further tax or battle/EXP bonuses.
		const tax = blessingLevelCost(tier, 1, node.kind === 'boss');
		if (fixedFloor(floor) === 'boss') snapshots[floor] = {
			partyMean: team.reduce((s, m) => s + level(m), 0) / team.length,
			carry: Math.max(...team.map(level)), weakest: Math.min(...team.map(level)),
			boss: Math.max(...node.encounters.flatMap(e => e.team.map(p => p.level))) + tax,
		};
		for (const encounter of node.encounters) for (const foe of encounter.team) {
			const base = rogueSpeciesData(foe.species).baseExperience, enemyLevel = foe.level + tax;
			const carry = team.reduce((a, b) => level(a) >= level(b) ? a : b);
			for (const mon of team) mon.exp += towerExperience(base, enemyLevel, level(mon), mon === carry, floor,
				revised && node.kind === 'wild');
		}
		grantCandy(node.reward.items);
		for (const loot of node.wildLoot || []) grantCandy(loot);
	}
	return snapshots;
}

/** Purchases use real offers, stock, prices and sale values. Never assumes a shop exists on demand. */
function purchaseTrajectory(seed, tier, style, feeding, options = {}) {
	const routeRandom = rngFor(seed), contentRandom = rngFor(seed + 10000), run = {floor: 1, team: []};
	const names = ['Mudkip', 'Rookidee', 'Shinx', 'Houndour', 'Oddish', 'Wooper'], joins = [1, 3, 6, 12, 18, 24];
	const team = [], snapshots = {}, bag = {...content.initialBag};
	let money = content.initialMoney + (options.economyFamily ? blessingCoins(options.economyFamily, 1) : 0);
	let treasure = 0, spent = 0, upkeep = 0, boughtEXP = 0, firstCandy = 0, visited = 0;
	const level = mon => levelAtExperience(mon.growth, mon.exp);
	const grantCandy = items => {
		for (const [id, count] of Object.entries(items)) {
			if (!candyEXP[id]) continue;
			for (let i = 0; i < count; i++) {
				const pool = feeding === 'core' ? team.slice(0, 2) : team;
				const target = pool.slice().sort((a, b) => level(a) - level(b) || a.exp - b.exp)[0];
				target.exp += candyEXP[id];
			}
		}
	};
	const receive = items => {
		grantCandy(items);
		for (const [id, count] of Object.entries(items)) {
			if (treasurePrices[id]) treasure += treasurePrices[id] * count;
			else if (!candyEXP[id]) bag[id] = (bag[id] || 0) + count;
		}
	};
	const sell = () => {money += treasure; treasure = 0;};
	for (let floor = 1; floor <= 200; floor++) {
		run.floor = floor;
		// Keep enough for two later center visits as their prices rise, rather than borrowing upkeep money.
		const reserve = Math.max(options.reserve ?? 1500,
			2 * (Math.ceil((150 + 5 * floor) / 50) * 50 + prices.potion + prices.ether));
		if (joins.includes(floor)) {
			const name = names[joins.indexOf(floor)], growth = rogueSpeciesData(name).growth;
			team.push({name, growth, exp: experienceAtLevel(growth, floor === 1 ? 5 : Math.max(3, Math.ceil(floor / 2)))});
		}
		if (floor === 1) grantCandy(content.initialBag);
		if (fixedFloor(floor) === 'rest') {
			sell();
			// Transparent clean-win upkeep scenario: one center visit plus one potion and Ether per fixed rest.
			let bill = centerCare({floor, team: [{hp: 19, maxhp: 20, pp: [], status: ''}]}).cost;
			for (const id of ['potion', 'ether']) {
				if (bag[id] > 0) bag[id]--; else bill += prices[id];
			}
			if (money < bill) throw Error(`Upkeep assumption unaffordable at floor ${floor}`);
			money -= bill; upkeep += bill;
			continue;
		}
		let node;
		if (fixedFloor(floor) === 'boss') {
			node = structuredClone(content.floors[floor][0]);
			for (const encounter of node.encounters) {
				if (encounter.candidates) encounter.team = [encounter.candidates[contentRandom(encounter.candidates.length)]];
				if (encounter.trainerCandidates) encounter.team = encounter.trainerCandidates[contentRandom(encounter.trainerCandidates.length)].team;
			}
		} else {
			const offered = rollRoutes(run, content.routePools[floor], routeRandom);
			const candy = offered.find(n => n.trade?.kind === 'candy');
			if (candy && !firstCandy) firstCandy = floor;
			const priority = style === 'steady' ? ['wild', 'event', 'reward', 'elite', 'trainer', 'trade'] :
				['elite', 'trainer', 'wild', 'event', 'reward', 'trade'];
			const picked = candy && money + treasure >= reserve + CANDY_SHOP.expcandyxs.price ? candy :
				priority.map(k => offered.find(n => n.kind === k)).find(Boolean);
			node = createBiomeRoutes(floor, [picked], undefined, contentRandom)[0];
		}
		prepareEconomy(node, floor, contentRandom);
		if (node.kind === 'trade') {
			sell();
			if (node.trade.kind === 'candy') {
				run.node = node; prepareTrade(run, content, contentRandom); visited++;
				const stock = [...node.trade.stock].sort((a, b) => candyEXP[b.id] / b.price - candyEXP[a.id] / a.price);
				for (const item of stock) {
					const count = Math.min(item.remaining, Math.max(0, Math.floor((money - reserve) / item.price)));
					if (!count) continue;
					money -= count * item.price; spent += count * item.price; boughtEXP += count * candyEXP[item.id];
					grantCandy({[item.id]: count});
				}
			}
		}
		// Event choices vary from purchases/losses to non-cash gifts. Primary case uses zero net cash.
		// A separate sensitivity case credits one positive event's base budget, with no event battle EXP.
		if (node.kind === 'event' && options.positiveEventCash) money += Math.round(eventRewardBudget(floor) / 50) * 50;
		const tax = blessingLevelCost(tier, 1, node.kind === 'boss');
		if (fixedFloor(floor) === 'boss') snapshots[floor] = {
			partyMean: team.reduce((sum, mon) => sum + level(mon), 0) / team.length,
			coreMean: team.slice(0, 2).reduce((sum, mon) => sum + level(mon), 0) / Math.min(2, team.length),
			carry: Math.max(...team.map(level)), weakest: Math.min(...team.map(level)),
			boss: Math.max(...node.encounters.flatMap(e => e.team.map(p => p.level))) + tax,
			money, treasure, candySpent: spent, candyEXP: boughtEXP, upkeep, candyVisits: visited,
			firstCandy: firstCandy || 201,
		};
		for (const encounter of node.encounters) for (const foe of encounter.team) {
			const base = rogueSpeciesData(foe.species).baseExperience, enemyLevel = foe.level + tax;
			// Switch the two primary members between encounters; reserves still receive native half EXP.
			const participant = team.slice(0, 2).reduce((a, b) => level(a) <= level(b) ? a : b);
			for (const mon of team) mon.exp += towerExperience(base, enemyLevel, level(mon), mon === participant, floor, node.kind === 'wild');
		}
		money += node.reward.money; receive(node.reward.items);
		for (const loot of node.wildLoot || []) receive(loot);
	}
	return snapshots;
}

function summarizePurchases(tier, style, feeding, options = {}) {
	const samples = Array.from({length: 48}, (_, i) => purchaseTrajectory(i + 1, tier, style, feeding, options));
	return Object.fromEntries(checkpointFloors.map(floor => [floor, {
		...Object.fromEntries(['partyMean', 'coreMean', 'carry', 'weakest', 'boss', 'money', 'treasure',
			'candySpent', 'candyEXP', 'upkeep', 'candyVisits'].map(key => [key, round(median(samples.map(s => s[floor][key])))])),
		coreLevelP10: round(percentile(samples.map(s => s[floor].coreMean), .1)),
		coreLevelP90: round(percentile(samples.map(s => s[floor].coreMean), .9)),
		noCandyOfferPercent: round(100 * samples.filter(s => s[floor].firstCandy > floor).length / samples.length),
	}]));
}

function tradeAccess(samples = 2000) {
	const firstTrades = [], firstCandies = [];
	for (let seed = 1; seed <= samples; seed++) {
		const random = rngFor(seed), run = {floor: 1}; let trade = 201, candy = 201;
		for (let floor = 1; floor <= 200; floor++) {
			if (fixedFloor(floor)) continue;
			run.floor = floor;
			const offers = rollRoutes(run, content.routePools[floor], random);
			if (offers.some(node => node.kind === 'trade')) trade = Math.min(trade, floor);
			if (offers.some(node => node.trade?.kind === 'candy')) candy = Math.min(candy, floor);
		}
		firstTrades.push(trade); firstCandies.push(candy);
	}
	return {samples, firstTradeMedian: median(firstTrades), firstTradeLatest: Math.max(...firstTrades),
		firstCandyMedian: median(firstCandies), noCandyByFloorPercent: Object.fromEntries([10, 20, 30, 40, 50, 80]
			.map(floor => [floor, round(100 * firstCandies.filter(first => first > floor).length / samples)]))};
}

const trajectories = {}, purchases = {};
for (const tier of ['silver', 'gold', 'prismatic']) for (const style of ['steady', 'highReward']) {
	const pairs = Array.from({length: 24}, (_, i) => [trajectory(i + 1, false, tier, style), trajectory(i + 1, true, tier, style)]);
	trajectories[`${tier}-${style}`] = Object.fromEntries(checkpointFloors.map(floor => [floor,
		Object.fromEntries(['before', 'after'].map((key, index) => [key, Object.fromEntries(
			['partyMean', 'carry', 'weakest', 'boss'].map(metric => [metric, round(median(pairs.map(p => p[index][floor][metric])))]))]))]));
}
for (const tier of ['silver', 'gold', 'prismatic']) for (const style of ['steady', 'highReward']) {
	for (const feeding of ['core', 'wholeParty']) purchases[`${tier}-${style}-${feeding}`] = summarizePurchases(tier, style, feeding);
}
const economySensitivity = {
	silverMoney: summarizePurchases('silver', 'steady', 'core', {economyFamily: 'money'}),
	goldBigMoney: summarizePurchases('gold', 'steady', 'core', {economyFamily: 'bigmoney'}),
	goldLargerReserve: summarizePurchases('gold', 'steady', 'core', {reserve: 3500}),
	goldPositiveEvents: summarizePurchases('gold', 'steady', 'core', {positiveEventCash: true}),
};
console.log(JSON.stringify({method: 'Offline route sampling and clean-win EXP sensitivity; not actual battle win rates',
	assumptions: [
		'2000 seeded 200-floor route histories per distribution; fixed floors excluded, no spirit or route quest',
		'24 seeded campaigns per no-purchase baseline, 48 per purchase case; start with one Lv5 partner and recruit five on floors 3/6/12/18/24',
		'All encounters won, no catches replacing KOs or defeats; native half EXP for eligible living reserves; healing costs only modeled in purchase cases',
		'No-purchase trajectories are a lower-resource diagnostic only, not the primary difficulty benchmark',
		'Purchase cases prioritize affordable candy shops, sell actual treasure at trades/centers, use actual stock and prices, reserve max(1500, two center visits plus two potions/Ethers)',
		'Purchase-case clean-win upkeep: one center visit, one potion and one Ether per fixed rest; consume initial/reward supplies before buying replacements',
		'Purchased and dropped candy goes to the weaker of two primary members (core), or weakest party member (wholeParty); two primaries alternate participation',
		'Events have zero net coins in the primary model; positiveEventCash is an explicit favorable sensitivity case, not a promised payout',
		'No event battle/gift EXP, no TM or held-item spending/benefits; largerReserve sensitivity raises the minimum cash reserve from 1500 to 3500',
		'First-trade guarantee does not guarantee candy subtype; no imaginary candy purchase on fixed rest floors',
		'Only opening blessing level tax included; later silver picks; all blessing benefits and star/stat modifiers excluded',
		'Pre-revision route weights use event=22, as already changed before this request; before omits new 25 percent ordinary wild KO EXP',
		'Comparison represents resource availability, not a claim that a low-level team can win every high-reward encounter',
	], routes: {before: routeDistribution(false), after: routeDistribution(true)}, tradeAccess: tradeAccess(), noPurchaseDiagnostic: trajectories,
		purchases, economySensitivity}, null, 2));
