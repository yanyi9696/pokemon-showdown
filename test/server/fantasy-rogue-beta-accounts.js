'use strict';

const assert = require('assert').strict;
const { toID } = require('../../dist/sim/dex');
const { ROGUE_BETA_ACCOUNTS } = require('../../dist/server/fantasy-rogue/beta-accounts');
const { rogueAccess, rogueCoopAccess } = require('../../dist/server/fantasy-rogue/access');

describe('Approved Rogue beta accounts', () => {
	let original;
	beforeEach(() => {
		original = { rogue: Config.fantasyrogue, local: Config.fantasyailocal, bind: Config.bindaddress };
		Config.fantasyrogue = { enabled: true, publicAccess: false, betaAccounts: ['Existing Tester'] };
		Config.fantasyailocal = false;
		Config.bindaddress = '0.0.0.0';
	});
	afterEach(() => {
		Config.fantasyrogue = original.rogue;
		Config.fantasyailocal = original.local;
		Config.bindaddress = original.bind;
	});
	const account = id => ({ id, named: true, connected: true, registered: true });
	it('admits every approved canonical ID only after authentication', () => {
		assert.equal(ROGUE_BETA_ACCOUNTS.size, 223);
		assert(ROGUE_BETA_ACCOUNTS.has('tianheil'));
		for (const id of ROGUE_BETA_ACCOUNTS) {
			assert(id && id === toID(id), id);
			assert(rogueAccess(account(id)), id);
			assert(rogueCoopAccess(account(id)), id);
			for (const flag of ['named', 'registered', 'connected']) {
				assert(!rogueAccess({ ...account(id), [flag]: false }), `${id}: ${flag}`);
			}
		}
	});
	it('keeps configured accounts and denies guessed identities or matching display names', () => {
		assert(rogueAccess(account('existingtester')));
		for (const id of ['', 'unapprovedqa', 'unapprovedmailcom']) assert(!rogueAccess(account(id)), id);
		const approved = [...ROGUE_BETA_ACCOUNTS][0];
		assert(!rogueAccess({ ...account('unapprovedqa'), name: approved, betaAccount: approved }));
	});
	it('preserves explicit game and co-op shutdown controls', () => {
		const user = account([...ROGUE_BETA_ACCOUNTS][0]);
		Config.fantasyrogue.coopEnabled = false;
		assert(rogueAccess(user));
		assert(!rogueCoopAccess(user));
		Config.fantasyrogue.enabled = false;
		assert(!rogueAccess(user));
	});
	it('requires a loopback bind for the existing local-only guest bypass', () => {
		const guest = { ...account('localguest'), registered: false };
		Config.fantasyailocal = true;
		assert(!rogueAccess(guest));
		Config.bindaddress = '127.0.0.1';
		assert(rogueAccess(guest));
		assert(!rogueAccess({ ...guest, connected: false }));
	});
});
