import { Dex, toID } from '../../sim/dex';
import { TeamValidator } from '../../sim/team-validator';
import { Format } from '../../sim/dex-formats';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueContent, RogueItem, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { spiritItems, spiritShopAvailable } from './spirits';
import { CANDY_SHOP, restCandyOffer } from './early-balance';
import { candySupplyMultiplier } from './resource-pacing';
import { beginAuction } from './auction';
import { BUYBACK_FLOOR } from './buyback';
import { nextShopGrade } from './shopping-upgrade';
import { collapseShopPrice } from './collapse';

const dex = Dex.mod('gen9fantasy');
export const TRADE_NAMES = { buyback: '原价回收摊位', mushroom: '蘑菇收藏家', mint: '薄荷商店', candy: '经验糖果商店', machine: '招式学习机商店', growth: '训练营', auction: '落槌之前', balls: '宝可梦球商店', crowns: '王冠商店' };
export function tradeKind(floor: number, random: RogueRandom): keyof typeof TRADE_NAMES {
	if (floor >= BUYBACK_FLOOR && random(100) < 8) return 'buyback';
	const specialist = random(100);
	if (specialist < 8) return 'mushroom';
	if (specialist < 28) return 'balls';
	if (floor >= 51 && specialist < (floor >= 121 ? 36 : 34)) return 'crowns';
	if (floor >= 31 && random(100) < 20) return 'auction';
	const roll = random(100);
	if (floor >= 51) {
		const growthWeight = floor <= 100 ? 30 : 46;
		if (roll < growthWeight) return 'growth';
		const next = (roll - growthWeight) / (100 - growthWeight);
		return next < 0.45 ? 'candy' : next < 0.8 ? 'machine' : 'mint';
	}
	const weights = floor <= 40 ? [50, 90] : floor <= 80 ? [40, 80] : [34, 67];
	return roll < weights[0] ? 'candy' : roll < weights[1] ? 'machine' : 'mint';
}

const USEFUL_STATUS = new Set(['protect', 'substitute', 'toxic', 'willowisp', 'thunderwave', 'roost', 'rest',
	'recover', 'synthesis', 'calmmind', 'nastyplot', 'swordsdance', 'bulkup', 'dragondance', 'reflect', 'lightscreen',
	'stealthrock', 'taunt', 'encore', 'trickroom', 'tailwind']);
export function premiumMachine(id: string) {
	const move = dex.moves.get(id);
	if (move.category === 'Status') return USEFUL_STATUS.has(id);
	const hits = typeof move.multihit === 'number' ? move.multihit : move.multihit ? 3 : 1;
	return !move.ohko && !move.selfdestruct && !move.flags.charge && !move.self?.volatileStatus &&
		(move.accuracy === true || move.accuracy >= 80) &&
		(move.basePower * hits >= 70 || move.priority > 0 && move.basePower >= 40);
}
function machineWeight(id: string, run: RogueRun) {
	const move = dex.moves.get(id);
	if (move.category === 'Status') return USEFUL_STATUS.has(id) ? 6 : 1;
	if (move.ohko || move.selfdestruct || move.flags.charge || move.self?.volatileStatus === 'mustrecharge') return 1;
	const power = move.basePower * (typeof move.multihit === 'number' ? move.multihit : move.multihit ? 3 : 1);
	if (power < 50 || move.accuracy !== true && move.accuracy < 85) return 2;
	const suited = run.team.some(mon => {
		if (!machineMoves(mon).includes(id)) return false;
		const stats = mon.stats || dex.species.get(mon.set.species).baseStats;
		return move.category === 'Physical' ? stats.atk >= stats.spa * 0.8 : stats.spa >= stats.atk * 0.8;
	});
	return suited ? 8 : 3;
}
const stats: Record<string, string> = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' };
const validator = new TeamValidator(new Format({
	...Dex.formats.get('gen9nationaldex'), name: 'Rogue TM', mod: 'gen9fantasy',
}));
const machineCache = new Map<string, string[]>();
export function machineMoves(mon: RoguePokemon): string[] {
	const species = dex.species.get(mon.set.species);
	if (!machineCache.has(species.id)) {
		const candidates = new Set<string>();
		for (const data of dex.species.getFullLearnset(species.id)) {
			for (const [id, sources] of Object.entries(data.learnset)) {
				if (sources.some(source => /^[1-9]M/.test(source))) candidates.add(id);
			}
		}
		machineCache.set(species.id, [...candidates].filter(id => {
			const move = dex.moves.get(id);
			return move.exists && !move.isZ && !move.isMax && !validator.checkCanLearn(move, species, undefined, { level: 100 });
		}));
	}
	const known = new Set([
		...(mon.moveMemory || []).map(move => move.id), ...mon.set.moves.map(toID), ...(mon.blessingMoves || []),
	]);
	return machineCache.get(species.id)!.filter(id => !known.has(id));
}

