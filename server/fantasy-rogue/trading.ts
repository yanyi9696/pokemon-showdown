import { Dex, toID } from '../../sim/dex';
import { TeamValidator } from '../../sim/team-validator';
import { Format } from '../../sim/dex-formats';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueContent, RogueItem, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { spiritItems, spiritShopAvailable } from './spirits';

const dex = Dex.mod('gen9fantasy');
export const TRADE_NAMES = { mint: '薄荷商店', candy: '经验糖果商店', machine: '招式学习机商店' };
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

export function tradeRouteTemplates(templates: RogueNode[], random: RogueRandom): RogueNode[] {
	return templates.map((node, i) => {
		if (node.kind !== 'wild' || random(100) < 88) return node;
		const kind = (Object.keys(TRADE_NAMES) as (keyof typeof TRADE_NAMES)[])[random(3)];
		return { id: `trade${i}`, name: TRADE_NAMES[kind], kind: 'trade', trade: { kind, stock: [], purchases: 0 },
			encounters: [], reward: { money: 0, items: {} } };
	});
}

export function prepareTrade(run: RogueRun, content: RogueContent, random: RogueRandom) {
	const trade = run.node?.trade;
	if (!trade || trade.stock.length) return;
	const budget = (run.floor < 30 ? 750 : run.floor < 80 ? 1250 : run.floor < 140 ? 2450 : 5650) + 8 * run.floor;
	let pool: RogueItem[];
	if (trade.kind === 'mint') {
		pool = dex.natures.all().filter(n => n.plus && n.minus).map(n => tradeItem(`roguemint${n.id}`)!);
	} else if (trade.kind === 'machine') {
		pool = [...new Set(run.team.flatMap(machineMoves))].map(id => tradeItem(`roguetm${id}`)!);
	} else {
		pool = content.items.filter(item => item.kind === 'candy' && item.amount! <=
		(run.floor < 40 ? 800 : run.floor < 80 ? 3000 : run.floor < 120 ? 10000 : 30000)).map(item => ({ ...item }));
	}
	while (pool.length && trade.stock.length < 3) {
		const item = pool.splice(random(pool.length), 1)[0];
		const price = trade.kind === 'candy' ? Math.max(70, Math.round(item.amount! * 0.42 / 10) * 10) :
			Math.round(budget * (trade.kind === 'mint' ? 0.6 : 0.75) / 50) * 50;
		const adjusted = Math.ceil(price * 1.25 / 10) * 10;
		trade.stock.push({ ...item, price: Math.ceil(adjusted * (run.spirit === 'meowth' ? 1.25 : 1)),
			shopFloor: 1, remaining: 1 });
	}
}

export function shopStock(content: RogueContent, run?: RogueRun): RogueItem[] {
	if (run?.node?.kind === 'trade') return run.node.trade?.stock.filter(item => item.remaining > 0) || [];
	return spiritItems(content, run).filter(item => spiritShopAvailable(item, run?.floor || 1));
}
