'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const vm = require('vm');

describe('Declaration build failures', () => {
	it('propagates compiler failure instead of reporting a successful build', () => {
		const failure = new Error('TypeScript declaration error');
		const context = {
			exports: {}, process: { execPath: process.execPath },
			require(name) {
				if (name === 'child_process') return {
					execSync() { throw failure; },
					execFileSync() { throw failure; },
				};
				if (name === 'fs' || name === 'esbuild') return {};
				throw new Error(`Unexpected build dependency: ${name}`);
			},
		};
		const filename = require.resolve('../../../tools/build-utils');
		vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
		assert.throws(() => context.exports.buildDecls(), error => error === failure);
	});
});
