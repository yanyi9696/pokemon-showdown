/**
 * Keep the selected first pair as the two Multi leads, with alternating reserves.
 * The simulator concatenates p2 then p4 for capture/star IDs, so return that order's original
 * encounter indices as well. Existing checkpoints retain their own serialized partition.
 */
export function splitCoopOpponents<T>(
	team: readonly T[], originalSlots = team.map((_, index) => index), order = team.map((_, index) => index),
) {
	if (originalSlots.length !== team.length || new Set(originalSlots).size !== team.length ||
		originalSlots.some(index => !Number.isSafeInteger(index) || index < 0)) {
		throw new Error('联机对手队伍与原始编号不一致。');
	}
	if (order.length !== team.length || new Set(order).size !== team.length ||
		order.some(index => !Number.isInteger(index) || index < 0 || index >= team.length)) {
		throw new Error('联机对手首发顺序不是完整队伍排列。');
	}
	const first: T[] = [], second: T[] = [];
	const firstSlots: number[] = [], secondSlots: number[] = [];
	for (const [index, original] of order.entries()) {
		const pokemon = team[original];
		(index % 2 ? second : first).push(pokemon);
		(index % 2 ? secondSlots : firstSlots).push(originalSlots[original]);
	}
	return { first, second, opponentSlots: [...firstSlots, ...secondSlots], opponentOffset: first.length };
}
