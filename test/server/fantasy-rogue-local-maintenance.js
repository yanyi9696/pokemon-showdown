'use strict';

const assert = require('assert').strict;
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { backup } = require('../../tools/fantasy-rogue-local-service');

describe('Fantasy Rogue local worktree maintenance', () => {
	let directory, root, databases;
	beforeEach(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rogue-maintenance-'));
		root = path.join(directory, 'development');
		fs.mkdirSync(path.join(root, 'config'), { recursive: true });
		databases = [];
	});
	afterEach(() => {
		for (const db of databases) db.close();
		fs.rmSync(directory, { recursive: true, force: true });
	});
	function database(filename, phase = 'event') {
		fs.mkdirSync(path.dirname(filename), { recursive: true });
		const db = new Database(filename);
		databases.push(db);
		db.pragma('journal_mode = WAL');
		db.pragma('wal_autocheckpoint = 0');
		db.exec('CREATE TABLE rogue_accounts (userid TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE receipts (id TEXT);');
		db.prepare('INSERT INTO rogue_accounts VALUES (?, ?)').run('savedplayer', JSON.stringify({ run: { floor: 56, phase } }));
		db.prepare('INSERT INTO receipts VALUES (?)').run('already-claimed');
		return db;
	}
	function config(filename) {
		fs.writeFileSync(path.join(root, 'config/config.js'), `exports.fantasyrogue = ${JSON.stringify({ database: filename })};`);
	}
	it('backs up the configured external save including its WAL without replacing the original', async () => {
		const filename = path.join(directory, 'original', 'databases', 'fantasy-rogue-preview.db');
		const db = database(filename);
		config(filename);
		const before = db.prepare('SELECT userid, data FROM rogue_accounts ORDER BY userid').all();
		const manifest = await backup(root);
		assert.equal(manifest.databases.length, 1);
		const entry = manifest.databases[0];
		assert.equal(entry.source, fs.realpathSync(filename));
		assert.equal(entry.accounts, 1);
		assert.equal(entry.hash, crypto.createHash('sha256').update(JSON.stringify(before)).digest('hex'));
		const saved = new Database(path.join(manifest.folder, entry.name), { readonly: true });
		try {
			assert.deepEqual(saved.prepare('SELECT userid, data FROM rogue_accounts ORDER BY userid').all(), before);
			assert.deepEqual(saved.prepare('SELECT * FROM receipts').all(), [{ id: 'already-claimed' }]);
		} finally {
			saved.close();
		}
		assert.deepEqual(db.prepare('SELECT userid, data FROM rogue_accounts ORDER BY userid').all(), before);
		assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'tmp/fantasy-rogue-last-backup.json'))), manifest);
	});
	it('deduplicates a configured relative path to the standard preview database', async () => {
		database(path.join(root, 'databases/fantasy-rogue-preview.db'));
		config('databases/fantasy-rogue-preview.db');
		assert.equal((await backup(root)).databases.length, 1);
	});
	it('preserves both databases when an external save has the same filename', async () => {
		database(path.join(root, 'databases/fantasy-rogue-preview.db'));
		const external = path.join(directory, 'old', 'fantasy-rogue-preview.db');
		database(external, 'choose');
		config(external);
		const manifest = await backup(root);
		assert.equal(manifest.databases.length, 2);
		assert.equal(new Set(manifest.databases.map(entry => entry.name)).size, 2);
		assert.notEqual(manifest.databases[0].hash, manifest.databases[1].hash);
		for (const entry of manifest.databases) assert(fs.existsSync(path.join(manifest.folder, entry.name)));
	});
	it('refuses a restart backup if the configured external save has an active battle', async () => {
		const external = path.join(directory, 'old', 'game.db');
		database(external, 'battle');
		config(external);
		await assert.rejects(backup(root), /进行中的肉鸽战斗/);
		assert(!fs.existsSync(path.join(root, 'tmp/fantasy-rogue-last-backup.json')));
	});
	it('does not treat an in-memory database as a filesystem path', async () => {
		config(':memory:');
		assert.deepEqual((await backup(root)).databases, []);
	});
});
