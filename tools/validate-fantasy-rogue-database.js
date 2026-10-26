'use strict';

// Reads the source as bytes only. All SQLite connections and writes target a new private copy.
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const assert = require('assert').strict;
const { isDeepStrictEqual } = require('util');
const Database = require('better-sqlite3');
const { RogueStore } = require('../dist/server/fantasy-rogue/store');
const { initializeRogueSchema } = require('../dist/server/fantasy-rogue/store-schema');

const digest = value => createHash('sha256').update(value).digest('hex');
const quote = value => '"' + value.replace(/"/g, '""') + '"';

function snapshot(db) {
	const schema = db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name').all();
	const tables = {};
	for (const entry of schema.filter(row => row.type === 'table')) {
		// raw() preserves column positions; safeIntegers() also supports non-Rogue integer columns.
		const rows = db.prepare(`SELECT * FROM ${quote(entry.name)}`).raw().safeIntegers().all().map(row =>
			JSON.stringify(row, (key, value) => typeof value === 'bigint' ? { sqliteInteger: String(value) } : value)
		).sort();
		tables[entry.name] = { rows: rows.length, sha256: digest(rows.join('\n')) };
	}
	return { schema, tables, userVersion: db.pragma('user_version', { simple: true }) };
}

function checkIntegrity(db) {
	assert.deepEqual(db.pragma('integrity_check').map(row => row.integrity_check), ['ok'], 'SQLite integrity_check');
	assert.equal(db.pragma('foreign_key_check').length, 0, 'SQLite foreign_key_check');
}

function validateBackup(backup, expectedHash, output) {
	assert.match(expectedHash, /^[a-f0-9]{64}$/i, 'Pass the SHA-256 recorded for the consistent backup');
	const source = fs.realpathSync(backup);
	assert(fs.statSync(source).isFile(), 'Backup must be a regular file');
	assert(!fs.existsSync(source + '-wal'), 'Use a standalone SQLite backup API snapshot, not a live database/WAL pair');
	const bytes = fs.readFileSync(source);
	assert.equal(digest(bytes), expectedHash.toLowerCase(), 'Backup checksum differs from the verified backup manifest');
	// Refuse an existing directory. Neither a previous audit nor an original backup is overwritten.
	fs.mkdirSync(output, { mode: 0o700 });
	const copy = path.join(output, 'validation-copy.db');
	fs.writeFileSync(copy, bytes, { flag: 'wx', mode: 0o600 });
	let db, store;
	try {
		db = new Database(copy, { fileMustExist: true });
		checkIntegrity(db);
		const before = snapshot(db);
		const accounts = db.prepare('SELECT userid, data FROM rogue_accounts').all();
		const started = Date.now();
		initializeRogueSchema(db);
		const milliseconds = Date.now() - started;
		const after = snapshot(db);
		for (const entry of before.schema) {
			assert.deepEqual(after.schema.find(row => row.name === entry.name && row.type === entry.type), entry,
				`Existing schema changed: ${entry.name}`);
		}
		for (const [table, fingerprint] of Object.entries(before.tables)) {
			assert.deepEqual(after.tables[table], fingerprint, `Existing rows changed: ${table}`);
		}
		assert.equal(after.userVersion, before.userVersion, 'user_version changed');
		const added = after.schema.filter(entry => !before.schema.some(row => row.name === entry.name && row.type === entry.type));
		assert(added.every(entry => ['rogue_history', 'rogue_history_owner', 'sqlite_autoindex_rogue_history_1'].includes(entry.name)),
			'Unexpected added schema object');
		if (!before.tables.rogue_history) assert.equal(after.tables.rogue_history.rows, 0, 'History should start empty');
		initializeRogueSchema(db);
		assert.deepEqual(snapshot(db), after, 'Repeated initialization changed the database');
		checkIntegrity(db);
		db.close(); db = undefined;
		store = new RogueStore(copy);
		for (const row of accounts) {
			let unchanged;
			try {
				unchanged = isDeepStrictEqual(store.get(row.userid), JSON.parse(row.data));
			} catch {
				// JSON parser errors can quote player data. Do not print the parser's original message.
				throw new Error('An existing account could not be read as JSON; original backup was not changed.');
			}
			if (!unchanged) throw new Error('Legacy account read changed its JSON; original backup was not changed.');
		}
		store.close(); store = undefined;
		db = new Database(copy, { readonly: true, fileMustExist: true });
		assert.deepEqual(snapshot(db), after, 'Store startup/read changed the database');
		checkIntegrity(db);
		assert.equal(digest(fs.readFileSync(source)), expectedHash.toLowerCase(), 'Source backup changed');
		const report = {
			ok: true, sourceSha256: expectedHash.toLowerCase(), sourceUnchanged: true,
			initializationMilliseconds: milliseconds, addedSchema: added, legacyTables: before.tables,
			accountsRead: accounts.length, repeatedInitializationUnchanged: true,
			integrityCheck: 'ok', foreignKeyCheck: 'ok', userVersionUnchanged: true,
			// This deliberately does not run game migrations, a player's command, or a live-server request.
			scope: 'Additive schema initialization and unchanged legacy JSON reads on a new backup copy only',
		};
		fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
		return report;
	} finally {
		store?.close();
		db?.close();
	}
}

if (require.main === module) {
	if (process.argv.length !== 5) {
		console.error('Usage: node tools/validate-fantasy-rogue-database.js <consistent-backup> <expected-sha256> <new-output-directory>');
		process.exitCode = 1;
	} else {
		try {
			const result = validateBackup(path.resolve(process.argv[2]), process.argv[3], path.resolve(process.argv[4]));
			console.log(JSON.stringify(result, null, 2));
		} catch (error) {
			console.error(`Isolated Fantasy Rogue database verification failed: ${error.message}`);
			process.exitCode = 1;
		}
	}
}
module.exports = { validateBackup, snapshot };
