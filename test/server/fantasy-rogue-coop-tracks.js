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

describe('Fantasy Rogue cooperative legendary tracks', () => {
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
		host = makeUser(`Tracks Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Tracks Guest ${serial}`, `127.0.86.${serial}`);
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
	function discover() {
		enter('legendarytracks');
		const tracks = member(host).coopEvent.tracks;
		agree('investigate'); agree('site:' + tracks.answer);
		startBattle(); return tracks;
	}
	function back() {
		for (const user of [host, guest]) manager.coop.command(user, {action: 'continuebattle'});
		assert.equal(session().adventure.phase, 'route-interaction');
	}
	it('hides the answer and species, requires consensus and rejects stale or forged choices', () => {
		enter('legendarytracks');
		const tracks = member(host).coopEvent.tracks, key = event(host).key;
		assert(!JSON.stringify(event(host)).includes('"answer"'));
		assert(!JSON.stringify(event(host)).includes(tracks.species));
		assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
		assert.throws(() => choose(host, 'site:99'));
		choose(host, 'investigate'); assert(!member(host).coopEvent.committed);
		choose(guest, 'investigate', key); assert(member(host).coopEvent.committed);
		assert.throws(() => choose(host, 'leave', key));
		assert.throws(() => choose(host, 'site:99'));
		assert.throws(() => choose(host, 'leave'));
	});
	for (const roll of [34, 35]) it(`uses one shared flight roll at the 35 percent boundary: ${roll}`, () => {
		enter('legendarytracks'); agree('investigate');
		const tracks = member(host).coopEvent.tracks, wrong = (tracks.answer + 1) % 4;
		let rolls = 0;
		crypto.randomInt = max => { if (max === 100) { rolls++; return roll; } return oldRandom(max); };
		agree('site:' + wrong);
		assert.equal(rolls, 1);
		assert.equal(event(host).stage, roll < 35 ? 'result' : 'choice');
		assert.deepEqual(member(host).coopEvent, member(guest).coopEvent);
		assert.deepEqual(member(host).coopEvent.tracks.tried, [wrong]);
		assert.throws(() => choose(host, 'site:' + wrong));
	});
	it('reveals the native clue after two failed searches and restores it after manager recreation', () => {
		enter('legendarytracks'); agree('investigate');
		const tracks = member(host).coopEvent.tracks;
		crypto.randomInt = max => max === 100 ? 99 : oldRandom(max);
		for (const wrong of [0, 1, 2, 3].filter(i => i !== tracks.answer).slice(0, 2)) agree('site:' + wrong);
		assert(member(host).coopEvent.result.some(line => line.includes(tracks.sites[tracks.answer])));
		const before = event(guest);
		const restored = new RogueManager(new RogueEngine(store, engine.content), () => ({enabled: true}));
		assert.deepEqual(restored.coop.view(guest).session.adventure.coopEvent, before);
		assert.equal(before.branchOptions.length, 2);
	});
	it('can leave before committing without receiving rewards', () => {
		enter('legendarytracks'); const bags = [host, guest].map(user => member(user).bag);
		agree('leave');
		for (const [index, user] of [host, guest].entries()) {
			assert.equal(event(user).stage, 'result'); assert.deepEqual(member(user).bag, bags[index]);
		}
	});
	for (const won of [true, false]) it(`settles the encounter once after ${won ? 'victory' : 'defeat'}`, () => {
		discover(); const outcome = settle(won), saved = session();
		created.rogue.onResult(outcome); assert.deepEqual(session(), saved);
		assert(session().adventure.battleResult.eventResolved);
		back(); assert.equal(event(host).stage, 'result'); assert.equal(event(guest).stage, 'result');
		assert.deepEqual(session().adventure.node.reward, {money: 0, items: {}});
	});
	it('keeps the original encounter on retreat and only settles after retry', () => {
		discover(); const encounters = session().adventure.node.encounters;
		settle(false, 1, true); assert(!session().adventure.battleResult.eventResolved);
		assert.throws(() => manager.coop.command(host, {action: 'continuebattle'}));
		for (const user of [host, guest]) manager.coop.command(user, {action: 'retrybattle'});
		assert.deepEqual(session().adventure.node.encounters, encounters);
		startBattle(); settle(); back(); assert.equal(event(host).stage, 'result');
	});
	it('starts a real four-seat battle and assigns the capture only to its agreed owner', () => {
		discover(); assert(created.rogue.state.catchable);
		const {Battle} = require('../../dist/sim/battle');
		const {Teams} = require('../../dist/sim/teams');
		const state = structuredClone(created.rogue.state);
		const battle = new Battle({formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: {name: host.name, team: state.team.map(mon => mon.set)},
			p2: {name: 'Tracks A', team: Teams.unpack(created.trainer.packedTeam)},
			p3: {name: guest.name, team: state.partner.team.map(mon => mon.set)},
			p4: {name: 'Tracks B', team: Teams.unpack(created.rogue.cooperative.foe)}});
		try {
			for (const side of battle.sides) assert(battle.choose(side.id, 'team 1'));
			assert.equal(battle.sides.length, 4); assert(battle.p2.active[0]); assert(battle.sides[3].active[0]);
		} finally { battle.destroy(); }
		const captured = createRoguePokemon(session().adventure.node.encounters[0].team[0], member(guest).boosts);
		const outcome = result(); outcome.captures = [captured]; outcome.captureOwners = {[captured.id]: 'p3'};
		created.rogue.onResult(outcome); back();
		assert(member(guest).team.some(mon => mon.id === captured.id));
		assert(!member(host).team.some(mon => mon.id === captured.id));
		assert.equal(event(host).stage, 'result');
	});
	it('preserves the native floor gates, rarity weights and generated clues', () => {
		enter('legendarytracks');
		const native = require('../../dist/server/fantasy-rogue/legendary-tracks');
		const coop = require('../../dist/server/fantasy-rogue/coop-tracks');
		const {Dex} = require('../../dist/sim/dex');
		assert.deepEqual(native.legendaryTrackPool(50), []);
		for (const floor of [51, 100, 101, 151, 199]) {
			const pool = native.legendaryTrackPool(floor);
			assert.equal(pool.some(entry => Dex.mod('gen9').species.get(entry.species).tags.includes('Restricted Legendary')), floor >= 101);
			for (const entry of pool) {
				const tags = Dex.mod('gen9').species.get(entry.species).tags;
				assert.equal(entry.weight, tags.includes('Restricted Legendary') ? (floor >= 151 ? 4 : 2) :
					tags.includes('Mythical') ? (floor >= 101 ? 3 : 1) : 4);
			}
			const run = manager.coop.eventRun(session().adventure, host.id);
			run.floor = floor; run.node = {kind: 'event', encounters: [], reward: {money: 0, items: {}}};
			const counterpart = structuredClone(run), calls = [], otherCalls = [];
			native.beginLegendaryTracks(run, max => { calls.push(max); return max - 1; });
			coop.beginCoopTracks(counterpart, max => { otherCalls.push(max); return max - 1; });
			assert.deepEqual(calls, otherCalls); assert.deepEqual(run.node.event.tracks, counterpart.node.event.tracks);
		}
	});
	it('rejects divergent player copies before changing either search', () => {
		enter('legendarytracks');
		const {chooseCoopTracks} = require('../../dist/server/fantasy-rogue/coop-tracks');
		const runs = [host, guest].map(user => manager.coop.eventRun(session().adventure, user.id));
		runs[1].node.event.tracks.answer = (runs[0].node.event.tracks.answer + 1) % 4;
		const before = structuredClone(runs);
		assert.throws(() => chooseCoopTracks(runs, () => 0, 'investigate'));
		assert.deepEqual(runs, before);
	});
});
