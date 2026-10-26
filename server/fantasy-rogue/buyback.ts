import type { RogueContent, RogueItem, RogueRun } from './types';
import { inventoryItem } from './team';

export const BUYBACK_FLOOR = 80;
/** Special items have an explicit, floor-independent valuation, never an auction receipt. */
export function baseRecyclePrice(item: RogueItem): number {
	if (item.kind === 'treasure') return item.sellPrice || 600;
	if (item.price > 0) return item.price;
	if (item.kind === 'machine') return 2500;
	if (item.kind === 'mint') return 2000;
	if (item.kind === 'emblem') return 4000;
	if (item.kind === 'tonic') return 3000;
	if (item.id === 'masterball' || item.kind === 'terashard') return 0;
	if (item.id === 'gmegawishingstar') return 8000;
	if (item.kind === 'held') return 5000;
	return 1000;
}
export function recycleOffers(run: RogueRun, content: RogueContent) {
	const fullPrice = run.node?.trade?.kind === 'buyback';
	return Object.keys(run.bag).filter(id => run.bag[id] > 0).map(id => inventoryItem(content, id))
		.filter((item): item is RogueItem => !!item && item.id !== 'masterball' && item.kind !== 'terashard' && (fullPrice || item.kind === 'treasure'))
		.map(item => {
			const premium = run.node?.trade?.kind === 'mushroom' && item.id.endsWith('mushroom');
			return { ...item, recyclePrice: fullPrice ? baseRecyclePrice(item) :
				Math.floor((item.sellPrice || 0) * (premium ? 1.25 : 1)) };
		});
}
export function recycleItems(run: RogueRun, content: RogueContent, id: string, count?: number) {
	if (run.phase !== 'rest') throw new Error('只能在商店回收物品。');
	const items = recycleOffers(run, content).filter(item => id === 'all' || id === item.id);
	if (!items.length) throw new Error('没有可兑换的物品。');
	if (count !== undefined && (items.length !== 1 || !Number.isSafeInteger(count) ||
		count <= 0 || count > run.bag[items[0].id])) {
		throw new Error('兑换数量无效。');
	}
	const money = items.reduce((sum, item) => sum + (count ?? run.bag[item.id]) * item.recyclePrice, 0);
	if (!Number.isSafeInteger(money) || !Number.isSafeInteger(run.money + money)) throw new Error('回收金额无效。');
	for (const item of items) run.bag[item.id] -= count ?? run.bag[item.id];
	run.money += money;
	run.notices = [`物品回收完成，获得 ${money} 金币。`];
}
