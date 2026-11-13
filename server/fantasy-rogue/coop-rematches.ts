import { randomUUID } from 'crypto';
import type { RogueRun, RogueAccount, RogueContent } from './types';
import type { RogueRandom } from './biome-pools';
import { deferCompanionChallenge, opposingCompanion, eligibleRematches, sharedRematches,
	prepareRematch, rematchView, chooseRematch, settleRematch } from './companion-rematches';

/** One travelling trainer may offer both players the same later rematch after a genuine loss. */
export function deferCoopCompanionChallenge(runs: RogueRun[]) {
	if (runs.length !== 2) return false;
	const node = runs[0].node, encounter = node?.encounters[runs[0].encounter];
	if (!node || !encounter || node.challenge || node.event?.police || node.event?.rematch ||
		node.event?.id === 'travel') return false;
	const companion = runs.map(run => opposingCompanion(run, encounter.trainer)).find(Boolean);
	if (!companion) return false;
	for (const run of runs) {
		if (run.floor !== runs[0].floor || run.encounter !== runs[0].encounter ||
			JSON.stringify(run.node) !== JSON.stringify(node)) throw new Error('共同切磋记录不一致，请刷新后重试。');
	}
	// Clone before either native settlement zeroes the node reward.
	for (const run of runs) run.node = structuredClone(node);
	for (const run of runs) {
		deferCompanionChallenge(run, companion);
		for (const page of run.dialogue?.pages || []) {
			(run.notices ||= []).push(`${page.speaker || page.title}：${page.text}`);
		}
	}
	return true;
}

export function beginCoopRematch(runs: RogueRun[]) {
	const debt = sharedRematches(runs)[0];
	if (!debt) throw new Error('当前没有双方可共同补领的延期切磋。');
	const owner = runs.find(run => eligibleRematches(run).some(entry => entry.id === debt.id))!;
	const presentation = { ...owner, rematches: [debt], node: structuredClone(owner.node!) };
	presentation.node.event = { id: 'companionrematch', key: randomUUID(), stage: 'choice' };
	prepareRematch(presentation);
	presentation.node.event.result = [
		...(presentation.dialogue?.pages || []).map(page => `${page.speaker || page.title}：${page.text}`),
		...rematchView(presentation).paragraphs,
	];
	for (const run of runs) run.node = structuredClone(presentation.node);
	return presentation.node.event;
}

export function coopRematchView(run: RogueRun) {
	const debt = run.rematches?.find(entry => entry.id === run.node?.event?.rematch);
	return debt ? rematchView(run) : { paragraphs: ['切磋记录已变化，请共同确认后继续旅程。'], options: [] };
}

export function coopRematchOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (runs.length !== 2 || event?.id !== 'companionrematch' || !event.rematch || event.stage !== 'choice' ||
		event.settled || runs.some(run => run.node?.event?.key !== event.key || run.node.event.id !== event.id ||
			run.node.event.rematch !== event.rematch || run.node.event.stage !== 'choice' || run.node.event.settled)) return [];
	if (!sharedRematches(runs).some(debt => debt.id === event.rematch)) {
		return [{ id: 'close', name: '切磋条件已变化，继续旅程', text: '保留未领取的记录，本次不重复发奖。', disabled: false }];
	}
	return rematchView(runs[0]).options;
}

export function chooseCoopRematch(runs: RogueRun[], choice: string) {
	if (!coopRematchOptions(runs).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同切磋记录已变化，请刷新后重选。');
	}
	const key = randomUUID();
	for (const run of runs) {
		if (choice === 'close') {
			run.node!.event!.stage = 'result'; run.node!.event!.settled = true;
			run.node!.event!.result = ['共同切磋条件已变化。本次不重复领取，其他未完成的切磋记录保留。'];
		} else {
			chooseRematch(run, choice);
		}
		run.node!.event!.key = key;
	}
	if (choice === 'accept') runs[1].node!.encounters = structuredClone(runs[0].node!.encounters);
}

export function settleCoopRematch(
	run: RogueRun, account: RogueAccount, won: boolean, content: RogueContent, random: RogueRandom
) {
	const debt = run.rematches?.find(entry => entry.id === run.node!.event!.rematch);
	if (!debt || debt.claimed) throw new Error('延期奖励已领取或记录不存在。');
	if (won && debt.exclusiveItem) {
		// The common reward also belongs to the player without the item's matching species.
		(run.exclusiveItems ||= {})[debt.exclusiveItem] ||= { since: debt.floor, misses: 0, cooldown: 0 };
	}
	settleRematch(account, run, won, content, random);
	if (!Number.isSafeInteger(account.points) || account.points < 0 || !Number.isSafeInteger(run.money) || run.money < 0 ||
		Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
		throw new Error('延期切磋奖励超出可保存范围。');
	}
}
