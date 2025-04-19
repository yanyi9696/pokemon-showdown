export const Pokedex: import('../../../sim/dex-species').ModdedSpeciesDataTable = {
	garchomp: {
		inherit: true,
		otherFormes: ["Garchomp-Fantasy", "Garchomp-Mega"],
		formeOrder: ["Garchomp", "Garchomp-Fantasy", "Garchomp-Mega"],
	},
	garchompfantasy: {
		num: 445,
		name: "Garchomp-Fantasy",
		baseSpecies: "Garchomp",
		forme: "Fantasy",
		types: ["Dragon", "Ground"],
		baseStats: { hp: 108, atk: 140, def: 95, spa: 80, spd: 85, spe: 112 },
		abilities: { 0: "Rough Skin", H: "Sand Force" },
		heightm: 1.9,
		weightkg: 95,
		color: "Blue",
		eggGroups: ["Monster", "Dragon"],
	},
	vespiquen: {
		inherit: true,
		abilities: { 0: "Pressure", 1: "Fengchao", H: "Unnerve" },
	},
};
