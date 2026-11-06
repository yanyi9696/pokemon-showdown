'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { releaseReward, releaseReason, releasePartyMember } = require('../../dist/server/fantasy-rogue/release');
const { experienceAtLevel } = require('../../dist/sim/fantasy-rogue-rules');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { content, set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue confirmed releases and admission', () => {
	let store, engine;
	const user = 'releaseqa';
	const account = () => store.get(user);
	const cmd = (action, extra = {}) => commandAfterOpening(engine, user, {
		id: randomUUID(), revision: account().revision, action, ...extra,
	});
	const mon = (level = 20) => createRoguePokemon({ ...set(), level }, stats(0));
	beforeEach(() => {
		store = new RogueStore(':memory:'); const data = content(); data.allowReplacement = true;
		engine = new RogueEngine(store, data, () => 0);
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());
	it('keeps four releases under every growth curve, with exact candy denominations and no declining level rewards', () => {
		let previous = 0;
		for (let level = 1; level <= 220; level++) {
			const reward = releaseReward({ set: { level } });
			assert(reward.experience >= previous, `nondecreasing level ${level}`);
			previous = reward.experience;
			for (let growth = 1; growth <= 6; growth++) {
				assert(reward.experience * 4 <= experienceAtLevel(growth, level) -
				experienceAtLevel(growth, Math.max(1, level - 20)), `cap ${level}/${growth}`);
			}
			const amounts = { expcandyxs: 100, expcandys: 800, expcandym: 3000, expcandyl: 10000, expcandyxl: 30000 };
			assert.equal(Object.entries(reward.items).reduce((sum, [id, count]) => sum + amounts[id] * count, 0), reward.experience);
		}
		assert.equal(releaseReward({ set: { level: 5 } }).experience, 0);
		assert.equal(releaseReward({ set: { level: 20 } }).experience, 1300);
		assert.equal(releaseReward({ set: { level: 50 } }).experience, 19600);
		assert.equal(releaseReward({ set: { level: 100 }, egg: {} }).experience, 0);
	});
	it('requires confirmation and pays exactly once while keeping carried equipment and permanent unlocks', () => {
		const extra = mon(); extra.set.item = 'leftovers'; extra.emblem = 'flameemblem';
		store.change(user, a => { a.run.team.push(extra); });
		const before = structuredClone(account());
		assert.throws(() => cmd('release', { member: extra.id }), /确认放生/);
		assert.deepEqual(account(), before);
		const request = { id: randomUUID(), revision: account().revision, action: 'release', member: extra.id, confirmed: true };
		engine.command(user, request);
		const saved = account();
		assert(!saved.run.team.some(p => p.id === extra.id));
		assert.equal(saved.run.bag.leftovers, (before.run.bag.leftovers || 0) + 1);
		assert.equal(saved.run.bag.flameemblem, 1);
		for (const [id, count] of Object.entries(releaseReward(extra).items)) assert.equal(saved.run.bag[id], (before.run.bag[id] || 0) + count);
		engine.command(user, request);
		assert.deepEqual(account(), saved);
		assert.throws(() => cmd('release', { member: extra.id, confirmed: true }), /不在队伍/);
		assert.deepEqual(account().unlocked, before.unlocked);
	});
	it('blocks the last usable partner, active battles, fused members and unresolved event targets', () => {
		const run = account().run, only = run.team[0], incoming = mon();
		assert.match(releaseReason(run, only), /至少需要/);
		assert.equal(releaseReason(run, only, incoming), '');
		only.fusion = {}; assert.match(releaseReason(run, only, incoming), /解除融合/); delete only.fusion;
		run.phase = 'battle'; assert.match(releaseReason(run, only, incoming), /结束当前战斗/);
		run.phase = 'event'; run.node = { event: { activity: { member: only.id } } };
		assert.match(releaseReason(run, only, incoming), /正在参与/);
	});
	it('keeps full-party captures out of the box, and admits sequential captures only against the expected pending ID', () => {
		store.change(user, a => { while (a.run.team.length < 6) a.run.team.push(mon()); a.run.box = []; });
		cmd('select', { value: 'grass' });
		store.change(user, a => { a.run.node.encounters[0].team = [20, 30].map(level => set('Magikarp', 'Swift Swim', level, ['Splash'])); });
		cmd('battle');
		const run = account().run;
		const [first, second] = run.node.encounters[0].team.map(teamSet => createRoguePokemon(teamSet, run.boosts));
		first.id = run.battle.encounterId + ':foe:0'; second.id = run.battle.encounterId + ':foe:1';
		engine.settle(user, run.battle.token, { encounterId: run.battle.encounterId, won: true,
			team: run.team, bag: run.bag, captures: [first, second] });
		assert.equal(account().run.pendingCapture.id, first.id);
		assert.equal(account().run.box.length, 0);
		const before = structuredClone(account());
		assert.throws(() => cmd('replace', { value: run.team[0].id, member: 'stale', confirmed: true }), /已变化/);
		assert.deepEqual(account(), before);
		cmd('replace', { value: run.team[0].id, member: first.id, confirmed: true });
		assert.equal(account().run.team.length, 6); assert.equal(account().run.team[0].id, first.id);
		assert.equal(account().run.pendingCapture.id, second.id);
		const paid = structuredClone(account());
		assert.throws(() => cmd('replace', { value: run.team[1].id, member: first.id, confirmed: true }), /已变化/);
		assert.deepEqual(account(), paid);
		cmd('replace', { value: 'release', member: second.id });
		assert(!account().run.pendingCapture);
	});
	it('removes obsolete move prompts only for the released member and never grants XP for an unhatched egg', () => {
		const run = account().run, egg = mon(); egg.egg = {};
		run.team.push(egg);
		assert.equal(releasePartyMember(run, egg.id, true).experience, 0);
		const old = run.team[0], incoming = mon();
		run.pendingMoves = [{ member: old.id, move: 'tackle' }, { member: 'other', move: 'growl' }];
		releasePartyMember(run, old.id, true, incoming);
		assert.deepEqual(run.pendingMoves, [{ member: 'other', move: 'growl' }]);
	});
	it('allows confirmed release of a dead Nuzlocke partner for a gift without allowing dead-member event exchanges', () => {
		cmd('select', { value: 'grass' });
		engine.content.blessings = true;
		const dead = mon(20), incoming = mon(30), rewardID = randomUUID();
		dead.hp = 0; dead.nuzlockeDead = true;
		store.change(user, a => {
			a.run.nuzlocke = { version: 1, dead: [dead.id], encounters: {} };
			a.run.team.push(dead); a.run.phase = 'blessing';
			normalizeBlessings(a.run);
			a.run.blessings.pending = [{ id: rewardID, kind: 'gift', title: '测试赠送', pokemon: incoming }];
		});
		assert.throws(() => cmd('blessingreward', { member: rewardID, value: dead.id }), /永久死亡/);
		cmd('blessingreward', { member: rewardID, value: dead.id, confirmed: true });
		assert(account().run.team.some(p => p.id === incoming.id));
		assert(!account().run.team.some(p => p.id === dead.id));
		assert(account().run.nuzlocke.dead.includes(dead.id), 'the permanent death ledger is retained');
		assert.equal(account().run.bag.expcandys, 1);
	});
});
