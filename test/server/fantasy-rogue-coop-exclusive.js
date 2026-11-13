'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative exclusive clues', () => {
	let oldConfig, store, engine, manager, host, guest, created, preview;
	let serial = 0, oldNow, now, oldRandom;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldNow = Date.now; now = oldNow(); Date.now = () => now;
		oldRandom = crypto.randomInt;
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true; fixture.events = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		for (const id of Object.keys(preview.unlocks)) {
			fixture.unlocks[id] = structuredClone(preview.unlocks[id]);
			if (!fixture.starters.some(entry => entry.id === fixture.unlocks[id].starter)) {
				fixture.starters.push(structuredClone(preview.starters.find(entry => entry.id === fixture.unlocks[id].starter)));
			}
		}
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-activity-battles-fixture' };
		} }));
		host = makeUser(`Adventure Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Adventure Guest ${serial}`, `127.0.86.${serial}`);
		for (const user of [host, guest]) engine.command(user.id, {
			id: crypto.randomUUID(), revision: store.get(user.id).revision, action: 'start', starters: ['bulbasaur'],
		}, user.name);
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(shared => {
			const round = { floor: 1, tier: 'silver', remaining: 1, familiesSeen: [], idsSeen: ['swapstats'],
				options: [{ id: 'swapstats', tier: 'silver', refreshes: 1, chosen: false }] };
			shared.adventure.coopBlessingRound = round;
			for (const user of [host, guest]) shared.adventure.members[user.id].blessings.round = structuredClone(round);
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'blessingchoice', slot: 0 });
	});
	afterEach(() => {
		Date.now = oldNow; crypto.randomInt = oldRandom;
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const event = user => manager.coop.view(user).session.adventure.coopEvent;
	const choose = (user, value, visit = event(user).key) => manager.coop.command(user, { action: 'eventchoice', value, visit });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter(id, floor = 61) {
		change(shared => {
			shared.adventure.floor = floor; shared.adventure.phase = 'area-selection';
			for (const user of [host, guest]) shared.adventure.members[user.id].money = 3000;
			shared.areaSelections = { [host.id]: null, [guest.id]: null };
			shared.adventure.routeChoices = [{ id: 'activityroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(other => other !== id)
				.map(other => ({ id: other, floor: 1 }));
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'activityroute' });
		assert.equal(event(host).id, id);
	}
	function agree(choice) {
		const key = event(host).key; choose(host, choice, key); choose(guest, choice, key);
	}
	function startBattle() {
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		assert(created.rogue.cooperative);
	}
	function result(won = true, turns = 1, retreat = false) {
		const state = created.rogue.state;
		return { encounterId: state.encounterId, won, turns, team: structuredClone(state.team),
			partnerTeam: structuredClone(state.partner.team), bag: { ...state.bag }, partnerBag: { ...state.partnerBag },
			defeated: [], ...(retreat ? { coopExit: 'retreat' } : {}) };
	}
	function settle(won = true, turns = 1, retreat = false) {
		const outcome = result(won, turns, retreat); created.rogue.onResult(outcome); return outcome;
	}
	function clue() {
		change(shared => {
			shared.adventure.members[guest.id].team = [createRoguePokemon({species: 'Pikachu', level: 50,
				ability: 'Static', moves: ['Thunderbolt'], nature: 'Serious'}, shared.adventure.members[guest.id].boosts)];
		});
		enter('exclusiveclue');
		return member(host).coopEvent.exclusive;
	}
	function back() {
		for (const user of [host, guest]) manager.coop.command(user, {action: 'continuebattle'});
		assert.equal(session().adventure.phase, 'route-interaction');
	}
	it('qualifies from the guest party and shares one hidden clue and both rewards', () => {
		const target = clue();
		assert(!JSON.stringify(event(host)).includes('"answer"'));
		assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
		const before = [host, guest].map(user => member(user).bag[target.item] || 0);
		agree('investigate'); const key = event(host).key;
		choose(host, 'site:' + target.answer);
		assert.equal(member(host).bag[target.item] || 0, before[0]);
		choose(guest, 'site:' + target.answer, key);
		for (const [index, user] of [host, guest].entries()) {
			assert.equal(event(user).stage, 'result');
			assert.equal(member(user).bag[target.item], before[index] + 1);
			assert(member(user).exclusiveItems[target.item].obtained);
		}
		assert.throws(() => choose(host, 'site:' + target.answer, key));
		assert.equal(member(host).bag[target.item], before[0] + 1);
	});
	for (const mode of ['win', 'loss']) it(`resumes the shared clue after ${mode} without skipping the floor`, () => {
		const target = clue(); agree('investigate');
		const wrong = (target.answer + 1) % 4;
		agree('site:' + wrong); startBattle();
		assert.equal(created.rogue.state.catchable, true);
		const outcome = settle(mode === 'win', 1, mode === 'retreat');
		const saved = session(); created.rogue.onResult(outcome);
		assert.deepEqual(session(), saved);
		back();
		assert.equal(session().adventure.floor, 61);
		assert.equal(event(host).stage, 'choice');
		assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
		assert(!event(host).branchOptions.some(option => option.id === 'site:' + wrong));
		assert.equal(member(host).bag[target.item] || 0, 0);
		agree('site:' + target.answer);
		assert.equal(member(host).bag[target.item], 1); assert.equal(member(guest).bag[target.item], 1);
	});
	it('keeps the same clue guard after retreat instead of advancing the investigation', () => {
		const target = clue(); agree('investigate'); agree('site:' + (target.answer + 1) % 4); startBattle();
		const encounter = structuredClone(session().adventure.node.encounters);
		settle(false, 1, true);
		assert.equal(session().adventure.battleResult.eventResolved, false);
		assert.throws(() => manager.coop.command(host, {action: 'continuebattle'}));
		for (const user of [host, guest]) manager.coop.command(user, {action: 'retrybattle'});
		assert.deepEqual(session().adventure.node.encounters, encounter);
		assert.equal(member(host).coopEvent.stage, 'battle');
		startBattle(); settle(); back(); assert.equal(event(host).stage, 'choice');
	});
	it('runs three shared guard battles, preserves exclusions and makes the third guard elite', () => {
		const target = clue(); agree('investigate');
		for (const [index, site] of [0, 1, 2, 3].filter(site => site !== target.answer).entries()) {
			agree('site:' + site); startBattle();
			assert.equal(member(host).coopEvent.exclusive.battleElite, index === 2);
			const {Battle} = require('../../dist/sim/battle');
			const {Teams} = require('../../dist/sim/teams');
			const state = structuredClone(created.rogue.state);
			const battle = new Battle({formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
				p1: {name: host.name, team: state.team.map(mon => mon.set)},
				p2: {name: 'Guard A', team: Teams.unpack(created.trainer.packedTeam)},
				p3: {name: guest.name, team: state.partner.team.map(mon => mon.set)},
				p4: {name: 'Guard B', team: Teams.unpack(created.rogue.cooperative.foe)}});
			try {
				for (const side of battle.sides) assert(battle.choose(side.id, 'team 1'));
				assert.equal(battle.sides.length, 4);
				assert.equal(battle.p1.active[0].species.name, 'Bulbasaur');
				assert.equal(battle.sides[2].active[0].species.name, 'Pikachu');
			} finally { battle.destroy(); }
			settle(); back();
			assert.equal(member(host).coopEvent.exclusive.tried.length, index + 1);
		}
		assert.deepEqual(event(host).branchOptions.map(option => option.id), ['site:' + target.answer]);
		agree('site:' + target.answer); assert.equal(member(guest).bag[target.item], 1);
	});
	it('keeps a captured guard with the agreed owner and resumes investigation', () => {
		const target = clue(); agree('investigate'); agree('site:' + (target.answer + 1) % 4); startBattle();
		const captured = createRoguePokemon(session().adventure.node.encounters[0].team[0], member(guest).boosts);
		const outcome = result(); outcome.captures = [captured]; outcome.captureOwners = {[captured.id]: 'p3'};
		created.rogue.onResult(outcome); back();
		assert(member(guest).team.some(mon => mon.id === captured.id));
		assert(!member(host).team.some(mon => mon.id === captured.id));
		assert.equal(event(host).stage, 'choice'); assert(event(host).branchOptions.length > 0);
	});
	it('rolls back both players when a shared grant would overflow an inventory', () => {
		const target = clue(); agree('investigate');
		change(shared => { shared.adventure.members[guest.id].bag.potion = Number.MAX_SAFE_INTEGER + 1; });
		choose(host, 'site:' + target.answer); const before = session();
		assert.throws(() => choose(guest, 'site:' + target.answer));
		assert.deepEqual(session(), before); assert.equal(member(host).bag[target.item] || 0, 0);
	});
	it('converts a common native signature reward once, displays the actual prize, and rolls back failed grants', () => {
		crypto.randomInt = () => 0;
		const target = clue(); assert.equal(target.item, 'lightball');
		agree('investigate');
		change(shared => {
			shared.adventure.spirit = 'hoopagift'; shared.adventure.spiritVersion = 1;
			for (const [i, user] of [host, guest].entries()) {
				const m = shared.adventure.members[user.id]; m.bag = { potion: i + 1 };
				m.spiritConversions = { old: i ? 'lifeorb' : 'leftovers' };
			}
			shared.adventure.members[guest.id].bag.fantasypowerlens = Number.MAX_SAFE_INTEGER;
		});
		let rolls = 0;
		crypto.randomInt = max => { if (max === 2) rolls++; return 0; };
		const key = event(host).key, choice = 'site:' + target.answer;
		choose(host, choice, key); const before = session();
		assert.throws(() => choose(guest, choice, key)); assert.deepEqual(session(), before); assert.equal(rolls, 1);
		change(shared => { delete shared.adventure.members[guest.id].bag.fantasypowerlens; });
		rolls = 0; choose(guest, choice, key); assert.equal(rolls, 1);
		for (const [i, user] of [host, guest].entries()) {
			const m = member(user); assert.equal(m.bag.fantasypowerlens, 1); assert(!m.bag.lightball);
			assert.equal(m.bag.potion, i + 1); assert(m.exclusiveItems.lightball.obtained);
			assert.equal(m.spiritConversions['exclusive:lightball'], 'fantasypowerlens');
			assert.equal(m.spiritConversions.old, i ? 'lifeorb' : 'leftovers');
			assert(m.coopEvent.result.join('').includes('幻想道具'));
		}
		const saved = session(); manager = new RogueManager(new RogueEngine(store, engine.content));
		manager.coop.view(host); assert.deepEqual(session(), saved);
		assert.throws(() => choose(guest, choice, key)); assert.deepEqual(session(), saved);
	});
	it('keeps clue pity for a guest-only missing item and forces the fourth eligible area', () => {
		clue();
		const a = session().adventure;
		const hostRun = manager.coop.eventRun(a, host.id), guestRun = manager.coop.eventRun(a, guest.id);
		hostRun.eventHistory = []; hostRun.exclusiveEventMisses = 0;
		const {chooseEvent} = require('../../dist/server/fantasy-rogue/events');
		const allowed = new Set(['mushrooms', 'martial', 'dice', 'exclusiveclue']);
		for (let i = 0; i < 3; i++) {
			const id = chooseEvent(hostRun, () => 0, allowed, [guestRun]);
			assert.notEqual(id, 'exclusiveclue');
			assert.equal(hostRun.exclusiveEventMisses, i + 1);
			hostRun.eventHistory.push({id, floor: 61});
		}
		assert.equal(chooseEvent(hostRun, () => 0, allowed, [guestRun]), 'exclusiveclue');
		assert.equal(hostRun.exclusiveEventMisses, 0);
	});
	it('rejects forged or stale locations', () => {
		const target = clue(); const first = event(host).key;
		assert.throws(() => choose(host, 'site:99'));
		agree('investigate'); assert.throws(() => choose(host, 'site:' + target.answer, first));
		assert.throws(() => choose(host, 'site:99'));
	});
	function trial(roll = 0, kind = 'trainer', floor = 61) {
		change(shared => {
			const a = shared.adventure; a.floor = floor; a.phase = 'area-selection';
			a.members[guest.id].team = [createRoguePokemon({species: 'Pikachu', level: 50,
				ability: 'Static', moves: ['Thunderbolt'], nature: 'Serious'}, a.members[guest.id].boosts)];
			for (const user of [host, guest]) a.members[user.id].money = 3000;
			shared.areaSelections = {[host.id]: null, [guest.id]: null};
			a.routeChoices = [{id: 'trial-route', name: '区域训练家', kind,
				encounters: [{name: '原训练家', catchable: false, style: 'balanced',
					team: [{species: 'Bulbasaur', level: 10, moves: ['Tackle'], ability: 'Overgrow', nature: 'Serious'}]}],
				reward: {money: 120, items: {potion: 2}}}];
		});
		// Decline police and Tera before testing the exclusive encounter's own probability.
		let hundreds = 0;
		crypto.randomInt = max => max === 100 ? (++hundreds <= 2 ? 99 : roll) : 0;
		try { for (const user of [host, guest]) manager.coop.command(user, {action: 'selectarea', value: 'trial-route'}); }
		finally { crypto.randomInt = oldRandom; }
		return session().adventure.node.event?.exclusive?.item;
	}
	it('uses one Mew conversion for a shared trainer prize and never repeats it on battle settlement retry', () => {
		const item = trial(); assert.equal(item, 'lightball');
		change(shared => {
			shared.adventure.spirit = 'hoopagift'; shared.adventure.spiritVersion = 1;
			for (const user of [host, guest]) shared.adventure.members[user.id].bag = {};
		});
		startBattle(); let rolls = 0;
		crypto.randomInt = max => { if (max === 2) rolls++; return 0; };
		const outcome = settle(); assert.equal(rolls, 1);
		for (const user of [host, guest]) {
			const m = member(user); assert.equal(m.bag.fantasypowerlens, 1); assert(!m.bag.lightball);
			assert.equal(m.bag.potion, 2); assert(m.exclusiveItems.lightball.obtained);
			assert.equal(m.spiritConversions['exclusive:lightball'], 'fantasypowerlens');
		}
		const saved = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), saved);
	});
	it('starts a guest-qualified test once and gives both players the original encounter rewards', () => {
		const item = trial(); assert(item); assert.equal(event(host).id, 'exclusivechallenge');
		assert.equal(session().adventure.node.encounters[0].team.length, 3);
		const before = [host, guest].map(user => ({money: member(user).money, potion: member(user).bag.potion || 0}));
		startBattle(); assert.equal(created.rogue.state.catchable, false);
		const outcome = settle(); const saved = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), saved);
		back();
		for (const [i, user] of [host, guest].entries()) {
			assert.equal(member(user).bag[item], 1); assert.equal(member(user).money, before[i].money + 120);
			assert.equal(member(user).bag.potion, before[i].potion + 2);
		}
		for (const user of [host, guest]) manager.coop.command(user, {action: 'finishroute'});
		assert.equal(member(host).money, before[0].money + 120);
	});
	it('retains the test after retreat and applies original loss fees and eight-floor cooldown only on defeat', () => {
		const item = trial(); startBattle(); const encounters = structuredClone(session().adventure.node.encounters);
		settle(false, 1, true); assert.equal(member(host).money, 3000);
		for (const user of [host, guest]) manager.coop.command(user, {action: 'retrybattle'});
		assert.deepEqual(session().adventure.node.encounters, encounters);
		startBattle(); settle(false); back();
		for (const user of [host, guest]) {
			assert.equal(member(user).money, 3000 - (500 + 61 * 20));
			assert.equal(member(user).bag[item] || 0, 0);
			assert.equal(member(user).exclusiveItems[item].cooldown, 69);
		}
		assert.notEqual(trial(0, 'trainer', 62), item);
		const {exclusiveEncounterChance} = require('../../dist/server/fantasy-rogue/exclusive-items');
		const run = manager.coop.blessingRun(session().adventure, guest.id);
		run.floor = 68; assert.equal(exclusiveEncounterChance(run, item), 0);
		run.floor = 69; assert(exclusiveEncounterChance(run, item) > 0);
	});
	it('rolls only once, persists misses, and never replaces wild or boss routes', () => {
		assert.equal(trial(99), undefined);
		const entries = Object.values(member(guest).exclusiveItems).filter(entry => !entry.obtained);
		assert(entries.length); assert(entries.every(entry => entry.misses === 1));
		assert.equal(trial(99), undefined);
		assert(Object.values(member(guest).exclusiveItems).filter(entry => !entry.obtained).every(entry => entry.misses === 2));
		assert.equal(trial(0, 'wild'), undefined);
		assert.equal(trial(0, 'boss'), undefined);
	});
	it('uses four opponents from floor 100 and respects a previously obtained item', () => {
		const item = trial(0, 'trainer', 100);
		assert.equal(session().adventure.node.encounters[0].team.length, 4);
		startBattle(); settle(); back();
		const next = trial(0, 'trainer', 101);
		assert.notEqual(next, item);
	});

	it('uses the maximum native chance once without doubling probability or item weight for two owners', () => {
		trial(99);
		const source = manager.coop.blessingRun(session().adventure, guest.id);
		const runs = [structuredClone(source), structuredClone(source)];
		const {neededExclusiveItems, exclusiveEncounterChance} = require('../../dist/server/fantasy-rogue/exclusive-items');
		const {beginCoopExclusiveEncounter} = require('../../dist/server/fantasy-rogue/coop-exclusive');
		const items = neededExclusiveItems(source), chance = Math.max(...items.map(item => exclusiveEncounterChance(source, item.id)));
		const calls = [];
		assert.equal(beginCoopExclusiveEncounter(runs, max => { calls.push(max); return max === 100 ? chance : 0; }), false);
		assert.deepEqual(calls, [items.length, 100]);
		for (const run of runs) for (const item of items) assert.equal(run.exclusiveItems[item.id].misses, source.exclusiveItems[item.id].misses + 1);
		assert(beginCoopExclusiveEncounter([structuredClone(source), structuredClone(source)], max => max === 100 ? chance - 1 : 0));
	});
	it('rolls back a test payout for both players if money would exceed the safe integer range', () => {
		trial(); startBattle();
		change(shared => { shared.adventure.members[guest.id].money = Number.MAX_SAFE_INTEGER; });
		const before = session();
		assert.throws(() => settle()); assert.deepEqual(session(), before);
	});

	it('matches native encounter draws and generated teams when only one player needs an item', () => {
		trial(99);
		const {beginExclusiveEncounter} = require('../../dist/server/fantasy-rogue/exclusive-events');
		const {beginCoopExclusiveEncounter} = require('../../dist/server/fantasy-rogue/coop-exclusive');
		for (const floor of [20, 99, 100, 160]) {
			const a = session().adventure;
			const partner = structuredClone(manager.coop.blessingRun(a, guest.id)); partner.floor = floor;
			const native = structuredClone(partner), hostRun = structuredClone(manager.coop.blessingRun(a, host.id));
			hostRun.floor = floor;
			const nativeCalls = [], sharedCalls = [];
			assert(beginExclusiveEncounter(native, max => {nativeCalls.push(max); return 0;}));
			assert(beginCoopExclusiveEncounter([hostRun, partner], max => {sharedCalls.push(max); return 0;}));
			assert.deepEqual(sharedCalls, nativeCalls);
			assert.deepEqual(partner.node.encounters, native.node.encounters);
			assert.deepEqual(partner.exclusiveItems, native.exclusiveItems);
			assert.deepEqual(partner.node.event.exclusive, native.node.event.exclusive);
		}
	});

});
