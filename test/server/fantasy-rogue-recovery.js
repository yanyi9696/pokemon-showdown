'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { rememberMove, rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
const { healingLocked } = require('../../dist/server/fantasy-rogue/team');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue encounter recovery', () => {
	let store, engine, battle;
	const user = 'roguerecovery';
	const saved = () => store.get(user);
	const cmd = (action, data = {}) => engine.command(user, { id: randomUUID(), revision: saved().revision, action, ...data });
	function finish(won, change = () => {}) {
		const run = saved().run;
		const result = { encounterId: run.battle.encounterId, won, team: run.team, bag: run.bag };
		change(result);
		engine.settle(user, run.battle.token, result);
		return { token: run.battle.token, result };
	}
	beforeEach(() => {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content());
		cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'grass' });
	});
	afterEach(() => {
		battle?.destroy(); battle = undefined; store.close();
	});
	it('keeps the third encounter and all spent resources after a wipe, then permits reviving and replaying it', () => {
		store.change(user, account => { account.run.bag.revive = 1; });
		for (let i = 0; i < 2; i++) {
			cmd('battle'); finish(true, result => { result.team[0].pp[0].pp--; });
		}
		const before = saved().run;
		cmd('battle');
		const ticket = saved().run.battle;
		const lost = finish(false, result => {
			result.team[0].hp = 0; result.team[0].pp[0].pp -= 2;
			result.bag.failball--;
		});
		const after = saved();
		assert.equal(after.run.phase, 'ready'); assert.equal(after.run.recovery, 'defeat');
		assert.equal(after.run.floor, 1); assert.equal(after.run.encounter, 2);
		assert.equal(after.run.money, before.money); assert.equal(after.points, 0);
		assert.equal(after.run.team[0].hp, 0); assert.equal(after.run.team[0].pp[0].pp, 31);
		assert.equal(after.run.bag.failball, 1);
		engine.settle(user, lost.token, lost.result);
		assert.deepEqual(saved(), after);
		assert.throws(() => cmd('battle'), /复活/);
		assert.throws(() => cmd('retry'), /连续挑战/);
		cmd('use', { value: 'revive', member: before.team[0].id }); cmd('battle');
		assert.equal(saved().run.battle.encounterId, ticket.encounterId);
		assert.notEqual(saved().run.battle.token, ticket.token);
		assert.deepEqual(saved().run.node.encounters[2], before.node.encounters[2]);
		assert.equal(engine.battleState(user).team[0].pp[0].pp, 31);
		assert.equal(saved().run.bag.revive, 0);
		finish(true);
		assert.equal(saved().run.floor, 2); assert.equal(saved().run.money, before.money + 30);
	});
	it('settles a real retreat snapshot without refunding HP, status, PP, held items or balls', () => {
		store.change(user, account => { account.run.team[0].set.item = 'Oran Berry'; });
		cmd('battle'); const run = saved().run;
		battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: engine.battleState(user),
			p1: { name: 'Human', team: run.team.map(mon => mon.set) },
			p2: { name: 'Wild', team: [set('Magikarp', 'Swift Swim', 1, ['Splash'])] } });
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		battle.choose('p1', 'move 2'); battle.choose('p2', 'move 1');
		battle.choose('p1', 'rogueball failball'); battle.choose('p2', 'move 1');
		const mon = battle.p1.active[0];
		mon.hp -= 2; mon.setStatus('par'); mon.setItem('');
		battle.p2.active[0].hp = 1;
		battle.p2.active[0].setStatus('par');
		const hp = mon.hp;
		const request = { id: randomUUID(), revision: saved().revision, action: 'retreat' };
		engine.command(user, request); engine.command(user, request);
		battle.win('Wild');
		const result = rogueBattleResult(battle);
		engine.settle(user, run.battle.token, result);
		assert.equal(saved().run.recovery, 'retreat'); assert.equal(saved().run.encounter, 0);
		assert.equal(saved().run.team[0].hp, hp); assert.equal(saved().run.team[0].status, 'par');
		assert.equal(saved().run.team[0].set.item, ''); assert.equal(saved().run.team[0].pp[1].pp, 39);
		assert.equal(saved().run.bag.failball, 1); assert.equal(saved().run.money, 100);
		const settled = saved(); engine.command(user, request); engine.settle(user, run.battle.token, result);
		assert.deepEqual(saved(), settled);
		cmd('battle'); battle.destroy();
		battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: engine.battleState(user),
			p1: { name: 'Human', team: saved().run.team.map(member => member.set) },
			p2: { name: 'Wild', team: run.node.encounters[0].team } });
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		assert.equal(battle.p1.active[0].hp, hp);
		assert.equal(battle.p1.active[0].moveSlots[1].pp, 39);
		assert.equal(battle.p2.active[0].hp, battle.p2.active[0].maxhp);
		assert.equal(battle.p2.active[0].status, '');
		assert.equal(battle.p2.active[0].boosts.atk, 0);
		assert.equal(battle.p2.active[0].moveSlots[0].pp, 40);
	});
	it('charges exactly 5000 once and revives and fully restores the entire team without advancing the encounter', () => {
		store.change(user, account => {
			const run = account.run;
			run.encounter = 2; run.money = 5000; run.recovery = 'defeat';
			run.team.push(createRoguePokemon(set('Magikarp', 'Swift Swim'), stats(0)));
			for (const mon of run.team) {
				rememberMove(mon, 'splash');
				mon.hp = 0; mon.status = 'psn'; mon.statusState = { stage: 3 };
				for (const slot of [...mon.pp, ...mon.moveMemory]) slot.pp = 0;
			}
		});
		const before = saved().run;
		assert(engine.canEmergency(before));
		const request = { id: randomUUID(), revision: saved().revision, action: 'emergency' };
		engine.command(user, request); engine.command(user, request);
		const after = saved().run;
		assert.equal(after.money, 0); assert.equal(after.encounter, 2); assert.equal(after.floor, 1);
		assert.deepEqual(after.bag, before.bag);
		for (const mon of after.team) {
			assert.equal(mon.hp, mon.maxhp); assert.equal(mon.status, ''); assert.deepEqual(mon.statusState, {});
			assert([...mon.pp, ...mon.moveMemory].every(slot => slot.pp === slot.maxpp));
		}
		assert.throws(() => cmd('emergency'), /全队濒死/);
	});
	it('refuses emergency treatment while alive, while holding revives, or with insufficient funds', () => {
		for (const situation of [
			{ hp: 1, money: 5000, revive: 0 }, { hp: 0, money: 5000, revive: 1 }, { hp: 0, money: 4999, revive: 0 },
		]) {
			store.change(user, account => {
				account.run.team[0].hp = situation.hp; account.run.money = situation.money; account.run.bag.revive = situation.revive;
			});
			const before = saved();
			assert.throws(() => cmd('emergency'), /全队濒死|5000/);
			assert.deepEqual(saved(), before);
		}
	});
	it('blocks healing after a continuous challenge begins, including after retreat, and permits its checkpoint retry', () => {
		store.change(user, account => {
			account.run.node.noHealing = true; account.run.bag.revive = 1; account.run.team[0].hp = 0;
		});
		assert(!healingLocked(saved().run));
		cmd('use', { value: 'revive', member: saved().run.team[0].id });
		cmd('battle'); cmd('retreat'); finish(false);
		assert(healingLocked(saved().run));
		assert.throws(() => cmd('use', { value: 'revive', member: saved().run.team[0].id }), /连续战斗/);
		assert.throws(() => cmd('emergency'), /允许场外治疗/);
		cmd('battle'); finish(false, result => { result.team[0].hp = 0; });
		assert.equal(saved().run.phase, 'failed');
		cmd('retry');
		assert.equal(saved().run.encounter, 0); assert(!healingLocked(saved().run));
		assert.deepEqual(saved().run.team, saved().run.checkpoint.team);
	});
	it('migrates legacy PP in the party, move memory, pending catches and checkpoints once, preserving uses spent', () => {
		store.change(user, account => {
			const run = account.run; const mon = run.team[0];
			mon.pp[0] = { id: 'tackle', pp: 51, maxpp: 56 };
			mon.pp[1] = { id: 'growl', pp: 1, maxpp: 64 };
			mon.moveMemory.push({ id: 'vinewhip', pp: 37, maxpp: 40 });
			run.checkpoint.team = structuredClone(run.team); run.pendingCapture = structuredClone(mon);
		});
		engine.migrate(user);
		for (const mon of [...saved().run.team, ...saved().run.checkpoint.team, saved().run.pendingCapture]) {
			assert.deepEqual(mon.pp, [{ id: 'tackle', pp: 30, maxpp: 35 }, { id: 'growl', pp: 0, maxpp: 40 }]);
			assert.deepEqual(mon.moveMemory.find(move => move.id === 'vinewhip'), { id: 'vinewhip', pp: 22, maxpp: 25 });
		}
		const migrated = saved(); engine.migrate(user); assert.deepEqual(saved(), migrated);
	});
	it('uses base PP for new and remembered moves, rebuilt members and both battle sides, leaving normal formats unchanged', () => {
		const mon = saved().run.team[0]; rememberMove(mon, 'vinewhip');
		mon.set.moves = ['vinewhip', 'growl']; rebuildMember(mon, stats(0));
		assert.equal(mon.pp[0].maxpp, 25); assert.equal(mon.pp[0].pp, 25);
		assert.equal(mon.pp[1].maxpp, 40);
		cmd('battle'); const state = engine.battleState(user);
		battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: state,
			p1: { name: 'Human', team: state.team.map(member => member.set) }, p2: { name: 'Wild', team: [set()] } });
		assert.equal(battle.p1.pokemon[0].moveSlots[0].maxpp, 35);
		assert.equal(battle.p2.pokemon[0].moveSlots[0].maxpp, 35);
		battle.destroy();
		battle = new Battle({ formatid: 'gen9customgame', p1: { name: 'One', team: [set()] }, p2: { name: 'Two', team: [set()] } });
		assert.equal(battle.p1.pokemon[0].moveSlots[0].maxpp, 56);
	});
	it('migrates a legacy failed ordinary floor to fainted recovery without resetting its encounter or rewards', () => {
		store.change(user, account => {
			account.run.phase = 'failed'; account.run.encounter = 2; account.run.money = 789;
		});
		engine.migrate(user);
		assert.equal(saved().run.phase, 'ready'); assert.equal(saved().run.recovery, 'defeat');
		assert.equal(saved().run.encounter, 2); assert.equal(saved().run.money, 789); assert.equal(saved().run.team[0].hp, 0);
	});
});
