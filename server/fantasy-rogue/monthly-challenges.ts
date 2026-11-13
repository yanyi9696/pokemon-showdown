import { createHash } from 'crypto';
import { MONTHLY_CANDIDATES_V1 } from './monthly-candidates-v1';
import { firstClearSpeciesKey } from './first-clears';
import { emptyEchoUpgrades } from '../../sim/rogue-echo';
import type { RogueAccount, RogueRun } from './types';

export interface MonthlyChallenges {
	[month: string]: { version: 1, entries: Record<string, { best: number, claimed: number }> };
}
type Candidate = typeof MONTHLY_CANDIDATES_V1[number];
const family = (entry: Candidate) => entry.eligible[entry.eligible.length - 1];
const cache = new Map<string, Candidate[]>();
export const challengeMonth = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 7);
const validMonth = (month: string) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);

/** Frozen candidates and seeded ordering keep the common monthly roster stable across restart/update. */
function rosterWithLimit(month: string, legendLimit: 2 | 3): readonly Candidate[] {
	if (!validMonth(month)) throw new Error('月份无效。');
	const cacheKey = `${month}:${legendLimit}`;
	if (cache.has(cacheKey)) return cache.get(cacheKey)!;
	let seed = createHash('sha256').update(`rogue-monthly-v1:${month}`).digest().readUInt32LE(0) || 1;
	const random = (max: number) => {
		seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
		return (seed >>> 0) % max;
	};
	const pool = [...MONTHLY_CANDIDATES_V1];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = random(i + 1);
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	const allTypes = [...new Set(pool.flatMap(entry => entry.types))];
	let visits = 0;
	const search = (
		chosen: Candidate[], covered: Set<string>, families: Set<string>, legends: number
	): Candidate[] | undefined => {
		if (++visits > 20000) return;
		const missing = allTypes.filter(type => !covered.has(type));
		if (Math.ceil(missing.length / 2) > 10 - chosen.length) return;
		const available = pool.filter(entry => !families.has(family(entry)) && (!entry.legendary || legends < legendLimit));
		if (!missing.length) {
			for (const entry of available) {
				if (chosen.length === 10) return chosen;
				if (families.has(family(entry)) || entry.legendary && legends >= legendLimit) continue;
				chosen.push(entry); families.add(family(entry)); legends += Number(entry.legendary);
			}
			return chosen.length === 10 ? chosen : undefined;
		}
		const rarest = missing.sort((a, b) => available.filter(e => e.types.includes(a)).length -
			available.filter(e => e.types.includes(b)).length)[0];
		const candidates = available.filter(e => e.types.includes(rarest)).sort((a, b) =>
			b.types.filter(type => !covered.has(type)).length - a.types.filter(type => !covered.has(type)).length);
		for (const entry of candidates) {
			const result = search([...chosen, entry], new Set([...covered, ...entry.types]),
				new Set([...families, family(entry)]), legends + Number(entry.legendary));
			if (result) return result;
		}
	};
	const result = search([], new Set(), new Set(), 0);
	if (!result) throw new Error('本月挑战名单生成失败，请保留进度并联系管理员。');
	if (cache.size >= 36) cache.delete(cache.keys().next().value!);
	cache.set(cacheKey, result);
	return result;
}

export function monthlyRoster(month = challengeMonth()): readonly Candidate[] {
	return rosterWithLimit(month, 2);
}

/** A rule update must not erase already completed/claimed entries from the prior roster. */
function visibleRoster(account: RogueAccount, month: string) {
	const current = monthlyRoster(month);
	const retired = rosterWithLimit(month, 3).filter(entry => !current.some(now => now.id === entry.id) &&
		(account.monthlyChallenges?.[month]?.entries[entry.id]?.best ?? -1) >= 0);
	return [
		...current.map(entry => ({ ...entry, retired: false })), ...retired.map(entry => ({ ...entry, retired: true })),
	];
}

/** Called only by the real solo/co-op tower-clear settlement, never a client-supplied result. */
export function recordMonthlyClear(account: RogueAccount, run: RogueRun, now = Date.now()) {
	if (run.monthlyClearRecorded || run.floor !== 200 || run.phase !== 'complete' || run.difficultyTest ||
		typeof run.difficulty !== 'number' || !Number.isInteger(run.difficulty) ||
		run.difficulty < 0 || run.difficulty > 5) return;
	run.monthlyClearRecorded = true;
	const keys = new Set(run.team.filter(mon => !mon.egg && !mon.nuzlockeDead)
		.map(mon => firstClearSpeciesKey(mon.set.species)));
	const month = challengeMonth(now);
	const matches = monthlyRoster(month).filter(entry => entry.eligible.some(key => keys.has(key)));
	if (!matches.length) return;
	const state = (account.monthlyChallenges ||= {})[month] ||= { version: 1, entries: {} };
	for (const entry of matches) {
		const progress = state.entries[entry.id] ||= { best: -1, claimed: -1 };
		progress.best = Math.max(progress.best, run.difficulty);
	}
	(run.notices ||= []).push(`本月 ${matches.length} 项宝可梦挑战已更新，可在“每月挑战”领取奖励。`);
}

export function claimMonthlyChallenge(account: RogueAccount, value: string) {
	const parts = value.split('|'), [month, id] = parts;
	if (parts.length !== 2 || !validMonth(month) || !visibleRoster(account, month).some(entry => entry.id === id)) {
		throw new Error('挑战选项无效。');
	}
	const progress = account.monthlyChallenges?.[month]?.entries[id];
	if (!progress || progress.best <= progress.claimed) throw new Error('没有可领取的挑战奖励。');
	if (!Number.isInteger(progress.best) || !Number.isInteger(progress.claimed) || progress.best < 0 ||
		progress.best > 5 || progress.claimed < -1) throw new Error('挑战进度无效，请联系管理员。');
	const points = progress.claimed < 0 ? 10 : 0;
	const echo = progress.best - Math.max(0, progress.claimed);
	if (!Number.isSafeInteger(account.points + points)) throw new Error('成长点数已达上限。');
	if (echo && (!Number.isSafeInteger((account.echo?.points || 0) + echo) ||
		!Number.isSafeInteger((account.echo?.earned || 0) + echo))) throw new Error('崩坏适性已达上限。');
	account.points += points;
	if (echo) {
		account.echo ||= { unlocked: true, points: 0, earned: 0, upgrades: emptyEchoUpgrades() };
		account.echo.unlocked = true; account.echo.points += echo; account.echo.earned += echo;
	}
	progress.claimed = progress.best;
}

export function monthlyChallengeView(account: RogueAccount, now = Date.now()) {
	const month = challengeMonth(now);
	const [year, monthNumber] = month.split('-').map(Number);
	const refreshAt = Date.UTC(year, monthNumber, 1) - 8 * 3600000;
	const pendingMonths = Object.keys(account.monthlyChallenges || {}).filter(key => key !== month &&
		validMonth(key) && Object.values(account.monthlyChallenges![key].entries).some(entry => entry.best > entry.claimed));
	const months = [month, ...pendingMonths.sort().reverse()];
	return { month, refreshAt, months: months.map(key => ({ month: key, entries: visibleRoster(account, key).map(entry => ({
		id: entry.id, species: entry.species, types: entry.types, legendary: entry.legendary,
		retired: entry.retired,
		best: account.monthlyChallenges?.[key]?.entries[entry.id]?.best ?? -1,
		claimed: account.monthlyChallenges?.[key]?.entries[entry.id]?.claimed ?? -1,
	})) })) };
}
