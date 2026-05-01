/**
 * Code for uploading and managing replays.
 *
 * This private-server implementation stores replays as local JSON files, so it
 * does not require Postgres, MySQL, SQLite, Docker, or a loginserver upload
 * round-trip.
 */
import { FS } from '../lib';
import * as crypto from 'crypto';

// must be a type and not an interface to qualify as an SQLRow in older callers
export type ReplayRow = {
	id: string,
	format: string,
	/** player names delimited by `,`; starting with `!` denotes that player wants the replay private */
	players: string,
	log: string,
	inputlog: string | null,
	uploadtime: number,
	views: number,
	formatid: string,
	rating: number | null,
	/**
	 * 0 = public
	 * 1 = private (with or without password)
	 * 2 = unlisted
	 * 3 = deleted
	 * 10 = autosaved
	 */
	private: 0 | 1 | 2 | 3 | 10,
	password: string | null,
};
type Replay = Omit<ReplayRow, 'formatid' | 'players' | 'password' | 'views'> & {
	players: string[],
	views?: number,
	password?: string | null,
};

function replayDir() {
	return Config.replaysdir || 'logs/replays';
}

function replayPath(id: string) {
	if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error(`Invalid replay ID: ${id}`);
	return FS(`${replayDir()}/${id}.json`);
}

const replayWriteLocks = new Map<string, Promise<void>>();

async function writeReplayFile(id: string, data: string) {
	await FS(replayDir()).mkdirp();
	const file = replayPath(id);
	const previousWrite = replayWriteLocks.get(file.path) || Promise.resolve();
	const nextWrite = previousWrite.then(() => file.safeWrite(data));
	replayWriteLocks.set(file.path, nextWrite.catch(() => {}));
	try {
		await nextWrite;
	} finally {
		if (replayWriteLocks.get(file.path) === nextWrite) replayWriteLocks.delete(file.path);
	}
}

function stripPrivateMarker(player: string) {
	return player.startsWith('!') ? player.slice(1) : player;
}

function splitPlayers(players: string) {
	return players.split(',').map(stripPrivateMarker);
}

export const replaysDB = null;
export const replays = null;
export const replayPlayers = null;

export const Replays = new class {
	// Truthy so Rooms.uploadReplay uses the direct save path instead of LoginServer.
	db = true;
	replaysTable = null;
	replayPlayersTable = null;
	readonly passwordCharacters = '0123456789abcdefghijklmnopqrstuvwxyz';

	toReplay(this: void, row: ReplayRow) {
		const replay: Replay = {
			...row,
			players: splitPlayers(row.players),
		};
		if (!replay.password && replay.private === 1) replay.private = 2;
		return replay;
	}
	toReplays(this: void, rows: ReplayRow[]) {
		return rows.map(row => Replays.toReplay(row));
	}

	toReplayRow(this: void, replay: Replay) {
		const formatid = toID(replay.format);
		const replayData: ReplayRow = {
			password: null,
			views: 0,
			...replay,
			players: replay.players.join(','),
			formatid,
		};
		if (replayData.private === 1 && !replayData.password) {
			replayData.password = Replays.generatePassword();
		} else if (replayData.private === 2) {
			replayData.private = 1;
			replayData.password = null;
		}
		return replayData;
	}

	async writeReplay(replayData: ReplayRow) {
		await writeReplayFile(replayData.id, JSON.stringify(replayData));
	}
	async readReplay(id: string): Promise<ReplayRow | null> {
		const data = await replayPath(id).readIfExists();
		if (!data) return null;
		return JSON.parse(data);
	}
	async listReplayRows() {
		const files = await FS(replayDir()).readdirIfExists();
		const rows: ReplayRow[] = [];
		for (const file of files) {
			if (!file.endsWith('.json')) continue;
			try {
				rows.push(JSON.parse(await FS(`${replayDir()}/${file}`).read()) as ReplayRow);
			} catch {}
		}
		return rows;
	}

	async add(replay: Replay) {
		const replayData = this.toReplayRow(replay);
		await this.writeReplay(replayData);
		return replayData.id + (replayData.password ? `-${replayData.password}pw` : '');
	}

	async get(id: string): Promise<Replay | null> {
		const replayData = await this.readReplay(id);
		if (!replayData) return null;
		replayData.views = Number(replayData.views || 0) + 1;
		await this.writeReplay(replayData);
		return this.toReplay(replayData);
	}

	async edit(replay: Replay) {
		const replayData = this.toReplayRow(replay);
		const existing = await this.readReplay(replayData.id);
		if (!existing) return;
		existing.private = replayData.private;
		existing.password = replayData.password;
		await this.writeReplay(existing);
	}

	generatePassword(length = 31) {
		let password = '';
		for (let i = 0; i < length; i++) {
			password += this.passwordCharacters[crypto.randomInt(0, this.passwordCharacters.length - 1)];
		}
		return password;
	}

	async search(args: {
		page?: number, isPrivate?: boolean, byRating?: boolean,
		format?: string, username?: string, username2?: string,
	}): Promise<Replay[]> {
		const page = args.page || 0;
		if (page > 100) return [];
		const offset = Math.max(50 * (page - 1), 0);
		const isPrivate = args.isPrivate ? 1 : 0;
		const formatid = args.format ? toID(args.format) : '';
		const username = args.username ? toID(args.username) : '';
		const username2 = args.username2 ? toID(args.username2) : '';
		const rows = (await this.listReplayRows()).filter(row => {
			if (row.private !== isPrivate) return false;
			if (formatid && row.formatid !== formatid) return false;
			const playerids = splitPlayers(row.players).map(player => toID(player));
			if (username && !playerids.includes(username)) return false;
			if (username2 && !playerids.includes(username2)) return false;
			return true;
		});
		rows.sort((a, b) => {
			if (args.byRating) return (b.rating || 0) - (a.rating || 0) || b.uploadtime - a.uploadtime;
			return b.uploadtime - a.uploadtime;
		});
		return this.toReplays(rows.slice(offset, offset + 51));
	}

	async fullSearch(term: string, page = 0): Promise<Replay[]> {
		if (page > 0) return [];
		const terms = term.split(',').map(subterm => subterm.trim().toLowerCase()).filter(Boolean);
		if (terms.length !== 1 && terms.length !== 2) return [];
		const rows = (await this.listReplayRows()).filter(row => {
			if (row.private !== 0) return false;
			const log = row.log.toLowerCase();
			return terms.every(subterm => log.includes(subterm));
		});
		rows.sort((a, b) => b.uploadtime - a.uploadtime);
		return this.toReplays(rows.slice(0, 10));
	}

	async recent() {
		const rows = (await this.listReplayRows()).filter(row => row.private === 0);
		rows.sort((a, b) => b.uploadtime - a.uploadtime);
		return this.toReplays(rows.slice(0, 50));
	}
};

export default Replays;
