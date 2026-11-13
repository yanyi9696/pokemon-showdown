import type { AffectionRewards } from './affection';
import { randomUUID } from 'crypto';
import type { RogueContent, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { RIVALS, type RivalID } from './rival-data';
import { beginRival, chooseRival, expireRival, rivalRoutes, rivalView, settleRival } from './rivals';
import { travellingRoster } from './travellers';
import { rewardReceipt } from './events';
import { withSharedRewardRolls } from './shared-reward-rolls';

function sameProgress(runs: RogueRun[]) {
	if (runs.length !== 2 || runs[0].floor !== runs[1].floor) return false;
	const first = runs[0].rival;
	return runs.every(run => !first ? !run.rival : run.rival?.id === first.id &&
		run.rival.completed === first.completed && run.rival.lastFloor === first.lastFloor);
}

function validate(run: RogueRun) {
	if (!Number.isSafeInteger(run.money) || run.money < 0 ||
		Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
		throw new Error('共同劲敌奖励超出可保存范围。');
	}
}

/** Random world events are shared; personal affinity, milestones and invitations are not copied. */
function together(runs: RogueRun[], random: RogueRandom, apply: (run: RogueRun, shared: RogueRandom) => void) {
	const rolls: { max: number, value: number }[] = [];
	const itemRolls = new Map<string, unknown>();
	for (const run of runs) {
		let cursor = 0;
		withSharedRewardRolls(run, itemRolls, () => apply(run, max => {
			const roll = rolls[cursor] ||= { max, value: random(max) };
			cursor++;
			if (roll.max !== max) throw new Error('共同劲敌事件的随机步骤不一致。');
			return roll.value;
		}));
		validate(run);
	}
	const key = randomUUID();
	for (const run of runs) run.node!.event!.key = key;
	if (runs.every(run => run.node!.event!.stage === 'battle')) {
		runs[1].node!.encounters = structuredClone(runs[0].node!.encounters);
	}
}

export function coopRivalRoutes(runs: RogueRun[], nodes: RogueNode[], random: RogueRandom) {
	if (!sameProgress(runs)) return nodes;
	return rivalRoutes(runs[0], nodes, random);
}

export function beginCoopRival(runs: RogueRun[], random: RogueRandom, rewards: AffectionRewards | undefined) {
	if (!sameProgress(runs) || (runs[0].rival?.completed || 0) >= 8) {
		throw new Error('共同劲敌章节不一致或已经完成。');
	}
	if (!runs[0].rival) {
		const candidates = (Object.keys(RIVALS) as RivalID[]).filter(id => runs.every(run =>
			!travellingRoster(run).some(person => person.id === id) &&
			!run.blessings?.companions?.some(person => person.id === id)));
		const pool = candidates.flatMap(id =>
			Array.from({ length: runs.some(run => run.previousRival === id) ? 1 : 4 }, () => id));
		if (!pool.length) throw new Error('当前没有双方都可相遇的劲敌。');
		const id = pool[random(pool.length)];
		for (const run of runs) run.rival = { id, completed: 0, lastFloor: 0, affection: 0 };
	}
	together(runs, random, (run, shared) => {
		run.node = structuredClone(run.node!);
		run.node.kind = 'event';
		run.eventHistory = [...(run.eventHistory || [])];
		beginRival(run, shared, rewards);
		run.node.event!.result = (run.dialogue?.pages || []).map(page => `${page.speaker || page.title}：${page.text}`);
	});
}

export function coopRivalOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (!sameProgress(runs) || event?.id !== 'rivalstory' || !event.rival || runs.some(run =>
		run.node?.event?.id !== event.id || run.node.event.key !== event.key ||
		run.node.event.rival?.chapter !== event.rival!.chapter)) return [];
	const active = runs.filter(run => run.node!.event!.stage === 'choice' && !run.node!.event!.settled);
	if (!active.length) return [];
	const steps = new Set(active.map(run => run.node!.event!.rival!.step));
	if (steps.size !== 1 || active.length !== runs.length &&
		!['invite', 'carminefinal'].includes([...steps][0] || '')) return [];
	if (active.some(run =>
		JSON.stringify(run.node!.event!.rival) !== JSON.stringify(active[0].node!.event!.rival))) return [];
	return [...new Map(active.flatMap(run => rivalView(run).options).map(option => [option.id, option])).values()];
}

function personalChoice(run: RogueRun, choice: string) {
	const options = rivalView(run).options.map(option => option.id);
	if (options.includes(choice)) return choice;
	// The common invitation does not revoke a partner's existing companion or repeat a spent temporary invitation.
	if (choice === 'lusamine:join' && options.includes('lusamine:care')) return 'lusamine:care';
	if (run.node!.event!.rival!.step === 'invite') {
		if (choice === 'joinboth') {
			return options.includes('join') ? 'join' : options.includes('joincarmine') ? 'joincarmine' : 'solo';
		}
		if (['join', 'joincarmine'].includes(choice)) return 'solo';
	}
	throw new Error('个人劲敌分支已变化，请刷新后重选。');
}

export function chooseCoopRival(runs: RogueRun[], content: RogueContent, random: RogueRandom, choice: string) {
	if (!coopRivalOptions(runs).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同劲敌选项已变化，请刷新后重选。');
	}
	together(runs, random, (run, shared) => {
		if (run.node!.event!.settled) return;
		const before = { money: run.money, bag: { ...run.bag }, shards: run.blessings?.shards || 0 };
		chooseRival(run, content, shared, personalChoice(run, choice), random);
		rewardReceipt(run, before);
	});
}

/** False means an intermediate encounter: the controller must continue the saved battle sequence. */
export function settleCoopRival(
	runs: RogueRun[], random: RogueRandom, won: boolean, rewards: AffectionRewards | undefined
) {
	if (!sameProgress(runs) || runs.some(run => run.node?.event?.id !== 'rivalstory' ||
		run.node.event.stage !== 'battle' || run.node.event.settled || run.encounter !== runs[0].encounter ||
		run.node.event.rival?.chapter !== runs[0].node?.event?.rival?.chapter)) {
		throw new Error('共同劲敌战斗记录不一致。');
	}
	together(runs, random, (run, shared) => {
		const before = { money: run.money, bag: { ...run.bag }, shards: run.blessings?.shards || 0 };
		settleRival(run, shared, won, rewards);
		rewardReceipt(run, before);
	});
	return runs.every(run => run.node!.event!.stage !== 'battle');
}

export function expireCoopRivals(runs: RogueRun[], nextFloor: number) {
	for (const run of runs) {
		if (expireRival(run, nextFloor)) {
			for (const page of run.dialogue?.pages || []) (run.notices ||= []).push(`${page.speaker || page.title}：${page.text}`);
		}
		validate(run);
	}
}
