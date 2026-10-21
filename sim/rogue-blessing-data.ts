/** Shared, versioned blessing data. Only the campaign server grants these effects. */
export type BlessingTier = 'silver' | 'gold' | 'prismatic';
export interface OwnedBlessing {
	id: string; family: string; tier: BlessingTier; floor: number; type?: string;
	target?: string; progress?: number; milestones?: number[]; completed?: boolean;
	grantedBy?: string;
	/** Fantasy reservation fulfilled early using the owner's shards. */
	reservedShards?: number;
}
export interface TypeEvolution {
	type: string; direction: 'resistance' | 'moves' | 'stats';
	defense: Record<string, number>; offense: Record<string, number>;
	stats: Partial<StatsTable>; power: number; extras: string[];
}
export interface BlessingEffects {
	companionZ?: { companion: 'marnie' | 'roxie' | 'lacey', member: string, spent?: boolean };
	companions?: import('./rogue-companions').RogueCompanion[];
	dragonKing?: import('./rogue-blessing-permanent').DragonKing;
	owned: OwnedBlessing[];
	evolution?: TypeEvolution;
	psychic?: number;
}
/** Each paid selection adds to the run total; granted blessings never charge a second time. */
export const blessingLevelCost = (tier: BlessingTier, floor: number, fixedBoss = false) =>
	(tier === 'gold' ? 5 : tier === 'prismatic' ? 10 : 0) *
	(Math.max(0, Math.min(3, Math.floor(floor / 50))) + (fixedBoss ? 1 : 0));
export function addPsychicCharge(current: number, amount: number) {
	const ordinary = Math.max(0, Math.min(amount, 100 - current));
	return Math.round((current + ordinary + (amount - ordinary) * 0.05) * 100) / 100;
}
export interface RogueStatModifiers {
	compound?: boolean;
	compoundBonus?: Partial<StatsTable>;
	training?: Partial<StatsTable>;
	nature?: string;
	emblem?: string;
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
	Electric: ['boltstrike', 'supercellslam', 'thunderbolt', 'voltswitch', 'thunderwave'],
	Fairy: ['playrough', 'spiritbreak', 'moonblast', 'drainingkiss', 'moonlight'],
	Fighting: ['closecombat', 'drainpunch', 'focusblast', 'aurasphere', 'bulkup'],
	Fire: ['flareblitz', 'ragingfury', 'flamethrower', 'overheat', 'willowisp'],
	Flying: ['bravebird', 'acrobatics', 'hurricane', 'razorwind', 'roost'],
	Ghost: ['poltergeist', 'phantomforce', 'shadowball', 'nightshade', 'curse'],
	Grass: ['woodhammer', 'powerwhip', 'energyball', 'leafstorm', 'cottonguard'],
	Ground: ['earthquake', 'headlongrush', 'earthpower', 'scorchingsands', 'spikes'],
	Normal: ['doubleedge', 'extremespeed', 'terablast', 'triattack', 'swordsdance'],
	Ice: ['tripleaxel', 'iciclecrash', 'icebeam', 'blizzard', 'powdersnow'],
	Poison: ['gunkshot', 'poisonjab', 'sludgebomb', 'sludgewave', 'toxic'],
	Psychic: ['zenheadbutt', 'psychicfangs', 'expandingforce', 'psyshock', 'trickroom'],
	Steel: ['ironhead', 'heavyslam', 'flashcannon', 'steelbeam', 'irondefense'],
	Rock: ['rockthrow', 'stoneedge', 'powergem', 'meteorbeam', 'stealthrock'],
	Water: ['wavecrash', 'flipturn', 'hydropump', 'scald', 'raindance'],
};
export const EMBLEM_MOVE_NAMES: Record<string, string[]> = {
	Bug: ['急速折返', '超级角击', '虫鸣', '死缠烂打', '黏黏网'],
	Dark: ['拍落', '突袭', '恶之波动', '大声咆哮', '诡计'],
	Dragon: ['逆鳞', '鳞射', '流星群', '龙之波动', '龙之舞'],
	Electric: ['雷击', '闪电强袭', '十万伏特', '伏特替换', '电磁波'],
	Fairy: ['嬉闹', '灵魂冲击', '月亮之力', '吸取之吻', '月光'],
	Fighting: ['近身战', '吸取拳', '真气弹', '波导弹', '健美'],
	Fire: ['闪焰冲锋', '大愤慨', '喷射火焰', '过热', '鬼火'],
	Flying: ['勇鸟猛攻', '杂技', '暴风', '旋风刀', '羽栖'],
	Ghost: ['灵骚', '潜灵奇袭', '暗影球', '黑夜魔影', '诅咒'],
	Grass: ['木槌', '强力鞭打', '能量球', '飞叶风暴', '棉花防守'],
	Ground: ['地震', '突飞猛扑', '大地之力', '热沙大地', '撒菱'],
	Normal: ['舍身冲撞', '神速', '太晶爆发', '三重攻击', '剑舞'],
	Ice: ['三旋击', '冰柱坠击', '冰冻光束', '暴风雪', '细雪'],
	Poison: ['垃圾射击', '毒击', '污泥炸弹', '污泥波', '剧毒'],
	Psychic: ['意念头锤', '精神之牙', '广域战力', '精神冲击', '戏法空间'],
	Steel: ['铁头', '重磅冲撞', '加农光炮', '铁蹄光线', '铁壁'],
	Rock: ['落石', '尖石攻击', '力量宝石', '流星光束', '隐形岩'],
	Water: ['波动冲', '快速折返', '水炮', '热水', '求雨'],
};
export function emblemDescription(type: string) {
	return `【${BLESSING_TYPES[type]}属性转】。赋予后将副属性改为${BLESSING_TYPES[type]}属性，单属性伙伴则新增该属性。` +
		`不占道具位，可取下；赋予期间开放${EMBLEM_MOVE_NAMES[type].map(name => `【${name}】`).join('、')}。`;
}
export const BLESSING_STAGES = [1, 50, 100, 150] as const;
export const STAGED_BLESSING_FAMILIES = ['shopraid', 'rocketcatch', 'battletask', 'eventtask', 'money', 'medic', 'capturebonus', 'bigmoney'];
/** Quest payouts belong to the selected version, not the eventual completion floor. */
export function taskRewardTier(floor: number) {
	const stage = blessingStage(floor);
	return { stage, candy: ['expcandyxs', 'expcandys', 'expcandym', 'expcandyl'][stage],
		candyCount: [12, 6, 4, 3][stage], milestoneCandy: [4, 2, 1, 1][stage],
		coins: [300, 600, 1000, 1500][stage], shards: [15, 20, 35, 50][stage],
		level: [5, 25, 50, 75][stage], itemCoins: [0, 0, 2000, 5000][stage] };
}
export const blessingStage = (floor: number) => Math.max(0, Math.min(3, Math.floor(floor / 50)));
export const blessingCoins = (family: string, floor: number) =>
	(family === 'bigmoney' ? [10000, 20000, 30000, 40000] : [4000, 8000, 12000, 16000])[blessingStage(floor)];
