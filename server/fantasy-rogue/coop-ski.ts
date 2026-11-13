import { randomUUID } from 'crypto';
import type { RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { chooseCollection, collectionView } from './collection-events';

export const skiInput = (choice: string) => ['skileft', 'skiright', 'skitick'].includes(choice);

export function coopSkiOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (runs.length !== 2 || event?.id !== 'skiing' || runs.some(run =>
		run.floor !== runs[0].floor || run.node?.event?.id !== 'skiing' ||
		run.node.event.key !== event.key || run.node.event.stage !== 'choice' || run.node.event.settled ||
		JSON.stringify(run.node.event.ski) !== JSON.stringify(event.ski))) return [];
	return collectionView(runs[0]).options;
}

/** One server clock and course; replay the same random stream for both personal rewards. */
export function chooseCoopSki(runs: RogueRun[], content: RogueContent, random: RogueRandom, choice: string) {
	if (!coopSkiOptions(runs).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同滑雪进度已变化，请刷新后重选。');
	}
	const now = Date.now(), key = randomUUID();
	const rolls: { max: number, value: number }[] = [];
	for (const [index, run] of runs.entries()) {
		let cursor = 0;
		chooseCollection(run, content, max => {
			if (!index) rolls.push({ max, value: random(max) });
			const roll = rolls[cursor++];
			if (roll?.max !== max) throw new Error('共同雪道生成不一致。');
			return roll.value;
		}, choice, now);
		if (!Number.isSafeInteger(run.money) || run.money < 0 ||
			Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
			throw new Error('滑雪奖励超出可保存范围。');
		}
		run.node!.event!.key = key;
	}
}
