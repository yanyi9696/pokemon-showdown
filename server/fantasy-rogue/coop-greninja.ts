import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { chooseEventOption, rewardReceipt, type EventID } from './events';
import { greninjaEventEligible, grantGreninjaReturnGift } from './greninja-training';
import { recordStarterMoves } from './starter-traits';

export const COOP_GRENINJA_EVENTS = new Set<EventID>(['greninjatraining', 'greninjareturn']);
type Entry = {
	run: RogueRun, account: RogueAccount,
	changeAccount: (update: (account: RogueAccount) => void) => void,
};

export function coopGreninjaOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (runs.length !== 2 || !event || !COOP_GRENINJA_EVENTS.has(event.id) || runs.some(run =>
		run.node?.event?.id !== event.id || run.node.event.key !== event.key || run.node.event.stage !== 'choice' ||
		run.node.event.settled || run.floor !== runs[0].floor)) return [];
	const disabled = !runs.some(run => greninjaEventEligible(run, event.id));
	if (event.id === 'greninjareturn') return [{ id: 'welcome', name: '一起迎接修行伙伴归来。',
		text: '伙伴归原主人；满队先确认放生。双方各获智蛙 Z，并按原规则解锁 Z 招式。', disabled }];
	return [
		{ id: 'participate', name: '一起拜访甲贺忍蛙护林员。',
			text: '各自选择参加修行的幻想甲贺忍蛙；暂时离队至少五层，必须留下一位能出战的伙伴。', disabled },
		{ id: 'leave', name: '先保持现在的队伍，下次再来。', text: '共同离开，不派出伙伴。', disabled: false },
	];
}

export function chooseCoopGreninja(entries: Entry[], content: RogueContent, random: RogueRandom, choice: string) {
	if (!coopGreninjaOptions(entries.map(entry => entry.run)).some(option => option.id === choice && !option.disabled)) {
		throw new Error('护林员事件或修行伙伴已变化，请刷新后重选。');
	}
	for (const { run, account, changeAccount } of entries) {
		const event = run.node!.event!;
		if (choice === 'leave') {
			chooseEventOption(account, run, content, random, event.key, choice);
		} else if (event.id === 'greninjatraining') {
			event.key = randomUUID();
			if (!greninjaEventEligible(run, event.id)) Object.assign(event, {
				stage: 'result', settled: true, result: ['你暂时没有适合参加修行的伙伴，留下来等候队友决定。'],
			});
		} else if (greninjaEventEligible(run, event.id)) {
			const returning = run.greninjaTraining!.member!;
			changeAccount(owner => {
				chooseEventOption(owner, run, content, random, event.key, choice);
				recordStarterMoves(owner, content, returning.set, run);
			});
		} else {
			const before = { money: run.money, bag: { ...run.bag }, shards: run.blessings?.shards || 0 };
			grantGreninjaReturnGift(run);
			Object.assign(event, { stage: 'result', settled: true, result: [
				'队友的修行伙伴归来了。护林员也向你赠送【智蛙 Z】，并带来 Z 招式系统的赠礼。',
			] });
			rewardReceipt(run, before);
		}
		if (!Number.isSafeInteger(run.money) || run.money < 0 ||
			Object.values(run.bag).some(value => !Number.isSafeInteger(value) || value < 0)) {
			throw new Error('护林员赠礼超出可保存范围。');
		}
	}
}
