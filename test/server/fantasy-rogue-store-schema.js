'use strict';

const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const { initializeRogueSchema, openRogueDatabase } = require('../../dist/server/fantasy-rogue/store-schema');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { validateBackup, snapshot } = require('../../tools/validate-fantasy-rogue-database');

// Frozen DDL from production revision 9708438162d207d18134b333da616fc6672fb035.
const OLD_SCHEMA = `
	CREATE TABLE IF NOT EXISTS rogue_accounts (userid TEXT PRIMARY KEY, data TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS rogue_requests (
		userid TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL,
		PRIMARY KEY (userid, id)
	);
	CREATE TABLE IF NOT EXISTS rogue_cards (
		id TEXT PRIMARY KEY, userid TEXT NOT NULL, public INTEGER NOT NULL,
		created INTEGER NOT NULL, data TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS rogue_cards_public ON rogue_cards(public, created DESC);
`;
const account = {
	revision: 27, points: 42, slots: 2, boosts: { hp: 1, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
	captures: { pikachu: 7 }, unlocked: ['pikachu'], customLegacyField: { keep: true },
	run: { id: 'old-run', phase: 'choose', floor: 86, money: 1200, team: [], bag: { pokeball: 8 } },
};

function legacy(filename) {
	const db = new Database(filename);
	db.exec(OLD_SCHEMA);
	db.pragma('user_version = 17');
	db.prepare('INSERT INTO rogue_accounts VALUES (?, ?)').run('synthetic-player', JSON.stringify(account));
	db.prepare('INSERT INTO rogue_requests VALUES (?, ?, ?, ?)').run('synthetic-player', 'old-command', '{"kept":true}', 27);
	db.prepare('INSERT INTO rogue_cards VALUES (?, ?, ?, ?, ?)').run('old-card', 'synthetic-player', 1, 1234, '{"id":"old-card"}');
	db.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY, value BLOB); INSERT INTO unrelated VALUES (1, X\'001122\');');
	return db;
}

