export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	stancechange: {
		onModifyMovePriority: 1,
		onModifyMove(move, attacker, defender) {
			if (attacker.species.baseSpecies !== 'Aegislash-Fantasy' || attacker.transformed) return;
			if (move.category === 'Status' && move.id !== 'kingsshield') return;
			const targetForme = (move.id === 'kingsshield' ? 'Aegislash-Fantasy' : 'Aegislash-Blade-Fantasy');
			if (attacker.species.name !== targetForme) attacker.formeChange(targetForme);
		},
		flags: { failroleplay: 1, noreceiver: 1, noentrain: 1, notrace: 1, failskillswap: 1, cantsuppress: 1 },
		name: "Stance Change",
		rating: 4,
		num: 176,
	},
	//以下为自制特性
	fengchao: {
		onEffectivenessPriority: -1,
		onEffectiveness(typeMod, target, type, move) {
			if (move && move.effectType === 'Move' && move.category !== 'Status' && type === 'Bug' && typeMod > 0) {
				this.add('-activate', target, 'ability: Fengchao');
				return 0; // Bug-type attacks no longer have effectiveness changes
			}
		},
		onModifyAtkPriority: 5,
		onModifyAtk(atk, attacker, defender, move) {
			if (move.type === 'Bug') {
				this.debug('Fengchao Bug move power boost');
				return this.chainModify(1.5); // Increase Bug-type move attack power by 1.5x
			}
		},
		onModifySpAPriority: 5,
		onModifySpA(atk, attacker, defender, move) {
			if (move.type === 'Bug') {
				this.debug('Fengchao Bug move special attack boost');
				return this.chainModify(1.5); // Increase Bug-type move special attack power by 1.5x
			}
		},
		onAfterMove(pokemon, target, move) {
			if (move.type === 'Bug') {
				this.heal(pokemon.baseMaxhp / 8); // Heal 1/8 of max HP after using Bug-type move
			}
		},
		name: "Fengchao",
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
		name: "Sujun", 
		rating: 3,
		num: 10001,
		shortDesc: "速军。即使使出了使用后下一回合自己将无法动弹的招式后，自己也不会陷入无法动弹状态。",	
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
		name: "Huibizaisheng",
		rating: 2.5,
		num: 10002,
		shortDesc: "回避再生。HP变为一半时,为了回避危险,会退回到同行队伍中。交换下场时,回复自身最大HP的1/4。",
	},
	puozhu: {
		onStart(pokemon) {
			this.add('-ability', pokemon, 'Puozhu');
		},
		onModifyMove(move, pokemon) {
			// 如果招式具有射击标签（shooting）
			if (move.flags['shooting']) {
				// 忽视目标的特性
				move.ignoreAbility = true;
				// 输出消息，告知玩家特性正在忽视目标特性
				this.add('-message', `${pokemon.name}的射击类招式忽视了目标的能力变化与特性！`);
				// 添加忽视目标防御变化和闪避率的标记
				move.ignoreDefensive = true;  // 忽视目标的防御变化（如通过能力提升的防御）
				move.ignoreEvasion = true;    // 忽视目标的闪避率（无视闪避提升）
			}
		},
		flags: {},
		name: "Puozhu",
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
		name: "Mishizhen",
		rating: 1,
		num: 10004,
		shortDesc: "迷石阵。属性相性颠倒。原本效果绝佳的变为效果不好, 效果不好的变为效果绝佳, 没有效果的保持没有效果。",
	},
	yanzoujia: {
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
		name: "Yanzoujia",
		rating: 2.5,
		num: 10005,
		shortDesc: "演奏家。拥有此特性的宝可梦使出的声音招式会变为无属性, 并拥有1.5倍本系威力提升。",
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
					// 如果自己有道具，让对方道具失效
					const removedItem = target.takeItem(source);
					if (removedItem) {
						this.add('-enditem', target, removedItem.name, '[from] ability: Magician\'s Red', `[of] ${source}`);
					}
				}
			}
		},
		flags: {},
		name: "Moshushizhihong",
		rating: 3,
		num: 10006,
		shortDesc: "魔术师之红。造成伤害时, 如果自身没有携带道具则获得目标道具；如果自身已携带道具则使目标在战斗结束前失去其携带物品。",
	},
};
