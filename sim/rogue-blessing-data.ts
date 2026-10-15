/** Shared, versioned blessing data. Only the campaign server grants these effects. */
export type BlessingTier = 'silver' | 'gold' | 'prismatic';
export interface OwnedBlessing {
	id: string; family: string; tier: BlessingTier; floor: number; type?: string;
	target?: string; progress?: number; milestones?: number[]; completed?: boolean;
	grantedBy?: string;
}
export interface TypeEvolution {
	type: string; direction: 'resistance' | 'moves' | 'stats';
	defense: Record<string, number>; offense: Record<string, number>;
	stats: Partial<StatsTable>; power: number; extras: string[];
}
export interface BlessingEffects {
	dragonKing?: import('./rogue-blessing-permanent').DragonKing;
	owned: OwnedBlessing[];
	evolution?: TypeEvolution;
	psychic?: number;
}
export const blessingLevelCost = (tier: BlessingTier, floor: number) =>
	(tier === 'gold' ? 5 : tier === 'prismatic' ? 10 : 0) * Math.max(1, Math.min(3, Math.floor(floor / 50)));
export function addPsychicCharge(current: number, amount: number) {
	const ordinary = Math.max(0, Math.min(amount, 100 - current));
	return Math.round((current + ordinary + (amount - ordinary) * 0.05) * 100) / 100;
}
export interface RogueStatModifiers {
	nature?: string;
	smallFinal?: boolean; swap?: boolean; stats?: Partial<StatsTable>; hp?: number;
	statsType?: string;
	baseStats?: Partial<StatsTable>; extraType?: string;
}
export interface BlessingDefinition {
	id: string; family: string; tier: BlessingTier; name: string; text: string; type?: string;
	floors?: number[]; target?: 'member' | 'fantasy' | 'starter'; emblem?: boolean;
}
export const BLESSING_TYPES: Record<string, string> = {
	Bug: '虫', Dark: '恶', Dragon: '龙', Electric: '电', Fairy: '妖精', Fighting: '格斗', Fire: '火',
	Flying: '飞行', Ghost: '幽灵', Grass: '草', Ground: '地面', Normal: '一般', Ice: '冰', Poison: '毒',
	Psychic: '超能', Steel: '钢', Rock: '岩石', Water: '水',
};
export const EMBLEM_MOVES: Record<string, string[]> = {
	Bug: ['uturn', 'megahorn', 'bugbuzz', 'infestation', 'stickyweb'],
	Dark: ['knockoff', 'suckerpunch', 'darkpulse', 'snarl', 'nastyplot'],
	Dragon: ['outrage', 'scaleshot', 'dracometeor', 'dragonpulse', 'dragondance'],
	Electric: ['boltstrike', 'spark', 'thunderbolt', 'voltswitch', 'thunderwave'],
	Fairy: ['playrough', 'spiritbreak', 'moonblast', 'drainingkiss', 'moonlight'],
	Fighting: ['closecombat', 'drainpunch', 'focusblast', 'aurasphere', 'bulkup'],
	Fire: ['flareblitz', 'ragingfury', 'flamethrower', 'overheat', 'willowisp'],
	Flying: ['bravebird', 'acrobatics', 'hurricane', 'airslash', 'roost'],
	Ghost: ['poltergeist', 'phantomforce', 'shadowball', 'nightshade', 'curse'],
	Grass: ['woodhammer', 'powerwhip', 'energyball', 'leafstorm', 'synthesis'],
	Ground: ['earthquake', 'headlongrush', 'earthpower', 'mudshot', 'spikes'],
	Normal: ['doubleedge', 'quickattack', 'terablast', 'triattack', 'swordsdance'],
	Ice: ['tripleaxel', 'iciclecrash', 'icebeam', 'blizzard', 'powdersnow'],
	Poison: ['gunkshot', 'poisonjab', 'sludgebomb', 'sludgewave', 'toxic'],
	Psychic: ['psychic', 'psyshock', 'zenheadbutt', 'psychicfangs', 'trickroom'],
	Steel: ['ironhead', 'heavyslam', 'flashcannon', 'steelbeam', 'irondefense'],
	Rock: ['rockthrow', 'stoneedge', 'powergem', 'meteorbeam', 'stealthrock'],
	Water: ['wavecrash', 'liquidation', 'hydropump', 'scald', 'raindance'],
};
export const FANTASY_BLESSING_ITEMS = ['fantasydefensegem', 'fantasyicestone', 'fantasylaxincense',
	'fantasylifeorb', 'fantasymachobrace', 'fantasypowerlens', 'fantasyprotector', 'fantasyringtarget',
	'fantasysachet', 'fantasyscopelens', 'fantasysyrupyapple'];
