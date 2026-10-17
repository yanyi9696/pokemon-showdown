'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {Battle} = require('../../dist/sim/battle');
const {rogueBattleResult} = require('../../dist/sim/fantasy-rogue');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine, createRoguePokemon} = require('../../dist/server/fantasy-rogue/engine');
const {normalizeBlessings, syncBlessingParty} = require('../../dist/server/fantasy-rogue/blessings');
const {content, set, stats, commandAfterOpening} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue escaped combat cannot farm permanent stacks', () => {
	let store, engine, battle;
	const user = 'escapestacks';
	const saved = () => store.get(user);
	const cmd = (action, data = {}) => commandAfterOpening(engine, user,
		{id: randomUUID(), revision: saved().revision, action, ...data});
	beforeEach(() => {
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, {...content(), blessings: true}, () => 0);
		cmd('start', {starters: ['bulbasaur']}); cmd('select', {value: 'grass'});
		store.change(user, a => {
			const run = a.run;
			run.team = [createRoguePokemon(set('Bulbasaur', 'Overgrow', 20, ['Tackle', 'Swords Dance']), stats(0), 'hero')];
			const state = normalizeBlessings(run);
			state.owned = ['hpgrowth', 'insight', 'psychic', 'starquest'].map(id => ({id, family: id,
				tier: id === 'starquest' ? 'gold' : 'prismatic', floor: 1,
				...(id === 'starquest' ? {target: 'hero', progress: 9, milestones: []} : {})}));
			state.swordUses = 12; state.psychic = 80;
			run.team[0].bonusHP = 8; run.team[0].insight = {points: 87, gain: 2};
			syncBlessingParty(run); run.team[0].hp = run.team[0].maxhp;
			run.team[0].set.item = 'Oran Berry';
		});
	});
	afterEach(() => { battle?.destroy(); battle = undefined; store.close(); });
	function startNative() {
		cmd('battle');
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: engine.battleState(user),
			p1: {name: 'Human', team: saved().run.team.map(mon => mon.set)},
			p2: {name: 'Wild', team: [set('Magikarp', 'Swift Swim', 1, ['Splash']), set('Magikarp', 'Swift Swim', 1, ['Splash'])]},
		});
		battle.makeChoices('team 1', 'team 12');
	}
	for (const escaped of [true, false]) it(`${escaped ? 'discards' : 'commits'} real KO, max HP, insight and star progress on ${escaped ? 'escape' : 'victory'}`, () => {
		const before = saved().run;
		startNative(); battle.makeChoices('move 1', 'move 1');
		const result = rogueBattleResult(battle);
		assert.equal(result.team[0].bonusHP, 10);
		assert.equal(result.blessingProgress.insight.hero.points, 89);
		assert.equal(result.blessingProgress.kos.length, 1);
		const ticket = saved().run.battle;
		if (escaped) cmd('retreat');
		result.won = true;
		engine.settle(user, ticket.token, result);
		const after = saved().run;
		assert.equal(after.team[0].bonusHP, escaped ? 8 : 10);
		assert.equal(after.team[0].insight.points, escaped ? 87 : 89);
		assert.equal(after.blessings.owned.find(b => b.family === 'starquest').progress, escaped ? 9 : 10);
		assert.equal(after.team[0].stars || 1, escaped ? 1 : 2);
		assert.equal(after.blessings.defeated.length, escaped ? 0 : 1);
		assert.equal(after.team[0].pp[0].pp, before.team[0].pp[0].pp - 1);
		if (escaped) {
			assert.equal(after.team[0].maxhp, before.team[0].maxhp);
			assert.equal(after.team[0].hp, before.team[0].hp);
			assert.equal(after.blessings.psychic, 80);
		}
	});
	it('repeated escapes restore spent or gained charge and revival counters while keeping HP, PP, status and consumable losses', () => {
		store.change(user, a => {
			a.run.growth = {offense: 800, defense: 400, experience: 500};
			a.run.team[0].training = {offense: 400, defense: 200}; syncBlessingParty(a.run);
		});
		const initial = saved().run;
		for (let attempt = 1; attempt <= 3; attempt++) {
			cmd('battle'); const run = saved().run, ticket = run.battle;
			const result = {encounterId: ticket.encounterId, won: false, team: run.team, bag: run.bag,
				blessingProgress: {kos: [{id: ticket.encounterId + ':foe:0', member: 'hero'}], swords: 5,
					insight: {hero: {points: 0, gain: 3}}, psychic: attempt === 1 ? 0 : 120, psychicLosses: ['loss']}};
			Object.assign(result.team[0], {bonusHP: 10, maxhp: run.team[0].maxhp + 2,
				hp: run.team[0].hp - 5 + 2, status: 'psn', statusState: {stage: 2}, statuses: {psn: {}}});
			result.team[0].pp[0].pp--; result.team[0].set.item = ''; result.bag.pokeball--;
			cmd('retreat'); engine.settle(user, ticket.token, result);
			const after = saved().run;
			assert.equal(after.team[0].hp, initial.team[0].hp - attempt * 5);
			assert.equal(after.team[0].maxhp, initial.team[0].maxhp);
			assert.equal(after.team[0].pp[0].pp, initial.team[0].pp[0].pp - attempt);
			assert.equal(after.team[0].status, 'psn'); assert.equal(after.team[0].set.item, '');
			assert.equal(after.bag.pokeball, initial.bag.pokeball - attempt);
			assert.deepEqual(after.team[0].insight, initial.team[0].insight);
			assert.deepEqual(after.team[0].training, initial.team[0].training);
			assert.deepEqual(after.growth, initial.growth);
			assert.equal(after.blessings.psychic, 80); assert.equal(after.blessings.swordUses, 12);
			assert.deepEqual(after.blessings.defeated, []); assert(!after.blessings.psychicLosses?.length);
			engine.settle(user, ticket.token, result); assert.deepEqual(saved().run, after);
			engine = new RogueEngine(store, {...content(), blessings: true}, () => 0);
		}
	});
	it('keeps faints and pre-battle paid revival progress; an escape is not a free revive', () => {
		store.change(user, a => {a.run.team[0].hp = 0; a.run.bag.revive = 1;});
		cmd('use', {member: 'hero', value: 'revive'});
		const before = saved().run;
		assert(before.team[0].insight.points > 87);
		cmd('battle'); const run = saved().run;
		cmd('retreat');
		run.team[0].hp = 0;
		engine.settle(user, run.battle.token, {encounterId: run.battle.encounterId, won: false, team: run.team, bag: run.bag,
			blessingProgress: {kos: [], swords: 1, insight: {hero: {points: 100, gain: 4}}}});
		assert.equal(saved().run.team[0].hp, 0); assert.equal(saved().run.bag.revive, 0);
		assert.deepEqual(saved().run.team[0].insight, before.team[0].insight);
	});
});
