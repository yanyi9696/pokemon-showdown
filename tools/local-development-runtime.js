'use strict';

// Load exactly the compiled checkout in the receipt; do not rebuild at startup.
const path = require('path');
const { readJSON, writeJSON, sourceState, sameSources, outputs, validateLocalConfig } = require('./local-development');
const { watchForegroundParent } = require('./local-development-lifecycle');
const record = readJSON(process.argv[2]);
if (process.platform !== 'win32' || record.status !== 'built' || record.port !== 8000) throw new Error('Invalid local build receipt.');
// Closing a Windows console can kill PowerShell before its finally block runs.
// A manual launch must never leave a detached game/HTTP service behind.
if (process.env.PS_LOCAL_FOREGROUND === '1') watchForegroundParent(process.ppid);
const serverRoot = record.sources.server.root;
const clientRoot = record.sources.client.root;
if (!sameSources(record.sources, { server: sourceState(serverRoot), client: sourceState(clientRoot) }) ||
	outputs(serverRoot, clientRoot)?.hash !== record.outputs.hash) throw new Error('Build inputs or outputs changed before startup.');
validateLocalConfig(serverRoot, record.settings);
process.chdir(serverRoot);
// Restore the proven preview preset before Config is loaded, including socket/simulator workers.
// This entry is Windows-only, validates the loopback config and preserves the configured save database.
process.env.FANTASY_AI_LOCAL = '1';
const { Config } = require(path.join(serverRoot, 'dist/server/config-loader'));
Config.watchconfig = false;
Config.repl = false;
Config.ssl = null;
// The credential-free nickname arrives with the initial UI queries. The public chat
// queue can drop it as excess traffic; the validated loopback-only runtime needs no chat throttle.
Config.nothrottle = true;
const previousHook = Config.startuphook;
Config.startuphook = async () => {
	if (previousHook) await previousHook();
	await require(path.join(clientRoot, 'build-tools/local-development-server')).startLocalClientServer(clientRoot, record.id);
	writeJSON(path.join(record.directory, 'runtime-ready.json'), { id: record.id, pid: process.pid,
		outputHash: record.outputs.hash, localDevelopment: Config.fantasyailocal === true,
		clientPort: 8080, startedAt: new Date().toISOString() });
};
require(path.join(serverRoot, 'dist/server')).listen(8000, '127.0.0.1', 1);
