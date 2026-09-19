'use strict';

/** Explicit, loopback-only browser test harness. Never loaded by a production startup. */
process.env.FANTASY_AI_LOCAL = '1';
const {Config} = require('../../dist/server/config-loader');
Object.assign(Config, {nofswriting: true, noguestsecurity: true, watchconfig: false, repl: false});
Config.fantasyai = {...Config.fantasyai, decisionMs: 1000, criticalDecisionMs: 1000};
Config.fantasyrogue = {enabled: true, database: ':memory:'};
const {content} = require('./fantasy-rogue');
require('../../dist/config/fantasy-rogue');
require.cache[require.resolve('../../dist/config/fantasy-rogue')].exports = {FantasyRogueContent: content()};
const {Repl} = require('../../dist/lib');
Repl.start = () => {};
const server = require('../../dist/server');
server.listen(8000, '127.0.0.1', 1);
console.log('TEST FIXTURE ONLY: temporary memory saves, no production content or database.');
