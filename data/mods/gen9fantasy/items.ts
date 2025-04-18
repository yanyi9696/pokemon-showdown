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
};
