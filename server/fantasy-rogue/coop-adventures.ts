import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { chooseEventOption, eventView, type EventID } from './events';
import { fishingFrame, rollFishingReward, stepFishing, type SharedAdventureRoll } from './event-adventures';
import { sharedShinyEcho } from './coop-echo';

export const COOP_ADVENTURE_EVENTS = new Set<EventID>(['bandits', 'dice', 'fishing']);

export function coopAdventureOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (runs.length !== 2 || !event || !COOP_ADVENTURE_EVENTS.has(event.id) || runs.some(run =>
		run.node?.event?.id !== event.id || run.node.event.key !== event.key || run.node.event.stage !== event.stage ||
		run.node.event.settled || run.floor !== runs[0].floor ||
		JSON.stringify(run.node.event.fishing) !== JSON.stringify(event.fishing))) return [];
	const views = runs.map(run => eventView(run));
	return (views[0]?.options || []).flatMap(option => {
		const other = views[1]?.options?.find(entry => entry.id === option.id);
		if (!other) return [];
		const shared = { ...option, disabled: !!option.disabled || !!other.disabled };
		if (event.id === 'dice' && ['roll', 'buy'].includes(option.id)) {
			shared.text = '双方各自支付，得到同一结果；' + option.text;
		} else if (option.id === 'fishtap') {
			shared.disabled ||= fishingFrame(event.fishing!, Date.now()).progress >= 1 || event.fishing!.hits >= 6;
			shared.text = '任一方收线，共用浮标；一秒内重复点击只计一次。';
		} else if (option.id === 'fishfinish') {
			shared.disabled ||= fishingFrame(event.fishing!, Date.now()).progress < 1 && event.fishing!.hits < 6;
			shared.text = '鱼线收完后共同查看收获。';
		}
		return [shared];
	});
}

/** One public roll, with both personal payouts persisted in the surrounding session transaction. */
export function chooseCoopAdventure(
	entries: { run: RogueRun, account: RogueAccount, changeAccount: (update: (account: RogueAccount) => void) => void }[],
	content: RogueContent, random: RogueRandom, choice: string
) {
	const runs = entries.map(entry => entry.run), event = runs[0].node!.event!;
	if (!coopAdventureOptions(runs).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同事件进度或个人金币已变化，请刷新后重选。');
	}
	const now = Date.now(), oldKey = event.key, shared: SharedAdventureRoll = {};
	const loaded = runs.some(run => ownsBlessing(run.blessings, 'dice'));
	if (event.id === 'bandits' && choice === 'coin') shared.coin = loaded || random(2) === 0;
	if (event.id === 'dice' && choice === 'roll') shared.face = loaded ? 6 : random(6) + 1;
	if (event.id === 'fishing' && choice === 'fishstart') {
		shared.fishingState = { started: now, anchor: now, travel: 0, hits: 0, misses: 0, lastTap: 0,
			center: 0.35 + random(301) / 1000 };
	} else if (event.id === 'fishing' && ['fishtap', 'fishfinish'].includes(choice)) {
		shared.fishingState = structuredClone(event.fishing!);
		if (now < shared.fishingState.started || now < shared.fishingState.anchor) {
			throw new Error('服务器计时尚未恢复，请稍后重试。');
		}
		if (stepFishing(shared.fishingState, now, random, choice)) {
			const source = runs.find(run => run.blessings?.companions?.some(c => c.id === 'lana' && !c.away)) || runs[0];
			const preview = structuredClone(source);
			preview.echo = sharedShinyEcho(runs);
			preview.node!.event!.fishing = shared.fishingState;
			shared.fishingReward = rollFishingReward(preview, content, random);
		}
	}
	for (const { run, account, changeAccount } of entries) {
		if (run !== runs[0] && runs[0].node!.event!.stage === 'battle') {
			run.node = structuredClone(runs[0].node);
			run.encounter = 0; run.phase = 'ready';
		} else {
			const apply = (owner: RogueAccount) => chooseEventOption(owner, run, content, random,
				run.node!.event!.key, choice, undefined, undefined, undefined, { now, adventure: shared });
			if (shared.fishingReward?.kind === 'gift') changeAccount(apply);
			else apply(account);
		}
		if (!Number.isSafeInteger(run.money) || run.money < 0 ||
			Object.values(run.bag).some(value => !Number.isSafeInteger(value) || value < 0)) {
			throw new Error('共同事件奖励或消耗超出可保存范围。');
		}
	}
	const ongoingPull = event.id === 'fishing' && choice === 'fishtap' && runs[0].node!.event!.stage === 'choice';
	const key = ongoingPull ? oldKey : randomUUID();
	for (const run of runs) run.node!.event!.key = key;
}
