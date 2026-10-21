import { trainerCodex } from './trainer-codex';
import { biomeCodex } from './biome-codex';
import { createHash } from 'crypto';
import { RIVALS, RIVAL_SCENES } from './rival-data';
import { rivalChapterReplay } from './rival-dialogue';
import { BEGINNER_GUIDE } from './beginner-guide';
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
	{ title: '战前准备与队伍成长', text: '战斗经验已全局提高，普通战斗区域还有额外经验加成；符合结算条件的存活后备伙伴仍获得一半战斗经验。休整时，黑袍老人会介绍下一层首领，并让你三选一领取仅用于该首领战的增益卡。精英与遭遇提供经验糖果，正面事件提供金币、物资与永久训练等奖励。十八种属性提升道具从第 49 层休整商店开放；糖果 S／M／L／XL 分别从第 30／50／100／150 层开放。' },
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
		{ id: 'leaderscrest', name: '头领凭证', text: '进化道具，与黑奇石归为一类。劈斩司令在队伍进化面板消耗一枚后，直接进化为仆刀将军。' },
		{ id: 'greninjaashz', name: '智蛙 Z', text: '完成【甲贺忍蛙护林员】两阶段事件获得，并解锁本局 Z 招式。幻想甲贺忍蛙携带它，在肉鸽战斗中登场时切换为小智版形态；以【飞水手里剑】释放专属 Z 招式【黄金羁绊手里剑】。预定 Z 招式的赠送范围包含进化后拥有这类自制专属纯晶的伙伴。' },
		{ id: 'megastones', name: '超级进化石与超巨进化许愿星',
			text: '超级进化石由对应宝可梦携带，解锁超进化系统后可在战斗中使用。' +
				'超巨进化许愿星用于对应幻想宝可梦的超巨进化，需要单独解锁超巨进化系统，占用独立的超巨进化机会。' },
		{ id: 'zcrystals', name: 'Z 纯晶', text: '解锁 Z 招式系统后，携带对应纯晶可释放 Z 招式。' +
			'特定幻想宝可梦携带适配纯晶时，还能进行气场爆发；气场爆发占用本场 Z 招式机会，随后无法再释放 Z 招式。' },
		{ id: 'typegems', name: '十八属性宝石', text: '使用对应属性的招式时，该次威力提升 30%，随后消耗。失去宝石后，本场对应属性招式威力仍提升 10%，换下再上场也保留。' },
	];
	return { intro: INTRO, beginner: BEGINNER_GUIDE, itemNotes, modules: { items, moves, abilities, pokemon } };
}

