'use strict';
const assert = require('assert').strict;
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative mentor cards', () => {
	let store, engine, manager, host, guest, oldConfig, created;
	const saved = () => store.coopSessionForUser(host.id);
	const view = user => manager.coop.view(user || host).session.adventure;
	function rebuild() {
		manager = new RogueManager(engine, () => ({ enabled: true,
			createRogueBattle(user, trainer, team, rogue) { created = rogue; return { roomid: 'battle-mentor-test' }; },
		}));
	}
	function change(update) {
		const session = saved(), revision = session.revision;
		update(session); session.revision++; store.updateCoopSession(session, revision);
	}
	function choose(user, value, visit = view(user).mentor.key) {
		return manager.coop.command(user, { action: 'mentorcard', value, visit });
	}
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content()); rebuild();
		host = makeUser('Mentor Host', '127.27.1.1'); guest = makeUser('Mentor Guest', '127.27.1.2');
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		engine.content.story = true;
		change(s => { s.adventure.floor = 19; s.adventure.routeChoices = structuredClone(engine.content.floors[19]); });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'center' });
	});
	afterEach(() => {
		for (const user of [host, guest]) { user?.disconnectAll(); user?.destroy(); }
		store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	it('shares all four unchanged cards, saves votes, cancels and requires agreement before leaving', () => {
		assert.equal(view().mentor.floor, 20);
		assert.deepEqual(view().mentor.cards, view(guest).mentor.cards);
		assert.deepEqual(view().mentor.cards.map(c => [c.offense, c.defense, c.speed]),
			[[100, 40, 0], [40, 120, 0], [20, 20, 100], [50, 50, 50]]);
		assert.throws(() => manager.coop.command(host, { action: 'finishroute' }), /首领卡/);
		choose(host, 'attack'); choose(guest, 'guard'); assert(!saved().adventure.mentor.card);
		rebuild(); assert.equal(view(guest).mentor.partnerChoice, 'attack');
		choose(host, ''); assert.equal(view(guest).mentor.partnerChoice, undefined);
		choose(host, 'guard'); assert.equal(saved().adventure.mentor.card, 'guard');
		assert.throws(() => choose(host, 'attack'), /已变化/);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(saved().adventure.floor, 20); assert.equal(saved().adventure.mentor.card, 'guard');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'boss' });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [view(user).team[0].id] });
		assert.equal(created.state.mentorCard, 'guard'); assert.equal(created.state.partner.mentorCard, 'guard');
		const settle = won => created.onResult({ encounterId: created.state.encounterId, won, turns: 1,
			team: structuredClone(created.state.team), partnerTeam: structuredClone(created.state.partner.team),
			bag: { ...created.state.bag }, partnerBag: { ...created.state.partnerBag } });
		settle(false);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'retrybattle' });
		assert.equal(saved().adventure.mentor.card, 'guard');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [view(user).team[0].id] });
		assert.equal(created.state.partner.mentorCard, 'guard'); settle(true);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		assert.equal(saved().adventure.floor, 21); assert.equal(saved().adventure.mentor, undefined);
	});
	it('rejects invalid and stale requests without changing either save', () => {
		const before = saved(), accounts = [store.get(host.id), store.get(guest.id)];
		assert.throws(() => choose(host, 'attack', 'old'), /已变化/);
		assert.throws(() => choose(host, 'forged'), /已变化/);
		assert.deepEqual(saved(), before); assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
	it('consumes the card on the final boss clear even though the floor does not advance', () => {
		engine.content.floors[200] = structuredClone(engine.content.floors[20]);
		change(s => {
			s.adventure.floor = 199; s.adventure.phase = 'area-selection'; delete s.adventure.node;
			s.adventure.routeChoices = structuredClone(engine.content.floors[19]);
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'center' });
		assert.equal(view().mentor.floor, 200);
		for (const user of [host, guest]) choose(user, 'attack');
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'boss' });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [view(user).team[0].id] });
		assert.equal(created.state.mentorCard, 'attack');
		created.onResult({ encounterId: created.state.encounterId, won: true, turns: 1,
			team: structuredClone(created.state.team), partnerTeam: structuredClone(created.state.partner.team),
			bag: { ...created.state.bag }, partnerBag: { ...created.state.partnerBag } });
		const sessionId = saved().id;
		for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
		const completed = store.coopSession(sessionId);
		assert.equal(completed.adventure.floor, 200); assert.equal(completed.adventure.phase, 'complete');
		assert.equal(completed.adventure.mentor, undefined); assert.equal(saved(), undefined);
	});
	it('uses current delegation for both votes', () => {
		choose(host, 'attack');
		change(s => { s.delegatedTo = guest.id; });
		assert.throws(() => choose(host, 'guard'), /移交/);
		choose(guest, 'speed'); assert.equal(saved().adventure.mentor.card, 'speed');
		assert.deepEqual(saved().adventure.mentor.choices, { [host.id]: 'speed', [guest.id]: 'speed' });
	});
	it('rolls back a failed shared choice write before notifying the other player', () => {
		choose(host, 'balanced'); const before = saved(), original = store.updateCoopSession;
		try {
			store.updateCoopSession = (...args) => { original.apply(store, args); throw new Error('mentor write failed'); };
			assert.throws(() => choose(guest, 'balanced'), /mentor write failed/);
			assert.deepEqual(saved(), before);
		} finally { store.updateCoopSession = original; }
		choose(guest, 'balanced'); assert.equal(saved().adventure.mentor.card, 'balanced');
	});
});
