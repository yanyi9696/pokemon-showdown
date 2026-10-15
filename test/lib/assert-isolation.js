'use strict';

const nativeAssert = require('assert');
const assert = require('../assert');

describe('Simulator assertion isolation', () => {
	it('keeps native assertions usable when server and simulator suites run together', () => {
		nativeAssert.ok(true);
		nativeAssert.strict.ok(true);
		nativeAssert.strictEqual(1, 1);
		nativeAssert.strict.deepStrictEqual({ a: 1 }, { a: 1 });
		nativeAssert.match('旅行的回忆', /回忆/);
		nativeAssert.strict.match('这是武术的胜利', /胜利/);
		nativeAssert.strict.doesNotMatch('旅行的回忆', /胜利/);
		nativeAssert.throws(() => nativeAssert.strict.match('旅行', /胜利/), nativeAssert.AssertionError);
	});
	it('retains the simulator helpers and their inverse assertions', () => {
		assert.atLeast(3, 2);
		assert.false.atLeast(1, 2);
		assert.throws(() => assert.atLeast(1, 2), nativeAssert.AssertionError);
	});
});
