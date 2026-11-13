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

describe('Fantasy Rogue cooperative police events', () => {
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
		host = makeUser(`Police Host ${++serial}`, `127.0.85.${serial}`);
		guest = makeUser(`Police Guest ${serial}`, `127.0.86.${serial}`);
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
	function enter(floor = 21, roll = 0) {
		change(shared => {
			const a = shared.adventure; a.floor = floor; a.phase = 'area-selection';
			shared.areaSelections = {[host.id]: null, [guest.id]: null};
			a.routeChoices = [{id: 'trainerroute', name: '道路上的训练家', kind: 'trainer',
				encounters: [{key: 'original-trainer', name: '训练家', catchable: false, style: 'balanced',
					team: [{species: 'Pikachu', level: 15, ability: 'Static', moves: ['Thunderbolt'], nature: 'Serious'}]}],
				reward: {money: 200, items: {potion: 1}}}];
		});
		let first = true; crypto.randomInt = max => { if (first && max === 100) {first = false; return roll;} return 0; };
		try { for (const user of [host, guest]) manager.coop.command(user, {action: 'selectarea', value: 'trainerroute'}); }
		finally { crypto.randomInt = oldRandom; }
	}
	function region(id) {
		change(shared => {
			for (const user of [host, guest]) shared.adventure.members[user.id].coopEvent.police.choices = [id];
			shared.adventure.node.event.police.choices = [id];
		});
		agree('police:' + id);
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
	function continueTogether() {
		for (const user of [host, guest]) manager.coop.command(user, {action: 'continuebattle'});
	}
	function clearNode() {
		let count = 0;
		while (session().adventure.phase === 'battle-selection') {
			startBattle(); const before = session().adventure.coopPolice;
			const last = session().adventure.encounter + 1 === session().adventure.node.encounters.length;
			settle(); if (!last) assert.deepEqual(session().adventure.coopPolice, before);
			continueTogether(); count++; assert(count <= 4);
		}
		assert.equal(session().adventure.phase, 'route-interaction'); return count;
	}
	it('rolls the native 12 percent trainer replacement once, before the tera check', () => {
		enter(21, 11); assert.equal(event(host).id, 'policeassist');
		assert.equal(event(host).branchOptions.length, 3);
		assert.deepEqual(event(host).branchOptions, event(guest).branchOptions);
		assert(event(host).paragraphs.some(text => text.includes('君莎')));
		assert.equal(event(host).rivalPortrait, 'jenny');
		const saved = session(); manager.coop.command(host, {action: 'refresh'}); assert.deepEqual(session(), saved);
	});
	it('falls through to the native tera roll at 12 percent without creating police progress', () => {
		enter(21, 12); assert.equal(event(host).id, 'terasolo'); assert(!session().adventure.coopPolice);
	});
	it('requires matching votes, fences stale keys and pays once only after the second grunt', () => {
		enter(); const key = event(host).key, options = event(host).branchOptions;
		choose(host, options[0].id, key); choose(guest, options[1].id, key);
		assert.equal(session().adventure.phase, 'route-interaction'); choose(guest, options[0].id, key);
		assert.equal(session().adventure.phase, 'battle-selection');
		assert.throws(() => choose(host, options[0].id, key));
		const bag = {...member(host).bag}, money = member(host).money;
		startBattle(); settle(); assert.equal(session().adventure.battleResult.eventResolved, false);
		assert.equal(member(host).money, money); assert.deepEqual(member(host).bag, bag); continueTogether();
		startBattle(); const callback = created.rogue.onResult, outcome = settle(); const saved = session();
		callback(outcome); assert.deepEqual(session(), saved); continueTogether();
		assert(member(host).money > money); assert.equal(member(host).money, member(guest).money);
		assert.equal(member(host).coopEventReward.money, member(host).money - money);
		assert.deepEqual(member(host).coopEventReward, member(guest).coopEventReward);
	});
	it('plays all saved Paldea rounds, ordered bosses and eight-floor cooldowns in the real session', () => {
		enter(); region('paldea');
		for (let round = 0; round <= 8; round++) {
			assert.equal(session().adventure.node.event.police.round, round);
			if (round >= 3) assert.equal(session().adventure.node.encounters[0].trainer.id,
				['giacomo', 'mela', 'atticus', 'ortega', 'eri', 'penny'][round - 3]);
			assert.equal(clearNode(), round < 3 ? round + 2 : 1);
			assert.equal(session().adventure.coopPolice.regions.paldea.round, round);
			if (round < 8) enter(21 + (round + 1) * 8);
		}
		assert.equal(session().adventure.coopPolice.regions.paldea.status, 'cleared');
	});
	it('supports a guest-only leader intervention and awards both members without copying that companion', () => {
		change(shared => { shared.adventure.members[guest.id].socialCompanions = [{id: 'guzma', origin: 'event', preferences: 0, counted: []}]; });
		enter(); region('alola');
		assert.equal(event(host).stage, 'result'); assert.equal(session().adventure.coopPolice.regions.alola.status, 'averted');
		assert.deepEqual(member(host).coopEventReward, member(guest).coopEventReward);
		assert(!member(host).socialCompanions?.length); assert(event(host).paragraphs.some(text => text.includes('古兹马')));
	});
	it('uses the guest leader to avert an already pending revenge and displays the apology receipt', () => {
		change(shared => {
			shared.adventure.members[guest.id].socialCompanions = [{id: 'guzma', origin: 'event', preferences: 0, counted: []}];
			shared.adventure.coopPolice = {nextFloor: 20, regions: {alola: {floor: 12, revengeAfter: 20, status: 'pending', round: 1}}};
		});
		enter(); assert.equal(event(host).id, 'policerevenge'); assert.equal(event(host).stage, 'result');
		for (const user of [host, guest]) assert.equal(member(user).coopEventReward.items.superpotion, 1);
	});
	it('heals both sides after a lost Giovanni intervention without giving victory rewards', () => {
		change(shared => { shared.adventure.members[guest.id].blessings.companions = [{id: 'giovanni'}]; });
		enter(); region('johto'); assert(session().adventure.node.event.police.friendly);
		const money = member(host).money; startBattle(); const outcome = result(false);
		for (const team of [outcome.team, outcome.partnerTeam]) {team[0].hp = 0; team[0].status = 'brn';}
		created.rogue.onResult(outcome); assert(session().adventure.battleResult.eventResolved); continueTogether();
		assert.equal(member(host).money, money); assert.equal(session().adventure.coopPolice.regions.johto.status, 'averted');
		for (const user of [host, guest]) {assert.equal(member(user).team[0].hp, member(user).team[0].maxhp); assert.equal(member(user).team[0].status, '');}
	});
	it('shares Marnies fan dialogue without manufacturing a companion for the other player', () => {
		change(shared => { shared.adventure.members[guest.id].socialCompanions = [{id: 'marnie', origin: 'event', preferences: 0, counted: []}]; });
		enter(); region('galar'); assert(session().adventure.node.event.police.fans);
		assert(member(host).coopEvent.result.some(text => text.includes('玛俐'))); clearNode();
		assert(session().adventure.coopPolice.regions.galar.fans); assert(!member(host).socialCompanions?.length);
	});
	it('preserves Pennys final retry and heals both players when only the guest travels with her', () => {
		change(shared => {
			shared.adventure.members[guest.id].socialCompanions = [{id: 'penny', origin: 'event', preferences: 0, counted: []}];
			shared.adventure.coopPolice = {nextFloor: 20, regions: {paldea: {floor: 12, revengeAfter: 20, status: 'pending', round: 7}}};
		});
		enter(); assert.equal(session().adventure.node.encounters[0].trainer.id, 'penny');
		startBattle(); const outcome = result(false); outcome.team[0].hp = 0; outcome.partnerTeam[0].hp = 0;
		created.rogue.onResult(outcome); continueTogether();
		assert.equal(session().adventure.coopPolice.regions.paldea.round, 7);
		assert.equal(session().adventure.coopPolice.regions.paldea.status, 'pending');
		for (const user of [host, guest]) assert.equal(member(user).team[0].hp, member(user).team[0].maxhp);
	});
	for (const retreat of [false, true]) it(`keeps ordinary ${retreat ? 'retreat' : 'defeat'} retryable without a police advance`, () => {
		enter(); region('kanto'); const encounters = session().adventure.node.encounters;
		startBattle(); settle(false, 1, retreat); assert(!session().adventure.battleResult.eventResolved);
		assert(!session().adventure.coopPolice);
		for (const user of [host, guest]) manager.coop.command(user, {action: 'retrybattle'});
		assert.deepEqual(session().adventure.node.encounters, encounters); assert.equal(session().adventure.encounter, 0);
	});
	it('rolls back both accounts and progress if the second reward overflows', () => {
		enter(); region('kanto'); startBattle(); settle(); continueTogether();
		change(shared => { shared.adventure.members[guest.id].money = Number.MAX_SAFE_INTEGER; });
		startBattle(); const before = session(); assert.throws(() => settle(), /超出可保存范围/); assert.deepEqual(session(), before);
	});
	it('restores the saved multi-battle encounter after reconstruction and creates native four-seat combat', () => {
		enter(); region('kanto'); startBattle();
		const {Battle} = require('../../dist/sim/battle'), {Teams} = require('../../dist/sim/teams');
		const state = structuredClone(created.rogue.state);
		const battle = new Battle({formatid: 'gen9fantasyroguecoop', seed: [1,2,3,4], fantasyRogue: state,
			p1: {name: host.name, team: state.team.map(mon => mon.set)}, p2: {name: 'Police Enemy A', team: Teams.unpack(created.trainer.packedTeam)},
			p3: {name: guest.name, team: state.partner.team.map(mon => mon.set)}, p4: {name: 'Police Enemy B', team: Teams.unpack(created.rogue.cooperative.foe)}});
		try { for (const side of battle.sides) assert(battle.choose(side.id, 'default')); assert(battle.p2.active[0]); assert(battle.sides[3].active[0]); }
		finally { battle.destroy(); }
		settle(); continueTogether(); const before = manager.coop.view(guest).session.adventure;
		const restored = new RogueManager(new RogueEngine(store, engine.content), () => ({enabled: true}));
		assert.deepEqual(restored.coop.view(guest).session.adventure, before);
	});
	it('prepares enemy level modifiers after choosing a region, never against the empty map', () => {
		enter(); assert(!session().adventure.node.blessingPrepared); region('kanto');
		assert(session().adventure.node.blessingPrepared);
		const encounters = session().adventure.node.encounters;
		for (const encounter of encounters) {
			assert.equal(encounter.blessingLevelOffsets.length, encounter.team.length);
			for (const [i, set] of encounter.team.entries()) assert.equal(set.level, 11 + encounter.blessingLevelOffsets[i]);
		}
		startBattle(); settle(false, 1, true);
		for (const user of [host, guest]) manager.coop.command(user, {action: 'retrybattle'});
		assert.deepEqual(session().adventure.node.encounters, encounters);
	});
	it('keeps the 25 percent revenge gate and eight-floor cooldown instead of rolling once per member', () => {
		change(shared => { shared.adventure.coopPolice = {nextFloor: 21, regions: {kanto: {floor: 13, revengeAfter: 21, status: 'pending', round: 0}}}; });
		enter(21, 24); assert.equal(event(host).id, 'policerevenge'); assert.equal(session().adventure.node.event.police.round, 1);
		assert.equal(session().adventure.coopPolice.regions.kanto.round, 0);
		enter(21, 25); assert.equal(event(host).id, 'policeassist');
		change(shared => { shared.adventure.coopPolice.nextFloor = 29; });
		enter(28, 0); assert.equal(event(host).id, 'terasolo');
	});

	it('resumes the prepared fight after a personal preference milestone reward and shared dialogue', () => {
		change(shared => {
			const member = shared.adventure.members[guest.id];
			member.socialCompanions = [{id: 'marnie', origin: 'event', preferences: 0, counted: []}];
			member.trainerBonds = {marnie: {score: 99, gifts: [25, 50, 75], pending: []}};
		});
		enter(); region('galar'); assert.equal(session().adventure.phase, 'blessing-reward');
		const reward = member(guest).blessings.pending[0]; assert(reward);
		manager.coop.command(guest, {action: 'blessingreward', member: reward.id, value: reward.options[0]});
		assert.equal(session().adventure.phase, 'battle-selection');
		for (let i = 0; i < 5; i++) {
			const scene = manager.coop.view(host).session.adventure.coopAffection;
			if (!scene) break;
			for (const user of [host, guest]) manager.coop.command(user, {action: 'affection', visit: scene.visit, value: scene.options[0].id});
		}
		startBattle(); assert.equal(created.rogue.cooperative.name, guest.name);
	});

});

// Native-generator and payout parity across every region, including the complete Star chain.
describe('Fantasy Rogue cooperative police native parity', () => {
	const native = require('../../dist/server/fantasy-rogue/police-events');
	const coop = require('../../dist/server/fantasy-rogue/coop-police');
	const {POLICE_REGIONS} = require('../../dist/server/fantasy-rogue/police-data');
	const {normalizeBlessings} = require('../../dist/server/fantasy-rogue/blessings');
	const {stats, set} = require('../fixtures/fantasy-rogue');
	function run(region) {
		const r = {id: crypto.randomUUID(), contentVersion: 'test', floor: 101, phase: 'event', encounter: 0, attempt: 0,
			money: 100, bag: {}, boosts: stats(0), team: [createRoguePokemon(set('Bulbasaur', 'Overgrow', 50), stats(0))],
			caught: [], startingSlots: 1, difficulty: 0, notices: [],
			node: {id: 'trainer', kind: 'trainer', name: '君莎', encounters: [], reward: {money: 0, items: {}},
				event: {id: 'policeassist', key: 'shared-map', stage: 'choice', police: {choices: [region], round: 0}}}};
		normalizeBlessings(r); return r;
	}
	for (const region of Object.keys(POLICE_REGIONS)) it(`preserves ${region} enemy sets and native per-round rewards`, () => {
		const original = run(region), parties = [structuredClone(original), structuredClone(original)];
		native.choosePoliceRegion(original, 'police:' + region, () => 0);
		coop.chooseCoopPolice(parties, () => 0, 'police:' + region);
		const final = region === 'paldea' ? 8 : 3;
		for (let round = 0; round <= final; round++) {
			for (const party of parties) assert.deepEqual(party.node.encounters.map(e => e.team), original.node.encounters.map(e => e.team));
			for (let encounter = 0; encounter < original.node.encounters.length; encounter++) {
				original.encounter = encounter; for (const party of parties) party.encounter = encounter;
				native.settlePoliceBattle(original, true);
				assert.equal(coop.settleCoopPolice(parties, true), encounter + 1 === original.node.encounters.length);
			}
			for (const party of parties) {
				assert.deepEqual(party.police, original.police); assert.deepEqual(party.bag, original.bag);
				assert.equal(party.money, original.money); assert.deepEqual(party.boosts, original.boosts);
				assert.deepEqual(party.lastReward, original.lastReward);
			}
			if (round < final) {
				original.floor += 8; for (const party of parties) party.floor += 8;
				assert(native.beginPoliceEncounter(original, () => 0)); assert(coop.beginCoopPolice(parties, () => 0));
			}
		}
		assert.equal(parties[0].police.regions[region].status, 'cleared');
	});
	it('performs one shared world roll and retains both players personal region preferences', () => {
		const parties = [run('galar'), run('galar')];
		parties[1].socialCompanions = [{id: 'marnie', origin: 'event', preferences: 0, counted: []}];
		const expected = []; native.choosePoliceRegion(run('galar'), 'police:galar', max => {expected.push(max); return 0;});
		const calls = []; coop.chooseCoopPolice(parties, max => {calls.push(max); return 0;}, 'police:galar');
		assert.deepEqual(calls, expected);
		assert.equal(parties[1].socialCompanions[0].preferences, 1);
		assert(!parties[0].socialCompanions); assert.deepEqual(parties[0].node.encounters, parties[1].node.encounters);
	});
});
