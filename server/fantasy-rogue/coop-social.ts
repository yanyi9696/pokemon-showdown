import type { AffectionRewards } from './affection';
import { randomUUID } from 'crypto';
import type { RogueRun, RogueContent, RogueAccount } from './types';
import type { RogueRandom } from './biome-pools';
import { beginSocialEvent, socialCandidates, socialEventView } from './social-events';
import { chooseEventOption, settleEventBattle } from './events';
import { TRAVELLERS } from './traveller-profiles';
import { withSharedRewardRolls } from './shared-reward-rolls';

type Party = { run: RogueRun, account: RogueAccount };

function validateRewards(run: RogueRun) {
	if (!Number.isSafeInteger(run.money) || run.money < 0 ||
		Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
		throw new Error('同行奖励超出可保存范围。');
	}
}

export function beginCoopSocial(runs: RogueRun[], random: RogueRandom, rewards: AffectionRewards | undefined) {
	if (runs.length !== 2) throw new Error('共同相遇需要两位玩家。');
	const pool = socialCandidates(runs[0], runs.slice(1));
	if (!pool.length) throw new Error('当前没有双方均可遇见的同行训练家。');
	const visitor = pool[random(pool.length)].id;
	for (const run of runs) {
		run.node = structuredClone(run.node);
		// The session owns the shared encounter history; personal affinity receipts remain separate.
		run.eventHistory = [...(run.eventHistory || [])];
		if (!beginSocialEvent(run, random, visitor, rewards)) throw new Error('同行训练家状态已变化。');
		validateRewards(run);
	}
	// Preserve both parties' relationship-specific reunion lines in the shared conversation.
	const lines = [...new Set(runs.flatMap(run => (run.dialogue?.pages || []).map(page =>
		`${page.speaker || page.title}：${page.text}`)))];
	runs[0].node!.event!.result = lines;
	for (const run of runs.slice(1)) run.node = structuredClone(runs[0].node);
	return runs[0].node!.event!;
}

export function coopSocialOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (runs.length !== 2 || event?.id !== 'travellermeeting' || !event.social || event.stage !== 'choice' ||
		event.settled || runs.some(run => run.floor !== runs[0].floor || run.node?.event?.key !== event.key ||
			run.node.event.stage !== event.stage || run.node.event.settled || run.node.event.id !== event.id ||
			JSON.stringify(run.node.event.social) !== JSON.stringify(event.social))) return [];
	return socialEventView(runs[0]).options;
}

function synchronize(runs: RogueRun[]) {
	const key = randomUUID();
	for (const run of runs) {
		run.node!.event!.key = key;
		validateRewards(run);
	}
}

export function chooseCoopSocial(parties: Party[], content: RogueContent, random: RogueRandom, choice: string) {
	const runs = parties.map(entry => entry.run);
	if (!coopSocialOptions(runs).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同对话已变化，请刷新后重选。');
	}
	const social = runs[0].node!.event!.social!;
	const affinity = social.affinity + (TRAVELLERS[social.trainer].preference === choice ? 1 : 0);
	const gifts = ['potion', 'ether', 'oranberry'] as const;
	const socialGift = social.step === 'reply' && ['pokemon', 'reward'].includes(choice) && affinity < 2 ?
		gifts[random(gifts.length)] : undefined;
	const rolls = new Map<string, unknown>();
	for (const { run, account } of parties) {
		withSharedRewardRolls(run, rolls, () => chooseEventOption(account, run, content, random, run.node!.event!.key, choice,
			undefined, undefined, undefined, { socialGift }));
	}
	synchronize(runs);
	// Personal friendship and companion capacity never get copied from the host.
	if (runs[0].node!.event!.stage === 'battle') runs[1].node!.encounters = structuredClone(runs[0].node!.encounters);
}

export function settleCoopSocial(runs: RogueRun[], content: RogueContent, random: RogueRandom, won: boolean) {
	for (const run of runs) settleEventBattle(run, content, random, won, false);
	synchronize(runs);
}
