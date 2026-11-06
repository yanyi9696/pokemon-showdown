'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { chooseRogueRevival } = require('../../dist/sim/rogue-revival');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { awardRoguePoints } = require('../../dist/server/fantasy-rogue/difficulty');
const { awardFirstClears } = require('../../dist/server/fantasy-rogue/first-clears');
const { awardEcho, awardGodEcho, echoView } = require('../../dist/server/fantasy-rogue/echo');
const { rogueSaveCompatibilityIssues } = require('../../dist/server/fantasy-rogue/save-compatibility');
const { prepareElderMeeting, advanceMainline, mainlineView } = require('../../dist/server/fantasy-rogue/mainline');
const { content, set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue Nuzlocke and growth rewards', function () {
	this.timeout(20000);
	let store, engine, data, battle;
	const user = 'nuzlockeqa';
	const account = () => store.get(user);
	const cmd = (action, extra = {}) => commandAfterOpening(engine, user, {
		id: randomUUID(), revision: account().revision, action, ...extra,
	});
	const start = (nuzlocke = true) => {
		cmd('setdifficulty', { value: '0' });
		cmd('setnuzlocke', { value: nuzlocke ? 'on' : 'off' });
		cmd('start', { starters: ['bulbasaur'] });
		cmd('select', { value: 'grass' });
	};
	const enterBattle = (extra = {}) => {
		cmd('battle');
		const run = account().run, state = engine.battleState(user);
		Object.assign(state, extra);
		battle = new Battle({ formatid: 'gen9fantasyrogue', fantasyRogue: state, seed: [1, 2, 3, 4],
			p1: { name: 'Human', team: state.team.map(mon => mon.set) },
			p2: { name: 'Wild', team: run.node.encounters[run.encounter].team },
			send(type, payload) {
				if (type === 'fantasyroguenuzlocke') engine.nuzlockeProgress(user, run.battle.token, JSON.parse(payload));
			},
		});
		battle.makeChoices('team 1', 'team 1');
		return run.battle.token;
	};
	beforeEach(() => {
		store = new RogueStore(':memory:'); data = content();
		engine = new RogueEngine(store, data, () => 0);
	});
	afterEach(() => {
		if (battle) battle.destroy();
		battle = null;
		store.close();
	});
	it('requires an explicit tier, locks the mode in a run, and retains production unlock checks', () => {
		assert.equal(account().points, 20);
		assert.throws(() => cmd('setnuzlocke', { value: 'on' }), /先选择/);
		assert.throws(() => cmd('setdifficulty', { value: '5' }), /先通关/);
		cmd('setdifficulty', { value: '0' }); cmd('setnuzlocke', { value: 'on' });
		assert.throws(() => cmd('start', { starters: ['bulbasaur'], difficulty: 'easy' }), /Nuzlocke/);
		cmd('setdifficulty', { value: 'default' }); assert(!account().preferredNuzlocke);
		start(); assert.equal(account().run.nuzlocke.version, 1);
		assert.throws(() => cmd('setnuzlocke', { value: 'off' }), /锁定/);
		assert.throws(() => cmd('setdifficulty', { value: 'default' }), /锁定/);
		assert.equal(account().points, 20, 'initial account gift is not multiplied');
	});
	it('only exposes local tier/echo testing through the trusted engine mode', () => {
		assert(!echoView(account())); assert(echoView(account(), true).unlocked);
		engine.localSpirits = true;
		cmd('setdifficulty', { value: '5' }); cmd('setnuzlocke', { value: 'on' });
		cmd('start', { starters: ['bulbasaur'] });
		assert.equal(account().run.difficulty, 5); assert(account().run.difficultyTest);
		assert.equal(account().difficulties.highest, 0, 'testing does not forge clear evidence');
	});
	it('locks the first catchable target before a ball is thrown and preserves it through reconnect', () => {
		start(); const token = enterBattle();
		const target = battle.p2.active[0].set.fantasyRogueId;
		assert.equal(account().run.nuzlocke.encounters['0'].target, target);
		for (let i = 0; i < 2; i++) {
			battle.makeChoices('rogueball failball', 'move 1');
			assert(!battle.ended);
		}
		engine = new RogueEngine(store, data, () => 0); engine.migrate(user);
		assert.equal(engine.battleState(user).nuzlocke.target, target);
		battle.makeChoices('rogueball pokeball', 'move 1');
		assert(battle.ended);
		const result = rogueBattleResult(battle);
		engine.settle(user, token, result);
		assert.equal(account().captures.magikarp, 1);
		engine.settle(user, token, result);
		assert.equal(account().captures.magikarp, 1, 'duplicate settlement cannot duplicate capture');
	});
	it('forfeits capture on retreat, including a rematch of the same enemy, then opens the next segment', () => {
		start(); const token = enterBattle();
		cmd('retreat'); engine.settle(user, token, { ...rogueBattleResult(battle), won: false });
		battle.destroy(); battle = null;
		enterBattle();
		assert.equal(battle.choose('p1', 'rogueball pokeball'), false);
		assert.equal(account().run.bag.pokeball, 10);
		cmd('retreat'); engine.settle(user, account().run.battle.token, { ...rogueBattleResult(battle), won: false });
		battle.destroy(); battle = null;
		store.change(user, a => { a.run.floor = 11; a.run.phase = 'ready'; });
		enterBattle(); assert.equal(battle.choose('p1', 'rogueball pokeball'), true);
		assert.equal(Object.keys(account().run.nuzlocke.encounters).length, 2);
	});
	it('does not consume an encounter for trainers or gift partners and eggs', () => {
		start();
		store.change(user, a => {
			a.run.node.encounters[0].catchable = false;
			a.run.team.push(createRoguePokemon(set('Magikarp', 'Swift Swim'), a.run.boosts));
			const egg = createRoguePokemon(set('Magikarp', 'Swift Swim'), a.run.boosts);
			egg.egg = { remaining: 10, total: 10 }; a.run.team.push(egg);
		});
		enterBattle();
		assert.deepEqual(account().run.nuzlocke.encounters, {});
	});
	it('records fainting immediately, blocks revival, and keeps death through healing and withdrawal', () => {
		start();
		store.change(user, a => {
			a.run.team.push(createRoguePokemon(set('Chansey', 'Natural Cure'), a.run.boosts));
			a.run.bag.revive = 2;
		});
		const token = enterBattle();
		const dead = battle.p1.active[0]; dead.faint(battle.p2.active[0]); battle.faintMessages();
		const deadId = dead.set.fantasyRogueId;
		assert(account().run.nuzlocke.dead.includes(dead.set.fantasyRogueId));
		assert(account().run.team[0].nuzlockeDead);
		assert.equal(chooseRogueRevival(battle.p1, 'revive 1'), false);
		cmd('retreat'); engine.settle(user, token, { ...rogueBattleResult(battle), won: false });
		assert.equal(account().run.team[0].hp, 0);
		store.change(user, a => { for (const mon of a.run.team) mon.hp = mon.maxhp; });
		assert.equal(account().run.team[0].hp, 0, 'bulk healing cannot revive a permanently dead partner');
		const before = account();
		assert.throws(() => cmd('use', { member: dead.set.fantasyRogueId, value: 'revive' }), /永久死亡/);
		assert.throws(() => cmd('retry'), /重试/);
		assert.deepEqual(account(), before, 'invalid mutations roll back the complete account');
		assert.throws(() => store.change(user, a => { a.run.team.shift(); a.run.money += 1000; }), /兑换或融合/);
		assert.deepEqual(account(), before);
		battle.destroy(); battle = null; enterBattle();
		assert.equal(battle.p1.pokemon.length, 1);
		assert.equal(battle.p1.pokemon[0].species.name, 'Chansey');
		cmd('retreat'); engine.settle(user, account().run.battle.token, { ...rogueBattleResult(battle), won: false });
		cmd('release', { member: deadId, confirmed: true });
		assert.equal(account().run.team.length, 1);
	});
	it('ends a fully fainted run without emergency revival and keeps the species usable next run', () => {
		start(); const token = enterBattle();
		battle.p1.active[0].faint(battle.p2.active[0]); battle.faintMessages();
		engine.settle(user, token, rogueBattleResult(battle));
		assert.equal(account().run.phase, 'defeated');
		assert.equal(account().run.team[0].hp, 0);
		assert(!engine.canEmergency(account().run));
		cmd('ackfailure', { value: account().run.failure.key }); start(); assert(account().run.team[0].hp > 0);
		assert.deepEqual(account().run.nuzlocke.dead, []);
	});
	it('preserves permanent death when an out-of-battle loss is followed by a healing event', () => {
		start();
		store.change(user, a => {
			a.run.team.push(createRoguePokemon(set('Chansey', 'Natural Cure'), a.run.boosts));
			a.run.team[0].hp = 0;
		});
		const id = account().run.team[0].id;
		assert(account().run.nuzlocke.dead.includes(id));
		store.change(user, a => { for (const mon of a.run.team) mon.hp = mon.maxhp; });
		assert.equal(account().run.team[0].hp, 0);
		assert(account().run.team[1].hp > 0);
	});
	it('does not spend lives or a capture chance during an unaccepted companion rehearsal', () => {
		start();
		store.change(user, a => { a.run.preview = { stage: 'running', trainer: 'sada' }; });
		const token = enterBattle();
		battle.p1.active[0].faint(battle.p2.active[0]); battle.faintMessages();
		assert.deepEqual(account().run.nuzlocke, { version: 1, encounters: {}, dead: [] });
		engine.settle(user, token, rogueBattleResult(battle));
		assert.equal(account().run.preview.stage, 'result');
		assert.deepEqual(account().run.nuzlocke, { version: 1, encounters: {}, dead: [] });
		assert(account().run.team[0].hp > 0);
	});
	it('doubles twenty boss points to forty, god rewards to forty, and first-clear species to ten', () => {
		start();
		store.change(user, a => { a.points = 0; a.firstClearSpecies = ['1']; });
		for (let floor = 10; floor <= 200; floor += 10) {
			store.change(user, a => {
				const run = a.run;
				Object.assign(run, { floor, phase: 'ready', node: structuredClone(data.floors[20][0]), encounter: 0 });
				delete run.story; delete run.dialogue;
			});
			cmd('battle'); const run = account().run;
			const result = { encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag };
			engine.settle(user, run.battle.token, result); engine.settle(user, run.battle.token, result);
			assert.equal(account().points, floor / 5);
		}
		store.change(user, a => {
			const r = a.run;
			r.postgame = { stage: 'battle', before: structuredClone({ team: r.team, bag: r.bag, money: r.money }),
				node: structuredClone(data.floors[20][0]), encounter: 0 };
			engine.finishGodChallenge(a, r, 'won'); engine.finishGodChallenge(a, r, 'won');
		});
		assert.equal(account().points, 80); assert.equal(account().run.lastReward.points, 40);
		store.change(user, a => {
			a.firstClearSpecies = []; delete a.run.firstClearRewardsRecorded;
			a.run.phase = 'complete'; assert.equal(awardFirstClears(a, a.run), 10);
		});
		store.change(user, a => { assert.equal(awardFirstClears(a, a.run), 0); });
		assert.equal(account().points, 90);
	});
	it('keeps standard/easy and direct collapse echo awards unchanged', () => {
		const a = { points: 0 };
		assert.equal(awardRoguePoints(a, { difficulty: 0 }, 20), 20);
		assert.equal(awardRoguePoints(a, { difficulty: 'easy' }, 20), 0);
		const r = { floor: 200, difficulty: 1, collapse: ['power', 'vitality'], nuzlocke: { version: 1 }, postgame: { stage: 'won' } };
		assert.equal(awardEcho(a, r), 2); assert.equal(awardGodEcho(a, r), 2);
		assert.equal(a.echo.points, 4);
	});
	it('validates the new save capability and preserves old saves without enabling Nuzlocke', () => {
		start(false); engine.migrate(user); assert(!account().run.nuzlocke);
		assert.deepEqual(rogueSaveCompatibilityIssues({ ...account(), saveVersion: 2 }), []);
		assert(rogueSaveCompatibilityIssues({ ...account(), run: { ...account().run, nuzlocke: { version: 9 } } }).length);
	});
	it('emits a forced Tera transformation after switch so the client already knows the target', () => {
		start(false); enterBattle({ forcedTera: true, tera: { player: false, opponent: true } });
		const change = battle.log.findIndex(line => line.startsWith('|-terastallize|p2'));
		const switched = battle.log.findIndex(line => line.startsWith('|switch|p2'));
		assert(change > switched && switched >= 0, battle.log.join('\n'));
		assert(battle.p2.active[0].terastallized);
	});
	it('unlocks all switchable abilities of living Fantasy partners in the elder photo event', () => {
		start();
		store.change(user, a => {
			const run = a.run;
			run.team = [createRoguePokemon(set('Greninja-Fantasy', 'Protean', 50), stats(0))];
			run.node = { id: 'photo', kind: 'event', name: '留影的另一面', encounters: [], reward: { money: 0, items: {} } };
			const { MAINLINE_SCRIPT } = require('../../dist/server/fantasy-rogue/mainline-data');
			const index = MAINLINE_SCRIPT.ordinary.findIndex(scene => scene.id === 'elder-card');
			assert(prepareElderMeeting(a, run, max => max === 100 ? 99 : index));
			for (let n = 0; a.mainlineDialogue && n < 50; n++) {
				const view = mainlineView(a);
				advanceMainline(a, data, () => 0, view.key, view.options ? '0' : undefined);
			}
			assert(!a.mainlineDialogue);
		});
		const mon = account().run.team[0];
		const { Dex, toID } = require('../../dist/sim/dex');
		for (const ability of Object.values(Dex.mod('gen9fantasy').species.get(mon.set.species).abilities)) {
			assert(mon.abilityPool.some(entry => entry.id === toID(ability)), ability);
		}
	});
});
