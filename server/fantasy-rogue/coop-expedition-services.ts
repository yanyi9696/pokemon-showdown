import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { availableFossils, expeditionFee } from './expedition-events';
import { chooseEventOption, eventView, type EventID } from './events';
import { syncExclusiveItems } from './exclusive-items';

export const COOP_EXPEDITION_SERVICES = new Set<EventID>(['fossillab', 'snacks']);
type ServiceEntry = { userid: string, run: RogueRun };
type ServiceOption = {
	id: string, name: string, text: string, disabled: boolean, seat?: number,
	service?: 'fossil' | 'snack', pokemon?: string, items?: string[], price?: number,
};

/** Expose the original native service with an explicit payer/recipient and exact fossil recipe. */
export function coopExpeditionOptions(entries: ServiceEntry[]): ServiceOption[] {
	const event = entries[0]?.run.node?.event;
	if (entries.length !== 2 || !event || !COOP_EXPEDITION_SERVICES.has(event.id) || entries.some(({ run }) =>
		run.node?.kind !== 'event' || run.node.event?.id !== event.id || run.node.event.key !== event.key ||
		run.floor !== entries[0].run.floor || run.node.event.stage !== 'choice' || run.node.event.settled ||
		!run.node.event.expedition ||
		JSON.stringify(run.node.event.expedition) !== JSON.stringify(event.expedition))) return [];
	const options: ServiceOption[] = entries.flatMap(({ userid, run }, index) => {
		const seat = index + 1;
		return (eventView(run)?.options || []).filter(option => option.id !== 'leave').flatMap<ServiceOption>(option => {
			if (event.id === 'fossillab') {
				const recipe = availableFossils(run)[0];
				if (!recipe) return [];
				const [items, pokemon] = recipe;
				return [{ ...option, id: `restore:${userid}:${items.join('+')}`, seat, items: [...items], pokemon,
					service: 'fossil' as const, name: `${seat}P · 复活 ${pokemon}`,
					text: `共同确认后，由 ${seat}P 交付所示配方，新伙伴由该玩家接纳。` }];
			}
			const [action, target] = option.id.split(':');
			const pokemon = action === 'snackmon' ? run.team.find(mon => mon.id === target)?.set.species : undefined;
			return [{ ...option, id: [action, userid, target].filter(Boolean).join(':'), seat, pokemon,
				service: 'snack' as const, price: expeditionFee(run), name: `${seat}P · ${option.name}`,
				text: `共同确认后，仅 ${seat}P 支付，效果与回礼归该玩家。` + (pokemon ?
					'亲密度 +45，存活时恢复 15% 最大生命值；不会复活。' : '') }];
		});
	});
	options.push({ id: 'leave', name: '这次先继续赶路。', text: '', disabled: false });
	return options;
}

/** Spending is personal; shared consent and permanent fossil discovery commit in the caller's transaction. */
export function settleCoopExpedition(
	entries: (ServiceEntry & { account: RogueAccount, changeAccount: (update: (account: RogueAccount) => void) => void })[],
	content: RogueContent, random: RogueRandom, choice: string
) {
	if (!coopExpeditionOptions(entries).some(option => option.id === choice && !option.disabled)) {
		throw new Error('化石配方、点心目标或付款余额已变化，请刷新后重新选择。');
	}
	const [action, owner, target] = choice.split(':');
	const actor = owner ? entries.find(entry => entry.userid === owner)! : entries[0];
	const personalChoice = action === 'restore' || action === 'leave' || action === 'snackrival' ? action :
		`${action}:${target}`;
	for (const entry of owner ? [actor] : entries) {
		const apply = (account: RogueAccount) => chooseEventOption(account, entry.run, content, random,
			entry.run.node!.event!.key, personalChoice);
		if (action === 'restore') entry.changeAccount(apply);
		else apply(entry.account);
	}
	const resolved = actor.run.node!.event!, key = randomUUID();
	const result = owner ? [action === 'restore' ?
		`本次由 ${entries.indexOf(actor) + 1}P 交付化石，复活的伙伴归该玩家。` :
		`本次由 ${entries.indexOf(actor) + 1}P 购买点心，效果与回礼归该玩家。`, ...(resolved.result || [])] : resolved.result;
	for (const { run } of entries) {
		if (!Number.isSafeInteger(run.money) || run.money < 0 ||
			Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
			throw new Error('共同服务金额或库存超出可保存范围。');
		}
		syncExclusiveItems(run);
		Object.assign(run.node!.event!, { key, stage: resolved.stage, settled: resolved.settled,
			committed: resolved.committed, trainingAidBlocked: resolved.trainingAidBlocked,
			result: result && [...result] });
	}
}
