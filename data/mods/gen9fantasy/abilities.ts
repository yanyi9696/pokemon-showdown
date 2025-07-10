export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	stancechange: {
		onModifyMovePriority: 1,
		onModifyMove(move, attacker, defender) {
			if (!['Aegislash', 'Aegislash-Fantasy'].includes(attacker.species.baseSpecies) || attacker.transformed) return;
			if (move.category === 'Status' && move.id !== 'kingsshield') return;
			const isFantasy = attacker.species.name.includes('Fantasy');
			const targetForme = (move.id === 'kingsshield'
			? (isFantasy ? 'Aegislash-Fantasy' : 'Aegislash')
			: (isFantasy ? 'Aegislash-Blade-Fantasy' : 'Aegislash-Blade'));
			if (attacker.species.name !== targetForme) attacker.formeChange(targetForme);
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Stance Change",
		rating: 4,
		num: 176,
	},
	//以下为CAP特性
		mountaineer: {
		onDamage(damage, target, source, effect) {
			if (effect && effect.id === 'stealthrock') {
				return false;
			}
		},
		onTryHit(target, source, move) {
			if (move.type === 'Rock' && !target.activeTurns) {
				this.add('-immune', target, '[from] ability: Mountaineer');
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Mountaineer",
		rating: 3,
		num: -2,
		shortDesc: "攀登者。交换时,拥有此特性的宝可梦可以不受所有岩石系攻击和隐形岩伤害。",
	},
		persistent: {
		// implemented in the corresponding move
		flags: {},
		name: "Persistent",
		rating: 3,
		num: -4,
		shortDesc: "坚守。使用招式时，重力/回复封锁/神秘守护/顺风/空间效果可多持续2个回合。",
	},
	//以下为自制特性
	fengchao: {
		onEffectivenessPriority: -1,
		onEffectiveness(typeMod, target, type, move) {
			if (!target || target.getAbility().id !== 'fengchao') return typeMod;
			if (!move) return typeMod;
			if (move?.id === 'stealthrock') return typeMod; // 显式排除隐形岩
			if (move?.ignoreAbility) return typeMod;
			if (type === 'Bug' && typeMod > 0) {
				this.add('-activate', target, 'ability: Fengchao');
				return 0;
			}
			return typeMod;
		},

		onBasePowerPriority: 23,
		onBasePower(basePower, attacker, defender, move) {
			if (attacker.getAbility().id !== 'fengchao') return;
			if (move.type === 'Bug') {
				this.debug('Fengchao Bug move power boost');
				return this.chainModify(1.5);
			}
		},

		onModifyMove(move, pokemon) {
			if (pokemon.getAbility().id === 'fengchao' && move.type === 'Bug') {
				(move as any).fengchaoBoost = true;
			}
		},

		onAfterMoveSecondarySelf(pokemon, target, move) {
		if (pokemon.getAbility().id !== 'fengchao') return;
		if (!(move as any)?.fengchaoBoost) return;
		this.add('-activate', pokemon, 'ability: Fengchao');
		this.heal(pokemon.baseMaxhp / 8, pokemon, undefined, this.dex.abilities.get('fengchao'));
		},
		name: "Feng Chao",
		rating: 4,
		num: 10000,
		shortDesc: "蜂巢。虫属性的弱点消失。虫属性招式威力提升1.5倍,使用虫属性招式时会回复最大HP的1/8。",	
	},
	sujun: {
		onModifyMove(move, pokemon) {
			// 调试：检查技能的副作用
			console.log(`Checking move: ${move.name}, self.volatileStatus: ${move.self?.volatileStatus}`);
			// 检查技能是否设置了必须充能的副作用
			if (move.self?.volatileStatus === 'mustrecharge') {
				// 如果技能有“必须充能”副作用，移除该副作用
				console.log(`Removing 'mustrecharge' from ${move.name}`);
				delete move.self.volatileStatus; // 清除技能的副作用
			}
		},
		flags: {},
		name: "Su Jun", 
		rating: 3,
		num: 10001,
		shortDesc: "速军。即使使出了使用后下一回合自己将无法动弹的招式后,自己也不会陷入无法动弹状态。",	
	},
	huibizaisheng: {
		onEmergencyExit(target) {
			if (!this.canSwitch(target.side) || target.forceSwitchFlag || target.switchFlag) return;
			for (const side of this.sides) {
				for (const active of side.active) {
					active.switchFlag = false;
				}
			}
			target.switchFlag = true;
			this.add('-activate', target, 'Huibizaisheng');
		},
		onSwitchOut(pokemon) {
			pokemon.heal(pokemon.baseMaxhp / 4);
		},
		flags: {},
		name: "Hui Bi Zai Sheng",
		rating: 2.5,
		num: 10002,
		shortDesc: "回避再生。HP变为一半时,为了回避危险,会退回到同行队伍中。交换下场时,回复自身最大HP的1/4。",
	},
	pozhu: {
		onModifyMove(move, pokemon) {
			if (move.flags['shooting']) {
				move.ignoreAbility = true;
				move.ignoreDefensive = true;
				move.ignoreEvasion = true;
				this.add('-message', `${pokemon.name}的射击类招式无视目标能力变化与特性！`);
			}
		},
		flags: {},
		name: "Po Zhu",
		rating: 3,
		num: 10003,
		shortDesc: "破竹。拥有此特性的宝可梦在使用射击类招式时,无视防御方的能力变化与特性,直接给予伤害。",
	},
	mishizhen: {
		onEffectiveness(typeMod, target, type, move) {
			// 确保 target 存在并且有特性 'mishizhen'
			if (target && target.hasAbility('mishizhen') && typeMod) {
				// 如果原本是弱点（typeMod > 0），就变成抗性（resisted）
				if (typeMod > 0) {
					this.debug('Mishizhen: Reversing effectiveness (Weakness becomes Resistance)');
					return -typeMod; // 反转为抗性
				}
				// 如果原本是抗性（typeMod < 0），就变成弱点（super effective）
				else if (typeMod < 0) {
					this.debug('Mishizhen: Reversing effectiveness (Resistance becomes Weakness)');
					return -typeMod; // 反转为弱点
				}
			}
			// 如果没有触发 "Mishizhen" 特性，返回原始类型相性
			return typeMod;
		},
		flags: { breakable: 1 },
		name: "Mi Shi Zhen",
		rating: 1,
		num: 10004,
		shortDesc: "迷石阵。属性相性反转。效果绝佳变为效果不好,效果不好变为效果绝佳,没有效果则保持没有效果。",
	},
	tianlaizhiyin: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			if (move.flags['sound'] && !pokemon.volatiles['dynamax']) {
				move.type = '???'; // Typeless
			}
		},
		onBasePower(basePower, attacker, defender, move) {
			if (move.flags['sound']) {
				// 声音招式直接享受 1.5 倍
				this.debug('Musician STAB-like boost for sound move');
				return this.chainModify(1.5);
			}
		},
		flags: {},
		name: "Tian Lai Zhi Yin",
		rating: 3,
		num: 10005,
		shortDesc: "天籁之音。拥有此特性的宝可梦使出的声音招式会变为无属性,并拥有1.5倍本系威力提升。",
	},
	moshushizhihong: {
		onAfterMoveSecondarySelf(source, target, move) {
			if (!move || !target || source.switchFlag === true) return;
			if (target !== source && move.category !== 'Status') {
				if (!target.item) return; // 没有道具就啥也不做

				if (!source.item && !source.volatiles['gem'] && move.id !== 'fling') {
				// 如果自己没道具，偷对方的
					const stolenItem = target.takeItem(source);
					if (!stolenItem) return;
					if (!source.setItem(stolenItem)) {
						target.item = stolenItem.id;
						return;
					}
					this.add('-item', source, stolenItem, '[from] ability: Magician\'s Red', `[of] ${target}`);
				} else {
					// 如果自己有道具，且本次攻击是超能系技能，则让对方道具失效
				if (move.type === 'Psychic') {
					const removedItem = target.takeItem(source);
					if (removedItem) {
						this.add('-enditem', target, removedItem.name, '[from] ability: Magician\'s Red', `[of] ${source}`);
						}
					}
				}
			}
		},
		flags: {},
		name: "Mo Shu Shi Zhi Hong",
		rating: 3,
		num: 10006,
		shortDesc: "魔术师之红。造成伤害时,若无道具,获得目标道具;若有道具,使目标在受到超能系技能攻击后失去道具。",
	},
	jiqususheng: {
		onAfterMoveSecondarySelfPriority: -1,
		onAfterMoveSecondarySelf(pokemon, target, move) {
			if (move.totalDamage && !pokemon.forceSwitchFlag) {
				this.add('-ability', pokemon, this.effect, '[from] move: ' + move.name);
				this.heal((move.totalDamage / 3) | 0, pokemon);
			}
		},
		flags: {},
		name: "Ji Qu Su Sheng",
		rating: 3.5,
		num: 10007,
		shortDesc: "汲取苏生。在攻击对方成功造成伤害时,携带者的HP会恢复其所造成伤害的1/3。",
	},
	xuezhili: {
		onBasePowerPriority: 21,
		onBasePower(basePower, attacker, defender, move) {
			// 检查当前天气是否为“雪天或冰雹”（hail 或 snow）
			if (this.field.isWeather(['hail', 'snow'])) {
				// 在对战日志中显示调试信息
				this.debug('Snow Force boost');
				// 将招式威力进行连锁修正，提升 30%
				// 1.3 倍的精确分数表示是 [5325, 4096]
				return this.chainModify([5325, 4096]);
			}
		},
		// 在受到特定类型影响时触发（用于免疫冰雹伤害）
		onImmunity(type, pokemon) {
			// 在一些版本中，冰雹会造成伤害，这可以提供免疫
			if (type === 'hail') return false;
		},
		flags: {},
		name: "Xue Zhi Li",
		rating: 3,
		num: 10008,
		shortDesc: "雪之力。在下雪或冰雹天气下,该特性的宝可梦使用的招式威力提升30%。",
	},
	xuenv: {
		onStart(pokemon) {
			// 检查该宝可梦是否已经触发过这个登场效果
			// 'this.effectState.triggered' 是一个临时的状态，用于防止重复触发
			if (this.effectState.triggered) return;
			this.effectState.triggered = true;
			// 在对战日志中显示特性发动信息
			this.add('-ability', pokemon, this.effect.name, '[from] onStart');
			// --- “黑雾”效果开始 ---
			// 在对战日志中显示“所有能力变化都被清除了”
			this.add('-clearallboost');
			// 遍历场上所有活跃的宝可梦
			for (const target of this.getAllActive()) {
				// 清除该宝可梦的所有能力等级变化
				target.clearBoosts();
			}
			// --- “黑雾”效果结束 ---
		},
		// 当宝可梦因任何原因濒死时触发
		onFaint(pokemon, source, effect) {
			// 现在，无论宝可梦如何陷入濒死，下面的代码都会执行。
			// 在对战日志中显示特性发动信息
	        this.add('-ability', pokemon, this.effect.name, '[from] onFaint');
			// --- “黑雾”效果开始 ---
			this.add('-clearallboost');
			for (const target of this.getAllActive()) {
				target.clearBoosts();
			}
			// --- “黑雾”效果结束 ---
		},
		flags: { cantsuppress: 1 },
		name: "Xue Nü",
		rating: 2.5,
		num: 10009,
		shortDesc: "雪女。在第一次登场以及被打倒时，会创造一次黑雾。",
	},
};
