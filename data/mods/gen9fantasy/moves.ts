export const Moves: import('../../../sim/dex-moves').ModdedMoveDataTable = {
	veeveevolley: {
        inherit: true,
        isNonstandard: null,
	},
	punishment: {
		num: 386,
		accuracy: 100,
		basePower: 0,
		basePowerCallback(pokemon, target) {
			let power = 80 + 20 * target.positiveBoosts();
			if (power > 200) power = 200;
			this.debug(`BP: ${power}`);
			return power;
		},
		category: "Physical",
		isNonstandard: "Past",
		name: "Punishment",
		pp: 5,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, metronome: 1 },
		// 在这里添加穿透效果
		// This flag makes the move ignore the effects of screens (Reflect, Light Screen, Aurora Veil),
		// Safeguard, and Substitute.
		infiltrates: true, // 新增：赋予技能穿透效果
		secondary: null,
		target: "normal",
		type: "Dark",
		zMove: { basePower: 160 },
		maxMove: { basePower: 130 },
		contestType: "Cool",
		desc: "威力基数为80,附带穿透效果。目标的能力(不包括命中率与闪避率)且每上升1级,威力提升20,最高为200",
		shortDesc: "80威力 +目标每有1项能力上升, 威力+20,有穿透效果",
	},
	flyingpress: {
		num: 560,
		accuracy: 95,
		basePower: 100,
		category: "Physical",
		name: "Flying Press",
		pp: 10,
		flags: { contact: 1, protect: 1, mirror: 1, gravity: 1, distance: 1, nonsky: 1, metronome: 1 },
		onEffectiveness(typeMod, target, type, move) {
		// 飞行属性克制的属性有：草、格斗、虫
		if (['Grass', 'Fighting', 'Bug'].includes(type)) {
			return typeMod + 1;
		}
		return typeMod;
		},
		priority: 0,
		secondary: null,
		target: "any",
		type: "Fighting",
		zMove: { basePower: 170 },
		contestType: "Tough",
		desc: "此招式拥有飞行属性在属性相克中的克制,舍去微弱。若目标处于缩小状态,本招式必定命中且伤害翻倍",
		shortDesc: "此招式拥有飞行属性在属性相克中的克制,舍去微弱",
	},
	overdrive: {
		num: 786,
		accuracy: 100,
		basePower: 80,
		category: "Special",
		name: "Overdrive",
		pp: 10,
		priority: 0,
		flags: { protect: 1, mirror: 1, sound: 1, bypasssub: 1 },
		onModifyType(move, pokemon) {
			// 检查宝可梦的物种名称是否为 'Toxtricity-Low-Key-Fantasy'
			if (pokemon.species.name === 'Toxtricity-Low-Key-Fantasy') {
				// 如果是，则将技能类型更改为 'Ice'
				move.type = 'Ice';
			}
		},
		secondary: null,
		target: "allAdjacentFoes",
		type: "Electric",
		desc: "幻想颤弦蝾螈-低调形态携带时,破音变为冰系",
		shortDesc: "幻想颤弦蝾螈-低调形态携带时,破音变为冰系"
	},
	shelter: {
		num: 842,
		accuracy: true,
		basePower: 0,
		category: "Status",
		name: "Shelter",
		pp: 5,
		priority: 0,
		flags: { snatch: 1, heal: 1, metronome: 1 },
		heal: [1, 2],
		volatileStatus: 'shelter',
		secondary: null,
		target: "self",
		type: "Steel",
		zMove: { effect: 'clearnegativeboost' },
		desc: "回复自身1/2最大HP",
		shortDesc: "回复自身1/2最大HP"
	},
		//以下为自制技能
	xianxingzhiling: {
		num: 10001,
		accuracy: true,
		basePower: 0,
		category: "Status",
		name: "Xian Xing Zhi Ling",
		pp: 10,
		priority: 0,
		flags: { snatch: 1, metronome: 1 },
		// 保留 volatileStatus 属性，这是让招式附加状态并为后续失败提供判断依据的关键
		volatileStatus: 'xianxingzhiling',
		onTryHit(target, source, move) {
			// 核心改动：在招式尝试命中时，首先检查状态
			// 如果使用者身上已经存在 'xianxingzhiling' 状态，则直接返回 false，使招式失败
			if (source.volatiles['xianxingzhiling']) {
				return false;
			}
			
			// 只有在检查通过后（即第一次使用时），才执行能力提升
			const atk = source.getStat('atk', false, true);
			const spa = source.getStat('spa', false, true);
	
			if (atk > spa) {
				this.boost({ atk: 2 }, source); // 物攻较高，提升物攻2级
			} else {
				this.boost({ spa: 2 }, source); // 特攻较高，提升特攻2级
			}
		},
		condition: {
			onStart(pokemon) {
				this.add('-start', pokemon, 'move: xianxingzhiling');
			},
			onFractionalPriorityPriority: -2,
			onFractionalPriority(priority, pokemon) {
				if (priority <= 0) return 0.1;
			},
			onSwitchOut(pokemon) {
				pokemon.removeVolatile('xianxingzhiling');
			},
			onEnd(pokemon) {
				this.add('-end', pokemon, 'move: xianxingzhiling');
			}
		},
		target: "self",
		type: "Bug",
		zMove: { boost: { atk: 1 } },
		contestType: "Clever",
		// 更新招式描述以匹配新的效果
		desc: "先行指令。比较自己的攻击和特攻,令数值相对较高一项提高2级。使用后在相同优先度下将优先出手,但再次使用会失败",
		shortDesc: "物攻或特攻较高的一项+2,获得先制+0.5。再次使用会失败"
	},
	fuzhuzhiling: {
		num: 10002,
		accuracy: 100,
		basePower: 20,
		basePowerCallback(pokemon, target, move) {
			const bp = move.basePower + 20 * pokemon.positiveBoosts();
			this.debug(`BP: ${bp}`);
			return bp;
		},
		category: "Special",
		name: "Fu Zhu Zhi Ling",
		pp: 10,
		priority: 0,
		flags: { protect: 1, mirror: 1, metronome: 1 },
		secondary: null,
		target: "normal",
		type: "Bug",
		zMove: { basePower: 160 },
		maxMove: { basePower: 130 },
		contestType: "Clever",
		desc: "辅助指令。自身每有一项能力变化提升一级,招式威力增加20。自身的能力降低不会影响此招式的威力",
		shortDesc: "辅助指令。每有1项能力上升, 威力+20"
	},
	mijianbairenchuan: {
		num: 10003,
		accuracy: 90,
		basePower: 65,
		category: "Physical",
		name: "Mi Jian Bai Ren Chuan",
		pp: 15,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, metronome: 1, slicing: 1 },
		onAfterHit(target, source, move) {
			if (!move.hasSheerForce && source.hp) {
				for (const side of source.side.foeSidesWithConditions()) {
					side.addSideCondition('gmaxsteelsurge');
				}
			}
		},
		onAfterSubDamage(damage, target, source, move) {
			if (!move.hasSheerForce && source.hp) {
				for (const side of source.side.foeSidesWithConditions()) {
					side.addSideCondition('gmaxsteelsurge');
				}
			}
		},
		secondary: {}, // Sheer Force-boosted
		target: "normal",
		type: "Normal",
		zMove: { basePower: 140 },
		maxMove: { basePower: 120 },
		desc: "秘剑·百仞川。令目标场地进入钢刺状态,使交换上场的宝可梦受到伤害",
		shortDesc: "秘剑·百仞川。令目标场地进入钢刺状态"
	},
	dianshanshunji: {
		num: 10004,
		accuracy: 100,
		basePower: 45,
		category: "Physical",
		name: "Dian Shan Shun Ji",
		pp: 5,
		priority: 1,
		flags: { contact: 1, protect: 1, mirror: 1, punch: 1 },
		willCrit: true,
		secondary: null,
		target: "normal",
		type: "Electric",
		zMove: { basePower: 100 },
		maxMove: { basePower: 100 },
		desc: "电闪瞬击。必定能够先制攻击。攻击必定击中要害",
		shortDesc: "电闪瞬击。必定能够先制攻击。攻击必定击中要害"
	},
	zuishenluanda: {
		num: 10005,
		accuracy: 95,
		basePower: 15,
		basePowerCallback(pokemon, target, move) {
			return 15 * move.hit;
		},
		category: "Physical",
		name: "Zui Shen Luan Da",
		pp: 5,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, punch: 1 },
		willCrit: true,
		multihit: 3,
		multiaccuracy: true,
		secondary: null,
		target: "normal",
		type: "Poison",
		zMove: { basePower: 175 },
		maxMove: { basePower: 90 },
		desc: "醉神乱打。连续攻击1~3次,每一击都必定击中要害。第二次攻击威力增加到30,第三次攻击威力增加到45",
		shortDesc: "醉神乱打。连续攻击1~3次,必定击中要害。每次击中威力↑"
	},
	biansuzhefan: {
		num: 10006,
		accuracy: 100,
		basePower: 70,
		category: "Physical",
		name: "Bian Su Zhe Fan",
		pp: 20,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, metronome: 1 },
		selfSwitch: true,
		secondary: null,
		target: "normal",
		type: "Poison",
		zMove: { basePower: 140 },
		maxMove: { basePower: 85 },
		contestType: "Cute",
		desc: "变速折返。使用者在攻击目标后会替换后备宝可梦上场",
		shortDesc: "变速折返。使用者在攻击目标后会替换后备宝可梦上场"
	},
	chuanyun: {
		num: 10007,
		accuracy: true,
		basePower: 90,
		category: "Physical",
		name: "Chuan Yun",
		pp: 15,
		priority: 0,
		flags: { mirror: 1, distance: 1, metronome: 1, shooting: 1 },
		secondary: null,
		target: "any",
		type: "Flying",
		zMove: { basePower: 175 },
		maxMove: { basePower: 130 },
		contestType: "Cool",
		desc: "穿云。可以无视守住进行攻击。攻击必定命中在场上的目标",
		shortDesc: "穿云。可以无视守住进行攻击。攻击必定命中在场上的目标"
	},
	baoyulihua: {
		num: 10008,
		accuracy: 100,
		basePower: 15,
		category: "Physical",
		name: "Bao Yu Li Hua",
		pp: 20,
		priority: 1,
		flags: { protect: 1, mirror: 1, distance: 1, metronome: 1, shooting: 1 },
		multihit: [2, 5],
		secondary: null,
		target: "any",
		type: "Steel",
		zMove: { basePower: 100 },
		maxMove: { basePower: 90 },
		contestType: "Cool",
		desc: "暴雨梨花。连续攻击２～５次。必定能够先制攻击",
		shortDesc: "暴雨梨花。连续攻击２～５次。必定能够先制攻击"
	},
	yanjian: {
		num: 10009,
		accuracy: 100,
		basePower: 80,
		category: "Physical",
		name: "Yan Jian",
		pp: 15,
		priority: 0,
		flags: { protect: 1, mirror: 1, metronome: 1, shooting: 1 },
		secondary: {
			chance: 20,
			boosts: {
				def: -1,
			},
		},
		target: "normal",
		type: "Rock",
		zMove: { basePower: 160 },
		maxMove: { basePower: 130 },
		contestType: "Tough",
		desc: "岩箭。攻击目标造成伤害。20%几率令目标的防御降低1级",
		shortDesc: "岩箭。攻击目标造成伤害。20%几率令目标的防御降低1级"
	},
	chaopinyaogunpoyinbo: {
		num: 10010, 
		accuracy: true,
		basePower: 0, // 动态设置
		category: "Special",
		name: "ChaoPinYaoGunPoYinBo",
		pp: 1,
		priority: 0,
		flags: { sound: 1, bypasssub: 1 }, 
		isZ: "toxtricityz",
		target: "allAdjacentFoes",
		type: 'Electric', // 占位符，将被修改
		onPrepareHit(target, source, move) {
			this.attrLastMove('[anim] Overdrive'); 
			if (source.species.name === 'Toxtricity-Fantasy') { // 确认形态名称
				move.type = 'Electric';
				move.basePower = 195;
			} else if (source.species.name === 'Toxtricity-Low-Key-Fantasy') { // 确认形态名称
				move.type = 'Ice';
				move.basePower = 185;
			} else {
				this.add('-fail', source, 'move: Chaopinyaogunpoyinbo', '[invalid user]');
				return false; // 使用者错误则招式失败
			}
		},
		onHit(target, source, move) {
			// Toxtricity-Fantasy (高调) 的效果：对每个命中的目标施加剧毒或麻痹
			if (source.species.name === 'Toxtricity-Fantasy') {
				if (!target.status) { // 如果目标没有异常状态
					if (this.random(2) === 0) {
						target.trySetStatus('tox', source, move);
					} else {
						target.trySetStatus('par', source, move);
					}
				}
			}
		},
		self: {
			// Toxtricity-Low-Key-Fantasy (低调) 的效果：提升自身能力
			onHit(source, target, move) { // self.onHit 在命中所有目标后执行一次
				if (source.species.name === 'Toxtricity-Low-Key-Fantasy') {
					 this.boost({atk: 1, def: 1, spa: 1, spd: 1, spe: 1}, source, source, move);
				}
			},
		},
		desc: "超频摇滚破音波。攻击目标造成伤害。幻想颤弦蝾螈-高调形态使用时,会使对手全体宝可梦陷入中剧毒状态或麻痹状态。幻想颤弦蝾螈-低调形态使用时,令使用者的攻击、防御、特攻、特防和速度提升1级",
		shortDesc: "超频摇滚破音波。高调形态与低调形态使用效果不同"
	},
	yaojingzhiya: {
		num: 10011, 
		accuracy: 95,
		basePower: 65,
		category: "Physical",
		name: "Yao Jing Zhi Ya",
		pp: 15,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, metronome: 1, bite: 1 },
		secondaries: [
			{
				chance: 30,
				onHit(target, source, move) {
					// 随机一个状态
					const statuses = ['brn', 'par', 'frz'];
					const status = this.sample(statuses);
					if (target.setStatus(status, source, move)) {
						this.add('-status', target, status);
					}
				},
			},
			{
				chance: 10,
				volatileStatus: 'flinch',
			},
		],
		target: "normal",
		type: "Fairy",
		zMove: { basePower: 120 },
		maxMove: { basePower: 120 },
		contestType: "Cool",
		desc: "妖精之牙。有30%几率使目标陷入灼伤、麻痹或冰冻状态。有10%几率使目标畏缩",
		shortDesc: "妖精之牙。30%灼伤/麻痹/冰冻,10%畏缩"
	},
	yuzhaozhijian: {
		num: 1012,
		accuracy: 100,
		basePower: 85,
		category: "Physical",
		overrideDefensiveStat: 'spd',
		name: "Yu Zhao Zhi Jian",
		pp: 10,
		priority: 0,
		flags: { protect: 1, mirror: 1, slicing: 1 },
		secondary: null,
		target: "normal",
		type: "Dark",
		zMove: { basePower: 175 },
		maxMove: { basePower: 130 },
		contestType: "Beautiful",
		desc: "预兆之剑。计算伤害时按防守方的特防计算,不是防御",
		shortDesc: "预兆之剑。计算伤害时按防守方的特防计算,不是防御"
	},
	dongchadaji: {
		num: 533,
		accuracy: 100,
		basePower: 90,
		category: "Physical",
		name: "Dong Cha Da Ji",
		pp: 15,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, metronome: 1 },
		ignoreEvasion: true,
		ignoreDefensive: true,
		secondary: null,
		target: "normal",
		type: "Psychic",
		zMove: { basePower: 175 },
		maxMove: { basePower: 130 },
		contestType: "Cool",
		desc: "洞察打击。无视目标的能力阶级变化进行攻击",
		shortDesc: "洞察打击。无视目标的能力阶级变化进行攻击"
	},
	lujiao: {
		num: 10013,
		accuracy: 100,
	    basePower: 90,
	    category: "Physical",
	    name: "Lu Jiao",
	    pp: 10,
	    priority: 0,
	    flags: { contact: 1, protect: 1, mirror: 1 },
	    onModifyType(move, pokemon) {
		    switch (pokemon.species.name) {
			    case 'Sawsbuck-Fantasy':
				    move.type = 'Fairy';
				    break;
			    case 'Sawsbuck-Summer-Fantasy':
				    move.type = 'Grass';
				    break;
			    case 'Sawsbuck-Autumn-Fantasy':
				    move.type = 'Ground';
				    break;
			    case 'Sawsbuck-Winter-Fantasy':
				    move.type = 'Ice';
				    break;
		    }
	    },
	    secondary: {
		    chance: 50,
		    boosts: {
			    def: -1,
		    },
	    },
	    target: "normal",
	    type: "Normal",
		zMove: { basePower: 175 },
		maxMove: { basePower: 130 },
		desc: "鹿角。招式的属性会根据使用者的形态改变,春:妖精 夏:草 秋:地面 冬:冰。50%几率令目标的防御降低1级",
		shortDesc: "鹿角。招式的属性随形态改变。50%令目标的防御降低1级"
	},
	huanji: {
		num: 10014,
		accuracy: true,
	    basePower: 0,
	    category: "Status",
	    name: "Huan Ji",
	    pp: 10,
	    priority: 0,
	    flags: { snatch: 1 },
	    boosts: {
		    atk: 1,
		    spe: 1,
	    },
	    onHit(pokemon) {
		    if (pokemon.baseSpecies.baseSpecies === 'Sawsbuck' && !pokemon.transformed) {
			    const formeOrder = ['Sawsbuck-Fantasy', 'Sawsbuck-Summer-Fantasy', 'Sawsbuck-Autumn-Fantasy', 'Sawsbuck-Winter-Fantasy'];
			    const currentForme = pokemon.species.name;
			    const currentIndex = formeOrder.indexOf(currentForme);
			    const nextForme = formeOrder[(currentIndex + 1) % formeOrder.length];
			    pokemon.formeChange(nextForme, this.effect, false, '0', '[msg]');
		    }
	    },
	    target: "self",
	    type: "Normal",
		zMove: { effect: 'clearnegativeboost' },
		desc: "换季。提高自身物攻与速度各1级。萌芽鹿使用该招式后,按季节顺序进行形态变化",
		shortDesc: "换季。自身物攻与速度+1。萌芽鹿使用后按季节顺序变形"
	},
	yuannengshifang: {
		num: 10015,
		accuracy: 80,
		basePower: 60,
		category: "Special",
		name: "Yuan Neng Shi Fang",
		pp: 5,
		priority: 0,
		flags: { protect: 1, mirror: 1 },
		onModifyMove(move, pokemon) {
			if (pokemon.getStat('atk', false, true) > pokemon.getStat('spa', false, true)) {
				move.category = 'Physical';
			}
		},
		secondary: {
			chance: 100,
			status: 'par',
		},
		target: "normal",
		type: "Ghost", 
		zMove: { basePower: 120 },
		maxMove: { basePower: 110 },
		desc: "源能释放。比较自己的攻击和特攻,用数值相对较高的一项给予对方伤害。让对手陷入麻痹状态",
		shortDesc: "源能释放。攻击＞特攻变为物理招式,并使其陷入麻痹状态"
	},
	longzhige: {
		num: 10016,
		accuracy: 100,
		basePower: 35,
		category: "Special", 
		name: "Long Zhi Ge",
		pp: 15,
		priority: 0,
		flags: { protect: 1, mirror: 1, sound: 1 }, 
		volatileStatus: 'partiallytrapped', 
		secondary: null,
		target: "normal",
		type: "Dragon", 
		zMove: { basePower: 100 },
		maxMove: { basePower: 90 },
		desc: "龙之歌。使目标陷入束缚状态。束缚状态持续4~5回合,处于束缚状态的宝可梦会持续受到伤害并不能换下",
		shortDesc: "龙之歌。困住并伤害目标4~5回合"
	},
	huanzhiwu: {
		num: 10017,
		accuracy: true,
		basePower: 0,
		category: "Status",
		name: "Huan Zhi Wu",
		pp: 20,
		priority: 0,
		flags: { snatch: 1, dance: 1, metronome: 1 },
		boosts: {
			spa: 1, 
			spe: 1, 
		},
		secondary: null,
		target: "self",
		type: "Psychic", 
		zMove: { effect: 'clearnegativeboost' },
		contestType: "Beautiful", 
		desc: "幻之舞。提高自身特攻与速度各1级",
		shortDesc: "幻之舞。提高自身特攻与速度各1级"
	},
	chabuduowanan: {
		num: 10018,
		accuracy: true,
		basePower: 0,
		category: "Status",
		name: "Cha Bu Duo Wan An",
		pp: 10,
		priority: 0,
		flags: {},
		// 1. 回合开始时，为使用者添加一个临时的 'chabuduowanan' 状态
		priorityChargeCallback(source) {
			source.addVolatile('chabuduowanan');
		},
		// 核心效果
		terrain: 'mistyterrain',
		selfSwitch: true,
		secondary: null,
		condition: {
			duration: 1, // 持续1回合
			onBeforeMovePriority: 100, // 确保在出招前高优先级执行
			onBeforeMove(source, target, move) {
				// 检查使用者将要出的招式是否是“差不多晚安”
				if (move.id !== 'chabuduowanan') return;
				// 如果是，就显示准备信息
				this.add('-prepare', source, '差不多晚安', '[premajor]');
			},
		},
		target: "all",
		type: "Fairy", 
		zMove: { effect: 'healreplacement' },
		desc: "差不多晚安。接下来5回合的场地变更为薄雾场地。然后自身与后备宝可梦替换",
		shortDesc: "差不多晚安。交替并使场地变为持续5回合的薄雾场地"
	},
	yanzhibodong: {
		num: 10019,
		accuracy: 100,
		basePower: 85,
		category: "Special",
		name: "Yan Zhi Bo Dong",
		pp: 10,
		priority: 0,
		flags: { protect: 1, mirror: 1, distance: 1, metronome: 1, pulse: 1 },
		secondary: {
			chance: 20,
			status: 'brn' 
		},
		target: "any",
		type: "Fire",
		zMove: { basePower: 160 },
		maxMove: { basePower: 130 },
		contestType: "Beautiful",
		desc: "炎之波动。攻击目标造成伤害。有20%几率使目标陷入灼伤状态",
		shortDesc: "炎之波动。有20%几率使目标陷入灼伤状态"
	},
	fengxing: {
		num: 10020,
		accuracy: 100,
		basePower: 80,
		category: "Special",
		name: "Feng Xing",
		pp: 10,
		priority: 0,
		flags: { protect: 1, mirror: 1, metronome: 1 },
		/**
		 * @description 在计算伤害前动态修改基础威力。
		 * 这是实现威力加成效果的地方。
		 * @param {number} basePower - 招式的原始基础威力。
		 * @param {import('../sim/pokemon').Pokemon} pokemon - 使用此招式的宝可梦。
		 * @returns {number} - 修改后的最终基础威力。
		 */
		onBasePower(basePower, pokemon) {
			let newPower = basePower;
			// 定义需要检查的基础宝可梦ID列表（小写）
			const legendaries = ['hooh', 'raikou', 'entei', 'suicune'];
			// 遍历使用者所在队伍的每一只宝可梦
			for (const ally of pokemon.side.pokemon) {
				// 【已移除】不再检查宝可梦是否濒死

				// 获取宝可梦的物种ID（例如 'suicunefantasy'）
				const speciesId = ally.species.id;
				// 检查该宝可梦的物种ID是否以列表中的任何一个名字开头
				for (const legendary of legendaries) {
					if (speciesId.startsWith(legendary)) {
						// 如果条件符合，威力+20
						newPower += 20;
						// 调试信息，可以在对战日志中看到威力加成的过程
						this.debug(`凤行: 威力因队伍中的 ${ally.name} 提升了`);
						// 找到后就跳出内层循环，避免重复计算
						break;
					}
				}
			}
			return newPower;
		},
		/**
		 * @description 在招式即将使用时修改招式的属性。
		 * 这是实现伤害类型自适应效果的地方。
		 * @param {import('../sim/dex-moves').Move} move - 正在使用的招式对象。
		 * @param {import('../sim/pokemon').Pokemon} pokemon - 使用此招式的宝可梦。
		 */
		onModifyMove(move, pokemon) {
			// 比较使用者的攻击和特攻数值
			// pokemon.getStat('atk', false, true) 会获取包括能力变化在内的最终攻击力
			if (pokemon.getStat('atk', false, true) > pokemon.getStat('spa', false, true)) {
				// 如果攻击力更高，将这个招式的类别（category）从“Special”变为“Physical”
				move.category = 'Physical';
			}
		},
		target: "any",
		type: "Normal",
		zMove: { basePower: 180 },
		maxMove: { basePower: 130 },
		contestType: "Beautiful",
		desc: "凤行。比较自己的攻击和特攻,用数值相对较高的一项给予对方伤害。队伍中每有一只凤王/雷公/炎帝/水君威力+20",
		shortDesc: "凤行。队中每只凤王与凤王卫队威力+20,攻击＞特攻变物理"
	},
	popipa: {
		num: 10021,
		accuracy: true,
		basePower: 0,
		category: "Status",
		name: "Po Pi Pa",
		pp: 10,
		priority: 0,
		flags: { metronome: 1 },
		/**
		 * @description onTry 在招式尝试使用时触发，用于检查使用者自身的状态
		 */
		onTry(source) {
			// 检查1: 使用者的HP是否低于最大HP的一半。如果是，招式失败。
			if (source.hp <= source.maxhp / 2) {
				this.add('-fail', source, 'move: Po Pi Pa', '[weak]');
				this.hint("HP must be greater than 50% to use Po Pi Pa.");
				return false;
			}
			// 检查2: 使用者是否已经有替身了。如果是，招式失败。
			if (source.volatiles['substitute']) {
				this.add('-fail', source, 'move: Po Pi Pa');
				this.hint("Po Pi Pa cannot be used while a substitute is up.");
				return false;
			}
		},
		/**
		 * @description onHit 在招式成功命中目标后触发，用于执行招式的核心效果
		 */
		onHit(target, source) {
			// 计算需要消耗的HP（最大HP的一半）
			const hpCost = Math.floor(source.maxhp / 2);
			
			// 使用 directDamage 扣除使用者的HP。这个函数会处理HP扣减，并确保使用者不会因此而立刻濒死。
			// 如果HP成功扣除...
			if (this.directDamage(hpCost, source, source)) {
				// 效果1: 为使用者创建替身
				source.addVolatile('substitute', source);
				// 手动设置替身的HP，使其等于所消耗的HP量
				source.volatiles['substitute'].hp = hpCost;
				
				// 效果2: 使目标陷入诅咒状态
				target.addVolatile('curse', source);
			}
		},
		target: "normal",
		type: "Ghost",
		zMove: { effect: 'heal' },
		desc: "破皮帕。用自己最大HP的一半制造出替身,并使目标进入诅咒状态。如果自身HP不超过最大HP的一半,此招式会失败",
		shortDesc: "破皮帕。消耗50%HP制造替身并诅咒对手",
	},
	zhukaibo: {
		num: 10022,
		accuracy: 100,
		basePower: 90,
		category: "Special",
		name: "Zhu Kai Bo",
		pp: 10,
		priority: 0,
		flags: { protect: 1, mirror: 1, heal: 1, metronome: 1 },
		drain: [1, 2],
		secondary: null,
		target: "normal",
		type: "Steel",
		zMove: { basePower: 175 },
		maxMove: { basePower: 130 },
		contestType: "Clever",
		desc: "铸铠波。使用者将造成伤害的50%转化为自身的HP",
		shortDesc: "铸铠波。使用者将造成伤害的50%转化为自身的HP",
	},
	juenianpo: {
		num: 10023,
		accuracy: 100,
		basePower: 120,
		category: "Physical",
		name: "Jue Nian Po",
		pp: 5,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, metronome: 1 },
		self: {
			boosts: {
				def: -1,
				spd: -1,
			},
		},
		secondary: null,
		target: "normal",
		type: "Ice",
		zMove: { basePower: 190 },
		maxMove: { basePower: 140 },
		contestType: "Tough",
		desc: "绝念破。令使用者的防御和特防下降1级",
		shortDesc: "绝念破。令使用者的防御和特防下降1级",
	},
};
