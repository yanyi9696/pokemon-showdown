import type Database = require('better-sqlite3');
import { emptyRogueStats } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueCommand } from './types';
import type { RogueClearCard } from './legacy';
import { recordRogueDiscoveries } from './discoveries';
import { syncRunDifficulty } from './difficulty';

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
			CREATE TABLE IF NOT EXISTS rogue_cards (
				id TEXT PRIMARY KEY, userid TEXT NOT NULL, public INTEGER NOT NULL,
				created INTEGER NOT NULL, data TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS rogue_cards_public ON rogue_cards(public, created DESC);
		`);
	}
	card(id: string): RogueClearCard | undefined {
		const row = this.db.prepare('SELECT data FROM rogue_cards WHERE id = ?').get(id) as { data: string } | undefined;
		return row && JSON.parse(row.data);
	}
	gallery(offset = 0): RogueClearCard[] {
		return (this.db.prepare('SELECT data FROM rogue_cards WHERE public = 1 ORDER BY created DESC, id LIMIT 12 OFFSET ?')
			.all(offset) as { data: string }[]).map(row => JSON.parse(row.data));
	}
	get(userid: string): RogueAccount {
		const row = this.db.prepare('SELECT data FROM rogue_accounts WHERE userid = ?')
			.get(userid) as { data: string } | undefined;
		return row ? JSON.parse(row.data) : {
			revision: 0, points: 20, boosts: emptyRogueStats(), slots: 1, captures: {}, unlocked: [],
		};
	}
	/** Revision and idempotency checks execute in the same write transaction as the mutation. */
	change(userid: string, update: (account: RogueAccount) => void, command?: RogueCommand): RogueAccount {
		return this.db.transaction(() => {
			const account = this.get(userid);
			const before = JSON.stringify(account);
			const previousCards = JSON.stringify(account.cards || []);
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
			// Capture old evidence before an abandon/new run/card deletion, then the newly earned entries.
			recordRogueDiscoveries(account);
			update(account);
			if (account.run) syncRunDifficulty(account.run);
			recordRogueDiscoveries(account);
			if (!command && JSON.stringify(account) === before) return account;
			account.revision++;
			this.db.prepare('INSERT OR REPLACE INTO rogue_accounts (userid, data) VALUES (?, ?)').run(userid, JSON.stringify(account));
			if (JSON.stringify(account.cards || []) !== previousCards) {
				this.db.prepare('DELETE FROM rogue_cards WHERE userid = ?').run(userid);
				const insert = this.db.prepare('INSERT INTO rogue_cards (id, userid, public, created, data) VALUES (?, ?, ?, ?, ?)');
				for (const card of account.cards || []) {
					insert.run(card.id, userid, Number(card.public), card.completedAt, JSON.stringify(card));
				}
			}
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
