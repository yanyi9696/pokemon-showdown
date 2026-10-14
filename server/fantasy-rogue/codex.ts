import { Dex } from '../../sim/dex';
import { ROGUE_BLESSINGS, FANTASY_BLESSING_ITEMS } from '../../sim/rogue-blessing-data';
import type { RogueAccount } from './types';
import { rogueDiscoveries } from './discoveries';
import { EVENT_NAMES, type EventID } from './event-text';
import { EVENT_OVERVIEWS, eventReplay } from './event-replays';

export type CodexSection = 'guide' | 'blessings' | 'events';
const INTRO = [
	{ title: '幻想杯是什么？', text: '在熟悉的宝可梦回合制对战中，加入幻想形态、新特性、新道具，以及部分招式与规则调整。同一只宝可梦在这里可能有全新的打法。下面可以按类别查阅。' },
	{ title: '这座塔怎么玩？', text: '选择初始伙伴，带着偏爱卡片向 200 层前进。每层挑选路线，在战斗、捕捉、事件与补给间作出选择。打败首领、收集祝福，逐步养成自己的队伍。' },
	{ title: '队伍与资源', text: '右侧“队伍及背包”可以查看伙伴、换招、装备道具和使用补给。HP、PP 与异常状态会带到下一场；野怪掉落的贵重物品要到商店换金币，训练家战斗则发放奖金。' },
	{ title: '祝福与塔灵', text: '通关 50、100、150 层后选择祝福，每个选项可单独刷新。黄金与棱彩祝福会提高后续对手等级。塔灵影响整局冒险：普通玩家只选择是否开启，具体塔灵开局随机。' },
	{ title: '下一次会更强', text: '捕捉会解锁初始伙伴与可指定的资质；击败首领获得局外成长点。无塔灵通关可解锁塔灵。通关后可以收藏队伍卡，展示成果，并用相同塔灵的通关队伍约战。' },
];
let guideCache: ReturnType<typeof buildFantasyGuide> | undefined;
function buildFantasyGuide() {
	const dex = Dex.mod('gen9fantasy'), base = Dex.mod('gen9');
	const items = dex.items.all().filter(item => item.exists && !item.id.startsWith('rogue') && (
		!base.items.get(item.id).exists || item.desc !== base.items.get(item.id).desc ||
		item.shortDesc !== base.items.get(item.id).shortDesc || !!(dex.data.Items[item.id] as any).auraBursts
	)).map(item => ({ id: item.id, name: item.name, text: (item.shortDesc || item.desc ||
		'与特定宝可梦搭配，可触发特殊的形态变化。') + ((dex.data.Items[item.id] as any).auraBursts ?
		' 特定幻想宝可梦携带时，还可触发气场爆发。' : ''), icon: 'item' }))
		.sort((a, b) => Number(FANTASY_BLESSING_ITEMS.includes(b.id)) - Number(FANTASY_BLESSING_ITEMS.includes(a.id)));
	const moves = dex.moves.all().filter(move => move.exists && !move.id.startsWith('rogue') && (
		!base.moves.get(move.id).exists || ['type', 'category', 'basePower', 'accuracy', 'pp', 'priority', 'desc', 'shortDesc']
			.some(key => (move as any)[key] !== (base.moves.get(move.id) as any)[key])
	)).map(move => ({ id: move.id, name: move.name, text: move.shortDesc || move.desc,
		type: move.type, category: move.category, power: move.basePower, accuracy: move.accuracy, pp: move.pp }));
	const abilities = dex.abilities.all().filter(ability => ability.exists && !ability.id.startsWith('rogue') && (
		!base.abilities.get(ability.id).exists || ability.desc !== base.abilities.get(ability.id).desc ||
		ability.shortDesc !== base.abilities.get(ability.id).shortDesc
	)).map(ability => ({ id: ability.id, name: ability.name, text: ability.shortDesc || ability.desc }));
	const pokemon = dex.species.all().filter(species => species.exists && species.name.includes('Fantasy'))
		.map(species => ({ id: species.id, name: species.name, types: species.types,
			abilities: [...new Set(Object.values(species.abilities))], stats: species.baseStats,
			battleOnly: !!species.battleOnly, requiredItem: species.requiredItem }));
	return { intro: INTRO, modules: { items, moves, abilities, pokemon } };
}

/** No mutation and no hidden effect text in locked entries. Loaded only when opening a codex. */
export function rogueCodex(account: RogueAccount | undefined, section: CodexSection) {
	if (section === 'guide') {
		guideCache ||= buildFantasyGuide();
		return { section, guide: guideCache };
	}
	const discovered = account ? rogueDiscoveries(account) : { blessings: [], events: [] };
	if (section === 'blessings') return { section, entries: ROGUE_BLESSINGS.map(def => {
		const unlocked = discovered.blessings.includes(def.id);
		return { id: def.id, name: def.name, tier: def.tier, unlocked, text: unlocked ? def.text : '？？？' };
	}) };
	return { section, entries: (Object.keys(EVENT_NAMES) as EventID[]).map(id => {
		const unlocked = discovered.events.includes(id);
		return { id, name: EVENT_NAMES[id], unlocked, text: unlocked ? EVENT_OVERVIEWS[id] : '？？？',
			...(unlocked ? { replay: eventReplay(id) } : {}) };
	}) };
}
