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
		shortDesc: "虫属性的弱点消失。虫属性招式威力提升1.5倍,使用虫属性招式时会回复最大HP的1/8。",	
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
		shortDesc: "即使使出了使用后下一回合自己将无法动弹的招式后，自己也不会陷入无法动弹状态。",	
	},
	huibizaisheng: {
		onEmergencyExit(target) {
			// 如果不能交换，或已经强制交换，则不处理
			if (!this.canSwitch(target.side) || target.forceSwitchFlag || target.switchFlag) return;
			// 计算恢复的HP：最大HP的1/4
			const healAmount = target.baseMaxhp / 4;
			// 回复HP
			target.heal(healAmount);
			// 设置切换标志，触发交换
			for (const side of this.sides) {
				for (const active of side.active) {
					active.switchFlag = false; // 清除其他宝可梦的交换标志
				}
			}
			target.switchFlag = true; // 设置当前宝可梦的交换标志
			// 激活特性效果
			this.add('-activate', target, 'ability: Emergency Exit');
			// 输出回复信息
			this.add('-heal', target, healAmount);
		},
		flags: {},
		name: "Huibizaisheng",
		rating: 2.5,
		num: 10002,
		shortDesc: "HP变为一半时,为了回避危险,会退回到同行队伍中并回复自身最大HP的1/4。",
	},
};
