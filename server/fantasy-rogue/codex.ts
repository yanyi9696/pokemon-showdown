import { trainerCodex } from './trainer-codex';
import { Dex } from '../../sim/dex';
import { REWARD_SCENES } from './reward-scenes';
import { ROGUE_BLESSINGS, FANTASY_BLESSING_ITEMS } from '../../sim/rogue-blessing-data';
import type { RogueAccount } from './types';
import { rogueDiscoveries } from './discoveries';
import { EVENT_NAMES, type EventID } from './event-text';
import { EVENT_OVERVIEWS, eventReplay } from './event-replays';
import { TRADE_NAMES } from './trading';
import { blessingDisplay, blessingCodexFloors, blessingAvailabilityNotes, compareBlessingNames } from './blessing-text';

export type CodexSection = 'guide' | 'blessings' | 'events';
const INTRO = [
	{ title: '幻想杯是什么？', text: '在熟悉的宝可梦回合制对战中，加入幻想形态、新特性、新道具，以及部分招式与规则调整。同一只宝可梦在这里可能有全新的打法。下面可以按类别查阅。' },
	{ title: '这座塔怎么玩？', text: '选择初始伙伴，带着偏爱卡片向 200 层前进。每层挑选路线，在战斗、捕捉、事件与补给间作出选择。打败首领、收集祝福，逐步养成自己的队伍。' },
	{ title: '队伍与资源', text: '右侧“队伍及背包”可以查看伙伴、换招、装备道具和使用补给。HP、PP 与异常状态会带到下一场；野怪掉落的贵重物品要到商店换金币，训练家战斗则发放奖金。' },
	{ title: '祝福与塔灵', text: '第一层开战前，以及通关 50、100、150 层后各选择一轮祝福，共四轮；基拉祈每轮可选两项。每张卡可独立刷新。黄金和棱彩按所选轮次累计提高对手等级，固定首领加成高于普通遭遇；开局祝福不提高普通遭遇等级。塔灵默认随机；使用某个塔灵通关 200 层后，永久解锁手动选择该塔灵，未通关塔灵仍在随机池中。' },
	{ title: '战前准备与队伍成长', text: '普通战斗区域野怪击倒经验提升 37.5%，符合结算条件的存活后备伙伴仍获得一半战斗经验。休整时，黑袍老人会介绍下一层首领，并让你三选一领取仅用于该首领战的增益卡。精英与遭遇提供经验糖果，正面事件以金币和其他奖励为主。十八种属性提升道具从第 49 层休整商店开放；糖果 S／M／L／XL 分别从第 30／50／100／150 层开放。' },
	{ title: '逃跑与急救', text: '所有肉鸽战斗均可逃跑，保留 HP、PP、异常状态及道具损耗，调整队伍后重打当前对手。逃跑不发胜利奖励、不触发自动急救。战败后全队倒下且没有复活道具时，会自动支付随层数增加的急救费；余额不足则不扣款、不复活。记得提前购买补给。' },
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
	if (section === 'blessings') return { section, preview, entries: ROGUE_BLESSINGS.flatMap(def => blessingCodexFloors(def).map(floor => {
		const unlocked = preview || discovered.blessings.includes(def.id);
		const display = blessingDisplay(def, floor, account?.tonicSecret);
		return { id: floor && floor !== 1 ? `${def.id}:${floor}` : def.id, blessingId: def.id,
			family: def.family, name: display.name, tier: def.tier, floors: floor ? [floor] : def.floors, variantFloor: floor,
			unlocked, availability: blessingAvailabilityNotes(def), text: unlocked ? display.text : '？？？' };
	})).sort(compareBlessingNames) };
	const events = (Object.keys(EVENT_NAMES) as EventID[]).filter(id => !['auction', 'mushroomcollector'].includes(id)).map(id => {
		const unlocked = preview || discovered.events.includes(id);
		return { id, category: ['policeassist', 'policerevenge', 'exclusivechallenge'].includes(id) ? 'encounter' : 'event', name: EVENT_NAMES[id], unlocked, text: unlocked ? EVENT_OVERVIEWS[id] : '？？？',
			...(unlocked ? { replay: eventReplay(id) } : {}) };
	});
	const visits = [
		...Object.entries(REWARD_SCENES).map(([id, scene]) => ({ id: `reward:${id}`, category: 'reward', name: scene.name,
			text: id === 'chest' ? '留给旅人的补给箱，以回复药与活力碎片为主。还可按需要挑选经验糖果、路费或本局永久训练；物资随楼层提升。' :
				'以回复药与活力碎片为主的旅途补给。展示符合对方偏好的宝可梦或招式，可以提高谢礼品质。' })),
		...Object.entries(TRADE_NAMES).map(([id, name]) => ({ id: `trade:${id}`, category: 'trade', name,
			text: id === 'auction' ? '31 层起有机会遇到。每场上架 3～5 件珍品，观察竞拍者的预算与脾气，交替出价或运用话术，最高出价者在落槌时付款。' :
			id === 'buyback' ? '第 80 层起有机会遇到。按统一基础标价回收背包中的物品，战利品按自身价值；可按数量出售，也可一次回收全部。已装备物品需先卸下。' :
			id === 'crowns' ? '51 层起低概率出现银色王冠商店，121 层起加售金色王冠。提升个体值，每店限购。' :
			id === 'balls' ? '全程可能出现，各类捕捉球九折出售，每种限购 15 个。' :
			id === 'mushroom' ? '以普通商店 125% 的价格回收各类蘑菇。展示蘑菇伙伴，还能获得小蘑菇与一份观察谢礼。' :
			id === 'growth' ? '51 层起有机会遇到。花费金币，让全队获得本局永久的双攻、双防或战斗经验加成。每店限购；不占携带道具栏。' :
				`欢迎来到${name}！可以购买本店商品，也可以直接离开。商品与库存以当次交易为准。` })),
		{ id: 'encounter:trainer', category: 'encounter', name: '旅行训练家', text: '路上的训练家向你发起挑战。战胜对手，可以获得金币奖励。' },
		{ id: 'encounter:rocket', category: 'encounter', name: '火箭队拦路', text: '火箭队挡在店门口。战胜对手后，才能继续使用商店。' },
	].map(entry => {
		const unlocked = preview || discovered.events.includes(entry.id) || entry.id === 'trade:auction' && discovered.events.includes('auction');
		return { ...entry, unlocked, text: unlocked ? entry.text : '？？？', ...(unlocked ? { replay: entry.id === 'trade:auction' ? eventReplay('auction') : entry.id === 'trade:mushroom' ? eventReplay('mushroomcollector') : {
			title: entry.name, start: 'start',
			pages: { start: { text: [entry.text], options: [], battleSkipped: entry.category === 'encounter' } },
		} } : {}) };
	});
	const companions = trainerCodex();
	return { section, preview, entries: [...events, ...visits, ...companions].sort(compareBlessingNames) };
}
