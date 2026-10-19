'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), Module = require('module');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const get = name => require(root + '/dist/' + name);
global.Config = { fantasyrogue: { enabled: true, publicAccess: true }, fantasyailocal: true, bindaddress: '127.0.0.1' };
global.Rooms = { get: () => undefined };
const { createPreviewContent } = get('server/fantasy-rogue/preview-content');
const { RogueStore } = get('server/fantasy-rogue/store'), { RogueEngine } = get('server/fantasy-rogue/engine'), { RogueManager } = get('server/fantasy-rogue/manager');
const { commandAfterOpening } = require(root + '/test/fixtures/fantasy-rogue');
const content = createPreviewContent(), store = new RogueStore(':memory:'), engine = new RogueEngine(store, content, () => 0);
const user = { id: 'performanceqa', name: 'PerformanceQA', named: true, registered: true, connected: true };
commandAfterOpening(engine, user.id, { id: require('crypto').randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'] });
const ts = require(root + '/node_modules/typescript');
const original = cp.execFileSync('git', ['show', '2df19f09b7950cd96e23ec822800dd7fa9f10401:server/fantasy-rogue/manager.ts'], { cwd: root, encoding: 'utf8' });
const oldModule = new Module(root + '/dist/server/fantasy-rogue/benchmark-old-manager.js', module);
oldModule.filename = root + '/dist/server/fantasy-rogue/benchmark-old-manager.js';
oldModule.paths = Module._nodeModulePaths(path.dirname(oldModule.filename));
oldModule._compile(ts.transpileModule(original, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, oldModule.filename);
function bench(manager) {
	for (let i = 0; i < 3; i++)
		manager.state(user);
	const ms = [];
	let data;
	for (let i = 0; i < 20; i++) {
		const start = performance.now();
		data = manager.state(user);
		JSON.stringify(data);
		ms.push(performance.now() - start);
	} ms.sort((a, b) => a - b); return { bytes: Buffer.byteLength(JSON.stringify(data)), medianMs: +ms[10].toFixed(2), starters: data.starters.length };
}
const before = bench(new oldModule.exports.RogueManager(engine)), after = bench(new RogueManager(engine));
store.close();
const { rollRoutes } = get('server/fantasy-rogue/routes');
const { fixedFloor } = get('server/fantasy-rogue/content');
const { prepareEconomy, TREASURES, centerCare } = get('server/fantasy-rogue/economy');
const { eventRewardBudget, restCandyOffer } = get('server/fantasy-rogue/early-balance');
const { rewardMoney } = get('server/fantasy-rogue/reward-scenes');
const { GHOLDENGO_EVOLUTION_COINS } = get('server/fantasy-rogue/party-evolution');
const value = Object.fromEntries(TREASURES.map(i => [i.id, i.sellPrice]));
function rng(seed) {
	return max => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return Math.floor(seed / 4294967296 * max);
	};
}
// A cash-flow sensitivity model, not a simulated battle or claimed human playtest.
// All fights won; no economic blessing. Save policy prioritises trainer income, pays rest care;
// normal policy prefers wild battles, buys the limited rest candy stock and maintains supplies.
function trajectory(seed, save) {
	const random = rng(seed), run = { floor: 1 };
	let money = content.initialMoney, treasure = 0, first = 0;
	const snapshots = {};
	for (let floor = 1; floor <= 100; floor++) {
		run.floor = floor;
		if (fixedFloor(floor) === 'rest') {
			money += treasure;
			treasure = 0;
			money -= centerCare({ floor, team: [{ hp: 19, maxhp: 20, status: '', pp: [] }] }).cost;
			if (!save) {
				const candy = restCandyOffer(floor);
				money -= Math.min(Math.max(0, money - 2000), candy.price * candy.stock + 600);
			}
		} else if (fixedFloor(floor) === 'boss') {
			const node = structuredClone(content.floors[floor][0]);
			prepareEconomy(node, floor, random);
			money += node.reward.money;
			for (const items of node.wildLoot || [])
				for (const [id, n] of Object.entries(items))
					treasure += (value[id] || 0) * n;
		} else {
			const choices = rollRoutes(run, content.routePools[floor], random);
			const priority = save ? ['trainer', 'elite', 'wild', 'event', 'reward', 'trade'] : ['wild', 'reward', 'event', 'trainer', 'elite', 'trade'];
			const node = priority.map(k => choices.find(n => n.kind === k)).find(Boolean);
			if (node.kind === 'wild')
				node.encounters = [{ team: [], wildPack: { lootRolls: 3 } }];
			prepareEconomy(node, floor, random);
			money += node.reward.money;
			for (const items of [node.reward.items, ...node.wildLoot || []])
				for (const [id, n] of Object.entries(items))
					treasure += (value[id] || 0) * n;
			if (node.kind === 'event')
				money += Math.round(eventRewardBudget(floor) * 0.5 / 50) * 50;
			if (node.kind === 'reward')
				money += rewardMoney(floor);
			if (node.kind === 'trade') {
				money += treasure;
				treasure = 0;
			}
		}
		// Accessible money: treasures become coins at an actual rest/trade above, never automatically.
		if (!first && money >= GHOLDENGO_EVOLUTION_COINS)
			first = floor;
		if ([20, 40, 60, 80, 100].includes(floor))
			snapshots[floor] = money;
	}
	return { first: first || 101, snapshots };
}
function distribution(save) {
	const runs = Array.from({ length: 500 }, (_, i) => trajectory(i + 1, save));
	const quantile = (a, p) => a.sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
	return {
		firstAffordableFloor: {
			p10: quantile(runs.map(r => r.first), 0.1), median: quantile(runs.map(r => r.first), 0.5),
			p90: quantile(runs.map(r => r.first), 0.9),
		},
		medianCoins: Object.fromEntries([20, 40, 60, 80, 100].map(f => [f, quantile(runs.map(r => r.snapshots[f]), 0.5)])),
	};
}
const result = { scope: 'Offline cash-flow model; clean wins, no economic blessing, authored boss gifts included; positive events credited half of event budget. Not human playtest evidence.', performance: { before, after, reductionPercent: +(100 * (1 - after.bytes / before.bytes)).toFixed(1) }, evolution: { fee: GHOLDENGO_EVOLUTION_COINS, seeds: 500, saving: distribution(true), ordinary: distribution(false) } };
const out = path.join(root, 'docs/playtests/2026-10-19');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'revision-audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
