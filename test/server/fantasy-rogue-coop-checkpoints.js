'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { RoomBattleStream } = require('../../dist/server/room-battle');
const { Battle } = require('../../dist/sim/battle');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

async function until(check, name) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > 8000) throw new Error(`Timed out: ${name}`);
		await delay(5);
	}
}

describe('Fantasy Rogue durable native cooperative battle checkpoints', () => {
	let ai, store, manager, host, guest, fixture, directory, filename, oldConfig;
	let serial = 0;
	const rooms = [];
	const saved = () => store.coopSessionForUser(host.id);
	const point = () => saved().adventure.battleCheckpoint;
	const makeManager = () => new RogueManager(new RogueEngine(store, fixture), () => ai);
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-checkpoint-'));
		filename = path.join(directory, 'isolated.db');
		store = new RogueStore(filename);
		fixture = content(); fixture.starters[0].set.moves = ['Sunny Day', 'Growl'];
		ai = new AIChallengeManager([], { enabled: true, decisionMs: 0, maxBattles: 1 }, 6);
		manager = makeManager();
		host = makeUser(`Snapshot Host ${++serial}`, `127.2.1.${serial}`);
		guest = makeUser(`Snapshot Guest ${serial}`, `127.2.2.${serial}`);
	});
	afterEach(async () => {
		await ai.dispose();
		for (const room of rooms.splice(0)) Rooms.get(room.roomid)?.destroy();
		host.disconnectAll(); guest.disconnectAll();
		host.destroy(); guest.destroy(); store.close();
		assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
		assert(path.basename(directory).startsWith('rogue-checkpoint-'));
		fs.rmSync(directory, { recursive: true, force: true });
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	async function checkpointReady(room) {
		await until(() => point()?.sequence === room.battle.stream.battle.fantasyRogue.checkpointSequence,
			'all simulator inputs durably saved');
	}
	async function start(configure) {
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		const session = saved(), revision = session.revision;
		const mon = session.adventure.members[host.id].team[0];
		mon.hp = mon.maxhp - 4; mon.status = 'brn';
		configure?.(session.adventure);
		session.revision++; store.updateCoopSession(session, revision);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectbattle',
			members: [manager.coop.view(user).session.adventure.team[0].id] });
		const room = Rooms.get(saved().roomid); rooms.push(room);
		await until(() => room.battle.p1.request.request && room.battle.p3.request.request, 'native previews');
		room.battle.choose(host, `team 1|${room.battle.p1.request.rqid}`);
		room.battle.choose(guest, `team 1|${room.battle.p3.request.rqid}`);
		await until(() => JSON.parse(room.battle.p1.request.request).active && JSON.parse(room.battle.p3.request.request).active,
			'first native requests');
		await checkpointReady(room);
		return room;
	}
	async function restore(room, reopen = true) {
		Rooms.get(room.roomid)?.destroy();
		await delay(0);
		assert.equal(saved().adventure.phase, 'battle');
		if (reopen) {
			store.close(); store = new RogueStore(filename); manager = makeManager();
		}
		const view = manager.coop.view(host).session;
		assert.equal(view.battleRecovery.available, true);
		assert(!JSON.stringify(view).includes('battleCheckpoint'), 'private serialized state is not a public view field');
		manager.coop.command(host, { action: 'recoverbattle' });
		assert.equal(saved().roomid, undefined, 'one vote cannot recreate the shared battle');
		manager.coop.command(guest, { action: 'recoverbattle' });
		const resumed = Rooms.get(saved().roomid); rooms.push(resumed);
		assert.notEqual(resumed.roomid, room.roomid);
		await until(() => resumed.battle.p1.request.request && resumed.battle.p3.request.request, 'resumed requests');
		await checkpointReady(resumed);
		return resumed;
	}
	it('starts the first authored pair in a real shared room and preserves its encounter IDs on recovery', async () => {
		fixture.floors[1][0].kind = 'trainer';
		fixture.floors[1][0].encounters = [fixture.floors[1][0].encounters[0]];
		fixture.floors[1][0].encounters[0].team = Array.from({ length: 6 }, (_, i) =>
			({ ...set('Magikarp', 'Swift Swim', 10, ['Splash']), name: `Authored${i}` }));
		for (const encounter of fixture.floors[1][0].encounters) encounter.catchable = false;
		manager = makeManager();
		const room = await start();
		const original = room.battle.stream.battle;
		const encounter = saved().adventure.encounterId;
		assert.equal(original.p2.active[0].set.name, 'Authored0');
		assert.equal(original.p4.active[0].set.name, 'Authored1');
		assert.deepEqual(original.fantasyRogue.opponentSlots, [0, 2, 4, 1, 3, 5]);
		assert.equal(original.p4.active[0].set.fantasyRogueId, `${encounter}:foe:1`);
		const resumed = await restore(room);
		assert.deepEqual(resumed.battle.stream.battle.p4.pokemon.map(mon => mon.set.name),
			['Authored1', 'Authored3', 'Authored5']);
		assert.equal(resumed.battle.stream.battle.p4.active[0].set.fantasyRogueId, `${encounter}:foe:1`);
	});
	it('keeps the authored rain opening and original IDs across shared-room restoration', async () => {
		fixture.floors[1][0].kind = 'trainer';
		fixture.floors[1][0].encounters = [fixture.floors[1][0].encounters[0]];
		Object.assign(fixture.floors[1][0].encounters[0], { catchable: false, team: [
			set('Pelipper', 'Drizzle', 50, ['Scald', 'Hurricane', 'Protect']),
			set('Ludicolo', 'Swift Swim', 50, ['Hydro Pump', 'Giga Drain', 'Ice Beam', 'Protect']),
			set('Magikarp', 'Swift Swim', 50, ['Splash']), set('Squirtle', 'Torrent', 50, ['Water Gun']),
		] });
		manager = makeManager();
		const room = await start(), original = room.battle.stream.battle;
		const encounter = saved().adventure.encounterId;
		assert.equal(original.p2.active[0].species.name, 'Pelipper');
		assert.equal(original.p4.active[0].species.name, 'Ludicolo');
		assert.equal(original.field.weather, 'raindance');
		assert.deepEqual(original.fantasyRogue.opponentSlots, [0, 2, 1, 3]);
		const resumed = await restore(room), restored = resumed.battle.stream.battle;
		assert.equal(restored.p2.active[0].set.fantasyRogueId, `${encounter}:foe:0`);
		assert.equal(restored.p4.active[0].set.fantasyRogueId, `${encounter}:foe:1`);
		assert.deepEqual(restored.p2.pokemon.map(mon => mon.species.name), ['Pelipper', 'Magikarp']);
		assert.deepEqual(restored.p4.pokemon.map(mon => mon.species.name), ['Ludicolo', 'Squirtle']);
	});
	it('reopens SQLite and restores HP, PP, status, weather, PRNG and a submitted human choice in the same encounter', async () => {
		const room = await start();
		assert.throws(() => manager.coop.command(host, { action: 'recoverbattle' }), /原战斗仍在进行/);
		const rqid = room.battle.p1.request.rqid;
		room.battle.choose(host, `move 1|${rqid}`);
		room.battle.choose(guest, `move 2|${room.battle.p3.request.rqid}`);
		await until(() => room.battle.p1.request.rqid > rqid, 'sunny day turn');
		room.battle.choose(host, `move 2|${room.battle.p1.request.rqid}`);
		await checkpointReady(room);
		const checkpoint = structuredClone(point()), token = saved().adventure.battleToken;
		const original = room.battle.stream.battle;
		const hp = original.p1.pokemon[0].hp, pp = original.p1.pokemon[0].moveSlots.map(move => move.pp);
		const weather = structuredClone(checkpoint.state.field.weatherState), seed = original.prng.getSeed();
		const resumed = await restore(room);
		const battle = resumed.battle.stream.battle;
		assert.equal(saved().adventure.battleToken, token, 'capture and reward receipt identity stays stable');
		assert.equal(battle.p1.pokemon[0].hp, hp); assert.equal(battle.p1.pokemon[0].status, 'brn');
		assert.deepEqual(battle.p1.pokemon[0].moveSlots.map(move => move.pp), pp);
		assert.equal(battle.field.weather, 'sunnyday'); assert.deepEqual(battle.toJSON().field.weatherState, weather);
		assert.deepEqual(battle.prng.getSeed(), seed);
		assert.equal(resumed.battle.p1.request.isWait, true); assert.match(resumed.battle.p1.request.choice, /growl/);
		const before = saved();
		// A second manager simulates a delayed callback carrying the old room's lease.
		const staleStore = new RogueStore(filename);
		const staleManager = new RogueManager(new RogueEngine(staleStore, fixture), () => ai);
		try {
			staleManager.coop.saveBattleCheckpoint(before.id, token, token, { ...checkpoint, sequence: checkpoint.sequence + 999 });
			assert.deepEqual(saved(), before, 'a replaced room cannot overwrite current progress');
		} finally { staleStore.close(); }
		const restoredRqid = resumed.battle.p1.request.rqid;
		resumed.battle.undo(host, String(restoredRqid));
		resumed.battle.choose(host, `move 1|${restoredRqid}`);
		resumed.battle.choose(guest, `move 2|${resumed.battle.p3.request.rqid}`);
		await until(() => resumed.battle.p1.request.rqid > restoredRqid, 'continue the restored native battle');
	});
	it('preserves failed balls and recovered captures through room loss and joint abandonment without refunds or duplicates', async () => {
		const room = await start();
		const onCapture = room.battle.options.fantasyRogue.onCapture;
		room.battle.options.fantasyRogue.onCapture = (captured, result) => {
			assert(point().result.captures.some(mon => mon.id === captured.id), 'checkpoint is durable before capture publication');
			onCapture(captured, result);
		};
		async function catchWith(ball) {
			const request = JSON.parse(room.battle.p1.request.request);
			const target = request.fantasyRogue.captureTargets.find(entry => entry.key.startsWith('p4:'));
			const rqid = room.battle.p1.request.rqid;
			// Model the real process boundary: the room can write commands but cannot read stream.battle.
			const stream = room.battle.stream;
			room.battle.stream = { write: input => stream.write(input) };
			try {
				manager.coop.command(host, { action: 'proposecapture', ball, captureTarget: target.key });
				manager.coop.command(guest, { action: 'respondcapture', id: saved().adventure.captureProposal.id, value: 'accept' });
			} finally { room.battle.stream = stream; }
			await until(() => room.battle.p1.request.rqid > rqid, 'capture turn');
			await checkpointReady(room);
		}
		await catchWith('failball'); await catchWith('pokeball');
		assert.equal(point().result.bag.failball, 1); assert.equal(point().result.bag.pokeball, 9);
		assert.equal(store.get(host.id).captures.magikarp, 1);
		const captures = structuredClone(saved().adventure.captureReceipts);
		// Model a crash after the account transaction but before the session's capture transaction.
		const partial = saved(), revision = partial.revision;
		partial.adventure.members[host.id].team = partial.adventure.members[host.id].team.filter(mon =>
			partial.battleSelections[host.id].includes(mon.id));
		partial.adventure.captureReceipts = [];
		partial.revision++; store.updateCoopSession(partial, revision);
		assert.equal(store.get(host.id).captures.magikarp, 1);
		assert.equal(saved().adventure.members[host.id].team.length, 1);
		const resumed = await restore(room);
		const state = resumed.battle.stream.battle;
		assert.equal(state.p4.pokemonLeft, 0, 'the caught opponent must not respawn');
		assert.equal(state.p2.pokemonLeft, 1, 'the uncaught opponent remains in the encounter');
		assert.equal(state.fantasyRogue.bag.failball, 1); assert.equal(state.fantasyRogue.bag.pokeball, 9);
		assert.equal(store.get(host.id).captures.magikarp, 1);
		assert.deepEqual(saved().adventure.captureReceipts, captures);
		assert.equal(saved().adventure.members[host.id].team.length, 2);
		assert.equal(saved().adventure.members[guest.id].team.length, 1);
		const sessionId = saved().id;
		manager.coop.command(host, { action: 'proposeexit', value: 'abandon' });
		manager.coop.command(guest, { action: 'respondexit', id: saved().exitProposal.id, value: 'accept' });
		await until(() => store.coopSession(sessionId).status === 'abandoned', 'joint abandon after recovered capture');
		assert.equal(store.get(host.id).captures.magikarp, 1);
		assert.equal(store.coopSession(sessionId).adventure.members[host.id].bag.pokeball, 9);
		assert.equal(store.history(host.id).total, 1);
	});
	it('requires shared retreat consent, keeps spent resources, and settles the current native state without victory rewards', async () => {
		const room = await start(), sessionId = saved().id;
		manager.coop.command(host, { action: 'proposeexit', value: 'retreat' });
		let proposal = saved().exitProposal;
		assert.throws(() => manager.coop.command(host, { action: 'respondexit', id: proposal.id, value: 'accept' }), /等待队友/);
		assert.equal(saved().adventure.phase, 'battle'); assert(!room.battle.ended);
		manager.coop.command(guest, { action: 'respondexit', id: proposal.id, value: 'cancel' });
		assert.equal(saved().exitProposal, undefined);
		manager.coop.command(host, { action: 'proposeexit', value: 'retreat' });
		assert.throws(() => manager.coop.command(guest, { action: 'respondexit', id: proposal.id, value: 'accept' }), /已失效/);
		proposal = saved().exitProposal;
		const rqid = room.battle.p1.request.rqid;
		room.battle.choose(host, `move 1|${rqid}`);
		room.battle.choose(guest, `move 2|${room.battle.p3.request.rqid}`);
		await until(() => room.battle.p1.request.rqid > rqid, 'turn during retreat negotiation');
		await checkpointReady(room);
		const before = point().result, money = saved().adventure.members[host.id].money;
		manager.coop.command(guest, { action: 'respondexit', id: proposal.id, value: 'accept' });
		await until(() => saved()?.adventure.phase === 'settlement', 'shared native retreat result');
		assert.equal(saved().adventure.battleResult.retreated, true);
		assert.equal(saved().adventure.battleResult.won, false); assert.equal(saved().adventure.floor, 1);
		assert.equal(saved().adventure.members[host.id].team[0].hp, before.team[0].hp);
		assert.deepEqual(saved().adventure.members[host.id].team[0].pp, before.team[0].pp);
		assert.deepEqual(saved().adventure.members[host.id].bag, before.bag);
		assert.equal(saved().adventure.members[host.id].money, money);
		assert.equal(saved().exitProposal, undefined); assert.equal(store.history(host.id).total, 0);
		const settled = saved(); room.battle.options.fantasyRogue.onResult(before);
		assert.deepEqual(store.coopSession(sessionId), settled, 'late callbacks do not replace the retreat');
	});
	it('settles a missing-room retreat from the trusted checkpoint and keeps the encounter unfinished', async () => {
		const room = await start(), before = structuredClone(point().result);
		room.destroy();
		manager.coop.command(host, { action: 'proposeexit', value: 'retreat' });
		manager.coop.command(guest, { action: 'respondexit', id: saved().exitProposal.id, value: 'accept' });
		assert.equal(saved().adventure.phase, 'settlement'); assert.equal(saved().roomid, undefined);
		assert.equal(saved().adventure.battleResult.won, false); assert.equal(saved().adventure.battleResult.retreated, true);
		assert.equal(saved().adventure.members[host.id].team[0].hp, before.team[0].hp);
		assert.deepEqual(saved().adventure.members[host.id].bag, before.bag);
		assert.equal(point(), undefined);
	});
	it('migrates a lost legacy secret battle from a trusted checkpoint without awarding the old node', async () => {
		const room = await start(), initial = structuredClone(point().result);
		const session = saved(), revision = session.revision;
		session.adventure.node.mainlineScene = 's0-1'; session.adventure.node.reward.money = 99999;
		session.revision++; store.updateCoopSession(session, revision);
		let recovery = manager.coop.view(host).session.storyRecovery;
		assert.equal(recovery.available, false, 'the live battle must be stopped before migration');
		assert.throws(() => manager.coop.command(host, { action: 'recoverroute', id: recovery.key }), /原战斗仍在进行/);
		room.destroy(); recovery = manager.coop.view(host).session.storyRecovery;
		assert(recovery.available);
		const money = saved().adventure.members[host.id].money;
		manager.coop.command(host, { action: 'recoverroute', id: recovery.key });
		manager.coop.command(guest, { action: 'recoverroute', id: recovery.key });
		assert.equal(saved().adventure.phase, 'area-selection'); assert.equal(saved().adventure.floor, 1);
		assert.equal(saved().adventure.members[host.id].team[0].hp, initial.team[0].hp);
		assert.deepEqual(saved().adventure.members[host.id].bag, initial.bag);
		assert.equal(saved().adventure.members[host.id].money, money);
		assert.equal(store.get(host.id).mainline, undefined); assert.equal(store.get(guest.id).mainline, undefined);
		assert.equal(store.history(host.id).total, 0);
	});
	it('rejects secret battle migration without a trusted checkpoint and leaves its resource state intact', async () => {
		const room = await start(); room.destroy();
		const session = saved(), revision = session.revision;
		session.adventure.node.kind = 'story'; delete session.adventure.battleCheckpoint;
		session.revision++; store.updateCoopSession(session, revision);
		const before = saved(), recovery = manager.coop.view(host).session.storyRecovery;
		assert.equal(recovery.available, false);
		assert.throws(() => manager.coop.command(host, { action: 'recoverroute', id: recovery.key }), /缺少可信检查点/);
		assert.deepEqual(saved(), before);
	});
	it('invalidates an unconfirmed exit when the battle naturally finishes so a stale consent cannot abandon settlement', async () => {
		const room = await start();
		manager.coop.command(host, { action: 'proposeexit', value: 'abandon' });
		const id = saved().exitProposal.id;
		await room.battle.stream.write('>forcewin p1');
		await until(() => saved()?.adventure.phase === 'settlement', 'natural result during proposal');
		assert.equal(saved().exitProposal, undefined); assert.equal(saved().adventure.battleResult.won, true);
		assert.throws(() => manager.coop.command(guest, { action: 'respondexit', id, value: 'accept' }), /已失效/);
		assert.equal(saved().status, 'active'); assert.equal(store.history(host.id).total, 0);
	});
	it('ends an unaffordable no-healing wipe by agreement, preserving personal accounts and recording no clear', async () => {
		const room = await start(), sessionId = saved().id;
		await room.battle.stream.write('>forcewin p2');
		await until(() => saved()?.adventure.phase === 'settlement', 'lost battle');
		const session = saved(), revision = session.revision;
		session.adventure.node.noHealing = true;
		for (const member of Object.values(session.adventure.members)) {
			member.money = 0; member.bag = {};
			for (const mon of member.team) mon.hp = 0;
		}
		session.revision++; store.updateCoopSession(session, revision);
		const accounts = [store.get(host.id), store.get(guest.id)];
		assert.throws(() => manager.coop.command(host, { action: 'retrybattle' }), /没有可出战/);
		manager.coop.command(host, { action: 'proposeexit', value: 'abandon' });
		assert.throws(() => manager.coop.command(host, { action: 'retrybattle' }), /退出请求/);
		manager.coop.command(guest, { action: 'respondexit', id: saved().exitProposal.id, value: 'accept' });
		assert.equal(saved(), undefined); assert.equal(store.coopSession(sessionId).status, 'abandoned');
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts, 'solo saves and permanent progress are untouched');
		for (const user of [host, guest]) {
			const history = store.history(user.id);
			assert.equal(history.total, 1); assert.equal(history.records[0].outcome, 'abandoned');
			assert.equal(history.records[0].floor, 1);
		}
		manager.coop.command(host, { action: 'invite', target: guest.name, difficulty: 0 });
		assert.equal(store.coopInvitations(guest.id).length, 1, 'ending releases both players for a new adventure');
	});
	it('can jointly end a paused legacy battle with no checkpoint without inventing recovered resources', async () => {
		const room = await start(), sessionId = saved().id;
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		manager.coop.command(host, { action: 'leave', id: sessionId });
		assert.equal(Rooms.get(room.roomid), undefined);
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		assert.equal(saved().delegatedTo, undefined, 'either owner can reclaim control even while paused');
		const session = saved(), revision = session.revision;
		delete session.adventure.battleCheckpoint;
		session.revision++; store.updateCoopSession(session, revision);
		const members = structuredClone(session.adventure.members);
		manager.coop.command(host, { action: 'proposeexit', value: 'abandon' });
		manager.coop.command(guest, { action: 'respondexit', id: saved().exitProposal.id, value: 'accept' });
		const ended = store.coopSession(sessionId);
		assert.equal(ended.status, 'abandoned'); assert.deepEqual(ended.adventure.members, members);
		assert.equal(store.history(host.id).records[0].outcome, 'abandoned');
	});
	it('honors delegated exit control and rejects a pending confirmation after delegation changes', async () => {
		const room = await start(), sessionId = saved().id;
		manager.coop.command(host, { action: 'proposeexit', value: 'abandon' });
		const stale = saved().exitProposal.id;
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.equal(saved().exitProposal, undefined);
		assert.throws(() => manager.coop.command(guest, { action: 'respondexit', id: stale, value: 'accept' }), /已失效/);
		assert.throws(() => manager.coop.command(host, { action: 'proposeexit', value: 'abandon' }), /操作权/);
		manager.coop.command(guest, { action: 'proposeexit', value: 'abandon' });
		await until(() => store.coopSession(sessionId).status === 'abandoned', 'delegated native abandon');
		assert.equal(saved(), undefined); assert(room.battle.ended);
		assert.equal(store.history(host.id).total, 1); assert.equal(store.history(guest.id).total, 1);
	});
	it('restores a used Mega slot, changed ability and Trick Room without triggering the transformation twice', async () => {
		const room = await start(adventure => {
			const hostMember = adventure.members[host.id], guestMember = adventure.members[guest.id];
			const mega = set('Mawile', 'Intimidate', 50, ['Protect', 'Swords Dance']);
			mega.item = 'Mawilite';
			hostMember.team = [createRoguePokemon(mega, stats(0), hostMember.team[0].id)];
			hostMember.systems.mega = true;
			guestMember.team = [createRoguePokemon(set('Slowbro', 'Own Tempo', 50, ['Trick Room', 'Growl']),
				stats(0), guestMember.team[0].id)];
		});
		const rqid = room.battle.p1.request.rqid;
		assert(JSON.parse(room.battle.p1.request.request).active[0].canMegaEvo);
		room.battle.choose(host, `move 1 mega|${rqid}`);
		room.battle.choose(guest, `move 1|${room.battle.p3.request.rqid}`);
		await until(() => room.battle.p1.request.rqid > rqid, 'Mega and Trick Room turn');
		await checkpointReady(room);
		const before = room.battle.stream.battle;
		const forme = before.p1.active[0].species.name, ability = before.p1.active[0].ability;
		const duration = before.field.pseudoWeather.trickroom.duration;
		const resumed = await restore(room);
		const after = resumed.battle.stream.battle;
		assert.equal(after.p1.active[0].species.name, forme); assert.match(forme, /Mega/);
		assert.equal(after.p1.active[0].ability, ability); assert.equal(ability, 'hugepower');
		assert.equal(after.field.pseudoWeather.trickroom.duration, duration);
		assert(!JSON.parse(resumed.battle.p1.request.request).active[0].canMegaEvo);
		assert.equal(after.log.filter(line => line.startsWith('|-mega|')).length, 1);
	});
	it('recovers a durable terminal checkpoint when the final callback was interrupted and settles once', async () => {
		const room = await start(), callback = room.battle.options.fantasyRogue.onResult;
		room.battle.options.fantasyRogue.onResult = () => {};
		await room.battle.stream.write('>forcewin p1');
		await until(() => room.battle.ended && point()?.state.ended, 'durable final state without final callback');
		assert.equal(saved().adventure.phase, 'battle');
		assert.equal(manager.coop.view(host).session.battleRecovery.final, true);
		manager.coop.command(host, { action: 'recoverbattle' });
		assert.equal(saved().adventure.phase, 'settlement'); assert.equal(saved().adventure.battleResult.won, true);
		assert.equal(point(), undefined, 'settled state replaces the bulky live checkpoint');
		const settled = saved(); callback({ encounterId: settled.adventure.encounterId, won: true });
		assert.deepEqual(saved(), settled, 'late final callback is fenced');
	});
	it('keeps both confirmed capture actions locked through a checkpoint before the opponents have acted', async () => {
		await start();
		const checkpoint = structuredClone(point()), fixtureBattle = Battle.fromJSON(checkpoint.state);
		fixtureBattle.p2.clearChoice(); fixtureBattle.p4.clearChoice();
		checkpoint.state = fixtureBattle.toJSON();
		const streams = [];
		async function load(snapshot) {
			const stream = new RoomBattleStream(); streams.push(stream);
			await stream.write(`>start ${JSON.stringify({ formatid: 'gen9fantasyroguecoop',
				fantasyRogue: snapshot.state.fantasyRogue })}\n>fantasyai normal\n>resumecoop ${JSON.stringify(snapshot)}`);
			return stream;
		}
		try {
			const stream = await load(checkpoint);
			const authorization = { ownerSide: 'p1', ball: 'pokeball', targetSide: 'p4', targetSlot: 0,
				targetId: stream.battle.p4.active[0].set.fantasyRogueId };
			await stream.write(`>roguecoopcapture ${JSON.stringify(authorization)}\n>p1 rogueball pokeball\n>p3 pass`);
			assert.equal(stream.battle.p1.choice.cantUndo, true); assert.equal(stream.battle.p3.choice.cantUndo, true);
			assert.equal(stream.battle.fantasyRogue.bag.pokeball, 10, 'the ball is consumed when the turn actually resolves');
			const pending = { version: 1, sequence: stream.battle.fantasyRogue.checkpointSequence,
				state: stream.battle.toJSON(), result: rogueBattleResult(stream.battle, false) };
			const resumed = await load(pending);
			await resumed.write('>p1 undo\n>p3 move growl');
			assert.equal(resumed.battle.p1.getChoice(), 'rogueball pokeball');
			assert.equal(resumed.battle.p3.getChoice(), 'pass');
			await resumed.write('>p2 move splash\n>p4 move splash');
			assert.equal(resumed.battle.fantasyRogue.bag.pokeball, 9);
			assert.equal(resumed.battle.fantasyRogue.captures.length, 1);
			assert.equal(resumed.battle.p4.pokemonLeft, 0);
			assert(!resumed.battle.log.some(line => line.startsWith('|move|p3') && line.includes('|Growl|')));
		} finally {
			fixtureBattle.destroy();
			for (const stream of streams) await stream.destroy();
		}
	});
	it('does not invent an empty checkpoint or silently reset an older lost battle', async () => {
		const room = await start();
		const session = saved(), revision = session.revision;
		delete session.adventure.battleCheckpoint; session.revision++; store.updateCoopSession(session, revision);
		room.destroy(); await delay(0);
		const before = saved();
		assert.equal(before.adventure.phase, 'battle');
		assert.equal(manager.coop.view(host).session.battleRecovery.available, false);
		assert.throws(() => manager.coop.command(host, { action: 'recoverbattle' }), /没有可安全恢复/);
		assert.deepEqual(saved(), before);
	});
	it('pauses by closing the owned room and resumes the same checkpoint without background battle progress', async () => {
		const room = await start();
		const checkpoint = structuredClone(point()), original = saved();
		manager.coop.command(host, { action: 'leave', id: original.id });
		assert.equal(saved().status, 'paused'); assert.equal(Rooms.get(room.roomid), undefined);
		assert.deepEqual(point(), checkpoint);
		assert.deepEqual(saved().adventure.members, original.adventure.members);
		manager.coop.command(guest, { action: 'resume', id: original.id });
		assert.equal(saved().status, 'active'); assert.equal(saved().roomid, undefined);
		const resumed = await restore(room, false);
		assert.equal(resumed.battle.stream.battle.turn, checkpoint.result.turns);
		assert.deepEqual(saved().adventure.members, original.adventure.members);
	});
});
