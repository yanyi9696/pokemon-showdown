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
	it('keeps public single-player access and hides co-op by default', () => {
		assert(rogueAccess(host)); assert(!rogueCoopAccess(host));
		const state = manager.state(host); assert(state.enabled); assert.equal(state.coopEnabled, false);
		assert.throws(() => manager.coop.view(host), /暂未开放/);
	});
	it('requires explicit server opt-in without bypassing login, beta or global access checks', () => {
		Config.fantasyrogue.coopEnabled = true; assert(rogueCoopAccess(host));
		host.registered = false; assert(!rogueCoopAccess(host)); host.registered = true;
		Config.fantasyrogue.publicAccess = false; assert(!rogueCoopAccess(host));
		Config.fantasyrogue.betaAccounts = [host.id]; assert(rogueCoopAccess(host));
		Config.fantasyrogue.enabled = false; assert(!rogueCoopAccess(host));
	});
	it('allows an unset gate only for server-configured loopback development', () => {
		Config.fantasyailocal = true;
		for (const bind of ['0.0.0.0', '::', '192.168.1.2', '']) {
			Config.bindaddress = bind; assert(!rogueCoopAccess(host));
		}
		for (const bind of ['127.0.0.1', '::1', 'localhost']) {
			Config.bindaddress = bind; assert(rogueCoopAccess(host));
		}
		Config.fantasyrogue.coopEnabled = false; assert(!rogueCoopAccess(host)); assert(rogueAccess(host));
	});
	it('rejects direct and forged requests before creating or modifying any state', () => {
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
