import { NEW_CHALLENGES } from './challenge-rosters';
import { SERIOUS_CHALLENGES } from './challenge-sparring';
/** Tower adaptations of familiar Pokémon places and trainers; not reenactments of canonical events. */
export type ChallengeRole = 'physical' | 'special' | 'bulkyphysical' | 'bulkyspecial' |
	'wall' | 'specialwall' | 'screens' | 'slowphysical' | 'slowspecial';
export interface OptionalChallengeDefinition {
	id: string; name: string; kind: 'event' | 'trainer'; from: number; through: number;
	/** Relative weight inside the challenge pool; no influence on whether the route appears. */
	weight?: number; starLesson?: boolean;
	/** Portraits are also used before battle; companions are invited only after the one-time prize claim. */
	portraits?: string[]; companions?: string[]; serious?: boolean;
	speaker: string; opponent?: string; avatar: string; hint: string; opening: string[]; victory: string; retreat: string;
	team: [string, string, string, string[], ChallengeRole?][];
}
export const OPTIONAL_CHALLENGES: OptionalChallengeDefinition[] = [
	{
		id: 'dojoinvitation', name: '格斗道场的试招请帖', kind: 'event', from: 51, through: 100,
		speaker: '空手道大王', avatar: 'blackbelt', hint: '先制招式与击掌奇袭交替施压，留意换人时机。',
		opening: ['走廊尽头铺着熟悉的榻榻米。一位空手道家将请帖压在茶杯下，示意你先坐。',
			'⌈道场的修行，可不只是比谁出拳更重。你愿意让伙伴和我们试试招吗？⌋',
			'他把训练笔记与补给袋摆到一旁。你可以看过对方的阵容，再决定是否应邀。'],
		victory: '空手道大王郑重地向你行礼。⌈收放有度，才是真功夫。挑一份修行所得，带着伙伴继续走吧。⌋',
		retreat: '他收住拳势，让出了门口。⌈今日到此为止。知道何时停手，也是修行。⌋',
		team: [
			['Hitmontop', 'Intimidate', 'Sitrus Berry', ['fakeout', 'closecombat', 'stoneedge', 'machpunch'], 'bulkyphysical'],
			['Hitmonchan', 'Iron Fist', 'Expert Belt', ['drainpunch', 'icepunch', 'thunderpunch', 'machpunch']],
			['Hitmonlee', 'Reckless', 'Black Belt', ['highjumpkick', 'knockoff', 'rockslide', 'machpunch']],
		],
	},
	{
		id: 'bridgeinvitation', name: '金球桥上的最后一问', kind: 'event', from: 51, through: 120,
		speaker: '火箭队招募员', avatar: 'rocketgrunt', hint: '毒、飞行与一般系互相掩护，再以恶系招式补盲；别让单一打手承担全部战斗。',
		opening: ['桥边的男人抛着一颗金珠，笑容像是排练了许多遍。',
			'⌈身手不错嘛。要不要加入火箭队？……不愿意？那就让我见识一下你的决心！⌋',
			'他拦在通往物资箱的小路上，主路仍然畅通。你可以接受这场较量，也可以径直离开。'],
		victory: '招募员揉着帽檐，终于挪开了脚步。⌈好吧好吧，说好的酬劳归你。别把箱子也搬走啊！⌋',
		retreat: '你收回精灵球，退到桥头。招募员没有追来，通往主路的出口仍然畅通。',
		team: [
			['Arbok', 'Intimidate', 'Black Sludge', ['glare', 'poisonjab', 'crunch', 'earthquake']],
			['Crobat', 'Infiltrator', 'Black Sludge', ['taunt', 'uturn', 'bravebird', 'roost'], 'physical'],
			['Raticate', 'Guts', 'Flame Orb', ['facade', 'suckerpunch', 'uturn', 'crunch'], 'physical'],
		],
	},
	{
		id: 'silphsupply', name: '西尔佛的失物委托', kind: 'event', from: 81, through: 150,
		speaker: '西尔佛职员', opponent: '火箭队搬运组', avatar: 'rocketgrunt', hint: '光墙与反射壁掩护后排；挑衅、拆墙或及时换人都能找到突破口。',
		opening: ['职员抱着空空的运输单，望向侧门里几个黑色制服的身影。',
			'⌈那是送给旅人的物资，不是他们的战利品。能请你帮忙拿回来吗？如果勉强，就先照顾好伙伴。⌋',
			'你从半开的门缝看清了守在箱子旁的宝可梦。对方已经做好协同防守的准备。'],
		victory: '封条完好无损。职员松了口气，把登记簿翻到酬谢一栏。⌈谢谢你。请选一份真正用得上的物资。⌋',
		retreat: '职员把你引回安全的走廊。⌈别急，大家平安回来最重要。我会另找支援。⌋',
		team: [
			['Electrode', 'Static', 'Light Clay', ['reflect', 'lightscreen', 'voltswitch', 'taunt']],
			['Weezing', 'Levitate', 'Black Sludge', ['sludgebomb', 'flamethrower', 'willowisp', 'painsplit']],
			['Muk', 'Sticky Hold', 'Sitrus Berry', ['poisonjab', 'knockoff', 'brickbreak', 'shadowsneak']],
			['Persian', 'Technician', 'Silk Scarf', ['fakeout', 'uturn', 'bite', 'doubleedge'], 'physical'],
		],
	},
	{
		id: 'subwaytrial', name: '对战地铁的试车邀请', kind: 'event', from: 101, through: 170,
		portraits: ['ingo', 'emmet'],
		speaker: '北尚', avatar: 'ingo', hint: '黏黏网控制速度，伏特替换衔接后排；清场与抢节奏同样重要。',
		opening: ['检票灯亮了起来。北尚站在月台边，白色手套指向一节空车厢。',
			'⌈目的地已经确认。接下来要检验的，是您与伙伴一路配合的本领！⌋',
			'南厦把试车奖品放在终点台上。列车只进行一场演练，准备好再上车；中途也可以请求停车。'],
		victory: '列车平稳停靠，北尚与南厦一同向你致意。⌈抵达终点！您的判断，为这趟旅程找到了正确轨道。⌋',
		retreat: '停车铃响起，车门缓缓打开。⌈请先回月台休整。是再次登车，还是离开车站，由您决定。⌋',
		team: [
			['Galvantula', 'Compound Eyes', 'Focus Sash', ['stickyweb', 'thunder', 'bugbuzz', 'voltswitch']],
			['Crustle', 'Sturdy', 'White Herb', ['shellsmash', 'rockslide', 'xscissor', 'earthquake']],
			['Klinklang', 'Clear Body', 'Leftovers', ['shiftgear', 'geargrind', 'wildcharge', 'substitute']],
			['Chandelure', 'Flash Fire', 'Choice Scarf', ['flamethrower', 'shadowball', 'energyball', 'trick']],
		],
	},
	{
		id: 'palmersinvitation', name: '桄榔的临时对战席', kind: 'event', from: 151, through: 199,
		portraits: ['palmer'], companions: ['palmer'], serious: true,
		speaker: '桄榔', avatar: 'palmer', hint: '美纳斯与克雷色利亚稳住防线；留意快龙的强化、席多蓝恩的 Z 招式和雷吉奇卡斯的慢启动。',
		opening: ['休息区旁竖着一块手写的“对战塔”招牌。桄榔刚放下外套，就热情地朝你挥手。',
			'⌈走到这里，想必已经有不少精彩故事了吧？让我用一场对战，认识你们的旅程！⌋',
			'他没有催促。六只久经磨练的伙伴安静地等在场边，你也有时间检查自己的队伍。'],
		victory: '桄榔爽朗地笑了，认真记下最后一次换人的时机。⌈好对战！奖品拿上，接下来我也和你们一起走！⌋',
		retreat: '桄榔点头收回伙伴。⌈把状态调整好再出发。我的对战席，始终欢迎认真对待伙伴的人。⌋',
		team: [
			['Dragonite', 'Multiscale', 'Lum Berry', ['dragondance', 'dragonclaw', 'firepunch', 'extremespeed']],
			['Milotic', 'Marvel Scale', 'Leftovers', ['scald', 'icebeam', 'recover', 'haze']],
			['Rhyperior', 'Solid Rock', 'Leftovers', ['stealthrock', 'earthquake', 'rockblast', 'icepunch']],
			['Heatran', 'Flash Fire', 'Firium Z', ['magmastorm', 'earthpower', 'taunt', 'flashcannon'], 'special'],
			['Cresselia', 'Levitate', 'Leftovers', ['calmmind', 'moonlight', 'storedpower', 'moonblast'], 'wall'],
			['Regigigas', 'Slow Start', 'Leftovers', ['substitute', 'protect', 'bodyslam', 'knockoff'], 'bulkyphysical'],
		],
	},
	{
		id: 'acepivot', name: '王牌训练家的换位课', kind: 'trainer', from: 51, through: 100,
		speaker: '王牌训练家', avatar: 'acetrainer', hint: '雨天与连续换人组成进攻链；用免疫、耐性或先制招式打断。',
		opening: ['一位王牌训练家在路口收起笔记，把刚才观察到的换人路线画给你看。',
			'⌈比起站着硬拼，我更想知道你能不能跟上节奏。来试一场？⌋'],
		victory: '⌈漂亮，你没有被我的脚步牵着走。⌋对方把研习记录推到你面前。',
		retreat: '⌈先记住这一轮的交换，下次就能做得更好。⌋对方示意你先照顾伙伴。',
		team: [
			['Pelipper', 'Drizzle', 'Damp Rock', ['scald', 'airslash', 'uturn', 'roost']],
			['Kingdra', 'Swift Swim', 'Life Orb', ['hydropump', 'dracometeor', 'icebeam', 'surf'], 'special'],
			['Scizor', 'Technician', 'Sitrus Berry', ['bulletpunch', 'uturn', 'brickbreak', 'roost']],
		],
	},
	{
		id: 'rangercircuit', name: '巡护员的林间协作', kind: 'trainer', from: 61, through: 120,
		speaker: '宝可梦巡护员', avatar: 'pokemonranger', hint: '草、水、火轮转承伤；用覆盖招式抓住换人空隙。',
		opening: ['巡护员刚为林间伙伴检查完伤口，向你展示一张协作训练表。',
			'⌈独自逞强可照顾不了整片森林。让我们看看，彼此能替伙伴挡下多少危险吧。⌋'],
		victory: '⌈我看见了，你一直留意着队伍后方。⌋巡护员将准备好的补给交给你挑选。',
		retreat: '巡护员放低指挥旗。⌈训练就到这里，别让伙伴带着疲惫赶路。⌋',
		team: [
			['Tangrowth', 'Regenerator', 'Rocky Helmet', ['gigadrain', 'knockoff', 'sleeppowder', 'earthquake']],
			['Vaporeon', 'Water Absorb', 'Leftovers', ['scald', 'icebeam', 'wish', 'protect']],
			['Arcanine', 'Intimidate', 'Sitrus Berry', ['flamethrower', 'willowisp', 'morningsun', 'extremespeed']],
		],
	},
	{
		id: 'ruinssurvey', name: '遗迹勘察队的沙尘演练', kind: 'trainer', from: 91, through: 150,
		speaker: '遗迹勘察员', avatar: 'ruinmaniac', hint: '沙暴手先发，拨沙伙伴接力；更换天气或稳住地面抗性。',
		opening: ['勘察员将地图压在石板下，沙粒从纸角缓缓滑落。',
			'⌈遗迹里的风从不等人。要不要先和我们的护卫队演练一场？⌋'],
		victory: '⌈在风沙里仍能看清同伴的位置，真了不起。⌋勘察员打开了备用物资箱。',
		retreat: '勘察员带你回到背风处。⌈路线记住了就好，这次不用勉强走到底。⌋',
		team: [
			['Hippowdon', 'Sand Stream', 'Smooth Rock', ['earthquake', 'slackoff', 'yawn', 'stealthrock']],
			['Excadrill', 'Sand Rush', 'Air Balloon', ['earthquake', 'ironhead', 'rockslide', 'rapidspin']],
			['Cradily', 'Storm Drain', 'Leftovers', ['gigadrain', 'ancientpower', 'recover', 'toxic']],
			['Stoutland', 'Sand Rush', 'Silk Scarf', ['return', 'crunch', 'icefang', 'firefang']],
		],
	},
	{
		id: 'clubroom', name: '对战俱乐部的逆速课', kind: 'trainer', from: 111, through: 180,
		speaker: '对战俱乐部教练', avatar: 'veteran', hint: '戏法空间反转速度顺序；阻止开空间，或用守住与换人度过持续时间。',
		opening: ['场地边的计时器倒着走了一格。教练笑着让你看清伙伴们缓慢而稳健的步子。',
			'⌈最快的，未必总能先动。来体验一下另一种节奏吧。⌋'],
		victory: '计时器停了下来。⌈很好，你在变化里找到了自己的时机。⌋教练递来课程的结业物资。',
		retreat: '教练关掉计时器。⌈这一课可以慢慢想。先让伙伴休息吧。⌋',
		team: [
			['Bronzong', 'Levitate', 'Mental Herb', ['trickroom', 'gyroball', 'psychic', 'earthquake'], 'slowphysical'],
			['Reuniclus', 'Magic Guard', 'Life Orb', ['trickroom', 'psychic', 'focusblast', 'recover'], 'slowspecial'],
			['Conkeldurr', 'Guts', 'Flame Orb', ['drainpunch', 'machpunch', 'knockoff', 'icepunch'], 'slowphysical'],
			['Escavalier', 'Shell Armor', 'Assault Vest', ['megahorn', 'ironhead', 'knockoff', 'drillrun'], 'slowphysical'],
		],
	},
	{
		id: 'victoryroad', name: '冠军之路的最后热身', kind: 'trainer', from: 151, through: 199,
		speaker: '资深训练家', avatar: 'veteran', hint: '五只伙伴覆盖物理、特殊与先制进攻，需要轮换承担不同威胁。',
		opening: ['石壁上刻着历代挑战者留下的箭头。一位资深训练家替身旁的伙伴系紧护具。',
			'⌈走到这里，靠的早已不只是一只王牌。愿意在登顶之前，检验一下整支队伍吗？⌋'],
		victory: '⌈你们准备好了。⌋他挪开挡在标记前的背包，把珍藏的训练物资留给你挑选。',
		retreat: '⌈登顶没有迟到这一说。⌋他扶稳路牌，让你先在安全的一侧休息。',
		team: [
			['Staraptor', 'Intimidate', 'Choice Scarf', ['bravebird', 'closecombat', 'uturn', 'doubleedge']],
			['Magnezone', 'Sturdy', 'Assault Vest', ['thunderbolt', 'voltswitch', 'flashcannon', 'bodypress']],
			['Garchomp', 'Rough Skin', 'Rocky Helmet', ['earthquake', 'dragonclaw', 'rockslide', 'swordsdance']],
			['Starmie', 'Natural Cure', 'Life Orb', ['surf', 'icebeam', 'thunderbolt', 'recover']],
			['Mamoswine', 'Thick Fat', 'Never-Melt Ice', ['earthquake', 'iciclecrash', 'iceshard', 'knockoff']],
		],
	},
	...NEW_CHALLENGES, ...SERIOUS_CHALLENGES,
];

/** Read-only story branches; replaying a challenge cannot start combat or grant prizes. */
export function optionalChallengeReplay(id: string) {
	const def = OPTIONAL_CHALLENGES.find(entry => entry.id === id);
	if (!def) return;
	return { title: def.name, portraits: def.portraits, start: 'start', pages: {
		start: { text: def.opening, options: [
			{ label: def.serious ? '拿出真本事 · 认真切磋' : '接受挑战', next: 'battle' }, { label: '这次先不挑战', next: 'leave' },
		] },
		battle: { text: [def.hint, '此处仅回顾故事，不进行战斗。'], battleSkipped: true, options: [
			{ label: '查看获胜后的对话', next: 'win' }, { label: '查看撤退后的对话', next: 'leave' },
		] },
		win: { text: [def.victory], smile: true, options: [] },
		leave: { text: [def.retreat], options: [] },
	} };
}