/** No mutation and no hidden effect text in locked entries. Loaded only when opening a codex. */
export function rogueCodex(account: RogueAccount | undefined, section: CodexSection, preview = false) {
	if (section === 'guide') {
		guideCache ||= buildFantasyGuide();
		return { section, preview, guide: { ...guideCache, modules: { ...guideCache.modules, biomes: biomeCodex(account, preview) } } };
	}
	const discovered = account ? rogueDiscoveries(account) : { blessings: [], events: [], trainers: [] };
	if (section === 'blessings') return { section, preview, entries: ROGUE_BLESSINGS.flatMap(def => blessingCodexFloors(def).map(floor => {
		const unlocked = preview || discovered.blessings.includes(def.id);
		const display = blessingDisplay(def, floor, account?.tonicSecret);
		return { id: floor && floor !== 1 ? `${def.id}:${floor}` : def.id, blessingId: def.id,
			family: def.family, name: display.name, tier: def.tier, floors: floor ? [floor] : def.floors, variantFloor: floor,
			unlocked, availability: blessingAvailabilityNotes(def), text: unlocked ? display.text : '？？？' };
	})).sort(compareBlessingNames) };
	const events = (Object.keys(EVENT_NAMES) as EventID[]).filter(id => !['auction', 'mushroomcollector', 'rivalstory'].includes(id)).map(id => {
		const unlocked = preview || discovered.events.includes(id);
		return { id, category: ['policeassist', 'policerevenge', 'exclusivechallenge', 'terasolo'].includes(id) ? 'encounter' : 'event', name: EVENT_NAMES[id], unlocked, text: unlocked ? EVENT_OVERVIEWS[id] : '？？？',
			...(unlocked ? { replay: eventReplay(id) } : {}) };
	});
	const visits = [
		...Object.entries(RIVALS).flatMap(([rival, person]) => RIVAL_SCENES.map((chapterName, index) => ({
			id: `rival:${rival}:${index + 1}`, category: 'adventure',
			name: `与${person.name}的相遇·其${'一二三四五六七八'[index]}`, portrait: rival,
			text: [
				'前 20 层可初遇劲敌。交谈与切磋后，开启这位劲敌的八段旅途。后续相遇间隔通常约 10～20 层；较早结识时会留出更长的旅行时间，错过多次相遇后会加快重逢。',
				'与劲敌各自派出伙伴，双打共斗驱散多组拦路者。获胜后获得对战道具、招式学习机和路费。',
				'与劲敌双打共斗，迎战高于本层普通精英 10 级的暴走精英。获胜可获得培育道具和稀有球种。',
				'多段旅途闲谈。回应影响熟悉度，并决定低、中、高三档谢礼。熟悉之后，对话也更加亲近。',
				'合作完成搜寻物资或清理暴走宝可梦的委托，得到稀有培育物资，并积累默契。',
				'约第 100 层迎接再次切磋；如果前面的旅途耽搁，会缩短后续重逢间隔。获胜后选择解锁太晶化、超进化、Z 招式或领取 100 幻想碎片；战败也能继续剧情。',
				'多轮双打共斗考验续航。获胜得到高阶物资，高熟悉度可邀请劲敌同行 8 层。',
				'约第 140～149 层迎接全力对决；需先完成之前的七段相遇。无论胜负，劲敌发出永久同行邀请；同行共用两个名额，满员时可选择替换。获胜另得大量幻想碎片与高阶培育资源。',
			][index] + ` ${chapterName}：${person.lines[index]}` }))),
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
		const unlocked = preview || discovered.events.includes(entry.id) ||
			entry.id === 'trade:auction' && discovered.events.includes('auction');
		const rivalChapter = /^rival:([^:]+):(\d+)$/.exec(entry.id);
		return { ...entry, unlocked, text: unlocked ? entry.text : '？？？', ...(unlocked ? { replay: rivalChapter ? rivalChapterReplay(rivalChapter[1] as keyof typeof RIVALS, Number(rivalChapter[2])) : entry.id === 'trade:auction' ? eventReplay('auction') : entry.id === 'trade:mushroom' ? eventReplay('mushroomcollector') : {
			title: entry.name, start: 'start',
			pages: { start: { text: [entry.text], options: [], battleSkipped: entry.category === 'encounter' } },
		} } : {}) };
	});
	const companions = trainerCodex().map(entry => {
		const unlocked = preview || discovered.trainers.includes(entry.portrait);
		return { ...entry, unlocked, text: unlocked ? entry.text : '？？？' };
	});
	return { section, preview, entries: [...events, ...visits, ...companions].sort((a, b) => {
		const ar = /^rival:([^:]+):(\d+)$/.exec(a.id), br = /^rival:([^:]+):(\d+)$/.exec(b.id);
		if (ar && br) return compareBlessingNames({ name: a.name.split('·')[0] }, { name: b.name.split('·')[0] }) || Number(ar[2]) - Number(br[2]);
		return compareBlessingNames(a, b);
	}) };
}

let contentVersion: string | undefined;
/** Changes to any catalog are reflected without maintaining another version string by hand. */
export function codexContentVersion() {
	contentVersion ||= createHash('sha256').update(JSON.stringify(
		(['guide', 'blessings', 'events'] as CodexSection[]).map(section => rogueCodex(undefined, section, true))
	)).digest('hex').slice(0, 16);
	return contentVersion;
}
