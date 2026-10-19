'use strict';
const assert = require('assert').strict;
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');

describe('Fantasy Rogue new player allowance', () => {
	it('starts a new account at 20 points and never refills spent or saved balances', () => {
		const store = new RogueStore(':memory:');
		try {
			assert.equal(store.get('newplayer').points, 20);
			assert.equal(store.get('newplayer').points, 20);
			store.change('newplayer', account => { account.points -= 7; });
			assert.equal(store.get('newplayer').points, 13);
			store.change('newplayer', account => { account.points = 0; });
			assert.equal(store.get('newplayer').points, 0);
			store.change('newplayer', account => { delete account.run; });
			assert.equal(store.get('newplayer').points, 0);
			assert.equal(store.get('anotherplayer').points, 20);
		} finally { store.close(); }
	});
});
