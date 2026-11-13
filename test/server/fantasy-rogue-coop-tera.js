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

describe('Fantasy Rogue cooperative wild Tera encounters', () => {
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
		host = makeUser(`Tera Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Tera Guest ${serial}`, `127.0.86.${serial}`);
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
	function enterTera(roll = 0, kind = 'trainer', floor = 61) {
		change(shared => {
			const a = shared.adventure; a.floor = floor; a.phase = 'area-selection';
			shared.areaSelections = {[host.id]: null, [guest.id]: null};
			a.routeChoices = [{id: 'tera-route', name: '区域训练家', kind,
				encounters: [{name: '原训练家', catchable: false, style: 'balanced',
					team: [{species: 'Bulbasaur', level: 10, moves: ['Tackle'], ability: 'Overgrow', nature: 'Serious'}]}],
				reward: {money: 120, items: {potion: 2}}}];
		});
		// Police now precedes Tera on trainer routes; decline that independent world event.
		let hundreds = 0;
		crypto.randomInt = max => max === 100 ? (++hundreds === 1 ? 99 : roll) : 0;
		try { for (const user of [host, guest]) manager.coop.command(user, {action: 'selectarea', value: 'tera-route'}); }
		finally { crypto.randomInt = oldRandom; }
		return session().adventure.node.event?.id;
	}
	function back() {
		for (const user of [host, guest]) manager.coop.command(user, {action: 'continuebattle'});
		assert.equal(session().adventure.phase, 'route-interaction');
	}
	function nativeBattle() {
		const {Battle} = require('../../dist/sim/battle'), {Teams} = require('../../dist/sim/teams');
		const state = structuredClone(created.rogue.state);
		return new Battle({formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: {name: host.name, team: state.team.map(mon => mon.set)},
			p2: {name: 'Wild A', team: Teams.unpack(created.trainer.packedTeam)},
			p3: {name: guest.name, team: state.partner.team.map(mon => mon.set)},
			p4: {name: 'Wild B', team: Teams.unpack(created.rogue.cooperative.foe)}});
	}
	it('uses the native 12% trainer-area chance and does not replace other route kinds', () => {
		assert.equal(enterTera(12), undefined); assert.equal(enterTera(11), 'terasolo');
		assert.equal(enterTera(0, 'wild'), undefined); assert.equal(enterTera(0, 'boss'), undefined);
	});
	it('automatically transforms both wild enemy seats exactly once, never the players, including after checkpoint restore', () => {
		enterTera(); startBattle(); const type = session().adventure.node.event.expedition.tera;
		assert(created.rogue.state.forcedTera); assert(created.rogue.state.catchable);
		const battle = nativeBattle();
		try {
			for (const side of battle.sides) assert(battle.choose(side.id, 'team 1'));
			assert.equal(battle.p2.active[0].terastallized, type); assert.equal(battle.p4.active[0].terastallized, type);
			assert(!battle.p1.active[0].terastallized); assert(!battle.p3.active[0].terastallized);
			assert.equal(battle.fantasyRogue.forcedTera, false);
			assert.equal(battle.log.filter(line => line.startsWith('|-terastallize|')).length, 2);
			const {captureCoopCheckpoint, validCoopCheckpoint} = require('../../dist/sim/rogue-coop-checkpoint');
			const cp = captureCoopCheckpoint(battle); assert(validCoopCheckpoint(cp, created.rogue.state.encounterId));
			const {Battle} = require('../../dist/sim/battle'); const restored = Battle.fromJSON(cp.state);
			try {
				const {rogueSwitchIn} = require('../../dist/sim/fantasy-rogue');
				const count = restored.log.filter(line => line.startsWith('|-terastallize|')).length;
				for (const side of restored.sides) rogueSwitchIn(side.active[0]);
				assert.equal(restored.log.filter(line => line.startsWith('|-terastallize|')).length, count);
				assert.equal(restored.p4.active[0].terastallized, type);
			} finally {restored.destroy();}
		} finally {battle.destroy();}
	});
	for (const floor of [1, 50, 100, 199]) it(`gives both players native shard quantities at floor ${floor}, without duplicate node rewards`, () => {
		enterTera(0, 'trainer', floor); startBattle();
		const type = session().adventure.node.event.expedition.tera, id = 'terashard' + type.toLowerCase();
		const before = [host, guest].map(user => member(user).bag[id] || 0);
		const outcome = settle(); const saved = session(); created.rogue.onResult(outcome); assert.deepEqual(session(), saved); back();
		for (const [index, user] of [host, guest].entries()) assert.equal(member(user).bag[id], before[index] + 15 + Math.floor(floor / 4));
		for (const user of [host, guest]) manager.coop.command(user, {action: 'finishroute'});
		for (const [index, user] of [host, guest].entries()) assert.equal(member(user).bag[id], before[index] + 15 + Math.floor(floor / 4));
	});
	it('keeps the same encounter after retreat and awards nothing on defeat', () => {
		enterTera(); startBattle(); const node = structuredClone(session().adventure.node);
		settle(false, 1, true); assert.equal(session().adventure.battleResult.eventResolved, false);
		for (const user of [host, guest]) manager.coop.command(user, {action: 'retrybattle'});
		assert.deepEqual(session().adventure.node, node); startBattle(); settle(false); back();
		for (const user of [host, guest]) assert.equal(member(user).bag['terashard' + node.event.expedition.tera.toLowerCase()] || 0, 0);
	});
	it('preserves capture ownership while both players receive the event shards', () => {
		enterTera(); startBattle(); const node = session().adventure.node;
		const captured = createRoguePokemon(node.encounters[0].team[0], member(guest).boosts);
		const outcome = result(); outcome.captures = [captured]; outcome.captureOwners = {[captured.id]: 'p3'};
		created.rogue.onResult(outcome); back();
		assert(member(guest).team.some(mon => mon.id === captured.id)); assert(!member(host).team.some(mon => mon.id === captured.id));
		for (const user of [host, guest]) assert.equal(member(user).bag['terashard' + node.event.expedition.tera.toLowerCase()], 30);
	});
	it('rolls shard settlement back for both players if either inventory overflows', () => {
		enterTera(); startBattle(); const id = 'terashard' + session().adventure.node.event.expedition.tera.toLowerCase();
		const outcome = result(); outcome.partnerBag[id] = Number.MAX_SAFE_INTEGER;
		const before = session(); assert.throws(() => created.rogue.onResult(outcome));
		assert.deepEqual(session(), before);
	});

});
