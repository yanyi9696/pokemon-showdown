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
		desc: "令目标场地进入钢刺状态，使交换上场的宝可梦受到伤害。",
		shortDesc: "令目标场地进入钢刺状态，使交换上场的宝可梦受到伤害。"
	},
	dianshanshunji: {
		num: 10003,
		accuracy: 100,
		basePower: 45,
		category: "Physical",
		name: "Dianshanshunji",
		pp: 5,
		priority: 1,
		flags: { contact: 1, protect: 1, mirror: 1, punch: 1 },
		willCrit: true,
		secondary: null,
		target: "normal",
		type: "Electric",
		desc: "必定能够先制攻击。攻击必定击中要害",
		shortDesc: "必定能够先制攻击。攻击必定击中要害"
	},
	zuishenluanda: {
		num: 10004,
		accuracy: 90,
		basePower: 15,
		basePowerCallback(pokemon, target, move) {
			return 15 * move.hit;
		},
		category: "Physical",
		name: "Zuishenluanda",
		pp: 5,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, punch: 1 },
		willCrit: true,
		multihit: 3,
		multiaccuracy: true,
		secondary: null,
		target: "normal",
		type: "Poison",
		zMove: { basePower: 120 },
		maxMove: { basePower: 80 },
		desc: "连续攻击1~3次,一击都必定击中要害。第二次攻击威力增加到30,第三次攻击威力增加到45。",
		shortDesc: "连续攻击1~3次,一击都必定击中要害。第二次攻击威力增加到30,第三次攻击威力增加到45。"
	},
	biansuzhefan: {
		num: 10005,
		accuracy: 100,
		basePower: 70,
		category: "Physical",
		name: "Biansuzhefan",
		pp: 20,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, metronome: 1 },
		selfSwitch: true,
		secondary: null,
		target: "normal",
		type: "Poison",
		contestType: "Cute",
		desc: "使用者在攻击目标后会替换后备宝可梦上场。",
		shortDesc: "使用者在攻击目标后会替换后备宝可梦上场。"
	},
	chuanyun: {
		num: 10006,
		accuracy: true,
		basePower: 80,
		category: "Physical",
		name: "Chuanyun",
		pp: 15,
		priority: 0,
		flags: { mirror: 1, distance: 1, metronome: 1, shooting: 1 },
		secondary: null,
		target: "any",
		type: "Flying",
		contestType: "Cool",
		desc: "可以无视守住进行攻击。攻击必定命中在场上的目标。",
		shortDesc: "可以无视守住进行攻击。攻击必定命中在场上的目标。"
	},
	shenjian: {
		num: 10007,
		accuracy: 100,
		basePower: 40,
		category: "Physical",
		name: "Shenjian",
		pp: 5,
		priority: 1,
		flags: { protect: 1, mirror: 1, distance: 1, metronome: 1, shooting: 1 },
		willCrit: true,
		secondary: null,
		target: "any",
		type: "Normal",
		contestType: "Cool",
		desc: "必定能够先制攻击。攻击必定击中要害。",
		shortDesc: "必定能够先制攻击。攻击必定击中要害。"
	},
	yanzu: {
		num: 10008,
		accuracy: 100,
		basePower: 80,
		category: "Physical",
		name: "Yanzu",
		pp: 15,
		priority: 0,
		flags: { contact: 1, protect: 1, mirror: 1, metronome: 1, shooting: 1 },
		secondary: {
			chance: 20,
			boosts: {
				def: -1,
			},
		},
		target: "normal",
		type: "Rock",
		contestType: "Tough",
		desc: "攻击目标造成伤害。20%几率令目标的防御降低1级。",
		shortDesc: "攻击目标造成伤害。20%几率令目标的防御降低1级。"
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
		desc: "幻想颤弦蝾螈-低调形态携带时, 破音变为冰系。",
		shortDesc: "幻想颤弦蝾螈-低调形态携带时, 破音变为冰系。"
		
	},
	chaopinyaogunpoyinbo: {
		num: 10009, 
		accuracy: true,
		basePower: 0, // 动态设置
		category: "Special",
		name: "Chaopinyaogunpoyinbo",
		pp: 1,
		priority: 0,
		flags: { sound: 1, bypasssub: 1 }, 
		isZ: "toxtricityz",
		target: "allAdjacentFoes",
		type: 'Normal', // 占位符，将被修改
		onPrepareHit(target, source, move) {
			this.attrLastMove('[anim] Overdrive'); // 可以考虑使用自定义动画名
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
		desc: "攻击目标造成伤害。幻想颤弦蝾螈-高调形态使用时, 会使对手全体宝可梦陷入中剧毒状态或麻痹状态。幻想颤弦蝾螈-低调形态使用时, 令使用者的攻击、防御、特攻、特防和速度提升1级。",
		shortDesc: "高调形态使用会使对手全体陷入中剧毒或麻痹状态。低调形态使用令攻击、防御、特攻、特防和速度提升1级。"
	}
};
