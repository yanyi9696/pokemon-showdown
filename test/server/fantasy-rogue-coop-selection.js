'use strict';
const assert = require('assert').strict;
const { makeUser } = require('../users-utils');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { content, set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue live co-op battle selection', () => {
	let store, manager, host, guest, oldConfig, starts, failStart;
	let serial = 0;
	beforeEach(() => {
		oldConfig = { local: Config.fantasyailocal, bind: Config.bindaddress, rogue: Config.fantasyrogue };
		Config.fantasyailocal = true; Config.bindaddress = '127.0.0.1'; Config.fantasyrogue = { enabled: true, publicAccess: true };
		store = new RogueStore(':memory:'); starts = 0; failStart = false;
		manager = new RogueManager(new RogueEngine(store, content()), () => ({ createRogueBattle() {
			starts++;
			if (failStart) throw new Error('test room creation failed');
			return { roomid: 'battle-coop-selection' };
		} }));
		host = makeUser('Selection Host ' + ++serial, '127.0.31.' + serial);
		guest = makeUser('Selection Guest ' + serial, '127.0.32.' + serial);
		manager.coop.command(host, { action: 'invite', target: guest.id, difficulty: 0 });
		manager.coop.command(guest, { action: 'accept', id: store.coopInvitations(guest.id)[0].id });
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectstarters', starters: ['bulbasaur'] });
		change(session => {
			for (const userid of [host.id, guest.id]) session.adventure.members[userid].team =
				['Bulbasaur', 'Charmander', 'Squirtle', 'Pikachu'].map(name => createRoguePokemon(set(name), stats(0)));
		});
		for (const user of [host, guest]) manager.coop.command(user, { action: 'selectarea', value: 'grass' });
	});
	afterEach(() => {
		host?.disconnectAll(); guest?.disconnectAll();
		host?.destroy(); guest?.destroy(); store?.close();
		Config.fantasyailocal = oldConfig.local; Config.bindaddress = oldConfig.bind; Config.fantasyrogue = oldConfig.rogue;
	});
	function view(user = host) { return manager.coop.view(user).session.adventure; }
	function ids(user = host) { return view(user).team.map(mon => mon.id); }
	function change(resolve) {
		const session = store.coopSessionForUser(host.id), revision = session.revision;
		resolve(session); session.revision++; store.updateCoopSession(session, revision);
	}
	function choose(user, members, confirm = false, extra = {}) {
		return manager.coop.command(user, { action: confirm ? 'selectbattle' : 'previewbattle', members,
			visit: view(user).battleSelectionKey, ...extra });
	}
	it('publishes each selection and cancellation to the partner without starting until both explicitly confirm', () => {
		const a = ids(), b = ids(guest);
		for (const selection of [[a[0]], a.slice(0, 2), [a[1]], []]) {
			choose(host, selection);
			assert.deepEqual(view(guest).partnerBattlePreview, selection);
			assert.deepEqual(view(guest).partnerBattleSelection, []);
			assert.equal(starts, 0);
		}
		choose(host, a.slice(0, 3)); choose(guest, b.slice(0, 2));
		assert.equal(starts, 0); assert.equal(view().phase, 'battle-selection');
		choose(host, a.slice(0, 3), true);
		assert.equal(starts, 0); assert.deepEqual(view(guest).partnerBattleSelection, a.slice(0, 3));
		choose(guest, b.slice(0, 2), true);
		assert.equal(starts, 1); assert.equal(view().phase, 'battle');
		assert.throws(() => choose(host, a.slice(0, 1)), /当前还没有/);
		assert.equal(starts, 1);
	});
	it('revokes confirmation on any preview, including cancel-ready with unchanged picks', () => {
		const a = ids().slice(0, 2), b = ids(guest).slice(0, 1);
		choose(host, a, true); choose(host, a);
		assert.deepEqual(view(guest).partnerBattlePreview, a); assert.deepEqual(view().battleSelection, []);
		choose(guest, b, true); assert.equal(starts, 0);
		choose(host, [a[1]]); assert.equal(starts, 0);
		choose(host, [a[1]], true); assert.equal(starts, 1);
	});
	it('rejects duplicates, four picks, foreign members, eggs, fainted and permanently lost members without saving', () => {
		const a = ids();
		change(session => {
			const team = session.adventure.members[host.id].team;
			team[1].egg = { found: 1, hatch: 10 }; team[2].hp = 0; team[3].nuzlockeDead = true;
		});
		const before = store.coopSessionForUser(host.id);
		for (const selection of [[a[0], a[0]], a, [ids(guest)[0]], [a[1]], [a[2]], [a[3]], [null]]) {
			assert.throws(() => choose(host, selection), /健康队伍/);
			assert.deepEqual(store.coopSessionForUser(host.id), before);
		}
		assert.throws(() => choose(host, [], true), /健康队伍/);
		assert.equal(starts, 0);
	});
	it('notifies only after preview persistence succeeds and preserves the previous preview on write failure', () => {
		const a = ids().slice(0, 1), oldSend = guest.send, update = store.updateCoopSession;
		let notices = 0;
		guest.send = message => {
			if (!String(message).includes('battleSelection')) return;
			notices++; assert.deepEqual(store.coopSessionForUser(host.id).battlePreviews[host.id], a);
		};
		try {
			const before = store.coopSessionForUser(host.id);
			store.updateCoopSession = () => { throw new Error('preview write failed'); };
			assert.throws(() => choose(host, a), /preview write failed/);
			assert.deepEqual(store.coopSessionForUser(host.id), before); assert.equal(notices, 0);
			store.updateCoopSession = update; choose(host, a); assert.equal(notices, 1);
		} finally { guest.send = oldSend; store.updateCoopSession = update; }
	});
	it('persists previews across a new manager and isolates them from personal solo saves', () => {
		const a = ids().slice(0, 2), accounts = [store.get(host.id), store.get(guest.id)];
		choose(host, a);
		const reloaded = new RogueManager(new RogueEngine(store, content()));
		assert.deepEqual(reloaded.coop.view(guest).session.adventure.partnerBattlePreview, a);
		assert.deepEqual([store.get(host.id), store.get(guest.id)], accounts);
	});
	it('retains previews but revokes readiness on pause and control transfer; rejects stale pages and unauthorized owners', () => {
		const a = ids().slice(0, 1), b = ids(guest).slice(0, 1), initialKey = view().battleSelectionKey;
		choose(host, a, true); choose(guest, b);
		const sessionId = manager.coop.view(host).session.id;
		manager.coop.command(host, { action: 'leave', id: sessionId });
		manager.coop.command(guest, { action: 'resume', id: sessionId });
		assert.deepEqual(view().battlePreview, a); assert.deepEqual(view().battleSelection, []);
		assert.throws(() => choose(host, a, false, { visit: initialKey }), /页面已更新/);
		const beforeTransfer = view().battleSelectionKey;
		manager.coop.command(host, { action: 'delegate', value: 'partner' });
		assert.throws(() => choose(host, a), /操作权已移交/);
		assert.throws(() => choose(guest, a, false, { owner: host.id, visit: beforeTransfer }), /页面已更新/);
		choose(guest, [], false, { owner: host.id });
		assert.deepEqual(view().battlePreview, []);
		manager.coop.command(host, { action: 'delegate', value: 'revoke' });
		assert.throws(() => choose(guest, a, false, { owner: host.id }), /自己的|移交/);
		assert.equal(starts, 0);
	});
	it('clears affected picks after party changes and never starts against stale health', () => {
		const a = ids().slice(0, 1), b = ids(guest).slice(0, 1), old = view().battleSelectionKey;
		choose(host, a, true);
		change(session => { session.adventure.members[host.id].team[0].hp = 0; });
		assert.throws(() => choose(guest, b, true), /双方出战队伍已变化/); assert.equal(starts, 0);
		assert.equal(view().battleSelectionKey, old);
		// A real party edit invalidates the visit, not only a manually altered health fixture.
		manager.coop.command(host, { action: 'setmove', member: ids()[1], slot: 0, value: 'tackle' });
		assert.notEqual(view().battleSelectionKey, old);
		assert.deepEqual(view().battlePreview, []); assert.deepEqual(view().battleSelection, []);
	});
	it('keeps previews but requires fresh confirmation after room creation fails', () => {
		const a = ids().slice(0, 1), b = ids(guest).slice(0, 1), old = view().battleSelectionKey;
		choose(host, a, true); failStart = true;
		assert.throws(() => choose(guest, b, true), /test room creation failed/);
		assert.equal(view().phase, 'battle-selection'); assert.notEqual(view().battleSelectionKey, old);
		assert.deepEqual(view().battlePreview, a); assert.deepEqual(view().battleSelection, []);
		assert.deepEqual(view(guest).battlePreview, b); assert.deepEqual(view(guest).battleSelection, []);
		failStart = false; choose(host, a, true); choose(guest, b, true);
		assert.equal(starts, 2);
	});
});
