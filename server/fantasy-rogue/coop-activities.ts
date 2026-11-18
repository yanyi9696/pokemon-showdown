import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { activityEligible, beginJourneyActivity, journeyActivityView, relicMoveTypes } from './journey-activities';
import { beginExpedition, expeditionFee, rollIdentityQuestion, rollIdentityTeam } from './expedition-events';
import { chooseEventOption, eventView, type EventID } from './events';
import { syncExclusiveItems } from './exclusive-items';
import { giveEgg } from './eggs';
import { drawBlessingGift } from './blessings';
import { coopSafariTarget, settleCoopSafari } from './coop-safari';

export const COOP_ACTIVITY_BATTLES = new Set<EventID>(['duskbreeder', 'kubfumaster', 'repelwave']);

export const COOP_ACTIVITY_EVENTS = new Set<EventID>([
	'pokeflute', 'dittoshow', 'blackjack', 'grassegg', 'hatchhouse', 'identityquiz', 'relicpuzzle',
	...COOP_ACTIVITY_BATTLES,
	'safaripark',
]);

/** Initialize the common puzzle once, before copying it to the two personal event records. */
export function beginCoopActivity(run: RogueRun, random: RogueRandom) {
	if (!COOP_ACTIVITY_EVENTS.has(run.node!.event!.id)) return;
	beginJourneyActivity(run, random);
	beginExpedition(run);
}

export function coopActivityOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (event?.id === 'safaripark' && !coopSafariTarget(runs)) return [];
	if (event?.id === 'pokeflute' && (event.activity?.pattern?.length !== 3 ||
		event.activity.pattern.some(note => !['低音', '中音', '高音'].includes(note)))) return [];
	if (event?.id === 'dittoshow' && ![0, 1, 2].includes(event.activity?.index ?? -1)) return [];
	if (event && ['blackjack', 'grassegg', 'hatchhouse', 'identityquiz'].includes(event.id) && !event.expedition) return [];
	if (event?.id === 'relicpuzzle' && (!event.activity ||
		!Number.isInteger(event.activity.index ?? 0) || (event.activity.index || 0) < 0 ||
		(event.activity.index || 0) > 2)) return [];
	if (runs.length !== 2 || !event || !COOP_ACTIVITY_EVENTS.has(event.id) || runs.some(run =>
		run.node?.kind !== 'event' || run.node.event?.id !== event.id || run.node.event.key !== event.key ||
		run.node.event.stage !== 'choice' || run.node.event.settled || run.floor !== runs[0].floor ||
		JSON.stringify(run.node.event.activity) !== JSON.stringify(event.activity) ||
		JSON.stringify(run.node.event.expedition) !== JSON.stringify(event.expedition))) return [];
	const relicTypes = event.id === 'relicpuzzle' ? runs.flatMap(relicMoveTypes) : undefined;
	const views = runs.map(run => eventView(run, relicTypes));
	const choices = views.map((view, i) => [...(view?.options || []),
		...(event.id === 'dittoshow' ? journeyActivityView(runs[i]).picker?.options || [] : [])]);
	const partnerOptions = new Map(choices[1].map(option => [option.id, option]));
	return choices[0].flatMap(option => {
		if (event.id === 'safaripark' && option.id === 'ball') return [];
		const partner = partnerOptions.get(option.id);
		if (!partner) return [];
		const shared = { ...option, disabled: !!option.disabled || !!partner.disabled };
		if (COOP_ACTIVITY_BATTLES.has(event.id) && option.id === 'accept') {
			shared.disabled ||= !runs.some(run => activityEligible(run, event.id));
			shared.name = '一起接受考验。';
			shared.text = event.id === 'repelwave' ? '共同双打，在八回合内获胜；双方各获一份谢礼。' :
				'共同双打，获胜后双方各获一位伙伴；每人每局仅领取一次。';
		} else if (event.id === 'identityquiz' && option.id === 'enter') {
			shared.name = `双方各付 ${expeditionFee(runs[0])} 金币，共同报名。`;
			shared.text = '各自支付原报名费，共同抽一道题并回答；奖励分别领取。';
		} else if (event.id === 'relicpuzzle' && option.id.startsWith('type:')) {
			shared.text = '任一方仍拥有掌握该属性招式的伙伴，即可共同选择。';
		}
		return [shared];
	});
}

/** Both receive the same free partner offer, with separate IDs, join order and personal stat boosts. */
export function rollCoopActivityGift(runs: RogueRun[], content: RogueContent, random: RogueRandom) {
	const event = runs[0]?.node?.event;
	if (!event || !['duskbreeder', 'kubfumaster'].includes(event.id)) return undefined;
	const recipient = runs.find(run => !run.activityClaims?.includes(event.id));
	if (!recipient) return undefined;
	return drawBlessingGift(structuredClone(recipient), content, random, {
		eliteIVs: false, species: event.id === 'duskbreeder' ? 'Rockruff-Dusk' : 'Kubfu',
		level: Math.max(3, Math.min(100, Math.ceil(recipient.floor / 2))),
	});
}

/** Apply each player's native costs, rewards and companion effects after the common choice. */
export function settleCoopActivity(
	entries: { run: RogueRun, account: RogueAccount, changeAccount?: (update: (account: RogueAccount) => void) => void }[],
	content: RogueContent, random: RogueRandom, choice: string
) {
	if (!coopActivityOptions(entries.map(entry => entry.run)).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同活动进度已变化，请刷新后重选。');
	}
	if (entries[0].run.node!.event!.id === 'safaripark') {
		settleCoopSafari(entries, content, random, choice);
		return;
	}
	const key = randomUUID();
	// Roll the shared reward once without advancing either owner's join counter or granting an unlock.
	const sharedEgg = entries[0].run.node!.event!.id === 'grassegg' && choice === 'egg' ?
		giveEgg(structuredClone(entries[0].run), content, random, '草丛里的宝可梦蛋') : undefined;
	const eventId = entries[0].run.node!.event!.id;
	const activityContext = {
		quiz: eventId === 'identityquiz' ? {
			question: choice === 'enter' ? rollIdentityQuestion(entries[0].run, random) : undefined,
			team: choice === 'fight' ? rollIdentityTeam(entries[0].run, random) : undefined,
		} : undefined,
		relicTypes: eventId === 'relicpuzzle' ? entries.flatMap(entry => relicMoveTypes(entry.run)) : undefined,
	};
	for (const { run, account, changeAccount } of entries) {
		const apply = (owner: RogueAccount) =>
			chooseEventOption(owner, run, content, random, run.node!.event!.key, choice,
				undefined, undefined, sharedEgg, activityContext);
		if (COOP_ACTIVITY_BATTLES.has(eventId) && choice === 'accept' && run !== entries[0].run) {
			// Generate one encounter, then keep both personal event records on that battle.
			run.node = structuredClone(entries[0].run.node);
			run.encounter = 0;
			run.phase = 'ready';
		} else if (run.node!.event!.id === 'hatchhouse' && choice === 'hatch') {
			if (!changeAccount) throw new Error('孵化必须与玩家解锁记录一同保存。');
			changeAccount(apply);
		} else {
			apply(account);
		}
		if (!Number.isSafeInteger(run.money) || run.money < 0 ||
			Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
			throw new Error('共同活动奖励超出可保存范围。');
		}
		syncExclusiveItems(run);
		// Native actions rotate keys independently. Publish one key for this common step.
		run.node!.event!.key = key;
	}
}
