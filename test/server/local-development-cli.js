'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const Module = require('module');
const path = require('path');
const vm = require('vm');

describe('Windows development CLI bridge', () => {
	const root = path.resolve(__dirname, '../..');
	const filename = path.join(root, 'pokemon-showdown');
	const launcher = path.resolve(root, '../launch-local-development.cjs');
	const source = fs.readFileSync(filename, 'utf8').replace(/^#![^\n]*\n/, '');

	function launch(platform, args, installed = true, bridgeError = null) {
		const calls = { probes: [], bridges: [], builds: [], servers: [], output: [] };
		const runtime = { platform, argv: ['node', filename, ...args], env: {} };
		const context = {
			process: runtime,
			console: { log: text => calls.output.push(text) },
		};
		const localRequire = name => {
			switch (name) {
			case 'fs':
				return { existsSync(file) {
					calls.probes.push(file);
					assert.equal(file, launcher);
					return installed;
				} };
			case 'path':
				return path;
			case 'child_process':
				return { execSync(command, options) { calls.builds.push({ command, cwd: options.cwd }); } };
			case 'module':
				return { _load(file) { calls.servers.push(file); } };
			case launcher:
				calls.bridges.push([...runtime.argv]);
				if (bridgeError) throw bridgeError;
				return {};
			default:
				throw new Error(`Unexpected CLI dependency: ${name}`);
			}
		};
		vm.runInNewContext(Module.wrap(source), context, { filename })(
			{}, localRequire, { exports: {} }, filename, root
		);
		assert.deepEqual(runtime.env, {}, 'The CLI must not inject test configuration.');
		return calls;
	}

	for (const args of [[], ['8000'], ['start'], ['--skip-build'], ['start', '--skip-build', '8000']]) {
		it(`forwards Windows startup arguments intact when the launcher is installed: ${args.join(' ') || '(default)'}`, () => {
			const calls = launch('win32', args);
			assert.deepEqual(calls.bridges, [['node', filename, ...args]]);
			assert.deepEqual(calls.builds, []);
			assert.deepEqual(calls.servers, [], 'Only the launcher may start the configured worktree.');
		});
		it(`starts the normal Windows server when the launcher is absent: ${args.join(' ') || '(default)'}`, () => {
			const calls = launch('win32', args, false);
			assert.deepEqual(calls.bridges, []);
			assert.deepEqual(calls.servers, ['./dist/server/index.js']);
		});
	}
	for (const platform of ['linux', 'darwin']) {
		it(`never probes or loads machine-local files on ${platform}`, () => {
			const calls = launch(platform, []);
			assert.deepEqual(calls.probes, []);
			assert.deepEqual(calls.bridges, []);
			assert.deepEqual(calls.builds, [{ command: 'node build', cwd: root }]);
			assert.deepEqual(calls.servers, ['./dist/server/index.js']);
		});
		it(`preserves the normal start --skip-build path on ${platform}`, () => {
			const calls = launch(platform, ['start', '--skip-build', '8000']);
			assert.deepEqual(calls.probes, []);
			assert.deepEqual(calls.bridges, []);
			assert.deepEqual(calls.builds, []);
			assert.deepEqual(calls.servers, ['./dist/server/index.js']);
		});
	}
	it('preserves native build and --skip-build behavior in Windows checkouts without a launcher', () => {
		assert.deepEqual(launch('win32', [], false).builds, [{ command: 'node build', cwd: root }]);
		assert.deepEqual(launch('win32', ['start', '--skip-build'], false).builds, []);
	});
	it('does not intercept help or the replay-server subcommand', () => {
		const help = launch('win32', ['--help']);
		assert(help.output.includes('pokemon-showdown start [--skip-build] [PORT]'));
		assert.deepEqual(help.probes, []);
		assert.deepEqual(help.bridges, []);
		assert.deepEqual(help.servers, []);
		const replay = launch('win32', ['replay-server']);
		assert.deepEqual(replay.probes, []);
		assert.deepEqual(replay.bridges, []);
		assert.deepEqual(replay.servers, ['./dist/server/replay-server.js']);
	});
	it('propagates an installed launcher failure instead of starting an unverified fallback server', () => {
		const failure = new Error('Local save or port validation failed');
		assert.throws(() => launch('win32', [], true, failure), error => error === failure);
	});
});
