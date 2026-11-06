import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { activityEligible, evolutionDojoMembers } from './journey-activities';
import { chooseEventOption, eventView, type EventID } from './events';

export const COOP_EVOLUTION_EVENTS = new Set<EventID>([
	'stonegate', 'invertedstars', 'peatmoon', 'unioncircle', 'evolutiondojo',
]);

/** Agree to visit together, then each owner chooses one eligible personal target. */
export function coopEvolutionOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (runs.length !== 2 || !event || !COOP_EVOLUTION_EVENTS.has(event.id) || runs.some(run =>
		run.node?.kind !== 'event' || run.node.event?.id !== event.id || run.node.event.key !== event.key ||
		run.node.event.stage !== 'choice' || run.node.event.settled || run.floor !== runs[0].floor)) return [];
	if (event.id === 'evolutiondojo') {
		const disabled = !runs.some(run => evolutionDojoMembers(run).length);
		return [
			{ id: 'lesson', name: '一起请教进化招式。', text: '各自选择自己的伙伴学习原本可学的招式；不会直接完成进化条件。', disabled },
			{ id: 'practice', name: '一起开始实战练习。', text: '共同双打，实际使用的招式与要害次数照常记录；获胜后双方各得一份谢礼。', disabled },
			{ id: 'leave', name: '今天先到这里。', text: '双方共同离开。', disabled: false },
		];
	}
	return [
		{ id: 'participate', name: '一起参与这次相遇。',
			text: '双方各选自己的伙伴完成一次进化条件；道具或金币由各自支付，没有合适伙伴可以跳过。',
			disabled: runs.every(run => !activityEligible(run, event.id)) },
		{ id: 'leave', name: '今天先到这里。', text: '双方共同离开。', disabled: false },
	];
}

export function beginCoopEvolution(
	entries: { run: RogueRun, account: RogueAccount }[], content: RogueContent, random: RogueRandom, choice: string
) {
	if (!coopEvolutionOptions(entries.map(entry => entry.run)).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同进化事件已变化，请刷新后重选。');
	}
	if (entries[0].run.node!.event!.id === 'evolutiondojo' && choice === 'practice') {
		const source = entries.find(entry => evolutionDojoMembers(entry.run).length)!;
		source.run.node!.event!.activity = { member: evolutionDojoMembers(source.run)[0].id };
		chooseEventOption(source.account, source.run, content, random, source.run.node!.event!.key, choice);
		delete source.run.node!.event!.activity.member;
		for (const { run } of entries) {
			run.node = structuredClone(source.run.node);
			run.encounter = 0;
			run.phase = 'ready';
		}
		return;
	}
	for (const { run, account } of entries) {
		const event = run.node!.event!;
		if (choice === 'leave') chooseEventOption(account, run, content, random, event.key, choice);
		else {
			// Each personal step has its own visit token, including actions performed by a delegate.
			event.key = randomUUID();
			event.activity = {};
		}
	}
}

/** The lesson branch only contains personal teaching. Starting practice requires a new common decision. */
export function coopEvolutionView(run: RogueRun) {
	const view = eventView(run);
	if (run.node?.event?.id !== 'evolutiondojo' || !view) return view;
	return { ...view, options: view.options?.filter(option => option.id !== 'practice') };
}
