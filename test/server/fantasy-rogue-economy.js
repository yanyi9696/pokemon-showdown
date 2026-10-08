'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { LOOT_STAGES, TREASURES, rollWildLoot, prepareEconomy, shopAvailable } = require('../../dist/server/fantasy-rogue/economy');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');

describe('Fantasy Rogue economy', () => {
	let store, engine;
	const user = 'economytester';
	const account = () => store.get(user);
	const cmd = (action, details = {}) => engine.command(user, { id: randomUUID(), revision: account().revision, action, ...details });
	function floor(n, route) {
		store.change(user, saved => {
			const run = saved.run;
			run.floor = n; run.phase = 'choose';
			run.encounter = 0; run.attempt = 0;
			delete run.node; delete run.choices; delete run.battle;
			run.checkpoint = structuredClone({ team: run.team, bag: run.bag, money: run.money });
		});
		cmd('select', { value: route || (n % 10 === 9 ? 'center' : n % 10 === 0 ? 'boss' : 'wild0') });
	}
	function fight(won = true, extra = {}) {
		cmd('battle');
		const run = account().run;
		const result = { encounterId: run.battle.encounterId, won, team: run.team, bag: run.bag, ...extra };
		engine.settle(user, run.battle.token, result);
		return { token: run.battle.token, result };
	}
	beforeEach(() => {
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, createPreviewContent(), max => Math.min(1, max - 1));
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());
	it('increases count and high-value probability while preserving every early rare drop', () => {
		let previousValue = 0, previousRare = 0;
		LOOT_STAGES.forEach((stage, i) => {
			const sum = stage.weights.reduce((a, b) => a + b, 0);
			assert(stage.weights.every(n => n > 0));
			const expected = stage.weights.reduce((total, weight, j) => total + weight * TREASURES[j].sellPrice, 0) / sum;
			const rare = stage.weights.reduce((total, weight, j) => total + (TREASURES[j].sellPrice >= 6000 ? weight : 0), 0) / sum;
			assert(expected > previousValue && rare > previousRare);
			previousValue = expected; previousRare = rare;
			assert.equal(Object.values(rollWildLoot(i * 40 + 1, () => 0)).reduce((a, b) => a + b), stage.min);
			const rareDrop = rollWildLoot(i * 40 + 40, max => max - 1);
			assert.equal(rareDrop.bignugget, stage.max);
		});
	});
	it('pays wild loot per completed battle, persists route rolls, and never pays the floor a second time', () => {
		const choices = account().run.choices;
		engine.migrate(user);
		assert.deepEqual(account().run.choices, choices);
		cmd('select', { value: 'wild0' });
		const initial = account().run;
		assert.equal(initial.node.reward.money, 0);
		for (let i = 0; i < 3; i++) {
			const { token, result } = fight();
			const paid = account();
			assert.equal(paid.run.bag.tinymushroom, i + 1);
			assert.equal(paid.run.money, initial.money);
			assert.equal(paid.run.lastReward.encounter, i + 1);
			engine.settle(user, token, result);
			assert.deepEqual(account(), paid);
		}
		assert.equal(account().run.floor, 2);
		assert.equal(account().points, 0);
	});
	it('gives captured wild opponents the same loot and preserves earlier wins on defeat or retreat', () => {
		cmd('select', { value: 'wild0' });
		cmd('battle');
		const run = account().run;
		const captured = createRoguePokemon(run.node.encounters[0].team[0], run.boosts, run.battle.encounterId);
		engine.settle(user, run.battle.token, { won: true, encounterId: run.battle.encounterId, team: run.team, bag: run.bag, captured });
		assert.equal(account().run.bag.tinymushroom, 1);
		fight(false);
		assert.equal(account().run.bag.tinymushroom, 1);
		assert.equal(account().run.encounter, 1);
		cmd('battle'); cmd('retreat');
		const lost = account().run;
		engine.settle(user, lost.battle.token, { won: false, encounterId: lost.battle.encounterId, team: lost.team, bag: lost.bag });
		assert.equal(account().run.bag.tinymushroom, 1);
		fight();
		assert.equal(account().run.bag.tinymushroom, 2);
	});
	it('rolls back continuous-challenge loot with inventory and reuses the same drop on retry', () => {
		cmd('select', { value: 'wild0' });
		store.change(user, saved => { saved.run.node.noHealing = true; });
		const original = account().run;
		fight();
		const fainted = structuredClone(account().run.team); fainted.forEach(mon => { mon.hp = 0; });
		fight(false, { team: fainted });
		assert.equal(account().run.phase, 'failed');
		cmd('retry');
		assert.deepEqual(account().run.bag, original.checkpoint.bag);
		assert.deepEqual(account().run.node.wildLoot, original.node.wildLoot);
		assert(!account().run.lastReward);
		fight(); assert.equal(account().run.bag.tinymushroom, 1);
	});
	it('pays trainer prize money only, but trainerless Fantasy Bosses drop treasures and a growth point', () => {
		floor(20);
		const before = account().run;
		assert(!before.node.wildLoot);
		assert.deepEqual(before.node.reward.items, {});
		fight();
		assert.equal(account().run.money, before.money + 1600);
		assert.deepEqual(account().run.bag, before.bag);
		assert.equal(account().points, 1);
		floor(30);
		const boss = account().run;
		fight();
		assert.equal(account().run.money, boss.money);
		assert.equal(account().run.bag.tinymushroom, 1);
		assert.equal(account().points, 2);
		assert.equal(account().run.lastReward.points, 1);
		const trainer = structuredClone(engine.content.floors[7].find(node => node.kind === 'trainer'));
		prepareEconomy(trainer, 7, () => 0);
		assert(!trainer.wildLoot && trainer.reward.money > 0);
	});
	it('keeps a selected legacy encounter and its already-promised reward unchanged', () => {
		const legacy = structuredClone(engine.content.floors[1][0]);
		store.change(user, saved => {
			saved.run.node = legacy; saved.run.phase = 'ready'; saved.run.contentVersion = 'preview-2026-10-v6';
			delete saved.run.choices;
		});
		engine.migrate(user);
		assert.deepEqual(account().run.node, legacy);
	});
	it('rejects locked merchandise and candy purchases on the server, and unlocks each threshold exactly', () => {
		floor(9);
		store.change(user, saved => { saved.run.money = 999999; });
		cmd('buy', { value: 'potion' });
		for (const id of ['greatball', 'healthfeather', 'protein', 'expcandyxs', 'tinymushroom']) {
			const before = account();
			assert.throws(() => cmd('buy', { value: id }), /未解锁|不在商店/);
			assert.deepEqual(account(), before);
		}
		for (const item of engine.content.items) {
			if (typeof item.shopFloor !== 'number') continue;
			assert(!shopAvailable(item, item.shopFloor - 1));
			assert(shopAvailable(item, item.shopFloor));
		}
		floor(19); cmd('buy', { value: 'healthfeather' });
		assert.equal(account().run.bag.healthfeather, 1);
		floor(89); cmd('buy', { value: 'protein' });
		assert.equal(account().run.bag.protein, 1);
	});
	it('exchanges a whole kind or all treasures only in shops, with atomic idempotent receipts', () => {
		store.change(user, saved => { Object.assign(saved.run.bag, { tinymushroom: 2, bignugget: 1 }); });
		assert.throws(() => cmd('sell', { value: 'all' }), /只能在商店/);
		floor(9);
		assert.throws(() => cmd('sell', { value: 'potion' }), /没有可兑换/);
		const before = account();
		const request = { id: randomUUID(), revision: before.revision, action: 'sell', value: 'tinymushroom' };
		engine.command(user, request);
		const sold = account();
		assert.equal(sold.run.money, before.run.money + 500);
		assert.equal(sold.run.bag.tinymushroom, 0);
		assert.equal(sold.run.bag.bignugget, 1);
		engine.command(user, request); assert.deepEqual(account(), sold);
		cmd('sell', { value: 'all' });
		assert.equal(account().run.money, before.run.money + 20500);
		assert.equal(account().run.bag.potion, before.run.bag.potion);
		assert.throws(() => cmd('sell', { value: 'all' }), /没有可兑换/);
	});
	it('caps feather/vitamin gains without spending ineffective items or restoring HP and PP', () => {
		store.change(user, saved => {
			const mon = saved.run.team[0];
			mon.set.evs.atk = 250; mon.set.evs.def = 252; mon.set.evs.spe = 5;
			mon.hp = 0; mon.pp[0].pp = 1; mon.evRespec = { total: 507 };
			Object.assign(saved.run.bag, { protein: 2, swiftfeather: 2 });
		});
		const member = account().run.team[0].id;
		cmd('use', { value: 'protein', member });
		const mon = account().run.team[0];
		assert.equal(mon.set.evs.atk, 252); assert.equal(mon.hp, 0); assert.equal(mon.pp[0].pp, 1);
		assert.equal(mon.evRespec.total, 509);
		assert.throws(() => cmd('use', { value: 'protein', member }), /上限/);
		assert.equal(account().run.bag.protein, 1);
		cmd('use', { value: 'swiftfeather', member });
		assert.equal(account().run.team[0].set.evs.spe, 6);
		assert.throws(() => cmd('use', { value: 'swiftfeather', member }), /上限/);
		assert.equal(account().run.bag.swiftfeather, 1);
	});
});
