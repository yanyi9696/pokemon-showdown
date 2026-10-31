'use strict';
const assert = require('assert').strict;
const {Battle} = require('../../dist/sim/battle');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {rogueBattleResult} = require('../../dist/sim/fantasy-rogue');
const {revivalRequest} = require('../../dist/sim/rogue-revival');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {prepareRewardScene, rewardChoices, chooseReward} = require('../../dist/server/fantasy-rogue/reward-scenes');
const {tradeKind, machineMoves} = require('../../dist/server/fantasy-rogue/trading');
const {expeditionWeight} = require('../../dist/server/fantasy-rogue/expedition-events');
const {set, stats} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue grace-period adjustments', function () {
	this.timeout(30000);
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function party(ids = [], floor = 70) {
		return {id: 'adjustment', floor, phase: 'ready', boosts: stats(0), money: 0, bag: {}, notices: [],
			team: [createRoguePokemon(set('Mew', 'Synchronize', 50, ['Splash', 'Self-Destruct']), stats(0)),
				createRoguePokemon(set('Blissey', 'Natural Cure', 50, ['Splash']), stats(0))],
			blessings: {owned: ids.map(id => ({...blessing(id), floor: 1})), defeated: [], shards: 0, pending: []}};
	}
	function begin(run = party(['insight']), foe = set('Gengar', 'Levitate', 50, ['Seismic Toss', 'Splash'])) {
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: {
			encounterId: 'revival-test', team: structuredClone(run.team), boosts: stats(0), bag: {...run.bag}, balls: [],
			catchable: false, blessings: run.blessings,
		}, p1: {name: 'Tester', team: run.team.map(m => m.set)}, p2: {name: 'Foe', team: [foe]}});
		battle.makeChoices('team 1', 'team 1');
		return battle.p1.active[0];
	}
	function faintAndSwitch() {
		battle.makeChoices('move selfdestruct', 'move splash');
		assert.equal(battle.p1.requestState, 'switch');
		assert(battle.choose('p1', 'switch 2'));
		assert.equal(battle.p1.requestState, 'move');
	}
	it('revives with a real action, spends once, preserves PP, and permits repeated uses', () => {
		const run = party(['insight']); run.bag = {revive: 3, maxrevive: 1}; begin(run);
		faintAndSwitch();
		const target = battle.p1.pokemon[1], actor = battle.p1.active[0], hp = actor.hp;
		assert.equal(revivalRequest(battle.p1).targets[0].slot, 2);
		assert(battle.choose('p1', 'roguerevive revive 2'));
		assert.equal(battle.fantasyRogue.bag.revive, 3);
		battle.undoChoice('p1'); assert.equal(battle.fantasyRogue.bag.revive, 3);
		const pp = actor.moveSlots[0].pp, targetPP = target.moveSlots.find(m => m.id === 'selfdestruct').pp;
		battle.makeChoices('roguerevive revive 2', 'move seismictoss');
		assert.equal(target.hp, Math.floor(target.maxhp / 2)); assert(!target.fainted);
		assert.equal(actor.hp, hp - 50); assert.equal(actor.moveSlots[0].pp, pp);
		assert.equal(target.moveSlots.find(m => m.id === 'selfdestruct').pp, targetPP);
		assert.equal(battle.p1.pokemonLeft, 2); assert.equal(battle.fantasyRogue.bag.revive, 2);
		battle.makeChoices('switch 2', 'move splash'); faintAndSwitch();
		battle.makeChoices('roguerevive maxrevive 2', 'move splash');
		assert.equal(battle.p1.pokemon[1].hp, battle.p1.pokemon[1].maxhp);
		const result = rogueBattleResult(battle);
		assert.equal(result.bag.maxrevive, 0); assert.equal(result.bag.revive, 2);
		assert.equal(result.blessingProgress.insight[target.set.fantasyRogueId].points, 2);
	});
	it('rejects forged items, living targets, opponents, and the forced switch phase without spending', () => {
		const run = party(['insight']); run.bag = {revive: 2, potion: 3}; begin(run);
		assert.equal(battle.choose('p1', 'roguerevive potion 2'), false);
		assert.equal(battle.choose('p1', 'roguerevive revive 2'), false);
		battle.makeChoices('move selfdestruct', 'move splash');
		assert.equal(battle.choose('p1', 'roguerevive revive 1'), false);
		assert.equal(battle.choose('p2', 'roguerevive revive 1'), false);
		assert.equal(battle.fantasyRogue.bag.revive, 2);
	});
	it('requires the blessing and keeps battle consumption and HP through serialization', () => {
		const run = party(); run.bag = {revive: 2}; begin(run); faintAndSwitch();
		assert.equal(battle.choose('p1', 'roguerevive revive 2'), false); assert(!revivalRequest(battle.p1));
		battle.fantasyRogue.blessings.owned.push({...blessing('insight'), floor: 1});
		battle.makeChoices('roguerevive revive 2', 'move splash');
		const json = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(json);
		assert.equal(battle.fantasyRogue.bag.revive, 1); assert(!battle.p1.pokemon[1].fainted);
		assert.equal(battle.choose('p1', 'roguerevive revive 2'), false);
		battle.fantasyRogue.duel = {team: [], boosts: stats(0)};
		assert(!revivalRequest(battle.p1));
	});
	it('sets the five Super Number stats to x5 for one turn only', () => {
		const mon = begin(party(['supernumber'])); const before = ['atk', 'def', 'spa', 'spd', 'spe'].map(s => mon.getStat(s));
		let during;
		battle.onEvent('BeforeMove', battle.format, function (p) { if (p === mon) during = ['atk', 'def', 'spa', 'spd', 'spe'].map(s => p.getStat(s)); });
		battle.makeChoices('roguenumber all move splash', 'move splash');
		assert.deepEqual(during, before.map(n => n * 5));
		assert.deepEqual(['atk', 'def', 'spa', 'spd', 'spe'].map(s => mon.getStat(s)), before);
	});
	it('counts only two entrances per member, including after serialization', () => {
		begin(party(['entrance']));
		for (let i = 0; i < 7; i++) battle.makeChoices('switch 2', 'move splash');
		assert.equal(battle.fantasyRogue.blessingRuntime.p1.entries, 4);
		const json = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(json);
		battle.makeChoices('switch 2', 'move splash');
		assert.equal(battle.fantasyRogue.blessingRuntime.p1.entries, 4);
	});
	it('preserves a renewable item once, then consumes it normally after switching', () => {
		const run = party(['renewable']); run.team[0].set.item = 'Normal Gem'; run.team[0].set.moves = ['Tackle'];
		begin(run, set('Blissey', 'Natural Cure', 100, ['Splash']));
		battle.makeChoices('move tackle', 'move splash'); assert.equal(battle.p1.active[0].item, 'normalgem');
		battle.makeChoices('switch 2', 'move splash'); battle.makeChoices('switch 2', 'move splash');
		battle.makeChoices('move tackle', 'move splash'); assert.equal(battle.p1.active[0].item, '');
		assert.equal(rogueBattleResult(battle).team.find(m => m.id === run.team[0].id).set.item, '');
	});
	it('plans every future boss once, without recording unplayed victories or duplicate gym leaders', () => {
		const config = createPreviewContent(), run = party(['futuresight'], 1);
		const engine = new RogueEngine({}, config, () => 0);
		engine.prepareFutureSight(run);
		const floors = Object.keys(config.floors).map(Number).filter(f => f > 1 && config.floors[f].some(n => n.kind === 'boss'));
		assert.deepEqual(Object.keys(run.bossPreviews).map(Number), floors);
		const gyms = Object.values(run.bossPreviews).flatMap(n => n.encounters).filter(e => e.trainer?.role === 'gym').map(e => e.trainer.id);
		assert.equal(gyms.length, 8); assert.equal(new Set(gyms).size, 8);
		assert.deepEqual(run.trainerHistory.gyms, []); assert.deepEqual(run.trainerHistory.eliteFour, []);
		const before = JSON.stringify(run.bossPreviews), reconnected = JSON.parse(JSON.stringify(run));
		engine.random = () => { throw Error('forecast rerolled'); }; engine.prepareFutureSight(reconnected);
		assert.equal(JSON.stringify(reconnected.bossPreviews), before);
		const elite = Object.values(run.trainerHistory.elitePlan);
		assert.equal(new Set(elite).size, 4);
		assert.equal(run.bossPreviews[190].encounters[0].trainer.id === 'lance', elite.includes('lance'));
	});
	it('swaps only repeat training offers after floor 60; preserves fragments, cash and candy choices', () => {
		const run = party([], 90); run.phase = 'reward'; run.team[0].training = {offense: 600};
		run.catchupCheckpoint = 80; run.team.forEach(m => { m.set.level = 100; });
		run.node = {kind: 'reward', name: '', encounters: [], reward: {money: 0, items: {}}};
		let calls = 0; prepareRewardScene(run, n => (++calls === 1 ? n - 1 : 0));
		assert(run.node.rewardScene.trainingAlternatives?.length);
		const clone = structuredClone(run); delete clone.node.rewardScene.trainingAlternatives;
		const before = rewardChoices(clone), after = rewardChoices(run);
		for (const id of ['shards', 'experience', 'money', 'recovery']) assert.deepEqual(after.find(c => c.id === id), before.find(c => c.id === id));
		assert(!after.some(c => c.id === 'offense' || c.id === 'defense'));
		const tm = run.node.rewardScene.trainingAlternatives.find(id => id.startsWith('roguetm'));
		assert(tm && run.team.some(m => machineMoves(m).includes(tm.slice(7))));
		const snapshot = JSON.stringify(run.node.rewardScene); prepareRewardScene(run, () => { throw Error('reroll'); });
		assert.equal(JSON.stringify(run.node.rewardScene), snapshot);
		chooseReward(run, createPreviewContent(), () => 0, tm);
		assert.equal(run.node.reward.items[tm], 1);
		assert.throws(() => chooseReward(run, createPreviewContent(), () => 0, tm));
	});
	it('adds recovery supplies to nature mint rewards without adding candy or changing TM rewards', () => {
		for (const floor of [40, 68, 69, 150]) {
			const run = party([], floor); run.phase = 'reward';
			run.node = {kind: 'reward', reward: {money: 0, items: {}}, rewardScene: {
				id: 'supplies', trainingAlternatives: ['roguemintmodest', 'roguetmpsychic'],
			}};
			const choices = rewardChoices(run);
			const extra = floor < 69 ? {superpotion: 1, ether: 2} : {hyperpotion: 1};
			assert.deepEqual(choices.find(c => c.id === 'roguemintmodest').items, {roguemintmodest: 1, ...extra});
			assert.deepEqual(choices.find(c => c.id === 'roguetmpsychic').items, {roguetmpsychic: 1});
			const control = structuredClone(run);
			chooseReward(control, createPreviewContent(), () => 0, 'roguetmpsychic');
			const expected = {...control.node.reward.items, roguemintmodest: 1};
			delete expected.roguetmpsychic;
			for (const [id, count] of Object.entries(extra)) expected[id] = (expected[id] || 0) + count;
			chooseReward(run, createPreviewContent(), () => 0, 'roguemintmodest');
			assert.deepEqual(run.node.reward.items, expected);
			assert.throws(() => chooseReward(run, createPreviewContent(), () => 0, 'roguemintmodest'));
		}
	});
	it('uses the revised late trade weights and increases only the existing late doctor event', () => {
		const counts = {};
		for (let roll = 0; roll < 100; roll++) { let call = 0;
			const kind = tradeKind(150, () => ++call < 4 ? 99 : roll); counts[kind] = (counts[kind] || 0) + 1;
		}
		assert.deepEqual(counts, {growth: 30, candy: 24, machine: 31, mint: 15});
		assert.deepEqual([30, 100, 101, 150, 151, 200].map(floor => expeditionWeight({floor}, 'blackjack')), [1, 1, 1.5, 1.5, 2, 2]);
		assert.equal(expeditionWeight({floor: 200}, 'coin'), 1);
	});
	it('grants one Oppenheimer potion per completed battle area and none for other areas', () => {
		const config = require('../fixtures/fantasy-rogue').content();
		const engine = new RogueEngine({}, config, () => 99);
		engine.advanceCompletedFloor = () => {};
		for (const floor of [5, 70, 110]) for (const kind of ['wild', 'trainer', 'elite', 'event', 'boss', 'rest']) {
			const run = party(['companionlysandre'], floor);
			run.blessings.companions = [{id: 'lysandre', preferences: 0}];
			run.node = {id: 'test', kind, name: 'Test', encounters: [], reward: {money: 0, items: {}}};
			engine.completeFloor({points: 0}, run);
			const expected = floor < 50 ? 'potion' : floor < 100 ? 'superpotion' : 'hyperpotion';
			assert.equal(run.bag[expected] || 0, ['wild', 'trainer', 'elite'].includes(kind) ? 1 : 0, kind);
		}
	});
});
