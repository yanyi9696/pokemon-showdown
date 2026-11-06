import type { RogueAccount, RogueRun } from './types';

export const MAINLINE_CHAPTER_LENGTHS = [1, 3, 4, 4, 5, 5];
export interface MainlineProgress {
	version: 1;
	completed: string[];
	pity: Record<string, boolean>;
	/** Consecutive missed full clears; consumed when reserving the next eligible adventure. */
	missedClears?: Record<string, number>;
	identityRevealed?: boolean;
	endingPending?: boolean;
	endingSeen?: boolean;
	endingRun?: string;
}
export interface UnlockNotice { id: string; title: string; text: string }
export function mainlineProgress(account: RogueAccount): MainlineProgress {
	account.mainline ||= { version: 1, completed: [], pity: {} };
	return account.mainline;
}
export function chapterComplete(account: RogueAccount, tier: number) {
	return Array.from({ length: MAINLINE_CHAPTER_LENGTHS[tier] || 0 }, (_, i) => `s${tier}-${i + 1}`)
		.every(id => mainlineProgress(account).completed.includes(id));
}
export function nextMainlineScene(account: RogueAccount, tier: number): string | undefined {
	if (!MAINLINE_CHAPTER_LENGTHS[tier] || Array.from({ length: tier }, (_,
		i) => i).some(i => !chapterComplete(account, i))) return;
	return Array.from({ length: MAINLINE_CHAPTER_LENGTHS[tier] }, (_, i) => `s${tier}-${i + 1}`)
		.find(id => !mainlineProgress(account).completed.includes(id));
}
export function notifyUnlock(account: RogueAccount, id: string, title: string, text: string) {
	const notices = account.unlockNotices ||= [];
	if (!notices.some(n => n.id === id)) notices.push({ id, title, text });
}
/** Never revoke an existing unlock. Either requirement may be completed first. */
export function unlockStoryDifficulty(account: RogueAccount) {
	const progress = account.difficulties;
	if (!progress) return;
	while (progress.highest < 5 && progress.cleared.includes(String(progress.highest)) &&
		chapterComplete(account, progress.highest)) {
		progress.highest++;
		notifyUnlock(account, `difficulty:${progress.highest}`, `已解锁 ${progress.highest} 档冒险`,
			'上一档的通关与故事均已完成。下次出发前，可在局外成长中选择新的档位。');
	}
}
export const MAINLINE_CHANCE = { base: 30, perClear: 15, maximum: 75 };
export function mainlineChance(missedClears: number) {
	return Math.min(MAINLINE_CHANCE.maximum, MAINLINE_CHANCE.base + missedClears * MAINLINE_CHANCE.perClear);
}
/** Only the successful 200-floor settlement grants compensation, never a loss or abandonment. */
export function settleStoryPity(account: RogueAccount, run: RogueRun, cleared = false) {
	const reservation = run.mainline;
	if (!cleared || !reservation || reservation.pitySettled || run.floor !== 200 || run.difficulty === 'easy' ||
		run.difficultyTest) return;
	reservation.pitySettled = true;
	const progress = mainlineProgress(account), tier = String(run.difficulty || 0);
	progress.pity[tier] = false;
	(progress.missedClears ||= {})[tier] = reservation.offered ? 0 :
		Math.min(3, (reservation.missedClears || 0) + 1);
}
