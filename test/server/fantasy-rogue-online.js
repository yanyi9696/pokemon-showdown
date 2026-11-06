'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { Battle } = require('../../dist/sim/battle');
const { Teams } = require('../../dist/sim/teams');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

async function until(check, name) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > 8000) throw new Error(`Timed out: ${name}`);
		await delay(5);
	}
}

describe('Fantasy Rogue real rooms', function () {
	this.timeout(20000);
	let ai, store, manager, user, guest, oldLocal, oldReporting;
	let serial = 0;
	const rooms = [];
	const account = () => store.get(user.id);
	function command(action, details = {}) {
		return manager.command(user.connections[0], { id: randomUUID(), revision: account().revision, action, ...details });
	}
	beforeEach(() => {
		oldReporting = Config.reportbattles;
		oldLocal = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1'; Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:');
		ai = new AIChallengeManager([], { enabled: true, decisionMs: 0, maxBattles: 1 }, 6);
		manager = new RogueManager(new RogueEngine(store, content()), () => ai);
		user = makeUser(`Rogue UI ${++serial}`, `127.0.3.${serial}`);
		guest = makeUser(`Rogue Co-op ${++serial}`, `127.0.4.${serial}`);
	});
	for (const choice of ['0', '1']) it(`resumes the window elder dialogue and explicitly answers branch ${choice}`, () => {
		const { prepareElderMeeting } = require('../../dist/server/fantasy-rogue/mainline');
		const { MAINLINE_SCRIPT } = require('../../dist/server/fantasy-rogue/mainline-data');
		command('start', { starters: ['bulbasaur'] });
		manager.engine.content.story = true;
		store.change(user.id, saved => {
			saved.run.node = { id: 'elder', kind: 'event', encounters: [], reward: { money: 0, items: {} } };
			const rolls = [99, MAINLINE_SCRIPT.ordinary.findIndex(scene => scene.id === 'elder-window')];
			assert(prepareElderMeeting(saved, saved.run, n => rolls.shift() % n));
		});
		let state = manager.state(user);
		assert.equal(state.protocolVersion, 2);
		for (let i = 0; i < 2; i++) state = command('storynext', { value: state.story.key });
		assert.equal(state.story.text, '你抬头看了看窗外。');
		assert.deepEqual(state.story.options.map(option => option.id), ['0', '1']);
		const before = structuredClone(account());
		assert.throws(() => command('storynext', { value: state.story.key }), /请先回应老人/);
		assert.deepEqual(account(), before);
		const reconnect = new RogueManager(manager.engine, () => ai).state(user);
		assert.deepEqual(reconnect.story, state.story);
		const request = { id: randomUUID(), revision: state.account.revision, action: 'mainlinechoice', value: state.story.key, member: choice };
		state = manager.command(user.connections[0], request);
		const answered = structuredClone(account());
		manager.command(user.connections[0], request);
		assert.deepEqual(account(), answered);
		while (state.story) state = command('storynext', { value: state.story.key });
		assert.equal(state.protocolVersion, 1);
		assert.equal(state.run.phase, 'reward');
		assert(account().run.lastReward);
		assert.deepEqual(account().mainline.completed, []);
	});
	for (const win of [true, false]) it(`plays a complete native AI preview and ${win ? 'accepts the win' : 'discards the loss'}`, async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			const {normalizeBlessings} = require('../../dist/server/fantasy-rogue/blessings');
			const {grantCompanion} = require('../../dist/server/fantasy-rogue/companions');
			const {blessing} = require('../../dist/sim/rogue-blessing-data');
			const run = saved.run;
			normalizeBlessings(run).owned.push({...blessing('companionai'), floor: 1}); grantCompanion(run, 'sada');
			run.team = [createRoguePokemon(win ? set('Mew', 'Synchronize', 100, ['Psychic']) : set('Magikarp', 'Swift Swim', 1, ['Splash']), stats(0))];
			run.node.encounters[0].team = [win ? set('Magikarp', 'Swift Swim', 1, ['Splash']) : set('Mew', 'Synchronize', 100, ['Psychic'])];
		});
		const before = structuredClone(account().run);
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		assert(room.battle.roguePreview);
		await until(() => room.battle.ended && account().run.preview?.stage === 'result', 'autonomous preview completion');
		assert.equal(account().run.preview.result.won, win);
		assert.deepEqual(account().run.team, before.team); assert.deepEqual(account().run.bag, before.bag);
		assert.equal(account().run.encounter, before.encounter); assert(!account().run.emergencyRecovery);
		command('previewresult', {value: win ? 'accept' : 'personal'});
		if (win) assert.equal(account().run.encounter, before.encounter + 1);
		else {
			const retry = Rooms.get(command('battle').run.roomid); rooms.push(retry);
			assert(!retry.battle.roguePreview); assert.deepEqual(account().run.team, before.team);
		}
	});
	it('uses the gym search budget for challenges and returns to an explicit retry or leave decision', async () => {
		const { challengeNode } = require('../../dist/server/fantasy-rogue/optional-challenges');
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			const run = saved.run;
			run.floor = 8;
			delete run.node;
			run.choices = [challengeNode('schoolfinal', 8)];
			run.encounter = 0;
			run.phase = 'choose';
			run.challengeHistory = [{ id: 'schoolfinal', floor: 8 }];
			run.lastReward = { floor: 7, encounter: 1, money: 0, items: { pearl: 1 } };
		});
		const before = structuredClone(account().run);
		assert.equal(manager.state(user).protocolVersion, 2);
		const offered = command('select', { value: 'challenge:schoolfinal' });
		assert.equal(offered.protocolVersion, 2);
		assert.equal(offered.run.phase, 'event');
		assert.equal(offered.run.challenge.stage, 'offer');
		assert.equal(offered.run.lastReward.floor, 7);
		assert.equal(offered.run.money, before.money);
		assert.deepEqual(offered.run.bag, before.bag);
		const reconnect = new RogueManager(manager.engine, () => ai).state(user);
		assert.equal(reconnect.protocolVersion, 2);
		assert.deepEqual(reconnect.run.challenge, offered.run.challenge);
		assert.throws(() => command('challenge', { value: 'supplies' }));
		const ready = command('challenge', { value: 'accept' });
		assert.equal(ready.run.phase, 'ready');
		assert.equal(ready.run.challenge.stage, 'battle');
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		assert.equal(room.battle.fantasyAI.options.rogue.immediate, false);
		assert.equal(room.battle.fantasyAI.options.decisionMs, 0);
		assert.equal(room.battle.options.fantasyRogue.optionalChallenge, true);
		await until(() => room.battle.p2.request.isWait === true, 'challenge AI preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'challenge first move');
		manager.retreat(user.connections[0], room.roomid);
		await until(() => room.battle.ended && account().run.node.challenge.stage === 'paused', 'challenge retreat');
		assert.equal(account().run.floor, 8);
		command('challenge', { value: 'retry' });
		const retry = Rooms.get(command('battle').run.roomid); rooms.push(retry);
		assert.equal(retry.battle.fantasyAI.options.rogue.immediate, false);
		await until(() => retry.battle.p2.request.isWait === true, 'challenge retry preview');
		retry.battle.choose(user, `team 1|${retry.battle.p1.request.rqid}`);
		await until(() => JSON.parse(retry.battle.p1.request.request).active, 'challenge retry first move');
		manager.retreat(user.connections[0], retry.roomid);
		await until(() => retry.battle.ended && account().run.node.challenge.stage === 'paused', 'second retreat');
		command('challenge', { value: 'leave' }); assert.equal(account().run.floor, 9);
	});
	afterEach(async () => {
		await ai.dispose();
		for (const room of rooms.splice(0)) Rooms.get(room.roomid)?.destroy();
		user.disconnectAll(); user.destroy();
		guest.disconnectAll(); guest.destroy();
		store.close();
		Config.fantasyailocal = oldLocal.local; Config.bindaddress = oldLocal.bind; Config.fantasyrogue = oldLocal.rogue;
		Config.reportbattles = oldReporting;
	});
	for (const wild of [false, true]) it(`runs ${wild ? 'lightweight wild' : 'native-turn trainer'} doubles in a real room`, async () => {
		// Exercise the real worker; the zero-budget default used by other room fixtures only tests fallback.
		ai.scheduler.decisionMs = 5000;
		command('start', { starters: ['bulbasaur'] });
		command('select', { value: 'grass' });
		store.change(user.id, saved => {
			const run = saved.run;
			run.doubleBattle = true;
			run.team = [
				createRoguePokemon(set('Pikachu', 'Static', 50, ['Thunderbolt', 'Protect']), stats(0)),
				createRoguePokemon(set('Raichu', 'Static', 50, ['Thunderbolt', 'Protect']), stats(0)),
			];
			run.node.kind = wild ? 'battle' : 'trainer';
			run.node.encounters[0].catchable = wild;
			run.node.encounters[0].team = [
				set('Charizard', 'Blaze', 50, ['Flamethrower', 'Protect']),
				set('Blastoise', 'Torrent', 50, ['Water Gun', 'Protect']),
			];
		});
		const room = Rooms.get(command('battle').run.roomid);
		rooms.push(room);
		assert.equal(room.battle.gameType, 'doubles');
		assert.equal(room.battle.format, 'gen9fantasyroguedoubles');
		await until(() => !!room.battle.p1?.request?.request, 'doubles player request');
		const initialRequest = JSON.parse(room.battle.p1.request.request);
		assert.equal(initialRequest.teamPreview, undefined);
		assert.equal(initialRequest.active.length, 2);
		await until(() => room.battle.p2.request.isWait === true && room.battle.p2.request.choice.startsWith('move '), 'doubles AI joint action');
		assert(room.battle.p2.request.choice.includes(','), 'the AI submits both active actions together');
		assert.equal(room.battle.fantasyAI.metrics.illegalChoices, 0);
		assert.equal(room.battle.fantasyAI.metrics.workerErrors, 0);
		assert.equal(ai.scheduler.metrics.completed, 1);
		assert.equal(room.battle.fantasyAI.metrics.searchFallbacks, 0);
		assert.equal(room.battle.fantasyAI.metrics.jointTurnDecisions, wild ? 0 : 1);
	});
	it('keeps authored trainer leads with a single player Pokemon, without preview or lost reserves', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			const run = saved.run;
			run.doubleBattle = true;
			run.node.kind = 'trainer';
			Object.assign(run.node.encounters[0], { catchable: false, team: [
				set('Pelipper', 'Drizzle', 50, ['Scald', 'Hurricane', 'Protect']),
				set('Ludicolo', 'Swift Swim', 50, ['Hydro Pump', 'Giga Drain', 'Ice Beam', 'Protect']),
				set('Magikarp', 'Swift Swim', 50, ['Splash']), set('Squirtle', 'Torrent', 50, ['Water Gun']),
			] });
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => !!room.battle.p1?.request?.request, 'solo doubles first request');
		assert.equal(JSON.parse(room.battle.p1.request.request).teamPreview, undefined);
		const native = room.battle.stream.battle;
		assert.deepEqual(native.p2.active.map(mon => mon.species.name), ['Pelipper', 'Ludicolo']);
		assert.deepEqual(native.fantasyRogue.opponentSlots, [0, 1, 2, 3]);
		assert.equal(native.p2.pokemon.length, 4);
		assert(native.p2.active[0].set.fantasyRogueId.endsWith(':foe:0'));
		assert(native.p2.active[1].set.fantasyRogueId.endsWith(':foe:1'));
	});
	it('runs three independent AI seats in a cooperative room and settles the human party once', async () => {
		command('start', {starters: ['bulbasaur']}); command('select', {value: 'grass'});
		store.change(user.id, saved => {
			const run = saved.run, foe = set('Magikarp', 'Swift Swim', 1, ['Splash']);
			run.team = [createRoguePokemon(set('Mew', 'Synchronize', 100, ['Dragon Rage']), stats(0))];
			run.node.encounters[0].team = [foe, {...foe}];
			run.node.encounters[0].cooperative = {id: 'marnie', name: '玛俐', team: [set('Dragonair', 'Shed Skin', 100, ['Dragon Rage'])]};
		});
		const initial = account().run;
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => ['p2', 'p3', 'p4'].every(id => room.battle[id]?.request.isWait === true), 'all AI previews');
		assert.equal(room.battle.gameType, 'multi');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active && ['p2', 'p3', 'p4'].every(id => room.battle[id].request.isWait === true), 'three independent AI moves');
		for (let turn = 0; turn < 3 && !room.battle.ended; turn++) {
			const rqid = room.battle.p1.request.rqid;
			room.battle.choose(user, `default|${rqid}`);
			await until(() => room.battle.ended || room.battle.p1.request.rqid > rqid, 'cooperative turn');
		}
		await until(() => room.battle.ended && !account().run.battle, 'cooperative settlement');
		assert.equal(account().run.team.length, 1);
		assert.equal(account().run.team[0].id, initial.team[0].id);
		assert.equal(account().run.encounter, initial.encounter + 1);
	});
	for (const wild of [false, true]) it(`keeps p1/p3 human seats with ${wild ? 'lightweight wild' : 'native-turn trainer'} enemies`, async () => {
		ai.scheduler.decisionMs = 5000;
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		const partnerMon = createRoguePokemon(set('Pikachu', 'Static', 50, ['Thunderbolt', 'Protect']), stats(0));
		partnerMon.hp = Math.max(1, partnerMon.hp - 13);
		partnerMon.pp[0].pp--;
		const guestPacked = Teams.pack([partnerMon.set]);
		store.change(user.id, saved => {
			const run = saved.run, foe = set('Magikarp', 'Swift Swim', 1, ['Splash']);
			run.node.encounters[0].team = [foe, { ...foe }];
			run.node.encounters[0].cooperative = { id: 'support', name: '支援训练家',
				team: [set('Dragonair', 'Shed Skin', 50, ['Dragon Rage'])] };
			run.phase = 'battle';
			run.battle = { token: 'coop-human-seat', encounterId: 'coop-human-seat' };
		});
		const state = manager.engine.battleState(user.id), foeTeam = account().run.node.encounters[0].team;
		state.partner = { team: [partnerMon], boosts: stats(0) };
		state.systems.partner = { mega: false, z: false, gmega: false };
		state.tera.partner = false;
		const room = ai.createRogueBattle(user, {
			id: 'coop-human-seat', name: '双人席位验证', avatar: '', format: 'gen9fantasyroguecoop',
			packedTeam: Teams.pack(foeTeam.slice(0, 1)),
		}, Teams.pack(account().run.team.map(mon => mon.set)), {
			state, floor: 1, wild, cooperative: {
				name: '支援训练家', avatar: 'support',
				ally: Teams.pack([set('Dragonair', 'Shed Skin', 50, ['Dragon Rage'])]),
				foe: Teams.pack(foeTeam.slice(1)), foeName: '对方队伍',
			}, onCapture() {}, onResult() {}, onClose() {},
		}, { user: guest, team: guestPacked });
		rooms.push(room);
		assert.equal(room.battle.gameType, 'multi');
		assert.equal(room.battle.p1.getUser(), user);
		assert.equal(room.battle.p3.getUser(), guest);
		assert.equal(room.battle.p2.isAI, true);
		assert.equal(room.battle.p3.isAI, false);
		assert.equal(room.battle.p4.isAI, true);
		await until(() => !!room.battle.p1.request.request && !!room.battle.p3.request.request, 'both human team requests');
		assert.equal(JSON.parse(room.battle.p3.request.request).teamPreview, true);
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		room.battle.choose(guest, `team 1|${room.battle.p3.request.rqid}`);
		await until(() => !!JSON.parse(room.battle.p3.request.request).active, 'human partner move request');
		assert.equal(room.battle.p3.request.isWait, false);
		await until(() => room.battle.p2.request.isWait === true && room.battle.p4.request.isWait === true,
			'both NPC actions after complete request batch');
		assert.equal(room.battle.rogueCoop.lastDecision.joint, true);
		assert.equal(room.battle.rogueCoop.lastDecision.error, undefined);
		assert.equal(room.battle.rogueCoop.lastDecision.workerStatus, 'completed');
		assert.equal(room.battle.rogueCoop.lastDecision.nativeTurns, !wild);
	});
	it('keeps both human seats and pending requests across a co-op disconnect beyond the solo-AI timeout', async () => {
		manager.coop.command(user, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const player of [user, guest]) manager.coop.command(player, { action: 'selectstarters', starters: ['bulbasaur'] });
		for (const player of [user, guest]) manager.coop.command(player, { action: 'selectarea', value: 'grass' });
		for (const player of [user, guest]) manager.coop.command(player, { action: 'selectbattle',
			members: [manager.coop.view(player).session.adventure.team[0].id] });
		const room = Rooms.get(manager.coop.view(user).session.roomid); rooms.push(room);
		await until(() => room.battle.p1.request.request && room.battle.p3.request.request, 'two human previews');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		room.battle.choose(guest, `team 1|${room.battle.p3.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active &&
			JSON.parse(room.battle.p3.request.request).active, 'two human move requests');
		const battle = room.battle;
		battle.fantasyAI.options.disconnectMs = 20;
		const hostRqid = battle.p1.request.rqid, guestRqid = battle.p3.request.rqid;
		const originalSession = store.coopSessionForUser(user.id);
		battle.onLeave(user); battle.onLeave(guest);
		await delay(100);
		assert.equal(Rooms.get(room.roomid), room); assert.equal(battle.ended, false);
		assert.equal(battle.p1.getUser(), user); assert.equal(battle.p3.getUser(), guest);
		assert.equal(battle.p1.request.rqid, hostRqid); assert.equal(battle.p3.request.rqid, guestRqid);
		assert.equal(battle.p1.request.isWait, false); assert.equal(battle.p3.request.isWait, false);
		assert(!battle.stream.battle.inputLog.some(line => /^>p[13] move /.test(line)), 'no automatic human moves');
		assert.deepEqual(store.coopSessionForUser(user.id), originalSession, 'disconnect must not spend resources or alter progress');
		battle.onConnect(user, user.connections[0]); battle.onConnect(guest, guest.connections[0]);
		assert.equal(battle.p1.active, true); assert.equal(battle.p3.active, true);
		battle.choose(user, `move 2|${hostRqid}`); battle.choose(guest, `move 2|${guestRqid}`);
		await until(() => battle.p1.request.rqid > hostRqid && battle.p3.request.rqid > guestRqid, 'both humans resume original battle');
	});
	it('starts a shared co-op session in the native p1/p3 Rogue room from both saved selections', async () => {
		manager.coop.command(user, { action: 'invite', target: guest.name, difficulty: 0 });
		const invite = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invite.id });
		manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		manager.coop.command(guest, { action: 'selectstarters', starters: ['bulbasaur'] });
		const route = manager.engine.content.floors[1].find(node => node.kind === 'wild' && node.encounters.length);
		manager.coop.command(user, { action: 'selectarea', value: route.id });
		manager.coop.command(guest, { action: 'selectarea', value: route.id });
		const hostMon = manager.coop.view(user).session.adventure.team[0];
		const guestMon = manager.coop.view(guest).session.adventure.team[0];
		manager.coop.command(user, { action: 'selectbattle', members: [hostMon.id] });
		manager.coop.command(guest, { action: 'selectbattle', members: [guestMon.id] });
		const sessionView = manager.coop.view(user).session;
		const room = Rooms.get(sessionView.roomid); rooms.push(room);
		assert.equal(sessionView.adventure.phase, 'battle');
		assert.equal(room.battle.gameType, 'multi');
		assert.equal(room.battle.p1.getUser(), user);
		assert.equal(room.battle.p3.getUser(), guest);
		assert.equal(room.battle.p2.isAI, true);
		assert.equal(room.battle.p4.isAI, true);
		assert(room.battle.options.fantasyRogue.cooperative);
		assert.equal(room.battle.options.fantasyRogue.state.opponentCount, 2,
			'only the first encounter in this wild route is loaded into the first battle');
		await until(() => !!room.battle.p1.request.request && !!room.battle.p3.request.request, 'co-op human team requests');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		room.battle.choose(guest, `team 1|${room.battle.p3.request.rqid}`);
		await until(() => !!JSON.parse(room.battle.p1.request.request).active &&
			!!JSON.parse(room.battle.p3.request.request).active, 'co-op human move requests');
		const hostRequest = JSON.parse(room.battle.p1.request.request);
		assert.equal(hostRequest.fantasyRogue.cooperativeCapture, true);
		const captureTarget = hostRequest.fantasyRogue.captureTargets.find(target => target.key.startsWith('p4:'));
		assert(captureTarget, 'the request exposes the selected wild target');
		const hostTeamSize = manager.coop.view(user).session.adventure.team.length;
		manager.coop.command(user, { action: 'proposecapture', ball: 'pokeball', captureTarget: captureTarget.key });
		const proposal = manager.coop.view(guest).session.adventure.captureProposal;
		assert.equal(proposal.targetName, captureTarget.name);
		const captureRqid = room.battle.p1.request.rqid;
		manager.coop.command(guest, { action: 'respondcapture', id: proposal.id, value: 'accept' });
		await until(() => manager.coop.view(user).session.adventure.team.length === hostTeamSize + 1,
			'immediate co-op capture persistence');
		assert.equal(manager.coop.view(guest).session.adventure.team.length, 1, 'the catch belongs only to the player who used the ball');
		assert(store.get(user.id).caughtSpecies.includes('magikarp'));
		const captureInputLog = room.battle.stream.battle.inputLog;
		assert(captureInputLog.includes('>p1 rogueball pokeball'));
		assert(captureInputLog.includes('>p3 pass'), 'the partner passes instead of acting during the capture turn');
		await until(() => room.battle.p1.request.rqid > captureRqid || room.battle.ended,
			'co-op capture turn resolution');
		assert(!room.battle.ended, 'the uncaught wild opponent remains in the battle');
		manager.coop.command(user, { action: 'delegate', value: 'partner' });
		await until(() => !!JSON.parse(room.battle.p1.request.request).active && !!JSON.parse(room.battle.p3.request.request).active,
			'delegated co-op move requests');
		const delegatedHostRqid = room.battle.p1.request.rqid, delegatedGuestRqid = room.battle.p3.request.rqid;
		const humanInputsBefore = room.battle.stream.battle.inputLog.filter(line => /^>p[13] /.test(line));
		room.battle.choose(user, `move 2|${delegatedHostRqid}`);
		assert.equal(room.battle.p1.request.isWait, false, 'the delegator cannot choose their battle action after transfer');
		assert.deepEqual(room.battle.stream.battle.inputLog.filter(line => /^>p[13] /.test(line)), humanInputsBefore,
			'the rejected delegator command does not reach the simulator');
		room.battle.choose(guest, `move 2|${delegatedGuestRqid}`);
		assert.equal(room.battle.p3.request.isWait, false, 'the first delegated action remains staged until both sides are chosen');
		assert.deepEqual(room.battle.stream.battle.inputLog.filter(line => /^>p[13] /.test(line)), humanInputsBefore,
			'one staged action does not prematurely advance a side');
		manager.coop.command(user, { action: 'delegate', value: 'revoke' });
		assert.deepEqual(room.battle.stream.battle.inputLog.filter(line => /^>p[13] /.test(line)), humanInputsBefore,
			'revoking a staged choice returns the uncommitted requests without submitting it');
		room.battle.choose(user, `move 2|${delegatedHostRqid}`);
		room.battle.choose(guest, `move 2|${delegatedGuestRqid}`);
		await until(() => room.battle.ended || room.battle.p1.request.rqid > delegatedHostRqid &&
		room.battle.p3.request.rqid > delegatedGuestRqid, 'independent co-op turn after revocation');
		const delegatedInputLog = room.battle.stream.battle.inputLog;
		assert(delegatedInputLog.includes('>p1 move growl'), 'the host can act after revocation');
		assert(delegatedInputLog.includes('>p3 move growl'), 'the guest can act after revocation');
		manager.coop.command(user, { action: 'delegate', value: 'partner' });
		await until(() => !room.battle.ended && !!JSON.parse(room.battle.p1.request.request).active &&
			!!JSON.parse(room.battle.p3.request.request).active, 'delegated requests after a new turn');
		const secondHostRqid = room.battle.p1.request.rqid, secondGuestRqid = room.battle.p3.request.rqid;
		room.battle.choose(guest, `move 2|${secondGuestRqid}`);
		room.battle.choose(guest, `move 2|${secondHostRqid}`);
		await until(() => room.battle.ended || room.battle.p1.request.rqid > secondHostRqid &&
		room.battle.p3.request.rqid > secondGuestRqid, 'delegated co-op turn');
		const allHumanInputs = room.battle.stream.battle.inputLog;
		assert(allHumanInputs.filter(line => line === '>p1 move growl').length >= 2,
			'the delegated controller submits the host seat action');
		assert(allHumanInputs.filter(line => line === '>p3 move growl').length >= 2,
			'the delegated controller submits the guest seat action');
		manager.coop.command(user, { action: 'delegate', value: 'revoke' });
		for (let turn = 0; turn < 10 && !room.battle.ended; turn++) {
			const hostRqid = room.battle.p1.request.rqid, guestRqid = room.battle.p3.request.rqid;
			room.battle.choose(user, `default|${hostRqid}`);
			room.battle.choose(guest, `default|${guestRqid}`);
			await until(() => room.battle.ended || room.battle.p1.request.rqid > hostRqid &&
			room.battle.p3.request.rqid > guestRqid, 'co-op battle turn');
		}
		assert(room.battle.ended, 'the deliberately weak Magikarp encounter should finish promptly');
		const settled = manager.coop.view(user).session.adventure;
		assert.equal(settled.phase, 'settlement');
		assert.equal(settled.battleResult.won, true);
		assert(settled.team[0].hp > 0 && settled.partnerTeam[0].hp > 0);
	});
	it('restores and snapshots p3 from the second member private party', () => {
		const hostMon = createRoguePokemon(set('Bulbasaur', 'Overgrow', 50, ['Tackle']), stats(0));
		const partnerMon = createRoguePokemon(set('Pikachu', 'Static', 50, ['Thunderbolt', 'Protect']), stats(0));
		partnerMon.hp = Math.max(1, partnerMon.hp - 13);
		partnerMon.pp[0].pp--;
		const state = {
			encounterId: 'coop-partner-snapshot', team: [hostMon], partner: { team: [partnerMon], boosts: stats(0) },
			boosts: stats(0), bag: {}, balls: [], catchable: false, cooperative: { opponentOffset: 1 },
			systems: { player: { mega: false, z: false }, partner: { mega: false, z: false } },
			tera: { player: false, partner: false, opponent: false },
		};
		const battle = new Battle({
			formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: { name: 'Host', team: [hostMon.set] },
			p2: { name: 'Opponent A', team: [set('Magikarp', 'Swift Swim', 3, ['Splash'])] },
			p3: { name: 'Guest', team: [partnerMon.set] },
			p4: { name: 'Opponent B', team: [set('Caterpie', 'Shield Dust', 3, ['Tackle'])] },
		});
		try {
			for (const slot of ['p1', 'p2', 'p3', 'p4']) battle.choose(slot, 'team 1');
			const p3Mon = battle.p3.pokemon[0];
			assert.equal(p3Mon.set.fantasyRogueId, partnerMon.id);
			assert.equal(p3Mon.hp, partnerMon.hp);
			p3Mon.hp--;
			const result = rogueBattleResult(battle);
			assert.equal(result.partnerTeam[0].id, partnerMon.id);
			assert.equal(result.partnerTeam[0].hp, p3Mon.hp);
			assert.equal(result.partnerTeam[0].pp[0].pp, p3Mon.baseMoveSlots[0].pp);
		} finally {
			battle.destroy();
		}
	});
	it('packs only the selected Kubfu through the production manager and retains the unplayed reserve after the scroll trial', async () => {
		command('start', {starters: ['bulbasaur']}); command('select', {value: 'grass'});
		const kubfu = createRoguePokemon(set('Kubfu', 'Inner Focus', 100, ['Drain Punch']), stats(0));
		const reserve = createRoguePokemon(set('Pikachu', 'Static', 50, ['Thunderbolt']), stats(0)); reserve.hp--; reserve.pp[0].pp--;
		const {makeEncounterSet} = require('../../dist/server/fantasy-rogue/encounter-sets');
		store.change(user.id, a => {
			const r = a.run; r.team = [reserve, kubfu]; r.phase = 'ready'; r.encounter = 0;
			r.node = {id: 'trial', kind: 'event', name: '卷轴前的独自修行', noHealing: true, reward: {money: 0, items: {}},
				event: {id: 'kubfuscroll', stage: 'battle', key: 'trial', activity: {solo: kubfu.id, member: kubfu.id, target: 'Urshifu', choice: 'dark'}},
				encounters: [{name: '守护者', style: 'balanced', catchable: false, fixedLevels: true,
					trainer: {id: 'scrollguardian', name: '卷轴守护者', avatar: 'blackbelt', role: 'traveller'},
					team: ['Poochyena', 'Houndour', 'Murkrow'].map(n => makeEncounterSet(n, 35))}]};
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2?.request.isWait === true, 'trial AI preview');
		const preview = JSON.parse(room.battle.p1.request.request);
		assert.equal(preview.side.pokemon.length, 1); assert(preview.side.pokemon[0].details.startsWith('Kubfu'));
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'trial first move');
		for (let i = 0; i < 12 && !room.battle.ended; i++) {
			const rqid = room.battle.p1.request.rqid; room.battle.choose(user, `default|${rqid}`);
			await until(() => room.battle.ended || room.battle.p1.request.rqid > rqid, 'trial turn');
		}
		await until(() => room.battle.ended && !account().run.battle, 'trial settlement');
		assert.equal(account().run.team.length, 2);
		assert.equal(account().run.team.find(p => p.id === kubfu.id).set.species, 'Urshifu');
		const retained = account().run.team.find(p => p.id === reserve.id);
		assert.equal(retained.hp, reserve.hp); assert.equal(retained.pp[0].pp, reserve.pp[0].pp);
	});
	it('delivers king succession through real room requests and resumes the native replacement choice', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			const { normalizeBlessings, syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
			const { blessing } = require('../../dist/sim/rogue-blessing-data');
			const run = saved.run;
			run.team = [set('Dragonite', 'Inner Focus', 50, ['Splash']), set('Dratini', 'Shed Skin', 50, ['Splash'])]
				.map(s => createRoguePokemon(s, stats(0)));
			normalizeBlessings(run).owned.push({ ...blessing('dragonking'), floor: 50 }); syncBlessingParty(run);
			run.blessings.dragonKing.ability = 'drizzle'; run.team[0].hp = 1;
			run.node.encounters[0].team = [set('Charmander', 'Blaze', 50, ['Dragon Rage'])];
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'AI preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'first turn');
		room.battle.choose(user, `move 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).fantasyRogue?.dragonKing?.pending, 'succession prompt');
		const request = JSON.parse(room.battle.p1.request.request), turn = room.battle.turn;
		assert(request.forceSwitch[0]); assert.equal(room.battle.p1.request.isWait, false);
		assert.equal(request.fantasyRogue.dragonKing.member, account().run.team[1].id);
		room.battle.choose(user, `rogueking longzhihuxi ${request.fantasyRogue.dragonKing.token}|${request.rqid}`);
		await until(() => room.battle.p1.request.rqid > request.rqid, 'ability accepted without taking a turn');
		assert.equal(room.battle.turn, turn);
		assert.equal(JSON.parse(room.battle.p1.request.request).fantasyRogue.dragonKing.pending, false);
		room.battle.choose(user, `switch 2|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'replacement enters battle');
		assert.equal(account().run.blessings.dragonKing.member, account().run.team[0].id);
	});
	for (const avatar of ['unknown', 'unknownf', 'brock', 'acerola', 'steven']) {
		it(`sends the ${avatar} portrait through a real AI room player message`, async () => {
			command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
			store.change(user.id, saved => {
				const encounter = saved.run.node.encounters[0];
				encounter.team[0].gender = avatar === 'unknownf' ? 'F' : 'M';
				if (!avatar.startsWith('unknown')) encounter.trainer = {
					id: avatar, avatar, name: avatar, role: 'gym', tera: true,
				};
			});
			const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
			await until(() => room.log.log.some(line => line.startsWith('|player|p2|')), 'opponent player message');
			assert(room.log.log.some(line => line.startsWith('|player|p2|') && line.split('|')[4] === avatar));
			assert.equal(room.battle.fantasyAI.options.trainer.avatar, avatar);
			assert.equal(room.battle.fantasyAI.options.rogue.wild, avatar.startsWith('unknown'));
			room.destroy();
		});
	}
	it('escapes an authored event through its real room and preserves the unfinished branch', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, a => { a.run.node.event = { id: 'room', key: 'locked-event', stage: 'battle' }; });
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'event preview');
		assert.equal(manager.state(user).run.canRetreat, true);
		assert.equal(room.battle.options.fantasyRogue.canRetreat, true);
		const before = account().run;
		manager.retreat(user.connections[0], room.roomid);
		await until(() => room.battle.ended && account().run.phase === 'ready', 'event escape');
		assert.equal(account().run.node.event.stage, 'battle'); assert.equal(account().run.recovery, 'retreat');
		assert.equal(account().run.money, before.money); assert.deepEqual(account().run.node.encounters, before.node.encounters);
	});
	it('commits wild moves before human input without submitting a worker search', async () => {
		ai.scheduler.submit = () => { throw new Error('Wild opponents must not enter the search queue'); };
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'instant wild preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.p2.request.choice.startsWith('move '), 'wild already chose a move');
		assert.equal(room.battle.p1.request.isWait, false);
		assert.equal(room.battle.fantasyAI.metrics.workerErrors, 0);
		assert.equal(room.battle.fantasyAI.metrics.rollouts, 0);
		const turn = room.battle.turn;
		room.battle.choose(user, `move 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.turn > turn || room.battle.ended, 'turn proceeds without thinking');
	});
	it('commits non-boss trainer moves immediately without hidden opponent configurations or choices', async () => {
		await ai.dispose();
		ai = new AIChallengeManager([], {enabled: true, decisionMs: 3000, maxBattles: 1}, 6);
		const observations = [];
		ai.scheduler.submit = () => { throw new Error('Non-boss trainers must not queue a search'); };
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			const encounter = saved.run.node.encounters[0];
			encounter.catchable = false;
			encounter.team = [set('Bulbasaur', 'Overgrow', 5, ['Tackle', 'Growl'])];
			saved.run.node.kind = 'trainer';
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		const info = room.battle.fantasyAI.view;
		const observe = info.observe.bind(info);
		info.observe = request => {
			const observation = observe(request);
			observations.push(structuredClone(observation)); return observation;
		};
		await until(() => room.battle.p2.request.isWait === true, 'NPC preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.p2.request.choice.startsWith('move '), 'NPC already chose');
		assert.equal(room.battle.p1.request.isWait, false);
		assert.equal(room.battle.fantasyAI.options.rogue.wild, false);
		assert.equal(room.battle.fantasyAI.metrics.workerErrors, 0);
		assert(observations.length >= 1, 'observe only the public state');
		assert.equal(room.battle.fantasyAI.metrics.rollouts, 0);
		assert(!room.battle.p2.name.startsWith('AI ·'));
		for (const observation of observations) {
			assert.equal(observation.difficulty, 'normal');
			assert(!observation.fullState && !observation.opponentChoice && !observation.initialOpponent);
			assert(!observation.rogueBoosts && !observation.rogueBlessings && !observation.rogueSpirit);
			assert(!observation.opponentMoves?.length, 'unrevealed initial moves must not be supplied');
		}
	});
	it('opens a one-versus-one real AI room, captures, saves, and continues with two party members', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		for (let encounter = 0; encounter < 2; encounter++) {
			const response = command('battle');
			const room = Rooms.get(response.run.roomid); rooms.push(room);
			assert.equal(ai.getStatus().active, 1);
			await until(() => room.battle.p2.request.isWait === true, 'AI team preview').catch(error => {
				throw new Error(`${error.message}: ${JSON.stringify({ request: room.battle.p2.request, metrics: room.battle.fantasyAI.metrics,
					pending: room.battle.fantasyAI.pending, submitted: room.battle.fantasyAI.submitted,
					isAI: room.battle.p2.isAI, scheduler: ai.scheduler.metrics, log: room.log.log.slice(-4) })}`);
			});
			assert.equal(room.battle.options.fantasyRogue.state.team.length, encounter + 1);
			room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
			await until(() => JSON.parse(room.battle.p1.request.request).active, 'human move request');
			const request = JSON.parse(room.battle.p1.request.request);
			assert.equal(request.fantasyRogue.balls[0].count, 10 - encounter);
			room.battle.choose(user, `rogueball pokeball|${request.rqid}`);
			await until(() => room.battle.ended, 'capture win');
			assert.equal(account().run.encounter, encounter + 1);
			assert.equal(account().run.team.length, encounter + 2);
			assert.equal(account().captures.magikarp, encounter + 1);
			assert.equal(account().points, 20);
			assert.equal(ai.getStatus().active, 0);
			assert.equal(room.battle.fantasyAI.metrics.workerErrors, 0);
		}
	});
	it('keeps a captured shiny Slugma at its saved level in the next real AI room', async () => {
		const config = manager.engine.content;
		config.starters.push({id: 'slugma', set: set('Slugma', 'Magma Armor', 5, ['Ember']), availableInitially: false});
		config.unlocks.slugma = {starter: 'slugma', captures: 1};
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			saved.run.node.encounters = [{...saved.run.node.encounters[0], team: [
				{...set('Slugma', 'Magma Armor', 8, ['Ember']), shiny: true},
			]}];
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'capture preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'capture request');
		room.battle.choose(user, `rogueball pokeball|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.ended && account().run.floor === 2, 'capture and next floor');
		assert.equal(account().run.team[1].set.shiny, true);
		assert.equal(account().starterTraits.slugma.shiny, true);
		command('select', {value: 'grass'});
		const next = Rooms.get(command('battle').run.roomid); rooms.push(next);
		await until(() => next.battle.p2.request.isWait === true, 'next room preview');
		next.battle.choose(user, `team 21|${next.battle.p1.request.rqid}`);
		await until(() => JSON.parse(next.battle.p1.request.request).active, 'shiny enters next room');
		assert(next.log.log.some(line => line.startsWith('|switch|p1a:') && line.includes('Slugma, L8, M, shiny')));
		manager.retreat(user.connections[0], next.roomid);
		await until(() => next.battle.ended && account().run.phase === 'ready', 'shiny retreat settlement');
		assert.equal(account().run.team.find(mon => mon.set.species === 'Slugma').set.shiny, true);
	});
	it('shares the existing AI quota, prevents duplicate battle creation, and recovers a destroyed room', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		const request = { id: randomUUID(), revision: account().revision, action: 'battle' };
		const first = manager.command(user.connections[0], request);
		const again = manager.command(user.connections[0], request);
		assert.equal(first.run.roomid, again.run.roomid);
		assert.equal(ai.getStatus().active, 1);
		const room = Rooms.get(first.run.roomid); rooms.push(room);
		assert.throws(() => ai.createRogueBattle(user, room.battle.fantasyAI.options.trainer,
			room.battle.fantasyAI.options.trainer.packedTeam, room.battle.options.fantasyRogue), /已有/);
		const hp = account().run.team[0].hp;
		room.destroy();
		assert.equal(account().run.phase, 'ready');
		assert.equal(account().run.team[0].hp, hp);
		assert.equal(account().points, 20);
	});
	it('retreats through the real room, saves turn damage and PP, returns the owner and resets only the foe', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			saved.run.encounter = 2;
			saved.run.node.encounters[2].team = [set('Magikarp', 'Swift Swim', 5, ['Tackle'])];
		});
		const returned = [];
		const testedUser = user;
		const sendTo = testedUser.sendTo;
		testedUser.sendTo = function (roomid, data) { returned.push([roomid, data]); return sendTo.call(this, roomid, data); };
		try {
			const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
			await until(() => room.battle.p2.request.isWait === true, 'AI preview');
			room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
			await until(() => JSON.parse(room.battle.p1.request.request).active, 'first move');
			const first = room.battle.p1.request.rqid;
			room.battle.choose(user, `move 2|${first}`);
			await until(() => room.battle.p1.request.rqid > first, 'completed turn');
			const current = JSON.parse(room.battle.p1.request.request);
			assert.equal(current.active[0].moves[1].pp, 39);
			const hp = Number(current.side.pokemon[0].condition.split('/')[0]);
			assert(hp < account().run.team[0].hp);
			assert.throws(() => manager.retreat(user.connections[0], 'battle-wrong-room'), /自己当前/);
			manager.retreat(user.connections[0], room.roomid); manager.retreat(user.connections[0], room.roomid);
			await until(() => room.battle.ended && account().run.phase === 'ready', 'retreat settlement');
			assert.equal(account().run.encounter, 2); assert.equal(account().run.recovery, 'retreat');
			assert.equal(account().run.team[0].hp, hp); assert.equal(account().run.team[0].pp[1].pp, 39);
			assert(returned.some(([id, data]) => id === room.roomid && data === '|fantasyrogueend|'));
			assert.equal(ai.getStatus().active, 0);
			const next = Rooms.get(command('battle').run.roomid); rooms.push(next);
			await until(() => next.battle.p2.request.isWait === true, 'replay preview');
			next.battle.choose(user, `team 1|${next.battle.p1.request.rqid}`);
			await until(() => JSON.parse(next.battle.p1.request.request).active, 'replay moves');
			const resumed = JSON.parse(next.battle.p1.request.request);
			assert.equal(Number(resumed.side.pokemon[0].condition.split('/')[0]), hp);
			assert.equal(resumed.active[0].moves[1].pp, 39);
			assert.equal(next.battle.options.fantasyRogue.state.encounterId, room.battle.options.fantasyRogue.state.encounterId);
			const foe = JSON.parse(next.battle.p2.request.request).side.pokemon[0].condition.split('/');
			assert.equal(foe[0], foe[1]);
		} finally { testedUser.sendTo = sendTo; }
	});
	it('automatically rescues a real wipe once and restores its notice without closing battle playback', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			saved.run.encounter = 2; saved.run.money = 5000;
			saved.run.team = [createRoguePokemon(set('Magikarp', 'Swift Swim', 1, ['Splash']), stats(0))];
			saved.run.node.encounters[2].team = [set('Bulbasaur', 'Overgrow', 30, ['Tackle'])];
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		const notifications = [];
		const originalSendTo = user.sendTo;
		user.sendTo = function (roomid, data) { notifications.push([roomid, data]); return originalSendTo.call(this, roomid, data); };
		await until(() => room.battle.p2.request.isWait === true, 'wipe preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'wipe move');
		room.battle.choose(user, `move 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.ended && account().run.phase === 'ready', 'wipe settlement');
		assert.equal(account().run.team[0].hp, account().run.team[0].maxhp); assert.equal(account().run.encounter, 2);
		assert(!notifications.some(([, data]) => data === '|fantasyrogueend|'));
		const notice = notifications.find(([id, data]) => id === room.roomid && data.startsWith('|fantasyroguedefeat|'));
		assert(notice);
		assert.deepEqual(JSON.parse(notice[1].slice(20)), { floor: 1, encounter: 3, encounters: 3,
			retryFloor: false, noHealing: false, emergencyCost: 1900, emergencyRecovery: {cost: 1900, paid: true} });
		assert(room.log.log.some(line => line.startsWith('|faint|')));
		assert(room.log.log.some(line => line.startsWith('|win|')));
		const restored = [];
		const connection = user.connections[0], originalConnectionSendTo = connection.sendTo;
		try {
			connection.sendTo = (id, data) => { restored.push([id, data]); };
			room.battle.onConnect(user, connection);
		} finally { connection.sendTo = originalConnectionSendTo; user.sendTo = originalSendTo; }
		assert(restored.some(([id, data]) => id === room.roomid && data === notice[1]));
		assert.equal(manager.state(user).run.canEmergency, false);
		assert.throws(() => command('emergency'), /全队濒死/);
		assert.equal(account().run.team[0].hp, account().run.team[0].maxhp);
		assert.equal(account().run.money, 3100); assert.equal(account().run.encounter, 2);
	});
	it('sends the rescue receipt after a lost shop challenge advances the campaign', async () => {
		command('start', { starters: ['bulbasaur'] }); command('select', { value: 'grass' });
		store.change(user.id, saved => {
			saved.run.money = 5000;
			saved.run.team = [createRoguePokemon(set('Magikarp', 'Swift Swim', 1, ['Splash']), stats(0))];
			saved.run.node.shopChallenge = {rewards: {revive: 5}, closed: false};
			saved.run.node.encounters[0].team = [set('Bulbasaur', 'Overgrow', 30, ['Tackle'])];
		});
		const room = Rooms.get(command('battle').run.roomid); rooms.push(room);
		await until(() => room.battle.p2.request.isWait === true, 'shop defeat preview');
		room.battle.choose(user, `team 1|${room.battle.p1.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active, 'shop defeat move');
		room.battle.choose(user, `move 1|${room.battle.p1.request.rqid}`);
		await until(() => room.battle.ended && account().run.floor === 2, 'shop defeat settlement');
		const receipt = room.battle.options.fantasyRogue.defeat;
		assert(receipt?.shopClosed); assert.equal(receipt.noHealing, false);
		assert.deepEqual(receipt.emergencyRecovery, {cost: 1900, paid: true});
		assert.equal(account().run.money, 3100); assert.equal(account().run.bag.revive || 0, 0);
	});
	it('binds production saves to authenticated accounts and excludes enemy teams from state replies', () => {
		Config.fantasyailocal = false;
		user.registered = false;
		assert.equal(manager.state(user).account, null);
		assert(manager.state(user).message.includes('当前仅使用昵称'));
		assert.throws(() => command('start', { starters: ['bulbasaur'] }), /登录注册账号/);
		user.registered = true;
		assert(manager.state(user).account);
		user.registered = false;
		Config.fantasyailocal = true;
		user.named = false;
		assert.equal(manager.state(user).account, null);
		assert(manager.state(user).message.includes('固定测试昵称'));
		user.named = true;
		command('start', { starters: ['bulbasaur'] });
		const publicState = manager.state(user);
		assert(!JSON.stringify(publicState.run.choices).includes('Magikarp'));
		assert(!('checkpoint' in publicState.run));
		assert(!('caught' in publicState.run));
	});
	it('rejects campaign, co-op and clear-card formats through normal imported-team challenges', async () => {
		for (const format of ['gen9fantasyrogue', 'gen9fantasyroguecoop', 'gen9fantasyrogueduel']) {
			let message = '';
			const ready = await Ladders(format).prepBattle(user.connections[0], 'challenge', '', false,
				text => { message = text; });
			assert.equal(ready, null);
			assert(message.includes('专用入口'), format + ': ' + message);
		}
	});
	it('announces a new adventure once and suppresses only rogue battle reports', async () => {
		const existing = Rooms.get('lobby');
		const lobby = existing || Rooms.createChatRoom('lobby', 'Lobby');
		const startIndex = lobby.log.log.length;
		Config.reportbattles = ['lobby'];
		try {
			const request = { id: randomUUID(), revision: account().revision, action: 'start', starters: ['bulbasaur'] };
			manager.command(user.connections[0], request);
			manager.command(user.connections[0], request);
			manager.state(user);
			assert.equal(lobby.log.log.slice(startIndex).filter(line => line.includes('开启了幻想杯肉鸽之旅')).length, 1);
			command('select', { value: 'grass' });
			const state = command('battle');
			const room = Rooms.get(state.run.roomid); rooms.push(room);
			await until(() => room.battle.started, 'battle start');
			assert(!lobby.log.log.slice(startIndex).some(line => line.startsWith('|b|')));
			// The ordinary battle report path is unaffected.
			Rooms.global.onCreateBattleRoom([user], { roomid: 'battle-normal-report-test', battle: { options: {} } }, {});
			assert(lobby.log.log.slice(startIndex).some(line => line.startsWith('|b|battle-normal-report-test|')));
			assert.equal(manager.state(user).run.node.reward.points, 0);
			const mon = manager.state(user).run.team[0];
			assert(mon.baseStats.hp && mon.stats.hp && mon.moveMemory.length && mon.abilityPool.length);
		} finally {
			if (!existing) lobby.destroy();
		}
	});
});
