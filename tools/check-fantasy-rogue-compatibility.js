#!/usr/bin/env node
'use strict';

// Run against a disposable, consistent backup copy, never against a live database.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function check(database, target) {
	const contractPath = path.resolve(target, 'dist/server/fantasy-rogue/save-compatibility.js');
	if (!fs.existsSync(contractPath)) throw new Error('Target has no certified save contract; old-code rollback is NOT safe.');
	const contract = require(contractPath);
	const required = ['mainline-choice-v1', 'meta-boost-percent-v2', 'challenge-v1', 'history-v1'];
	if (contract.ROGUE_SAVE_VERSION !== 2 || !required.every(id => contract.ROGUE_SAVE_CAPABILITIES?.includes(id)) ||
		typeof contract.rogueSaveCompatibilityIssues !== 'function') {
		throw new Error('Unsupported target save contract. Use a verified forward-compatible build.');
	}
	if (!fs.statSync(database).isFile()) throw new Error('Database must be an existing regular backup file.');
	const db = new Database(database, { readonly: true, fileMustExist: true, timeout: 5000 });
	try {
		db.pragma('query_only = ON');
		return db.transaction(() => {
			if (JSON.stringify(db.pragma('integrity_check', { simple: true })) !== '"ok"' || db.pragma('foreign_key_check').length) {
				throw new Error('Database integrity check failed. Do not repair or overwrite the original backup.');
			}
			const { validateRogueSchema } = require(path.resolve(target, 'dist/server/fantasy-rogue/store-schema.js'));
			validateRogueSchema(db);
			const rows = {};
			for (const table of ['rogue_accounts', 'rogue_cards', 'rogue_history']) {
				rows[table] = 0;
				for (const row of db.prepare(`SELECT data FROM ${table}`).iterate()) {
					let data;
					try { data = JSON.parse(row.data); } catch { throw new Error(`${table}: invalid JSON.`); }
					const issues = contract.rogueSaveCompatibilityIssues(table === 'rogue_accounts' ? data : { run: data.snapshot });
					if (issues.length) throw new Error(`${table}: unsupported data contract (${issues.join(', ')}).`);
					rows[table]++;
				}
			}
			rows.rogue_requests = db.prepare('SELECT COUNT(*) AS count FROM rogue_requests').get().count;
			return { compatible: true, saveVersion: contract.ROGUE_SAVE_VERSION, rows,
				scope: 'Read-only data/schema preflight; requires matching client and separate continuation tests.' };
		})();
	} finally {
		db.close();
	}
}

if (require.main === module) {
	try {
		const args = process.argv.slice(2);
		if (args.length !== 4 || args[0] !== '--database' || args[2] !== '--target') {
			throw new Error('Usage: node tools/check-fantasy-rogue-compatibility.js --database <backup-copy> --target <built-source>');
		}
		console.log(JSON.stringify(check(path.resolve(args[1]), path.resolve(args[3])), null, 2));
	} catch (error) {
		// No account names, save contents, keys or credentials are included in the report.
		console.error(`Compatibility preflight failed: ${error.message}`);
		process.exitCode = 2;
	}
}
module.exports = { check };
