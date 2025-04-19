export const Moves: import('../../../sim/dex-moves').ModdedMoveDataTable = {
	fantasymove: {
		num: 10000,
		accuracy: 100,
		basePower: 1,
		category: "Special",
		name: "Fantasy Move",
		pp: 25,
		priority: 0,
		flags: { protect: 1, mirror: 1, metronome: 1 },
		secondary: {
			chance: 100,
			self: {
				boosts: {
					spa: 1,
				},
			},
		},
		target: "normal",
		type: "Stellar",
		contestType: "Clever",
		desc: "Example New Move for Gen 9 Fantasy. Has a 100% chance to raise the user's Special Attack by 1 stage.",
		shortDesc: "Example Move. 100% chance to raise the user's Sp. Atk by 1."
	},
	xianxingzhiling: {
		num: 10001,
		accuracy: true,
		basePower: 0,
		category: "Status",
		name: "xianxingzhiling",
		pp: 16,
		priority: 0,
		flags: { protect: 1, mirror: 1, metronome: 1 },
		volatileStatus: '先行指令',
		condition: {
			onFractionalPriorityPriority: -2,
			onFractionalPriority(priority, pokemon) {
				if (priority <= 0) return 0.1;
			},
		},
		target: "normal",
		type: "Bug",
		contestType: "Clever",
		desc: "比较自己的攻击和特攻,令数值相对较高一项提高2级。使用后在相同优先度下将优先出手。",
		shortDesc: "比较自己的攻击和特攻,令数值相对较高一项提高2级。使用后在相同优先度下将优先出手。"
	}
};
