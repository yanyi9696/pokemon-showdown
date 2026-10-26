'use strict';
const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('Windows development runtime isolation', () => {
	it('restores the old preview preset before loading Config and starts HTTP with the same receipt', async () => {
		const sources = { server: { root: '/server' }, client: { root: '/client' } };
		const record = { status: 'built', port: 8000, id: 'build-id', directory: '/run', sources, outputs: { hash: 'build-hash' } };
		const calls = [], written = [];
		const processStub = { platform: 'win32', argv: ['node', 'runtime', '/receipt'], env: {}, pid: 123,
			chdir(root) { calls.push(['chdir', root]); } };
		const Config = {};
		const helper = {
			readJSON: () => record, sourceState: () => ({}), sameSources: () => true, outputs: () => record.outputs,
			validateLocalConfig() { assert.equal(processStub.env.FANTASY_AI_LOCAL, undefined); calls.push(['validate']); },
			writeJSON(file, data) { written.push(data); },
		};
		const code = fs.readFileSync(path.resolve(__dirname, '../../tools/local-development-runtime.js'), 'utf8');
		vm.runInNewContext(code, { process: processStub, require(name) {
			if (name === 'path') return path;
			if (name === './local-development') return helper;
			if (name === './local-development-lifecycle') return { watchForegroundParent() { throw new Error('Background updater must remain independent of its parent.'); } };
			if (name.endsWith('config-loader')) {
				assert.equal(processStub.env.FANTASY_AI_LOCAL, '1', 'workers and the parent must receive the preset');
				Config.fantasyailocal = true; return { Config };
			}
			if (name.endsWith('local-development-server')) return { async startLocalClientServer(root, id) { calls.push(['http', root, id]); } };
			return { listen(...args) { calls.push(['listen', ...args]); } };
		} });
		assert.deepEqual(calls, [['validate'], ['chdir', '/server'], ['listen', 8000, '127.0.0.1', 1]]);
		await Config.startuphook();
		assert.deepEqual(calls.at(-1), ['http', '/client', 'build-id']);
		assert.equal(written[0].localDevelopment, true); assert.equal(written[0].clientPort, 8080);
		assert.equal(written[0].id, record.id); assert.equal(written[0].outputHash, record.outputs.hash);
		assert.equal(Config.repl, false);
		assert.equal(Config.nothrottle, true, 'startup UI queries must not discard the local nickname');
	});
	it('stops a manual runtime if its console parent has exited, without treating other process-query failures as absence', () => {
		const { watchForegroundParent } = require('../../tools/local-development-lifecycle');
		let tick, killed, exited, unref = false;
		const runtime = { pid: 12, kill(pid, signal) { killed = [pid, signal]; }, exit(code) { exited = code; } };
		watchForegroundParent(10, runtime, (callback, interval) => {
			tick = callback; assert.equal(interval, 500); return { unref() { unref = true; } };
		});
		tick(); assert.deepEqual(killed, [10, 0]); assert.equal(exited, undefined); assert(unref);
		runtime.kill = () => { throw Object.assign(new Error('permission'), { code: 'EPERM' }); };
		assert.throws(tick, /permission/); assert.equal(exited, undefined);
		runtime.kill = () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); };
		tick(); assert.equal(exited, 0);
		assert.throws(() => watchForegroundParent(12, runtime), /Invalid foreground/);
	});
});