/** Stable inventory IDs: the purchased item survives leaving the shop and reconnecting. */
export function tradeItem(id: string): RogueItem | undefined {
	if (id.startsWith('roguemint')) {
		const nature = dex.natures.get(id.slice(9));
		if (!nature.exists || !nature.plus || !nature.minus) return;
		return { id, name: `${nature.name}薄荷`, kind: 'mint', price: 0, shopFloor: false, nature: nature.name,
			description: `${stats[nature.plus]} ×1.1，${stats[nature.minus]} ×0.9；替换薄荷效果，保留原性格及进化条件。` };
	}
	if (id.startsWith('roguetm')) {
		const move = dex.moves.get(id.slice(7));
		if (!move.exists || move.isZ || move.isMax) return;
		return { id, name: `招式学习机：${move.name}`, kind: 'machine', price: 0, shopFloor: false, move: move.id,
			description: '让一名可学习的伙伴掌握这个招式。加入招式池后可自行装备；不恢复已有招式的 PP。' };
	}
}

export function tradeRouteTemplates(templates: RogueNode[], random: RogueRandom, floor = 1): RogueNode[] {
	return templates.map((node, i) => {
		if (node.kind !== 'wild' || random(100) < 88) return node;
		const kind = tradeKind(floor, random);
		return { id: `trade${i}`, name: TRADE_NAMES[kind], kind: 'trade', trade: { kind, stock: [], purchases: 0 },
			encounters: [], reward: { money: 0, items: {} } };
	});
}

