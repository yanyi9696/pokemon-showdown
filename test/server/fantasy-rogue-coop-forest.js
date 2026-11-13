'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { content, set, firstEventRoute } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue shared forest spectators and mediation', () => {
	let oldConfig, store, engine, manager, host, guest, created, preview;
	let serial = 0;
	before(() => { preview = createPreviewContent(); });
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		const fixture = content(); fixture.blessings = true; fixture.wildTreasures = true;
		fixture.items = [...fixture.items, ...preview.items.filter(item => !fixture.items.some(entry => entry.id === item.id))];
		fixture.starters = [...fixture.starters, ...preview.starters.filter(entry => !fixture.starters.some(s => s.id === entry.id))];
		fixture.unlocks = { ...preview.unlocks, ...fixture.unlocks };
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, fixture);
		manager = new RogueManager(engine, () => ({ enabled: true, createRogueBattle(user, trainer, team, rogue) {
			created = { trainer, rogue }; return { roomid: 'battle-coop-forest-fixture' };
		} }));
		host = makeUser(`Forest Host ${++serial}`, `127.0.57.${serial}`);
		guest = makeUser(`Forest Guest ${serial}`, `127.0.58.${serial}`);
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
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	const session = () => store.coopSessionForUser(host.id);
	const member = user => session().adventure.members[user.id];
	const view = user => manager.coop.view(user).session.adventure.coopEvent;
	const choose = (user, value) => manager.coop.command(user, { action: 'eventchoice', value });
	function change(update) {
		const shared = session(), revision = shared.revision;
		update(shared); shared.revision++; store.updateCoopSession(shared, revision);
	}
	function enter() {
		change(shared => {
			shared.adventure.floor = 56;
			shared.adventure.routeChoices = [{ id: 'forestroute', name: '共同事件', kind: 'event',
				encounters: [], reward: { money: 0, items: {} } }];
			shared.adventure.coopEventHistory = Object.keys(EVENT_NAMES).filter(id => id !== 'forest')
				.map(id => ({ id, floor: 1 }));
		});
		firstEventRoute(() => {
			for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'forestroute' });
		});
		assert.equal(member(host).coopEvent.id, 'forest');
	}
	function agree(choice, roll = 0) {
		choose(host, choice);
		const original = crypto.randomInt;
		try {
			crypto.randomInt = max => max === 100 ? roll : 0; choose(guest, choice);
		} finally { crypto.randomInt = original; }
	}
	function finish() {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'finishroute' });
		assert.equal(session().adventure.floor, 57);
	}
	function watched(winner, support = 0) {
		change(shared => {
			for (const user of [host, guest]) {
				const event = shared.adventure.members[user.id].coopEvent;
				event.stage = 'watch'; event.support = support;
				event.replay = { winner, log: ['|start', winner === null ? '|tie' : `|win|${winner}`] };
			}
		});
	}
	function settle(won, retreat = false) {
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle', members: [member(user).team[0].id] });
		const state = created.rogue.state;
		const result = { encounterId: state.encounterId, won, turns: 1, team: state.team, partnerTeam: state.partner.team,
			bag: state.bag, partnerBag: state.partnerBag, defeated: [], ...(retreat ? { coopExit: 'retreat' } : {}) };
		created.rogue.onResult(result);
		return result;
	}
	it('shares distinct rosters and one real spectator replay without spending party resources', () => {
		enter(); const initial = view(host);
		assert.equal(initial.stage, 'choice'); assert.deepEqual(initial.teams, view(guest).teams);
		assert.equal(initial.teams.length, 2); assert(initial.teams.every(team => team.length === 3));
		assert.equal(new Set(initial.teams.flat().map(mon => mon.species)).size, 6);
		change(shared => {
			const teams = [Array.from({ length: 3 }, () => set('Magikarp', 'Swift Swim', 1, ['Splash'])),
				Array.from({ length: 3 }, () => set('Pikachu', 'Static', 30, ['Thunderbolt']))];
			for (const user of [host, guest]) shared.adventure.members[user.id].coopEvent.teams = structuredClone(teams);
		});
		const before = session().adventure.members;
		choose(host, 'right'); assert.equal(view(host).stage, 'choice');
		choose(guest, 'right');
		assert.equal(view(host).stage, 'watch'); assert.equal(view(host).ownChoice, null);
		assert.equal(view(host).branchResolved, false); assert.equal(view(host).support, 1);
		assert(view(host).replay.some(line => line.startsWith('|move|')));
		assert.deepEqual(view(host).replay, view(guest).replay);
		assert.equal(member(host).coopEvent.replay.winner, 1);
		for (const user of [host, guest]) {
			assert.deepEqual(member(user).team, before[user.id].team);
			assert.deepEqual(member(user).bag, before[user.id].bag);
			assert.equal(member(user).money, before[user.id].money);
		}
		const log = view(host).replay; manager = new RogueManager(engine);
		assert.deepEqual(view(host).replay, log);
		choose(host, 'watched'); assert.equal(view(guest).stage, 'watch');
		choose(guest, 'watched'); assert.equal(view(host).stage, 'fragments');
		agree('fragments'); finish();
	});
	for (const roll of [0, 29]) {
		it(`shares the low mediation reward at roll ${roll} without offering fragments`, () => {
			enter(); agree('mediate', roll);
			assert.equal(view(host).stage, 'result'); assert.equal(view(host).ownComplete, true);
			assert.deepEqual(member(host).coopEvent.forestOutcome, member(guest).coopEvent.forestOutcome);
			assert.deepEqual(member(host).bag, member(guest).bag);
			assert.equal(member(host).blessings.shards, 0); finish();
		});
	}
	for (const choice of ['fragments', 'supplies']) {
		it(`requires fresh common agreement for ${choice} and respects both fragment ledgers`, () => {
			enter(); change(shared => {
				shared.adventure.members[host.id].eventFragments = { 51: 32 };
				shared.adventure.members[guest.id].eventFragments = { 51: 30 };
			});
			agree('mediate', 30);
			assert.equal(view(host).stage, 'fragments'); assert.equal(view(host).branchResolved, false);
			assert.equal(member(host).coopEvent.fragmentOffer.amount, 8);
			const before = session().adventure.members;
			choose(host, choice); choose(guest, choice === 'fragments' ? 'supplies' : 'fragments');
			assert.equal(view(host).stage, 'fragments'); assert.deepEqual(member(host).bag, before[host.id].bag);
			choose(guest, choice);
			assert.equal(view(host).stage, 'result');
			if (choice === 'fragments') {
				assert.equal(member(host).eventFragments[51], 40); assert.equal(member(guest).eventFragments[51], 38);
				assert.equal(member(host).blessings.shards, 8); assert.equal(member(guest).blessings.shards, 8);
			} else {
				assert.deepEqual(member(host).bag, member(guest).bag); assert.equal(member(host).blessings.shards, 0);
			}
			finish();
		});
	}
	it('uses the ordinary shared fruit reward when either personal fragment budget is exhausted', () => {
		enter(); change(shared => { shared.adventure.members[guest.id].eventFragments = { 51: 40 }; });
		agree('mediate', 74);
		assert.equal(view(host).stage, 'result'); assert.equal(member(host).coopEvent.fragmentOffer, undefined);
		assert.deepEqual(member(host).bag, member(guest).bag); finish();
	});
	it('settles a spectator tie with shared supplies and leaves both player teams untouched', () => {
		enter(); watched(null);
		const before = session().adventure.members;
		agree('watched');
		assert.equal(view(host).stage, 'result'); assert.equal(member(host).coopEvent.fragmentOffer, undefined);
		for (const user of [host, guest]) assert.deepEqual(member(user).team, before[user.id].team);
		assert.deepEqual(member(host).bag, member(guest).bag); finish();
	});
	for (const mediation of [true, false]) {
		it(`launches the shared ${mediation ? 'six-member mediation' : 'three-member winner'} encounter and settles once`, () => {
			enter(); if (!mediation) watched(1);
			agree(mediation ? 'mediate' : 'watched', 75);
			assert.equal(session().adventure.phase, 'battle-selection');
			assert.equal(session().adventure.node.encounters[0].team.length, mediation ? 6 : 3);
			const result = settle(true);
			assert.equal(created.rogue.state.catchable, true); assert.equal(created.rogue.wild, true);
			assert.deepEqual(member(host).coopEvent.battleSupplies, member(guest).coopEvent.battleSupplies);
			const saved = session(); created.rogue.onResult(result); assert.deepEqual(session(), saved);
			for (const user of [host, guest]) manager.coop.command(user, { action: 'continuebattle' });
			assert.equal(view(host).ownComplete, true); finish();
		});
	}
	for (const retreat of [false, true]) {
		it(`finishes a ${retreat ? 'retreated' : 'lost'} forest challenge without paying a victory reward`, () => {
			enter(); agree('mediate', 99);
			const before = session().adventure.members;
			settle(false, retreat);
			for (const user of [host, guest]) {
				assert.deepEqual(member(user).bag, before[user.id].bag);
				assert.equal(member(user).money, before[user.id].money);
				manager.coop.command(user, { action: 'continuebattle' });
			}
			finish();
		});
	}
	it('rolls back a shared follow-up on write failure and lets the delegated controller retry', () => {
		enter(); watched(0); choose(host, 'watched');
		const before = session(), update = store.updateCoopSession;
		try {
			store.updateCoopSession = (...args) => { update.apply(store, args); throw new Error('forest save failed'); };
			assert.throws(() => choose(guest, 'watched'), /forest save failed/);
			assert.deepEqual(session(), before);
		} finally { store.updateCoopSession = update; }
		manager.coop.command(guest, { action: 'delegate', value: 'partner' });
		choose(host, 'watched'); assert.equal(view(host).stage, 'fragments');
		choose(host, 'fragments'); assert.equal(view(guest).ownComplete, true);
	});
});
