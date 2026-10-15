import { Dex } from '../../sim/dex';
import { ROGUE_BLESSINGS, FANTASY_BLESSING_ITEMS } from '../../sim/rogue-blessing-data';
import type { RogueAccount } from './types';
import { rogueDiscoveries } from './discoveries';
import { EVENT_NAMES, type EventID } from './event-text';
import { EVENT_OVERVIEWS, eventReplay } from './event-replays';
import { TRADE_NAMES } from './trading';
import { tonicDescription } from '../../sim/rogue-blessing-permanent';

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
	const items = dex.items.all().filter(item => item.exists && !item.id.startsWith('rogue') &&
		(FANTASY_BLESSING_ITEMS.includes(item.id) || item.itemUser?.length || item.id === 'lightball') &&
		!item.megaStone && !item.zMove && !item.zMoveType && (!item.isGem || FANTASY_BLESSING_ITEMS.includes(item.id)) && (
		!base.items.get(item.id).exists || item.desc !== base.items.get(item.id).desc ||
		item.shortDesc !== base.items.get(item.id).shortDesc || !!(dex.data.Items[item.id] as any).auraBursts
	)).map(item => ({ id: item.id, name: item.name, text: (item.shortDesc || item.desc ||
		'与特定宝可梦搭配，可触发特殊的形态变化。') + ((dex.data.Items[item.id] as any).auraBursts ?
		' 特定幻想宝可梦携带时，还可触发气场爆发。' : ''), icon: item.id, spritenum: item.spritenum,
	category: item.itemUser?.length || item.id === 'lightball' ? 'exclusive' : 'general' }))
		.sort((a, b) => Number(FANTASY_BLESSING_ITEMS.includes(b.id)) - Number(FANTASY_BLESSING_ITEMS.includes(a.id)));
	const moves = dex.moves.all().filter(move => move.exists && !move.id.startsWith('rogue') && (
		!base.moves.get(move.id).exists || ['type', 'category', 'basePower', 'accuracy', 'pp', 'priority', 'desc', 'shortDesc']
			.some(key => (move as any)[key] !== (base.moves.get(move.id) as any)[key])
	)).map(move => ({ id: move.id, name: move.name, text: move.shortDesc || move.desc,
		origin: base.moves.get(move.id).exists ? 'enhanced' : 'fantasy',
		type: move.type, category: move.category, power: move.basePower, accuracy: move.accuracy, pp: move.pp }));
	const abilities = dex.abilities.all().filter(ability => ability.exists && !ability.id.startsWith('rogue') && (
		!base.abilities.get(ability.id).exists || ability.desc !== base.abilities.get(ability.id).desc ||
		ability.shortDesc !== base.abilities.get(ability.id).shortDesc
	)).map(ability => ({ id: ability.id, name: ability.name, text: ability.shortDesc || ability.desc,
		origin: base.abilities.get(ability.id).exists ? 'enhanced' : 'fantasy' }));
	const pokemon = dex.species.all().filter(species => species.exists && species.name.includes('Fantasy'))
		.map(species => ({ id: species.id, name: species.name, types: species.types,
			abilities: [...new Set(Object.values(species.abilities))], stats: species.baseStats,
			battleOnly: !!species.battleOnly, requiredItem: species.requiredItem }));
	const itemNotes = [
		{ id: 'megastones', name: '超级进化石与超巨进化许愿星',
			text: '超级进化石由对应宝可梦携带，解锁超进化系统后可在战斗中使用。' +
				'超巨进化许愿星用于对应幻想宝可梦的超巨进化，需要单独解锁超巨进化系统，占用独立的超巨进化机会。' },
		{ id: 'zcrystals', name: 'Z 纯晶', text: '解锁 Z 招式系统后，携带对应纯晶可释放 Z 招式。' +
			'特定幻想宝可梦携带适配纯晶时，还能进行气场爆发；气场爆发占用本场 Z 招式机会，随后无法再释放 Z 招式。' },
		{ id: 'typegems', name: '十八属性宝石', text: '使用对应属性的招式时，该次威力提升 30%，随后消耗。失去宝石后，本场对应属性招式威力仍提升 10%，换下再上场也保留。' },
	];
	return { intro: INTRO, itemNotes, modules: { items, moves, abilities, pokemon } };
}

/** No mutation and no hidden effect text in locked entries. Loaded only when opening a codex. */
export function rogueCodex(account: RogueAccount | undefined, section: CodexSection, preview = false) {
	if (section === 'guide') {
		guideCache ||= buildFantasyGuide();
		return { section, guide: guideCache };
	}
	const discovered = account ? rogueDiscoveries(account) : { blessings: [], events: [] };
	if (section === 'blessings') return { section, preview, entries: ROGUE_BLESSINGS.map(def => {
		const unlocked = preview || discovered.blessings.includes(def.id);
		const text = ['wine', 'cephalosporin'].includes(def.family) ?
			'获得一个一次性道具【' + def.name + '】。' + tonicDescription(def.family, account?.tonicSecret) : def.text;
		return { id: def.id, family: def.family, name: def.name, tier: def.tier, unlocked, text: unlocked ? text : '？？？' };
	}) };
	const events = (Object.keys(EVENT_NAMES) as EventID[]).map(id => {
		const unlocked = preview || discovered.events.includes(id);
		return { id, category: 'event', name: EVENT_NAMES[id], unlocked, text: unlocked ? EVENT_OVERVIEWS[id] : '？？？',
			...(unlocked ? { replay: eventReplay(id) } : {}) };
	});
	const visits = [
		...Object.entries(TRADE_NAMES).map(([id, name]) => ({ id: `trade:${id}`, category: 'trade', name,
			text: `欢迎来到${name}！可以购买本店商品，也可以直接离开。商品与库存以当次交易为准。` })),
		{ id: 'encounter:trainer', category: 'encounter', name: '旅行训练家', text: '路上的训练家向你发起挑战。战胜对手，可以获得金币奖励。' },
		{ id: 'encounter:rocket', category: 'encounter', name: '火箭队拦路', text: '火箭队挡在店门口。战胜对手后，才能继续使用商店。' },
	].map(entry => {
		const unlocked = preview || discovered.events.includes(entry.id);
		return { ...entry, unlocked, text: unlocked ? entry.text : '？？？', ...(unlocked ? { replay: {
			title: entry.name, start: 'start',
			pages: { start: { text: [entry.text], options: [], battleSkipped: entry.category === 'encounter' } },
		} } : {}) };
	});
	return { section, preview, entries: [...events, ...visits] };
}
