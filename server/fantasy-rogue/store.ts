import type Database = require('better-sqlite3');
import { emptyRogueStats } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueCommand } from './types';

export class RogueStore {
	private readonly db: Database.Database;
	constructor(path: string) {
		const DatabaseConstructor: typeof Database = require('better-sqlite3');
		this.db = new DatabaseConstructor(path);
		this.db.pragma('journal_mode = WAL');
		this.db.pragma('synchronous = FULL');
		this.db.pragma('busy_timeout = 5000');
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS rogue_accounts (userid TEXT PRIMARY KEY, data TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS rogue_requests (
				userid TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL,
				PRIMARY KEY (userid, id)
			);
		`);
	}
	get(userid: string): RogueAccount {
		const row = this.db.prepare('SELECT data FROM rogue_accounts WHERE userid = ?')
			.get(userid) as { data: string } | undefined;
		return row ? JSON.parse(row.data) : {
			revision: 0, points: 0, boosts: emptyRogueStats(), slots: 1, captures: {}, unlocked: [],
		};
	}
	/** Revision and idempotency checks execute in the same write transaction as the mutation. */
	change(userid: string, update: (account: RogueAccount) => void, command?: RogueCommand): RogueAccount {
		return this.db.transaction(() => {
			const account = this.get(userid);
			const before = JSON.stringify(account);
			if (command) {
				if (!/^[a-zA-Z0-9-]{8,80}$/.test(command.id)) throw new Error('请求标识无效。');
				const receipt = this.db.prepare('SELECT payload FROM rogue_requests WHERE userid = ? AND id = ?')
					.get(userid, command.id) as { payload: string } | undefined;
				if (receipt) {
					if (receipt.payload !== JSON.stringify(command)) throw new Error('重复请求内容不一致。');
					return account;
				}
				if (!Number.isSafeInteger(command.revision) || command.revision !== account.revision) {
					throw new Error('存档已更新，请刷新后重试。');
				}
			}
			update(account);
			if (!command && JSON.stringify(account) === before) return account;
			account.revision++;
			this.db.prepare('INSERT OR REPLACE INTO rogue_accounts (userid, data) VALUES (?, ?)').run(userid, JSON.stringify(account));
			if (command) {
				this.db.prepare('INSERT INTO rogue_requests (userid, id, payload, revision) VALUES (?, ?, ?, ?)')
					.run(userid, command.id, JSON.stringify(command), account.revision);
				this.db.prepare('DELETE FROM rogue_requests WHERE userid = ? AND revision < ?').run(userid, account.revision - 128);
			}
			return account;
		}).immediate();
	}
	close() { this.db.close(); }
}
