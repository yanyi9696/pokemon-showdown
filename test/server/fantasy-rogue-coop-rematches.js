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
const { content, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative deferred companion challenges', () => {
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
		host = makeUser(`Rematch Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Rematch Guest ${serial}`, `127.0.86.${serial}`);
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
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'activityroute' });
		});
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
	function friendly(kind = 'boss', companion = true) {
		change(shared => {
			const a = shared.adventure;
			a.floor = 60; a.phase = 'area-selection';
			if (companion) a.members[guest.id].socialCompanions = [{id: 'clay', origin: 'event', preferences: 0, counted: []}];
			for (const user of [host, guest]) {
				a.members[user.id].money = 3000;
				const reserve = createRoguePokemon({species: 'Pikachu', level: 30, ability: 'Static', moves: ['Thunderbolt'], nature: 'Serious'}, a.members[user.id].boosts);
				reserve.hp = 1; reserve.status = 'par'; reserve.pp[0].pp = 0; a.members[user.id].team.push(reserve);
			}
			shared.areaSelections = {[host.id]: null, [guest.id]: null};
			a.routeChoices = [{id: 'friendlygym', name: '菊老大', kind,
				encounters: [{key: 'saved-gym', name: '菊老大', catchable: false, style: 'balanced',
					trainer: {id: 'clay', name: '菊老大', avatar: 'clay', role: 'gym', tera: false},
					team: [{species: 'Excadrill', level: 30, ability: 'Mold Breaker', moves: ['Earthquake'], nature: 'Serious'}]}],
				reward: {money: 420, items: {potion: 2}}}];
		});
		crypto.randomInt = max => max === 100 ? 99 : oldRandom(max);
		for (const user of [host, guest]) manager.coop.command(user, {action: 'selectarea', value: 'friendlygym'});
		startBattle();
	}
	function lose(retreat = false) {
		const outcome = result(false, 1, retreat);
		for (const team of [outcome.team, outcome.partnerTeam]) {
			team[0].hp = 0; team[0].status = 'brn'; team[0].pp[0].pp = 0;
		}
		created.rogue.onResult(outcome); return outcome;
	}
	function continueTogether() {
		for (const user of [host, guest]) manager.coop.command(user, {action: 'continuebattle'});
	}
	function openRematch() {
		friendly(); lose(); continueTogether();
		const random = crypto.randomInt; crypto.randomInt = () => 0;
		try { enter('companionrematch', 65); } finally { crypto.randomInt = random; }
		return structuredClone(member(host).rematches[0]);
	}
	it('defers both original rewards for a guest-only companion and heals the entire parties', () => {
		friendly(); const encounter = structuredClone(session().adventure.node.encounters[0]);
		const bags = [host, guest].map(user => ({...member(user).bag}));
		lose(); assert(session().adventure.battleResult.companionRescue);
		assert(!session().adventure.battleResult.won);
		for (const [index, user] of [host, guest].entries()) {
			const debt = member(user).rematches[0];
			assert.equal(debt.companion, 'clay'); assert.equal(debt.floor, 60); assert.equal(debt.nextFloor, 65);
			assert.deepEqual(debt.encounter, encounter);
			assert.deepEqual(debt.reward, {money: 420, items: {potion: 2}, points: 1}); assert(!debt.claimed);
			assert.equal(member(user).money, 3000); assert.deepEqual(member(user).bag, bags[index]);
			for (const mon of member(user).team) {
				assert.equal(mon.hp, mon.maxhp); assert.equal(mon.status, ''); assert.equal(mon.pp[0].pp, mon.pp[0].maxpp);
			}
		}
		assert.deepEqual(session().adventure.node.reward, {money: 0, items: {}});
		assert.deepEqual(member(host).rematches, member(guest).rematches);
	});
	it('continues only after both confirmations without paying withheld rewards or recording a win', () => {
		friendly(); const accounts = [host, guest].map(user => store.get(user.id).points); lose();
		assert.throws(() => manager.coop.command(host, {action: 'retrybattle'}));
		manager.coop.command(host, {action: 'continuebattle'}); assert.equal(session().adventure.floor, 60);
		manager.coop.command(guest, {action: 'continuebattle'}); assert.equal(session().adventure.floor, 61);
		for (const [index, user] of [host, guest].entries()) {
			assert.equal(member(user).money, 3000); assert.equal(store.get(user.id).points, accounts[index]);
			assert.equal(member(user).rematches.length, 1);
		}
		assert.throws(() => manager.coop.command(host, {action: 'continuebattle'}));
	});
	it('persists one debt through duplicate result callbacks and manager recreation', () => {
		friendly(); const outcome = lose(), saved = session(); created.rogue.onResult(outcome);
		assert.deepEqual(session(), saved);
		const restored = new RogueManager(new RogueEngine(store, engine.content), () => ({enabled: true}));
		assert(restored.coop.view(guest).session.adventure.battleResult.companionRescue);
		assert.equal(store.coopSessionForUser(guest.id).adventure.members[guest.id].rematches.length, 1);
	});
	it('does not turn an ordinary defeat or voluntary retreat into a friendly rescue', () => {
		friendly('boss', false); lose(); assert(!session().adventure.battleResult.companionRescue);
		assert(!member(host).rematches?.length); assert.equal(member(host).team[0].hp, 0);
		assert.throws(() => manager.coop.command(host, {action: 'continuebattle'}));
	});
	it('preserves defeat state and original rewards on retreat even with a matching companion', () => {
		friendly(); lose(true); assert(!session().adventure.battleResult.companionRescue);
		assert(!member(host).rematches?.length); assert.equal(member(host).team[0].hp, 0);
		assert.deepEqual(session().adventure.node.reward, {money: 420, items: {potion: 2}});
	});
	it('pays a won companion battle normally and creates no deferred reward', () => {
		friendly(); settle(); assert(!session().adventure.battleResult.companionRescue);
		assert(!member(host).rematches?.length); continueTogether();
		assert.equal(member(host).money, 3420); assert.equal(member(guest).money, 3420);
	});
	it('retains other debts and the deferred exclusive item without awarding it early', () => {
		friendly('trainer');
		change(shared => {
			shared.adventure.node.event = {id: 'exclusivechallenge', key: 'exclusive-debt', stage: 'battle',
				exclusive: {item: 'lightball', companion: 'clay'}};
			for (const user of [host, guest]) {
				shared.adventure.members[user.id].coopEvent = structuredClone(shared.adventure.node.event);
				shared.adventure.members[user.id].rematches = [{id: 'previous', companion: 'nanu', floor: 20,
					nextFloor: 25, encounter: shared.adventure.node.encounters[0], reward: {money: 10, items: {}, points: 0}}];
			}
		});
		lose();
		for (const user of [host, guest]) {
			assert.equal(member(user).rematches.length, 2); assert.equal(member(user).rematches[0].id, 'previous');
			assert.equal(member(user).rematches[1].exclusiveItem, 'lightball');
			assert(!member(user).bag.lightball); assert(member(user).coopEvent.settled);
		}
	});
	it('excludes police incidents, challenge failures and already-deferred battles', () => {
		friendly();
		const {deferCoopCompanionChallenge} = require('../../dist/server/fantasy-rogue/coop-rematches');
		for (const kind of ['police', 'rematch', 'challenge', 'travel']) {
			const a = session().adventure;
			const runs = [host, guest].map(user => manager.coop.blessingRun(a, user.id));
			for (const run of runs) {
				run.node = structuredClone(run.node);
				if (kind === 'challenge') run.node.challenge = {stage: 'battle'};
				else run.node.event = kind === 'travel' ? {id: 'travel'} : {id: 'test', [kind]: 'existing'};
			}
			const before = structuredClone(runs); assert.equal(deferCoopCompanionChallenge(runs), false);
			assert.deepEqual(runs, before);
		}
	});
	it('rolls back both ledgers and healing on a failed session write, then retries once', () => {
		friendly(); const before = session(), outcome = result(false);
		for (const team of [outcome.team, outcome.partnerTeam]) team[0].hp = 0;
		const update = store.updateCoopSession;
		store.updateCoopSession = () => { throw new Error('fixture write failure'); };
		try { assert.throws(() => created.rogue.onResult(outcome), /fixture write failure/); }
		finally { store.updateCoopSession = update; }
		assert.deepEqual(session(), before);
		created.rogue.onResult(outcome);
		for (const user of [host, guest]) assert.equal(member(user).rematches.length, 1);
	});
	it('allows the delegated player to confirm continuing but never changes the result into a win', () => {
		friendly(); lose(); manager.coop.command(host, {action: 'delegate', value: 'partner'});
		manager.coop.command(guest, {action: 'continuebattle'});
		assert.equal(session().adventure.floor, 61);
		for (const user of [host, guest]) {
			assert.equal(member(user).money, 3000); assert.equal(member(user).rematches.length, 1);
			assert(!member(user).rematches[0].claimed);
		}
	});
	it('opens from the guest companion, keeps original enemy levels and pays both debts only once', () => {
		const debt = openRematch();
		assert.equal(event(host).rivalPortrait, 'clay'); assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
		const key = event(host).key; choose(host, 'accept'); assert.equal(event(host).stage, 'choice');
		choose(guest, 'accept', key);
		assert(session().adventure.node.blessingPrepared); assert(session().adventure.node.spiritPrepared);
		assert.deepEqual(session().adventure.node.encounters[0].team, debt.encounter.team);
		assert.deepEqual(member(guest).coopEvent, member(host).coopEvent);
		const before = [host, guest].map(user => ({points: store.get(user.id).points, potion: member(user).bag.potion || 0}));
		startBattle(); assert.equal(created.rogue.state.catchable, false);
		const {Battle} = require('../../dist/sim/battle');
		const {Teams} = require('../../dist/sim/teams');
		const state = structuredClone(created.rogue.state);
		const battle = new Battle({formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: {name: host.name, team: state.team.map(mon => mon.set)},
			p2: {name: 'Rematch A', team: Teams.unpack(created.trainer.packedTeam)},
			p3: {name: guest.name, team: state.partner.team.map(mon => mon.set)},
			p4: {name: 'Rematch B', team: Teams.unpack(created.rogue.cooperative.foe)}});
		try {
			for (const side of battle.sides) assert(battle.choose(side.id, 'default'));
			assert.equal(battle.sides.length, 4);
			assert.equal(battle.p2.active[0].level, debt.encounter.team[0].level);
			assert.equal(battle.sides[3].active[0].level, debt.encounter.team[0].level);
		} finally { battle.destroy(); }
		const outcome = settle(); const saved = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), saved);
		for (const [index, user] of [host, guest].entries()) {
			assert(member(user).rematches[0].claimed); assert.equal(member(user).money, 3420);
			assert.equal(member(user).bag.potion, before[index].potion + 2); assert.equal(store.get(user.id).points, before[index].points + 1);
		}
		continueTogether(); assert.equal(session().adventure.phase, 'route-interaction');
		assert.equal(event(host).stage, 'result');
		for (const user of [host, guest]) manager.coop.command(user, {action: 'finishroute'});
		assert.equal(session().adventure.floor, 66); assert.equal(member(host).money, 3420);
		assert.throws(() => choose(host, 'accept', key));
	});
	it('requires arrival at the due floor and either owner still travelling with the trainer', () => {
		friendly(); lose(); continueTogether();
		const {sharedRematches} = require('../../dist/server/fantasy-rogue/companion-rematches');
		const runs = [host, guest].map(user => manager.coop.blessingRun(session().adventure, user.id));
		for (const run of runs) run.floor = 64; assert.equal(sharedRematches(runs).length, 0);
		for (const run of runs) run.floor = 65; assert.equal(sharedRematches(runs).length, 1);
		runs[1].socialCompanions[0].away = true; assert.equal(sharedRematches(runs).length, 0);
		runs[0].socialCompanions = [{id: 'clay', origin: 'event', preferences: 0, counted: []}];
		assert.equal(sharedRematches(runs).length, 1);
		runs[1].rematches[0].claimed = true; assert.equal(sharedRematches(runs).length, 0);
	});
	it('postpones both debts for five floors without losing the encounter or issuing any reward', () => {
		const debt = openRematch(); agree('decline');
		for (const user of [host, guest]) {
			assert.equal(member(user).rematches[0].nextFloor, 70); assert(!member(user).rematches[0].claimed);
			assert.deepEqual(member(user).rematches[0].encounter, debt.encounter); assert.equal(member(user).money, 3000);
		}
		assert.equal(event(host).stage, 'result');
	});
	it('heals both parties after losing the rematch and keeps the reward for another five floors', () => {
		openRematch(); agree('accept'); startBattle(); lose();
		assert(!session().adventure.battleResult.companionRescue); assert(session().adventure.battleResult.eventResolved);
		continueTogether(); assert.equal(event(host).stage, 'result');
		for (const user of [host, guest]) {
			assert.equal(member(user).rematches.length, 1); assert.equal(member(user).rematches[0].nextFloor, 70);
			assert(!member(user).rematches[0].claimed); assert.equal(member(user).money, 3000);
			for (const mon of member(user).team) assert.equal(mon.hp, mon.maxhp);
		}
	});
	it('keeps a retreated rematch unchanged for retry and awards nothing', () => {
		openRematch(); agree('accept'); startBattle(); const encounters = session().adventure.node.encounters;
		settle(false, 1, true); assert(!session().adventure.battleResult.eventResolved);
		for (const user of [host, guest]) {
			assert.equal(member(user).rematches[0].nextFloor, 65); assert.equal(member(user).money, 3000);
			manager.coop.command(user, {action: 'retrybattle'});
		}
		assert.deepEqual(session().adventure.node.encounters, encounters);
		startBattle(); settle(); assert(member(host).rematches[0].claimed);
	});
	it('keeps personal claims and inventory atomic when one reward would overflow', () => {
		openRematch(); agree('accept'); startBattle();
		change(shared => { shared.adventure.members[guest.id].money = Number.MAX_SAFE_INTEGER; });
		const saved = session(), accounts = [host, guest].map(user => store.get(user.id));
		assert.throws(() => settle()); assert.deepEqual(session(), saved);
		for (const [index, user] of [host, guest].entries()) assert.deepEqual(store.get(user.id), accounts[index]);
	});
	it('grants a deferred exclusive item to both parties even without a matching species and respects existing ownership', () => {
		openRematch();
		change(shared => {
			for (const user of [host, guest]) shared.adventure.members[user.id].rematches[0].exclusiveItem = 'lightball';
			shared.adventure.members[guest.id].bag.lightball = 1;
		});
		agree('accept'); startBattle(); settle();
		assert.equal(member(host).bag.lightball, 1); assert.equal(member(guest).bag.lightball, 1);
		for (const user of [host, guest]) assert(member(user).exclusiveItems.lightball.obtained);
	});
	it('converts a new deferred signature item together while preserving the original node conversion outcome', () => {
		openRematch();
		change(shared => {
			shared.adventure.spirit = 'hoopagift'; shared.adventure.spiritVersion = 1;
			for (const user of [host, guest]) {
				const m = shared.adventure.members[user.id];
				m.bag = {}; m.spiritConversions = { 'floor:60:leftovers:0': 'leftovers' };
				m.rematches[0].reward.items = { leftovers: 1, fantasylifeorb: 1, potion: 2 };
				m.rematches[0].exclusiveItem = 'lightball';
			}
		});
		agree('accept'); startBattle();
		let rolls = 0;
		crypto.randomInt = max => { if (max === 2) rolls++; return 0; };
		change(shared => { shared.adventure.members[guest.id].money = Number.MAX_SAFE_INTEGER; });
		const before = session(), accounts = [host, guest].map(user => store.get(user.id));
		assert.throws(() => settle()); assert.deepEqual(session(), before); assert.equal(rolls, 1);
		for (const [i, user] of [host, guest].entries()) assert.deepEqual(store.get(user.id), accounts[i]);
		change(shared => { shared.adventure.members[guest.id].money = 3000; });
		rolls = 0; const outcome = settle(); assert.equal(rolls, 1);
		for (const user of [host, guest]) {
			const m = member(user);
			assert.deepEqual(m.bag, { leftovers: 1, fantasylifeorb: 1, potion: 2, fantasypowerlens: 1 });
			assert.equal(m.spiritConversions['floor:60:leftovers:0'], 'leftovers');
			assert.equal(m.spiritConversions['exclusive:lightball'], 'fantasypowerlens');
			assert(m.rematches[0].claimed); assert(m.exclusiveItems.lightball.obtained);
		}
		const saved = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), saved);
	});
	it('offers a safe shared exit when the companion leaves or records no longer match', () => {
		openRematch(); const reward = member(guest).rematches[0].reward;
		change(shared => { shared.adventure.members[guest.id].socialCompanions[0].away = true; });
		assert.deepEqual(event(host).branchOptions.map(option => option.id), ['close']);
		assert.throws(() => choose(host, 'accept')); agree('close');
		assert.equal(event(host).stage, 'result'); assert.equal(member(host).money, 3000);
		assert.deepEqual(member(guest).rematches[0].reward, reward); assert(!member(guest).rematches[0].claimed);
	});
	it('closes a stale encounter without crashing either view or manufacturing a missing reward ledger', () => {
		openRematch(); change(shared => { delete shared.adventure.members[guest.id].rematches; });
		assert.deepEqual(event(guest).branchOptions.map(option => option.id), ['close']);
		agree('close'); assert.equal(event(host).stage, 'result'); assert.equal(event(guest).stage, 'result');
		assert(!member(guest).rematches); assert.equal(member(host).money, 3000);
		assert(!member(host).rematches[0].claimed);
	});
});
