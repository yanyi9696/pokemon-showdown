export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
	allseeingeye: {
		onAfterMove(source, target, move) {
			if (move.type === "Psychic" && move.category === "Status") {
				this.heal(source.baseMaxhp / 4);
			}
		},
		name: "All-Seeing Eye",
		rating: 3.5,
		num: 10000,
		shortDesc: "This Pokemon's Psychic-type status moves heal it for 1/4 max HP.",
	},
};
