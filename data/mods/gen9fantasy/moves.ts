export const Moves: import('../../../sim/dex-moves').ModdedMoveDataTable = {
	xianxingzhiling: {
		num: 10001,
		accuracy: true,
		basePower: 0,
		category: "Status",
		name: "xianxingzhiling",
		pp: 10,
		priority: 0,
		flags: { snatch: 1, metronome: 1 },
		volatileStatus: 'xianxingzhiling',
		onTryHit(target, source, move) {
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
				this.add('-start', pokemon, 'move: xianxingzhiling'); // 确保状态已激活
			},
	
			// 提升优先级
			onFractionalPriorityPriority: -2,
			onFractionalPriority(priority, pokemon) {
				if (priority <= 0) return 0.1; // 提升优先级
			},
	
			// 宝可梦离场时清除优先级提升
			onSwitchOut(pokemon) {
				this.add('-end', pokemon, 'move: xianxingzhiling'); // 离场时清除状态
			}
		},
		target: "self",
		type: "Bug",
		zMove: { effect: 'clearnegativeboost' },
		contestType: "Clever",
		desc: "比较自己的攻击和特攻,令数值相对较高一项提高2级。使用后在相同优先度下将优先出手。",
		shortDesc: "比较自己的攻击和特攻,令数值相对较高一项提高2级。使用后在相同优先度下将优先出手。"
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
		name: "fuzhuzhiling",
		pp: 10,
		priority: 0,
		flags: { protect: 1, mirror: 1, metronome: 1 },
		secondary: null,
		target: "normal",
		type: "Bug",
		zMove: { basePower: 160 },
		maxMove: { basePower: 130 },
		contestType: "Clever",
		desc: "自身每有一项能力变化提升一级,招式威力增加20。自身的能力降低不会影响此招式的威力。",
		shortDesc: "自身每有一项能力变化提升一级,招式威力增加20。自身的能力降低不会影响此招式的威力。"
	},
	mijianbairenchuan: {
		num: 10002,
		accuracy: 90,
		basePower: 65,
		category: "Physical",
		name: "Mijianbairenchuan", 
		pp: 15,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, metronome: 1, slicing: 1 },
    // 技能使用后添加钢刺状态到敌方场地
    onAfterHit(target, source, move) {
        if (!move.hasSheerForce && source.hp) {
            // 给敌方场地添加钢刺状态
            for (const side of source.side.foeSidesWithConditions()) {
                side.addSideCondition('steelsurge'); // 使用钢刺状态
            }
        }
    },
    // 钢刺状态的效果
    condition: {
        onSideStart(side) {
            this.add('-sidestart', side, 'move: Mijianbairenchuan');
        },
        // 当敌方宝可梦交换上场时，受到钢刺状态的伤害
        onSwitchIn(pokemon) {
            if (pokemon.hasItem('heavydutyboots')) return; // 受Heavy Duty Boots保护
            const steelHazard = this.dex.getActiveMove('Stealth Rock'); // 使用隐形岩的效果
            steelHazard.type = 'Steel'; // 修改为钢类型
            const typeMod = this.clampIntRange(pokemon.runEffectiveness(steelHazard), -6, 6); // 计算伤害
            this.damage(pokemon.maxhp * (2 ** typeMod) / 8); // 计算并造成伤害
        },
    },
    secondary: null,
    target: "adjacentFoe",
    type: "Steel", // 钢属性
    contestType: "Cool",
		desc: "令目标场地进入钢刺状态，使交换上场的宝可梦受到伤害。",
		shortDesc: "令目标场地进入钢刺状态，使交换上场的宝可梦受到伤害。"
	}	
};
