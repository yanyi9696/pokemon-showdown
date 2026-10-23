'use strict';

// Load exactly the compiled checkout in the receipt; do not rebuild at startup.
const path = require('path');
const { readJSON, writeJSON, sourceState, sameSources, outputs, validateLocalConfig } = require('./local-development');
const record = readJSON(process.argv[2]);
if (process.platform !== 'win32' || record.status !== 'built' || record.port !== 8000) throw new Error('Invalid local build receipt.');
const serverRoot = record.sources.server.root;
const clientRoot = record.sources.client.root;
if (!sameSources(record.sources, { server: sourceState(serverRoot), client: sourceState(clientRoot) }) ||
	outputs(serverRoot, clientRoot)?.hash !== record.outputs.hash) throw new Error('Build inputs or outputs changed before startup.');
validateLocalConfig(serverRoot, record.settings);
process.chdir(serverRoot);
const { Config } = require(path.join(serverRoot, 'dist/server/config-loader'));
Config.watchconfig = false;
Config.repl = false;
Config.ssl = null;
const previousHook = Config.startuphook;
Config.startuphook = async () => {
	if (previousHook) await previousHook();
	writeJSON(path.join(record.directory, 'runtime-ready.json'), { id: record.id, pid: process.pid,
		outputHash: record.outputs.hash, startedAt: new Date().toISOString() });
};
require(path.join(serverRoot, 'dist/server')).listen(8000, '127.0.0.1', 1);
