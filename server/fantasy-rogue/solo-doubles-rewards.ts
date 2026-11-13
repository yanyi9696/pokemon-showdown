import type { RogueItem, RogueRun } from './types';

/** Solo Latios supports raising a larger party; co-op always keeps its existing shared payouts. */
export function soloDoublesExperience(run: Pick<RogueRun, 'spirit' | 'doubleBattle'>, cooperative = false) {
	return !cooperative && run.doubleBattle && run.spirit === 'latios' ? 1.35 : 1;
}

/** Pay the extra quarter as coins: never round a single rare item up into a duplicate. */
export function soloDoublesCoins(
	run: Pick<RogueRun, 'spirit' | 'doubleBattle'>,
	reward: { money?: number, items?: Record<string, number> }, items: RogueItem[], cooperative = false
) {
	if (soloDoublesExperience(run, cooperative) === 1) return 0;
	let value = Math.max(0, reward.money || 0);
	for (const [id, count] of Object.entries(reward.items || {})) {
		const item = items.find(entry => entry.id === id && entry.kind === 'treasure');
		if (item) value += Math.max(0, count) * (item.sellPrice || 0);
	}
	return Math.floor(value / 4);
}
