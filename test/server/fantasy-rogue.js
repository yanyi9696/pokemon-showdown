'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const {randomUUID} = require('crypto');
const {Battle} = require('../../dist/sim/battle');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine, createRoguePokemon} = require('../../dist/server/fantasy-rogue/engine');
const {fixedFloor, BOSS_FLOORS, validateContent} = require('../../dist/server/fantasy-rogue/content');
const {emptyRogueStats, rogueBattleResult} = require('../../dist/sim/fantasy-rogue');
const {content, set, stats} = require('../fixtures/fantasy-rogue');
const {InformationView} = require('../../dist/server/fantasy-ai/information');
const {WorldBuilder} = require('../../dist/server/fantasy-ai/world');
const {reconstructWorld} = require('../../dist/server/fantasy-ai/reconstruction');
const {Teams} = require('../../dist/sim/teams');
const {RolloutPolicy} = require('../../dist/server/fantasy-ai/rollout');

describe('Fantasy Rogue storage and campaign', () => {
	let store, engine;
	const user = 'roguetester';
	const state = () => store.get(user);
	const cmd = (action, data = {}) => engine.command(user, {id: randomUUID(), revision: state().revision, action, ...data});
	const start = () => { cmd('start', {starters: ['bulbasaur']}); cmd('select', {value: 'grass'}); };
	function finish(won = true, captured) {
		const run = state().run;
		return engine.settle(user, run.battle.token, {
			encounterId: run.battle.encounterId, won, team: run.team, bag: run.bag, captured,
		});
	}
	beforeEach(() => { store = new RogueStore(':memory:'); engine = new RogueEngine(store, content()); });
	afterEach(() => store.close());
	it('keeps fixed rest and boss floors mandatory through 200', () => {
		assert.equal(fixedFloor(8), undefined);
		for (const floor of BOSS_FLOORS.keys()) {
			assert.equal(fixedFloor(floor), 'boss');
			assert.equal(fixedFloor(floor - 1), 'rest');
		}
		assert.equal(BOSS_FLOORS.get(170), '精英首领');
		assert.equal(BOSS_FLOORS.get(190), '冠军');
		const invalid = content(); invalid.floors[9] = invalid.floors[8];
		assert.throws(() => validateContent(invalid), /固定节点/);
	});
	it('does not invent production content, accept imported teams or bypass locked starters', () => {
		assert.throws(() => new RogueEngine(store, null).command(user, {id: randomUUID(), revision: 0, action: 'start'}), /尚未配置/);
		assert.throws(() => cmd('start', {starters: ['mew']}), /未解锁/);
		assert.throws(() => cmd('start', {starters: ['bulbasaur', 'magikarp']}), /栏位/);
		assert.equal(state().revision, 0);
	});
	it('finishes three encounters per wild floor, awards loot once and no growth point', () => {
		start();
		for (let i = 0; i < 3; i++) {
			cmd('battle');
			const before = state().run;
			const result = {encounterId: before.battle.encounterId, won: true, team: before.team, bag: before.bag};
			result.team[0].hp -= 1; result.team[0].pp[0].pp -= 1; result.team[0].status = 'par';
			engine.settle(user, before.battle.token, result);
			const settled = state();
			engine.settle(user, before.battle.token, result);
			assert.deepEqual(state(), settled);
			assert.equal(state().points, 0);
			assert.equal(state().run.team[0].hp, before.team[0].hp);
		}
		assert.equal(state().run.floor, 2);
		assert.equal(state().run.money, 130);
		assert.deepEqual(state().run.lastReward, {floor: 1, name: '测试草地', money: 30, items: {}, points: 0});
		assert.equal(state().run.team[0].status, 'par');
	});
	it('rolls back an entire failed floor while retaining immediate, deduplicated catches', () => {
		start();
		const checkpoint = structuredClone(state().run.checkpoint);
		cmd('battle');
		const first = state().run.battle;
		const captured = createRoguePokemon(set('Magikarp', 'Swift Swim', 1, ['Splash']), stats(0), first.encounterId);
		engine.capture(user, first.token, captured);
		assert.equal(state().captures.magikarp, 1);
		assert(state().unlocked.includes('magikarp'));
		finish(true, captured);
		cmd('battle'); finish(false);
		cmd('retry');
		assert.deepEqual(state().run.team, checkpoint.team);
		assert.deepEqual(state().run.bag, checkpoint.bag);
		assert.equal(state().run.money, checkpoint.money);
		assert.equal(state().run.encounter, 0);
		cmd('battle');
		assert.equal(state().run.battle.encounterId, first.encounterId);
		assert.notEqual(state().run.battle.token, first.token);
		engine.capture(user, state().run.battle.token, captured);
		assert.equal(state().captures.magikarp, 1);
		engine.settle(user, first.token, {encounterId: first.encounterId, won: true, team: [], bag: {}});
		assert.equal(state().run.phase, 'battle');
		assert.equal(state().points, 0);
	});
	it('unlocks the configured first stage immediately and single-stage legendaries on catch ten', () => {
		start();
		for (let i = 0; i < 10; i++) {
			if (state().run.phase === 'choose') cmd('select', {value: 'grass'});
			cmd('battle');
			const ticket = state().run.battle;
			const caught = createRoguePokemon(set('Mew', 'Synchronize', 5, ['Pound']), stats(0), ticket.encounterId);
			engine.capture(user, ticket.token, caught);
			engine.capture(user, ticket.token, caught);
			assert.equal(state().captures.mew, i + 1);
			assert.equal(state().unlocked.includes('mew'), i === 9);
			finish();
		}
		cmd('battle');
		const ticket = state().run.battle;
		engine.capture(user, ticket.token, createRoguePokemon(set('Gyarados', 'Intimidate'), stats(0), ticket.encounterId));
		assert(state().unlocked.includes('magikarp'));
		assert(!state().unlocked.includes('gyarados'));
	});
	it('shares a 160-point budget, enforces caps, and snapshots upgrades at run start', () => {
		store.change(user, account => { account.points = 161; });
		start();
		assert.throws(() => cmd('upgrade', {value: 'hp'}), /进行中的冒险/);
		assert.throws(() => cmd('upgrade', {value: 'slot'}), /进行中的冒险/);
		assert.deepEqual(state().run.boosts, stats(0));
		assert.equal(state().run.startingSlots, 1);
		assert.equal(state().points, 161);
		cmd('abandon');
		for (const stat of Object.keys(stats(0))) for (let i = 0; i < 10; i++) cmd('upgrade', {value: stat});
		for (let i = 0; i < 5; i++) cmd('upgrade', {value: 'slot'});
		assert.equal(state().points, 1); assert.equal(state().slots, 6);
		assert.deepEqual(state().boosts, stats(10));
		assert.throws(() => cmd('upgrade', {value: 'slot'}), /栏位已满/);
		assert.throws(() => cmd('upgrade', {value: 'hp'}), /属性已满/);
		assert.equal(state().points, 1);
		cmd('start', {starters: ['bulbasaur']});
		assert.deepEqual(state().run.boosts, stats(10));
		assert.equal(state().run.startingSlots, 6);
	});
	it('allows heal, revive and heal again without leaving a rest floor or reviving through healing', () => {
		start();
		store.change(user, account => {
			const run = account.run;
			run.floor = 9; run.phase = 'rest'; run.node = content().floors[9][0];
			run.team.push(createRoguePokemon(set('Magikarp', 'Swift Swim'), stats(0)));
			run.team[0].hp = 0; run.team[1].hp = 1; run.team[1].status = 'psn'; run.team[1].pp[0].pp = 0;
		});
		cmd('heal');
		assert.equal(state().run.team[0].hp, 0);
		assert.equal(state().run.team[1].hp, state().run.team[1].maxhp);
		cmd('buy', {value: 'revive'}); cmd('use', {value: 'revive', member: state().run.team[0].id});
		assert(state().run.team[0].hp < state().run.team[0].maxhp);
		cmd('heal'); cmd('heal');
		assert.equal(state().run.team[0].hp, state().run.team[0].maxhp);
		assert.equal(state().run.phase, 'rest'); assert.equal(state().points, 0);
		cmd('continue');
		assert.equal(state().points, 0); assert.equal(state().run.floor, 10);
		assert.equal(state().run.node.kind, 'boss'); assert.equal(state().run.phase, 'ready');
		assert.throws(() => cmd('select', {value: 'grass'}), /已经选择/);
	});
	it('persists receipts, rejects stale writes, and resumes a pre-battle checkpoint after reopening SQLite', () => {
		const filename = path.join(os.tmpdir(), `fantasy-rogue-${randomUUID()}.db`);
		let disk = new RogueStore(filename);
		try {
			const e = new RogueEngine(disk, content());
			const request = {id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur']};
			e.command(user, request);
			e.command(user, {id: randomUUID(), revision: 1, action: 'select', value: 'grass'});
			e.command(user, {id: randomUUID(), revision: 2, action: 'battle'});
			const before = disk.get(user);
			disk.close(); disk = new RogueStore(filename);
			const reopened = new RogueEngine(disk, content());
			reopened.command(user, request);
			assert.deepEqual(disk.get(user), before);
			assert.throws(() => reopened.command(user, {...request, starters: ['mew']}), /不一致/);
			assert.throws(() => reopened.command(user, {...request, id: randomUUID()}), /已更新/);
			reopened.recover(user, before.run.battle.token);
			assert.equal(disk.get(user).run.phase, 'ready');
			assert.deepEqual(disk.get(user).run.team, before.run.team);
		} finally {
			disk.close();
			for (const suffix of ['', '-wal', '-shm']) fs.rmSync(filename + suffix, {force: true});
		}
	});
	it('rolls back a point purchase if its receipt cannot be saved, then retries exactly once', () => {
		store.change(user, account => { account.points = 20; });
		const before = state();
		const request = {id: randomUUID(), revision: before.revision, action: 'upgrade', value: 'slot'};
		store.db.exec(`CREATE TRIGGER reject_rogue_receipt BEFORE INSERT ON rogue_requests
			BEGIN SELECT RAISE(ABORT, 'simulated disk write failure'); END`);
		assert.throws(() => engine.command(user, request), /simulated disk write failure/);
		assert.deepEqual(state(), before);
		store.db.exec('DROP TRIGGER reject_rogue_receipt');
		engine.command(user, request);
		engine.command(user, request);
		assert.equal(state().points, 0);
		assert.equal(state().slots, 2);
		assert.equal(state().revision, before.revision + 1);
	});
});

describe('Fantasy Rogue native battle mechanics', () => {
	let battle;
	afterEach(() => battle?.destroy());
	function begin(boosts = emptyRogueStats(), change = () => {}) {
		const member = createRoguePokemon(set(), boosts);
		change(member);
		const privateState = {encounterId: 'test:1:grass:0', team: [member], boosts, bag: {pokeball: 2, failball: 1},
			balls: [{id: 'pokeball', name: '测试必捕球', chance: 1}, {id: 'failball', name: '测试失败球', chance: 0}], catchable: true};
		battle = new Battle({formatid: 'gen9fantasyrogue', fantasyRogue: privateState,
			p1: {name: 'Human', team: [member.set]}, p2: {name: 'Wild', team: [set('Magikarp', 'Swift Swim', 1, ['Tackle'])]}});
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		return member;
	}
	it('consumes a failed ball and the human action while the foe still attacks', () => {
		begin();
		const hp = battle.p1.active[0].hp;
		const pp = battle.p1.active[0].moveSlots[0].pp;
		battle.choose('p1', 'rogueball failball'); battle.choose('p2', 'move 1');
		assert.equal(battle.fantasyRogue.bag.failball, 0);
		assert(battle.p1.active[0].hp < hp);
		assert.equal(battle.p1.active[0].moveSlots[0].pp, pp);
		assert.equal(battle.turn, 2);
	});
	it('captures inside the real battle and reports private surviving HP, PP and items', () => {
		begin(stats(3), mon => { mon.hp -= 2; mon.pp[0].pp = 1; mon.status = 'par'; });
		const hp = battle.p1.active[0].hp;
		assert.equal(battle.p1.active[0].moveSlots[0].pp, 1);
		assert.equal(battle.p1.active[0].status, 'par');
		battle.choose('p1', 'rogueball pokeball'); battle.choose('p2', 'move 1');
		assert(battle.ended);
		assert.equal(battle.winner, 'Human');
		const result = rogueBattleResult(battle);
		assert.equal(result.team[0].hp, hp);
		assert.equal(result.team[0].pp[0].pp, 1);
		assert.equal(result.captured.set.species, 'Magikarp');
		assert.equal(result.bag.pokeball, 1);
	});
	it('adds fixed final stats after nature at different levels, including a fixed-HP species', () => {
		for (const level of [5, 100]) {
			for (const species of ['Bulbasaur', 'Shedinja']) {
				const config = {...set(species, species === 'Shedinja' ? 'Wonder Guard' : 'Overgrow', level), nature: 'Adamant'};
				const plain = createRoguePokemon(config, stats(0));
				const boosted = createRoguePokemon(config, stats(10));
				assert.equal(boosted.maxhp - plain.maxhp, 10);
			}
		}
		begin(stats(10));
		const mon = battle.p1.active[0];
		const original = {...mon.baseStoredStats};
		mon.setSpecies(mon.species); mon.setSpecies(mon.species);
		assert.deepEqual(mon.baseStoredStats, original);
	});
	it('rejects capture for trainer battles, exhausted balls, and ordinary formats', () => {
		begin();
		battle.fantasyRogue.catchable = false;
		assert.equal(battle.choose('p1', 'rogueball pokeball'), false);
		assert.equal(battle.fantasyRogue.bag.pokeball, 2);
		battle.fantasyRogue.catchable = true; battle.fantasyRogue.bag.pokeball = 0;
		assert.equal(battle.choose('p1', 'rogueball pokeball'), false);
	});
	it('reuses AI world reconstruction with small parties and the public absolute bonus exactly once', () => {
		begin(stats(10));
		const view = new InformationView({ownSide: 'p2', difficulty: 'normal', partySize: 1, rogueBoosts: stats(10)});
		view.setOpponentMoves([{species: 'Bulbasaur', moves: ['tackle', 'growl']}]);
		view.receiveUpdate(battle.log.join('\n'));
		const observation = view.observe(battle.p2.activeRequest);
		assert(!observation.initialOpponent);
		const worlds = new WorldBuilder({format: 'gen9fantasyrogue', packedTeam: Teams.pack(battle.p2.team)}).build(observation);
		assert(worlds.length > 0);
		const restored = reconstructWorld(worlds[0], [1, 2, 3, 4]);
		try {
			assert.equal(restored.p1.pokemon.length, 1);
			assert.deepEqual(restored.p1.active[0].set.fantasyRogueStats, stats(10));
			const savedStats = {...restored.p1.active[0].baseStoredStats};
			restored.p1.active[0].setSpecies(restored.p1.active[0].species);
			assert.deepEqual(restored.p1.active[0].baseStoredStats, savedStats);
		} finally { restored.destroy(); }
		const decision = new RolloutPolicy({format: 'gen9fantasyrogue', packedTeam: Teams.pack(battle.p2.team),
			style: 'balanced', keyMembers: [], resourcePreferences: []}).decide(observation, [1, 2, 3, 4], {maxRollouts: 24, budgetMs: null});
		assert(decision.rollouts > 0, JSON.stringify(decision.diagnostics));
	});
});
