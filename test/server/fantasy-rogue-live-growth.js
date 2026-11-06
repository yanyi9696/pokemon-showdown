'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { applyRogueGrowth } = require('../../dist/sim/rogue-growth');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { experienceAtLevel, rogueSpeciesData } = require('../../dist/sim/fantasy-rogue-rules');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { challengeNode } = require('../../dist/server/fantasy-rogue/optional-challenges');
const { content, set, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue live battle growth', function () {
	this.timeout(20000);
	let store, engine, data, battle, messages, token;
	const user = 'livegrowthqa';
	const account = () => store.get(user);
	const cmd = (action, extra = {}) => commandAfterOpening(engine, user, {
		id: randomUUID(), revision: account().revision, action, ...extra,
	});
	function start(member = set('Bulbasaur', 'Overgrow', 8, ['Tackle', 'Growl', 'Vine Whip', 'Growth'])) {
		cmd('setdifficulty', { value: '0' });
		cmd('start', { starters: ['bulbasaur'] });
		cmd('select', { value: 'grass' });
		store.change(user, a => {
			a.run.team = [createRoguePokemon(member, a.run.boosts)];
			a.run.team[0].experience = experienceAtLevel(rogueSpeciesData(member.species).growth, member.level + 1) - 1;
			a.run.node.encounters[0].team = Array.from({ length: 3 }, () => set('Magikarp', 'Swift Swim', 5, ['Splash']));
		});
	}
	function enterBattle() {
		cmd('battle');
		const run = account().run, state = engine.battleState(user);
		token = run.battle.token;
		messages = [];
		battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: state, seed: [1, 2, 3, 4],
			p1: { name: 'Human', team: state.team.map(mon => mon.set) },
			p2: { name: 'Wild', team: state.opponentSlots.map(i => run.node.encounters[run.encounter].team[i]) },
			send(type, payload) {
				if (type === 'fantasyrogueprogress' || type === 'fantasyroguecapture') messages.push({ type, data: JSON.parse(payload) });
			},
		});
		battle.makeChoices('team 1', 'team 1');
	}
	function acknowledge() {
		const run = store.change(user, a => {
			a.run.battle.growthPaused = !!a.run.pendingMoves?.length || a.run.team.some(mon => mon.hp > 0 && mon.evolutionNotice);
			a.run.battle.growthRevision = (a.run.battle.growthRevision || 0) + 1;
			if (a.run.battle.checkpoint) {
				a.run.battle.checkpoint.team = structuredClone(a.run.team);
				a.run.battle.checkpoint.bag = { ...a.run.bag };
			}
		}).run;
		const update = { sequence: run.battle.growthSequence, revision: run.battle.growthRevision,
			team: run.team, bag: run.bag, paused: run.battle.growthPaused };
		applyRogueGrowth(battle, update);
		return update;
	}
	function checkpoint() {
		const message = messages.shift();
		assert.equal(message?.type, 'fantasyrogueprogress');
		engine.progressBattle(user, token, message.data.sequence, message.data.result);
		acknowledge();
		return message.data;
	}
	function skipGrowth() {
		for (let i = 0; i < 30; i++) {
			const run = account().run;
			if (run.pendingMoves?.length) cmd('learn', { member: run.pendingMoves[0].member, value: 'skip' });
			else if (run.team.some(mon => mon.evolutionNotice)) cmd('evolutionnotice', { member: run.team.find(mon => mon.evolutionNotice).id });
			else break;
			acknowledge();
		}
		assert(!battle.fantasyRogue.growthWaiting);
	}
	function knockOut() {
		battle.p2.active[0].hp = 1;
		battle.makeChoices('move 1', 'move 1');
	}
	beforeEach(() => {
		store = new RogueStore(':memory:'); data = content(); data.progression = true;
		for (const item of data.items) if (item.kind === 'ball') item.multiplier = 1;
		engine = new RogueEngine(store, data, () => 0);
	});
	afterEach(() => {
		battle?.destroy(); battle = null; store.close();
	});

	it('awards each KO before the next enemy and pauses for learning without restoring spent PP', () => {
		start(); enterBattle();
		const mon = battle.p1.active[0], before = account().run.team[0].experience;
		knockOut();
		assert(!battle.ended); assert(battle.fantasyRogue.growthWaiting);
		assert(battle.p1.activeRequest.wait);
		checkpoint();
		const run = account().run;
		assert(run.team[0].experience > before); assert.equal(run.team[0].set.level, 9);
		assert(run.battle.growthPaused); assert(run.pendingMoves.some(move => move.move === 'leechseed'));
		assert.equal(mon.level, 9); assert.equal(mon.moveSlots[0].pp, 34);
		assert(battle.log.some(line => line.startsWith('|-roguegrowth|')));
		cmd('learn', { member: mon.set.fantasyRogueId, value: '1' }); acknowledge();
		assert(!battle.fantasyRogue.growthWaiting); assert.equal(mon.moveSlots[1].id, 'leechseed');
		assert.equal(mon.moveSlots[0].pp, 34);
		battle.makeChoices('pass', 'switch 2');
		battle.makeChoices('move 1', 'move 1');
		assert.equal(mon.baseMoveSlots[0], mon.moveSlots[0]);
		assert.equal(rogueBattleResult(battle, false).team[0].pp[0].pp, 33);
	});
	it('allows confirmed evolution during battle and resumes the same opponents', () => {
		start(set('Charmander', 'Blaze', 15, ['Scratch', 'Growl', 'Ember', 'Smokescreen'])); enterBattle();
		const identity = battle.p1.active[0].fullname;
		knockOut(); checkpoint();
		const id = account().run.team[0].id;
		assert(account().run.team[0].evolutionNotice);
		cmd('evolve', { member: id, value: 'charmeleon' }); acknowledge(); skipGrowth();
		assert.equal(battle.p1.active[0].species.name, 'Charmeleon');
		assert.equal(battle.p1.active[0].baseSpecies.name, 'Charmeleon');
		assert.equal(battle.p1.active[0].fullname, identity, 'evolution must preserve the protocol identity');
		assert.equal(battle.p1.active[0].level, 16);
		assert.equal(battle.p2.pokemonLeft, 2);
		battle.makeChoices('pass', 'switch 2');
		battle.makeChoices('move 1', 'move 1');
		if (battle.fantasyRogue.growthWaiting) { checkpoint(); skipGrowth(); }
		assert(!battle.ended); assert.equal(battle.p2.pokemonLeft, 1);
		assert(battle.p2.activeRequest.forceSwitch[0]);
		battle.makeChoices('pass', 'switch 3');
		assert.equal(battle.turn, 3);
	});
	it('retains each permanent HP gain exactly once across growth checkpoints and final settlement', () => {
		start(set('Snorlax', 'Immunity', 50, ['Tackle']));
		store.change(user, a => {
			a.run.team[0].experience = experienceAtLevel(rogueSpeciesData('Snorlax').growth, 50);
			normalizeBlessings(a.run);
			a.run.blessings.owned.push({ ...blessing('hpgrowth'), floor: 1 });
		});
		enterBattle();
		for (let defeated = 1; defeated <= 3; defeated++) {
			knockOut();
			if (defeated < 3) {
				checkpoint(); skipGrowth();
			} else {
				engine.settle(user, token, rogueBattleResult(battle));
			}
			const saved = account().run.team[0];
			assert.equal(saved.bonusHP, defeated * 2);
			assert.equal(saved.statModifiers.hp, defeated * 2);
			assert.equal(battle.p1.active[0].baseMaxhp, saved.maxhp);
			if (defeated < 3) {
				assert.equal(rogueBattleResult(battle, false).team[0].bonusHP, defeated * 2);
				battle.makeChoices('pass', 'switch ' + (defeated + 1));
			}
		}
	});
	it('deduplicates progress, rejects stale packets and does not award settled KOs twice', () => {
		start(); enterBattle(); knockOut();
		const progress = checkpoint(); skipGrowth();
		const before = account().run.team[0].experience;
		engine.progressBattle(user, token, progress.sequence, progress.result);
		engine.progressBattle(user, 'stale-token', progress.sequence + 1, progress.result);
		assert.equal(account().run.team[0].experience, before);
		const revision = battle.fantasyRogue.growthRevision;
		applyRogueGrowth(battle, { sequence: 1, revision: revision - 1, team: [], bag: {}, paused: false });
		assert.equal(battle.fantasyRogue.growthRevision, revision);
		cmd('retreat'); const result = rogueBattleResult(battle);
		engine.settle(user, token, result);
		assert.equal(account().run.team[0].experience, before);
		assert.equal(account().run.experienceReceipts.length, 1);
		battle.destroy(); battle = null;
		enterBattle(); knockOut(); checkpoint();
		assert.equal(account().run.team[0].experience, before, 'same foe after retreat cannot farm EXP');
	});
	it('preserves temporary moves, status, boosts and missing HP through growth updates', () => {
		start(); enterBattle();
		const mon = battle.p1.active[0];
		mon.setStatus('brn'); mon.boosts.def = 2;
		mon.hp -= 3;
		mon.moveSlots[1] = { move: 'Splash', id: 'splash', pp: 3, maxpp: 5, target: 'self', disabled: false, disabledSource: '', used: true, virtual: true };
		knockOut(); const missingHP = mon.maxhp - mon.hp; checkpoint();
		assert.equal(mon.status, 'brn'); assert.equal(mon.boosts.def, 2);
		assert.equal(mon.maxhp - mon.hp, missingHP); assert.equal(mon.moveSlots[1].id, 'splash');
		assert.equal(mon.moveSlots[1].pp, 3); assert.equal(mon.baseMoveSlots[1].id, 'growl');
		assert.equal(rogueBattleResult(battle, false).team[0].set.moves[1], 'Growl');
	});
	it('keeps transformed stats and copied moves, while updating the original party member', () => {
		start(set('Ditto', 'Limber', 8, ['Transform']));
		store.change(user, a => { a.run.node.encounters[0].team[0].moves = ['Splash', 'Tackle']; });
		enterBattle();
		const mon = battle.p1.active[0];
		battle.makeChoices('move 1', 'move 1');
		const copied = { ...mon.storedStats }; mon.moveSlots[1].pp = 2;
		battle.p2.active[0].hp = 1;
		battle.makeChoices('move 2', 'move 1'); checkpoint();
		assert(mon.transformed); assert.equal(mon.species.name, 'Magikarp');
		assert.deepEqual(mon.storedStats, copied); assert.equal(mon.moveSlots[1].pp, 1);
		assert.equal(mon.moveSlots[0].id, 'splash'); assert.equal(mon.baseMoveSlots[0].id, 'transform');
		assert.equal(account().run.team[0].set.species, 'Ditto');
		assert.equal(rogueBattleResult(battle, false).team[0].set.species, 'Ditto');
	});
	it('rolls back an interrupted checkpoint transaction and can retry it safely', () => {
		start(); enterBattle(); knockOut();
		const progress = messages.shift().data;
		const before = account();
		assert.throws(() => store.change(user, () => {
			engine.progressBattle(user, token, progress.sequence, progress.result);
			throw new Error('injected write failure');
		}), /injected write failure/);
		assert.deepEqual(account(), before);
		engine.progressBattle(user, token, progress.sequence, progress.result); acknowledge();
		assert.equal(account().run.experienceReceipts.length, 1);
	});
	it('settles the final KO once and emits growth only after a successful save', () => {
		start(); enterBattle(); knockOut();
		checkpoint(); skipGrowth();
		battle.makeChoices('pass', 'switch 2');
		knockOut(); checkpoint(); skipGrowth();
		battle.makeChoices('pass', 'switch 3');
		const before = account(); knockOut();
		assert(battle.ended); assert.equal(messages.length, 0, 'the last KO must not wait for a nonexistent next turn');
		const result = rogueBattleResult(battle), emitted = [];
		store.db.exec("CREATE TEMP TRIGGER fail_final_save BEFORE INSERT ON rogue_accounts BEGIN SELECT RAISE(ABORT, 'injected final save failure'); END");
		try {
			assert.throws(() => engine.settle(user, token, result, notices => emitted.push(...notices)), /injected final save failure/);
		} finally { store.db.exec('DROP TRIGGER fail_final_save'); }
		assert.deepEqual(account(), before); assert.deepEqual(emitted, []);
		engine.settle(user, token, result, notices => emitted.push(...notices));
		const saved = account();
		assert(saved.run.team[0].experience > before.run.team[0].experience);
		assert.equal(saved.run.experienceReceipts.length, 3); assert.equal(emitted.length, 1);
		engine.settle(user, token, result, notices => emitted.push(...notices));
		assert.deepEqual(account().run, saved.run); assert.equal(emitted.length, 1);
	});
	it('recovers a disconnected battle from its checkpoint without losing learned moves or duplicating EXP', () => {
		start(); enterBattle();
		knockOut(); checkpoint();
		cmd('learn', { member: account().run.team[0].id, value: '1' }); acknowledge();
		const before = account().run;
		engine.recover(user, token);
		const saved = account().run;
		assert.equal(saved.phase, 'ready'); assert(!saved.battle);
		assert.equal(saved.team[0].experience, before.team[0].experience);
		assert.equal(saved.team[0].set.moves[1], 'leechseed');
		assert.equal(saved.team[0].pp[0].pp, 34); assert.equal(saved.experienceReceipts.length, 1);
		engine.recover(user, token); assert.deepEqual(account().run, saved);
		battle.destroy(); battle = null;
		enterBattle(); knockOut(); checkpoint();
		assert.equal(account().run.team[0].experience, before.team[0].experience);
	});
	for (const exit of ['retreat', 'loss', 'disconnect', 'win']) {
		it(`handles provisional evolution and experience on challenge ${exit}`, () => {
			start(set('Charmander', 'Blaze', 15, ['Scratch', 'Growl', 'Ember', 'Smokescreen']));
			store.change(user, a => {
				a.run.floor = 5; a.run.phase = 'event'; a.run.node = challengeNode('dojoinvitation', 5);
				a.run.node.encounters[0].team = Array.from({ length: 3 }, () => set('Magikarp', 'Swift Swim', 5, ['Splash']));
			});
			cmd('challenge', { value: 'accept' }); enterBattle();
			const before = account().run;
			knockOut(); checkpoint();
			cmd('evolve', { member: before.team[0].id, value: 'charmeleon' }); acknowledge(); skipGrowth();
			assert.equal(battle.p1.active[0].species.name, 'Charmeleon');
			const result = rogueBattleResult(battle); result.won = exit === 'win';
			if (exit === 'retreat') cmd('retreat');
			if (exit === 'disconnect') engine.recover(user, token);
			else engine.settle(user, token, result);
			const saved = account().run;
			assert.equal(saved.node.challenge.stage, exit === 'win' ? 'won' : 'paused');
			if (exit === 'win') {
				assert.equal(saved.team[0].set.species, 'Charmeleon');
				assert(saved.team[0].experience > before.team[0].experience);
				assert.equal(saved.experienceReceipts.length, 1);
			} else {
				assert.equal(saved.team[0].set.species, 'Charmander');
				assert.equal(saved.team[0].experience, before.team[0].experience);
				assert.deepEqual(saved.team[0].moveMemory.map(move => move.id), before.team[0].moveMemory.map(move => move.id));
				assert.deepEqual(saved.pendingMoves, before.pendingMoves);
				assert.equal(saved.experienceReceipts.length, 0);
				assert.equal(saved.money, before.money);
			}
			assert.equal(saved.team[0].pp[0].pp, before.team[0].pp[0].pp - 1);
			engine.settle(user, token, result); assert.deepEqual(account().run, saved);
		});
	}
});
