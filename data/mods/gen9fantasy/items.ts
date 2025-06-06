export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
	toxtricityz: {
		name: "Toxtricity Z",
		spritenum: 686,
		onTakeItem: false, // Z纯晶不能被移除
		zMove: "Chaopinyaogunpoyinbo",
		zMoveFrom: "Overdrive",
		itemUser: ["Toxtricity-Fantasy", "Toxtricity-Low-Key-Fantasy"], // 再次确认形态名称
		num: 10000, 
		gen: 9,
		desc: "颤弦蝾螈Z。颤弦蝾螈携带后，可以把破音转化成特殊的Ｚ招式：超频摇滚破音波。",
		shortDesc: "颤弦蝾螈Z。颤弦蝾螈携带后，可以把破音转化成特殊的Ｚ招式：超频摇滚破音波。",
	}, 
	fantasypowerlens: {
		name: "Fantasy Power Lens",
		spritenum: 359,
		fling: {
			basePower: 100,
		},
		onModifyMove(move, source) {
			// 确保“willCrit”永远为 false，禁用暴击
			move.willCrit = false;
		},
		onSourceModifyAccuracy(accuracy, source, target, move) {
			// 只对命中率小于 100% 且非 Status 类型的技能进行提升。
			if (accuracy < 100 && move.category !== 'Status') {
				this.debug('Fantasy Power Lens: Increasing Accuracy');
				return this.chainModify([4915, 4096]); // 提升命中率1.2倍
			}
			return accuracy;  // 不影响满100%命中的技能
		},
		onSourceModifyDamage(damage, source, target, move) {
			// 对非“状态类”技能（不为"Status"的技能）提升威力1.2倍
			if (move.category !== 'Status') {
				this.debug('Fantasy Power Lens: Increasing Damage');
				return this.chainModify([4915, 4096]); // 提升威力1.2倍
			}
			return damage; // 状态类技能不受影响
		},
		num: 10001,
		gen: 9,
		desc: "幻之力量镜。携带后, 虽然攻击将无法击中要害, 但命中不满100%的非变化类技能命中率与威力会提升1.2倍。",
		shortDesc: "幻之力量镜。携带后, 虽然攻击将无法击中要害, 但命中不满100%的非变化类技能命中率与威力会提升1.2倍。",
	},
	fantasyringtarget: {
		name: "Fantasy Ring Target",
		spritenum: 410, // 随便用 Ring Target 的图标
		fling: {
			basePower: 30,
		},
		// 禁用变化招式
		onDisableMove(pokemon) {
			for (const moveSlot of pokemon.moveSlots) {
				const move = this.dex.moves.get(moveSlot.id);
				if (move.category === 'Status') {
					pokemon.disableMove(moveSlot.id);
				}
			}
		},
		// 无视免疫
		onEffectiveness(typeMod, target, type, move) {
			if (!move || move.category === 'Status') return;
			// 原本免疫 → 改成正常
			if (this.dex.getEffectiveness(move, type) === 0) {
				return 0;
			}
		},
		num: 10002,
		gen: 9,
		desc: "幻之标靶。在携带该道具后, 虽然无法使用变化招式, 但使用的原本属性相性没有效果的招式会变为有效果。",
		shortDesc: "幻之标靶。在携带该道具后, 使用的招式无视属性免疫, 但无法使用变化招式。",
	},	
};
