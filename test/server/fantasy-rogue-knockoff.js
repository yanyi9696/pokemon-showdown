'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { applyRogueGrowth } = require('../../dist/sim/rogue-growth');
const { initializeExperience } = require('../../dist/server/fantasy-rogue/progression');
const { challengeNode } = require('../../dist/server/fantasy-rogue/optional-challenges');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { content, set, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue Knock Off equipment recovery', () => {
	let store, engine, data, battle, token;
	const user = 'knockoffrecoveryqa';
	const account = () => store.get(user);
	const cmd = (action, fields = {}) => commandAfterOpening(engine, user, {
		id: randomUUID(), revision: account().revision, action, ...fields,
	});
	beforeEach(() => {
		store = new RogueStore(':memory:'); data = content();
		engine = new RogueEngine(store, data, () => 0);
	});
	afterEach(() => {
		battle?.destroy(); battle = undefined; store.close();
	});
	function begin(item = 'Choice Band', ability = 'Immunity', options = {}) {
		if (options.progression) engine.content.progression = true;
		cmd('setdifficulty', { value: '0' }); cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'grass' });
		store.change(user, a => {
			a.run.team = [createRoguePokemon({ ...set('Snorlax', ability, 50, ['Splash', 'Tackle', 'Thief', 'Recycle']), item }, a.run.boosts)];
			initializeExperience(a.run.team[0]);
			if (options.spirit) { a.run.spirit = options.spirit; a.run.spiritVersion = 1; }
			if (options.challenge) {
				a.run.floor = 5; a.run.phase = 'event'; a.run.node = challengeNode('dojoinvitation', 5);
			}
			a.run.node.encounters[0].team = Array.from({ length: options.progression ? 2 : 1 }, () =>
				({ ...set('Mew', 'Synchronize', 5, ['Knock Off', 'Splash']), item: options.enemyItem || '' }));
		});
		if (options.challenge) cmd('challenge', { value: 'accept' });
		cmd('battle'); token = account().run.battle.token;
		const state = engine.battleState(user);
		battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: state, seed: [1, 2, 3, 4],
			p1: { name: 'Human', team: state.team.map(mon => mon.set) },
			p2: { name: 'Enemy', team: account().run.node.encounters[0].team } });
		battle.makeChoices('team 1', 'team 1');
		return battle.p1.active[0];
	}
	function knockOff(mon) { battle.actions.useMove('knockoff', battle.p2.active[0], { target: mon }); }
	function settle(exit = 'win') {
		if (exit === 'retreat') cmd('retreat');
		battle.win(exit === 'win' ? battle.p1 : battle.p2);
		const result = rogueBattleResult(battle);
		engine.settle(user, token, result);
		return result;
	}
	it('restores a knocked-off Choice Band after victory without restoring it during the battle', () => {
		const mon = begin(); knockOff(mon);
		assert.equal(mon.item, ''); assert(!mon.hasItem('choiceband'));
		assert(battle.log.some(line => line.includes('[from] move: Knock Off')));
		const hp = mon.hp; mon.baseMoveSlots[1].pp--;
		settle();
		const saved = account().run.team[0];
		assert.equal(saved.set.item, 'choiceband');
		assert.equal(saved.hp, hp); assert.equal(saved.pp[1].pp, mon.baseMoveSlots[1].pp);
	});
	for (const exit of ['retreat', 'loss']) it(`returns equipment after ${exit} without changing the exit outcome`, () => {
		const mon = begin(); knockOff(mon);
		if (exit === 'loss') mon.hp = 0;
		const hp = mon.hp, before = account().run.money;
		settle(exit);
		const saved = account().run;
		assert.equal(saved.team[0].set.item, 'choiceband'); assert.equal(saved.team[0].hp, hp);
		assert.equal(saved.money, before);
		assert.equal(saved.phase, exit === 'retreat' ? 'ready' : 'defeated');
	});
	for (const item of ['Sitrus Berry', 'Focus Sash']) it(`does not restore a normally consumed ${item}`, () => {
		const mon = begin(item);
		if (item === 'Sitrus Berry') {
			mon.hp = Math.floor(mon.maxhp / 3); assert(mon.eatItem());
		} else {
			assert(mon.useItem());
		}
		assert.equal(mon.item, ''); assert.equal(rogueBattleResult(battle).knockedOffItems, undefined);
		settle(); assert.equal(account().run.team[0].set.item, '');
	});
	it('returns a knocked-off berry but cannot recover it with Recycle during the same battle', () => {
		const mon = begin('Sitrus Berry'); knockOff(mon);
		battle.actions.useMove('recycle', mon, { target: mon }); assert.equal(mon.item, '');
		settle(); assert.equal(account().run.team[0].set.item, 'sitrusberry');
	});
	it('leaves failed Knock Off and ordinary item theft unchanged', () => {
		const mon = begin('Choice Band', 'Sticky Hold'); knockOff(mon);
		assert.equal(mon.item, 'choiceband'); assert.equal(rogueBattleResult(battle).knockedOffItems, undefined);
		mon.setAbility('immunity');
		battle.actions.useMove('thief', battle.p2.active[0], { target: mon });
		assert.equal(mon.item, ''); assert.equal(battle.p2.active[0].item, 'choiceband');
		assert.equal(rogueBattleResult(battle).knockedOffItems, undefined);
		settle(); assert.equal(account().run.team[0].set.item, '');
	});
	it('keeps a newly obtained item equipped and returns the original to the bag exactly once', () => {
		const mon = begin('Choice Band', 'Immunity', { enemyItem: 'Leftovers' }); knockOff(mon); knockOff(mon);
		battle.actions.useMove('thief', mon, { target: battle.p2.active[0] }); assert.equal(mon.item, 'leftovers');
		const outcome = settle(), saved = account().run;
		assert.equal(saved.team[0].set.item, 'leftovers'); assert.equal(saved.bag.choiceband, 1);
		assert.equal(outcome.knockedOffItems[mon.set.fantasyRogueId].length, 1);
		engine.settle(user, token, outcome); engine.settle(user, token, outcome);
		assert.deepEqual(account().run, saved);
	});
	it('returns two different items removed in one battle without overwriting either one', () => {
		const mon = begin('Choice Band', 'Immunity', { enemyItem: 'Leftovers' }); knockOff(mon);
		const foe = battle.p2.active[0]; foe.hp = foe.maxhp = 9999;
		battle.actions.useMove('thief', mon, { target: foe }); knockOff(mon);
		assert.equal(mon.item, ''); settle();
		assert.equal(account().run.team[0].set.item, 'choiceband'); assert.equal(account().run.bag.leftovers, 1);
	});
	it('restores after a simulator checkpoint reload while keeping the active item absent', () => {
		const mon = begin(); knockOff(mon);
		const snapshot = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(snapshot);
		assert.equal(battle.p1.active[0].item, '');
		assert.equal(rogueBattleResult(battle).knockedOffItems[mon.set.fantasyRogueId][0].item, 'choiceband');
		settle(); assert.equal(account().run.team[0].set.item, 'choiceband');
	});
	it('persists removal through live growth and recovers it once when the battle room is lost', () => {
		const mon = begin('Choice Band', 'Immunity', { progression: true }); knockOff(mon);
		battle.p2.active[0].hp = 1;
		assert(battle.choose('p1', 'move tackle'), battle.p1.choice.error);
		assert(battle.choose('p2', 'move 1'), battle.p2.choice.error);
		const outcome = rogueBattleResult(battle, false); assert.equal(outcome.defeated.length, 1, battle.log.slice(-30).join('\n'));
		engine.progressBattle(user, token, 1, outcome);
		const during = account().run;
		assert.equal(during.team[0].set.item, ''); assert.equal(during.bag.choiceband, undefined);
		assert(during.battle.checkpoint.knockedOffItems[during.team[0].id]);
		applyRogueGrowth(battle, { sequence: 1, revision: 1, team: during.team, bag: during.bag, paused: false });
		assert.equal(mon.item, '', 'growth acknowledgement must not re-enable Choice Band');
		engine.recover(user, token);
		const saved = account().run;
		assert.equal(saved.team[0].set.item, 'choiceband'); assert.equal(saved.phase, 'ready');
		assert.equal(saved.team[0].experience, during.team[0].experience);
		assert.equal(saved.team[0].pp[1].pp, during.team[0].pp[1].pp);
		engine.recover(user, token); engine.settle(user, token, outcome);
		assert.deepEqual(account().run, saved);
	});
	for (const exit of ['retreat', 'loss']) it(`preserves only original equipment after a failed challenge ${exit}`, () => {
		const mon = begin('Choice Band', 'Immunity', { challenge: true, enemyItem: 'Leftovers' }); knockOff(mon);
		battle.actions.useMove('thief', mon, { target: battle.p2.active[0] });
		assert.equal(mon.item, 'leftovers'); settle(exit);
		assert.equal(account().run.team[0].set.item, 'choiceband'); assert(!account().run.bag.leftovers);
		assert.equal(account().run.node.challenge.stage, 'paused');
	});
	it('does not reroll a Hoopa player-owned item and converts a removed foreign item only once', () => {
		data.items.push({ id: 'leftovers', name: '吃剩的东西', kind: 'held', price: 600 });
		const mon = begin('Choice Band', 'Immunity', { spirit: 'hoopagift', enemyItem: 'Leftovers' }); knockOff(mon);
		const foe = battle.p2.active[0]; foe.hp = foe.maxhp = 9999;
		battle.actions.useMove('thief', mon, { target: foe }); knockOff(mon);
		const outcome = settle(), saved = account().run;
		assert.equal(saved.team[0].set.item, 'choiceband'); assert.equal(saved.bag.fantasypowerlens, 1);
		assert.equal(Object.keys(saved.spiritConversions).length, 1);
		engine.settle(user, token, outcome); assert.deepEqual(account().run, saved);
	});
	it('keeps legacy checkpoints without removal evidence unchanged', () => {
		const mon = begin(); knockOff(mon);
		const outcome = rogueBattleResult(battle); delete outcome.knockedOffItems; outcome.won = true;
		engine.settle(user, token, outcome); assert.equal(account().run.team[0].set.item, '');
	});
	it('does not create recovery records in ordinary Showdown battles or for enemy equipment', () => {
		const mon = begin('', 'Immunity', { enemyItem: 'Choice Band' });
		battle.actions.useMove('knockoff', mon, { target: battle.p2.active[0] });
		assert.equal(battle.p2.active[0].item, ''); assert.equal(rogueBattleResult(battle).knockedOffItems, undefined);
		battle.destroy(); battle = new Battle({ formatid: 'gen9customgame', seed: [1, 2, 3, 4],
			p1: { team: [{ ...set('Snorlax', 'Immunity', 50, ['Splash']), item: 'Choice Band' }] },
			p2: { team: [set('Mew', 'Synchronize', 5, ['Knock Off'])] } });
		battle.makeChoices('team 1', 'team 1'); knockOff(battle.p1.active[0]);
		assert.equal(battle.p1.active[0].item, ''); assert.equal(battle.p1.active[0].m.rogueKnockedOffItems, undefined);
	});
});
