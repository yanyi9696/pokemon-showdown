import { experienceYield } from '../../sim/fantasy-rogue-rules';
import type { RogueRun } from './types';
import { ELITE_BOSS_FLOORS } from './content';
import { mentorCardProfile, type MentorCard } from '../../sim/rogue-mentor';
export type { MentorCard } from '../../sim/rogue-mentor';

/** Random candy shops retain the larger inventory; ordinary centers offer a smaller quota. */
export const CANDY_SHOP: Record<string, { floor: number, price: number, stock: number }> = {
	expcandyxs: { floor: 1, price: 80, stock: 20 },
	expcandys: { floor: 30, price: 380, stock: 12 },
	expcandym: { floor: 50, price: 1350, stock: 8 },
	expcandyl: { floor: 100, price: 4200, stock: 6 },
	expcandyxl: { floor: 150, price: 12000, stock: 4 },
};

export const candyAtFloor = (floor: number) =>
	floor < 30 ? 'expcandyxs' : floor < 50 ? 'expcandys' : floor < 100 ? 'expcandym' : floor < 150 ? 'expcandyl' : 'expcandyxl';

/** A shallow midgame dip, then a smooth rise; no sudden windfall at a grade boundary. */
export const candyRewardScale = (floor: number) => floor < 30 ? 1 - Math.max(0, floor - 25) * 0.024 : floor <= 50 ? 0.88 :
	0.88 + Math.min(0.72, (floor - 50) * 0.0048);
export const lateCoinMultiplier = (floor: number) => 1 + Math.min(0.45, Math.max(0, floor - 50) * 0.003);

/** One current grade per center. No advance unlocks and no free pre-boss experience. */
export function restCandyOffer(floor: number) {
	const id = candyAtFloor(floor), step = Math.min(3, Math.floor((floor - CANDY_SHOP[id].floor) / 10));
	const stock = id === 'expcandyxs' ? 4 + step * 2 : id === 'expcandys' ? 3 + step :
		id === 'expcandym' ? 2 + step : id === 'expcandyl' ? 1 + step : 1 + Math.floor(step / 2);
	return { id, stock, price: CANDY_SHOP[id].price };
}

/** Pay a smooth EXP budget using only candy grades available on this floor. */
export function routeCandyReward(floor: number, kind: 'elite' | 'trainer' | 'reward') {
	const f = Math.max(1, Math.min(200, floor));
	const multiplier = (kind === 'trainer' ? 1.6 : kind === 'reward' ? 0.2 : 1) * (0.8 + 0.2 * Math.min(1, (f - 1) / 59));
	let remaining = Math.max(100, Math.round((200 + 3 * f * f) * multiplier * 0.85 * candyRewardScale(f) / 100) * 100);
	const result: Record<string, number> = {};
	for (const [id, xp] of [['expcandyxl', 30000], ['expcandyl', 10000], ['expcandym', 3000], ['expcandys', 800], ['expcandyxs', 100]] as const) {
		if (CANDY_SHOP[id].floor > f) continue;
		const count = Math.floor(remaining / xp);
		if (count) { result[id] = count; remaining -= count * xp; }
	}
	return result;
}
// Money grows more slowly than EXP: clean victories should not finance unlimited training.
export const earlyCoinMultiplier = (floor: number) => (1 + Math.max(0, Math.min(30, 60 - floor)) / 120) * lateCoinMultiplier(floor);
export const eliteTreasureBudget = (floor: number) => Math.floor((200 + 20 * floor) * 0.9 * earlyCoinMultiplier(floor) / 150) * 150;
export const encounterCoins = (floor: number) => Math.round((700 + 45 * floor) * 0.95 * earlyCoinMultiplier(floor) / 50) * 50;
export const eventBaseBudget = (floor: number) => (350 + 20 * floor + 0.15 * floor * floor) * 0.9;
export const eventRewardBudget = (floor: number) => eventBaseBudget(floor) * earlyCoinMultiplier(floor);
export const eventCost = (floor: number, multiplier = 1) => Math.round(eventBaseBudget(floor) * multiplier / 50) * 50;

export const MENTOR_CARDS = {
	attack: mentorCardProfile('attack'),
	guard: mentorCardProfile('guard'),
	balanced: mentorCardProfile('balanced'),
};
export const mentorTier = (floor: number) => ELITE_BOSS_FLOORS.has(floor) ? 'elite' as const : 'gym' as const;
export const mentorCardAtFloor = (kind: MentorCard, floor: number) => mentorCardProfile(kind, mentorTier(floor));
export const emergencyCost = (floor: number) => Math.ceil((1800 + 45 * floor) / 100) * 100;

/** Living eligible reserves receive half EXP throughout the tower. */
export function towerExperience(
	base: number, defeatedLevel: number, recipientLevel: number, participated: boolean, _floor: number,
	ordinaryWildKO = false, ordinaryWildCapture = false
) {
	return Math.floor(experienceYield(base, defeatedLevel, recipientLevel, participated) *
		1.15 * (ordinaryWildKO ? 1.375 : ordinaryWildCapture ? 1.1 : 1));
}

/** Kept for old callers: the mentor now offers a temporary card instead of supplies. */
export function mentorSupplies(_run: RogueRun) {
	return {} as Record<string, number>;
}

/** No extra payout for leaving, losing, negative outcomes or the memory-only travel battle. */
export function grantEventTraining(run: RogueRun) {
	const event = run.node?.event;
	if (!event?.settled || event.trainingAidGranted || event.trainingAidBlocked) return;
	event.trainingAidGranted = true;
	const coins = Math.round((75 + 4 * run.floor + 0.02 * run.floor * run.floor) * (event.trainingAidBattleWin ? 1.5 : 1) * 0.9 * earlyCoinMultiplier(run.floor) / 50) * 50;
	run.money += coins;
	if (run.lastReward?.floor !== run.floor) {
		run.lastReward = { floor: run.floor, name: run.node!.name, money: 0, items: {}, points: 0 };
	}
	run.lastReward.money += coins;
}
