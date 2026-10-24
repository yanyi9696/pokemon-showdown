'use strict';

const assert = require('assert').strict;
const { makeUser, destroyUser } = require('../users-utils');

describe('Local test nickname authentication boundary', () => {
	let user, previousGuestSecurity;
	const name = 'LocalGuestAuthTest';
	const userid = 'localguestauthtest';
	beforeEach(() => {
		previousGuestSecurity = Config.noguestsecurity;
		user = makeUser();
	});
	afterEach(() => {
		Config.noguestsecurity = previousGuestSecurity;
		Users.globalAuth.delete(userid);
		destroyUser(user);
	});
	it('uses the native token-free path as an unregistered user on the opted-in local server', async () => {
		Config.noguestsecurity = true;
		await user.rename(name, '', false, user.connections[0]);
		assert.equal(user.id, userid);
		assert.equal(user.named, true);
		assert.equal(user.registered, false);
	});
	it('still refuses a trusted name without authentication even on the local server', async () => {
		Config.noguestsecurity = true;
		Users.globalAuth.set(userid, '+');
		assert.equal(await user.validateToken('', name, userid, user.connections[0]), null);
		assert.equal(user.named, false);
	});
	it('still requires a signed token when the development option is disabled', async () => {
		Config.noguestsecurity = false;
		assert.equal(await user.validateToken('', name, userid, user.connections[0]), null);
		assert.equal(user.named, false);
	});
});
