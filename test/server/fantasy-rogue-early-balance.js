'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { CANDY_SHOP, mentorSupplies, towerExperience, grantEventTraining, routeCandyReward, eliteTreasureBudget } = require('../../dist/server/fantasy-rogue/early-balance');
const { prepareTrade, tradeKind, machineMoves } = require('../../dist/server/fantasy-rogue/trading');
const { prepareEconomy, TREASURES } = require('../../dist/server/fantasy-rogue/economy');
const { eliteBossCandidates } = require('../../dist/server/fantasy-rogue/elite-bosses');
const { storyView } = require('../../dist/server/fantasy-rogue/story');
const { set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue early growth and preparation', function () {
	this.timeout(15000);
	let content;
	before(() => { content = createPreviewContent(); });
	it('keeps authored elite levels at the floor baseline with zero EVs', () => {
		assert(eliteBossCandidates(10).every(mon => mon.level === 10));
		assert(eliteBossCandidates(30).every(mon => mon.level === 20));
		for (const enemy of eliteBossCandidates(10)) {
			const mon = createRoguePokemon(set(), stats(0));
			const battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
				fantasyRogue: { encounterId: 'ev-check', team: [mon], boosts: stats(0), bag: {}, balls: [], catchable: false },
				p1: { team: [mon.set] }, p2: { team: [enemy] } });
			try { assert.deepEqual(battle.p2.pokemon[0].set.evs, stats(0)); } finally { battle.destroy(); }
		}
	});
	it('keeps living reserves at half EXP at every stage', () => {
		const full = towerExperience(100, 40, 30, true, 200);
		for (const floor of [1, 60, 61, 100, 101, 200]) assert(Math.abs(towerExperience(100, 40, 30, false, floor) - full / 2) <= 1);
		for (const floor of [1, 60, 61, 100, 101, 200]) assert.equal(towerExperience(100, 40, 30, true, floor), full);
	});
	it('does not hand out permanent pre-boss candy or supplies', () => {
		const team = Array(6).fill({});
		for (const [floor, item, count] of [
			[9, 'expcandys', 6], [19, 'expcandys', 8], [29, 'expcandym', 6],
			[39, 'expcandym', 8], [49, 'expcandym', 10], [59, 'expcandym', 10],
			[69, 'expcandyl', 3], [79, 'expcandyl', 3], [99, 'expcandyl', 3], [109, 'expcandyl', 2],
		]) for (const size of [1, 2, 6]) assert.deepEqual(mentorSupplies({ floor, team: team.slice(0, size) }), {});
	});
	it('warns, grants supplies exactly once, and returns to preparation even when skipped or reconnected', () => {
		const store = new RogueStore(':memory:');
		try {
			let engine = new RogueEngine(store, content, () => 0);
			const user = 'elderqa', saved = () => store.get(user);
			const cmd = (action, extra = {}) => engine.command(user, { id: randomUUID(), revision: saved().revision, action, ...extra });
			commandAfterOpening(engine, user, { id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'] });
			engine = new RogueEngine(store, { ...content, story: true }, () => 0);
			store.change(user, a => {
				a.run.floor = 9; a.run.phase = 'choose';
				delete a.run.choices; delete a.run.node;
			});
			cmd('select', { value: 'center' });
			const view = () => storyView(saved(), true, false);
			assert.equal(view().stage, 'restguide'); assert.match(view().text, /幻想精英/);
			const oldKey = view().key, before = structuredClone(saved().run.bag), gift = mentorSupplies(saved().run);
			assert.throws(() => cmd('battle'), /不能进入/);
			cmd('storynext', { value: oldKey });
			assert.deepEqual(saved().run.bag, before);
			engine.migrate(user); assert.equal(view().index, 1);
			assert.throws(() => cmd('storynext', { value: oldKey }), /进度/);
			const request = { id: randomUUID(), revision: saved().revision, action: 'storyskip', value: view().key };
			engine.command(user, request);
			const paid = saved();
			engine.command(user, request);
			assert.deepEqual(saved(), paid); assert.equal(paid.run.phase, 'rest'); assert(!paid.run.battle);
			for (const [id, count] of Object.entries(gift)) assert.equal(paid.run.bag[id], (before[id] || 0) + count);
			engine.migrate(user); assert.equal(saved().run.phase, 'rest');
			assert.throws(() => cmd('continue'), /首领卡/); cmd('mentorcard', {value: 'attack'});
			cmd('continue'); assert.equal(saved().run.floor, 10); assert.equal(saved().run.phase, 'ready');
			assert(!saved().run.battle, 'walking upstairs still does not enter combat automatically');
		} finally { store.close(); }
	});
	it('gives elites reliable extra loot and does not reroll a saved reward', () => {
		for (const kind of ['wild', 'elite', 'boss']) for (const floor of [10, 40, 70, 71]) {
			const node = { kind, reward: { money: 0, items: {} }, encounters: [{ team: [] }] };
			prepareEconomy(node, floor, max => max === 100 ? 99 : 0);
			const boosted = kind === 'elite';
			const value = Object.entries(node.wildLoot[0]).reduce((sum, [id, count]) => sum + count * (TREASURES.find(t => t.id === id)?.sellPrice || 0), 0);
			assert.equal(value, 150 + (boosted ? eliteTreasureBudget(floor) : 0));
			for (const [id, count] of Object.entries(routeCandyReward(floor, 'elite'))) assert.equal(node.wildLoot[0][id] || 0, boosted ? count : 0);
			const saved = structuredClone(node); prepareEconomy(node, floor, () => { throw Error('reroll'); });
			assert.deepEqual(node, saved);
		}
	});
	it('keeps candy EXP smooth between deliberate late-support steps, with no grade-unlock windfall', () => {
		const exp = items => Object.entries(items).reduce((sum, [id, count]) => sum + count * content.items.find(i => i.id === id).amount, 0);
		for (const kind of ['elite', 'trainer', 'reward']) {
			let previous = 0, previousNormalized = 0;
			for (let floor = 1; floor <= 200; floor++) {
				const items = routeCandyReward(floor, kind), value = exp(items);
				assert(value >= previous, `${kind}, floor ${floor}`);
				// Remove the approved 81/101/141 support steps when checking the underlying curve.
				const support = floor <= 80 ? 1 : floor <= 100 ? 1.15 : floor <= 140 ? 1.25 : 1.35;
				const normalized = value / support;
				if (floor > 1) assert(normalized - previousNormalized <= 200 + 12 * floor * (kind === 'trainer' ? 0.9 : kind === 'reward' ? 0.2 : 1));
				for (const id of Object.keys(items)) assert(CANDY_SHOP[id].floor <= floor);
				previous = value;
				previousNormalized = normalized;
			}
		}
		assert.deepEqual([1, 10, 20, 30, 40].map(f => exp(routeCandyReward(f, 'elite'))), [100, 200, 600, 1100, 2000]);
		for (const [floor, elite, trainer, reward] of [
			[80, 11600, 10500, 2300], [81, 13800, 12500, 2800],
			[100, 25100, 22600, 5000], [101, 28100, 25300, 5600],
			[140, 75000, 67500, 15000], [141, 82800, 74500, 16600], [200, 209700, 188700, 41900],
		]) {
			assert.deepEqual(['elite', 'trainer', 'reward'].map(kind => exp(routeCandyReward(floor, kind))), [elite, trainer, reward]);
		}
		for (let f = 1; f <= 200; f++) {
			assert(exp(routeCandyReward(f, 'trainer')) <= exp(routeCandyReward(f, 'elite')));
			assert(exp(routeCandyReward(f, 'trainer')) >= exp(routeCandyReward(f, 'reward')));
		}
	});
	it('caps event aid to one payout and excludes loss, leave and memory battles', () => {
		for (const floor of [1, 20, 40, 79, 80]) for (const blocked of [false, true]) {
			const run = { floor, money: 0, bag: {}, node: { name: '见闻', event: { settled: true, trainingAidBlocked: blocked } } };
			grantEventTraining(run); const before = structuredClone(run); grantEventTraining(run);
			assert.deepEqual(run, before);
			assert.equal(Object.keys(run.bag).length > 0, !blocked); assert.equal(run.money > 0, !blocked);
			if (!blocked) assert.deepEqual(run.lastReward.items, run.bag);
		}
	});
	it('improves candy EXP per coin by grade and persists stock across reloads', () => {
		let value = 0;
		for (const [id, offer] of Object.entries(CANDY_SHOP)) {
			const item = content.items.find(entry => entry.id === id);
			assert(item.amount / offer.price > value); value = item.amount / offer.price;
			for (const floor of [offer.floor - 1, offer.floor]) {
				const run = { floor, team: [], node: { trade: { kind: 'candy', stock: [], purchases: 0 } } };
				prepareTrade(run, content, () => 0);
				assert.equal(run.node.trade.stock.some(entry => entry.id === id), floor >= offer.floor);
				const saved = structuredClone(run); prepareTrade(run, content, () => { throw Error('reroll'); });
				assert.deepEqual(run, saved);
			}
		}
	});
	it('favors candy/TM trades early and stocks six/eight distinct legal TMs', () => {
		const counts = {};
		for (let specialist = 0; specialist < 100; specialist++) for (let general = 0; general < 100; general++) {
			let draw = 0; const kind = tradeKind(1, () => draw++ === 0 ? specialist : general);
			counts[kind] = (counts[kind] || 0) + 1;
		}
		assert.deepEqual(counts, { balls: 2000, mushroom: 800, candy: 3600, machine: 2880, mint: 720 });
		for (const floor of [1, 80]) {
			const run = { floor, team: [createRoguePokemon(set(), stats(0))], node: { trade: { kind: 'machine', stock: [], purchases: 0 } } };
			prepareTrade(run, content, () => 0);
			assert.equal(run.node.trade.stock.length, floor < 80 ? 6 : 8);
			assert.equal(new Set(run.node.trade.stock.map(item => item.id)).size, run.node.trade.stock.length);
			assert(run.node.trade.stock.every(item => machineMoves(run.team[0]).includes(item.move)));
		}
	});
});
