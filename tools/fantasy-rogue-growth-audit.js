'use strict';
// Reproducible growth/resource audit. Controlled matchups are not campaign wins or difficulty ratings.
const fs = require('fs');
const { Battle } = require('../dist/sim/battle');
const { Dex } = require('../dist/sim/dex');
const { PRNG } = require('../dist/sim/prng');
const { createRoguePokemon, initializeExperience, gainExperience } = require('../dist/server/fantasy-rogue/progression');
const { grantGrowth, grantPersonalGrowth, personalGrowthAmount } = require('../dist/server/fantasy-rogue/growth');
const { rewardExperience, rewardChoices, rewardCandies } = require('../dist/server/fantasy-rogue/reward-scenes');
const { rollRoutes } = require('../dist/server/fantasy-rogue/routes');
const { fixedFloor } = require('../dist/server/fantasy-rogue/content');
const dex = Dex.mod('gen9fantasy'), stats = n => ({ hp: n, atk: n, def: n, spa: n, spd: n, spe: n });
const set = (species, level) => ({ species, level, ability: dex.species.get(species).abilities[0], nature: 'Hardy',
	ivs: stats(20), evs: stats(0), item: '', moves: ['Earthquake'] });
const root = 'docs/playtests/2026-10-17/permanent';
const report = { method: 'Exact production stats and reward budgets; 1000 route seeds; deterministic single-hit fixtures. No injected resources in campaign tests; fixture stats are not claimed campaign acquisitions.',
	early: [], retained: [], rewards: [], damage: [], routes: {} };
const mkRun = (floor, species, level) => {
	const run = { floor, boosts: stats(5), team: [], notices: [] };
	run.team = [createRoguePokemon(set(species, level), run.boosts)]; initializeExperience(run.team[0]); return run;
};
for (const [floor, species, level] of [[1, 'Bulbasaur', 5], [10, 'Bulbasaur', 12], [25, 'Ivysaur', 23], [40, 'Venusaur', 32], [50, 'Venusaur', 40]]) {
	const r = mkRun(floor, species, level), m = r.team[0], xp = rewardExperience(floor);
	const other = structuredClone(r), before = { ...m.stats }; gainExperience(other, other.team[0], xp);
	const amount = personalGrowthAmount(r, m, 'offense', 400, xp); grantPersonalGrowth(r, m, 'offense', amount);
	report.early.push({ floor, species, level, xp, trainingPercent: amount / 100, before, trained: m.stats, afterEXP: other.team[0].stats, levelAfterEXP: other.team[0].set.level });
}
for (const [species, level] of [['Bulbasaur', 5], ['Ivysaur', 25], ['Venusaur', 50], ['Venusaur', 75], ['Venusaur', 100]]) {
	const r = mkRun(level * 2, species, level), m = r.team[0], before = { ...m.stats };
	grantPersonalGrowth(r, m, 'offense', 400); const withTraining = { ...m.stats }; gainExperience(r, m, 1000);
	report.retained.push({ species, level, before, withEarlyFourPercent: withTraining, afterAnother1000EXP: m.stats, levelAfterEXP: m.set.level });
}
for (const floor of [1, 10, 20, 30, 40, 50, 75, 100, 125, 150, 175, 199]) {
	const r = mkRun(floor, 'Venusaur', Math.min(100, 5 + Math.ceil(floor / 2)));
	r.node = { kind: 'reward', rewardScene: { id: 'chest', key: 'audit' } };
	report.rewards.push({ floor, experience: rewardExperience(floor), enhancedExperience: rewardExperience(floor, true),
		candies: rewardCandies(floor, rewardExperience(floor)), extraCoins: 100 + 8 * floor,
		moneyAlternative: rewardChoices(r).find(c => c.id === 'money').money });
}
for (const opponentLevel of [100, 150, 200]) for (const percent of [0, 20, 40, 60]) {
	const run = mkRun(200, 'Garchomp', 100); grantGrowth(run, 'offense', percent * 100); grantGrowth(run, 'defense', percent * 100);
	const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [2026, 10, 17, 2],
		fantasyRogue: { encounterId: 'audit', team: run.team, boosts: run.boosts, bag: {}, balls: [], catchable: false },
		p1: { team: run.team.map(m => m.set) }, p2: { team: [set('Garchomp', opponentLevel)] } });
	try {
		battle.makeChoices('team 1', 'team 1'); battle.randomizer = n => n;
		const a = battle.p1.pokemon[0], b = battle.p2.pokemon[0];
		const dealt = battle.actions.getDamage(a, b, 'earthquake'), taken = battle.actions.getDamage(b, a, 'earthquake');
		report.damage.push({ opponentLevel: b.level, trainingPercent: percent, dealt, taken, playerHP: a.maxhp, opponentHP: b.maxhp,
			dealtPercent: +(dealt / b.maxhp * 100).toFixed(1), takenPercent: +(taken / a.maxhp * 100).toFixed(1) });
	} finally { battle.destroy(); }
}
const pool = ['wild', 'elite', 'trainer', 'event', 'reward', 'trade'].map(kind => ({ id: kind, kind, name: kind, encounters: [], reward: { money: 0, items: {} },
	...(kind === 'trade' ? { trade: { kind: 'candy', stock: [], purchases: 0 } } : {}) }));
const counts = [];
for (let seed = 1; seed <= 1000; seed++) {
	const rng = new PRNG([2026, 10, 17, seed]), run = { floor: 1 }; let count = 0;
	for (let floor = 1; floor <= 200; floor++) {
		if (fixedFloor(floor)) continue; run.floor = floor;
		if (rollRoutes(run, pool, n => rng.random(n)).some(n => n.trade?.kind === 'growth')) count++;
	} counts.push(count);
}
counts.sort((a, b) => a - b); report.routes = { samples: 1000, trainingOffers: { min: counts[0], p10: counts[99], median: counts[499], p90: counts[899], max: counts[999],
	mean: counts.reduce((s, n) => s + n, 0) / 1000 }, note: 'Offered routes, not visits/purchases. Choosing one skips the other two; funds and recovery budgets further constrain purchases.' };
fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(root + '/growth-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
