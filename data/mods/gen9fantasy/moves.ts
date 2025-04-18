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
};
