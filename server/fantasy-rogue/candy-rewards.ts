import type { RogueRun } from './types';
import { availableGrowth, grantGrowth, growthPercent } from './growth';

const CANDIES = [['expcandyxl', 30000, 150], ['expcandyl', 10000, 100],
	['expcandym', 3000, 50], ['expcandys', 800, 30], ['expcandyxs', 100, 1]] as const;

export interface CandyReward {
	items: Record<string, number>;
	/** Saved with newly prepared rewards only. Basis points in both offense and defense. */
	candyTraining?: number;
}
export const candyExperience = (items: Record<string, number>) =>
	CANDIES.reduce((total, [id, xp]) => total + (items[id] || 0) * xp, 0);

export function candyItems(floor: number, experience: number) {
	const items: Record<string, number> = {};
	for (const [id, xp, from] of CANDIES) {
		if (floor < from) continue;
		const count = Math.floor(experience / xp);
		if (count) { items[id] = count; experience -= count * xp; }
	}
	return items;
}

/** Free variable rewards only: never call for releases, purchases or fixed blessing gifts. */
export function rebalanceCandyReward(floor: number, original: Record<string, number>): CandyReward {
	const experience = candyExperience(original);
	if (!experience) return { items: { ...original } };
	// Round the whole EXP budget, not each stack; a singleton XS is never deleted.
	const reduced = Math.max(100, Math.round(experience * (floor > 150 ? 0.9 : 0.96) / 100) * 100);
	const candyTraining = floor > 150 ? Math.floor(reduced / 10000) : 0;
	const items = { ...original };
	for (const [id] of CANDIES) delete items[id];
	Object.assign(items, candyItems(floor, reduced - candyTraining * 1000));
	return { items, ...(candyTraining ? { candyTraining } : {}) };
}

export const candyTrainingText = (amount: number) => amount ?
	`部分糖果转为训练心得：全队本局双攻、双防各永久 +${growthPercent(amount)}，后来加入的伙伴同样生效。` : '';

/** Pure preview; caps refund the unused conversion budget as candy instead of losing it. */
export function candyRewardPreview(run: RogueRun, reward: CandyReward) {
	const nominal = reward.candyTraining || 0;
	const amount = Math.min(availableGrowth(run, 'offense', nominal), availableGrowth(run, 'defense', nominal));
	const refund = (nominal - amount) * 1000;
	const items = { ...reward.items };
	for (const [id, count] of Object.entries(candyItems(run.floor, refund))) items[id] = (items[id] || 0) + count;
	const effect = [candyTrainingText(amount), refund ? `增幅接近上限，未转换的 ${refund} 点经验已保留为糖果。` : '']
		.filter(Boolean).join(' ');
	return { items, amount, effect };
}

/** Caller owns the existing claim/battle receipt guard and credits the returned item bundle. */
export function grantCandyTraining(run: RogueRun, reward: CandyReward) {
	const result = candyRewardPreview(run, reward);
	if (result.amount) {
		grantGrowth(run, 'offense', result.amount);
		grantGrowth(run, 'defense', result.amount);
	}
	if (result.effect) (run.notices ||= []).push(result.effect);
	return result;
}
