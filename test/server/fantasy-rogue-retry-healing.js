'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { planRetryHealing, retryHealingView } = require('../../dist/server/fantasy-rogue/retry-healing');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue medicine-backed rematch', () => {
	let store, engine;
	const user = 'retryhealing';
	const saved = () => store.get(user);
	const cmd = (action, extra = {}) => engine.command(user, { id: randomUUID(), revision: saved().revision, action, ...extra });
	beforeEach(() => {
		store = new RogueStore(':memory:');
		const data = content();
		data.items.push({ id: 'potion', name: '伤药', kind: 'heal', amount: 20, price: 150 },
			{ id: 'paralyzeheal', name: '解麻药', kind: 'cure', cureStatuses: ['par'], price: 100 },
			{ id: 'antidote', name: '解毒药', kind: 'cure', cureStatuses: ['psn', 'tox'], price: 100 },
			{ id: 'fullheal', name: '万灵药', kind: 'cure', price: 400 });
		engine = new RogueEngine(store, data, () => 0);
		cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'grass' });
		store.change(user, a => {
			const mon = a.run.team[0]; mon.maxhp = 100; mon.hp = 100;
			a.run.team.push({ ...structuredClone(mon), id: 'second' });
			a.run.bag = { potion: 10, paralyzeheal: 1, pokeball: 3 };
		});
	});
	afterEach(() => store.close());
	function retreat(edit = () => {}) {
		cmd('battle'); const run = saved().run;
		const result = { encounterId: run.battle.encounterId, won: false, team: run.team, bag: run.bag };
		result.team[0].hp = 40; result.team[0].pp[0].pp = 2;
		result.team[1].hp = 80; result.team[1].status = 'par'; result.bag.pokeball--;
		edit(result); cmd('rematch'); engine.settle(user, run.battle.token, result);
		return { token: run.battle.token, result };
	}
	it('quotes actual settled losses without spending, then heals and starts the same encounter exactly once', () => {
		const { token, result } = retreat(), before = saved();
		const quote = retryHealingView(before.run, engine.content);
		assert.deepEqual(quote.items.map(i => [i.id, i.count]).sort(), [['paralyzeheal', 1], ['potion', 4]]);
		assert.equal(quote.insufficientHP, false); assert.deepEqual(saved(), before);
		assert.equal(before.run.bag.pokeball, 2); assert.equal(before.run.money, 100);
		assert.equal(before.points, 20); assert.equal(before.run.encounter, 0);
		const request = { id: randomUUID(), revision: before.revision, action: 'retryheal', value: quote.key };
		engine.command(user, request); const after = saved();
		assert.equal(after.run.phase, 'battle'); assert.equal(after.run.battle.encounterId, result.encounterId);
		assert(after.run.team.every(mon => mon.hp === mon.maxhp && !mon.status));
		assert.equal(after.run.team[0].pp[0].pp, 2); assert.equal(after.run.bag.potion, 6);
		assert.equal(after.run.bag.paralyzeheal, 0); assert(!after.run.retryHealing);
		engine.command(user, request); engine.settle(user, token, result);
		assert.deepEqual(saved(), after);
	});
	it('warns about missing cures, heals HP and preserves uncured statuses and unrelated medicine', () => {
		store.change(user, a => { delete a.run.bag.paralyzeheal; a.run.bag.antidote = 2; });
		retreat(); const quote = retryHealingView(saved().run, engine.content);
		assert.equal(quote.missingCures[0].id, 'second'); assert.deepEqual(quote.missingCures[0].statuses, ['par']);
		cmd('retryheal', { value: quote.key }); const run = saved().run;
		assert.equal(run.phase, 'battle'); assert.equal(run.team[1].hp, 100);
		assert.equal(run.team[1].status, 'par'); assert.equal(run.bag.antidote, 2);
	});
	it('requires player priority when supplies cannot fully heal, then restarts as soon as medicine is exhausted', () => {
		store.change(user, a => { a.run.bag = { potion: 2 }; });
		retreat(r => { r.team[1].status = ''; });
		const before = saved(), quote = retryHealingView(before.run, engine.content);
		assert(quote.insufficientHP);
		assert.throws(() => cmd('retryheal', { value: quote.key }), /选择/); assert.deepEqual(saved(), before);
		cmd('retryheal', { value: quote.key, member: 'second' });
		const partial = saved().run; assert.equal(partial.team[1].hp, 100); assert.equal(partial.bag.potion, 1);
		assert.notEqual(partial.retryHealing.key, quote.key);
		assert(retryHealingView(partial, engine.content).members.find(m => m.id === 'second').disabled);
		assert.throws(() => cmd('retryheal', { value: quote.key, member: partial.team[0].id }), /变化/);
		cmd('retryheal', { value: partial.retryHealing.key, member: partial.team[0].id });
		const run = saved().run;
		assert.equal(run.phase, 'battle'); assert.equal(run.team[0].hp, 60); assert.equal(run.bag.potion, 0);
	});
	it('can cancel without using medicine, or confirm a medicine-free rematch', () => {
		retreat(); const before = saved().run;
		cmd('retrycancel', { value: before.retryHealing.key });
		assert.deepEqual(saved().run.bag, before.bag); assert.deepEqual(saved().run.team, before.team);
		assert.equal(saved().run.phase, 'ready'); assert(!saved().run.retryHealing);
		store.change(user, a => { a.run.bag = {}; }); retreat();
		cmd('retryheal', { value: saved().run.retryHealing.key });
		assert.equal(saved().run.phase, 'battle'); assert.equal(saved().run.team[0].hp, 40);
	});
	it('revives ordinary fainted members using actual items but never revives Nuzlocke deaths or eggs', () => {
		store.change(user, a => { a.run.bag.revive = 2; });
		retreat(r => { r.team[0].hp = 0; });
		let run = saved().run;
		assert.equal(retryHealingView(run, engine.content).items.find(i => i.id === 'revive').count, 1);
		cmd('retryheal', { value: run.retryHealing.key }); assert.equal(saved().run.team[0].hp, 100);
		run = saved().run; run.team[0].hp = 0; run.team[0].nuzlockeDead = true;
		run.team[1].hp = 0; run.team[1].egg = { species: 'Bulbasaur' };
		const plan = planRetryHealing(run, engine.content);
		assert.deepEqual(plan.used, {}); assert(plan.team.every(mon => mon.hp === 0));
	});
	it('cures multiple statuses using matching medicine and keeps the all-status cure for the next partner', () => {
		const run = saved().run;
		run.team[0].status = 'par'; run.team[0].statuses = { par: {}, tox: {} };
		run.team[1].status = 'frz'; run.bag = { paralyzeheal: 1, antidote: 1, fullheal: 1 };
		const plan = planRetryHealing(run, engine.content);
		assert(plan.complete); assert.deepEqual(plan.used, { paralyzeheal: 1, antidote: 1, fullheal: 1 });
	});
	it('keeps Nuzlocke deaths excluded across actual retreat settlement and rematch', () => {
		store.change(user, a => {
			a.run.nuzlocke = { version: 1, encounters: {}, dead: [] }; a.run.bag.revive = 3;
		});
		retreat(r => { r.team[0].hp = 0; });
		const before = saved().run, quote = retryHealingView(before, engine.content);
		assert(before.team[0].nuzlockeDead); assert(quote.members[0].disabled);
		assert(!quote.items.some(item => item.id === 'revive'));
		cmd('retryheal', { value: quote.key }); const run = saved().run;
		assert.equal(run.phase, 'battle'); assert.equal(run.team[0].hp, 0); assert.equal(run.bag.revive, 3);
		assert(engine.battleState(user).team.every(mon => mon.id !== run.team[0].id));
	});
	it('allows pending move confirmation before applying the medicine quote', () => {
		retreat(); store.change(user, a => { a.run.pendingMoves = [{ member: a.run.team[0].id, move: 'growl' }]; });
		const before = saved().run;
		assert.throws(() => cmd('retryheal', { value: before.retryHealing.key }), /学习|结算/);
		cmd('learn', { member: before.team[0].id, value: 'skip' });
		cmd('retryheal', { value: saved().run.retryHealing.key }); assert.equal(saved().run.phase, 'battle');
	});
	it('persists confirmation across reloads and rolls back medicine if the encounter changed', () => {
		retreat(); const before = saved();
		engine = new RogueEngine(store, engine.content, () => 0); engine.migrate(user);
		assert.deepEqual(saved().run.retryHealing, before.run.retryHealing);
		assert.deepEqual(saved().run.team, before.run.team); assert.deepEqual(saved().run.bag, before.run.bag);
		store.change(user, a => { a.run.retryHealing.encounterId = 'stale-opponent'; });
		const stale = saved();
		assert.throws(() => cmd('retryheal', { value: stale.run.retryHealing.key }), /对手已变化/);
		assert.deepEqual(saved(), stale);
	});
	for (const kind of ['wild', 'boss', 'event', 'challenge', 'continuous', 'god']) {
		it(`retries the same ${kind} battle without advancing the floor or awarding loot`, () => {
			store.change(user, a => {
				const r = a.run;
				if (kind === 'boss') r.node.kind = 'boss';
				if (kind === 'event') r.node.event = { id: 'test', key: 'test', stage: 'battle' };
				if (kind === 'challenge') r.node.challenge = { id: 'test', key: 'test', stage: 'battle' };
				if (kind === 'continuous') { r.node.noHealing = true; r.encounter = 1; }
				if (kind === 'god') r.postgame = { stage: 'battle', before: structuredClone(r), node: structuredClone(r.node), encounter: r.encounter };
			});
			const { result } = retreat(), r = saved().run;
			cmd('retryheal', { value: r.retryHealing.key }); const after = saved();
			assert.equal(after.run.battle.encounterId, result.encounterId); assert.equal(after.run.floor, r.floor);
			assert.equal(after.run.money, r.money); assert.equal(after.points, 20);
			assert.equal(after.run.team[0].pp[0].pp, 2);
		});
	}
});
