'use strict';

const assert = require('assert').strict;
const { rogueAccess, rogueCoopAccess } = require('../../dist/server/fantasy-rogue/access');
const { RogueManager } = require('../../dist/server/fantasy-rogue/manager');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { makeUser } = require('../users-utils');
const { content } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue cooperative release access', () => {
	let saved, store, manager, host, guest;
	beforeEach(() => {
		saved = { rogue: Config.fantasyrogue, local: Config.fantasyailocal, bind: Config.bindaddress };
		Config.fantasyrogue = { enabled: true, publicAccess: true };
		Config.fantasyailocal = false; Config.bindaddress = '0.0.0.0';
		store = new RogueStore(':memory:'); manager = new RogueManager(new RogueEngine(store, content()));
		host = makeUser('Release Gate Host', '127.5.1.1'); guest = makeUser('Release Gate Guest', '127.5.1.2');
		host.registered = true; guest.registered = true;
	});
	afterEach(() => {
		for (const user of [host, guest]) { user.disconnectAll(); user.destroy(); }
		store.close(); Config.fantasyrogue = saved.rogue;
		Config.fantasyailocal = saved.local; Config.bindaddress = saved.bind;
	});
	it('exposes co-op by default to players with ordinary Rogue access', () => {
		assert(rogueAccess(host)); assert(rogueCoopAccess(host));
		const state = manager.state(host); assert(state.enabled); assert.equal(state.coopEnabled, true);
		assert.doesNotThrow(() => manager.coop.view(host));
		manager.coop.command(host, { action: 'invite', target: guest.id, difficulty: 0 });
		const invitation = store.coopInvitations(guest.id)[0];
		manager.coop.command(guest, { action: 'accept', id: invitation.id });
		assert.equal(store.coopSessionForUser(host.id).id, store.coopSessionForUser(guest.id).id);
	});
	it('keeps login, beta, connection and global access checks with either default or explicit enablement', () => {
		for (const enabled of [undefined, true]) {
			Config.fantasyrogue = { enabled: true, publicAccess: true, coopEnabled: enabled };
			assert(rogueCoopAccess(host));
			host.registered = false; assert(!rogueCoopAccess(host)); host.registered = true;
			host.named = false; assert(!rogueCoopAccess(host)); host.named = true;
			assert(!rogueCoopAccess({ ...host, connected: false }));
			Config.fantasyrogue.publicAccess = false; assert(!rogueCoopAccess(host));
			Config.fantasyrogue.betaAccounts = [host.id]; assert(rogueCoopAccess(host));
			Config.fantasyrogue.enabled = false; assert(!rogueCoopAccess(host));
		}
	});
	it('never expands unauthenticated development access beyond server-configured loopback', () => {
		Config.fantasyailocal = true;
		host.registered = false;
		for (const bind of ['0.0.0.0', '::', '192.168.1.2', '']) {
			Config.bindaddress = bind; assert(!rogueCoopAccess(host));
		}
		for (const bind of ['127.0.0.1', '::1', 'localhost']) {
			Config.bindaddress = bind; assert(rogueCoopAccess(host));
		}
		Config.fantasyrogue.coopEnabled = false; assert(!rogueCoopAccess(host)); assert(rogueAccess(host));
	});
	it('rejects direct and forged requests before creating or modifying any state', () => {
		Config.fantasyrogue.coopEnabled = false;
		const before = store.db.prepare('SELECT count(*) AS n FROM rogue_accounts').get().n;
		for (const action of ['refresh', 'search', 'invite', 'accept', 'resume', 'selectstarters', 'preparebattle',
			'eventchoice', 'challenge', 'delegate', 'proposetrade', 'capture', 'leave']) {
			assert.throws(() => manager.coop.command(host, { action, target: guest.id,
				coopEnabled: true, localDevelopment: true, difficulty: 0 }), /暂未开放/);
		}
		assert.equal(store.db.prepare('SELECT count(*) AS n FROM rogue_accounts').get().n, before);
		assert.equal(store.db.prepare('SELECT count(*) AS n FROM rogue_coop_sessions').get().n, 0);
		assert.equal(store.db.prepare('SELECT count(*) AS n FROM rogue_coop_invites').get().n, 0);
	});
	it('preserves an existing invitation and common save while closed, and can reopen without resetting', () => {
		Config.fantasyrogue.coopEnabled = true;
		manager.coop.command(host, { action: 'invite', target: guest.id, difficulty: 0 });
		const invitation = store.coopInvitations(guest.id)[0];
		Config.fantasyrogue.coopEnabled = false;
		assert.throws(() => manager.coop.command(guest, { action: 'accept', id: invitation.id }), /暂未开放/);
		assert.deepEqual(store.coopInvitations(guest.id), [invitation]);
		Config.fantasyrogue.coopEnabled = true;
		manager.coop.command(guest, { action: 'accept', id: invitation.id });
		const before = store.coopSessionForUser(host.id);
		Config.fantasyrogue.coopEnabled = false;
		assert.throws(() => manager.coop.command(host, { action: 'selectstarters', starters: ['bulbasaur'] }), /暂未开放/);
		assert.deepEqual(store.coopSessionForUser(host.id), before);
		Config.fantasyrogue.coopEnabled = true;
		assert.equal(manager.coop.view(host).session.id, before.id);
	});
});
