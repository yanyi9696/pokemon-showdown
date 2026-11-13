import type { OptionalChallengeDefinition } from './challenge-data';

/** Tower adaptation: keep the run's singles/doubles mode, rather than forcing a two-on-one format. */
export const TOTEM_CHALLENGES: OptionalChallengeDefinition[] = [
	{
		id: 'totemforest', name: '葱郁洞窟的霸主试炼', kind: 'event', from: 31, through: 100,
		speaker: '试炼向导', opponent: '洞窟的守护者', avatar: 'ilima',
		totem: { species: 'Gumshoos-Totem', boosts: { def: 1 } },
		hint: '霸主首次登场时防御提升一级。单打依次应战，双打与伙伴同时出场；可用特殊招式或清除强化突破。',
		opening: ['洞窟里的猫鼬探长比寻常同类高大，淡金色的气场环绕着它。',
			'向导说明：这是爬塔版霸主试炼。沿用当前单打或双打模式，不额外增加我方战位。霸主与它的伙伴都不能捕捉。',
			'你可以查看阵容再接受。失败后可重试或离开；奖励只可领取一次，不赠送霸主伙伴。'],
		victory: '猫鼬探长收起气场。向导将准备好的挑战补给递给你，示意挑选一份。',
		retreat: '向导让出洞口。先补足队伍的弱点，再来挑战也不迟。',
		team: [
			['Gumshoos-Totem', 'Adaptability', 'Sitrus Berry', ['hyperfang', 'crunch', 'icefang', 'protect'], 'bulkyphysical'],
			['Raticate-Alola', 'Thick Fat', 'Leftovers', ['superfang', 'knockoff', 'taunt', 'protect'], 'bulkyphysical'],
		],
	},
	{
		id: 'totemvoltage', name: '发电站的霸主试炼', kind: 'event', from: 61, through: 150,
		speaker: '试炼向导', opponent: '发电站的守护者', avatar: 'sophocles',
		totem: { species: 'Togedemaru-Totem', boosts: { def: 1 } },
		hint: '霸主首次登场防御提升一级，伙伴用光墙与电网支援。地面招式、挑衅或拆墙可突破这套防线。',
		opening: ['巨大的托戈德玛尔蜷在电容器旁，气场将它身上的电光串在一起。',
			'爬塔版霸主试炼沿用当前单打或双打模式；单打依次出场，双打协同出场。所有对手均不可捕捉。',
			'可以查看阵容后接受、失败后重试或离开。胜利补给只可领取一次，不赠送霸主伙伴。'],
		victory: '指示灯恢复了平稳的绿色。向导向你展示本次挑战的补给。',
		retreat: '你暂时退出发电站，整理应对电网和双防的策略。',
		team: [
			['Togedemaru-Totem', 'Sturdy', 'Sitrus Berry', ['zingzap', 'ironhead', 'nuzzle', 'spikyshield'], 'physical'],
			['Magnezone', 'Sturdy', 'Light Clay', ['lightscreen', 'electroweb', 'flashcannon', 'protect'], 'bulkyspecial'],
		],
	},
	{
		id: 'totemcanyon', name: '大峡谷的霸主试炼', kind: 'event', from: 101, through: 199,
		speaker: '试炼向导', opponent: '峡谷的守护者', avatar: 'hapuu',
		totem: { species: 'Kommo-o-Totem', boosts: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } },
		hint: '杖尾鳞甲龙首次登场五项能力各提升一级，伙伴用顺风支援。妖精招式、黑雾或清除强化是突破点。',
		opening: ['峡谷深处响起鳞片摩擦的回音，霸主杖尾鳞甲龙与伙伴挡在试炼台前。',
			'本试炼沿用当前单打或双打模式，不强制普通冒险改为双打。霸主与伙伴都不能捕捉。',
			'先查看阵容，再决定接受或离开；失败允许重试，奖励只领取一次，不赠送霸主伙伴。'],
		victory: '霸主敲响鳞甲，认可了这场较量。向导请你挑选一份挑战所得。',
		retreat: '你沿峡谷缓缓退回，准备好应对气场与顺风后还能再来。',
		team: [
			['Kommo-o-Totem', 'Overcoat', 'Sitrus Berry', ['clangingscales', 'focusblast', 'flamethrower', 'protect'], 'bulkyspecial'],
			['Noivern', 'Infiltrator', 'Covert Cloak', ['tailwind', 'taunt', 'airslash', 'roost'], 'special'],
		],
	},
];
