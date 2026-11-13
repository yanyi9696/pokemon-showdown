'use strict';
const assert = require('assert').strict;
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { summitEncounter, arceusEncounter } = require('../../dist/server/fantasy-rogue/final-bosses');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue native cooperative Team Preview', () => {
	let store, manager, ai, host, guest, oldConfig, rooms;
	let serial = 0;
	const saved = () => store.coopSessionForUser(host.id);
	const view = (user = host) => manager.coop.view(user).session.adventure;
	const ids = (user = host) => view(user).team.map(mon => mon.id);
	async function until(check, label) {
		for (let start = Date.now(); !check();) {
			if (Date.now() - start > 8000) throw new Error(`Timeout: ${label}`);
			await delay(5);
		}
	}
	async function checkpoint(room) {
		await until(() => saved().adventure.battleCheckpoint?.sequence ===
			room.battle.stream.battle.fantasyRogue.checkpointSequence, 'durable checkpoint');
	}
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1';
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); rooms = [];
		ai = new AIChallengeManager([], { enabled: true, decisionMs: 0, maxBattles: 1 }, 6);
		manager = new RogueManager(new RogueEngine(store, content()), () => ai);
		host = makeUser(`Native Host ${++serial}`, `127.3.1.${serial}`);
		guest = makeUser(`Native Guest ${serial}`, `127.3.2.${serial}`);
		manager.coop.command(host, { action: 'invite', target: guest.id, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		const session = saved(), revision = session.revision;
		for (const user of [host, guest]) {
			session.adventure.members[user.id].team = ['Bulbasaur', 'Charmander', 'Squirtle', 'Pikachu', 'Eevee', 'Magikarp']
				.map(name => createRoguePokemon(set(name, '', 30, ['Splash']), stats(0)));
			session.adventure.members[user.id].team[0].hp -= 2;
		}
		session.revision++; store.updateCoopSession(session, revision);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
	});
	afterEach(async () => {
		await ai.dispose();
		for (const room of rooms) Rooms.get(room.roomid)?.destroy();
		host.disconnectAll(); guest.disconnectAll();
		host.destroy(); guest.destroy(); store.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	async function prepare() {
		manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey });
		const room = Rooms.get(saved().roomid); rooms.push(room);
		await until(() => room.battle.p1.request.request && room.battle.p3.request.request, 'native team requests');
		await checkpoint(room); return room;
	}
	function draft(user, members, extra = {}) {
		return manager.coop.command(user, { action: 'previewbattle', members, visit: view(user).battleSelectionKey, ...extra });
	}
	function confirm(room, user, selection) {
		const seat = user === host ? room.battle.p1 : room.battle.p3;
		room.battle.choose(user, `team ${selection}|${seat.request.rqid}`);
	}
	for (const [kind, create] of [['summit', summitEncounter], ['arceus', arceusEncounter]]) {
		it(`transmits a genuine empty fourth seat for ${kind}, preserves boss order and restores the room`, async () => {
			// The ordinary preview fixtures intentionally use a zero-budget fallback scheduler.
			const previousAI = ai;
			ai = new AIChallengeManager([], { enabled: true, decisionMs: 5000, maxBattles: 1 }, 6);
			await previousAI.dispose();
			const session = saved(), revision = session.revision, encounter = create();
			session.adventure.floor = 200;
			session.adventure.node.kind = 'boss'; session.adventure.node.encounters = [encounter];
			session.revision++; store.updateCoopSession(session, revision);
			const room = await prepare(), native = room.battle.stream.battle;
			assert.equal(native.fantasyRogue.boss.kind, kind);
			assert.equal(native.fantasyRogue.catchable, false);
			assert(native.log.includes(`|-roguecoopboss|${kind}`));
			assert(native.log.some(line => line.includes('全员 HP ×2') && line.includes('不是极巨化')));
			assert(native.log.indexOf(`|-roguecoopboss|${kind}`) < native.log.findIndex(line => line.startsWith('|teampreview')));
			assert.equal(native.p2.pokemon.length, encounter.team.length);
			assert.equal(native.p4.pokemon.length, 0);
			assert.deepEqual(native.fantasyRogue.opponentSlots, encounter.team.map((_, index) => index));
			assert.equal(native.fantasyRogue.cooperative.opponentOffset, encounter.team.length);
			assert.equal(native.p4.activeRequest.wait, true);
			assert(native.inputLog.some(line => line.startsWith('>player p4 ') && line.includes('"team":[]')));
			confirm(room, host, '1,2,3'); confirm(room, guest, '1,2,3');
			await until(() => native.turn === 1, 'boss turn one'); await checkpoint(room);
			assert.equal(native.p2.pokemon.length, encounter.team.length);
			assert.equal(native.p2.active[0].set.species, encounter.team[0].species);
			const hp = native.p2.active[0].maxhp;
			assert.equal(hp, native.spreadModify(native.p2.active[0].species.baseStats, native.p2.active[0].set).hp * 2);
			await until(() => !!room.battle.rogueCoop.lastDecision || room.battle.p2.request.isWait === true,
				'boss tactical worker decision');
			assert(room.battle.rogueCoop.lastDecision?.candidates > 0, JSON.stringify({
				decision: room.battle.rogueCoop.lastDecision, format: room.battle.format,
				cooperative: room.battle.options.fantasyRogue.state.cooperative,
				active: native.p2.activeRequest.active?.length, choice: room.battle.p2.request.choice,
			}));
			assert.equal(room.battle.rogueCoop.lastDecision.workerStatus, 'completed');
			await checkpoint(room);
			room.destroy(); await delay(0);
			for (const user of [host, guest]) manager.coop.command(user, { action: 'recoverbattle' });
			const restored = Rooms.get(saved().roomid); rooms.push(restored);
			await until(() => restored.battle.p1.request.request, 'restored boss request'); await checkpoint(restored);
			const resumed = restored.battle.stream.battle;
			assert.equal(resumed.p2.active[0].maxhp, hp); assert.equal(resumed.p4.pokemon.length, 0);
			assert.equal(resumed.fantasyRogue.boss.kind, kind);
			for (const user of [host, guest]) {
				const side = user === host ? restored.battle.p1 : restored.battle.p3;
				restored.battle.choose(user, `move 1|${side.request.rqid}`);
			}
			await until(() => resumed.turn >= 2 || resumed.requestState === 'switch', 'boss resolves turn');
			assert(!resumed.log.some(line => /^\|(move|switch|drag)\|p4/.test(line)));
			assert(resumed.log.some(line => line.startsWith('|move|p2')));
		});
	}
	it('opens the actual native room with six candidates and no started turn; repeated prepare cannot create another room', async () => {
		const room = await prepare(), request = JSON.parse(room.battle.p1.request.request);
		assert(request.teamPreview); assert.equal(request.maxChosenTeamSize, 3);
		assert.deepEqual(request.rogueCoopTeamPreview.members, ids());
		assert.equal(request.side.pokemon.length, 6); assert.equal(room.battle.stream.battle.turn, 0);
		assert(!saved().adventure.nativeTeamSelected); assert.equal(view().previewConfirmed, false);
		manager.coop.command(guest, { action: 'preparebattle', visit: 'old-client-key' });
		assert.equal(saved().roomid, room.roomid);
	});
	for (const confirmed of [false, true]) {
		it(`keeps a preview retreat outside battle until both explicitly retry (one confirmed: ${confirmed})`, async () => {
			const room = await prepare();
			if (confirmed) { confirm(room, host, '5,2'); await checkpoint(room); }
			const before = structuredClone(saved()), adventure = before.adventure;
			manager.coop.command(host, { action: 'proposeexit', value: 'retreat' });
			manager.coop.command(guest, { action: 'respondexit', id: saved().exitProposal.id, value: 'accept' });
			assert.equal(saved().adventure.phase, 'settlement');
			assert.equal(saved().adventure.battleResult.retreated, true);
			assert.equal(saved().adventure.battleResult.won, false);
			assert.equal(saved().adventure.battleResult.turns, 0);
			assert.equal(Rooms.get(room.roomid), undefined);
			assert.equal(saved().roomid, undefined);
			assert.equal(saved().adventure.battleCheckpoint, undefined);
			assert.deepEqual(saved().adventure.members, adventure.members);
			assert.deepEqual(saved().adventure.node, adventure.node);
			assert.equal(saved().adventure.floor, adventure.floor);
			assert.equal(saved().adventure.encounter, adventure.encounter);
			const outside = structuredClone(saved());
			manager.coop.saveBattleCheckpoint(before.id, adventure.battleToken,
				adventure.battleLease || adventure.battleToken, adventure.battleCheckpoint);
			assert.deepEqual(saved(), outside, 'late preview checkpoint cannot revive the exited room');
			assert.throws(() => manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey }));
			assert.equal(saved().adventure.phase, 'settlement');
			manager.coop.command(host, { action: 'retrybattle' });
			assert.equal(saved().adventure.phase, 'settlement', 'one retry vote cannot start another room');
			manager.coop.command(guest, { action: 'retrybattle' });
			const next = await prepare();
			assert.notEqual(next.roomid, room.roomid);
			assert.equal(next.battle.stream.battle.turn, 0);
			assert.equal(view().previewConfirmed, false);
			assert.deepEqual(saved().adventure.members, adventure.members);
			assert.deepEqual(saved().adventure.node, adventure.node);
		});
	}
	it('synchronizes ordered draft and cancellation, rejects foreign, stale, duplicate and four-member drafts', async () => {
		await prepare(); const own = ids();
		for (const selection of [[own[4]], [own[4], own[1]], [own[1]], []]) {
			draft(host, selection); assert.deepEqual(view(guest).partnerBattlePreview, selection);
			assert.equal(view(guest).partnerPreviewConfirmed, false);
		}
		for (const selection of [own.slice(0, 4), [own[0], own[0]], [ids(guest)[0]]]) {
			assert.throws(() => draft(host, selection), /候选队伍/);
		}
		assert.throws(() => draft(host, own.slice(0, 1), { visit: 'stale' }), /状态已变化/);
		assert.throws(() => draft(host, ids(guest).slice(0, 1), { owner: guest.id }), /自己|移交/);
	});
	it('uses native confirmation and undo without starting early or allowing a confirmed draft to change', async () => {
		const room = await prepare(), own = ids();
		confirm(room, host, '5,2'); await checkpoint(room);
		assert.equal(view().previewConfirmed, true); assert.equal(view(guest).partnerPreviewConfirmed, true);
		assert.deepEqual(view().battlePreview, [own[4], own[1]]);
		assert.equal(room.battle.stream.battle.turn, 0);
		assert.throws(() => draft(host, [own[0]]), /已确认/);
		room.battle.undo(host, ''); await checkpoint(room);
		assert.equal(view().previewConfirmed, false); assert.deepEqual(view().battlePreview, [own[4], own[1]]);
		draft(host, [own[1]]); assert.deepEqual(view(guest).partnerBattlePreview, [own[1]]);
	});
	for (const size of [1, 2, 3]) {
		it(`starts with exactly ${size} chosen partners in selected order and preserves all reserves after retreat`, async () => {
			const room = await prepare(), before = structuredClone(saved().adventure.members), own = ids(), other = ids(guest);
			const positions = [5, 2, 4].slice(0, size), selected = positions.map(pos => own[pos - 1]);
			confirm(room, host, positions.join(',')); confirm(room, guest, '3');
			await until(() => room.battle.stream.battle.turn === 1, 'turn one'); await checkpoint(room);
			assert.deepEqual(saved().battleSelections[host.id], selected);
			assert.deepEqual(saved().battleSelections[guest.id], [other[2]]);
			assert.deepEqual(room.battle.stream.battle.p1.pokemon.map(mon => mon.set.fantasyRogueId), selected);
			assert.equal(room.battle.stream.battle.p3.pokemon.length, 1);
			assert(room.battle.stream.battle.log.includes(`|teamsize|p1|${size}`));
			assert(room.battle.stream.battle.log.includes('|teamsize|p3|1'));
			assert.deepEqual(saved().adventure.battleCheckpoint.result.team.map(mon => mon.id), selected);
			manager.coop.command(host, { action: 'proposeexit', value: 'retreat' });
			manager.coop.command(guest, { action: 'respondexit', id: saved().exitProposal.id, value: 'accept' });
			await until(() => saved().adventure.phase === 'settlement', 'retreat');
			for (const user of [host, guest]) {
				const team = saved().adventure.members[user.id].team;
				assert.equal(team.length, 6);
				for (const mon of before[user.id].team.filter(mon => !(user === host ? selected : [other[2]]).includes(mon.id))) {
					assert.deepEqual(team.find(current => current.id === mon.id), mon, 'unselected partner remains unchanged');
				}
			}
		});
	}
	it('rejects oversized, duplicate, nonexistent and malformed native selections without starting', async () => {
		const room = await prepare();
		for (const selection of ['1,2,3,4', '2,2', '7', '1oops']) {
			confirm(room, host, selection); await checkpoint(room);
			assert.equal(view().previewConfirmed, false); assert.equal(room.battle.stream.battle.turn, 0);
		}
		confirm(room, host, '6'); await checkpoint(room); assert.equal(view().previewConfirmed, true);
	});
	it('restores confirmed and unconfirmed native previews from the trusted room checkpoint', async () => {
		const room = await prepare(), own = ids(), other = ids(guest);
		draft(guest, [other[5], other[2]]); confirm(room, host, '4,2'); await checkpoint(room);
		room.destroy(); await delay(0);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'recoverbattle' });
		const restored = Rooms.get(saved().roomid); rooms.push(restored);
		await until(() => restored.battle.p3.request.request, 'restored preview'); await checkpoint(restored);
		assert.deepEqual(view().battlePreview, [own[3], own[1]]); assert.equal(view().previewConfirmed, true);
		assert.deepEqual(view(guest).battlePreview, [other[5], other[2]]); assert.equal(view(guest).previewConfirmed, false);
		confirm(restored, guest, '6,3');
		await until(() => restored.battle.stream.battle.turn === 1, 'restored turn'); await checkpoint(restored);
		assert.deepEqual(saved().battleSelections[guest.id], [other[5], other[2]]);
	});
	it('keeps only healthy candidates and excludes eggs and permanently lost partners', async () => {
		const session = saved(), revision = session.revision, team = session.adventure.members[host.id].team;
		team[0].hp = 0; team[1].nuzlockeDead = true; team[2].egg = { found: 1, hatch: 10 };
		session.revision++; store.updateCoopSession(session, revision);
		const room = await prepare();
		assert.deepEqual(JSON.parse(room.battle.p1.request.request).rogueCoopTeamPreview.members, ids().slice(3));
		assert.equal(JSON.parse(room.battle.p1.request.request).side.pokemon.length, 3);
	});
	it('refuses to enter native preview if either player has no healthy partner', () => {
		const session = saved(), revision = session.revision;
		for (const mon of session.adventure.members[guest.id].team) mon.hp = 0;
		session.revision++; store.updateCoopSession(session, revision);
		const before = saved();
		assert.throws(() => manager.coop.command(host, { action: 'preparebattle', visit: view().battleSelectionKey }), /健康伙伴/);
		assert.deepEqual(saved(), before);
	});
	it('restores a started limited team while keeping the full six-member expedition party', async () => {
		const room = await prepare(), own = ids();
		confirm(room, host, '5,2'); confirm(room, guest, '3');
		await until(() => room.battle.stream.battle.turn === 1, 'first turn'); await checkpoint(room);
		room.destroy(); await delay(0);
		for (const user of [host, guest]) manager.coop.command(user, { action: 'recoverbattle' });
		const restored = Rooms.get(saved().roomid); rooms.push(restored);
		await until(() => restored.battle.p1.request.request, 'restored move request'); await checkpoint(restored);
		assert(JSON.parse(restored.battle.p1.request.request).active);
		assert.deepEqual(restored.battle.stream.battle.p1.pokemon.map(mon => mon.set.fantasyRogueId), [own[4], own[1]]);
		assert.equal(saved().adventure.members[host.id].team.length, 6);
	});
	it('supports selecting both native seats under delegation and discards staged confirmation on revoke', async () => {
		const room = await prepare();
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		let seat = room.battle[room.battle.coopDelegatedVisibleSlot];
		assert(seat); const owner = seat.slot === 'p1' ? host : guest;
		draft(guest, [ids(owner)[4]], { owner: owner.id });
		room.battle.choose(guest, `team 5|${seat.request.rqid}`);
		assert.equal(room.battle.stream.battle.turn, 0);
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		assert.deepEqual(room.battle.coopDelegatedChoices, {});
		assert.equal(view().previewConfirmed, false); assert.equal(view(guest).previewConfirmed, false);
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		const selections = {};
		for (const choice of ['6', '2,4']) {
			seat = room.battle[room.battle.coopDelegatedVisibleSlot];
			selections[seat.slot] = choice.split(',').map(index => ids(seat.slot === 'p1' ? host : guest)[Number(index) - 1]);
			room.battle.choose(guest, `team ${choice}|${seat.request.rqid}`);
		}
		await until(() => room.battle.stream.battle.turn === 1, 'delegated turn'); await checkpoint(room);
		assert.deepEqual(saved().battleSelections[host.id], selections.p1);
		assert.deepEqual(saved().battleSelections[guest.id], selections.p3);
	});
});
