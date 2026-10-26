import type Database = require('better-sqlite3');

/** Additive only: existing account JSON, receipts and clear cards are never migrated here. */
export const ROGUE_SCHEMA_SQL = `
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
	CREATE TABLE IF NOT EXISTS rogue_history (
		userid TEXT NOT NULL, id TEXT NOT NULL, ended INTEGER NOT NULL, data TEXT NOT NULL,
		PRIMARY KEY (userid, id)
	);
	CREATE INDEX IF NOT EXISTS rogue_history_owner ON rogue_history(userid, ended DESC);
`;

// name, declared type, NOT NULL, position in the primary key (0 = not in the key).
const TABLES: Record<string, readonly (readonly [string, string, number, number])[]> = {
	rogue_accounts: [['userid', 'TEXT', 0, 1], ['data', 'TEXT', 1, 0]],
	rogue_requests: [
		['userid', 'TEXT', 1, 1], ['id', 'TEXT', 1, 2], ['payload', 'TEXT', 1, 0], ['revision', 'INTEGER', 1, 0],
	],
	rogue_cards: [
		['id', 'TEXT', 0, 1], ['userid', 'TEXT', 1, 0], ['public', 'INTEGER', 1, 0],
		['created', 'INTEGER', 1, 0], ['data', 'TEXT', 1, 0],
	],
	rogue_history: [['userid', 'TEXT', 1, 1], ['id', 'TEXT', 1, 2], ['ended', 'INTEGER', 1, 0], ['data', 'TEXT', 1, 0]],
};
const INDEXES = {
	rogue_cards_public: { table: 'rogue_cards', columns: ['public', 'created'] },
	rogue_history_owner: { table: 'rogue_history', columns: ['userid', 'ended'] },
};

interface SchemaColumn {
	name: string;
	type: string;
	notnull: number;
	pk: number;
}

/** IF NOT EXISTS alone does not detect an incompatible table or a same-name index on another table. */
export function validateRogueSchema(db: Database.Database) {
	const object = db.prepare('SELECT type, tbl_name FROM sqlite_master WHERE name = ?');
	for (const [name, expected] of Object.entries(TABLES)) {
		const entry = object.get(name) as { type: string } | undefined;
		const columns = db.pragma(`table_info(${name})`) as SchemaColumn[];
		if (entry?.type !== 'table' || columns.length !== expected.length || expected.some(([column, type, notnull, pk], i) => {
			const actual = columns[i];
			return actual.name !== column || actual.type.toUpperCase() !== type || actual.notnull !== notnull || actual.pk !== pk;
		})) {
			throw new Error(`Incompatible Fantasy Rogue table: ${name}; no automatic repair was attempted.`);
		}
	}
	for (const [name, expected] of Object.entries(INDEXES)) {
		const entry = object.get(name) as { type: string, tbl_name: string } | undefined;
		const indexes = db.pragma(`index_list(${expected.table})`) as { name: string, unique: number, partial: number }[];
		const index = indexes.find(row => row.name === name);
		const columns = (db.pragma(`index_xinfo(${name})`) as { name: string, desc: number, key: number, coll: string }[])
			.filter(row => row.key);
		if (entry?.type !== 'index' || entry.tbl_name !== expected.table || !index || index.unique || index.partial ||
			columns.length !== 2 || columns.some((column, i) =>
			column.name !== expected.columns[i] || column.desc !== i || column.coll !== 'BINARY'
		)) {
			throw new Error(`Incompatible Fantasy Rogue index: ${name}; no automatic repair was attempted.`);
		}
	}
}

export function initializeRogueSchema(db: Database.Database) {
	const exists = db.prepare('SELECT 1 FROM sqlite_master WHERE name = ?');
	if ([...Object.keys(TABLES), ...Object.keys(INDEXES)].every(name => exists.get(name))) {
		// A prepared database only needs reads; do not contend with another writer on every restart.
		validateRogueSchema(db);
		return;
	}
	db.transaction(() => {
		db.exec(ROGUE_SCHEMA_SQL);
		validateRogueSchema(db);
	}).immediate();
}

export function openRogueDatabase(path: string, options: { fileMustExist?: boolean } = {}): Database.Database {
	const DatabaseConstructor: typeof Database = require('better-sqlite3');
	const db = new DatabaseConstructor(path, { timeout: 5000, ...options });
	try {
		db.pragma('journal_mode = WAL');
		db.pragma('synchronous = FULL');
		initializeRogueSchema(db);
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}
