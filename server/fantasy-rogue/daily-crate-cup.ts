import { gunzipSync } from 'zlib';
import { DAILY_CUP_V1 } from './daily-cup-data';
import type { StarterCrates } from './starter-crates';

const DAY = 86400000;
const ANCHOR = Date.UTC(2026, 10, 3);
export interface CratePrediction {
	id: string;
	picks: [number, number, number];
	settled?: boolean;
	reward?: number;
}

/** A date label, not the client's clock. All accounts use Asia/Shanghai. */
export function cupDay(now = Date.now()) {
	return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
function tournament(day: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('赛事日期无效。');
	const stamp = Date.parse(`${day}T00:00:00Z`);
	if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== day || stamp < ANCHOR) {
		throw new Error('赛事日期无效。');
	}
	const entry = DAILY_CUP_V1[Math.floor((stamp - ANCHOR) / DAY)];
	if (!entry) throw new Error('新一轮赛事正在筹备，请稍后查看。');
	return entry;
}
export function dailyCupSummary(ledger?: StarterCrates, now = Date.now()) {
	const day = cupDay(now);
	return { day, submitted: !!ledger?.predictions?.[day], requestId: ledger?.predictions?.[day]?.id };
}
export function needsCupSettlement(ledger?: StarterCrates, now = Date.now()) {
	const today = cupDay(now);
	return Object.entries(ledger?.predictions || {}).some(([day, bet]) => day < today && !bet.settled);
}
/** Runs in the same account transaction as the balance and receipt. Never simulates battles. */
export function settleDailyCup(ledger: StarterCrates, now = Date.now()) {
	const today = cupDay(now);
	for (const [day, bet] of Object.entries(ledger.predictions || {})) {
		if (day >= today || bet.settled) continue;
		const winners = tournament(day).winners;
		bet.reward = bet.picks.length === 3 && bet.picks.every((pick, i) => pick === winners[i]) ? 1 : 0;
		ledger.freeDraws = (ledger.freeDraws || 0) + bet.reward;
		bet.settled = true;
		ledger.version = 2;
	}
}
export function submitDailyCup(ledger: StarterCrates, id: string, value: string, now = Date.now()) {
	const [day, first, second, champion, extra] = value.split(':');
	if (extra !== undefined || day !== cupDay(now)) throw new Error('竞猜已跨日，请刷新后参与新一轮。');
	tournament(day);
	if (!/^[AB]$/.test(first || '') || !/^[CD]$/.test(second || '') ||
		(champion !== first && champion !== second)) throw new Error('请选定两场胜者，再从这两队中预测冠军。');
	if (ledger.predictions?.[day]) throw new Error('今日预测已提交，不能更改。');
	settleDailyCup(ledger, now);
	ledger.version = 2;
	(ledger.predictions ||= {})[day] = {
		id, picks: [first, second, champion].map(team => 'ABCD'.indexOf(team)) as [number, number, number],
	};
}
export function dailyCupView(ledger?: StarterCrates, now = Date.now()) {
	const day = cupDay(now);
	const previous = cupDay(now - DAY);
	const days = [...new Set([previous, ...Object.keys(ledger?.predictions || {}).filter(date => date < day)])]
		.filter(date => {
			const stamp = Date.parse(`${date}T00:00:00Z`);
			return stamp >= ANCHOR && stamp < ANCHOR + DAILY_CUP_V1.length * DAY;
		}).sort().reverse();
	let teams: string[][];
	try {
		teams = tournament(day).teams;
	} catch {
		teams = [];
	}
	return {
		day, refreshAt: Date.parse(`${day}T00:00:00+08:00`) + DAY,
		teams, prediction: ledger?.predictions?.[day],
		// Only past results are public. Today's winners and logs must never reach the client.
		results: days.map(date => ({ day: date, teams: tournament(date).teams,
			winners: tournament(date).winners, prediction: ledger?.predictions?.[date] })),
	};
}
const replayCache = new Map<string, string[]>();
export function dailyCupReplay(day: string, match: number, now = Date.now()) {
	if (day >= cupDay(now)) throw new Error('本轮赛事尚未公布，请在次日查看录像。');
	if (!Number.isInteger(match) || match < 0 || match > 2) throw new Error('请选择有效的对局。');
	const entry = tournament(day), key = `${day}:${match}`;
	let log = replayCache.get(key);
	if (!log) {
		log = gunzipSync(Buffer.from(entry.replays[match], 'base64')).toString('utf8').split('\n');
		if (replayCache.size >= 12) replayCache.delete(replayCache.keys().next().value!);
		replayCache.set(key, log);
	}
	return { day, match, log, winner: entry.winners[match] };
}
