import type { RogueAccount, RogueContent, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { auctionView, beginAuction, type RogueAuction } from './auction';
import { neededExclusiveItems } from './exclusive-items';
import { chooseEventOption } from './events';

export interface CoopAuction {
	state: RogueAuction;
	/** Lot index to the actual buyer, never an inferred viewer or current controller. */
	buyers: Record<number, string>;
}
type AuctionEntry = { userid: string, run: RogueRun };

export function auctionRoute(node?: RogueNode) {
	return node?.kind === 'trade' && node.trade?.kind === 'auction';
}

export function beginCoopAuction(entries: AuctionEntry[], content: RogueContent, random: RogueRandom) {
	const wanted = [...new Map(entries.flatMap(({ run }) => neededExclusiveItems(run))
		.map(item => [item.id, item])).values()];
	const combined = structuredClone(entries[0].run);
	combined.team = structuredClone(entries.flatMap(({ run }) => run.team));
	beginAuction(combined, content, random, wanted);
	return { auction: { state: combined.auction!, buyers: {} } as CoopAuction, event: combined.node!.event! };
}

export function coopAuctionOptions(entries: AuctionEntry[], auction: CoopAuction) {
	if (entries.length !== 2 || entries.some(({ run }) => !auctionRoute(run.node) ||
		run.node?.event?.id !== 'auction' || run.node.event.settled || run.floor !== auction.state.floor)) return [];
	return auctionView({ ...entries[0].run, auction: auction.state }).options.flatMap(option => {
		if (!['bid', 'jump'].includes(option.id)) return [option];
		return entries.map(({ userid, run }, index) => {
			const own = auctionView({ ...run, auction: auction.state }).options.find(entry => entry.id === option.id)!;
			return { ...own, id: `${option.id}:${userid}`, name: `${index + 1}P · ${own.name}`,
				text: `共同确认后由 ${index + 1}P 报价；若成交，仅 ${index + 1}P 付款并获得拍品。` };
		});
	});
}

export function coopAuctionView(entries: AuctionEntry[], auction: CoopAuction) {
	const base = auctionView({ ...entries[0].run, auction: auction.state });
	const seat = (userid: string) => `${entries.findIndex(entry => entry.userid === userid) + 1}P`;
	const catalog = auction.state.lots.map((lot, index) => `${index + 1}. 【${lot.item.name}】` +
		(auction.buyers[index] ? `（${seat(auction.buyers[index])} 已拍得）` : lot.winner !== undefined ? '（已落槌）' : '')).join('；');
	return { paragraphs: base.paragraphs, options: [], auction: { ...base.auction, catalog,
		wallets: entries.map(({ userid, run }) => ({ name: seat(userid), budget: run.money })),
	} };
}

/** Resolve one agreed step through the native NPC auction, using only the named buyer's wallet. */
export function settleCoopAuction(
	entries: (AuctionEntry & { account: RogueAccount })[], auction: CoopAuction,
	content: RogueContent, random: RogueRandom, choice: string
) {
	if (!coopAuctionOptions(entries, auction).some(option => option.id === choice && !option.disabled)) {
		throw new Error('拍卖报价、付款人或余额已变化，请刷新后重选。');
	}
	const [action, owner] = choice.split(':');
	const actor = owner ? entries.find(entry => entry.userid === owner)! : entries[0];
	const run = actor.run, state = auction.state, index = state.index, moneyBefore = run.money;
	const logStart = state.log.length, label = owner ? `${entries.indexOf(actor) + 1}P` : '你们';
	run.auction = state;
	chooseEventOption(actor.account, run, content, random, run.node!.event!.key, action);
	const spent = moneyBefore - run.money;
	if (!Number.isSafeInteger(run.money) || run.money < 0 || !Number.isSafeInteger(spent) || spent < 0 ||
		Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
		throw new Error('拍卖成交金额或库存超出可保存范围。');
	}
	if (state.index > index && state.lots[index].winner === -1) {
		if (!owner || spent !== state.lots[index].price) throw new Error('拍卖成交付款人不一致。');
		auction.buyers[index] = owner;
	}
	for (let i = logStart; i < state.log.length; i++) state.log[i] = state.log[i].replace(/你/g, label);
	const event = run.node!.event!;
	if (event.result) event.result = event.result.map(line => line.replace(/你/g, label));
	for (const entry of entries) entry.run.node!.event = structuredClone(event);
	return { owner: actor.userid, spent };
}
