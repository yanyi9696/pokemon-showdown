'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon, rebuildMember, gainExperience } = require('../../dist/server/fantasy-rogue/progression');
const { activeRogueSpirits, ROGUE_SPIRITS } = require('../../dist/sim/fantasy-rogue-spirits');
const { rogueCaptureChance, rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { convertSpiritItem, SPIRIT_HAZARDS } = require('../../dist/server/fantasy-rogue/spirits');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { WorldBuilder } = require('../../dist/server/fantasy-ai/world');
const { reconstructWorld } = require('../../dist/server/fantasy-ai/reconstruction');
const { Teams } = require('../../dist/sim/teams');
const { experienceYield, rogueSpeciesData } = require('../../dist/sim/fantasy-rogue-rules');

describe('Fantasy Rogue tower spirit campaigns', () => {
	let store, engine;
	const user = 'spirittester';
	const account = () => store.get(user);
	const cmd = (action, details = {}) => engine.command(user, { id: randomUUID(), revision: account().revision, action, ...details });
	const start = id => { cmd('start', { starters: ['bulbasaur'], useSpirit: true, testSpirit: id }); };
	function floor(n) {
		store.change(user, saved => {
			const run = saved.run;
			run.floor = n; run.phase = 'choose'; run.encounter = 0;
			delete run.node; delete run.choices;
		});
		cmd('select', { value: n % 10 === 9 ? 'center' : n % 10 === 0 ? 'boss' : 'wild0' });
	}
	function fight(won = true, extra = {}) {
		cmd('battle'); const run = account().run;
		const result = { won, encounterId: run.battle.encounterId, team: run.team, bag: run.bag, ...extra };
		engine.settle(user, run.battle.token, result);
		return { token: run.battle.token, result };
	}
	beforeEach(() => { store = new RogueStore(':memory:'); engine = new RogueEngine(store, createPreviewContent(), () => 0, true); });
	afterEach(() => store.close());
	it('opens only 23 complete spirits and rejects remote overrides or locked accounts', () => {
		assert.equal(activeRogueSpirits().length, 23);
		const remote = new RogueEngine(store, createPreviewContent());
		assert.throws(() => remote.command(user, { id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur'], useSpirit: true }), /通关/);
		store.change(user, saved => { saved.spiritUnlocked = true; });
		assert.throws(() => remote.command(user, { id: randomUUID(), revision: account().revision,
			action: 'start', starters: ['bulbasaur'], useSpirit: true, testSpirit: 'zygardeorder' }), /指定塔灵仅在本地/);
		assert.throws(() => start('latios'), /尚未开放/);
		assert.throws(() => start('terapagos'), /尚未开放/);
		start('kyurem'); const before = account();
		assert.equal(before.run.phase, 'intro'); assert(!before.run.choices);
		engine.migrate(user); assert.deepEqual(account(), before);
		assert.throws(() => cmd('select', { value: 'wild0' }), /已经选择/);
		cmd('spiritack'); assert.equal(account().run.phase, 'choose');
		assert.equal(account().run.spirit, 'kyurem');
	});
	it('unlocks only after an unaided 200-floor clear and preserves legacy runs', () => {
		cmd('start', { starters: ['bulbasaur'] }); floor(200); fight();
		assert.equal(account().run.phase, 'complete'); assert(account().spiritUnlocked);
		start('kyurem'); cmd('spiritack');
		floor(200); fight();
		assert(account().spiritUnlocked);
		store.change(user, a => { delete a.spiritUnlocked; });
		engine.migrate(user); assert(!account().spiritUnlocked);
	});
	it('uses at most three HP purchases per shop, includes healing, and never faints the payer', () => {
		start('yveltal'); cmd('spiritack');
		floor(9);
		const member = account().run.team[0].id, money = account().run.money;
		for (let i = 0; i < 3; i++) cmd('buyhp', { value: 'potion', member });
		assert.equal(account().run.money, money);
		assert.equal(account().run.node.hpPurchases, 3);
		assert.throws(() => cmd('buyhp', { value: 'potion', member }), /限额/);
		const hp = account().run.team[0].hp;
		cmd('heal'); assert.equal(account().run.team[0].hp, hp);
		floor(19); assert(!account().run.node.hpPurchases);
		store.change(user, a => { a.run.team[0].hp = 1; });
		assert.throws(() => cmd('buyhp', { value: 'potion', member }), /至少保留/);
	});
	it('keeps coin shopping and special-shop candy prices server authoritative', () => {
		start('meowth'); cmd('spiritack'); floor(9);
		store.change(user, a => { a.run.money = 10000; });
		cmd('buy', { value: 'expcandyxs' }); assert.equal(account().run.money, 9750);
		cmd('buy', { value: 'potion' }); assert.equal(account().run.money, 9562);
		assert.throws(() => cmd('buy', { value: 'expcandys' }), /未解锁/);
		cmd('abandon'); start('yveltal'); cmd('spiritack');
		floor(9);
		assert.throws(() => cmd('buy', { value: 'expcandyxs' }), /未解锁/);
	});
	it('grants the fixed-level partner once and rejects experience candy without consuming it', () => {
		start('celebi'); const gift = account().run.team.find(mon => mon.fixedLevel);
		assert.equal(gift.set.level, 40); cmd('spiritack');
		assert.equal(account().run.team.length, 2);
		store.change(user, a => { a.run.bag.expcandyxs = 1; });
		assert.throws(() => cmd('use', { value: 'expcandyxs', member: gift.id }), /不能再获得经验/);
		assert.equal(account().run.bag.expcandyxs, 1);
		const run = account().run;
		gainExperience(run, run.team.find(mon => mon.id === gift.id), 999999); assert.equal(run.team[1].set.level, 40);
	});
	it('requires manually trimming a large starting team for the three-member spirit', () => {
		store.change(user, a => { a.slots = 6; });
		const starters = engine.content.starters.filter(s => s.availableInitially).slice(0, 4).map(s => s.id);
		cmd('start', { starters, useSpirit: true, testSpirit: 'regigigas' });
		assert.throws(() => cmd('spiritack'), /缩减/);
		cmd('trimparty', { member: account().run.team[3].id }); cmd('spiritack');
		assert.equal(account().run.team.length, 3);
	});
	it('persists fogged choices and redacts their contents from the public state', () => {
		start('darkrai'); cmd('spiritack');
		const choices = account().run.choices;
		assert.equal(choices.filter(node => node.fogged).length, 2);
		engine.migrate(user); assert.deepEqual(account().run.choices, choices);
		const view = new RogueManager(engine).state({ id: user, name: user, named: true, connected: true, registered: true });
		assert.equal(view.run.choices.filter(node => node.fogged).length, 2);
		for (const node of view.run.choices.filter(node => node.fogged)) {
			assert.equal(node.name, '迷雾区域'); assert(!node.biome);
			assert(!node.wildLoot); assert.equal(node.reward.money, 0);
		}
	});
	it('blocks a raided shop, retains the raid on loss, and pays the bounty exactly once before shopping', () => {
		start('persian'); cmd('spiritack'); floor(9);
		assert.equal(account().run.phase, 'ready'); assert(account().run.node.rocket);
		assert.throws(() => cmd('buy', { value: 'potion' }), /休整商店/);
		const opponent = account().run.node.encounters;
		fight(false); assert.deepEqual(account().run.node.encounters, opponent);
		const before = account().run.money;
		const { token, result } = fight();
		assert.equal(account().run.phase, 'rest'); assert.equal(account().run.floor, 9);
		assert.equal(account().run.money, before + 3000);
		engine.settle(user, token, result); assert.equal(account().run.money, before + 3000);
		cmd('continue'); assert.equal(account().run.floor, 10);
	});
	it('stores a full-party capture in the box, preserves spent resources and manually merges chosen members', () => {
		start('zygarde'); cmd('spiritack');
		store.change(user, a => {
			const base = a.run.team[0];
			for (let i = 0; i < 5; i++) a.run.team.push({ ...structuredClone(base), id: 'extra' + i });
		});
		cmd('select', { value: 'wild0' });
		cmd('battle');
		let run = account().run;
		const captured = createRoguePokemon(run.team[0].set, run.boosts, run.battle.encounterId);
		engine.settle(user, run.battle.token, { won: true, encounterId: run.battle.encounterId, team: run.team, bag: run.bag, captured });
		assert.equal(account().run.box.length, 1);
		store.change(user, a => {
			a.run.team[0].hp = 0; a.run.team[0].pp[0].pp = 1; a.run.team[1].set.item = 'Leftovers';
		});
		run = account().run;
		cmd('merge', { member: run.team[0].id, order: [run.team[1].id, run.box[0].id] });
		assert.equal(account().run.team[0].stars, 2); assert.equal(account().run.team[0].hp, 0);
		assert.equal(account().run.team[0].pp[0].pp, 1); assert.equal(account().run.bag.leftovers, 1);
		assert.equal(account().run.box.length, 0); assert.equal(account().run.team.length, 5);
		cmd('box', { member: run.team[0].id });
		assert.equal(account().run.box[0].hp, 0);
		cmd('box', { member: run.team[0].id }); assert.equal(account().run.team.at(-1).hp, 0);
	});
	it('converts eligible new items once but never feathers, medicine or existing fantasy items', () => {
		start('hoopagift'); const run = account().run;
		const rolled = convertSpiritItem(run, engine.content, 'leftovers', 'test', () => 0);
		assert(rolled.startsWith('fantasy'));
		assert.equal(convertSpiritItem(run, engine.content, 'leftovers', 'test', () => { throw new Error('rerolled'); }), rolled);
		for (const id of ['healthfeather', 'potion', 'fantasydefensegem']) assert.equal(convertSpiritItem(run, engine.content, id, id, () => 0), id);
	});
	it('boosts Mew wild levels and Ho-Oh shiny battle experience without multiplying candy', () => {
		start('mew'); cmd('spiritack');
		assert.equal(account().run.choices[0].biome.level, 4);
		cmd('abandon'); start('hooh');
		cmd('spiritack'); cmd('select', { value: 'wild0' });
		store.change(user, a => { a.run.team[0].set.shiny = true; });
		const mon = account().run.team[0], before = mon.experience;
		const expected = experienceYield(rogueSpeciesData('Caterpie').baseExperience, 1, mon.set.level, true) * 3;
		fight(true, { defeated: [{ species: 'Caterpie', level: 1, participants: [mon.id], eligible: [mon.id] }] });
		assert.equal(account().run.team[0].experience, before + expected);
		store.change(user, a => { a.run.bag.expcandyxs = 1; });
		cmd('use', { value: 'expcandyxs', member: mon.id });
		assert.equal(account().run.team[0].experience, before + expected + 100);
	});
	it('saves shiny and Hoopa side-effect rolls with the encounter instead of rerolling retries', () => {
		start('hoopamischief'); cmd('spiritack'); cmd('select', { value: 'wild0' });
		assert.equal(SPIRIT_HAZARDS.length, 8); assert(SPIRIT_HAZARDS.includes('gmaxsteelsurge'));
		const node = account().run.node;
		assert.deepEqual(node.encounters[0].spiritHazards, ['stealthrock', 'stealthrock']);
		assert(node.encounters[0].team[0].shiny);
		fight(false); assert.deepEqual(account().run.node, node);
	});
});

describe('Fantasy Rogue tower spirit native battles', () => {
	let battle;
	afterEach(() => battle?.destroy());
	function begin(id, options = {}) {
		const member = createRoguePokemon(set('Snorlax', 'Immunity', 50, ['Dragon Rage', 'Splash', 'Rain Dance']), stats(0));
		if (options.stars) { member.stars = options.stars; rebuildMember(member, stats(0)); }
		member.hp -= 60;
		const state = { encounterId: 'spirit:1', team: [member], boosts: stats(0), bag: { pokeball: 2 }, catchable: true,
			balls: [{ id: 'pokeball', name: '精灵球', multiplier: 1 }], spirit: { id, floor: 100, hazards: options.hazards } };
		battle = new Battle({ formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Player', team: [member.set] }, p2: { name: 'Foe', team: [set(options.foe || 'Snorlax', 'Immunity', 50, ['Splash', 'Dragon Rage'])] } });
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		return member;
	}
	const turn = (ours = 'move 2', theirs = 'move 1') => { battle.choose('p1', ours); battle.choose('p2', theirs); };
	for (const spirit of ROGUE_SPIRITS.filter(s => s.weather || s.terrain)) {
		it(`${spirit.id}: persists the default and restores it after an override expires`, () => {
			begin(spirit.id); const field = battle.field;
			const weather = !!spirit.weather, key = weather ? 'weather' : 'terrain', state = weather ? 'weatherState' : 'terrainState';
			assert.equal(field[key], spirit[key]); assert(!field[state].duration);
			const override = weather ? (spirit.weather === 'raindance' ? 'sunnyday' : 'raindance') :
				(spirit.terrain === 'grassyterrain' ? 'electricterrain' : 'grassyterrain');
			field[weather ? 'setWeather' : 'setTerrain'](override, battle.p1.active[0]); field[state].duration = 1;
			turn(); assert.equal(field[key], spirit[key]); assert(!field[state].duration);
		});
	}
	it('starts only one random environment, and does not fill an empty terrain while weather is active', () => {
		begin('castform'); assert.notEqual(!!battle.field.weather, !!battle.field.terrain);
		battle.field.clearWeather(); battle.field.clearTerrain();
		battle.field.setWeather('raindance', battle.p1.active[0]); battle.field.weatherState.duration = 2;
		turn(); assert.equal(battle.field.weather, 'raindance'); assert.equal(battle.field.terrain, '');
		turn(); assert.notEqual(!!battle.field.weather, !!battle.field.terrain);
		assert.equal((battle.field.weather ? battle.field.weatherState : battle.field.terrainState).duration, 5);
	});
	it('alternates four-turn Tailwinds rather than permanently buffing both sides', () => {
		begin('tornadus'); assert(battle.p1.sideConditions.tailwind); assert(!battle.p2.sideConditions.tailwind);
		for (let i = 0; i < 4; i++) turn();
		assert(!battle.p1.sideConditions.tailwind); assert.equal(battle.p2.sideConditions.tailwind.duration, 4);
		for (let i = 0; i < 4; i++) turn();
		assert(battle.p1.sideConditions.tailwind); assert(!battle.p2.sideConditions.tailwind);
	});
	it('uses native steel hazards and five-turn screens, including on the first switch-in', () => {
		begin('hoopamischief', { hazards: ['gmaxsteelsurge', 'reflect'] });
		assert(battle.p1.sideConditions.gmaxsteelsurge); assert.equal(battle.p2.sideConditions.reflect.duration, 5);
		assert(battle.log.some(line => line.includes('Steelsurge')));
	});
	it('heals only our attacker for half of actual damage including a knockout', () => {
		begin('yveltal'); const ours = battle.p1.active[0], foe = battle.p2.active[0], hp = ours.hp;
		turn('move 1'); assert.equal(ours.hp, hp + 20);
		foe.hp = 6; const before = ours.hp;
		turn('move 1'); assert.equal(ours.hp, before + 3);
	});
	it('applies outgoing/incoming modifiers to direct hits but leaves passive damage unchanged', () => {
		begin('regigigas');
		const ours = battle.p1.active[0], foe = battle.p2.active[0];
		const hp = ours.hp, foeHP = foe.hp;
		turn('move 1', 'move 2'); assert.equal(ours.hp, hp - 20); assert.equal(foe.hp, foeHP - 80);
		const before = ours.hp;
		battle.damage(10, ours, foe, battle.dex.conditions.get('psn')); assert.equal(ours.hp, before - 10);
	});
	it('grows Darkrai damage by unique floor progress', () => {
		begin('darkrai'); const foe = battle.p2.active[0], hp = foe.hp;
		turn('move 1'); assert.equal(foe.hp, hp - 60);
	});
	it('doubles the exact displayed capture chance and caps it at certainty', () => {
		begin('mew'); const ball = battle.fantasyRogue.balls[0];
		const boosted = rogueCaptureChance(battle, ball); battle.fantasyRogue.spirit.id = 'kyurem';
		assert.equal(boosted, Math.min(1, rogueCaptureChance(battle, ball) * 2));
		battle.fantasyRogue.spirit.id = 'mew'; assert.equal(rogueCaptureChance(battle, { ...ball, chance: 0.8 }), 1);
	});
	it('uses scaled six-dimensional final stats once and preserves stars in settlement', () => {
		const saved = begin('zygarde', { stars: 4 });
		const plain = createRoguePokemon(saved.set, stats(0));
		for (const stat of Object.keys(stats(0))) assert.equal(saved.stats[stat], plain.stats[stat] * 3);
		assert.equal(battle.p1.active[0].maxhp, saved.maxhp);
		assert.equal(rogueBattleResult(battle).team[0].stars, 4);
	});
	it('carries only public spirit rules into the existing AI simulation', () => {
		begin('regigigas');
		const view = new InformationView({ ownSide: 'p2', difficulty: 'normal', partySize: 1,
			rogueBoosts: stats(0), rogueSpirit: { id: 'regigigas', floor: 100 } });
		view.receiveUpdate(battle.log.join('\n'));
		const observation = view.observe(battle.p2.activeRequest);
		assert.deepEqual(observation.rogueSpirit, { id: 'regigigas', floor: 100 });
		const world = new WorldBuilder({ format: 'gen9fantasyrogue', packedTeam: Teams.pack(battle.p2.team) }).build(observation)[0];
		const simulated = reconstructWorld(world, [1, 2, 3, 4]);
		try {
			const target = simulated.p1.active[0], hp = target.hp;
			simulated.damage(40, target, simulated.p2.active[0], simulated.dex.moves.get('dragonrage'));
			assert.equal(target.hp, hp - 20);
			assert.equal(simulated.fantasyRogue.catchable, false);
		} finally { simulated.destroy(); }
	});
	it('reverses type immunity and effectiveness without removing ability immunities', () => {
		begin('malamar', { foe: 'Gengar' });
		const foe = battle.p2.active[0], ours = battle.p1.active[0];
		assert.equal(foe.runImmunity('Normal', false), true);
		assert.equal(foe.runEffectiveness(battle.dex.getActiveMove('tackle')), 1);
		assert.equal(ours.runEffectiveness(battle.dex.getActiveMove('karatechop')), -1);
	});
});
