'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {PRNG} = require('../../dist/sim/prng');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {rollRoutes, ROUTE_RETENTION, ELITE_PITY_ROOMS} = require('../../dist/server/fantasy-rogue/routes');
const {needsOnboarding} = require('../../dist/server/fantasy-rogue/onboarding');
const {fixedFloor} = require('../../dist/server/fantasy-rogue/content');
const {towerExperience} = require('../../dist/server/fantasy-rogue/early-balance');
const {experienceYield} = require('../../dist/sim/fantasy-rogue-rules');
const {eventView, chooseEventOption} = require('../../dist/server/fantasy-rogue/events');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {content} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue universal escape, rescue and route pacing', () => {
	let store, engine;
	const user = 'escaperoutes';
	const saved = () => store.get(user);
	const cmd = (action, data = {}) => engine.command(user, {id: randomUUID(), revision: saved().revision, action, ...data});
	beforeEach(() => { store = new RogueStore(':memory:'); engine = new RogueEngine(store, content(), () => 0); });
	afterEach(() => store.close());
	function start() { cmd('start', {starters: ['bulbasaur']}); cmd('select', {value: 'grass'}); }
	function finish(won, edit = () => {}) {
		const run = saved().run, result = {encounterId: run.battle.encounterId, won, team: run.team, bag: run.bag};
		edit(result); engine.settle(user, run.battle.token, result);
		return () => engine.settle(user, run.battle.token, result);
	}
	for (const kind of ['wild', 'elite', 'trainer', 'boss', 'event', 'shop', 'god', 'travel', 'continuous']) {
		it(`lets ${kind} battles escape without ending the branch, paying rewards, charging a loss or restoring resources`, () => {
			start(); store.change(user, a => {
				const run = a.run;
				run.money = 10000; run.team[0].set.item = 'Oran Berry';
				if (['wild', 'elite', 'trainer', 'boss'].includes(kind)) run.node.kind = kind;
				if (['event', 'travel'].includes(kind)) run.node.event = {id: kind === 'travel' ? 'travel' : 'room', key: 'story', stage: 'battle', allowRetreat: false};
				if (kind === 'shop') run.node.shopChallenge = {rewards: {revive: 5}, closed: false};
				if (kind === 'god') run.postgame = {stage: 'battle', before: structuredClone(run), node: structuredClone(run.node), encounter: 0};
				if (kind === 'continuous') run.node.noHealing = true;
			});
			const before = saved().run;
			cmd('battle'); const id = saved().run.battle.encounterId;
			cmd('retreat');
			const replay = finish(true, r => { // A late win must not overtake a recorded escape.
				r.team[0].hp = 1; r.team[0].pp[0].pp = 1; r.team[0].status = 'psn'; r.team[0].set.item = ''; r.bag.pokeball--;
			});
			const after = saved();
			assert.equal(after.run.phase, 'ready'); assert.equal(after.run.encounter, before.encounter);
			assert.equal(after.run.recovery, 'retreat'); assert.equal(after.run.money, 10000); assert.equal(after.points, 0);
			assert.equal(after.run.team[0].hp, 1); assert.equal(after.run.team[0].pp[0].pp, 1);
			assert.equal(after.run.team[0].status, 'psn'); assert.equal(after.run.team[0].set.item, '');
			assert.equal(after.run.bag.pokeball, before.bag.pokeball - 1); assert(!after.run.emergencyRecovery);
			if (after.run.node.event) assert.equal(after.run.node.event.stage, 'battle');
			if (after.run.node.shopChallenge) assert.equal(after.run.node.shopChallenge.closed, false);
			if (after.run.postgame) assert.equal(after.run.postgame.stage, 'battle');
			replay(); assert.deepEqual(saved(), after);
			cmd('battle'); assert.equal(saved().run.battle.encounterId, id);
			assert.deepEqual(saved().run.node.encounters, before.node.encounters);
		});
	}
	it('automatically pays once after a real wipe, fully restores the party and keeps the same encounter', () => {
		start(); store.change(user, a => {a.run.money = 3000; a.run.encounter = 2;}); cmd('battle');
		const replay = finish(false, r => {r.team[0].hp = 0; r.team[0].status = 'psn'; r.team[0].pp[0].pp = 1;});
		const after = saved();
		assert.deepEqual(after.run.emergencyRecovery, {cost: 1900, paid: true});
		assert.equal(after.run.money, 1100); assert.equal(after.run.encounter, 2); assert.equal(after.run.floor, 1);
		assert.equal(after.run.team[0].hp, after.run.team[0].maxhp); assert.equal(after.run.team[0].status, '');
		assert(after.run.team[0].pp.every(p => p.pp === p.maxpp));
		replay(); engine.migrate(user); assert.equal(saved().run.money, 1100);
		cmd('battle'); assert(!saved().run.emergencyRecovery);
	});
	for (const situation of ['poor', 'revive', 'alive', 'escape']) it(`does not silently pay or restore in the ${situation} case`, () => {
		start(); store.change(user, a => {
			a.run.money = situation === 'poor' ? 1899 : 3000;
			if (situation === 'revive') a.run.bag.revive = 1;
		}); cmd('battle'); if (situation === 'escape') cmd('retreat');
		finish(false, r => {r.team[0].hp = situation === 'alive' ? 1 : 0;});
		assert.equal(saved().run.money, situation === 'poor' ? 1899 : 3000);
		assert.equal(saved().run.team[0].hp, situation === 'alive' ? 1 : 0);
		assert.deepEqual(saved().run.emergencyRecovery, situation === 'poor' ? {cost: 1900, paid: false} : undefined);
		engine.migrate(user); assert.equal(saved().run.team[0].hp, situation === 'alive' ? 1 : 0);
	});
	for (const kind of ['event', 'shop']) it(`rescues a real ${kind} defeat without reopening the completed activity`, () => {
		start(); store.change(user, a => {
			a.run.money = 3000;
			if (kind === 'event') a.run.node.event = {id: 'room', key: 'event', stage: 'battle'};
			else a.run.node.shopChallenge = {rewards: {revive: 5}, closed: false};
		}); cmd('battle');
		const replay = finish(false, r => {r.team[0].hp = 0;});
		assert.equal(saved().run.money, 1100); assert.equal(saved().run.team[0].hp, saved().run.team[0].maxhp);
		if (kind === 'event') assert.equal(saved().run.node.event.stage, 'result');
		else {
			assert.equal(saved().run.floor, 2); assert.equal(saved().run.phase, 'choose');
			assert(!saved().run.node); assert.equal(saved().run.bag.revive || 0, 0);
			assert.equal(saved().run.lastReward.name, '零元购 · 商店关闭');
		}
		assert.deepEqual(saved().run.emergencyRecovery, {cost: 1900, paid: true});
		const once = saved(); replay(); assert.deepEqual(saved(), once);
	});
	it('checks rescue affordability after an encounter defeat penalty and never charges a partial fee', () => {
		start(); store.change(user, a => {a.run.money = 2000; a.run.node.kind = 'trainer';}); cmd('battle');
		finish(false, r => {r.team[0].hp = 0;});
		assert.equal(saved().run.money, 1480); assert.equal(saved().run.team[0].hp, 0);
		assert.deepEqual(saved().run.emergencyRecovery, {cost: 1900, paid: false});
	});
	it('only prompts untouched accounts, persists acknowledgement, and does not mark story or adventure progress', () => {
		assert(needsOnboarding(saved())); engine.migrate(user); assert(needsOnboarding(saved()));
		const request = {id: randomUUID(), revision: saved().revision, action: 'onboarding'};
		engine.command(user, request); const after = saved(); engine.command(user, request);
		assert.deepEqual(saved(), after); assert(!needsOnboarding(saved()));
		assert(!saved().run && !saved().opening && !saved().adventures); assert(needsOnboarding(store.get('differentaccount')));
		for (const evidence of [{opening: {page: 1}}, {adventures: 1}, {captures: {magikarp: 1}}]) {
			assert(!needsOnboarding({...store.get('differentaccount'), ...evidence}));
		}
	});
	it('keeps travel committed even when returning to postcard selection', () => {
		start(); const run = saved().run;
		run.phase = 'event'; run.node.event = {id: 'travel', key: 'travel', stage: 'choice'};
		assert(!eventView(run).options.some(o => o.id === 'leave'));
		chooseEventOption(saved(), run, content(), () => 0, 'travel', 'postcard:alola');
		assert(!eventView(run).options.some(o => o.id === 'leave'));
		assert.throws(() => chooseEventOption(saved(), run, content(), () => 0, 'travel', 'leave'), /选项/);
		chooseEventOption(saved(), run, content(), () => 0, 'travel', 'back');
		assert(!eventView(run).options.some(o => o.id === 'leave'));
	});
	it('keeps the ordinary wild bonus separate from elite, event, capture EXP and reserve eligibility', () => {
		for (const participated of [true, false]) {
			const base = experienceYield(100, 15, 15, participated);
			assert.equal(towerExperience(100, 15, 15, participated, 25), base);
			assert.equal(towerExperience(100, 15, 15, participated, 25, true), Math.floor(base * 1.25));
		}
	});
});