describe('Fantasy Rogue additive SQLite schema upgrade', function () {
	this.timeout(15000);
	let directory, filename, db;
	beforeEach(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-schema-'));
		filename = path.join(directory, 'old.db');
		db = legacy(filename);
	});
	afterEach(() => {
		if (db?.open) db.close();
		fs.rmSync(directory, { recursive: true, force: true });
	});
	it('adds exactly the history table, primary-key autoindex and owner index without rewriting old rows', () => {
		const before = snapshot(db);
		initializeRogueSchema(db);
		const after = snapshot(db);
		assert.equal(after.userVersion, 17);
		for (const [table, rows] of Object.entries(before.tables)) assert.deepEqual(after.tables[table], rows);
		for (const object of before.schema) assert.deepEqual(after.schema.find(row => row.name === object.name), object);
		assert.deepEqual(after.schema.filter(row => !before.schema.some(old => old.name === row.name)).map(row => row.name).sort(),
			['rogue_history', 'rogue_history_owner', 'sqlite_autoindex_rogue_history_1']);
		assert.equal(after.tables.rogue_history.rows, 0);
		assert(db.prepare('EXPLAIN QUERY PLAN SELECT data FROM rogue_history WHERE userid = ? ORDER BY ended DESC, id LIMIT 12')
			.all('synthetic-player').some(row => row.detail.includes('rogue_history_owner')));
	});
	it('reads existing JSON byte-for-byte and permits old-version SQL after initialization', () => {
		db.close();
		const store = new RogueStore(filename);
		try {
			assert.deepEqual(store.get('synthetic-player'), account);
			assert.equal(store.gallery()[0].id, 'old-card');
			assert.equal(store.history('synthetic-player').total, 0);
		} finally { store.close(); }
		db = new Database(filename);
		db.exec(OLD_SCHEMA);
		assert.equal(db.prepare('SELECT data FROM rogue_accounts').get().data, JSON.stringify(account));
		db.transaction(() => {
			const data = JSON.parse(db.prepare('SELECT data FROM rogue_accounts WHERE userid = ?').get('synthetic-player').data);
			data.points++;
			db.prepare('INSERT OR REPLACE INTO rogue_accounts (userid, data) VALUES (?, ?)').run('synthetic-player', JSON.stringify(data));
		}).immediate();
		assert.equal(JSON.parse(db.prepare('SELECT data FROM rogue_accounts').get().data).points, 43);
		assert.equal(db.prepare('SELECT count(*) AS n FROM rogue_history').get().n, 0);
	});
	it('repeats initialization without changing schema, receipts, accounts, cards or existing history', () => {
		initializeRogueSchema(db);
		db.prepare('INSERT INTO rogue_history VALUES (?, ?, ?, ?)').run('synthetic-player', 'archived-run', 1000, '{"immutable":true}');
		const before = snapshot(db);
		for (let i = 0; i < 5; i++) initializeRogueSchema(db);
		assert.deepEqual(snapshot(db), before);
	});
	for (const sql of [
		'CREATE INDEX rogue_history_owner ON rogue_accounts(userid)',
		'CREATE TABLE rogue_history (id TEXT PRIMARY KEY, data TEXT)',
		'CREATE TABLE rogue_history_owner (unexpected TEXT)',
	]) {
		it(`rolls back a conflicting schema without repairing or replacing it: ${sql}`, () => {
			db.exec(sql);
			const before = snapshot(db);
			assert.throws(() => initializeRogueSchema(db), /Incompatible Fantasy Rogue|already exists|already a table|no such column/);
			assert.deepEqual(snapshot(db), before);
			assert(!db.inTransaction);
		});
	}
	it('rolls back the new table if creating its index fails and closes the failed connection', () => {
		const before = snapshot(db);
		const originalExec = Database.prototype.exec;
		let failedConnection;
		Database.prototype.exec = function (sql) {
			if (sql.includes('CREATE INDEX IF NOT EXISTS rogue_history_owner')) {
				failedConnection = this;
				originalExec.call(this, sql.slice(0, sql.indexOf('CREATE INDEX IF NOT EXISTS rogue_history_owner')));
				throw new Error('Injected index creation failure');
			}
			return originalExec.call(this, sql);
		};
		try {
			assert.throws(() => new RogueStore(filename), /Injected index creation failure/);
			assert(failedConnection);
			assert.equal(failedConnection.open, false);
		} finally { Database.prototype.exec = originalExec; }
		assert.deepEqual(snapshot(db), before);
		initializeRogueSchema(db);
		assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
	});
	it('fails on a writer lock without partial DDL and succeeds after the writer releases it', () => {
		const before = snapshot(db);
		const other = new Database(filename, { timeout: 25 });
		db.exec('BEGIN IMMEDIATE');
		try {
			assert.throws(() => initializeRogueSchema(other), error => error.code === 'SQLITE_BUSY');
			assert(!other.inTransaction);
			assert.deepEqual(snapshot(other), before);
		} finally {
			db.exec('ROLLBACK'); other.close();
		}
		initializeRogueSchema(db);
	});
	it('does not require a writer lock when the complete schema already exists', () => {
		initializeRogueSchema(db);
		const other = new Database(filename, { timeout: 0 });
		db.exec('BEGIN IMMEDIATE');
		try {
			initializeRogueSchema(other);
		} finally {
			db.exec('ROLLBACK'); other.close();
		}
	});
	it('can open an already initialized WAL store while another connection holds the writer lock', () => {
		db.pragma('journal_mode = WAL');
		initializeRogueSchema(db);
		db.exec('BEGIN IMMEDIATE');
		let store;
		try {
			store = new RogueStore(filename);
			assert.deepEqual(store.get('synthetic-player'), account);
		} finally { store?.close(); db.exec('ROLLBACK'); }
	});
	it('initializes an empty database and enforces per-user unique run IDs', () => {
		const fresh = openRogueDatabase(path.join(directory, 'new.db'));
		try {
			const insert = fresh.prepare('INSERT INTO rogue_history VALUES (?, ?, ?, ?)');
			insert.run('alice', 'run', 1, '{}'); insert.run('bob', 'run', 1, '{}');
			assert.throws(() => insert.run('alice', 'run', 2, '{}'), error => error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY');
			assert.equal(fresh.pragma('journal_mode', { simple: true }), 'wal');
			assert.equal(fresh.pragma('synchronous', { simple: true }), 2);
			assert.equal(fresh.pragma('busy_timeout', { simple: true }), 5000);
		} finally { fresh.close(); }
	});
	it('rejects a readonly upgrade while leaving all existing rows and structures intact', () => {
		const before = snapshot(db);
		const readonly = new Database(filename, { readonly: true, fileMustExist: true });
		try {
			assert.throws(() => initializeRogueSchema(readonly), error => error.code === 'SQLITE_READONLY');
			assert(!readonly.inTransaction);
		} finally { readonly.close(); }
		assert.deepEqual(snapshot(db), before);
	});
	it('does not silently repair an invalid existing history index', () => {
		initializeRogueSchema(db);
		db.exec('DROP INDEX rogue_history_owner; CREATE INDEX rogue_history_owner ON rogue_history(userid, ended ASC)');
		const before = snapshot(db);
		assert.throws(() => initializeRogueSchema(db), /Incompatible Fantasy Rogue index/);
		assert.deepEqual(snapshot(db), before);
	});
	it('rolls account, request and history writes back together when archiving fails', () => {
		db.close();
		const store = new RogueStore(filename);
		db = new Database(filename);
		db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON rogue_history BEGIN SELECT RAISE(ABORT, 'history unavailable'); END");
		const before = snapshot(db);
		try {
			assert.throws(() => store.change('synthetic-player', current => { delete current.run; },
				{ id: 'new-command', revision: 27, action: 'abandon' }), /history unavailable/);
			assert.deepEqual(snapshot(db), before);
		} finally { store.close(); }
	});
	it('validates only a new private backup copy and leaves the verified source unchanged', () => {
		db.close();
		const bytes = fs.readFileSync(filename);
		const hash = createHash('sha256').update(bytes).digest('hex');
		const output = path.join(directory, 'audit');
		const report = validateBackup(filename, hash, output);
		assert.equal(report.ok, true);
		assert.equal(report.accountsRead, 1);
		assert.deepEqual(fs.readFileSync(filename), bytes);
		assert.throws(() => validateBackup(filename, hash, output), /EEXIST/);
		assert.throws(() => validateBackup(filename, '0'.repeat(64), path.join(directory, 'bad-checksum')), /checksum/);
		assert(!fs.existsSync(path.join(directory, 'bad-checksum')));
		fs.writeFileSync(filename + '-wal', 'not a standalone backup');
		assert.throws(() => validateBackup(filename, hash, path.join(directory, 'live-copy')), /standalone/);
	});
	it('rejects corrupt databases and an absent explicit maintenance target', () => {
		const corrupt = path.join(directory, 'corrupt.db');
		fs.writeFileSync(corrupt, 'not sqlite');
		assert.throws(() => openRogueDatabase(corrupt), error => error.code === 'SQLITE_NOTADB');
		const missing = path.join(directory, 'missing.db');
		const result = spawnSync(process.execPath, ['tools/initialize-fantasy-rogue-database.js', missing], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
		assert.equal(result.status, 1, result.stderr);
		assert(!fs.existsSync(missing));
	});
	it('runs the explicit maintenance command twice without changing legacy rows', () => {
		const before = snapshot(db);
		db.close();
		for (let i = 0; i < 2; i++) {
			const result = spawnSync(process.execPath, ['tools/initialize-fantasy-rogue-database.js', filename], {
				cwd: path.resolve(__dirname, '../..'), encoding: 'utf8',
			});
			assert.equal(result.status, 0, result.stderr);
		}
		db = new Database(filename);
		const after = snapshot(db);
		for (const [table, rows] of Object.entries(before.tables)) assert.deepEqual(after.tables[table], rows);
	});
	it('fails private-copy validation on malformed account JSON without exposing it or modifying the backup', () => {
		db.prepare('UPDATE rogue_accounts SET data = ?').run('private-invalid-player-data');
		db.close();
		const bytes = fs.readFileSync(filename);
		const hash = createHash('sha256').update(bytes).digest('hex');
		assert.throws(() => validateBackup(filename, hash, path.join(directory, 'invalid-json')), error =>
			error.message.includes('could not be read as JSON') && !error.message.includes('private-invalid-player-data')
		);
		assert.deepEqual(fs.readFileSync(filename), bytes);
	});
	it('validates a standalone online-backup snapshot made from a WAL database', async () => {
		db.pragma('journal_mode = WAL');
		const backup = path.join(directory, 'consistent-backup.db');
		await db.backup(backup);
		assert(!fs.existsSync(backup + '-wal'));
		const bytes = fs.readFileSync(backup);
		const hash = createHash('sha256').update(bytes).digest('hex');
		const report = validateBackup(backup, hash, path.join(directory, 'wal-backup-audit'));
		assert.equal(report.ok, true);
		assert.equal(report.accountsRead, 1);
		assert.deepEqual(fs.readFileSync(backup), bytes);
	});
});
