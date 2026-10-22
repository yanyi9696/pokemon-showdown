'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { Dex } = require('../../dist/sim/dex');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { createRoguePokemon, initializeExperience, gainExperience, evolveMember } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { recordClear } = require('../../dist/server/fantasy-rogue/legacy');
const { tradeKind, prepareTrade } = require('../../dist/server/fantasy-rogue/trading');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { chooseEventOption } = require('../../dist/server/fantasy-rogue/events');
const { personalGrowthAmount, grantPersonalGrowth, grantGrowth, growthOffers } = require('../../dist/server/fantasy-rogue/growth');
const { prepareRewardScene, rewardSceneView, rewardChoices, rewardExperience, rewardCandies, rewardMoney } = require('../../dist/server/fantasy-rogue/reward-scenes');
const { set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue permanent growth and peaceful reward scenes', function () {
	this.timeout(60000);
	let content, store, engine;
	const user = 'permanentgrowth';
	const account = () => store.get(user);
	const cmd = (action, data = {}) => commandAfterOpening(engine, user, { id: randomUUID(), revision: account().revision, action, ...data });
	before(() => { content = createPreviewContent(); });
	beforeEach(() => {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content, () => 0);
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());
	function enter(floor = 21, kind = 'reward', scene = 'sketch') {
		store.change(user, a => {
			const r = a.run;
			r.floor = floor; r.phase = 'choose'; r.money = 40000;
			r.choices = [{ id: 'testreward', kind, name: '测试奖励', encounters: [], reward: { money: 0, items: {} },
				...(kind === 'trade' ? { trade: { kind: 'growth', stock: [], purchases: 0 } } : {}) }];
		});
		cmd('select', { value: 'testreward' });
		if (kind === 'reward') store.change(user, a => { a.run.node.rewardScene.id = scene; a.run.node.rewardScene.type = scene === 'research' ? 'Normal' : 'Grass'; });
	}
	it('creates six noncombat scenes, saves preferences and avoids immediately repeating a scene', () => {
		const ids = new Set();
		for (let i = 0; i < 6; i++) {
			const run = account().run; run.node = { kind: 'reward', encounters: [], reward: { money: 1, items: {} } };
			prepareRewardScene(run, max => max === 100 ? 99 : Math.min(i, max - 1)); ids.add(run.node.rewardScene.id);
			const saved = structuredClone(run.node.rewardScene);
			prepareRewardScene(run, () => { throw Error('must not reroll'); });
			assert.deepEqual(run.node.rewardScene, saved); assert.equal(run.node.encounters.length, 0);
			run.node = { kind: 'reward', encounters: [], reward: { money: 1, items: {} } }; prepareRewardScene(run, () => 0);
			assert.notEqual(run.node.rewardScene.id, saved.id);
		}
		assert.equal(ids.size, 5);
		const run = account().run; run.node = {kind: 'reward', encounters: [], reward: {money: 0, items: {}}};
		delete run.rewardHistory; prepareRewardScene(run, () => 0); ids.add(run.node.rewardScene.id);
		assert.equal(ids.size, 6);
	});
	for (const scene of ['sketch', 'research', 'picnic', 'coach']) it(`upgrades ${scene} only after a valid demonstration and pays once`, () => {
		enter(61, 'reward', scene);
		if (scene === 'coach') store.change(user, a => { a.run.node.rewardScene.type = 'Normal'; });
		const before = account().run, member = before.team[0].id;
		assert.throws(() => cmd('continue'), /挑选/);
		assert.throws(() => cmd('battle'));
		assert.throws(() => cmd('rewardchoice', { value: 'show', member: 'outsider' }), /展示/);
		assert.equal(rewardSceneView(before).demonstrations[0].member, member);
		cmd('rewardchoice', { value: 'show', member });
		assert.equal(account().run.node.rewardScene.demonstrated, member);
		assert(rewardChoices(account().run).find(c => c.id === 'experience').text !== rewardChoices(before).find(c => c.id === 'experience').text);
		assert.throws(() => cmd('rewardchoice', { value: 'show', member }));
		const request = { id: randomUUID(), revision: account().revision, action: 'rewardchoice', value: 'money' };
		engine.command(user, request); const claimed = account(); engine.command(user, request);
		assert.deepEqual(account(), claimed); assert.throws(() => cmd('rewardchoice', { value: 'experience' }));
		const money = claimed.run.node.reward.money; cmd('continue');
		assert.equal(account().run.money, before.money + money);
		assert.equal(account().run.floor, 62);
		assert(rogueCodex(account(), 'events').entries.find(e => e.id === `reward:${scene}`).unlocked);
	});
	for (const enhanced of [false, true]) it(`credits base and selected PP supplies once, with initial inventory and blessings (demonstrated=${enhanced})`, () => {
		assert.equal(account().run.bag.ether, 6);
		enter(141, 'reward', 'sketch');
		store.change(user, a => {
			a.run.blessings.owned = ['medic', 'ordinary'].map(id => ({ ...blessing(id), floor: 1 }));
			syncBlessingParty(a.run);
		});
		if (enhanced) cmd('rewardchoice', { value: 'show', member: account().run.team[0].id });
		const bag = account().run.bag;
		const choice = { id: randomUUID(), revision: account().revision, action: 'rewardchoice', value: 'recovery' };
		engine.command(user, choice);
		const claimed = account();
		assert.equal(claimed.run.node.reward.items.ether, enhanced ? 3 : 2);
		assert.equal(claimed.run.node.reward.items.elixir, 2);
		assert.deepEqual(claimed.run.bag, bag, 'choice prepares a receipt; it does not credit the bag yet');
		engine.command(user, choice); assert.deepEqual(account(), claimed);
		const finish = { id: randomUUID(), revision: account().revision, action: 'continue' };
		engine.command(user, finish);
		const completed = account();
		assert.equal(completed.run.bag.ether, enhanced ? 9 : 8);
		assert.equal(completed.run.bag.elixir, 2);
		assert.equal(completed.run.floor, 142);
		engine.command(user, finish); assert.deepEqual(account(), completed);
	});
	it('keeps base rewards available without a matching partner; recognizes stored moves and permanent type changes', () => {
		enter(21, 'reward', 'research');
		const run = account().run, mon = run.team[0]; run.node.rewardScene.type = 'Fire';
		assert.equal(rewardSceneView(run).demonstrations.length, 0);
		assert(rewardChoices(run).some(c => c.id === 'experience' && !c.disabled));
		mon.moveMemory.push({ id: 'ember', pp: 0, maxpp: 25 });
		assert.equal(rewardSceneView(run).demonstrations.length, 1);
		run.node.rewardScene.id = 'sketch'; run.node.rewardScene.type = 'Ghost';
		mon.tonics = { wine: true, cephalosporin: true };
		assert.equal(rewardSceneView(run).demonstrations.length, 1);
	});
	it('keeps early rounded stat benefits below the exact same EXP alternative, across growth curves and existing modifiers', () => {
		for (const [species, level, floor] of [['Bulbasaur', 5, 1], ['Pikachu', 17, 21], ['Dratini', 26, 36],
			['Nincada', 16, 31], ['Shroomish', 22, 41], ['Clefairy', 25, 48]]) {
			for (const meta of [0, 5]) for (const kind of ['offense', 'defense', 'balanced']) {
				const run = account().run; run.floor = floor; run.boosts = stats(meta);
				const mon = createRoguePokemon(set(species, Dex.species.get(species).abilities[0], level), run.boosts);
				run.team = [mon]; mon.training = { offense: 377, defense: 251 };
				syncBlessingParty(run); initializeExperience(mon);
				const exp = rewardExperience(floor, true), amount = personalGrowthAmount(run, mon, kind, 600, exp);
				assert(amount >= 0 && amount <= 600);
				const alternate = structuredClone(run), target = alternate.team[0];
				gainExperience(alternate, target, exp);
				grantPersonalGrowth(run, mon, kind, amount);
				for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) assert(mon.stats[stat] <= target.stats[stat],
					`${species} ${kind} ${stat}: ${mon.stats[stat]} > ${target.stats[stat]}`);
			}
		}
	});
	it('retains an early investment through evolution and level 100, while XP at 100 has no stat benefit', () => {
		const run = account().run, mon = run.team[0]; run.floor = 40;
		grantPersonalGrowth(run, mon, 'offense', 400);
		const earlyGain = mon.stats.atk - createRoguePokemon(mon.set, run.boosts).stats.atk;
		gainExperience(run, mon, 10000000); evolveMember(run, mon, 'Ivysaur'); evolveMember(run, mon, 'Venusaur');
		syncBlessingParty(run);
		assert.equal(mon.training.offense, 400); assert.equal(mon.set.level, 100);
		const natural = createRoguePokemon(mon.set, run.boosts);
		assert.equal(mon.stats.atk, Math.floor(natural.stats.atk * 1.04));
		assert(mon.stats.atk - natural.stats.atk > earlyGain);
		const before = { ...mon.stats }; gainExperience(run, mon, 1000000); assert.deepEqual(mon.stats, before);
	});
	it('does not assume that a fixed-level partner can gain levels from the EXP alternative', () => {
		const run = account().run, mon = run.team[0]; mon.fixedLevel = 5;
		assert.equal(personalGrowthAmount(run, mon, 'offense', 600, 100000), 0);
	});
	it('scales candy value without unlocking superior candy early and strengthens late personal growth', () => {
		let previous = 0, previousMoney = 0;
		for (let floor = 1; floor <= 200; floor++) {
			const exp = rewardExperience(floor); assert(exp >= previous); previous = exp;
			const coins = rewardMoney(floor); assert(coins >= previousMoney); previousMoney = coins;
			assert(rewardMoney(floor, true) >= coins);
			const items = rewardCandies(floor, exp);
			const limits = { expcandys: 30, expcandym: 50, expcandyl: 100, expcandyxl: 150 };
			for (const [id, from] of Object.entries(limits)) if (floor < from) assert(!items[id]);
			assert.equal(Object.entries(items).reduce((s, [id, n]) => s + content.items.find(i => i.id === id).amount * n, 0), exp);
		}
		for (const floor of [51, 100, 150, 199]) {
			enter(floor);
			assert.equal(rewardChoices(account().run).find(c => c.id === 'offense').targets[0].amount,
				floor <= 80 ? 600 : floor <= 100 ? 900 : floor <= 140 ? 1000 : 1100);
		}
	});
	it('unlocks batch camps at 51 and preserves idempotency, currency and one-session limits', () => {
		for (let roll = 0; roll < 100; roll++) assert.notEqual(tradeKind(50, () => roll), 'growth');
		enter(50, 'trade'); assert.throws(() => cmd('buygrowth', { value: 'junior' }));
		enter(51, 'trade'); const before = account().run;
		assert.equal(growthOffers(before)[0].price, 150);
		assert.throws(() => cmd('shopchallenge'));
		const request = { id: randomUUID(), revision: account().revision, action: 'buygrowth', value: 'master',
			trainingMembers: [before.team[0].id], trainingStats: ['atk', 'spa'] };
		engine.command(user, request); engine.command(user, request);
		assert.equal(account().run.money, before.money - 900); assert.equal(account().run.team[0].campTraining.atk, 1500);
		assert.throws(() => cmd('buygrowth', { value: 'junior', trainingMembers: [before.team[0].id], trainingStats: ['def'] }));
		const snapshot = account(); engine.migrate(user); assert.deepEqual(account().run, snapshot.run);
		enter(71, 'trade'); store.change(user, a => { a.run.money = 1; });
		assert.throws(() => cmd('buygrowth', { value: 'junior', trainingMembers: [before.team[0].id], trainingStats: ['def'] }), /余额/);
		assert.equal(account().run.money, 1);
	});
	it('shares team growth with newcomers and preserves HP, PP, items, and innate personal growth', () => {
		enter(71, 'trade'); store.change(user, a => { grantGrowth(a.run, 'offense', 400); grantGrowth(a.run, 'defense', 400); });
		const run = account().run; const newcomer = createRoguePokemon(set('Charmander', 'Blaze', 36), run.boosts);
		run.team.push(newcomer); newcomer.hp = 0; newcomer.pp[0].pp = 1;
		grantPersonalGrowth(run, newcomer, 'offense', 600); syncBlessingParty(run);
		const normal = createRoguePokemon(newcomer.set, run.boosts);
		assert.equal(newcomer.stats.atk, Math.floor(normal.stats.atk * 1.1)); assert.equal(newcomer.hp, 0); assert.equal(newcomer.pp[0].pp, 1);
		assert.equal(newcomer.stats.def, Math.floor(normal.stats.def * 1.04));
		assert.equal(newcomer.maxhp, normal.maxhp); assert.equal(newcomer.stats.spe, normal.stats.spe);
		const saved = structuredClone(newcomer); syncBlessingParty(run); assert.deepEqual(newcomer, saved);
	});
	it('uses the same trained stats inside a real battle and after Mega Evolution, without modifying ordinary formats', () => {
		const run = account().run; run.floor = 40;
		const mon = createRoguePokemon({ ...set('Charizard', 'Blaze', 100, ['Flamethrower']), item: 'Charizardite X' }, run.boosts);
		run.team = [mon]; grantPersonalGrowth(run, mon, 'offense', 400);
		grantGrowth(run, 'offense', 800); syncBlessingParty(run);
		const battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: { team: run.team, boosts: run.boosts,
			encounterId: 'training', bag: {}, balls: [], catchable: false }, p1: { team: [mon.set] }, p2: { team: [set()] } });
		try {
			const native = battle.p1.pokemon[0]; assert.equal(native.baseStoredStats.spa, mon.stats.spa);
			native.formeChange('Charizard-Mega-X', battle.dex.items.get('charizarditex'), true);
			const base = createRoguePokemon({ ...mon.set, species: 'Charizard-Mega-X', ability: 'Tough Claws' }, run.boosts);
			assert.equal(native.baseStoredStats.atk, Math.floor(base.stats.atk * 1.12));
		} finally { battle.destroy(); }
		const ordinary = new Battle({ formatid: 'gen9customgame', p1: { team: [{ ...mon.set, fantasyRogueModifiers: { training: { atk: 1 } } }] }, p2: { team: [mon.set] } });
		try { assert.equal(ordinary.p1.pokemon[0].storedStats.atk, ordinary.p2.pokemon[0].storedStats.atk); } finally { ordinary.destroy(); }
	});
	it('makes mushroom vitality permanent, leaves negative outcomes unchanged, and migrates old charges exactly once', () => {
		const run = account().run, mon = run.team[0]; run.floor = 61; run.phase = 'event';
		run.node = { id: 'mushrooms', kind: 'event', encounters: [], reward: { money: 0, items: {} }, event: { id: 'mushrooms', key: 'taste', stage: 'choice' } };
		chooseEventOption(account(), run, content, () => 0, 'taste', 'taste');
		assert.deepEqual(mon.training, { offense: 300, defense: 300 }); assert(!run.eventBuff);
		run.node.event = { id: 'mushrooms', key: 'again', stage: 'choice' }; run.money = 5000;
		chooseEventOption(account(), run, content, () => 99, 'again', 'taste');
		assert(run.money < 5000); assert.deepEqual(mon.training, { offense: 300, defense: 300 });
		store.change(user, a => { a.run.floor = 61; a.run.eventBuff = { battles: 2 }; }); engine.migrate(user);
		const migrated = account().run; assert(!migrated.eventBuff); assert(migrated.team[0].training.offense > 0);
		engine.migrate(user); assert.deepEqual(account().run, migrated);
	});
	it('records growth in clear cards and keeps personal buffs when no blessing is selected', () => {
		const a = account(), run = a.run; run.floor = 40;
		grantGrowth(run, 'defense', 1600); grantPersonalGrowth(run, run.team[0], 'offense', 400); syncBlessingParty(run);
		run.floor = 200; run.phase = 'complete'; run.owner = { id: user, name: 'Growth' };
		recordClear(a, run);
		assert.equal(a.cards[0].snapshot.growth.defense, 1600);
		assert.equal(a.cards[0].snapshot.team[0].training.offense, 400);
		assert.deepEqual(a.cards[0].snapshot.team[0].stats, run.team[0].stats);
		assert.equal(run.blessings.owned.length, 0);
	});
	it('keeps battle EXP efficiency separate from candy EXP and enforces the cap', () => {
		const run = account().run, mon = run.team[0]; initializeExperience(mon);
		grantGrowth(run, 'experience', 9000); assert.equal(run.growth.experience, 4000);
		const before = mon.experience; gainExperience(run, mon, 100); assert.equal(mon.experience - before, 100);
		assert.equal(grantGrowth(run, 'experience', 500), 0);
	});
	it('applies efficiency once to settled combat experience, preserving the reserve multiplier', () => {
		const { towerExperience } = require('../../dist/server/fantasy-rogue/early-balance');
		const { rogueSpeciesData } = require('../../dist/sim/fantasy-rogue-rules');
		store.change(user, a => {
			const run = a.run; run.floor = 21; run.phase = 'choose';
			run.growth = { offense: 0, defense: 0, experience: 2000 };
			run.team.push(createRoguePokemon(set('Bulbasaur', 'Overgrow', 5), run.boosts, 'reserve'));
			run.team.forEach(initializeExperience);
			run.choices = [{ id: 'expwild', kind: 'wild', name: '测试野怪', reward: { money: 0, items: {} },
				encounters: [{ name: '野怪', team: [set('Magikarp', 'Swift Swim', 20)], catchable: true }] }];
		});
		cmd('select', { value: 'expwild' }); cmd('battle');
		const run = account().run;
		engine.settle(user, run.battle.token, { encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag,
			defeated: [{ species: 'Magikarp', level: 20, eligible: run.team.map(m => m.id), participants: [run.team[0].id] }] });
		const after = account().run;
		for (let i = 0; i < 2; i++) {
			const expected = Math.floor(towerExperience(rogueSpeciesData('Magikarp').baseExperience, 20, 5, i === 0, 21, true) * 1.2);
			assert.equal(after.team[i].experience - run.team[i].experience, expected);
		}
	});
});