export function prepareTrade(run: RogueRun, content: RogueContent, random: RogueRandom) {
	const trade = run.node?.trade;
	if (trade?.kind === 'auction') {
		if (run.node?.event?.id !== 'auction') beginAuction(run, content, random);
		return;
	}
	if (trade?.kind === 'mushroom') {
		if (!run.node!.event) { run.node!.event = { id: 'mushroomcollector', key: `collector:${run.floor}`, stage: 'choice' }; run.phase = 'event'; }
		return;
	}
	if (!trade || trade.kind === 'growth' || trade.kind === 'buyback') return;
	if (trade.kind === 'balls' || trade.kind === 'crowns') {
		const pool = content.items.filter(item => trade.kind === 'balls' ? item.kind === 'ball' && item.id !== 'masterball' :
			item.kind === 'crown' && (item.id === 'bottlecap' || nextShopGrade(run, [51, 121]) >= 121));
		for (const item of pool) if (!trade.stock.some(stock => stock.id === item.id)) trade.stock.push({ ...item, shopFloor: 1,
			price: Math.ceil(item.price * (trade.kind === 'balls' ? 0.9 : 1) * (run.spirit === 'meowth' ? 1.25 : 1)),
			remaining: trade.kind === 'balls' ? 15 : item.id === 'bottlecap' ? 2 : 1 });
		return;
	}
	if (trade.stock.length) return;
	const budget = (run.floor < 30 ? 750 : run.floor < 80 ? 1250 : run.floor < 140 ? 2450 : 5650) + 8 * run.floor;
	let pool: RogueItem[];
	if (trade.kind === 'mint') {
		pool = dex.natures.all().filter(n => n.plus && n.minus).map(n => tradeItem(`roguemint${n.id}`)!);
	} else if (trade.kind === 'machine') {
		pool = [...new Set(run.team.flatMap(machineMoves))].map(id => tradeItem(`roguetm${id}`)!);
	} else {
		pool = content.items.filter(item => item.kind === 'candy' && CANDY_SHOP[item.id]?.floor <= nextShopGrade(run, Object.values(CANDY_SHOP).map(c => c.floor)))
			.map(item => ({ ...item }));
	}
	const machineFloor = nextShopGrade(run, [1, 80]);
	const limit = trade.kind === 'machine' ? machineFloor < 80 ? 6 : 8 : trade.kind === 'candy' ? 5 : 3;
	while (pool.length && trade.stock.length < limit) {
		let index = random(pool.length);
		if (trade.kind === 'machine') {
			let weighted = pool.map((item, i) => ({ i, weight: machineWeight(item.move!, run) }));
			const practical = weighted.filter(entry => entry.weight >= 6);
			if (trade.stock.length < (machineFloor > run.floor ? 6 : 4) && practical.length) weighted = practical;
			let roll = random(weighted.reduce((sum, entry) => sum + entry.weight, 0));
			index = weighted.find(entry => { roll -= entry.weight; return roll < 0; })!.i;
		}
		const item = pool.splice(index, 1)[0];
		const price = Math.round(budget * (trade.kind === 'mint' ? 0.6 : 0.75) / 50) * 50;
		const adjusted = trade.kind === 'candy' ? CANDY_SHOP[item.id].price :
			Math.ceil(price * 1.25 * (trade.kind === 'machine' ? 1 + Math.min(0.2, Math.max(0, run.floor - 30) / 500) : 1) / 10) * 10;
		trade.stock.push({ ...item, price: Math.ceil(adjusted * (run.spirit === 'meowth' ? 1.25 : 1)),
			shopFloor: 1, remaining: trade.kind === 'candy' ? Math.max(1, Math.floor(CANDY_SHOP[item.id].stock * candySupplyMultiplier(run.floor))) : 1 });
	}
}

export function shopStock(content: RogueContent, run?: RogueRun): RogueItem[] {
	if (run?.node?.kind === 'trade') return (run.node.trade?.stock.filter(item => item.remaining > 0) || [])
		.map(item => ({ ...item, price: collapseShopPrice(run, item.price) }));
	const allItems = spiritItems(content, run);
	const stock = allItems.filter(item => spiritShopAvailable(item, run ? nextShopGrade(run,
		allItems.filter(i => i.kind === item.kind && typeof i.shopFloor === 'number').map(i => i.shopFloor as number)) : 1))
		.map(item => run && typeof item.shopFloor === 'number' && item.shopFloor > run.floor ? { ...item, shopFloor: run.floor } : { ...item });
	// Meowth retains its existing unlimited, premium-priced spirit shop.
	if (run?.node?.kind === 'rest' && run.floor >= 9 && run.spirit !== 'meowth') {
		const offer = restCandyOffer(nextShopGrade(run, Object.values(CANDY_SHOP).map(c => c.floor))), item = content.items.find(entry => entry.id === offer.id);
		if (item) {
			const candy = { ...item, price: offer.price, shopFloor: 9,
				remaining: Math.max(0, offer.stock - (run.node.restCandyPurchases?.[item.id] || 0)) };
			const index = stock.findIndex(entry => entry.id === item.id);
			if (index >= 0) stock[index] = candy; else stock.push(candy);
		}
	}
	return stock.map(item => ({ ...item, price: collapseShopPrice(run, item.price) }));
}
