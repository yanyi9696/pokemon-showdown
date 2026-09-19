'use strict';

// Dedicated local playtest. Uses a separate campaign database and loopback-only binding.
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
const port = !args.length ? 18000 : args.length === 2 && args[0] === '--port' && /^\d+$/.test(args[1]) ? Number(args[1]) : NaN;
if (!Number.isInteger(port) || port < 1 || port > 65535) {
	console.error('Usage: node tools/fantasy-rogue-preview.js [--port 8000]');
	process.exit(1);
}
process.chdir(path.resolve(__dirname, '..'));
process.env.FANTASY_AI_LOCAL = '1';
const { Config } = require('../dist/server/config-loader');
Object.assign(Config, { nofswriting: true, noguestsecurity: true, watchconfig: false, repl: false });
Config.fantasyai = { ...Config.fantasyai, enabled: true, decisionMs: 1000, criticalDecisionMs: 1500 };
fs.mkdirSync('databases', { recursive: true });
Config.fantasyrogue = { enabled: true, database: path.resolve('databases/fantasy-rogue-preview.db') };
const { Repl } = require('../dist/lib');
Repl.start = () => {};
const server = require('../dist/server');
server.listen(port, '127.0.0.1', 1);
console.log(`Fantasy Rogue preview: localhost:${port}; separate persistent preview saves. Use a test nickname.`);
