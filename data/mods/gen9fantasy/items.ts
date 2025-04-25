export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
	fantasyitem: {
		name: "Fantasy Item",
		spritenum: 523,
		fling: {
			basePower: 30,
		},
		onBasePowerPriority: 15,
		onBasePower(basePower, user, target, move) {
			if (move.type === 'Stellar') {
				return this.chainModify([4915, 4096]);
			}
		},
		num: 10000,
		gen: 9,
		shortDesc: "Holder's Stellar-type attacks have 1.2x power.",
	},
	toxtricityz: {
		name: "Toxtricity Z",
		onTakeItem: false, // Z纯晶不能被移除
		zMove: "Chaopinyaogunpoyinbo",
		zMoveFrom: "Overdrive",
		itemUser: ["Toxtricity-Fantasy", "Toxtricity-Low-Key-Fantasy"], // 再次确认形态名称
		num: 10001, // 自定义物品编号，确保唯一性
		gen: 9,
		desc: "颤弦蝾螈携带后，可以把破音转化成特殊的Ｚ招式：超频摇滚破音波。",
		shortDesc: "颤弦蝾螈携带后，可以把破音转化成特殊的Ｚ招式：超频摇滚破音波。",
	}
};
