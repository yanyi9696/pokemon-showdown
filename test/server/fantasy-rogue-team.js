'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { rememberMove, rebuildMember, gainEffort, evolveMember } = require('../../dist/server/fantasy-rogue/progression');
const { rogueEffortYield } = require('../../dist/sim/fantasy-rogue-rules');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue earned party editor', () => {
	let store, engine, battle;
	const user = 'partytester';
	const saved = () => store.get(user);
	const member = () => saved().run.team[0];
	const cmd = (action, data = {}) => engine.command(user, {
		id: randomUUID(), revision: saved().revision, action, ...data,
	});
	beforeEach(() => {
		store = new RogueStore(':memory:');
		const data = content();
		data.progression = 'mainline7';
		for (const item of data.items) if (item.kind === 'ball') item.multiplier = 1;
		data.items.push({ id: 'oranberry', kind: 'held', name: '橙橙果', price: 50 });
		engine = new RogueEngine(store, data);
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => {
		battle?.destroy(); battle = undefined; store.close();
	});
	it('recalls and reorders learned moves without recovering HP, status or spent PP', () => {
		store.change(user, account => {
			const mon = account.run.team[0];
			mon.hp -= 5; mon.status = 'par'; mon.pp[0].pp = 2;
			rememberMove(mon, 'vinewhip');
		});
		const original = member();
		cmd('setmove', { member: original.id, slot: 0, value: 'vinewhip' });
		assert.equal(member().moveMemory.find(move => move.id === 'tackle').pp, 2);
		cmd('setmove', { member: original.id, slot: 0, value: 'tackle' });
		assert.equal(member().pp[0].pp, 2);
		assert.equal(member().hp, original.hp);
		assert.equal(member().status, 'par');
		cmd('moves', { member: original.id, order: ['growl', 'tackle'] });
		assert.equal(member().pp[1].id, 'tackle'); assert.equal(member().pp[1].pp, 2);
		cmd('setmove', { member: original.id, slot: 0, value: 'tackle' });
		assert.equal(member().pp[0].pp, 2);
		assert.throws(() => cmd('setmove', { member: original.id, slot: 1, value: 'spore' }), /尚未学会/);
		assert.throws(() => cmd('moves', { member: original.id, order: ['tackle', 'tackle'] }), /顺序无效/);
	});
	it('keeps replaced and skipped level-up moves available, and migrates legacy memory conservatively', () => {
		const id = member().id;
		store.change(user, account => {
			account.run.pendingMoves = [{ member: id, move: 'vinewhip' }, { member: id, move: 'leechseed' }];
			delete account.run.team[0].moveMemory;
			account.run.team[0].seenMoves = ['tackle', 'growl', 'razorleaf', 'vinewhip'];
			account.run.team[0].pp[0].pp = 1;
		});
		cmd('learn', { member: id, value: '0' });
		cmd('learn', { member: id, value: 'skip' });
		const memory = member().moveMemory;
		assert.equal(member().pp[0].pp, member().pp[0].maxpp);
		assert.equal(memory.find(move => move.id === 'tackle').pp, 1);
		assert.equal(memory.find(move => move.id === 'razorleaf').pp, 0);
		assert(memory.find(move => move.id === 'leechseed').pp > 0);
		cmd('setmove', { member: id, slot: 0, value: 'tackle' });
		assert.equal(member().pp[0].pp, 1);
	});
	it('conserves held items in the bag, including returns of non-shop items', () => {
		const id = member().id;
		store.change(user, account => {
			account.run.bag.oranberry = 1;
			account.run.team[0].set.item = 'leftovers';
			account.run.team[0].hp -= 3;
		});
		const hp = member().hp;
		cmd('equip', { member: id, value: 'oranberry' });
		assert.equal(saved().run.bag.oranberry, 0);
		assert.equal(saved().run.bag.leftovers, 1);
		cmd('equip', { member: id, value: 'leftovers' });
		assert.equal(saved().run.bag.oranberry, 1);
		assert.equal(saved().run.bag.leftovers, 0);
		assert.equal(member().hp, hp);
		assert.throws(() => cmd('equip', { member: id, value: 'lifeorb' }), /没有可用/);
		cmd('equip', { member: id, value: '' });
		assert.equal(saved().run.bag.leftovers, 1);
		assert.equal(member().set.item, '');
		store.change(user, account => { account.run.phase = 'rest'; });
		assert.throws(() => cmd('buy', { value: 'leftovers' }), /商品无效/);
	});
	it('permutes stable party identities, blocks battle edits and retains the party after a wipe', () => {
		store.change(user, account => {
			account.run.team.push(createRoguePokemon(set('Magikarp', 'Swift Swim'), stats(0), 'run:1:catch:0'));
		});
		const order = saved().run.team.map(mon => mon.id).reverse();
		cmd('order', { order });
		assert.deepEqual(saved().run.team.map(mon => mon.id), order);
		assert.throws(() => cmd('order', { order: [order[0], order[0]] }), /顺序无效/);
		cmd('select', { value: 'grass' }); cmd('battle');
		assert.throws(() => cmd('order', { order: [...order].reverse() }), /战斗外/);
		const run = saved().run;
		for (const mon of run.team) mon.hp = 0;
		engine.settle(user, run.battle.token, { encounterId: run.battle.encounterId, won: false, team: run.team, bag: run.bag });
		assert.equal(saved().run.phase, 'ready');
		assert.deepEqual(saved().run.team.map(mon => mon.id), order);
		cmd('ability', { member: order[0], value: 'swiftswim' });
		assert(saved().run.team.every(mon => mon.hp === 0));
		assert.throws(() => cmd('retry'), /连续挑战/);
	});
	it('allows only event-unlocked abilities and labels native hidden abilities through evolution', () => {
		const id = member().id;
		assert.throws(() => cmd('ability', { member: id, value: 'chlorophyll' }), /尚未通过事件解锁/);
		assert.throws(() => cmd('unlockAbility', { member: id, value: 'chlorophyll' }), /未知/);
		engine.unlockAbility(user, id, 'Chlorophyll');
		cmd('ability', { member: id, value: 'chlorophyll' });
		assert(member().abilityPool.find(entry => entry.id === 'chlorophyll').hidden);
		store.change(user, account => { evolveMember(account.run, account.run.team[0], 'Ivysaur'); });
		assert.equal(member().set.ability, 'Chlorophyll');
		assert(member().abilityPool.find(entry => entry.id === 'chlorophyll').hidden);
	});
	it('enforces EV caps, preserves damage, and permits a single event respec with a conserved budget', () => {
		const id = member().id;
		store.change(user, account => {
			const mon = account.run.team[0];
			mon.set.evs = { ...stats(0), atk: 251, spe: 252, spa: 5 };
			rebuildMember(mon, account.run.boosts);
			mon.hp -= 5; mon.pp[0].pp = 3;
		});
		assert.throws(() => cmd('evs', { member: id, evs: stats(0) }), /特殊事件/);
		engine.unlockEVRespec(user, id);
		store.change(user, account => { gainEffort(account.run, account.run.team[0], { ...stats(0), atk: 3, spa: 3 }); });
		assert.deepEqual(member().set.evs, { ...stats(0), atk: 252, spe: 252, spa: 6 });
		assert.equal(member().evRespec.total, 510);
		assert.throws(() => cmd('evs', { member: id, evs: { ...stats(0), hp: 510 } }), /252/);
		assert.throws(() => cmd('evs', { member: id, evs: stats(0) }), /恰好分配/);
		cmd('evs', { member: id, evs: { ...stats(0), hp: 252, def: 252, spd: 6 } });
		assert.equal(member().maxhp - member().hp, 5);
		assert.equal(member().pp[0].pp, 3);
		assert(!member().evRespec);
		assert.throws(() => cmd('evs', { member: id, evs: stats(0) }), /特殊事件/);
	});
	it('awards defeat EVs once and retains them when the next encounter is lost', () => {
		store.change(user, account => {
			account.run.team.push(createRoguePokemon(set('Bulbasaur', 'Overgrow'), stats(0), 'bench'));
			account.run.team.push(createRoguePokemon(set('Bulbasaur', 'Overgrow'), stats(0), 'fainted'));
			account.run.team[2].hp = 0;
			account.run.checkpoint.team = structuredClone(account.run.team);
		});
		cmd('select', { value: 'grass' }); cmd('battle');
		const run = saved().run;
		const result = { encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag,
			defeated: [{ species: 'Rattata', level: 1, participants: [run.team[0].id], eligible: [run.team[0].id, 'bench'] }] };
		engine.settle(user, run.battle.token, result);
		assert.deepEqual(saved().run.team.map(mon => mon.set.evs.spe), [1, 1, 0]);
		const settled = saved();
		engine.settle(user, run.battle.token, result);
		assert.deepEqual(saved(), settled);
		cmd('battle'); const next = saved().run;
		for (const mon of next.team) mon.hp = 0;
		engine.settle(user, next.battle.token, { encounterId: next.battle.encounterId, won: false, team: next.team, bag: next.bag });
		assert.equal(saved().run.encounter, 1);
		assert.deepEqual(saved().run.team.map(mon => mon.set.evs.spe), [1, 1, 0]);
	});
	it('carries move memory through a real battle, marks catches separately, and restores memory only for living members', () => {
		store.change(user, account => {
			rememberMove(account.run.team[0], 'vinewhip');
			account.run.team[0].pp[0].pp = 3;
		});
		cmd('select', { value: 'grass' }); cmd('battle');
		const run = saved().run;
		battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: engine.battleState(user),
			p1: { name: 'Human', team: run.team.map(mon => mon.set) },
			p2: { name: 'Wild', team: run.node.encounters[0].team } });
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		battle.choose('p1', 'rogueball pokeball'); battle.choose('p2', 'move 1');
		const result = rogueBattleResult(battle);
		assert(result.defeated[0].captured);
		engine.settle(user, run.battle.token, result);
		assert.deepEqual(member().set.evs, stats(0));
		assert(member().moveMemory.some(move => move.id === 'vinewhip'));
		const id = member().id;
		cmd('setmove', { member: id, slot: 0, value: 'vinewhip' });
		cmd('setmove', { member: id, slot: 0, value: 'tackle' });
		assert.equal(member().pp[0].pp, 3);
		store.change(user, account => {
			account.run.phase = 'rest';
			account.run.team[0].moveMemory.find(move => move.id === 'vinewhip').pp = 0;
			account.run.team[1].hp = 0; account.run.team[1].pp[0].pp = 0;
		});
		cmd('heal');
		assert(member().moveMemory.every(move => move.pp === move.maxpp));
		assert.equal(saved().run.team[1].hp, 0);
		assert.equal(saved().run.team[1].pp[0].pp, 0);
	});
	it('awards one growth point per boss victory, never on loss or replayed settlement', () => {
		store.change(user, account => {
			account.points = 7;
			account.run.floor = 10; account.run.phase = 'ready'; account.run.node = content().floors[10][0];
		});
		cmd('battle'); let run = saved().run;
		engine.settle(user, run.battle.token, { encounterId: run.battle.encounterId, won: false, team: run.team, bag: run.bag });
		assert.equal(saved().points, 7); cmd('battle');
		run = saved().run;
		const result = { encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag };
		engine.settle(user, run.battle.token, result); engine.settle(user, run.battle.token, result);
		assert.equal(saved().points, 8); assert.equal(saved().run.lastReward.points, 1);
		assert.throws(() => cmd('upgrade', { value: 'hp' }), /进行中的冒险/);
	});
	it('has known effort yields for every preview opponent and resolves Fantasy base species', () => {
		assert.deepEqual(rogueEffortYield('Bulbasaur'), { ...stats(0), spa: 1 });
		assert.deepEqual(rogueEffortYield('Rattata'), { ...stats(0), spe: 1 });
		assert.deepEqual(rogueEffortYield('Mewtwo-Fantasy'), rogueEffortYield('Mewtwo'));
		for (const nodes of Object.values(createPreviewContent().floors)) {
			for (const node of nodes) for (const encounter of node.encounters) for (const mon of encounter.team) {
				assert(Object.values(rogueEffortYield(mon.species)).every(value => Number.isInteger(value) && value >= 0));
			}
		}
	});
});
