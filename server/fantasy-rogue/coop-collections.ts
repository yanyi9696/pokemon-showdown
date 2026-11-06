import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { collectionView, rewardFeatherObservation } from './collection-events';
import { normalizeBlessings } from './blessings';
import { syncExclusiveItems } from './exclusive-items';
import { chooseEventOption, rewardReceipt, type EventID } from './events';

export const COOP_COLLECTION_EVENTS = new Set<EventID>(['stones', 'feathers']);
type CollectionEntry = { userid: string, run: RogueRun };
type CollectionOption = {
	id: string, name: string, text: string, disabled: boolean, pokemon?: string, seat?: number,
};

/** Paid purchases name their owner; either party may supply a free observation target. */
export function coopCollectionOptions(entries: CollectionEntry[]): CollectionOption[] {
	const event = entries[0]?.run.node?.event;
	if (entries.length !== 2 || !event || !COOP_COLLECTION_EVENTS.has(event.id) || entries.some(({ run }) =>
		run.node?.kind !== 'event' || run.node.event?.id !== event.id || run.node.event.key !== event.key ||
		run.floor !== entries[0].run.floor || run.node.event.stage !== 'choice' || run.node.event.settled)) return [];
	const options: CollectionOption[] = entries.flatMap(({ userid, run }, index) => collectionView(run).options
		.filter(option => !['leave', 'stonefinish'].includes(option.id)).map(option => {
			if (option.id.startsWith('show:')) {
				const pokemon = run.team.find(mon => mon.id === option.id.slice(5))!.set.species;
				return { ...option, id: `show:${userid}:${option.id.slice(5)}`, pokemon, seat: index + 1,
					name: `展示 ${index + 1}P 的 ${pokemon}`, text: '双方各获得一份观察谢礼，本次来访只能领取一次。' };
			}
			const id = option.id.startsWith('stone:') ? `stone:${userid}:${option.id.slice(6)}` : `feathertrade:${userid}`;
			return { ...option, id, name: `${index + 1}P · ${option.name}`,
				text: `${option.text} 共同确认后，仅 ${index + 1}P 支付并获得购买的物品。` };
		}));
	const opened = entries.some(({ run }) => run.node!.event!.stonesOpened);
	options.push(event.id === 'stones' ? { id: 'stonefinish', name: opened ?
		'收好东西，结束赌石。' : '今天先不买。', text: '', disabled: false } :
		{ id: 'leave', name: '把这次机会留到下次。', text: '', disabled: false });
	return options;
}

/** Run the original single-player purchase once, and give free event gifts to both players. */
export function settleCoopCollection(
	entries: (CollectionEntry & { account: RogueAccount })[], content: RogueContent, random: RogueRandom, choice: string
) {
	if (!coopCollectionOptions(entries).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同收集事件的伙伴、付款人或库存已变化，请刷新后重选。');
	}
	const [action, owner, target] = choice.split(':');
	const actor = owner ? entries.find(entry => entry.userid === owner)! : entries[0];
	const personalChoice = action === 'show' ? `show:${target}` : action === 'stone' ? `stone:${target}` : action;
	chooseEventOption(actor.account, actor.run, content, random, actor.run.node!.event!.key, personalChoice);
	for (const entry of entries) {
		if (entry === actor) continue;
		if (!owner) {
			chooseEventOption(entry.account, entry.run, content, random, entry.run.node!.event!.key, personalChoice);
		} else if (action === 'show') {
			normalizeBlessings(entry.run);
			const before = { money: entry.run.money, bag: { ...entry.run.bag } };
			rewardFeatherObservation(entry.run);
			rewardReceipt(entry.run, before);
		}
	}
	const resolved = actor.run.node!.event!, key = randomUUID();
	const result = action === 'show' ? [resolved.result![0],
		'双方各得到一份观察谢礼，已分别放入背包与钱包。'] :
		owner ? [`本次由 ${entries.indexOf(actor) + 1}P 支付，开出或换得的物品归该玩家。`,
			...(resolved.result || [])] : resolved.result;
	for (const { run } of entries) {
		if (!Number.isSafeInteger(run.money) || run.money < 0 ||
			Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
			throw new Error('收集事件金额或库存超出可保存范围。');
		}
		syncExclusiveItems(run);
		// Progress and narrative are shared, but each player's companion effects and purchases stay personal.
		Object.assign(run.node!.event!, { key, stage: resolved.stage, settled: resolved.settled,
			result: result && [...result] });
	}
}
