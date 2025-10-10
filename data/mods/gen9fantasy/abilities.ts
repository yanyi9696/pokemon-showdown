export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	battlearmor: {
		onCriticalHit: false,
		// 新增效果：免疫入场时生效的伤害类场地状态
		onDamage(damage, target, source, effect) {
			// 定义造成伤害的入场类状态ID
			const entryHazardDamageIds = ['spikes', 'stealthrock', 'gmaxsteelsurge'];
			if (effect && entryHazardDamageIds.includes(effect.id)) {
				return false; // 如果伤害来源是这些状态之一，则伤害无效
			}
		},
		flags: { breakable: 1 },
		name: "Battle Armor",
		rating: 3,
		num: 75,
		shortDesc: "不会被击中要害，也不会被己方场地上的入场可生效的状态伤害。",
	},
	cutecharm: {
		onDamagingHit(damage, target, source, move) {
			if (this.checkMoveMakesContact(move, source, target)) {
				if (this.randomChance(3, 10)) {
					source.addVolatile('attract', this.effectState.target);
				}
			}
		},
		onSourceModifyDamage(damage, source, target, move) {
        this.debug('Cute Charm reduces damage');
        // 第一步：无条件降低20%的伤害
        // this.chainModify(0.8) 会将伤害乘以 0.8
        let damageMultiplier = 0.8;
        // 第二步：检查性别并额外降低伤害
        // 确保攻击方和防御方都有性别，且性别不同
        if (source.gender && target.gender && source.gender !== target.gender) {
            this.debug('Cute Charm reduces damage further against opposite gender');
            // 在原有基础上再降低10% (0.8 * 0.9 = 0.72)
            damageMultiplier *= 0.9;
        }
        // 应用最终的伤害修正
        return this.chainModify(damageMultiplier);
    },
		flags: {},
		name: "Cute Charm",
		rating: 3,
		num: 56,
		shortDesc: "接触时有30%机率使对手着迷。受到的伤害降低20%,若对手为异性则伤害再降低10%",
	},
	shellarmor: {
		onCriticalHit: false,
		onDamagingHit(damage, target, source, move) {
			if (move.flags['contact']) {
				this.boost({atk: -1}, source, target, null, true);
			}
		},
		flags: { breakable: 1 },
		name: "Shell Armor",
		rating: 3,
		num: 4,
		shortDesc: "不会被击中要害。被接触类招式击中时,攻击方的攻击降低1级。",
	},
	slowstart: {
		onStart(pokemon) {
			pokemon.addVolatile('slowstart');
		},
		onEnd(pokemon) {
			delete pokemon.volatiles['slowstart'];
			this.add('-end', pokemon, 'Slow Start', '[silent]');
		},
		condition: {
			duration: 5,
			onResidualOrder: 28,
			onResidualSubOrder: 2,
			onStart(target) {
				this.add('-start', target, 'ability: Slow Start');
			},
			onResidual(pokemon) {
				// 这个判断是为了让“慢启动”的倒计时从上场后的下一个回合才开始计算，
				// 保证了负面效果会持续整整5个回合。
				if (!pokemon.activeTurns) {
					this.effectState.duration! += 1;
				}
				// 只有当宝可梦存活（hp > 0）并且不在上场的第一个回合时 (activeTurns > 0)，
				// 才执行攻击和速度的提升。
				if (pokemon.hp && pokemon.activeTurns) {
					this.boost({atk: 1, spe: 1}, pokemon);
				}
			},
			// 在计算攻击力时，将最终数值减半
			onModifyAtkPriority: 5,
			onModifyAtk(atk, pokemon) {
				return this.chainModify(0.5);
			},
			// 在计算速度时，将最终数值减半
			onModifySpe(spe, pokemon) {
				return this.chainModify(0.5);
			},
			onEnd(target) {
				// 5回合后状态结束，在对战中显示提示信息
				this.add('-end', target, 'Slow Start');
			},
		},
		flags: {},
		name: "Slow Start",
		rating: 4,
		num: 112,
		shortDesc: "登场之后的5回合内攻击和速度减半,期间每回合结束攻击和速度会上升1级",
	},
	infiltrator: {
		onModifyMove(move) {
			move.infiltrates = true;
		},
		onAnyModifyDef(def, target, source, move) {
			const abilityHolder = this.effectState.target;
			if (source !== abilityHolder) return;

			// 【核心修正】如果宝可夢携带了焦点镜且使用的是射击类招式，
			// 则此特性“罢工”，完全交由焦点镜去处理联动计算，避免重复或叠加。
			if (source.item === 'fantasyscopelens' && (move.flags['shooting'] || move.flags['bullet'])) {
				return;
			}

			// 只有在不满足联动条件时，才执行自己原本的10%削减效果。
			this.debug('Infiltrator defense drop');
			return this.chainModify(0.9);
		},
		onAnyModifySpD(spd, target, source, move) {
			const abilityHolder = this.effectState.target;
			if (source !== abilityHolder) return;

			// 【核心修正】(同上)
			if (source.item === 'fantasyscopelens' && (move.flags['shooting'] || move.flags['bullet'])) {
				return;
			}

			this.debug('Infiltrator special defense drop');
			return this.chainModify(0.9);
		},
		flags: {},
		name: "Infiltrator",
		rating: 2.5,
		num: 151,
		shortDesc: "自身使用招式时无视对方的替身/反射壁/光墙/神秘守护/白雾/极光幕/10%物防与特防",
	},
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
	disguise: {
		onDamagePriority: 1,
		onDamage(damage, target, source, effect) {
			if (effect?.effectType === 'Move' && ['mimikyu', 'mimikyutotem', 'mimikyufantasy'].includes(target.species.id)) {
				this.add('-activate', target, 'ability: Disguise');
				this.effectState.busted = true;
				return 0;
			}
		},
		onCriticalHit(target, source, move) {
			if (!target) return;
			if (!['mimikyu', 'mimikyutotem', 'mimikyufantasy'].includes(target.species.id)) {
				return;
			}
			const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
			if (hitSub) return;

			if (!target.runImmunity(move.type)) return;
			return false;
		},
		onEffectiveness(typeMod, target, type, move) {
			if (!target || move.category === 'Status') return;
			if (!['mimikyu', 'mimikyutotem', 'mimikyufantasy'].includes(target.species.id)) {
				return;
			}

			const hitSub = target.volatiles['substitute'] && !move.flags['bypasssub'] && !(move.infiltrates && this.gen >= 6);
			if (hitSub) return;

			if (!target.runImmunity(move.type)) return;
			return 0;
		},
		onUpdate(pokemon) {
			if (['mimikyu', 'mimikyutotem', 'mimikyufantasy'].includes(pokemon.species.id) && this.effectState.busted) {
				// --- 原有逻辑：形态变化 ---
				let speciesid = '';
				let isFantasy = false;
				if (pokemon.species.id === 'mimikyutotem') {
					speciesid = 'Mimikyu-Busted-Totem';
				} else if (pokemon.species.id === 'mimikyu') {
					speciesid = 'Mimikyu-Busted';
				} else if (pokemon.species.id === 'mimikyufantasy') {
					speciesid = 'Mimikyu-Busted-Fantasy';
					isFantasy = true; // 标记这是幻想形态
				}
				
				pokemon.formeChange(speciesid, this.effect, true);
				this.damage(pokemon.baseMaxhp / 8, pokemon, pokemon, this.dex.species.get(speciesid));

				// --- “重画皮”效果 - 最终解决方案 ---
				if (isFantasy) {
					this.add('-ability', pokemon, 'Chong Hua Pi', '[from] ability: Disguise');

					const possibleTargets = pokemon.adjacentFoes().filter(
						(target: Pokemon) => !target.getAbility().flags['notrace'] && target.ability !== 'noability'
					);

					if (possibleTargets.length) {
						const target = this.sample(possibleTargets);
						const newAbility = target.getAbility();
						const oldAbility = pokemon.getAbility();

						this.add('-ability', pokemon, newAbility, '[from] ability: Chong Hua Pi', `[of] ${target}`);
						
						// --- 核心修改：模仿 Skill Swap 的完整流程 ---

						// 1. 触发旧特性(画皮)的 'End' 事件，确保其效果被完全清除。
						this.singleEvent('End', oldAbility, pokemon.abilityState, pokemon, pokemon);

						// 2. 直接修改宝可梦的当前特性和基础特性。这是最关键的修正！
						pokemon.ability = newAbility.id;
						pokemon.baseAbility = newAbility.id;

						// 3. 为新特性初始化状态(abilityState)。
						pokemon.abilityState = this.initEffectState({id: this.toID(pokemon.ability), target: pokemon});

						// 4. 触发新特性的 'Start' 事件，使其所有效果(包括被动效果)立即注册并激活。
						this.singleEvent('Start', newAbility, pokemon.abilityState, pokemon);
						
					} else {
						// 如果没有可复制的对手，逻辑保持不变
						pokemon.ability = 'chonghuapi' as ID;
						pokemon.baseAbility = 'chonghuapi' as ID;
						pokemon.abilityState = this.initEffectState({id: 'chonghuapi' as ID, target: pokemon});
					}
				}
				
				// 重置状态
				this.effectState.busted = false;
			}
		},
		flags: {
			failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1,
			breakable: 1, notransform: 1,
		},
		name: "Disguise",
		rating: 3.5,
		num: 209,
	},
	corrosion: {
		onModifyMove(move, pokemon, target) {
			// 检查1：确保我们只修改“毒”属性的招式
			if (move.type !== 'Poison') return;
			// 检查2：确保目标存在且拥有“钢”属性
			if (target?.hasType('Steel')) {
				/*关键修正：忽略免疫性
				 * 这行代码告诉对战引擎，在本次攻击中，无视目标基于属性的免疫。
				 * 这就解决了毒系招式无法命中钢系宝可梦的根本问题。
				 */
				move.ignoreImmunity = true;
				/* 关键逻辑：修改克制倍率
				 * 这个函数现在可以被正常调用了，因为它已经越过了免疫检查。
				 * 我们在这里将毒对钢的伤害倍率从“无效”改为“效果绝佳”。
				 */
				move.onEffectiveness = function (typeMod, t, type, m) {
					// 当系统计算对'Steel'属性的克制时，返回1，代表效果绝佳(x2)
					// 在很多引擎中，typeMod的计算方式是：1=绝佳, 0=普通, -1=抵抗
					if (type === 'Steel') return 1;
				};
			}
		},
    	// 原特性效果说明：这个特性的中毒效果是在游戏核心逻辑中实现的，
		// Implemented in sim/pokemon.js:Pokemon#setStatus
		flags: {},
		name: "Corrosion",
		rating: 3.5,
		num: 212,
		shortDesc: "可以使钢属性和毒属性的宝可梦也陷入中毒状态,毒系招式对钢系效果绝佳",
	},
	stalwart: {
		// --------------------------------------------------
		// 1. 原有的“坚毅”效果 - 无视吸引招式
		// --------------------------------------------------
		onModifyMovePriority: 1,
		onModifyMove(move) {
			// 这部分代码通过设置一个 'tracksTarget' 标志，
			// 来告诉系统该宝可梦的招式会无视对手的重定向效果（如“看我嘛”）。
			// 核心逻辑在对战引擎的其他部分处理，但这个标志是必须的。
			move.tracksTarget = move.target !== 'scripted';
		},

		// --------------------------------------------------
		// 2. 新增的免疫效果 - 不会无法自由使出招式
		// --------------------------------------------------
		onTryAddVolatile(status, target, source, effect) {
			// 定义一个列表，包含所有我们想要免疫的状态的ID。
			const blockedStatuses = ['attract', 'taunt', 'encore', 'torment', 'disable', 'healblock'];

			// 检查当前正要施加的状态（status.id）是否在我们的黑名单里。
			if (blockedStatuses.includes(status.id)) {
				// 如果是，就在对战日志中显示免疫信息。
				// 这样玩家就能知道是特性“坚毅”阻止了状态变化。
				this.add('-immune', target, '[from] ability: Stalwart');
				// 返回 null 会中断状态施加的流程，从而实现免疫。
				return null;
			}
		},
		flags: {},
		name: "Stalwart",
		rating: 2, 
		num: 242,
		shortDesc: "攻击原本选定的目标。不会进入着迷、再来一次、挑衅、无理取闹、定身法和回复封锁状态",
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
		shortDesc: "攀登者。交换时,拥有此特性的宝可梦可以不受所有岩石系攻击和隐形岩伤害",
	},
		persistent: {
		// implemented in the corresponding move
		flags: {},
		name: "Persistent",
		rating: 3,
		num: -4,
		shortDesc: "坚守。使用招式时，重力/回复封锁/神秘守护/顺风/空间效果可多持续2个回合",
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
			// 触发回血时，来源宝可梦就是使用者自身
			// this.heal 的第三个参数是 'source' (来源)
			// 我们将 undefined 改为 pokemon
			this.heal(pokemon.baseMaxhp / 8, pokemon, pokemon, this.dex.abilities.get('fengchao'));
		},
		name: "Feng Chao",
		rating: 5,
		num: 10000,
		shortDesc: "蜂巢。虫属性的弱点消失。虫属性招式威力提升1.5倍,使用虫属性招式时会回复最大HP的1/8",	
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
		shortDesc: "速军。即使使出了使用后下一回合自己将无法动弹的招式后,自己也不会陷入无法动弹状态",	
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
		rating: 3.5,
		num: 10002,
		shortDesc: "回避再生。HP变为一半时,为了回避危险,会退回到同行队伍中。交换下场时,回复自身最大HP的1/4",
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
		shortDesc: "破竹。拥有此特性的宝可梦在使用射击类招式时,无视防御方的能力变化与特性,直接给予伤害",
	},
	mishi: {
		onEffectiveness(typeMod, target, type, move) {
			// 确保 target 存在并且有特性 'mishi'
			if (target && target.hasAbility('mishi') && typeMod) {
				// 如果原本是弱点（typeMod > 0），就变成抗性（resisted）
				if (typeMod > 0) {
					this.debug('mishi: Reversing effectiveness (Weakness becomes Resistance)');
					return -typeMod; // 反转为抗性
				}
				// 如果原本是抗性（typeMod < 0），就变成弱点（super effective）
				else if (typeMod < 0) {
					this.debug('mishi: Reversing effectiveness (Resistance becomes Weakness)');
					return -typeMod; // 反转为弱点
				}
			}
			// 如果没有触发 "mishi" 特性，返回原始类型相性
			return typeMod;
		},
		flags: { breakable: 1 },
		name: "Mi Shi",
		rating: 1.5,
		num: 10004,
		shortDesc: "谜石。属性相性反转。效果绝佳变为效果不好,效果不好变为效果绝佳,没有效果则保持没有效果",
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
		rating: 4.5,
		num: 10005,
		shortDesc: "天籁之音。拥有此特性的宝可梦使出的声音招式会变为无属性,并拥有1.5倍本系威力提升",
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
		shortDesc: "魔术师之红。造成伤害时,若无道具,获得目标道具;若有道具,使目标在受到超能系技能攻击后失去道具",
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
		shortDesc: "汲取苏生。在攻击对方成功造成伤害时,携带者的HP会恢复其所造成伤害的1/3",
	},
	xuezhili: {
		onBasePowerPriority: 21,
		onBasePower(basePower, attacker, defender, move) {
			// 检查当前天气是否为“雪天或冰雹”（hail 或 snowscape）
			if (this.field.isWeather(['hail', 'snowscape'])) {
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
		shortDesc: "雪之力。在下雪或冰雹天气下,该特性的宝可梦使用的招式威力提升30%",
	},
	baoxuezhili: {
	// 效果1: 来自“降雪”的登场发动天气效果
	onStart(source) {
		this.field.setWeather('snowscape');
	},
		// 效果2: 来自“雪之力”的威力提升
		onBasePowerPriority: 21,
		onBasePower(basePower, attacker, defender, move) {
			if (this.field.isWeather(['hail', 'snowscape'])) {
				this.debug('Blizzard Force boost');
				return this.chainModify([5325, 4096]);
			}
		},
		// 效果3: 来自“雪之力”的伤害免疫
		onImmunity(type, pokemon) {
			if (type === 'hail') return false;
		},
	    flags: {},
		name: "Bao Xue Zhi Li", 
		rating: 4.5, 
		num: 10009, 
		shortDesc: "暴雪之力。兼备降雪和雪之力这两种特性",
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
		name: "Xue Nv",
		rating: 3,
		num: 10010,
		shortDesc: "雪女。在首次出场以及被打倒时，会创造一次黑雾",
	},
	zhengfa: {
	    onModifyMove(move, pokemon, target) {
        // 检查1：确保我们只修改“火”属性的招式
        if (move.type !== 'Fire') return;

        // 检查2：确保目标存在且拥有“水”属性
        if (target?.hasType('Water')) {
            /* 关键逻辑：修改克制倍率
             * 我们不再依赖于特性本身的 onSourceEffectiveness 事件，
             * 而是直接给这个招式本身（仅限本次使用）附加一个临时的
             * onEffectiveness 函数。这让我们的意图更加明确。
             */
            move.onEffectiveness = function (typeMod, t, type, m) {
                // 当系统正在计算对'Water'属性的克制效果时...
                if (type === 'Water') {
                    this.debug('Zheng Fa ability is making Fire super effective against Water!');
                    // ...我们强制返回 1，代表“效果绝佳”(2x)。
                    return 1;
                }
            };
        }
    },
	    flags: {},
		name: "Zheng Fa",
		rating: 3.5,
		num: 10011,
		shortDesc: "蒸发。使用的火属性招式会对水属性宝可梦造成效果绝佳",
	},
	tiekai: {
		onSourceModifyDamage(damage, source, target, move) {
			if (target.runEffectiveness(move) <= 1) {
				this.debug('Tie Kai neutralize');
				return this.chainModify(0.75);
			}
		},
		flags: { breakable: 1 },
		name: "Tie Kai",
		rating: 3,
		num: 10012,
		shortDesc: "铁铠。效果一般和效果不好招式造成的伤害降低1/4",
	},
	jizhineng: {
		onModifyMove(move, attacker) {
			// 步骤 1: 检查是否为伤害招式，并比较双攻
			if (move.category === 'Status') return;
			const atk = attacker.getStat('atk', false, true);
			const spa = attacker.getStat('spa', false, true);
			// 如果是物理招式，但特攻更高，则给招式打上一个标记
			// 表示“在计算攻击力时，请使用特攻的数值”
			if (move.category === 'Physical' && spa > atk) {
				this.add('-ability', attacker, '极智能');
				move.overrideOffensiveStat = 'spa'; // 打上标记
			} 
			// 如果是特殊招式，但物攻更高，也打上标记
			// 表示“在计算特攻力时，请使用物攻的数值”
			else if (move.category === 'Special' && atk > spa) {
				this.add('-ability', attacker, '极智能');
				move.overrideOffensiveStat = 'atk'; // 打上标记
			}
		},
		// 步骤 2: 在伤害计算的不同阶段，根据标记替换数值
		onModifyAtk(atk, attacker, defender, move) {
			// 当游戏引擎来获取“攻击(atk)”数值时，检查标记
			// 如果标记是 'spa'，说明我们需要用特攻来代替
			if (move.overrideOffensiveStat === 'spa') {
				this.debug('极智能: 攻击(atk)数值被特攻(spa)替代');
				return attacker.getStat('spa', false, true); // 返回特攻数值
			}
		},
		onModifySpA(spa, attacker, defender, move) {
			// 当游戏引擎来获取“特攻(spa)”数值时，检查标记
			// 如果标记是 'atk'，说明我们需要用物攻来代替
			if (move.overrideOffensiveStat === 'atk') {
				this.debug('极智能: 特攻(spa)数值被攻击(atk)替代');
				return attacker.getStat('atk', false, true); // 返回物攻数值
			}
		},
	    flags: {},
		name: "Ji Zhi Neng",
		rating: 3.5,
		num: 10013,
		shortDesc: "极智能。以攻击和特攻中较高的一项的数值,使出物理技能和特殊技能",
	},
	jiguangxingzhe: {
		onStart(source) {
			// 1. 首次登场检查：检查永久标记，如果已触发过，则直接停止
			if ((source as any).jiguangxingzheTriggered) return;
			// 2. 场地检查：如果场上已经有极光幕，也停止
			if (source.side.getSideCondition('auroraveil')) {
				return;
			}
			// --- 执行特性效果 ---
			this.add('-ability', source, '极光行者');
			// 3. “贴标签”：为auroraveil技能传递信息，让它知道要开5回合
			(source as any).jiguangxingzheIsActivating = true;
			source.side.addSideCondition('auroraveil', source);
			delete (source as any).jiguangxingzheIsActivating; // 立刻“撕掉标签”
			// 4. 设置永久标记：在宝可梦身上“记忆”已经发动过一次
			(source as any).jiguangxingzheTriggered = true;
		},
	    flags: {},
		name: "Ji Guang Xing Zhe",
		rating: 4,
		num: 10014,
		shortDesc: "极光行者。首次出场时,可以使己方场地进入5回合极光幕状态,如果使用者携带光之黏土则持续8回合",
	},
	huoshanxingzhe: {
		// 当拥有此特性的宝可梦登场或获得此特性时触发
		onStart(source) {
			// 如果对手场上已经有火海了，就什么都不做
			if (source.side.foe.getSideCondition('seaoffire')) return;
			
			// 记录日志并施加火海效果
			this.add('-ability', source, '火山行者');
			source.side.foe.addSideCondition('seaoffire');
		},
		// 当此特性因为任何原因结束时触发
		// (例如：宝可梦交换离场、濒死、被胃酸、或特性被交换)
		onEnd(source) {
			// 步骤1：这个检查逻辑是正确的，我们保留它。
			// 它确保只有在最后一个“火山行者”离场时，才执行后面的清除代码。
			for (const pokemon of this.getAllActive()) {
				if (pokemon !== source && pokemon.hasAbility('huoshanxingzhe')) {
					return;
				}
			}

			// 步骤2：这是新的清除逻辑。
			// 它会遍历场上所有的边（我方和敌方），并清除所有火海。
			this.add('-message', '随着火山行者的离去，火海平息了。');
			for (const side of this.sides) {
				if (side.getSideCondition('seaoffire')) {
					side.removeSideCondition('seaoffire');
				}
			}
		},
	    flags: {},
		name: "Huo Shan Xing Zhe",
		rating: 4,
		num: 10015,
		shortDesc: "火山行者。登场时创造火海,直到离场或失去该特性。",
	},
	leitingxingzhe: {
		// onStart 和 onEnd 确保登场和离场时能正确处理
		onStart(pokemon) {
			this.add('-ability', pokemon, '雷霆行者');
			// 登场时立即创造场地
			this.field.addPseudoWeather('iondeluge');
		},
		onEnd(pokemon) {
			// 离场时，直接移除场地效果
			this.field.removePseudoWeather('iondeluge');
		},
		onBeforeMove(pokemon) {
			// 检查场上是否还存在“等离子浴”效果
			if (!this.field.getPseudoWeather('iondeluge')) {
				// 如果不存在，则重新创造一次
				this.add('-message', `${pokemon.name} 的“雷霆行者”特性再次引发了等离子浴！`); // 添加一条提示信息
				this.field.addPseudoWeather('iondeluge');
			}
		},
		onModifyMove(move, pokemon, target) {
			// 1. 只对电属性招式生效
			if (move.type !== 'Electric') return;
			// 2. 检查目标是否为地面系
			if (target?.hasType('Ground')) {
				// 3. 允许招式无视免疫
				move.ignoreImmunity = true;
				// 4. 动态修改本次招式的克制计算规则
				if (!move.onEffectiveness) { // 这是一个好的编程习惯，确保不覆盖已有的同名函数
					move.onEffectiveness = function (typeMod, t, type) {
						// 当计算对"Ground"属性的克制倍率时，强制返回"效果不好"
						if (type === 'Ground') {
							return -1; // -1 代表 0.5倍伤害 (效果不好)
						}
					};
				}
			}
		},
	    flags: {},
		name: "Lei Ting Xing Zhe",
		rating: 4,
		num: 10016,
		shortDesc: "雷霆行者。登场时创造等离子浴,直到离场或失去该特性。电属性招式能击中地面属性但效果不好",
	},
	woju: {
		// onStart 在宝可梦登场时触发
		onStart(pokemon) {
			// 为宝可梦添加“蜗居”这个挥发性状态
			pokemon.addVolatile('woju', pokemon);
		},
		// onBeforeMove 在使用技能前触发
		onBeforeMove(pokemon, target, move) {
			// 检查宝可梦是否拥有“蜗居”状态
			if (pokemon.volatiles['woju']) {
				// 如果有，就移除它
				pokemon.removeVolatile('woju');
			}
		},
		// onResidual 在回合结束时触发
		onResidual(pokemon) {
			// 如果宝可梦当前没有“蜗居”状态，并且还活着
			if (!pokemon.volatiles['woju'] && pokemon.hp > 0) {
				// 就重新为它添加上
				pokemon.addVolatile('woju', pokemon);
			}
		},
		flags: {
			cantsuppress: 1, failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, notransform: 1,
		},
		name: "Wo Ju",
		rating: 4.5,
		num: 10017,
		shortDesc: "蜗居。登场时蜗居壳中,使用技能前钻出,回合结束时再次缩回壳中蜗居",
	},
	chonghuapi: {
		// onStart 会在每次宝可梦登场时触发
		onStart(pokemon) {
			const possibleTargets = pokemon.adjacentFoes().filter(
				(target: Pokemon) => !target.getAbility().flags['notrace'] && target.ability !== 'noability'
			);

			if (!possibleTargets.length) return;

			const target = this.sample(possibleTargets);
			const ability = target.getAbility();

	        this.add('-ability', pokemon, 'Chong Hua Pi');

			this.add('-ability', pokemon, ability, '[from] ability: Chong Hua Pi', `[of] ${target}`);
			
			// 关键修正：同时设置当前和基础特性，确保复制永久生效
			pokemon.setAbility(ability);
			pokemon.baseAbility = ability.id;
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1 },
		name: "Chong Hua Pi",
		rating: 4,
		num: 10018,
		shortDesc: "重画皮。仿照眼前宝可梦的模样重画皮,永久获得对方的特性",
	},
	muhouheishou: {
		// 物理攻击修正
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			// 检查防御方 (defender) 的HP是否小于等于一半
			if (defender.hp * 2 <= defender.maxhp) {
				this.debug('Mu Hou Hei Shou (ATK) boost');
				// 将攻击方 (attacker) 的攻击 (atk) 数值临时乘以 1.5
				return this.chainModify(1.5);
			}
		},
		// 特殊攻击修正
		onModifySpAPriority: 5,
		onModifySpA(spa, attacker, defender, move) {
			// 同样，检查防御方 (defender) 的HP
			if (defender.hp * 2 <= defender.maxhp) {
				this.debug('Mu Hou Hei Shou (SPA) boost');
				// 将攻击方 (attacker) 的特攻 (spa) 数值临时乘以 1.5
				return this.chainModify(1.5);
			}
		},
	    flags: {},
		name: "Mu Hou Hei Shou",
		num: 10019,
		rating: 2.5,
		shortDesc: "幕后黑手。如果目标的HP为其最大HP的1/2或以下,对其造成的伤害提升1.5倍",
	},
	shichong: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Bug') {
				// 步骤 1: 显示免疫信息，这部分是正确的
				this.add('-immune', target, '[from] ability: 食虫');

				// 步骤 2: [修正] 执行回血，并明确指定回血的来源是 target 自己
				// heal( amount, target, source )
				this.heal(target.baseMaxhp / 8, target, target);

				// 步骤 3: [修正] 对手扣血，让游戏引擎自动推断伤害来源
				// damage( amount, target, source )
				this.damage(source.baseMaxhp / 8, source, target);

				// 步骤 4: 中断攻击
				return null;
			}
		},
		flags: { breakable: 1 },
		name: "Shi Chong",
		num: 10020,
		rating: 3.5,
		shortDesc: "食虫。受到虫属性招式攻击时回复1/8最大HP,对手损失1/8最大HP;免疫虫属性伤害",
	},
	shouhun: {
		// 当任何宝可梦倒下时触发，设置一个优先级
		onAnyFaintPriority: 1, 
		onAnyFaint() {
			// this.effectState.target 指的是拥有这个“收魂”特性的宝可梦
			const source = this.effectState.target;
			// 如果该宝可梦已经满血或者不在场上，则不触发效果
			if (source.hp >= source.maxhp || !source.isActive) {
				return;
			}
			// 关键改动在这里！
			// 我们不再手动调用 this.add() 来显示信息。
			// 而是让 this.heal() 自己来处理日志。
			// 我们通过传递第四个参数 this.effect 来告诉游戏，这次治疗是由这个特性发动的。
			this.heal(source.maxhp / 4, source, source, this.effect);
		},
		flags: {},
		name: "Shou Hun",
		num: 10021,
		rating: 3.5,
		shortDesc: "收魂。每当场上有宝可梦被打倒时,恢复1/4的最大HP",
	},
	chaoyueqianbanbianshen: {
		// 登场时触发
		onStart(pokemon) {
			if (pokemon.hasItem('greninjaashz')) {
				this.add('-ability', pokemon, 'Chao Yue Qian Ban Bian Shen');
				pokemon.formeChange('Greninja-Ash-Fantasy', this.effect, true);
			}
		},
		onSourceAfterFaint(length, target, source, effect) {
			if (effect?.effectType !== 'Move') {
				return;
			}
			if (source.species.id === 'greninjabondfantasy' && source.hp && !source.transformed && source.side.foePokemonLeft()) {
				this.add('-activate', source, 'ability: Chao Yue Qian Ban Bian Shen');
				source.formeChange('Greninja-Ash-Fantasy', this.effect, true);
			}
		},
		onModifyMovePriority: -1,
		onModifyMove(move, attacker) {
			if (move.id === 'watershuriken' && attacker.species.name === 'Greninja-Ash-Fantasy' &&
				!attacker.transformed) {
				move.multihit = 3;
			}
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Chao Yue Qian Ban Bian Shen",
		num: 10022,
		rating: 4.5,
		shortDesc: "超越牵绊变身。携带智忍蛙Z或击倒对方一只宝可梦,变身为幻想小智版甲贺忍蛙",
	},
	duwupifu: {
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Poison';
				move.typeChangerBoosted = this.effect;
			}
		},
		onBasePowerPriority: 23,
		onBasePower(basePower, pokemon, target, move) {
			if (move.typeChangerBoosted === this.effect) {
				return this.chainModify([4915, 4096]);
			}
		},
		flags: {},
		name: "Du Wu Pi Fu",
		num: 10023,
		rating: 4,
		shortDesc: "毒污皮肤。一般属性招式变为毒属性招式,威力提升20%",
	},
	qingguanghuayu: {
		// onStart checks for conditions the moment the Pokémon enters battle.
		onStart(pokemon) {
			const isActivated = pokemon.volatiles['qingguanghuayu'];
			const isConditionMet = this.field.isWeather(['sunnyday', 'desolateland']) || this.field.isTerrain('grassyterrain');

			if (isConditionMet && !isActivated) {
				pokemon.addVolatile('qingguanghuayu');
			} else if (!isConditionMet && isActivated) {
				pokemon.removeVolatile('qingguanghuayu');
			}
		},

		onUpdate(pokemon) {
			const isActivated = pokemon.volatiles['qingguanghuayu'];
			const isConditionMet = this.field.isWeather(['sunnyday', 'desolateland']) || this.field.isTerrain('grassyterrain');

			if (isConditionMet && !isActivated) {
				pokemon.addVolatile('qingguanghuayu');
			} else if (!isConditionMet && isActivated) {
				pokemon.removeVolatile('qingguanghuayu');
			}
		},
		onEnd(pokemon) {
			pokemon.removeVolatile('qingguanghuayu');
		},

		condition: {
			noCopy: true, // Prevents this temporary state from being copied by moves like Role Play.
			onStart(pokemon) {
				this.add('-activate', pokemon, 'ability: Qing Guang Hua Yu');
				this.boost({spd: 2}, pokemon);
			},
			onEnd(pokemon) {
				this.add('-end', pokemon, 'Qing Guang Hua Yu', '[silent]');
			},
		},
		flags: {},
		name: "Qing Guang Hua Yu",
		num: 10024, 
		rating: 4,
		shortDesc: "晴光花语。每当处于大晴天或青草场地上时,特防提升2级",
	},
	huolinfen: {
		onStart(pokemon) {
			// 步骤 1: 检查永久标记
			// 我们在宝可梦对象上直接附加一个自定义属性来“记住”是否已触发。
			// 这个属性不会在交换下场时被清除。
			// 使用 `(pokemon as any)` 是为了告诉 TypeScript 我们知道自己在做什么。
			if ((pokemon as any).huolinfenTriggered) {
				return;
			}
			// 步骤 2: 检查场上是否存在需要清除的效果 (这部分逻辑是正确的)
			const conditionsToRemove = [
				'spikes', 
				'toxicspikes', 
				'stealthrock', 
				'stickyweb', 
				'gmaxsteelsurge'
			];
			const hazardsPresent = conditionsToRemove.some(condition => pokemon.side.getSideCondition(condition));
			// 步骤 3: 执行效果并设置永久标记
			if (hazardsPresent) {
				this.add('-activate', pokemon, 'ability: Huo Lin Fen');
				// 清除效果的循环 (这部分也是正确的)
				for (const condition of conditionsToRemove) {
					if (pokemon.side.removeSideCondition(condition)) {
						this.add('-sideend', pokemon.side, this.dex.conditions.get(condition).name, '[from] ability: Huo Lin Fen', `[of] ${pokemon}`);
					}
				}
				// 关键修正：设置一个永久标记，表示这个宝可梦的“火鳞粉”已经发动过了。
				(pokemon as any).huolinfenTriggered = true;
			}
		},
		flags: {},
		name: "Huo Lin Fen",
		rating: 4,
		num: 10025,
		shortDesc: "火鳞粉。出场时,烧除我方场地上的所有效果。一场战斗中仅能发动1次",
	},
	tundu: {
		onTryHit(target, source, move) {
			if (target !== source && move.type === 'Poison') {
				move.accuracy = true;
				if (!target.addVolatile('tundu')) {
					this.add('-immune', target, '[from] ability: Tun Du');
				}
				return null;
			}
		},

		onEnd(pokemon) {
			pokemon.removeVolatile('tundu');
		},
		condition: {
			noCopy: true, 
			onStart(target) {
				this.add('-start', target, 'ability: Tun Du');
			},
			onModifyAtkPriority: 5,
			onModifyAtk(atk, attacker, defender, move) {
				if (move.type === 'Poison' && attacker.hasAbility('tundu')) {
					this.debug('Tun Du boost');
					return this.chainModify(1.5);
				}
			},
			onModifySpAPriority: 5,
			onModifySpA(spa, attacker, defender, move) {
				if (move.type === 'Poison' && attacker.hasAbility('tundu')) {
					this.debug('Tun Du boost');
					return this.chainModify(1.5);
				}
			},
			onEnd(target) {
				this.add('-end', target, 'ability: Tun Du', '[silent]');
			},
		},
		flags: { breakable: 1 }, 
		name: "Tun Du",
		rating: 3.5,
		num: 10026, 
		shortDesc: "吞毒。免疫毒属性招式伤害,受到毒属性招式攻击时毒属性招式威力提升50%",
	},
	fengya: {
		// 效果1：自身的速度不会被降低。
		onTryBoost(boost, target, source, effect) {
			if (source && target === source) return;

			if (boost.spe && boost.spe < 0) {
				delete boost.spe;
				if (!(effect as ActiveMove).secondaries && effect.id !== 'octolock') {
					this.add("-fail", target, "unboost", "Speed", "[from] ability: Feng Ya", `[of] ${target}`);
				}
			}
		},
		// 效果2：首次出场时用强风压制对手，降低对手的速度1级。
		onStart(pokemon) {
			// 【关键修正】使用 (pokemon as any) 来绕过 TypeScript 的类型检查。
			if ((pokemon as any).windPressureTriggered) return;
			// 【关键修正】在设置属性时也同样使用。
			(pokemon as any).windPressureTriggered = true;

			this.add('-ability', pokemon, 'Feng Ya');

			for (const target of pokemon.adjacentFoes()) {
				if (target.volatiles['substitute']) {
					this.add('-immune', target);
				} else {
					this.boost({ spe: -1 }, target, pokemon, null, true);
				}
			}
		},
		flags: { breakable: 1 },
		name: "Feng Ya",
		rating: 2.5, 
		num: 10027, 
		shortDesc: "风压。自身的速度不会被降低。首次出场时用强风压制对手,降低对手的速度1级",
	},
	longzhihuxi: {
		// 效果1 & 2: 使用技能不会降低自身能力（每次出场仅一次）
		onStart(pokemon) {
			// 这个状态会在宝可梦每次上场时重置
			// 确保“仅一次”的效果在每次交换后都能重新触发
			this.effectState.used = false;
		},
		onTryBoost(boost, target, source, effect) {
			// 确保这个效果只作用于“自己对自己”使用“招式”时产生的能力下降
			if (!source || target !== source || !effect || effect.effectType !== 'Move') {
				return;
			}
			// 如果本次登场后，该效果已经触发过，则直接返回，不再生效
			if (this.effectState.used) {
				return;
			}
			// 检查是否有任何一项能力变化是“降低”的
			let hasNegativeBoost = false;
			for (const stat in boost) {
				// ▼▼▼【修正点 1】▼▼▼
				// 我们使用 "as keyof typeof boost" 来告诉 TypeScript，
				// "stat" 变量一定是 "boost" 对象的一个合法键。
				if (boost[stat as keyof typeof boost]! < 0) {
					hasNegativeBoost = true;
					break;
				}
			}
			// 如果确实存在能力降低...
			if (hasNegativeBoost) {
				// 在对战日志中显示特性发动信息
				this.add('-activate', target, 'ability: Long Zhi Hu Xi');
				// 将“已使用”标记设为 true，这样在下一次能力降低时就不会再触发
				this.effectState.used = true;

				// 遍历所有能力变化，只删除“降低”的部分，保留“提升”的部分
				// 这对于像“破壳”这样同时有增有减的招式至关重要
				for (const stat in boost) {
					// ▼▼▼【修正点 2】▼▼▼
					// 这里也进行同样的类型断言
					if (boost[stat as keyof typeof boost]! < 0) {
						delete boost[stat as keyof typeof boost];
					}
				}
			}
		},
		// 效果3: 一般属性的招式会变为龙属性
		onModifyTypePriority: -1,
		onModifyType(move, pokemon) {
			// 这是标准的属性转换类特性的逻辑
			const noModifyType = [
				'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'technoblast', 'terrainpulse', 'weatherball',
			];
			if (move.type === 'Normal' && !noModifyType.includes(move.id) &&
				!(move.isZ && move.category !== 'Status') && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
				move.type = 'Dragon';
				// 注意：因为你的要求中没有提到威力提升，所以这里我们没有添加
				// 类似 `move.typeChangerBoosted = this.effect;` 的代码
			}
		},
		flags: {},
		name: "Long Zhi Hu Xi",
		rating: 3.5,
		num: 10028,
		shortDesc: "龙之呼吸。使用技能不会降低自身能力,每次出场战斗仅生效一次。一般属性的招式会变为龙属性",
	},
	bianhuanziyou: {
		onPrepareHit(source, target, move) {
			if (move.hasBounced || move.flags['futuremove'] || move.sourceEffect === 'snatch' || move.callsMove) return;
			const type = move.type;
			if (type && type !== '???' && source.getTypes().join() !== type) {
				if (!source.setType(type)) return;
				this.add('-start', source, 'typechange', type, '[from] ability: Bian Huan Zi You');
			}
		},
		flags: {},
		name: "Bian Huan Zi You",
		rating: 4.5,
		num: 10029,
		shortDesc: "变幻自由。自身属性变为即将使用的招式的属性",
	},
	quanlidamo: {
		onBeforeMove(pokemon) {
			// 基础检查：必须是达摩狒狒，且未被变身，且当前不是达摩模式
			if (pokemon.baseSpecies.baseSpecies !== 'Darmanitan' || pokemon.transformed) {
				return;
			}
			if (pokemon.species.forme.includes('Zen')) {
				return;
			}

			let targetForme = '';
			// 【核心修正】进行精确的ID匹配
			// 检查当前宝可梦的ID是否为 'darmanitanfantasy'
			if (pokemon.species.id === 'darmanitanfantasy') {
				targetForme = 'Darmanitan-Zen-Fantasy';
			} 
			// 检查当前宝可梦的ID是否为 'darmanitangalarfantasy'
			else if (pokemon.species.id === 'darmanitangalarfantasy') {
				targetForme = 'Darmanitan-Galar-Zen-Fantasy';
			} else {
				// 如果不是以上两种指定的形态，则不执行任何操作
				return;
			}
			
			// 显示特性发动信息，并执行永久的形态变化
			this.add('-activate', pokemon, 'ability: Quan Li Da Mo');
			pokemon.formeChange(targetForme, this.effect, true);
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Quan Li Da Mo",
		rating: 2,
		num: 10030,
		shortDesc: "全力达摩。使用招式前会变为达摩模式,且该形态会一直持续",
	},
};
