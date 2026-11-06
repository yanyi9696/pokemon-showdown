'use strict';
const assert = require('assert').strict;
const { setTimeout: delay } = require('timers/promises');
const { makeUser } = require('../users-utils');
const { AIChallengeManager } = require('../../dist/server/fantasy-ai/manager');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
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
	it('opens the actual native room with six candidates and no started turn; repeated prepare cannot create another room', async () => {
		const room = await prepare(), request = JSON.parse(room.battle.p1.request.request);
		assert(request.teamPreview); assert.equal(request.maxChosenTeamSize, 3);
		assert.deepEqual(request.rogueCoopTeamPreview.members, ids());
		assert.equal(request.side.pokemon.length, 6); assert.equal(room.battle.stream.battle.turn, 0);
		assert(!saved().adventure.nativeTeamSelected); assert.equal(view().previewConfirmed, false);
		manager.coop.command(guest, { action: 'preparebattle', visit: 'old-client-key' });
		assert.equal(saved().roomid, room.roomid);
	});
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