export const medicRecovery = (_floor: number) => 15;
export const treasureBudget = (floor: number) => [3000, 6000, 12000, 19000][blessingStage(floor)];
export const lateBlessingReward = (family: string, floor: number) => {
	const stage = blessingStage(floor);
	return { treasure: stage && ['rocketcatch', 'battletask', 'eventtask', 'capturebonus'].includes(family) ? 1 : 0,
		toolboxes: family === 'shopraid' ? [0, 1, 1, 2][stage] : 0,
		advanced: family === 'shopraid' && stage === 2 };
};
export const OVERTIME_ABILITIES: Record<string, string> = {
	sunnyday: 'drought', raindance: 'drizzle', sandstorm: 'sandstream', snow: 'snowwarning',
	electricterrain: 'electricsurge', psychicterrain: 'psychicsurge', grassyterrain: 'grassysurge', mistyterrain: 'mistysurge',
};
const OVERTIME_ABILITY_NAMES: Record<string, string> = {
	sunnyday: '日照', raindance: '降雨', sandstorm: '扬沙', snow: '降雪',
	electricterrain: '电气制造者', psychicterrain: '精神制造者', grassyterrain: '青草制造者', mistyterrain: '薄雾制造者',
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
add('silver', 'shopraid', '零元购', '可挑战商店守卫，获胜后随机获得店内三种商品，各 1 件。挑战结束后商店关闭。');
for (const [tier, suffix, total] of [['gold', '金', 525], ['prismatic', '彩', 650]] as const) {
	add(tier, `compound${tier}`, `五号化合物·${suffix}`, `选一名伙伴，将选定最终进化型的种族值总和补至 ${total}，新增点数由你自由分配。` +
		'只能增加原有种族值；进化前形态同步获得新增点数，分支进化锁定所选方向。当前形态原始种族值总和超过 500 时，新增点数失效。主特性永久锁定为【化学之力】，额外特性保留。', { family: 'compound' });
}
add('prismatic', 'renewable', '可再生资源', '获得 1 个随机一次性对战道具。全队使用一次性携带道具后不消耗道具。');
add('prismatic', 'mousefamily', '电气鼠大家庭', '获得 1 只随机电气鼠。队伍六只均为电气鼠时，共享已掌握招式及不同携带道具的效果，幻想道具和 Mega【雷丘】同样适用。【电气球】对全队生效；相同道具不叠加，一次性道具全队共用消耗。');
add('prismatic', 'eeveefamily', '伊布大家族', '获得【伊布】与 1 颗自选的伊布进化石。队伍六只均为伊布家族成员时，每只每场可额外使用 1 次【九彩升华齐聚顶】。这次使用不消耗本回合行动，随后仍会使用本回合选择的招式。');
add('gold', 'duck', '嘶~头疼', '获得【可达鸭】（赠送等级达到 33 时改为【哥达鸭】）。最强的【可达鸭】或【哥达鸭】增加超能属性和额外特性【脑核之力】，特攻、速度种族值各 +20。');
add('gold', 'ascent', '登龙', '切割招式命中后跃至空中。下一回合落地时可自由选择招式，该次招式威力提升 30%。落地回合及其下一回合不能再次跃起。');
const companionZText = '额外 Z 不消耗常规 Z 次数，本局爬塔仅可释放一次；逃跑返还次数，通关卡每场对战重新获得一次机会。命中后使用者攻击、防御、特攻、特防、速度各提升 1 级。';
add('gold', 'companionband', '少女乐队的呐喊', '选择【玛俐】或【霍米加】同行。【玛俐】使最强恶系伙伴自选额外特性【暗黑气场】或【威吓】，可为任意一名恶系伙伴将【大声咆哮】转化为恶系声音特殊额外 Z【熙熙攘攘我们的城市】；【霍米加】使最强毒系伙伴自选【毒污皮肤】或【朋克摇滚】，可为任意一名毒系伙伴将【污泥波】转化为毒系声音特殊额外 Z【熙熙攘攘我们的城市】。威力 185，选定伙伴后固定。' + companionZText);
add('gold', 'companionlacey', '粉色妖精小姐♪', '【紫芋】同行，最强妖精系伙伴自选额外特性【妖精气场】或【天籁之音】。可为任意一名妖精系伙伴将【嬉闹】转化为妖精系群攻物理额外 Z【致以无瑕之人】，威力 185，选定伙伴后固定。' + companionZText);
add('gold', 'companionkahili', '一杆青空', '【卡希丽】同行，最强飞行系伙伴自选额外特性【飞行皮肤】或【技术高手】。飞行系伙伴战斗经验提升 30%、获得的努力值翻倍。');
add('gold', 'companionliko', '千恋万花', '【莉可】同行，最强草系伙伴自选额外特性【花之礼】或【青草制造者】。每次进入下一层时，每只草系伙伴各有 30% 概率拾来一份战利品。');
add('gold', 'companiongiovanni', '黑衣人', '【坂木】同行，最强超能系伙伴自选额外特性【精神制造者】或【强行】。超能系伙伴击倒对手时，自身从该对手获得的经验提升 20%，该对手对应的战利品数量提升 20%。');
add('gold', 'companionlysandre', '奥本海默', '【弗拉达利】同行，偏好战斗选项。完成精英区域后获得少量伤药。最强火系伙伴自选额外特性【火焰鬃毛】或【熔岩铠甲】。');
add('gold', 'companionolivia', '石纪元', '【莉兹】同行，【赌石】出现权重提升 30%，开出高价值物品的概率提升。击倒或捕捉岩石系对手时，战利品数量提升 20%。最强岩石系伙伴自选额外特性【沙之力】或【扬沙】。');
add('gold', 'companionwinter', '冰属性男子与酷酷女同事', '选择【古鲁夏】或【辛俐】同行，偏好遇见宝可梦的选项。【古鲁夏】使【雪山速滑】出现权重提升 30%、奖励提高一档；最强冰系伙伴自选【雪之力】或【降雪】。【辛俐】使每只地面系伙伴每场结束后有 30% 概率找到物资；最强地面系伙伴自选【持久力】或【遇水凝固】。');
add('prismatic', 'mushroomsynthesis', '合成大蘑菇', '随机获得一只蘑菇伙伴，可向任意蘑菇伙伴投喂战利品蘑菇：【小蘑菇】使双攻永久 +0.3%，【大蘑菇】使双防永久 +1.5%，【芳香蘑菇】使双攻、双防永久 +3%。每只独立累计，以上为初始收益；累计增幅越高，后续收益越低，可持续叠加。投喂前可查看实际增幅。第 100 层起可能获得【猛恶菇】，第 150 层起概率提高。');
add('gold', 'companionbea', '流汗吧健身少女', '【彩豆】同行，偏好伽勒尔与战斗选项。最强格斗系伙伴自选额外特性【毅力】或【活力】；格斗系战斗经验 +30%、努力值翻倍。累计听从 15 次偏好选择，本局获得一次【同行训练家的赠礼】。');
add('gold', 'companionacerola', '看得见的女孩', '【阿塞罗拉】同行，偏好阿罗拉与遇见宝可梦的选项。选择最强幽灵系伙伴获得【噩梦缠绕】或【鬼影】，或最强一般系获得【心眼】或【破格】。每次进入下一层时，幽灵系和一般系伙伴各有 30% 概率立即找到一份物资。累计听从 15 次偏好选择，本局获得一次【同行训练家的赠礼】。');
add('gold', 'companionlana', '放学后海堤日记', '【水莲】同行，【永不空军！】出现权重提升 30%，成功钓鱼的收获提高一档。最强水系伙伴自选额外特性【超级雨水】或【悠游自如】；击倒或捕捉水系对手时，全队所得经验 +20%。累计参与 15 次钓鱼，本局获得一次【同行训练家的赠礼】。');
add('gold', 'companionstreamer', '主播女孩重度依赖', '选择【奇树】或【卡娜莉】同行，偏好事件中的战斗选项。听从建议后，该事件获得的金币、普通物资和幻想碎片数量 +25%（不足 1 件的部分累计）。最强电系伙伴自选额外特性【电气皮肤】或【雷霆行者】。累计听从 15 次偏好选择，本局获得一次【同行训练家的赠礼】。');
add('gold', 'companionpoppy', '钢之炼金术士', '【波琵】同行，偏好奖励相关选项。奖励区域出现权重提升 30%；每次完成奖励区域，每只钢系伙伴有 40% 概率带回 1 颗当前档位经验糖果。最强钢系伙伴自选额外特性【钢之意志】或【铁铠】。');
add('gold', 'companionguzma', '虫师', '【古兹马】同行，偏好战斗选项。战斗获得的战利品数量提升 20%。最强虫系伙伴自选额外特性【有色眼镜】或【回避再生】。');
add('prismatic', 'railgun', '某科学的超电磁炮', '让一名合法可学的伙伴立即学会【电磁炮】。队伍中六项能力值总和最高、携带【电磁炮】的伙伴，在对战中永久获得【电磁漂浮】；它的【电磁炮】升级为【超电磁炮】，威力 240、命中率 100%。');
add('prismatic', 'rulebreaker', '规则，就是用来打破的', '拥有主特性或额外特性【破格】的伙伴，无视自身能力下降与天气减益；出招无视对手的防御能力提升、道具与特性减伤、【守住】类保护、【替身】、【反射壁】、【光墙】、【极光幕】及属性免疫。');
add('silver', 'companionai', '乐园防卫程序', '选择【奥琳 AI】或【弗图 AI】同行。每次挑战先由 AI 预演一次：获胜可接受结果，也可亲自出战；失败则亲自挑战。未接受的预演不保留消耗、奖励或成长。');
add('prismatic', 'restinball', '进球休息', '全队获得额外特性【再生力】与【自然回复】。每场战斗结束后，存活伙伴恢复 25% 最大 HP，并解除异常状态。与【自带医疗队】互斥。');
add('gold', 'lifepower', '氪命', '伤害提升 30%；伤害招式命中后损失最大 HP 的 10%。扣血规则与【生命宝珠】相同，可被【强行】或【魔法防守】免除。');
add('gold', 'explosionart', '艺术就是爆炸', '全队【自爆】【大爆炸】的最终伤害提升 50%。因自身使用这两个招式而倒下时，不扣亲密度，仍可正常领取应得的战斗经验；其他原因倒下不享受此效果。');
add('silver', 'rocketcatch', '入职火箭队', '可捕捉普通训练家、火箭队和商店挑战的宝可梦，固定首领除外。每次捕捉失败，对方全队各随机一项能力提升 2 级，后备登场时生效。');
add('prismatic', 'arsenal', '诸武精通', '全队获得额外特性【变换自由】。每只伙伴携带的伤害招式每覆盖一种属性，自身受到的伤害减少 5%。');
add('gold', 'capturebonus', '带资进组', '每次捕捉成功，额外获得 400～1000 金币、1 件随机补给及经验糖果。40 层前为【经验糖果 XS】×4；40／80／120／160 层起分别为【经验糖果 S／M／L／XL】×1。');
add('prismatic', 'speedpower', '天下武功，唯快不破', '全队速度提升 50%；每 100 点最终速度，使伤害招式威力提升 5%。可为一名伙伴赋予额外特性【加速】。', { target: 'member' });
add('prismatic', 'spiral', '我的钻头是可以突破天际的', '按当前等级获得一只螺钉地鼠或龙头地鼠。它参战积攒螺旋力，击倒获得更多；收益逐渐衰减，上限 1000。每点螺旋力使物攻 +0.1%；达到 250 后每场首次致命伤保留 1HP。到达 100 层获得龙头地鼠进化石并解锁超进化，最强龙头地鼠超进化后的特性变为【突破天际的钻头】：贯穿钻、破格，地面招式可命中飞行系。');
add('prismatic', 'godrobe', '神衣鲜血', '获得一只猫鼬斩，最强猫鼬斩获得额外特性【锋锐】【汲取苏生】。出招前可消耗当前 HP 的 10%，本次伤害 +50%；每场首次致命伤改为恢复至 50% HP。HP 越低，双防连续提升：满血 ×1、半血 ×1.5、四分之一血 ×3，上限 ×6。更易遇到伊裴尔塔尔，击败或捕获后伤害强化提升至 +60%，耐久额外增幅提升 15%。');
add('prismatic', 'puregodrobe', '神衣纯洁', '按当前等级获得一只雌性妙喵或雌性超能妙喵，最强对应伙伴获得额外特性【坚毅】【强行】，超进化后保留。回合结束消耗当前 HP 的 10%；每场首次降至半血时混乱、特攻 +1。低血量耐久与【神衣鲜血】相同。更易遇到莱希拉姆，击败或捕获后不再混乱、回合消耗降至 7%，耐久额外增幅提升 15%。');
add('prismatic', 'killlagirl', '斩服少女', '接下来两次精英区域依次遭遇满努力值、满个体值的强大伊裴尔塔尔与莱希拉姆。胜利后可选择必定成功的捕捉。两者均捕获入队后，可分别继承【神衣鲜血】与【神衣纯洁】全部效果。');
add('gold', 'fantasysix', '最终幻想6', '获得 200 幻想碎片。队伍六只均为幻想宝可梦时，可按每片 150 金币兑换幻想碎片。立即获得一只有幻想形态或最终进化型有幻想形态的伙伴。');
add('gold', 'hero', '英雄登场', '获得 1 只随机三星宝可梦，六项能力为原本的 150%。极低概率获得神兽！');
add('prismatic', 'powerchoice', '大力士？大法师！', '指定一只伙伴，赋予额外特性【大力士】（攻击翻倍）或【大法师】（特攻翻倍）。');
add('silver', 'reservemega', '预定超进化', '通关第 100 层后解锁超进化，并自选 1 颗【超级石】。选择祝福时，队内没有进化链上可超级进化的伙伴则随机赠送一只。', { floors: [1] });
add('silver', 'reservegmega', '预定超极巨（？）', '通关第 100 层后解锁超巨进化，并获得 1 个【超巨进化许愿星】。选择祝福时，队内没有幻想后可超巨进化的伙伴则随机赠送一只。', { floors: [1] });
add('silver', 'reservetera', '预定太晶化', '通关第 100 层后解锁太晶化，并领取两份自选属性的【太晶碎片】，每份 50 片，可选不同属性，用于改变两只伙伴的太晶属性。', { floors: [1] });
add('silver', 'reservez', '预定Z招式', '通关第 100 层后解锁 Z 招式，并自选 1 颗【Z 纯晶】。立即随机赠送一只进化链上有专属 Z 纯晶或幻想后可霸主化的伙伴。', { floors: [1] });
add('silver', 'coin', '命运决定一切', '每次使用伤害招式时抛硬币：正面伤害提升 50%，反面伤害减半。');
add('silver', 'dice', '灌铅骰子', '抛硬币必为正面，掷骰子必为最大点数。', { floors: [1] });
add('silver', 'friend', '来个好伙计！', '获得 1 只本局未捕获过的随机二星宝可梦，六项能力为原本的 120%。极低概率获得神兽！');
add('silver', 'catcher', '我收服，宝可梦了', '捕捉效率提升 1.5 倍（成功率变为原来的 1.5 倍），最高达到 100%。');
add('silver', 'battletask', '战斗，爽', '路线选项必有战斗。完成 15 个战斗区域后获得随机奖励，任务只能完成一次。');
add('silver', 'eventtask', '事件，爽', '路线选项必有事件。完成 15 个事件区域后获得随机奖励，任务只能完成一次。');
add('silver', 'supercombo', '效果绝佳，还是效果绝佳', '连续打出效果绝佳伤害，每次使全队双攻累计提升 10%。未打出效果绝佳时清零，换人保留，战后重置。');
add('silver', 'lowhp', '不残血不会玩', 'HP 低于 1/3 时，攻击与特攻各提升 1 级，每只每场一次。');
add('silver', 'pivot', '这才是游击', '伤害招式命中后，可像【急速折返】一样选择后备换上场。');
add('silver', 'swapstats', '耐久转输出', '全队交换攻击与防御、特攻与特防的常驻能力值。');
add('silver', 'kid', '小鬼当家', '获得【进化奇石】。携带后不可取下，也不能进化为最终形态；仍可进化的携带者双攻额外提升 30%。');
add('silver', 'slacker', '高质量摸鱼', '获得【请假王】。因【懒惰】无法行动的回合，可以使用已携带的【偷懒】。', { floors: [100, 150] });
add('silver', 'passdrops', '换谁都一样', '对手离场或倒下后，下一名上场的宝可梦继承其降低的能力等级。');
add('silver', 'bond', '就决定是你了', '初始伙伴亲密度增长提升 50%；亲密度满后，继续同行约 10 层即可积满羁绊。满羁绊时伤害浮动取最高值；受到致命攻击时，有 10% 概率保留 1 HP，每只每场最多一次。', { floors: [1] });
add('silver', 'pandorasilver', '潘多拉的装备·银', '每进入下一层，背包中的对战装备、属性增强道具、宝石、树果、幻想道具与属性转各自在同类中随机变化。已装备及进化专用道具不变。');
add('silver', 'detect', '这才叫看穿', '成功使用【看穿】后，下一次使出的伤害招式必定击中要害。');
add('silver', 'reservation', '预定幻想', '指定一只伙伴，在第 100 层变为幻想形态；尚未进化到对应阶段时，进化后生效。没有符合条件的伙伴时，随机赠送一只。极低概率获得神兽！', { floors: [1], target: 'fantasy' });
add('silver', 'money', '来财，来', '立即获得金币。');
add('gold', 'starquest', '下一站，巨星', '获得 1 只随机宝可梦。该伙伴累计击倒 10／90／180 名对手时，各升一星。极低概率获得神兽！', { floors: [1] });
add('gold', 'weakness', '弱点多多益善', '全队每有一个四倍弱点，受到的效果绝佳伤害就除以「1＋0.1×弱点数」，最多计算 10 个弱点，此时伤害减半。');
typed('gold', 'typexp', label => `如果你是${label}，也好`, '获得对应属性转；对应属性伙伴的对战经验提升 30%。', { emblem: true });
for (const [type, label] of Object.entries({ sunnyday: '大晴天', raindance: '下雨', sandstorm: '沙暴', snow: '下雪',
	electricterrain: '电气场地', psychicterrain: '精神场地', grassyterrain: '青草场地', mistyterrain: '薄雾场地', trickroom: '戏法空间', tailwind: '顺风' })) {
	add('gold', 'overtime' + type, '加时赛·' + label, `我方引起的【${label}】延长 3 回合。获得 1 只${OVERTIME_ABILITY_NAMES[type] ? `特性为【${OVERTIME_ABILITY_NAMES[type]}】` : `已学会【${label}】`}的随机宝可梦。`, { family: 'overtime', type });
}
add('gold', 'singer', '世界第一的公主殿下', '最强的【美洛耶塔】获得额外特性【天籁之音】与【极智能】。');
add('gold', 'dancer', '舞！舞！舞！', '最强的【美洛耶塔】登场时变为舞步形态，获得额外特性【舞者】，并学会【胜利之舞】。');
add('gold', 'ordinary', '愤怒的普通宝可梦', '全队伙伴原始种族值总和均不超过 500 时，全队伤害、对战经验与战利品增加。第 1／50、100、150 层取得时，增伤分别为 15%、20%、25%，经验与战利品数量分别增加 20%、30%、40%。');
add('gold', 'smallfinal', '谁说我到头了', '原始种族值总和不超过 400、且无法继续进化的伙伴，六项种族值提升 50%。');
add('gold', 'prayer', '聚集的祈愿', '原本双攻种族值均不高于 80 的伙伴倒下后，下一名符合条件的伙伴继承其 1/3 双攻，包含已继承的数值，持续本场。继承者 Mega 后保留加成，但不能再传递。下轮祝福前未在战斗外更换队员时，黄金祝福概率提高，出现黄金选项时必有【Top Clear Mind】。', { floors: [50, 100] });
add('gold', 'topclearmind', 'Top Clear Mind', '全队招式先制度 +0.5，在相同优先度下优先出招。无视【慢出】、【女王的威严】、【鲜艳之躯】、【尾甲】、【精神场地】和【戏法空间】。');
add('gold', 'hazards', '小心脚下', '指定伙伴获得额外特性【岩布阵】；我方布下的【隐形岩】、【撒菱】与【碎菱钢】伤害翻倍。', { target: 'member' });
add('gold', 'toxic', '曼陀罗饮品', '指定伙伴获得额外特性【不仁不义】；我方造成的中毒与剧毒伤害翻倍。', { target: 'member' });
add('gold', 'dragonking', '龙王的工作', '【爱丽丝】同行，偏好接触或获得宝可梦的选项。最强龙系伙伴成为龙王，自选额外特性【龙之呼吸】或【降雨】；倒下后，本场由剩余最强龙系继任并重选特性。龙王以外的龙系伙伴战斗经验提升 30%。累计听从 15 次偏好选择，本局获得一次【同行训练家的赠礼】。');
add('silver', 'wine', '酒', '获得 1 份【酒】：使用者每次登场陷入混乱，每场使出的第一个招式威力翻倍。与【头孢】同用会有特殊效果，尤其是毒系伙伴！');
add('silver', 'cephalosporin', '头孢', '获得 1 份【头孢】：使用者永久免疫中毒、剧毒、烧伤、麻痹、睡眠、冰冻与冻伤。与【酒】同用会有特殊效果，尤其是毒系伙伴！');
add('gold', 'stackstatus', '异常大满贯', '我方施加的烧伤、麻痹、睡眠、中毒、剧毒、冻伤与冰冻可以叠加，并无视属性免疫。');
add('gold', 'starters', '最初的伙伴', '自选 1 只御三家加入队伍。队内每有一只御三家，所有御三家受到的伤害减少 5%；亲密度满后可继续培养羁绊。', { target: 'starter' });
add('gold', 'bugchoir', '林间大合唱', '队伍每携带一个【虫鸣】，全队【虫鸣】威力提升 10 点。');
add('gold', 'pandoragold', '潘多拉的装备·金', '获得 2 个【工具箱】和 1 个随机幻想通用道具。每进入下一层，背包装备在各自类别内随机变化；已装备及进化专用道具不变。');
add('gold', 'survive', '留得青山在', '有可上场的后备时，伙伴受到攻击或混乱自伤的致命伤害会保留 1 HP，随后选择换人。每只每场一次。');
add('gold', 'seeds', '呃啊种子种子', '【寄生种子】每次吸取最大 HP 的 1/6；目标换下后，由接替上场的宝可梦继续承受。');
add('gold', 'secondchoice', '别那么讲究', '获得【讲究头带】、【讲究眼镜】与【讲究围巾】各 1 件。讲究道具改为锁定登场后使出的第二个招式。');
add('gold', 'bigmoney', '金金金金钱钱钱钱', '立即获得金币。');
add('prismatic', 'learnall', '简单，我学，我会', '全队增加第五个招式位。每只伙伴可自选学会 1 个可学但尚未掌握的招式，后来入队的伙伴同样可以领取。');
add('prismatic', 'style', 'S级压轴秀', '成功用不同于上一次的招式造成伤害时，评价提升一级，全队双防提升 10%，最高为 S 级、提升 60%。达到 S 级后可消耗评价使用一次额外 Z 招式，战后重置。');
add('silver', 'medic', '自带医疗队', '每场战斗结束后，存活伙伴恢复 15% 最大 HP，并解除异常状态。与【进球休息】互斥。');
add('prismatic', 'insight', '濒死悟道', '获得 10 个【活力块】。伙伴击倒对手或从濒死复活时积累领悟，初始每次 +1。满 100 后，受到致命伤害时消耗全部领悟并回满 HP，此后每次积累量 +1。队伍中陷入濒死的伙伴也能获得应有的对战经验。', { floors: [1] });
add('prismatic', 'inheritmoves', '这一招，交给你', '伙伴倒下后，将第一招和已继承的招式交给下一名上场伙伴。本场可额外使用这些招式，剩余 PP 一并继承。每只伙伴可自选学会 1 个可学但尚未掌握的招式，后来入队的伙伴同样可以领取。');
add('prismatic', 'entrance', '闪亮再登场', '每次登场，本场招式威力累计提升 5%，换下保留，战后重置。');
add('prismatic', 'meltan', '钢铁是糖炼的', '获得【美录坦】。携带它击倒或捕捉宝可梦可积累专属糖果：钢系每只 10 颗，非钢系每只 2 颗，集齐 400 颗可进化。最强的【美录梅塔】的钢系招式无视抵抗，并立即学会【钢拳双击】；其幻想化后立即获得一颗【超巨进化许愿星】，电系招式无视地面免疫，并立即学会【充电光束】。', { floors: [1] });
add('prismatic', 'swords', '打磨圣剑', '【勾帕路翁】、【代拉基翁】与【毕力吉翁】使用【圣剑】时，本场随机一项非 HP 能力提升 10%。累计使用 15 次，可指定一种圣剑士获得额外特性【锋锐】，每种一次。');
add('prismatic', 'execute', '飞身重...踢？', '每满 100 点最大 HP，处决线提升 5%。招式造成伤害后，若对手剩余 HP 比例低于处决线，立即将其击倒。');
add('prismatic', 'hpgrowth', '越打命越硬', '每击倒一名对手，该伙伴本局永久增加 2 点最大 HP，并恢复 2 HP。', { floors: [1] });
add('prismatic', 'regis', '传说的巨人们', '精英区域依次出现五神柱，击败或捕捉可获得对应属性转。集齐后，下一场固定幻想精英替换为【幻想雷吉奇卡斯】，获胜后获得该伙伴、50 幻想碎片、【藏宝袋】与【高级工具箱】各 1 个；其【捏碎】享有集齐五神柱的全部效果。须在第 170 层前集齐。', { floors: [100], emblem: true });
add('prismatic', 'sound', '全队开麦', '全队每携带一个声音招式，所有声音招式伤害提升 5%。');
add('prismatic', 'multihit', '还没打完呢', '连续攻击招式的攻击次数翻倍。【三旋击】可连续攻击六次，每击威力依次为 20／40／60／80／100／120。');
add('prismatic', 'hoopa', '猜猜下一招', '获得【胡帕】。最强的【胡帕】恶系与幽灵系招式威力提升 50%；使用【异次元洞】或【异次元猛攻】后，额外使出一个队伍携带的随机招式。', { floors: [100, 150] });
typed('prismatic', 'typelink', label => `${label}是纽带 会不断传承`, '获得对应属性转；全队对应属性招式威力提升 50%；本场每有同属性伙伴倒下一次，再增加 5 个百分点，复活后再次倒下同样计数。', { emblem: true });
typed('prismatic', 'typeevolution', label => `宝可梦${({ 龙: '龙血', 水: '水流', 冰: '冰魄', 草: '草木', 电: '电气', 火: '火焰', 虫: '虫群', 恶: '黑暗', 毒: '毒液', 钢: '钢铁' } as Record<string, string>)[label] || label}进化`, '获得 1 只随机对应属性宝可梦，极低概率获得神兽！自选抗性、招式或数值方向，立即强化一次，此后每 10 层强化一次。第 50／100／150 层可重选方向并立即强化，替代后续祝福选择，对手等级仍按棱彩祝福提升。', { floors: [1] });
for (const [tier, title] of [['silver', '白银'], ['gold', '黄金'], ['prismatic', '棱彩']] as const) {
	add(tier, `fate${tier}`, `${title}命运`, `获得 1 个随机${title}阶祝福及额外金币。`);
}
add('prismatic', 'psychic', '灵能百分百', '全队共用灵能：击倒对手 +4%，完成事件 +10%；伙伴被对手击倒额外 +25%，事件负面结果额外 +30%。攒满 100% 后，可消耗全部灵能使用一次一击必杀，无视【守住】、【替身】，必定命中场上目标。满后仍可积攒，但新增量仅为原来的 1/20，例如原本 +30% 改为 +1.5%。');
export const ROGUE_BLESSINGS: readonly BlessingDefinition[] = definitions;
// Resolve saved offers from before the eighteen typed friend variants were consolidated.
export const blessing = (id: string) => ROGUE_BLESSINGS.find(entry => entry.id ===
	(Object.keys(BLESSING_TYPES).some(type => id === 'friend' + type.toLowerCase()) ? 'friend' : id));
export const ownsBlessing = (state: BlessingEffects | undefined, family: string) => state?.owned.find(entry => entry.family === family);
export function blessingTitle(entry: Pick<OwnedBlessing, 'id' | 'floor'>) {
	const def = blessing(entry.id);
	return (def?.name || entry.id) + (STAGED_BLESSING_FAMILIES.includes(def?.family || '') ?
		'+'.repeat(blessingStage(entry.floor)) : '');
}
