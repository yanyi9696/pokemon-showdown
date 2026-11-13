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

describe('Fantasy Rogue cooperative rival session integration', () => {
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
		host = makeUser(`Rival Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Rival Guest ${serial}`, `127.0.86.${serial}`);
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
	function enter(chapter = 1, id = 'silver', scores = [0, 0]) {
		change(shared => {
			const a = shared.adventure;
			a.floor = [1, 31, 48, 65, 81, 99, 119, 139][chapter - 1]; a.phase = 'area-selection';
			for (const [i, user] of [host, guest].entries()) {
				const m = a.members[user.id];
				m.rival = {id, completed: chapter - 1, lastFloor: Math.max(0, a.floor - 15), affection: scores[i]};
				m.trainerBonds = {[id]: {score: scores[i], gifts: [], pending: []}};
			}
			shared.areaSelections = {[host.id]: null, [guest.id]: null};
			a.routeChoices = [{id: 'rival', name: '旅途中的相遇', kind: 'adventure', encounters: [], reward: {money: 0, items: {}}}];
		});
		crypto.randomInt = () => 0;
		for (const user of [host, guest]) manager.coop.command(user, {action: 'selectarea', value: 'rival'});
		assert.equal(event(host).id, 'rivalstory');
	}
	function agree(choice) {
		const key = event(host).key; choose(host, choice, key); choose(guest, choice, key);
	}
	function startBattle() {
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.equal(member(host).coopEvent.key, member(guest).coopEvent.key);
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
	function followups() {
		for (let step = 0; step < 30; step++) {
			let acted = false;
			for (const user of [host, guest]) {
				const invite = member(user).companionInvitations?.[0];
				if (invite) { manager.coop.command(user, {action: 'companioninvite', visit: invite.key, value: 'accept'}); acted = true; }
			}
			if (acted) continue;
			for (const user of [host, guest]) {
				const reward = member(user).blessings.pending[0];
				if (reward) { manager.coop.command(user, {action: 'blessingreward', member: reward.id, value: reward.options[0]}); acted = true; }
			}
			if (acted) continue;
			const scene = manager.coop.view(host).session.adventure.coopAffection;
			if (scene) { for (const user of [host, guest]) manager.coop.command(user,
				{action: 'affection', visit: scene.visit, value: scene.options[0].id}); continue; }
			return;
		}
		assert.fail('follow-ups did not settle');
	}
	function continueTogether() {
		followups();
		for (const user of [host, guest]) manager.coop.command(user, {action: 'continuebattle'});
	}
	function nextChoice() {
		const options = event(host).branchOptions.map(option => option.id);
		assert(options.length, 'shared chapter needs an available next choice');
		return ['solo', 'carmine:stay', 'shards', 'lusamine:trust', 'carmine:listen', 'greet:warm', 'warm', 'start']
			.find(id => options.includes(id)) || options[0];
	}
	function finish(won = true) {
		const battles = [];
		for (let step = 0; step < 40; step++) {
			followups();
			if ([host, guest].every(user => member(user).coopEvent.settled)) return battles;
			if (session().adventure.phase === 'battle-selection') {
				battles.push(session().adventure.encounter); startBattle(); settle(won); continueTogether();
			} else { agree(nextChoice()); }
		}
		assert.fail('chapter did not finish');
	}
	for (const id of ['silver', 'kieran', 'lillie', 'gladion']) {
		for (let chapter = 1; chapter <= 8; chapter++) it(`plays ${id} chapter ${chapter} through actual shared commands`, () => {
			enter(chapter, id); const battles = finish();
			for (const user of [host, guest]) assert.equal(member(user).rival.completed, chapter);
			if (chapter === 2) assert.deepEqual(battles, [0, 1]);
			if (chapter === 7) assert.deepEqual(battles, [0, 1, 2]);
			assert.equal(event(host).branchResolved, true);
		});
	}
	for (const chapter of [2, 5]) it(`persists the same Mew chapter ${chapter} equipment for both players`, () => {
		change(shared => { shared.spirit = shared.adventure.spirit = 'hoopagift'; shared.adventure.spiritVersion = 1; });
		enter(chapter);
		const accounts = [store.get(host.id), store.get(guest.id)];
		finish();
		for (const user of [host, guest]) {
			assert.equal(member(user).bag.fantasypowerlens, chapter === 2 ? 1 : 3);
			assert(!member(user).bag[chapter === 2 ? 'expertbelt' : 'sitrusberry']);
			assert(member(user).bag.superpotion >= 2);
		}
		assert.deepEqual(member(host).spiritConversions, member(guest).spiritConversions);
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		const before = session(); manager = new RogueManager(engine, () => ({ enabled: true }));
		event(host); event(guest); assert.deepEqual(session(), before);
	});
	it('rolls back common Mew chapter equipment when the second member cannot receive rewards', () => {
		change(shared => { shared.spirit = shared.adventure.spirit = 'hoopagift'; shared.adventure.spiritVersion = 1; });
		enter(2); while (session().adventure.phase !== 'battle-selection') agree(nextChoice());
		startBattle(); settle(); continueTogether();
		startBattle();
		change(shared => { shared.adventure.members[guest.id].money = Number.MAX_SAFE_INTEGER; });
		const before = session(), accounts = [store.get(host.id), store.get(guest.id)];
		assert.throws(() => settle(), /超出可保存范围/);
		assert.deepEqual(session(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		change(shared => { shared.adventure.members[guest.id].money = 1000; });
		settle();
		for (const user of [host, guest]) assert.equal(member(user).bag.fantasypowerlens, 1);
	});
	it('keeps personal affinity and rejects old votes after a shared step', () => {
		enter(4, 'silver', [0, 25]); const key = event(host).key;
		agree(nextChoice()); const saved = session();
		assert.throws(() => choose(host, 'greet:warm', key), /已变化/);
		assert.deepEqual(session(), saved);
		assert(member(guest).rival.affection > member(host).rival.affection);
		assert.equal(event(guest).key, event(host).key);
	});
	it('does not finish or award a chapter after the first of its saved battles', () => {
		enter(2); while (session().adventure.phase !== 'battle-selection') agree(nextChoice());
		const before = [member(host).money, member(guest).money];
		startBattle(); const callback = created.rogue.onResult, outcome = settle();
		assert.equal(session().adventure.battleResult.eventResolved, false);
		assert.equal(member(host).rival.completed, 1);
		assert.deepEqual([member(host).money, member(guest).money], before);
		const saved = session(); callback(outcome); assert.deepEqual(session(), saved);
		continueTogether(); assert.equal(session().adventure.encounter, 1);
		startBattle(); settle(); continueTogether(); finish();
		assert.equal(member(host).rival.completed, 2);
	});
	it('keeps the original encounters on retreat without advancing rival progress', () => {
		enter(2); while (session().adventure.phase !== 'battle-selection') agree(nextChoice());
		const encounters = session().adventure.node.encounters;
		startBattle(); settle(false, 1, true);
		assert.equal(member(host).rival.completed, 1);
		for (const user of [host, guest]) manager.coop.command(user, {action: 'retrybattle'});
		assert.equal(session().adventure.encounter, 0);
		assert.deepEqual(session().adventure.node.encounters, encounters);
	});
	it('allows a guest-only invitation without copying the hosts spent invitation', () => {
		enter(4, 'silver', [15, 15]); change(shared => { shared.adventure.members[host.id].rival.temporaryUsed = true; });
		for (const choice of ['greet:warm', 'greet:warm', 'warm', 'warm', 'warm']) agree(choice);
		assert(member(host).coopEvent.settled); assert(!member(guest).coopEvent.settled);
		assert.equal(event(host).branchResolved, false); assert(event(host).branchOptions.some(o => o.id === 'join'));
		const restored = new RogueManager(new RogueEngine(store, engine.content), () => ({enabled: true}));
		assert.deepEqual(restored.coop.view(guest).session.adventure.coopEvent, event(guest));
		agree('join'); assert(member(guest).rival.temporaryUntil); assert(!member(host).rival.temporaryUntil);
		assert.equal(event(host).branchResolved, true);
	});
	it('starts native four-seat battles using both humans rather than the chapters NPC ally', () => {
		enter(2); while (session().adventure.phase !== 'battle-selection') agree(nextChoice()); startBattle();
		const {Battle} = require('../../dist/sim/battle'); const {Teams} = require('../../dist/sim/teams');
		const state = structuredClone(created.rogue.state);
		assert.equal(created.rogue.cooperative.name, guest.name);
		assert.deepEqual(Teams.unpack(created.rogue.cooperative.ally).map(mon => mon.species), member(guest).team.map(mon => mon.set.species));
		const battle = new Battle({formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: {name: host.name, team: state.team.map(mon => mon.set)}, p2: {name: 'Enemy A', team: Teams.unpack(created.trainer.packedTeam)},
			p3: {name: guest.name, team: state.partner.team.map(mon => mon.set)}, p4: {name: 'Enemy B', team: Teams.unpack(created.rogue.cooperative.foe)}});
		try { for (const side of battle.sides) assert(battle.choose(side.id, 'default'));
			assert(battle.p2.active[0]); assert(battle.sides[3].active[0]);
		} finally { battle.destroy(); }
	});
	it('rolls back both personal chapter rewards when the second write would overflow', () => {
		enter(1); while (session().adventure.phase !== 'battle-selection') agree(nextChoice());
		change(shared => { shared.adventure.members[guest.id].money = Number.MAX_SAFE_INTEGER; });
		startBattle(); const saved = session();
		assert.throws(() => settle(), /超出可保存范围/); assert.deepEqual(session(), saved);
	});
	it('expires temporary rivals once while advancing and preserves permanent partners', () => {
		enter(4); finish();
		change(shared => { shared.adventure.members[host.id].rival.temporaryUntil = shared.adventure.floor;
			shared.adventure.members[guest.id].rival.permanent = true; });
		const bag = {...member(host).bag};
		for (const user of [host, guest]) manager.coop.command(user, {action: 'finishroute'});
		assert(!member(host).rival.temporaryUntil); assert(member(host).rival.temporaryUsed);
		assert(member(guest).rival.permanent); assert.notDeepEqual(member(host).bag, bag);
		const saved = session(); manager.coop.command(host, {action: 'refresh'}); assert.deepEqual(session(), saved);
	});
	it('keeps fixed floors and secret story exclusions while offering native rival routes', () => {
		crypto.randomInt = () => 0;
		const a = session().adventure; a.floor = 20;
		engine.content.floors[20] = [{id: 'gym', kind: 'boss', name: '道馆', encounters: [], reward: {money: 0, items: {}}}];
		manager.coop.prepareRouteChoices(a); assert(!a.routeChoices.some(n => n.id === 'rival'));
		a.floor = 1; manager.coop.prepareRouteChoices(a);
		assert(a.routeChoices.some(n => n.id === 'rival')); assert(!a.routeChoices.some(n => n.kind === 'story'));
	});

	for (const chapter of [1, 2, 6, 7, 8]) it(`resolves a non-retreat chapter ${chapter} defeat with native progress rules`, () => {
		enter(chapter); finish(false);
		for (const user of [host, guest]) {
			assert.equal(member(user).rival.completed, [1, 6, 8].includes(chapter) ? chapter : chapter - 1);
			assert.equal(member(user).team[0].hp, member(user).team[0].maxhp);
		}
	});
	it('preserves companion rescue priority when an already travelling rival wins a sparring match', () => {
		enter(6); change(shared => { shared.adventure.members[guest.id].rival.temporaryUntil = 130; });
		while (session().adventure.phase !== 'battle-selection') agree(nextChoice());
		startBattle(); settle(false);
		assert.equal(session().adventure.battleResult.companionRescue, true);
		assert.equal(session().adventure.battleResult.eventResolved, false);
		for (const user of [host, guest]) {
			assert.equal(member(user).rival.completed, 5); assert.equal(member(user).rematches.length, 1);
		}
	});
	it('rolls back personal previous-rival changes if the shared route save fails', () => {
		enter(4); finish();
		const saved = session(), accounts = [store.get(host.id), store.get(guest.id)];
		change(shared => { shared.adventure.phase = 'area-selection';
			shared.areaSelections = {[host.id]: null, [guest.id]: null};
			shared.adventure.routeChoices = [{id: 'rival', kind: 'adventure', name: '下一章', encounters: [], reward: {money: 0, items: {}}}]; });
		manager.coop.command(host, {action: 'selectarea', value: 'rival'});
		const before = session(), update = store.updateCoopSession;
		store.updateCoopSession = () => { throw new Error('injected session write failure'); };
		try { assert.throws(() => manager.coop.command(guest, {action: 'selectarea', value: 'rival'}), /injected/); }
		finally { store.updateCoopSession = update; }
		assert.deepEqual(session(), before);
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
		assert.equal(session().adventure.members[host.id].rival.completed, saved.adventure.members[host.id].rival.completed);
	});

});
