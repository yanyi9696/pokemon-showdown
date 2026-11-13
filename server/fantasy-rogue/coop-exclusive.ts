import { randomUUID } from 'crypto';
import type { RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { neededExclusiveItems, syncExclusiveItems, exclusiveEncounterChance } from './exclusive-items';
import { chooseExclusiveEvent, exclusiveEventView, prepareExclusiveEncounter } from './exclusive-events';
import { withSharedRewardRolls } from './shared-reward-rolls';

/** Each distinct missing item gets one entry, even when both parties need it. */
export function beginCoopExclusiveClue(runs: RogueRun[], random: RogueRandom) {
	const items = [...new Map(runs.flatMap(run => neededExclusiveItems(run)).map(item => [item.id, item])).values()];
	if (!items.length) throw new Error('双方当前没有需要寻找的专属道具。');
	return { id: 'exclusiveclue' as const, key: randomUUID(), stage: 'choice' as const,
		exclusive: { item: items[random(items.length)].id, answer: random(4), tried: [] } };
}

export function coopExclusiveOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (runs.length !== 2 || event?.id !== 'exclusiveclue' || !event.exclusive || runs.some(run =>
		run.floor !== runs[0].floor || run.node?.event?.id !== event.id || run.node.event.key !== event.key ||
		run.node.event.stage !== 'choice' || run.node.event.settled ||
		JSON.stringify(run.node.event.exclusive) !== JSON.stringify(event.exclusive))) return [];
	return exclusiveEventView(runs[0]).options;
}

export function chooseCoopExclusiveClue(runs: RogueRun[], content: RogueContent, random: RogueRandom, choice: string) {
	if (!coopExclusiveOptions(runs).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同线索已变化，请刷新后重选。');
	}
	const key = randomUUID();
	const rolls = new Map<string, unknown>();
	for (const [index, run] of runs.entries()) {
		const item = run.node!.event!.exclusive!.item;
		// Only create the partner's ledger entry on a successful find, not on a declined invitation.
		if (choice === `site:${run.node!.event!.exclusive!.answer}`) {
			(run.exclusiveItems ||= {})[item] ||= { since: run.floor, misses: 0, cooldown: 0 };
			syncExclusiveItems(run);
		}
		if (index && runs[0].node!.event!.stage === 'battle') {
			run.node = structuredClone(runs[0].node);
			run.encounter = 0; run.phase = 'ready';
		} else {
			withSharedRewardRolls(run, rolls, () => chooseExclusiveEvent(run, content, choice, random));
		}
		run.node!.event!.key = key;
		if (Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
			throw new Error('共同专属道具奖励超出可保存范围。');
		}
	}
}

/** One roll per shared trainer area, regardless of the number of items or players. */
export function beginCoopExclusiveEncounter(runs: RogueRun[], random: RogueRandom) {
	const candidates = runs.flatMap(run => neededExclusiveItems(run)
		.map(item => ({ run, item, chance: exclusiveEncounterChance(run, item.id) })).filter(entry => entry.chance > 0));
	if (!candidates.length) return false;
	const chance = Math.max(...candidates.map(entry => entry.chance));
	const best = [...new Map(candidates.filter(entry => entry.chance === chance)
		.map(entry => [entry.item.id, entry])).values()];
	const selected = best[random(best.length)], success = random(100) < chance;
	for (const entry of candidates) entry.run.exclusiveItems![entry.item.id].misses++;
	if (!success) return false;
	prepareExclusiveEncounter(selected.run, random, selected.item);
	for (const run of runs) {
		run.node = structuredClone(selected.run.node);
		// The co-op interaction controller treats the encounter's eventual result as an event visit.
		run.node!.kind = 'event'; run.encounter = 0;
	}
	return true;
}

export function prepareCoopExclusiveReward(run: RogueRun) {
	const item = run.node!.event!.exclusive!.item;
	(run.exclusiveItems ||= {})[item] ||= { since: run.floor, misses: 0, cooldown: 0 };
	syncExclusiveItems(run);
}
