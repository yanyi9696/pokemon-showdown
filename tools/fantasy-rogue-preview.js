'use strict';

// Dedicated local playtest. Does not use the normal server port or campaign database.
const path = require('path');
const fs = require('fs');
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
server.listen(18000, '127.0.0.1', 1);
console.log('Fantasy Rogue preview: localhost:18000; separate persistent preview saves. Use a test nickname.');
