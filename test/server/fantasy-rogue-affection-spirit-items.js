'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { content, set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { gainAffection, syncAffection, affectionFloor } = require('../../dist/server/fantasy-rogue/affection');
const { affectionThemeGift, AFFECTION_FANTASY_CHOICES } = require('../../dist/server/fantasy-rogue/affection-gifts');
const { beginSocialEvent, settleSocialEvent } = require('../../dist/server/fantasy-rogue/social-events');
const { chooseChallengePrize } = require('../../dist/server/fantasy-rogue/optional-challenges');
const { OPTIONAL_CHALLENGES } = require('../../dist/server/fantasy-rogue/challenge-data');
const { chooseCoopRival } = require('../../dist/server/fantasy-rogue/coop-rivals');
const { withSharedRewardRolls } = require('../../dist/server/fantasy-rogue/shared-reward-rolls');
const { convertSpiritItem } = require('../../dist/server/fantasy-rogue/spirits');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');

function run(score = 0, id = 'bea') {
	const result = { id: randomUUID(), contentVersion: 'test', floor: 81, phase: 'event', encounter: 0, attempt: 0,
		spirit: 'hoopagift', spiritVersion: 1, affectionVersion: 1, difficulty: 0, difficultyRulesVersion: 4,
		team: [createRoguePokemon(set(), stats(0))], boosts: stats(0), caught: [], startingSlots: 1, money: 100, bag: {},
		trainerBonds: { [id]: { score, gifts: [], pending: [] } },
		node: { id: 'bond', name: '相遇', kind: 'event', encounters: [], reward: { money: 0, items: {} } } };
	normalizeBlessings(result);
	return result;
}
function rewards(random = () => 0) {
	const data = content();
	data.items.push({ id: 'maxelixir', name: 'PP 全项大补剂', kind: 'ether', price: 0, shopFloor: false });
	return { content: data, random };
}
const noRoll = () => { throw new Error('unexpected reward draw'); };