export const EMBLEM_PREFIX = 'rogueemblem';
export const ELECTRIC_MOUSE_FAMILY = ['Pichu', 'Pikachu', 'Raichu', 'Plusle', 'Minun', 'Pachirisu',
	'Emolga', 'Dedenne', 'Togedemaru', 'Morpeko', 'Pawmi', 'Pawmo', 'Pawmot'];
export const EEVEE_FAMILY = ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'];
export function inBlessingFamily(name: string, family: string[]) { return family.includes(name.split('-')[0]); }
export function emblemType(item: string) {
	return Object.keys(BLESSING_TYPES).find(type => item === EMBLEM_PREFIX + type.toLowerCase());
}
export const TYPE_EVOLUTION_EXTRAS: Record<string, string> = {
	accuracy: '非一击必杀招式必中', crit: '要害等级 +2', brn: '命中后 50% 烧伤',
	par: '命中后 50% 麻痹', frostbite: '命中后 50% 冻伤',
	atk: '命中后 50% 攻击 +1', spa: '命中后 50% 特攻 +1', spe: '命中后 50% 速度 +1',
};
const definitions: BlessingDefinition[] = [];
function add(tier: BlessingTier, id: string, name: string, text: string, extra: Partial<BlessingDefinition> = {}) {
	definitions.push({ id, family: id, tier, name, text, ...extra });
}
function typed(tier: BlessingTier, family: string, title: (label: string) => string, text: string,
	extra: Partial<BlessingDefinition> = {}) {
	for (const [type, label] of Object.entries(BLESSING_TYPES)) {
		add(tier, family + type.toLowerCase(), title(label), text.replace(/对应属性/g, label + '属性'), { ...extra, family, type });
	}
}
add('silver', 'shopraid', '零元购', '可在商店发起一次挑战。胜利获得当前商店随机三种商品，各一件；无论胜负，挑战结束后商店关闭。宝可梦中心由乔伊应战。');
add('gold', 'renewable', '可再生资源', '获得一个随机一次性对战道具。你的队伍在对战中使用一次性携带道具后不会将其消耗；被拍落、交换等仍按正常规则处理。');
add('prismatic', 'mousefamily', '电气鼠大家族', '获得一只随机电气鼠。队伍六只均为电气鼠时，共享已掌握的招式池和不同携带道具的效果。相同道具不叠加，一次性道具全队共用消耗；变身专用道具不共享，电气球对全队有效。');
add('prismatic', 'eeveefamily', '伊布大家族', '获得伊布与一颗自选伊布进化石。队伍六只均为伊布家族成员时，每只每场可额外使用一次九彩升华齐聚顶，占用一次行动，不消耗常规 Z 招式次数。');
add('gold', 'duck', '嘶~头疼', '获得可达鸭（赠送等级达到 33 时为哥达鸭）。队伍中最强的可达鸭或哥达鸭追加超能属性与额外特性脑核之力，特攻、速度种族值各 +20。');
add('gold', 'ascent', '登龙', '切割类招式命中后跃至空中。下一回合落地，仍可自由选择招式，该次招式威力 +20%；不额外释放弹跳。');
add('prismatic', 'restinball', '进球休息', '你的队伍获得额外特性再生力与自然回复，之后入队的伙伴同样生效。');
add('gold', 'lifepower', '氪命', '伤害 ×1.3；伤害招式成功造成伤害后失去最大 HP 的 10%。按生命宝珠处理，变化招式和打空不扣血，仍受魔法防守等影响。');
add('silver', 'rocketcatch', '入职火箭队', '可向普通训练家、火箭队及商店挑战的宝可梦投球。所有固定首领均不可捕捉；捕获后对方仍有成员时继续对战。每次捕捉 NPC 的宝可梦失败，对手会十分生气：对方全队各随机提升攻击、防御、特攻、特防或速度中的一项 2 级，后续派出的成员也会获得加成。');
add('prismatic', 'arsenal', '诸武精通', '你的队伍获得额外特性变换自由。每只伙伴携带的伤害招式，每覆盖一种属性，受到的伤害减少 5%；相同属性只计算一次。');
add('gold', 'capturebonus', '带资进组', '每次投球成功捕获伙伴，按楼层阶段额外获得 200～600 金币和一件补给。赠送伙伴不触发，同一对象不重复领取。');
add('prismatic', 'speedpower', '天下武功，唯快不破', '全队速度 ×1.5；每 100 点最终速度使伤害招式威力增加 1%（500 速度增加 5%），不设上限。');
add('gold', 'fantasysix', '最终幻想6', '获得 200 幻想碎片。队伍恰好六名伙伴且全部为幻想宝可梦时，可将幻想碎片按每片 150 金币兑换。');
add('prismatic', 'hero', '英雄登场', '获得一只随机三星宝可梦，六维为原本的 150%。极低概率获得神兽！');
add('prismatic', 'powerchoice', '大力士？大法师！', '选择大力士（攻击 ×2）或大法师（特攻 ×2），作为额外特性赋予一只指定伙伴。替换成员后不转移给新伙伴。');
add('silver', 'reservemega', '预定超进化', '通关第 100 层后，解锁超进化并自选一颗超级石。', { floors: [50] });
add('silver', 'reservegmega', '预定超级巨（？）', '通关第 100 层后，解锁超巨进化系统，并获得一个超巨进化许愿星。', { floors: [50] });
add('silver', 'reservetera', '预定太晶化', '通关第 100 层后，解锁太晶化并获得 50 片自选属性的太晶碎片。改变伙伴太晶属性需消耗对应碎片 50 片。', { floors: [50] });
add('silver', 'reservez', '预定Z招式', '通关第 100 层后，解锁 Z 招式并自选一颗 Z 纯晶。', { floors: [50] });
add('silver', 'coin', '命运决定一切', '每次伤害类出招抛一次硬币：正面伤害 ×1.5，反面 ×0.5；多段共用结果。');
add('silver', 'dice', '灌铅骰子', '明确的抛硬币总为正面，掷骰子总为最大点数。', { floors: [50] });
add('silver', 'friend', '来个好伙计！', '随机获得一只本局未捕获的二星伙伴（六维 ×1.2），受开局偏爱卡片影响。极低概率获得神兽！');
add('silver', 'catcher', '我收服，宝可梦了', '最终捕捉成功率 ×1.5，最高 100%；与哲尔尼亚斯乘算。');
add('silver', 'battletask', '战斗，爽', '可选路线必含战斗；完成 15 个完整战斗区域后获得一次随机奖励。三战区域计一次。');
add('silver', 'eventtask', '事件，爽', '可选路线必含事件；完成 15 个事件区域后获得一次随机奖励。');
add('silver', 'supercombo', '效果绝佳，还是效果绝佳', '连续造成效果绝佳伤害，每次出招使全队双攻累计 +10%；未达成即清零，换人保留，每场重算。');
add('silver', 'lowhp', '不残血不会玩', 'HP 低于 1/3 时双攻各 +1 级，每只每场一次。');
add('silver', 'pivot', '这才是游击', '伤害类招式命中后按急速折返的方式换人，打空不换。');
add('silver', 'swapstats', '耐久转输出', '交换常驻攻击与防御、特攻与特防，HP、速度不变。');
add('silver', 'kid', '小鬼当家', '获得进化奇石。进化奇石不可取下；携带者不能进化为最终形态，仍能进化时双攻额外 +30%。');
add('silver', 'slacker', '高质量摸鱼', '获得请假王；懒惰回合可使用自己携带的偷懒。', { floors: [100, 150] });
add('silver', 'passdrops', '换谁都一样', '对方换人时，下一名继承离场成员降低的能力等级，包含濒死替换。');
add('silver', 'bond', '就决定是你了', '初始伙伴满亲密度后开始积累羁绊，约 25～30 层叠满；满后伤害取最大浮动，10% 概率以 1 HP 挺过致命攻击，每场一次。');
add('silver', 'pandorasilver', '潘多拉的装备·银', '每进入下一层，背包装备、属性增强物、宝石、树果、幻想对战道具和属性转各自在本类别随机。已携带和进化专用道具不变。');
add('silver', 'detect', '这才叫看穿', '成功使用看穿后，下一回合要害等级 +2。');
add('silver', 'reservation', '预定幻想', '指定伙伴，第 100 层幻想化；未进化到对应阶段则保留资格。无合适伙伴时赠送一只随机符合条件的伙伴，极低概率获得神兽！', { floors: [50], target: 'fantasy' });
add('silver', 'money', '来财，来', '立即获得金币。');
add('gold', 'starquest', '下一站，巨星', '获得随机伙伴，累计击倒第 10／60／180 名对手时各升一星，最高四星。极低概率获得神兽！', { floors: [50] });
add('gold', 'weakness', '弱点多多益善', '全队每个四倍弱点提供一层减伤，最多十层；受到的效果绝佳伤害除以 1＋0.1×层数。');
typed('gold', 'typexp', label => `如果你是${label}，也好`, '获得对应属性转；对应属性伙伴的对战经验 +30%。', { emblem: true });
for (const [type, label] of Object.entries({ sunnyday: '大晴天', raindance: '下雨', sandstorm: '沙暴', snow: '下雪',
	electricterrain: '电气场地', psychicterrain: '精神场地', grassyterrain: '青草场地', mistyterrain: '薄雾场地', trickroom: '戏法空间' })) {
	add('gold', 'overtime' + type, '加时赛', `我方引起的${label}多持续 3 回合，与延长道具相加；永久效果不变。`, { family: 'overtime', type });
}
add('gold', 'singer', '世界第一的公主殿下', '每场最强美洛耶塔获得额外天籁之音、极智能特性。与舞！舞！舞！互斥。');
add('gold', 'dancer', '舞！舞！舞！', '每场最强美洛耶塔登场变为舞步形态，获得额外舞者，并解锁胜利之舞。与世界第一的公主殿下互斥。');
add('gold', 'ordinary', '愤怒的普通宝可梦', '全队原始种族值均不超过 500 时，获得更多对战经验和贵重战利品；150 层版有少量额外奖励。');
add('gold', 'smallfinal', '谁说我到头了', '原始种族值不超过 400 且不能进化的成员，六项种族值 ×1.5；形态变化后重新判断。');
add('gold', 'prayer', '聚集的祈愿', '原本双攻种族值均低于 80 的伙伴倒下后，下一名同样符合条件的伙伴继承其 1/3 双攻，包含已继承数值，仅本场。下一轮前未在对战外换队，整组黄金概率升至 60%；若为黄金或一银一金一彩，黄金位置必出 Top Clear Mind。固定品质塔灵优先。', { floors: [50, 100] });
add('gold', 'topclearmind', 'Top Clear Mind', '我方全体招式先制度 +1。');
add('gold', 'hazards', '小心脚下', '指定队员获得额外特性岩布阵；我方造成的隐形岩、撒菱、碎菱钢伤害翻倍。', { target: 'member' });
add('gold', 'toxic', '曼陀罗饮品', '指定队员获得额外特性毒满地；我方施加的中毒、剧毒伤害翻倍。', { target: 'member' });
add('gold', 'dragonking', '龙王的工作', '六项常驻能力值总和最高的龙系伙伴成为龙王，自选额外特性龙之呼吸或降雨。龙王倒下后，剩余最强龙系继任并重选特性，仅持续本场。龙王以外成员战斗经验 +30%。');
add('silver', 'wine', '酒', '获得一次性道具「酒」：每次登场陷入混乱；每场首个实际使出的招式威力 ×2，变化招式或打空也消耗机会。与头孢同用会有特殊效果，尤其是毒系伙伴！');
add('silver', 'cephalosporin', '头孢', '获得一次性道具「头孢」：永久免疫中毒、剧毒、烧伤、麻痹、睡眠、冰冻与冻伤，不免疫混乱。与酒同用会有特殊效果，尤其是毒系伙伴！');
add('gold', 'stackstatus', '异常大满贯', '我方施加的烧伤、麻痹、睡眠、中毒、剧毒、冻伤、冰冻可共存，绕过属性免疫；仍受特性、场地、神秘守护阻挡。');
add('gold', 'starters', '最初的伙伴', '选择一只御三家加入。队内每只御三家使所有御三家减伤 5%；满亲密度后开始积累羁绊。', { target: 'starter' });
add('gold', 'bugchoir', '林间大合唱', '队伍每携带一个虫鸣，全队虫鸣威力 +10。');
add('gold', 'pandoragold', '潘多拉的装备·金', '获得两个工具箱，并每层将背包装备在各自类别内随机转换。与白银版互斥。');
add('gold', 'survive', '留得青山在', '有可上场后备时，直接攻击或混乱自伤的致命伤害保留 1 HP，随后选择换人；每只每场一次。');
add('gold', 'seeds', '呃啊种子种子', '寄生种子每次吸取最大 HP 的 1/6，目标换下后由同一位置的下一名继承。');
add('gold', 'secondchoice', '别那么讲究', '获得讲究头带、眼镜、围巾。所有讲究装备改为锁定登场后实际使出的第二招。');
add('gold', 'bigmoney', '金金金金钱钱钱钱', '立即获得大量金币。');
add('prismatic', 'learnall', '简单，我学，我会', '全队增加第五个招式位；每只伙伴可自选学会一个合法而尚未掌握的招式。后来入队的伙伴也可领取，同一个体本局只领取一次。');
add('prismatic', 'style', 'S级压轴秀', '与上次不同的招式成功造成伤害，评价 F→E→D→C→B→A→S，全队双防每级 +10%。其他行动只暂停。S 时可消耗评价使用额外 Z 招式，每场重算。');
add('silver', 'medic', '自带医疗队', '每场战斗胜利或捕捉成功后，存活成员恢复 25% 最大 HP 并解除异常状态，不复活濒死伙伴；失败和撤退不触发。');
add('prismatic', 'insight', '濒死悟道', '击倒或从濒死复活获得领悟，初始每次 +1，上限 100。满层承受致命伤时消耗领悟回满 HP，之后每次所得层数 +1。');
add('prismatic', 'inheritmoves', '这一招，交给你', '倒下后将第一招和已有继承招式交给下一名伙伴，本场额外携带并保留剩余 PP，换下不丢失。');
add('prismatic', 'entrance', '闪亮再登场', '每次登场，本场招式威力累计 +5%，首次也计入，换下不清零。');
add('prismatic', 'meltan', '钢铁是糖炼的', '获得美录坦及 200 糖果。持有美录坦时击倒或捕捉钢系得 10 糖果，400 进化。最强美录梅塔解锁钢拳双击、钢招无视抵抗；幻想化后解锁充电光束、电招无视地面免疫，并获超巨进化许愿星。', { floors: [50] });
add('prismatic', 'swords', '打磨圣剑', '三圣剑使用圣剑时，本场随机一项非 HP 能力 +10%。每累计 15 次，可指定一种尚未奖励的圣剑士永久获得额外锋锐，三种各一次。');
add('prismatic', 'execute', '飞身重...踢？', '每满 100 最大 HP 获得 4% 处决线；招式实际伤及目标后，其剩余 HP 比例低于处决线则击倒。不设上限。');
add('prismatic', 'hpgrowth', '越打命越硬', '每击倒一名对手，该伙伴本局永久增加 2 点最大及当前 HP，在星级倍率后相加。');
add('prismatic', 'regis', '传说的巨人们', '精英区域依次遇见未完成的五神柱，击败或捕捉获对应属性转。集齐后下一次固定幻想精英变成雷吉奇卡斯·幻想；必须赶在 170 层前完成，胜利可获奖励与该伙伴。', { floors: [100], emblem: true });
add('prismatic', 'sound', '全队开麦', '声音招式伤害增加全队实际携带声音招式数 ×4%，所有招式位都计入。');
add('prismatic', 'multihit', '还没打完呢', '连续攻击招式最低、最高次数翻倍。三旋击逐下判断命中，六击威力 20／40／60／80／100／120。');
add('prismatic', 'hoopa', '猜猜下一招', '获得胡帕。每场最强胡帕恶、幽灵招式威力 +50%；异次元洞／猛攻后额外调用一次队伍携带的合法招式。', { floors: [100, 150] });
typed('prismatic', 'typelink', label => `${label}是纽带 会不断传承`, '获得对应属性转；对应属性招式威力 +30%，本场有同属性伙伴倒下后改为 +50%。', { emblem: true });
typed('prismatic', 'typeevolution', label => `宝可梦${label === '龙' ? '龙血' : label}进化`, '选择对应属性的长期强化方向，此后每十层选一次小强化；100／150 层改选强化方向，不再抽普通祝福。', { floors: [50] });
for (const [tier, title] of [['silver', '白银'], ['gold', '黄金'], ['prismatic', '棱彩']] as const) {
	add(tier, `fate${tier}`, `${title}命运`, `获得一个符合当前条件的随机黄金阶祝福和金币奖励。赠送的祝福不再增加对手等级，也不会再次抽到命运。`);
}
add('prismatic', 'psychic', '灵能百分百', '全队共用灵能：击倒对手 +3%，完成事件 +8%，被对手击倒额外 +20%，事件负面结果额外 +25%。超过 100% 后积攒效率降至 5%。灵能达到 100% 时，可在对战中消耗全部灵能发动一次一击必杀，占用一次行动；无视守住、替身且必中场上目标。');
export const ROGUE_BLESSINGS: readonly BlessingDefinition[] = definitions;
// Resolve saved offers from before the eighteen typed friend variants were consolidated.
export const blessing = (id: string) => ROGUE_BLESSINGS.find(entry => entry.id ===
	(Object.keys(BLESSING_TYPES).some(type => id === 'friend' + type.toLowerCase()) ? 'friend' : id));
export const ownsBlessing = (state: BlessingEffects | undefined, family: string) => state?.owned.find(entry => entry.family === family);
export function blessingTitle(entry: Pick<OwnedBlessing, 'id' | 'floor'>) {
	const def = blessing(entry.id);
	return (def?.name || entry.id) + (['money', 'battletask', 'eventtask', 'ordinary'].includes(def?.family || '') ?
		'+'.repeat(Math.max(0, Math.min(2, entry.floor / 50 - 1))) : '');
}
