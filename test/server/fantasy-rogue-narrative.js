'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { storyView } = require('../../dist/server/fantasy-rogue/story');
const { eventView } = require('../../dist/server/fantasy-rogue/events');
const { prepareRematch, eligibleRematches } = require('../../dist/server/fantasy-rogue/companion-rematches');
const { beginPoliceEncounter } = require('../../dist/server/fantasy-rogue/police-events');
const { POLICE_REGIONS } = require('../../dist/server/fantasy-rogue/police-data');
const { syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue narrative settlements and terminal recovery', function () {
	this.timeout(15000);
	let store, engine, config;
	const user = 'narrativetest';
	const account = () => store.get(user);
	const run = () => account().run;
	const change = callback => store.change(user, a => callback(a.run, a));
	const cmd = (action, extra = {}) => engine.command(user, { id: randomUUID(), revision: account().revision, action, ...extra });
	const skip = () => cmd('storyskip', { value: storyView(account(), true, false).key });
	const option = value => cmd('event', { member: run().node.event.key, value });
	function finish(won, hp = won ? 1 : 0) {
		const current = run(), token = current.battle.token;
		const result = { encounterId: current.battle.encounterId, won, team: current.team, bag: current.bag };
		for (const mon of result.team) {
			mon.hp = hp; mon.status = 'psn'; mon.pp[0].pp = 0;
		}
		engine.settle(user, token, result);
		return () => engine.settle(user, token, result);
	}
	function companion(id) {
		change(r => { syncBlessingParty(r); r.blessings.companions = [{ id, preferences: 0 }]; });
	}
	function boss() {
		change(r => {
			r.floor = 20; r.phase = 'ready'; r.encounter = 0;
			r.node = structuredClone(config.floors[20][0]);
			r.node.reward = { money: 800, items: { revive: 1 } };
			r.node.encounters[0].trainer = { id: 'bea', name: '彩豆', avatar: 'bea', role: 'gym' };
		});
		config.story = true; engine = new RogueEngine(store, config, () => 0);
		cmd('battle'); assert.equal(run().story.stage, 'bossintro');
		skip(); cmd('battle');
	}
	function rematch(floor) {
		change(r => {
			r.floor = floor; r.encounter = 0; r.phase = 'event';
			r.node = { id: 'rematch', name: '再次切磋', kind: 'event', reward: { money: 0, items: {} }, encounters: [],
				event: { id: 'companionrematch', key: randomUUID(), stage: 'choice' } };
			prepareRematch(r);
		});
		engine.migrate(user); skip();
	}
	function police(region = 'kanto', heldCompanion) {
		if (heldCompanion) companion(heldCompanion);
		change(r => {
			r.floor = 30; r.phase = 'choose'; r.encounter = 0;
			r.node = { id: 'encounter', kind: 'trainer', reward: { money: 0, items: {} }, encounters: [] };
			assert(beginPoliceEncounter(r, () => 0));
			r.node.event.police.choices = [region, 'johto', 'hoenn'];
		});
		engine.migrate(user); skip(); option('police:' + region);
	}
	beforeEach(() => {
		store = new RogueStore(':memory:'); config = content();
		engine = new RogueEngine(store, config, () => 0);
		cmd('start', { starters: ['bulbasaur'] }); cmd('select', { value: 'grass' });
	});
	afterEach(() => store.close());
	it('resumes an expiring rival farewell after reconnect without repeating the floor or gift', () => {
		change(r => { r.rival = {id: 'kieran', completed: 3, affection: 7, lastFloor: 1, temporaryUntil: 1}; });
		config.story = true; engine = new RogueEngine(store, config, () => 0);
		for (let encounter = 0; encounter < 2; encounter++) { cmd('battle'); finish(true); }
		cmd('battle'); const duplicate = finish(true);
		assert.equal(run().floor, 1); assert.equal(run().phase, 'story');
		assert.equal(run().dialogue.resume, 'advance'); assert.equal(run().bag.dragonfang, 1);
		const money = run().money, key = storyView(account(), true, false).key;
		engine = new RogueEngine(store, config, () => 0); engine.migrate(user);
		assert.equal(storyView(account(), true, false).key, key);
		duplicate(); skip(); assert.equal(run().floor, 2); assert.equal(run().bag.dragonfang, 1);
		assert.equal(run().money, money); assert.equal(run().rival.affection, 7);
		assert.throws(() => cmd('storyskip', {value: key})); assert.equal(run().floor, 2);
	});
	it('heals a boss winner before dialogue, survives reconnect and awards the floor only once', () => {
		boss(); const duplicate = finish(true);
		assert.equal(run().phase, 'story'); assert.equal(run().dialogue.pages[0].expression, 'approval');
		assert.equal(run().team[0].hp, run().team[0].maxhp); assert.equal(run().team[0].status, '');
		assert.equal(run().team[0].pp[0].pp, run().team[0].pp[0].maxpp);
		const key = storyView(account(), true, false).key; engine.migrate(user);
		assert.equal(storyView(account(), true, false).key, key);
		duplicate(); skip();
		assert.equal(run().floor, 21); assert.equal(account().points, 21);
		assert.equal(run().money, 900); duplicate(); assert.equal(run().money, 900);
	});
	it('defers companion rewards through a loss, a refused rematch and another loss, then pays exactly once', () => {
		companion('bea'); boss(); finish(false);
		assert(run().node.companionLoss); assert.equal(run().money, 100); assert.equal(account().points, 20);
		assert.equal(run().team[0].hp, run().team[0].maxhp); assert(!run().failure);
		skip(); assert.equal(run().floor, 21); assert.equal(account().points, 20);
		assert.equal(eligibleRematches(run()).length, 0);
		rematch(25); option('decline'); assert.equal(run().rematches[0].nextFloor, 30);
		rematch(30); option('accept'); cmd('battle');
		if (run().phase === 'story') { skip(); cmd('battle'); }
		finish(false); assert.equal(run().team[0].hp, run().team[0].maxhp); skip();
		assert.equal(run().rematches[0].nextFloor, 35); assert.equal(run().money, 100);
		rematch(35); option('accept'); cmd('battle');
		if (run().phase === 'story') { skip(); cmd('battle'); }
		const duplicate = finish(true); assert.equal(run().money, 900); assert.equal(account().points, 21);
		assert(run().rematches[0].claimed); duplicate(); skip();
		assert.equal(run().money, 900);
		assert.equal(eligibleRematches(run()).length, 0);
	});
	it('performs automatic paid rescue before failure, and keeps the same encounter', () => {
		change(r => { r.money = 1900; });
		cmd('battle'); const duplicate = finish(false);
		assert.equal(run().money, 0); assert.equal(run().phase, 'ready'); assert.equal(run().encounter, 0);
		assert.equal(run().team[0].hp, run().team[0].maxhp); duplicate(); assert.equal(run().money, 0);
	});
	it('automatically closes an unrecoverable wipe and acknowledges only the matching failure', () => {
		change((r, a) => { r.money = 1899; a.points = 7; });
		cmd('battle'); const duplicate = finish(false);
		assert.equal(run().phase, 'defeated'); assert.equal(run().team[0].hp, 0); assert.equal(run().money, 1899);
		const key = run().failure.key; engine.migrate(user); assert.equal(run().failure.key, key);
		assert.throws(() => cmd('ackfailure', { value: 'stale' }), /结算已更新/);
		cmd('ackfailure', { value: key }); assert(!account().run); assert.equal(account().points, 7);
		duplicate(); assert(!account().run); cmd('start', { starters: ['bulbasaur'] });
		assert.equal(run().floor, 1);
	});
	it('preserves a usable revive, a healthy boxed partner and a pending capture as recovery paths', () => {
		for (const recovery of ['revive', 'box', 'pending']) {
			change(r => {
				r.phase = 'ready'; delete r.failure; r.team[0].hp = r.team[0].maxhp;
				r.box = []; r.pendingCaptures = []; r.bag.revive = 0;
				const ally = createRoguePokemon(set('Magikarp', 'Swift Swim'), stats(0));
				if (recovery === 'revive') r.bag.revive = 1;
				if (recovery === 'box') r.box = [ally];
				if (recovery === 'pending') r.pendingCaptures = [ally];
			});
			cmd('battle'); finish(false); assert.notEqual(run().phase, 'defeated', recovery);
			change(r => { delete r.pendingCapture; delete r.captureResume; });
		}
	});
	it('offers three mandatory regions and delays each reinforcement round before the leader', () => {
		police(); assert.equal(run().phase, 'story'); skip();
		const lower = require('../../dist/server/fantasy-rogue/evolution').lowerToEligibleStage;
		assert.deepEqual(run().node.encounters.map(e => e.team.map(s => s.species)), POLICE_REGIONS.kanto.grunts.map(t => t.map(s => lower(s, 15))));
		assert(run().node.encounters.every(e => e.trainer.avatar === 'rocketgrunt'));
		assert(run().node.encounters.every(e => !e.catchable)); assert(!eventView(run()).options.length);
		cmd('battle'); finish(true); assert.equal(run().encounter, 1);
		skip(); assert.equal(run().phase, 'ready');
		cmd('battle'); const duplicate = finish(true); const money = run().money;
		assert(money > 100); assert.equal(run().police.regions.kanto.revengeAfter, 38);
		duplicate(); assert.equal(run().money, money);
		skip(); assert.equal(run().phase, 'event');
		change(r => {
			r.floor = 37; assert(!beginPoliceEncounter(r, () => 0)); r.floor = 38;
			assert(beginPoliceEncounter(r, () => 0));
		});
		engine.migrate(user); skip(); assert.equal(run().node.event.id, 'policerevenge');
		for (let round = 1; round <= 3; round++) {
			assert.equal(run().node.encounters.length, round < 3 ? round + 2 : 1);
			if (round === 3) assert.equal(run().node.encounters[0].trainer.id, POLICE_REGIONS.kanto.boss);
			const count = run().node.encounters.length;
			for (let fight = 0; fight < count; fight++) { cmd('battle'); finish(true); skip(); }
			if (round < 3) {
				assert.equal(run().police.regions.kanto.status, 'pending');
				change(r => { r.floor += 8; assert(beginPoliceEncounter(r, () => 0)); }); engine.migrate(user); skip();
			}
		}
		assert.equal(run().police.regions.kanto.status, 'cleared');
	});
	it('lets a companion leader intervene from the left, paying Jenny and apology gifts without revenge', () => {
		police('alola', 'guzma');
		assert.equal(run().dialogue.pages[0].side, 'left'); assert.equal(run().dialogue.pages[0].portrait, 'guzma');
		assert.equal(run().police.regions.alola.status, 'averted'); assert.equal(run().node.encounters.length, 0);
		assert(run().lastReward.name.includes('歉礼')); assert(run().money > 100); skip();
		assert.equal(run().phase, 'event'); assert(run().node.event.settled);
	});
	it('keeps police challenge progress and consumed resources on escape without granting rewards', () => {
		police(); skip(); cmd('battle');
		const encounter = structuredClone(run().node.encounters);
		cmd('retreat'); finish(false, 1);
		assert.equal(run().phase, 'ready'); assert.equal(run().encounter, 0); assert.equal(run().team[0].hp, 1);
		assert.equal(run().money, 100); assert(!run().police); assert.deepEqual(run().node.encounters, encounter);
	});
});