describe('Fantasy Rogue saved route guarantees and anti-clumping', () => {
	const pool = ['wild', 'elite', 'trainer', 'event', 'reward', 'trade'].map(kind => ({id: kind, kind, name: kind,
		encounters: [], reward: {money: 0, items: {}}, ...(kind === 'trade' ? {trade: {kind: 'candy', stock: [], purchases: 0}} : {})}));
	it('honors both quests and elite pity without forcing a first trade', () => {
		const rng = new PRNG([1, 20, 17, 26]);
		const run = {floor: 18, blessings: {owned: [{family: 'battletask'}, {family: 'eventtask'}]},
			routeHistory: {floor: 17, factors: {trade: .15}, tradeSeen: false, eliteMisses: 20}};
		let choices = rollRoutes(run, pool, n => rng.random(n));
		assert.deepEqual(choices.map(n => n.kind).sort(), ['elite', 'event', 'wild']);
		assert(!run.routeHistory.tradeSeen);
	});
	it('allows late first trades, mixes route colors and preserves elite pity outside fixed floors', () => {
		let lateTrades = 0;
		for (let seed = 0; seed < 200; seed++) {
			const rng = new PRNG([seed, 9, 18, 30]), run = {floor: 1}; let firstTrade = 0, gap = 0;
			for (let floor = 1; floor <= 200; floor++) {
				if (fixedFloor(floor)) continue;
				run.floor = floor; const choices = rollRoutes(run, pool, n => rng.random(n));
				assert.equal(choices.length, 3); assert.equal(new Set(choices.map(n => n.id)).size, 3);
				const reds = choices.filter(n => ['wild', 'elite', 'trainer'].includes(n.kind)).length;
				assert(reds > 0 && reds < 3);
				if (choices.some(n => n.kind === 'trade')) firstTrade ||= floor;
				gap = choices.some(n => n.kind === 'elite') ? 0 : gap + 1;
				assert(gap < ELITE_PITY_ROOMS);
			}
			if (firstTrade > 18) lateTrades++;
		}
		assert(lateTrades > 0);
	});
	it('does not change the roll based on whether a trade has already appeared', () => {
		for (const floor of [18, 21, 41, 101]) {
			const run = {floor, routeHistory: {floor: floor - 1, factors: {}, tradeSeen: false, eliteMisses: 0}};
			const seen = structuredClone(run); seen.routeHistory.tradeSeen = true;
			const rng1 = new PRNG([1, 18, 10, 26]), rng2 = new PRNG([1, 18, 10, 26]);
			assert.deepEqual(rollRoutes(run, pool, n => rng1.random(n)), rollRoutes(seen, pool, n => rng2.random(n)));
		}
	});
	it('decays elite/trade more than wild/event and recovers unused weights towards their base', () => {
		const run = {floor: 1}; rollRoutes(run, pool, () => 0);
		assert(ROUTE_RETENTION.elite < ROUTE_RETENTION.wild && ROUTE_RETENTION.trade < ROUTE_RETENTION.event);
		run.routeHistory.factors.trade = .2; run.routeHistory.tradeSeen = true; run.floor = 2;
		rollRoutes(run, pool.filter(n => n.kind !== 'trade'), () => 0);
		assert.equal(run.routeHistory.factors.trade, .6);
		run.floor = 4; rollRoutes(run, pool.filter(n => n.kind !== 'trade'), () => 0);
		assert.equal(run.routeHistory.factors.trade, .9);
	});
	it('does not reroll current choices or advance penalties when reloading a real save', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, createPreviewContent(), () => 0), user = 'routesave';
			require('../fixtures/fantasy-rogue').commandAfterOpening(engine, user, {id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur']});
			const before = store.get(user).run;
			for (let i = 0; i < 5; i++) engine.migrate(user);
			assert.deepEqual(store.get(user).run.choices, before.choices);
			assert.deepEqual(store.get(user).run.routeHistory, before.routeHistory);
		} finally {store.close();}
	});
});
