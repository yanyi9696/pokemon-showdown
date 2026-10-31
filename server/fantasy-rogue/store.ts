import { syncAffection } from './affection';
import { syncMasterBalls } from './master-ball';
import { trackJourney, journeyRecord, journeyDisplay, type JourneyRecord } from './history';
import { migrateTeraShards } from './tera-shards';
import type Database = require('better-sqlite3');
import { emptyRogueStats } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueCommand } from './types';
import type { RogueClearCard } from './legacy';
import { recordRogueDiscoveries } from './discoveries';
import { syncRunDifficulty } from './difficulty';
import { openRogueDatabase } from './store-schema';
import { assertRogueSaveCompatible, ROGUE_SAVE_VERSION } from './save-compatibility';

export class RogueStore {
	private readonly db: Database.Database;
	constructor(path: string) {
		this.db = openRogueDatabase(path);
	}
	card(id: string): RogueClearCard | undefined {
		const row = this.db.prepare('SELECT data FROM rogue_cards WHERE id = ?').get(id) as { data: string } | undefined;
		return row && JSON.parse(row.data);
	}
	gallery(offset = 0): RogueClearCard[] {
		return (this.db.prepare('SELECT data FROM rogue_cards WHERE public = 1 ORDER BY created DESC, id LIMIT 12 OFFSET ?')
			.all(offset) as { data: string }[]).map(row => JSON.parse(row.data));
	}
	history(userid: string, offset = 0) {
		const total = (this.db.prepare('SELECT COUNT(*) AS count FROM rogue_history WHERE userid = ?').get(userid) as { count: number }).count;
		const records = (this.db.prepare('SELECT data FROM rogue_history WHERE userid = ? ORDER BY ended DESC, id LIMIT 12 OFFSET ?').all(userid, offset) as { data: string }[]).map(row => JSON.parse(row.data) as JourneyRecord);
		return { total, offset, records: records.map(journeyDisplay) };
	}
	get(userid: string): RogueAccount {
		const row = this.db.prepare('SELECT data FROM rogue_accounts WHERE userid = ?')
			.get(userid) as { data: string } | undefined;
		const account: RogueAccount = row ? JSON.parse(row.data) : {
			revision: 0, points: 20, boosts: emptyRogueStats(), slots: 1, captures: {}, unlocked: [],
		};
		assertRogueSaveCompatible(account);
		return account;
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
			syncAffection(account);
			syncMasterBalls(account);
			const masterBefore = account.run && { id: account.run.id, count: account.run.bag.masterball || 0 };
			const priorRun = account.run;
			if (priorRun) trackJourney(priorRun, account);
			if (account.run) migrateTeraShards(account.run);
			update(account);
			assertRogueSaveCompatible(account);
			syncMasterBalls(account, masterBefore);
			syncAffection(account);
			if (account.run) { syncRunDifficulty(account.run); trackJourney(account.run, account); }
			for (const run of [priorRun, account.run]) {
				if (!run || !run.journey) continue;
				const outcome = run.phase === 'complete' || run.phase === 'postgame' ? 'complete' : run.phase === 'defeated' ? 'defeated' : run !== account.run ? 'abandoned' : undefined;
				if (!outcome) continue;
				// Completed records are immutable; deleting a saved card never deletes history.
				this.db.prepare('INSERT OR IGNORE INTO rogue_history (userid, id, ended, data) VALUES (?, ?, ?, ?)')
					.run(userid, run.id, Date.now(), JSON.stringify(journeyRecord(run, outcome)));
			}
			recordRogueDiscoveries(account);
			if (!command && JSON.stringify(account) === before) return account;
			account.saveVersion = ROGUE_SAVE_VERSION;
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
