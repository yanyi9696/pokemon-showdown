'use strict';

// Explicit maintenance command: never starts the server, loads config, or migrates account JSON.
const path = require('path');
const { openRogueDatabase } = require('../dist/server/fantasy-rogue/store-schema');

if (process.argv.length !== 3) {
	console.error('Usage: node tools/initialize-fantasy-rogue-database.js <existing-database>');
	process.exitCode = 1;
} else {
	let db;
	try {
		db = openRogueDatabase(path.resolve(process.argv[2]), { fileMustExist: true });
		console.log('Fantasy Rogue schema ready. Existing account, receipt, card and history rows were not changed.');
	} catch (error) {
		console.error(`Fantasy Rogue schema initialization failed: ${error.message}`);
		process.exitCode = 1;
	} finally {
		db?.close();
	}
}
