import { syncAffection, type AffectionRewards } from './affection';
import { syncMasterBalls } from './master-ball';
import { syncCoopMasterBalls } from './coop-master-ball';
import { trackJourney, journeyRecord, journeyDisplay, type JourneyRecord } from './history';
import { migrateTeraShards } from './tera-shards';
import type Database = require('better-sqlite3');
import { emptyRogueStats } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueCommand, RogueCoopInvite, RogueCoopSession, RogueRun } from './types';
import type { RogueClearCard } from './legacy';
import { recordRogueDiscoveries } from './discoveries';
import { syncRunDifficulty } from './difficulty';
import { recordClear } from './legacy';
import { awardFirstClears } from './first-clears';
import { recordMonthlyClear } from './monthly-challenges';
import { restoreMember } from './recovery-items';
import { coopRunRules } from './coop-collapse';
import { awardEcho } from './echo';
import { recordCollapseClear } from './collapse';
import { assertNuzlockeRoster, syncNuzlocke } from './nuzlocke';
import { openRogueDatabase } from './store-schema';
import { assertRogueSaveCompatible, ROGUE_SAVE_VERSION } from './save-compatibility';

export class RogueStore {
	private readonly db: Database.Database;
	private affectionRewards?: AffectionRewards;
	constructor(path: string) {
		this.db = openRogueDatabase(path);
	}
	/** Runtime dependencies only; migration rewards remain inside the existing account transaction. */
	configureAffectionRewards(rewards: AffectionRewards | undefined) {
		this.affectionRewards = rewards;
	}
	/** Public directory only: never deserialize or return another player's account. */
	searchPlayerNames(query: string): { userid: string, name: string }[] {
		const needle = query.trim().toLowerCase().slice(0, 24);
		if (!needle) return [];
		return this.db.prepare(`SELECT userid,
			COALESCE(json_extract(data, '$.run.owner.name'), userid) AS name FROM rogue_accounts
			WHERE instr(lower(userid), ?) > 0 OR
			instr(lower(COALESCE(json_extract(data, '$.run.owner.name'), '')), ?) > 0
			ORDER BY userid LIMIT 50`).all(needle, needle) as { userid: string, name: string }[];
	}
	/** Synchronous result writes only. Emit battle/client notifications after this commits. */
	commitCoopResult<T>(resolve: () => T): T {
		return this.db.transaction(resolve).immediate();
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
	coopInvitations(userid: string): RogueCoopInvite[] {
		this.db.prepare('DELETE FROM rogue_coop_invites WHERE expires <= ?').run(Date.now());
		return (this.db.prepare('SELECT data FROM rogue_coop_invites WHERE (from_user = ? OR to_user = ?) AND expires > ? ORDER BY created DESC LIMIT 16')
			.all(userid, userid, Date.now()) as { data: string }[]).map(row => JSON.parse(row.data));
	}
	coopInvitation(id: string): RogueCoopInvite | undefined {
		const row = this.db.prepare('SELECT data FROM rogue_coop_invites WHERE id = ?').get(id) as { data: string } | undefined;
		return row && JSON.parse(row.data);
	}
	coopSessionForUser(userid: string): RogueCoopSession | undefined {
		const row = this.db.prepare("SELECT data FROM rogue_coop_sessions WHERE status IN ('lobby', 'active', 'paused') AND (host_user = ? OR guest_user = ?) ORDER BY updated DESC LIMIT 1")
			.get(userid, userid) as { data: string } | undefined;
		return row && JSON.parse(row.data);
	}
	coopSession(id: string): RogueCoopSession | undefined {
		const row = this.db.prepare('SELECT data FROM rogue_coop_sessions WHERE id = ?').get(id) as { data: string } | undefined;
		return row && JSON.parse(row.data);
	}
	private assertCoopSessionFree(userid: string) {
		if (this.db.prepare("SELECT 1 FROM rogue_coop_sessions WHERE status IN ('lobby', 'active', 'paused') AND (host_user = ? OR guest_user = ?) LIMIT 1")
			.get(userid, userid)) throw new Error('你或对方已经在进行另一场联机冒险。');
	}
	createCoopInvitation(invite: RogueCoopInvite) {
		return this.db.transaction(() => {
			this.assertCoopSessionFree(invite.fromUser);
			this.assertCoopSessionFree(invite.toUser);
			if (this.db.prepare('SELECT 1 FROM rogue_coop_invites WHERE from_user = ? AND expires > ? LIMIT 1')
				.get(invite.fromUser, Date.now())) throw new Error('请先处理你已发出的联机邀请。');
			const incoming = (this.db.prepare('SELECT COUNT(*) AS count FROM rogue_coop_invites WHERE to_user = ? AND expires > ?')
				.get(invite.toUser, Date.now()) as { count: number }).count;
			if (incoming >= 3) throw new Error('对方待处理的联机邀请较多，请稍后再试。');
			this.db.prepare('INSERT INTO rogue_coop_invites (id, from_user, to_user, created, expires, data) VALUES (?, ?, ?, ?, ?, ?)')
				.run(invite.id, invite.fromUser, invite.toUser, invite.createdAt, invite.expiresAt, JSON.stringify(invite));
			return invite;
		}).immediate();
	}
	removeCoopInvitation(id: string, userid: string, role: 'sender' | 'recipient') {
		return this.db.transaction(() => {
			const row = this.db.prepare('SELECT data FROM rogue_coop_invites WHERE id = ?').get(id) as { data: string } | undefined;
			const invite: RogueCoopInvite | undefined = row && JSON.parse(row.data);
			if (!invite || invite.expiresAt <= Date.now() || (role === 'sender' ? invite.fromUser !== userid : invite.toUser !== userid)) {
				throw new Error('联机邀请已过期或你无权处理。');
			}
			this.db.prepare('DELETE FROM rogue_coop_invites WHERE id = ?').run(id);
			return invite;
		}).immediate();
	}
	acceptCoopInvitation(id: string, guestUser: string, session: RogueCoopSession) {
		return this.db.transaction(() => {
			const row = this.db.prepare('SELECT data FROM rogue_coop_invites WHERE id = ?').get(id) as { data: string } | undefined;
			const invite: RogueCoopInvite | undefined = row && JSON.parse(row.data);
			if (invite?.toUser !== guestUser || (invite?.expiresAt ?? 0) <= Date.now()) {
				throw new Error('联机邀请已过期或你无权处理。');
			}
			if (session.hostUser !== invite.fromUser || session.guestUser !== invite.toUser ||
				session.difficulty !== invite.difficulty || session.status !== 'lobby' || session.revision !== 1) {
				throw new Error('联机大厅资料与邀请不一致。');
			}
			this.assertCoopSessionFree(invite.fromUser);
			this.assertCoopSessionFree(invite.toUser);
			this.db.prepare('INSERT INTO rogue_coop_sessions (id, host_user, guest_user, status, updated, data) VALUES (?, ?, ?, ?, ?, ?)')
				.run(session.id, session.hostUser, session.guestUser, session.status, session.updatedAt, JSON.stringify(session));
			this.db.prepare('DELETE FROM rogue_coop_invites WHERE id = ?').run(id);
			this.db.prepare('DELETE FROM rogue_coop_invites WHERE from_user IN (?, ?) OR to_user IN (?, ?)')
				.run(invite.fromUser, invite.toUser, invite.fromUser, invite.toUser);
			return { invite, session };
		}).immediate();
	}
	updateCoopSession(
		session: RogueCoopSession, expectedRevision: number,
		accountUpdates?: ReadonlyMap<string, (account: RogueAccount) => void>,
	) {
		return this.db.transaction(() => {
			const row = this.db.prepare('SELECT data FROM rogue_coop_sessions WHERE id = ?').get(session.id) as { data: string } | undefined;
			const current: RogueCoopSession | undefined = row && JSON.parse(row.data);
			if (current?.revision !== expectedRevision || session.revision !== expectedRevision + 1) {
				throw new Error('联机进度已更新，请刷新后重试。');
			}
			// Commit unlocks and their paid session action together. Nested account changes are
			// SQLite savepoints and roll back if either an account or the session write fails.
			for (const [userid, update] of accountUpdates || []) {
				if (userid !== current.hostUser && userid !== current.guestUser) {
					throw new Error('不能更新联机成员以外的账号。');
				}
				this.change(userid, update);
			}
			syncCoopMasterBalls(session, current, userid => this.get(userid), (userid, update) => {
				this.change(userid, update);
			});
			const postgameClear = session.adventure?.postgame?.stage === 'offer' &&
				session.adventure.phase === 'postgame' && !current.adventure?.campaignCleared;
			// An optional postgame loss/abandon must not replace the already committed tower clear.
			if (current.adventure?.campaignCleared && session.adventure) session.adventure.campaignCleared = true;
			if (!current.adventure?.campaignCleared && (postgameClear || session.status !== current.status &&
				(session.status === 'complete' || session.status === 'abandoned' && session.adventure))) {
				const adventure = session.adventure;
				const completed = postgameClear || session.status === 'complete';
				if (!adventure || !['active', 'paused'].includes(current.status) || completed &&
					(current.status !== 'active' || (!postgameClear && adventure.phase !== 'complete') || adventure.floor !== 200)) {
					throw new Error('联机通关结算状态无效。');
				}
				const members = [session.hostUser, session.guestUser];
				for (const [index, userid] of members.entries()) {
					const member = adventure.members[userid];
					const account = this.get(userid);
					const previousCards = JSON.stringify(account.cards || []);
					const journey = member.journey || { startedAt: session.createdAt, blessings: [], participants: {} };
					const run = {
						owner: { id: userid, name: index ? session.guestName : session.hostName },
						id: `coop-${adventure.id}`, contentVersion: adventure.contentVersion, floor: adventure.floor,
						phase: completed ? 'complete' : 'ready',
						difficulty: adventure.difficulty, doubleBattle: true, encounter: adventure.encounter, attempt: 0,
						...coopRunRules(adventure),
						team: member.team, box: member.box, money: member.money, bag: member.bag, boosts: member.boosts,
						boostRuleVersion: 2, startingSlots: member.slots, blessings: member.blessings, journey,
						growth: member.growth, trainerBonds: member.trainerBonds, rival: member.rival,
						megaUnlocked: member.systems.mega, gmegaUnlocked: member.systems.gmega,
						zUnlocked: member.systems.z, teraUnlocked: member.systems.tera,
						checkpoint: { team: [], box: [], money: member.money, bag: {} }, caught: account.caughtSpecies || [],
					} as RogueRun;
					if (completed) {
						awardEcho(account, run); recordCollapseClear(account, run);
						for (const mon of member.team) restoreMember(mon);
						awardFirstClears(account, run);
						recordMonthlyClear(account, run);
						recordClear(account, run, { partnerName: index ? session.hostName : session.guestName });
						member.notices = [...(member.notices || []), ...(run.notices || [])];
					}
					trackJourney(run, account);
					const record = journeyRecord(run, completed ? 'complete' : 'abandoned');
					record.cooperative = { partnerName: index ? session.hostName : session.guestName };
					this.db.prepare('INSERT OR IGNORE INTO rogue_history (userid, id, ended, data) VALUES (?, ?, ?, ?)')
						.run(userid, record.id, record.endedAt, JSON.stringify(record));
					if (completed) {
						account.saveVersion = ROGUE_SAVE_VERSION;
						account.revision++;
						assertRogueSaveCompatible(account);
						this.db.prepare('INSERT OR REPLACE INTO rogue_accounts (userid, data) VALUES (?, ?)')
							.run(userid, JSON.stringify(account));
						if (JSON.stringify(account.cards || []) !== previousCards) this.saveCards(userid, account.cards || []);
					}
				}
			}
			if (postgameClear || session.status === 'complete') session.adventure!.campaignCleared = true;
			this.db.prepare('UPDATE rogue_coop_sessions SET status = ?, updated = ?, data = ? WHERE id = ?')
				.run(session.status, session.updatedAt, JSON.stringify(session), session.id);
			return session;
		}).immediate();
	}
	private saveCards(userid: string, cards: RogueClearCard[]) {
		this.db.prepare('DELETE FROM rogue_cards WHERE userid = ?').run(userid);
		const insert = this.db.prepare('INSERT INTO rogue_cards (id, userid, public, created, data) VALUES (?, ?, ?, ?, ?)');
		for (const card of cards) insert.run(card.id, userid, Number(card.public), card.completedAt, JSON.stringify(card));
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
			syncAffection(account, this.affectionRewards);
			syncMasterBalls(account);
			const masterBefore = account.run && { id: account.run.id, count: account.run.bag.masterball || 0 };
			const priorRun = account.run;
			if (priorRun) trackJourney(priorRun, account);
			if (account.run) migrateTeraShards(account.run);
			if (account.run) syncNuzlocke(account.run);
			const deadBefore = account.run?.nuzlocke ? [...account.run.team, ...(account.run.box || [])]
				.filter(mon => mon.nuzlockeDead).map(mon => mon.id) : [];
			update(account);
			if (account.run && account.run.id === priorRun?.id) assertNuzlockeRoster(account.run, deadBefore, command);
			assertRogueSaveCompatible(account);
			syncMasterBalls(account, masterBefore);
			syncAffection(account, this.affectionRewards);
			if (account.run) {
				syncRunDifficulty(account.run);
				syncNuzlocke(account.run);
				trackJourney(account.run, account);
			}
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
				this.saveCards(userid, account.cards || []);
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
