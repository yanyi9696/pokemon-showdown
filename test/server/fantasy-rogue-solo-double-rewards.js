'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { awardBattleExperience } = require('../../dist/server/fantasy-rogue/battle-growth');
const { createRoguePokemon, initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { soloDoublesExperience, soloDoublesCoins } = require('../../dist/server/fantasy-rogue/solo-doubles-rewards');
const { TREASURES } = require('../../dist/server/fantasy-rogue/economy');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue solo doubles rewards', function () {
	this.timeout(20000);
	it('only compensates solo Latios, keeping rare items and other spirits unchanged', () => {
		const run = { spirit: 'latios', doubleBattle: true };
		const payout = { money: 101, items: { pearl: 2, masterball: 1, expcandyxl: 1 } };
		assert.equal(soloDoublesExperience(run), 1.35);
		assert.equal(soloDoublesCoins(run, payout, TREASURES), 325);
		assert.equal(soloDoublesCoins(run, payout, TREASURES, true), 0);
		assert.equal(soloDoublesExperience(run, true), 1);
		assert.equal(soloDoublesCoins({ ...run, spirit: 'kyurem' }, payout, TREASURES), 0);
		assert.equal(soloDoublesExperience({ ...run, doubleBattle: false }), 1);
		assert.deepEqual(payout.items, { pearl: 2, masterball: 1, expcandyxl: 1 });
	});
	it('applies real experience once and excludes cooperative payouts', () => {
		const mon = createRoguePokemon(set('Bulbasaur', 'Overgrow', 40), stats(0));
		initializeExperience(mon);
		const base = { spirit: 'latios', doubleBattle: true, floor: 80, team: [mon], boosts: stats(0),
			node: { kind: 'boss' }, notices: [] };
		const result = { encounterId: 'xp', defeated: [{ id: 'foe', species: 'Blissey', level: 40,
			eligible: [mon.id], participants: [mon.id] }] };
		const solo = structuredClone(base), coop = structuredClone(base), single = structuredClone(base);
		single.doubleBattle = false;
		awardBattleExperience(coop, result, true); awardBattleExperience(single, result);
		assert.deepEqual(coop.team, single.team);
		awardBattleExperience(solo, result);
		assert(solo.team[0].experience > coop.team[0].experience);
		const after = structuredClone(solo); awardBattleExperience(solo, result);
		assert.deepEqual(solo.team, after.team); assert.deepEqual(solo.experienceReceipts, after.experienceReceipts);
	});
	it('starts only Latios in doubles and settles coin bonuses once without duplicating loot', () => {
		const content = createPreviewContent(); content.blessings = false; content.events = false;
		content.rewardScenes = false; content.biomeEncounters = false; content.wildTreasures = false;
		const store = new RogueStore(':memory:'), user = 'latiosrewards';
		try {
			const engine = new RogueEngine(store, content, () => 0, true);
			const command = (action, extra = {}) => engine.command(user, {
				id: randomUUID(), revision: store.get(user).revision, action, ...extra,
			});
			command('start', { starters: ['bulbasaur'], useSpirit: true, testSpirit: 'latios', difficulty: 0 });
			assert.equal(store.get(user).run.doubleBattle, true);
			command('spiritack');
			store.change(user, a => {
				a.run.floor = 2; a.run.phase = 'ready'; a.run.encounter = 0;
				a.run.node = { id: 'qa', name: '双打奖励', kind: 'wild',
					encounters: [{ team: [set('Magikarp', 'Swift Swim', 5)], catchable: true }],
					wildLoot: [{ pearl: 2 }], reward: { money: 1000, items: { nugget: 1 } } };
			});
			command('battle'); const run = store.get(user).run;
			const result = { encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag };
			engine.settle(user, run.battle.token, result);
			const after = store.get(user);
			assert.equal(after.run.money - run.money, 2300);
			assert.equal(after.run.bag.pearl, 2); assert.equal(after.run.bag.nugget, 1);
			engine.settle(user, run.battle.token, result); assert.deepEqual(store.get(user), after);
		} finally { store.close(); }
	});
});
