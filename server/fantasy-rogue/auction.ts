import { randomUUID } from 'crypto';
import { Dex } from '../../sim/dex';
import type { RogueRun, RogueContent, RogueItem } from './types';
import type { RogueRandom } from './biome-pools';
import { neededExclusiveItems, syncExclusiveItems } from './exclusive-items';
import { machineMoves, premiumMachine, tradeItem } from './trading';
import { FANTASY_BLESSING_ITEMS } from '../../sim/rogue-blessing-data';

export interface RogueAuction {
	floor: number; entered: boolean; index: number;
	lots: { item: RogueItem, opening: number, step: number, price: number, leader: number, dropped: number[],
		talked: boolean, willingness: number[], winner?: number, }[];
	npcs: { name: string, budget: number, temperament: 'careful' | 'proud' | 'keen' }[];
	log: string[];
}
const dex = Dex.mod('gen9fantasy');
export function beginAuction(run: RogueRun, content: RogueContent, random: RogueRandom) {
	const wanted = neededExclusiveItems(run);
	const held = (id: string): RogueItem => ({
		id, name: dex.items.get(id).name, kind: 'held', price: 0, shopFloor: false, icon: id,
	});
	const ids = [...new Set([...FANTASY_BLESSING_ITEMS, 'lifeorb', 'choiceband', 'choicespecs', 'choicescarf',
		'leftovers', 'assaultvest', 'heavydutyboots', 'eviolite'])].filter(id => dex.items.get(id).exists);
	const pool: RogueItem[] = ids.map(held);
	pool.push(...[...new Set(run.team.flatMap(machineMoves))].filter(premiumMachine).map(id => tradeItem(`roguetm${id}`)!));
	const selected: RogueItem[] = wanted.length ? [held(wanted[random(wanted.length)].id)] : [];
	const count = 3 + random(3);
	while (selected.length < count && pool.length) {
		const item = pool.splice(random(pool.length), 1)[0];
		if (!selected.some(old => old.id === item.id)) selected.push(item);
	}
	const value = Math.round((3500 + run.floor * 45) / 100) * 100;
	const npcs: RogueAuction['npcs'] = [
		{ name: '精打细算的行商', budget: value * 2, temperament: 'careful' },
		{ name: '不肯服输的收藏家', budget: value * 3, temperament: 'proud' },
		{ name: '眼光老练的训练家', budget: Math.round(value * 2.5), temperament: 'keen' },
	];
	run.auction = { floor: run.floor, entered: false, index: 0, npcs, log: [], lots: selected.map(item => {
		const price = Math.max(value, content.items.find(i => i.id === item.id)?.price || 0);
		return { item, opening: Math.ceil(price * 0.6 / 100) * 100, step: Math.max(100, Math.ceil(price * 0.1 / 100) * 100),
			price: 0, leader: -2, dropped: [], talked: false,
			willingness: npcs.map(() => Math.round(price * (0.8 + random(71) / 100) / 100) * 100) };
	}) };
	run.node!.event = { id: 'auction', key: randomUUID(), stage: 'choice', trainingAidBlocked: true };
	(run.eventHistory ||= []).push({ id: 'auction', floor: run.floor });
	run.node!.name = '落槌之前';
	run.phase = 'event';
}
export function auctionView(run: RogueRun) {
	const a = run.auction!, event = run.node!.event!, lot = a.lots[a.index];
	const option = (id: string, name: string, text = '', disabled = false) => ({ id, name, text, disabled });
	const catalog = a.lots.map((entry, i) => `${i + 1}. 【${entry.item.name}】` +
		(entry.winner === -1 ? '（已拍得）' : entry.winner !== undefined ? '（已落槌）' : '')).join('；');
	if (event.stage === 'result') {
		return { paragraphs: event.result || [], options: [], auction: { catalog, npcs: a.npcs } };
	}
	const budgets = a.npcs.map(npc => `${npc.name}：${npc.budget} 金币`).join('；');
	if (!a.entered) return { paragraphs: ['一块绒布铺在路边，几件珍贵的物品排得整整齐齐。摊主敲了敲小木槌：「价高者得，落槌才收钱！」',
		`你用余光打量竞拍的人，看清他们翻出的预算签：${budgets}。行商怕吃亏，收藏家最受不得激将，训练家只肯为合用的东西加价。`,
		'可以试着施压或诱导，但对手也有自己的底线。每件拍品只能使用一次话术；放弃后只能参加下一件。'],
	options: [option('enter', '坐下参加竞拍。'), option('leave', '看过拍品，继续赶路。')], auction: { catalog, npcs: a.npcs } };
	const next = lot.price ? lot.price + lot.step : lot.opening;
	return { paragraphs: [`第 ${a.index + 1} / ${a.lots.length} 件：【${lot.item.name}】。` +
		`起拍价 ${lot.opening} 金币，每次至少加 ${lot.step} 金币。`,
	`当前最高价：${lot.price} 金币（${lot.leader === -1 ? '你' : lot.leader < 0 ? '尚未出价' : a.npcs[lot.leader].name}）。`, ...a.log.slice(-5)],
	auction: { catalog, npcs: a.npcs }, options: [
		option('bid', `加价到 ${next} 金币。`, '', run.money < next),
		option('jump', `直接出 ${next + lot.step * 2} 金币。`, '大幅加价，对犹豫的买家施压。', run.money < next + lot.step * 2),
		...(!lot.talked ? [option('pressure', '「这个价，再往上可就不划算了。」', '劝退谨慎的买家。'),
			option('bluff', '「收藏家的眼光，应该不会输给我吧？」', '诱使好胜的买家追价；你也可能因此错失拍品。')] : []),
		option('pass', '放弃这件，看看下一件。'),
	] };
}
function finishLot(run: RogueRun) {
	const a = run.auction!, lot = a.lots[a.index];
	lot.winner = lot.leader;
	if (lot.leader === -1) {
		if (run.money < lot.price) throw new Error('金币不足，无法履行报价。');
		run.money -= lot.price;
		run.bag[lot.item.id] = (run.bag[lot.item.id] || 0) + 1;
		syncExclusiveItems(run);
		a.log.push(`「成交！」你花费 ${lot.price} 金币，拍得【${lot.item.name}】。`);
	} else if (lot.leader >= 0) {
		a.npcs[lot.leader].budget -= lot.price;
		a.log.push(`小槌落下，${a.npcs[lot.leader].name}以 ${lot.price} 金币拍下【${lot.item.name}】。`);
	} else a.log.push(`【${lot.item.name}】无人出价，暂时收回。`);
	if (++a.index === a.lots.length) {
		Object.assign(run.node!.event!, { stage: 'result', settled: true,
			result: [...a.log.slice(-5), '摊主收起绒布：「路还长，下次有好东西再请你来看！」'] });
	}
}
function npcRound(run: RogueRun, playerPassed: boolean) {
	const a = run.auction!, lot = a.lots[a.index];
	// Circular seat order. One NPC reply after a player bid; passing lets the remaining bidders finish.
	for (let rounds = 0; rounds < 200; rounds++) {
		let raised = false;
		for (let n = 1; n <= a.npcs.length; n++) {
			const i = ((lot.leader < 0 ? -1 : lot.leader) + n) % a.npcs.length;
			if (i === lot.leader || lot.dropped.includes(i)) continue;
			const bid = lot.price ? lot.price + lot.step : lot.opening;
			if (bid > Math.min(a.npcs[i].budget, lot.willingness[i])) { lot.dropped.push(i); continue; }
			lot.leader = i; lot.price = bid; raised = true;
			a.log.push(`${a.npcs[i].name}举起牌子：「${bid} 金币。」`);
			break;
		}
		if (!raised) { finishLot(run); return; }
		if (!playerPassed) return;
	}
	throw new Error('竞价未能正常收束。');
}
export function chooseAuction(run: RogueRun, choice: string) {
	const a = run.auction!, event = run.node!.event!;
	if (!a || a.floor !== run.floor) throw new Error('拍卖已经结束。');
	event.key = randomUUID();
	if (choice === 'leave') {
		event.stage = 'result'; event.settled = true;
		event.result = ['你向摊主点点头，继续赶路。']; return;
	}
	if (choice === 'enter') { a.entered = true; return; }
	const lot = a.lots[a.index];
	if (choice === 'pressure' || choice === 'bluff') {
		if (lot.talked) throw new Error('对手不会再次受同一轮话术影响。');
		lot.talked = true;
		a.npcs.forEach((npc, i) => {
			if (choice === 'pressure' && npc.temperament === 'careful') lot.willingness[i] = Math.floor(lot.willingness[i] * 0.65);
			if (choice === 'bluff' && npc.temperament === 'proud') {
				lot.willingness[i] = Math.min(npc.budget, Math.ceil(lot.willingness[i] * 1.2));
			}
		});
		a.log.push(choice === 'pressure' ? '行商掂量着钱袋，放低了举牌的手。' : '收藏家挺直腰板：「可别小看我的眼光。」');
		return;
	}
	if (choice === 'pass') { npcRound(run, true); return; }
	const price = (lot.price ? lot.price + lot.step : lot.opening) + (choice === 'jump' ? lot.step * 2 : 0);
	if (run.money < price) throw new Error('不能报出超出持有金币的价格。');
	lot.price = price; lot.leader = -1;
	if (choice === 'jump') a.npcs.forEach((npc, i) => {
		if (npc.temperament === 'careful' && price >= lot.willingness[i] * 0.8 && !lot.dropped.includes(i)) lot.dropped.push(i);
	});
	a.log.push(`你举牌出价 ${price} 金币。`);
	npcRound(run, false);
}
