import { Dex, toID } from '../../sim/dex';
import { ROGUE_FORMAT } from '../../sim/fantasy-rogue';
import type { RogueContent } from './types';
import { rogueSpeciesData } from '../../sim/fantasy-rogue-rules';

export const ELITE_BOSS_FLOORS = new Set([10, 30, 50, 70, 90, 110, 130, 150, 170]);
export const BOSS_FLOORS = new Map<number, string>([
	...[...ELITE_BOSS_FLOORS].map(floor => [floor, '精英首领'] as const),
	...[20, 40, 60, 80, 100, 120, 140, 160].map(floor => [floor, '道馆'] as const),
	...[165, 175, 180, 185].map(floor => [floor, '四天王'] as const),
	[190, '冠军'], [200, '最终 Boss'],
]);
export function fixedFloor(floor: number): 'boss' | 'rest' | undefined {
	if (BOSS_FLOORS.has(floor)) return 'boss';
	if (BOSS_FLOORS.has(floor + 1)) return 'rest';
	return undefined;
}
function ensure(ok: unknown, message: string): asserts ok {
	if (!ok) throw new Error(`肉鸽内容配置：${message}`);
}
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;
/** Validate all supplied content before exposing a start button. No generated fallback teams. */
export function validateContent(content: RogueContent): RogueContent {
	const dex = Dex.forFormat(ROGUE_FORMAT);
	ensure(content.version && content.version.length < 80, '缺少版本');
	ensure(!content.compatibleVersions || content.compatibleVersions.every(version =>
		typeof version === 'string' && version.length > 0 && version.length < 80), '兼容版本无效');
	ensure(content.starters.length && Object.keys(content.floors).length, '缺少初始宝可梦或楼层');
	ensure(whole(content.initialMoney), '初始货币无效');
	const itemIds = new Set<string>();
	for (const item of content.items) {
		ensure(/^[a-z0-9]+$/.test(item.id) && !itemIds.has(item.id), '道具标识重复或无效');
		itemIds.add(item.id);
		ensure(item.name && whole(item.price), `道具 ${item.id} 名称或价格无效`);
		ensure(['ball', 'heal', 'revive', 'ether', 'cure', 'candy', 'evolution', 'held'].includes(item.kind), '未支持的道具类型');
		if (item.kind === 'held') ensure(dex.items.get(item.id).exists, '携带道具不存在');
		if (['heal', 'ether', 'candy'].includes(item.kind)) {
			ensure(Number.isSafeInteger(item.amount) && item.amount! > 0, '道具数值无效');
		}
		if (item.kind === 'revive') ensure(item.amount! > 0 && item.amount! <= 1, '复活比例无效');
		if (item.kind === 'ball' && content.progression) {
			ensure(item.multiplier! > 0 && Number.isFinite(item.multiplier), '球倍率无效');
		}
	}
	const inventory = (items: Record<string, number>) => {
		for (const [id, count] of Object.entries(items)) ensure(itemIds.has(id) && whole(count), `库存 ${id} 无效`);
	};
	inventory(content.initialBag);
	const team = (sets: PokemonSet[]) => {
		ensure(sets.length >= 1 && sets.length <= 6, '队伍必须为 1～6 只');
		for (const set of sets) {
			ensure(dex.species.get(set.species).exists, `物种 ${set.species} 不存在`);
			ensure(Number.isSafeInteger(set.level) && set.level >= 1 && set.level <= 9999, '必须显式配置有效等级');
			ensure(set.moves.length >= 1 && set.moves.length <= 4 && set.moves.every(move => dex.moves.get(move).exists), '招式无效');
			ensure(dex.abilities.get(set.ability).exists && dex.natures.get(set.nature).exists, '特性或性格无效');
			ensure(!set.item || dex.items.get(set.item).exists, '持有物无效');
			ensure(!set.fantasyRogueStats && !set.fantasyRogueId, '配置不能注入存档元数据');
			if (content.progression) { rogueSpeciesData(set.species); ensure(set.level <= 100, '试玩版等级上限为 100'); }
		}
	};
	const starterIds = new Set<string>();
	for (const starter of content.starters) {
		ensure(/^[a-z0-9]+$/.test(starter.id) && !starterIds.has(starter.id), '初始标识重复或无效');
		starterIds.add(starter.id);
		team([starter.set]);
		ensure(starter.set.level === 5, '初始宝可梦必须为 5 级');
	}
	ensure(content.starters.some(starter => starter.availableInitially), '至少配置一只初始可选宝可梦');
	for (const [species, unlock] of Object.entries(content.unlocks)) {
		ensure(toID(species) === species && dex.species.get(species).exists && starterIds.has(unlock.starter), '捕捉解锁映射无效');
		ensure(unlock.captures === 1 || unlock.captures === 10, '解锁门槛只能为 1 或 10');
		const captured = dex.species.get(species);
		const singleLegendary = !captured.prevo && !captured.evos.length &&
			captured.tags.some(tag => ['Mythical', 'Restricted Legendary', 'Sub-Legendary'].includes(tag));
		ensure(unlock.captures === (singleLegendary ? 10 : 1), `${species} 的捕捉门槛与普通／单阶段神兽规则不符`);
		let first = captured;
		while (first.prevo) first = dex.species.get(first.prevo);
		const starter = content.starters.find(entry => entry.id === unlock.starter)!;
		ensure(dex.species.get(starter.set.species).id === first.id, `${species} 必须解锁最初进化形态 ${first.name}`);
	}
	for (const [floorString, nodes] of Object.entries(content.floors)) {
		const floor = Number(floorString);
		ensure(Number.isInteger(floor) && floor >= 1 && floor <= 200, '楼层范围无效');
		const fixed = fixedFloor(floor);
		ensure(nodes.length === (fixed ? 1 : 3), `第 ${floor} 层需要 ${fixed ? '一个固定节点' : '三个选项'}`);
		const ids = new Set<string>();
		for (const node of nodes) {
			ensure(node.noHealing === undefined || (typeof node.noHealing === 'boolean' && node.encounters.length > 0),
				'连续战斗治疗限制必须为布尔值且仅用于战斗节点');
			ensure(/^[a-z0-9]+$/.test(node.id) && !ids.has(node.id), '节点标识重复或无效');
			ids.add(node.id);
			ensure(node.name && (fixed ? node.kind === fixed : !['boss', 'rest'].includes(node.kind)), `第 ${floor} 层固定类型不匹配`);
			ensure(['wild', 'elite', 'trainer', 'rest', 'boss', 'reward'].includes(node.kind), '节点类型未接入');
			const fights = ['rest', 'reward'].includes(node.kind) ? 0 : node.kind === 'wild' ? 3 : 1;
			ensure(node.encounters.length === fights, '战斗场次数量不符合节点类型');
			ensure(whole(node.reward.money), '奖励金额无效');
			inventory(node.reward.items);
			for (const encounter of node.encounters) {
				team(encounter.team);
				if (encounter.candidates) {
					ensure(node.kind === 'boss' && ELITE_BOSS_FLOORS.has(floor) && !encounter.catchable,
						'随机候选仅用于固定幻想精英 Boss');
					ensure(encounter.team.length === 1 && encounter.candidates.length > 0, '幻想精英候选不能为空且必须为单只对手');
					for (const candidate of encounter.candidates) team([candidate]);
				}
				ensure(encounter.name && ['balanced', 'aggressive', 'defensive'].includes(encounter.style), 'AI 名称或风格无效');
				if (node.kind === 'wild' || encounter.catchable) ensure(encounter.team.length === 1, '野怪／可捕捉对局必须只有一只');
				if (encounter.catchable) {
					ensure(['wild', 'elite'].includes(node.kind), '训练家／Boss 不可捕捉');
					ensure(content.unlocks[toID(encounter.team[0].species)], '缺少捕捉对象的初始解锁映射');
				}
				if (encounter.catchable && !content.progression) ensure(Object.keys(encounter.catchChances || {}).length, '缺少捕捉配置');
				for (const [id, chance] of Object.entries(encounter.catchChances || {})) {
					ensure(content.items.some(item => item.id === id && item.kind === 'ball') &&
						Number.isFinite(chance) && chance >= 0 && chance <= 1, '捕捉概率无效');
				}
			}
		}
	}
	ensure(content.floors[1], '缺少第 1 层');
	return structuredClone(content);
}