describe('Fantasy Rogue Mew automatic affection gifts', () => {
	it('converts each newly owed milestone once and names the actual reward', () => {
		const r = run();
		gainAffection(r, 'bea', 100, 'first', rewards());
		assert.equal(r.bag.fantasypowerlens, 2);
		assert.equal(r.bag[affectionThemeGift('bea', 50).id], undefined);
		assert.equal(r.bag.choiceband, undefined);
		assert.deepEqual(r.trainerBonds.bea.gifts, [50, 100]);
		assert.deepEqual(r.trainerBonds.bea.pending, [50, 100]);
		assert.equal(r.bag.rarecandy, 2); assert.equal(r.bag.goldbottlecap, 1);
		assert.deepEqual(r.blessings.pending[0].options, AFFECTION_FANTASY_CHOICES);
		assert.equal(r.notices.filter(line => line.includes('梦幻的奇赠')).length, 2);
		assert(r.notices.some(line => line.includes('50') && !line.includes(affectionThemeGift('bea', 50).name)));
		const bag = structuredClone(r.bag), ledger = structuredClone(r.spiritConversions);
		gainAffection(r, 'bea', 100, 'first', rewards(noRoll));
		gainAffection(r, 'bea', 100, 'second', rewards(noRoll));
		assert.deepEqual(r.bag, bag); assert.deepEqual(r.spiritConversions, ledger);
	});
	it('records a failed conversion roll without losing the original gift', () => {
		const r = run();
		gainAffection(r, 'bea', 50, 'first', rewards(max => max - 1));
		const gift = affectionThemeGift('bea', 50).id;
		assert.equal(r.bag[gift], 1); assert.equal(r.spiritConversions['affection:bea:50'], gift);
		assert(!r.notices.some(line => line.includes('转换')));
	});
	it('does not roll other spirits or PP recovery gifts', () => {
		const r = run(); r.spirit = 'hooh';
		gainAffection(r, 'bea', 50, 'first', rewards(noRoll));
		assert.equal(r.bag[affectionThemeGift('bea', 50).id], 1); assert(!r.spiritConversions);
		const s = run(99, 'sada'); s.trainerBonds.sada.gifts = [50];
		gainAffection(s, 'sada', 1, 'last', rewards(noRoll));
		assert.equal(s.bag.maxelixir, 1); assert(!s.spiritConversions);
	});
	it('does not reroll or repay already-issued legacy milestones during synchronization', () => {
		const r = run(100); r.rival = { id: 'bea', completed: 8, lastFloor: 80, affection: 100 };
		r.trainerBonds.bea.gifts = [50, 100]; r.bag.choiceband = 1;
		syncAffection({ run: r }, undefined); syncAffection({ run: r }, rewards(noRoll));
		assert.deepEqual(r.bag, { choiceband: 1 }); assert(!r.spiritConversions);
		assert.deepEqual(r.trainerBonds.bea.pending, [100]);
	});
	it('keeps personal milestone draws separate from shared event item draws', () => {
		const a = run(), b = run(), common = new Map();
		withSharedRewardRolls(a, common, () => {
			gainAffection(a, 'bea', 100, 'first', rewards());
			assert.equal(convertSpiritItem(a, content(), 'choiceband', 'common', () => 1), 'choiceband');
		});
		withSharedRewardRolls(b, common, () => {
			gainAffection(b, 'bea', 100, 'first', rewards(max => max - 1));
			assert.equal(convertSpiritItem(b, content(), 'choiceband', 'common', noRoll), 'choiceband');
		});
		assert.equal(a.bag.fantasypowerlens, 2); assert.equal(b.bag.choiceband, 1);
		assert.equal(a.spiritConversions.common, b.spiritConversions.common);
	});
	it('wires per-floor gifts and suppresses duplicate floor processing', () => {
		const r = run(49); r.blessings.companions = [{ id: 'bea', preferences: 0 }];
		affectionFloor(r, () => 99, rewards());
		assert.equal(r.bag.fantasypowerlens, 1);
		affectionFloor(r, noRoll, rewards(noRoll));
		assert.equal(r.bag.fantasypowerlens, 1);
	});
	it('wires meeting and duel milestones through social events', () => {
		const r = run(48, 'brock');
		assert(beginSocialEvent(r, () => 0, 'brock', rewards()));
		assert.equal(r.bag.fantasypowerlens, 1);
		r.trainerBonds.brock.score = 96;
		settleSocialEvent(r, true, rewards());
		assert.equal(r.bag.fantasypowerlens, 2); assert.equal(r.bag.goldbottlecap, 1);
	});
	it('wires optional challenge relationship rewards without converting its candy', () => {
		const def = OPTIONAL_CHALLENGES.find(entry => entry.companions?.includes('palmer'));
		const r = run(46, 'palmer');
		r.node.challenge = { id: def.id, key: 'test-challenge', stage: 'won',
			prizes: [{ id: 'gift', name: '糖果', money: 0, items: { expcandyxs: 1 } }] };
		chooseChallengePrize(r, 'gift', rewards());
		assert.equal(r.bag.fantasypowerlens, 1); assert.equal(r.bag.expcandyxs, 1);
		assert.throws(() => chooseChallengePrize(r, 'gift', rewards(noRoll)), /胜利后/);
	});
	it('does not desynchronize common rival randomness when only one player reaches a milestone', () => {
		const runs = [run(49, 'nemona'), run(0, 'nemona')];
		for (const r of runs) {
			r.rival = { id: 'nemona', completed: 4, lastFloor: 65, affection: r.trainerBonds.nemona.score };
			r.node.event = { id: 'rivalstory', key: 'common-rival', stage: 'choice',
				rival: { chapter: 5, step: 'search', task: 'search', answer: 0, found: [] } };
		}
		chooseCoopRival(runs, content(), () => 0, 'search:0');
		assert.equal(runs[0].bag.fantasypowerlens, 4); assert.equal(runs[1].bag.fantasypowerlens, 3);
		assert.equal(runs[0].spiritConversions['affection:nemona:50'], 'fantasypowerlens');
		assert(!runs[1].spiritConversions['affection:nemona:50']);
		assert.equal(runs[0].rival.completed, 5); assert.equal(runs[1].rival.completed, 5);
		assert.equal(runs[0].node.event.key, runs[1].node.event.key);
	});

	describe('transactional legacy migration', () => {
		let store;
		beforeEach(() => { store = new RogueStore(':memory:'); });
		afterEach(() => { store.close(); });
		function seed() {
			store.change('bond-player', account => {
				account.run = run();
				account.run.rival = { id: 'bea', completed: 7, lastFloor: 80, affection: 0 };
			});
		}
		it('binds reward dependencies through the engine and migrates each gift exactly once', () => {
			new RogueEngine(store, content(), () => 0); seed();
			store.change('bond-player', account => { account.run.rival.completed = 8; });
			const saved = store.get('bond-player');
			assert.equal(saved.run.bag.fantasypowerlens, 2);
			new RogueEngine(store, content(), noRoll);
			store.change('bond-player', () => {});
			assert.deepEqual(store.get('bond-player').run.bag, saved.run.bag);
		});
		it('rolls back score, receipts and inventory when conversion fails', () => {
			new RogueEngine(store, content(), noRoll); seed();
			const saved = store.get('bond-player');
			assert.throws(() => store.change('bond-player', account => { account.run.rival.completed = 8; }), /unexpected/);
			assert.deepEqual(store.get('bond-player'), saved);
			new RogueEngine(store, content(), () => 0);
			store.change('bond-player', account => { account.run.rival.completed = 8; });
			assert.equal(store.get('bond-player').run.bag.fantasypowerlens, 2);
		});
		it('fails safely if a new Mew milestone lacks runtime content', () => {
			seed(); const saved = store.get('bond-player');
			assert.throws(() => store.change('bond-player', account => { account.run.rival.completed = 8; }), /缺少道具配置/);
			assert.deepEqual(store.get('bond-player'), saved);
		});
	});
});
