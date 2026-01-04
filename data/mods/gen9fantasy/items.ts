export const Items: import("../../../sim/dex-items").ModdedItemDataTable = {
	//原版mega石
	abomasite: {
		name: "Abomasite",
		spritenum: 575,
		megaStone: ["Abomasnow-Mega", "Abomasnow-Mega-Fantasy"],
		megaEvolves: ["Abomasnow", "Abomasnow-Fantasy"],
		itemUser: ["Abomasnow", "Abomasnow-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 674,
		gen: 6,
	},
	absolite: {
		name: "Absolite",
		spritenum: 576,
		megaStone: ["Absol-Mega", "Absol-Mega-Fantasy"],
		megaEvolves: ["Absol", "Absol-Fantasy"],
		itemUser: ["Absol", "Absol-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 677,
		gen: 6,
	},
	aerodactylite: {
		name: "Aerodactylite",
		spritenum: 577,
		megaStone: ["Aerodactyl-Mega", "Aerodactyl-Mega-Fantasy"],
		megaEvolves: ["Aerodactyl", "Aerodactyl-Fantasy"],
		itemUser: ["Aerodactyl", "Aerodactyl-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 672,
		gen: 6,
	},
	aggronite: {
		name: "Aggronite",
		spritenum: 578,
		megaStone: ["Aggron-Mega", "Aggron-Mega-Fantasy"],
		megaEvolves: ["Aggron", "Aggron-Fantasy"],
		itemUser: ["Aggron", "Aggron-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 667,
		gen: 6,
	},
	alakazite: {
		name: "Alakazite",
		spritenum: 579,
		megaStone: ["Alakazam-Mega", "Alakazam-Mega-Fantasy"],
		megaEvolves: ["Alakazam", "Alakazam-Fantasy"],
		itemUser: ["Alakazam", "Alakazam-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 679,
		gen: 6,
	},
	altarianite: {
		name: "Altarianite",
		spritenum: 615,
		megaStone: ["Altaria-Mega", "Altaria-Mega-Fantasy"],
		megaEvolves: ["Altaria", "Altaria-Fantasy"],
		itemUser: ["Altaria", "Altaria-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 755,
		gen: 6,
	},
	ampharosite: {
		name: "Ampharosite",
		spritenum: 580,
		megaStone: ["Ampharos-Mega", "Ampharos-Mega-Fantasy"],
		megaEvolves: ["Ampharos", "Ampharos-Fantasy"],
		itemUser: ["Ampharos", "Ampharos-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 658,
		gen: 6,
	},
	audinite: {
		name: "Audinite",
		spritenum: 617,
		megaStone: ["Audino-Mega", "Audino-Mega-Fantasy"],
		megaEvolves: ["Audino", "Audino-Fantasy"],
		itemUser: ["Audino", "Audino-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 757,
		gen: 6,
	},
	banettite: {
		name: "Banettite",
		spritenum: 582,
		megaStone: ["Banette-Mega", "Banette-Mega-Fantasy"],
		megaEvolves: ["Banette", "Banette-Fantasy"],
		itemUser: ["Banette", "Banette-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 668,
		gen: 6,
	},
	beedrillite: {
		name: "Beedrillite",
		spritenum: 628,
		megaStone: ["Beedrill-Mega", "Beedrill-Mega-Fantasy"],
		megaEvolves: ["Beedrill", "Beedrill-Fantasy"],
		itemUser: ["Beedrill", "Beedrill-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 770,
		gen: 6,
	},
	blastoisinite: {
		name: "Blastoisinite",
		spritenum: 583,
		megaStone: ["Blastoise-Mega", "Blastoise-Mega-Fantasy"],
		megaEvolves: ["Blastoise", "Blastoise-Fantasy"],
		itemUser: ["Blastoise", "Blastoise-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 661,
		gen: 6,
	},
	blazikenite: {
		name: "Blazikenite",
		spritenum: 584,
		megaStone: ["Blaziken-Mega", "Blaziken-Mega-Fantasy"],
		megaEvolves: ["Blaziken", "Blaziken-Fantasy"],
		itemUser: ["Blaziken", "Blaziken-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 664,
		gen: 6,
	},
	cameruptite: {
		name: "Cameruptite",
		spritenum: 625,
		megaStone: ["Camerupt-Mega", "Camerupt-Mega-Fantasy"],
		megaEvolves: ["Camerupt", "Camerupt-Fantasy"],
		itemUser: ["Camerupt", "Camerupt-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 767,
		gen: 6,
	},
	charizarditex: {
		name: "Charizardite X",
		spritenum: 585,
		megaStone: ["Charizard-Mega-X", "Charizard-Mega-X-Fantasy"],
		megaEvolves: ["Charizard", "Charizard-Fantasy"],
		itemUser: ["Charizard", "Charizard-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 660,
		gen: 6,
	},
	charizarditey: {
		name: "Charizardite Y",
		spritenum: 586,
		megaStone: ["Charizard-Mega-Y", "Charizard-Mega-Y-Fantasy"],
		megaEvolves: ["Charizard", "Charizard-Fantasy"],
		itemUser: ["Charizard", "Charizard-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 678,
		gen: 6,
	},
	diancite: {
		name: "Diancite",
		spritenum: 624,
		megaStone: ["Diancie-Mega", "Diancie-Mega-Fantasy"],
		megaEvolves: ["Diancie", "Diancie-Fantasy"],
		itemUser: ["Diancie", "Diancie-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 764,
		gen: 6,
	},
	galladite: {
		name: "Galladite",
		spritenum: 616,
		megaStone: ["Gallade-Mega", "Gallade-Mega-Fantasy"],
		megaEvolves: ["Gallade", "Gallade-Fantasy"],
		itemUser: ["Gallade", "Gallade-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 756,
		gen: 6,
	},
	garchompite: {
		name: "Garchompite",
		spritenum: 573,
		megaStone: ["Garchomp-Mega", "Garchomp-Mega-Fantasy"],
		megaEvolves: ["Garchomp", "Garchomp-Fantasy"],
		itemUser: ["Garchomp", "Garchomp-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 683,
		gen: 6,
	},
	gardevoirite: {
		name: "Gardevoirite",
		spritenum: 587,
		megaStone: ["Gardevoir-Mega", "Gardevoir-Mega-Fantasy"],
		megaEvolves: ["Gardevoir", "Gardevoir-Fantasy"],
		itemUser: ["Gardevoir", "Gardevoir-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 657,
		gen: 6,
	},
	gengarite: {
		name: "Gengarite",
		spritenum: 588,
		megaStone: ["Gengar-Mega", "Gengar-Mega-Fantasy"],
		megaEvolves: ["Gengar", "Gengar-Fantasy"],
		itemUser: ["Gengar", "Gengar-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 656,
		gen: 6,
	},
	glalitite: {
		name: "Glalitite",
		spritenum: 623,
		megaStone: ["Glalie-Mega", "Glalie-Mega-Fantasy"],
		megaEvolves: ["Glalie", "Glalie-Fantasy"],
		itemUser: ["Glalie", "Glalie-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 763,
		gen: 6,
	},
	gyaradosite: {
		name: "Gyaradosite",
		spritenum: 589,
		megaStone: ["Gyarados-Mega", "Gyarados-Mega-Fantasy"],
		megaEvolves: ["Gyarados", "Gyarados-Fantasy"],
		itemUser: ["Gyarados", "Gyarados-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 676,
		gen: 6,
	},
	heracronite: {
		name: "Heracronite",
		spritenum: 590,
		megaStone: ["Heracross-Mega", "Heracross-Mega-Fantasy"],
		megaEvolves: ["Heracross", "Heracross-Fantasy"],
		itemUser: ["Heracross", "Heracross-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 680,
		gen: 6,
	},
	houndoominite: {
		name: "Houndoominite",
		spritenum: 591,
		megaStone: ["Houndoom-Mega", "Houndoom-Mega-Fantasy"],
		megaEvolves: ["Houndoom", "Houndoom-Fantasy"],
		itemUser: ["Houndoom", "Houndoom-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 666,
		gen: 6,
	},
	kangaskhanite: {
		name: "Kangaskhanite",
		spritenum: 592,
		megaStone: ["Kangaskhan-Mega", "Kangaskhan-Mega-Fantasy"],
		megaEvolves: ["Kangaskhan", "Kangaskhan-Fantasy"],
		itemUser: ["Kangaskhan", "Kangaskhan-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 675,
		gen: 6,
	},
	latiasite: {
		name: "Latiasite",
		spritenum: 629,
		megaStone: ["Latias-Mega", "Latias-Mega-Fantasy"],
		megaEvolves: ["Latias", "Latias-Fantasy"],
		itemUser: ["Latias", "Latias-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 684,
		gen: 6,
	},
	latiosite: {
		name: "Latiosite",
		spritenum: 630,
		megaStone: ["Latios-Mega", "Latios-Mega-Fantasy"],
		megaEvolves: ["Latios", "Latios-Fantasy"],
		itemUser: ["Latios", "Latios-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 685,
		gen: 6,
	},
	lopunnite: {
		name: "Lopunnite",
		spritenum: 626,
		megaStone: ["Lopunny-Mega", "Lopunny-Mega-Fantasy"],
		megaEvolves: ["Lopunny", "Lopunny-Fantasy"],
		itemUser: ["Lopunny", "Lopunny-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 768,
		gen: 6,
	},
	lucarionite: {
		name: "Lucarionite",
		spritenum: 594,
		megaStone: ["Lucario-Mega", "Lucario-Mega-Fantasy"],
		megaEvolves: ["Lucario", "Lucario-Fantasy"],
		itemUser: ["Lucario", "Lucario-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 673,
		gen: 6,
	},
	manectite: {
		name: "Manectite",
		spritenum: 596,
		megaStone: ["Manectric-Mega", "Manectric-Mega-Fantasy"],
		megaEvolves: ["Manectric", "Manectric-Fantasy"],
		itemUser: ["Manectric", "Manectric-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 682,
		gen: 6,
	},
	mawilite: {
		name: "Mawilite",
		spritenum: 598,
		megaStone: ["Mawile-Mega", "Mawile-Mega-Fantasy"],
		megaEvolves: ["Mawile", "Mawile-Fantasy"],
		itemUser: ["Mawile", "Mawile-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 681,
		gen: 6,
	},
	medichamite: {
		name: "Medichamite",
		spritenum: 599,
		megaStone: ["Medicham-Mega", "Medicham-Mega-Fantasy"],
		megaEvolves: ["Medicham", "Medicham-Fantasy"],
		itemUser: ["Medicham", "Medicham-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 665,
		gen: 6,
	},
	metagrossite: {
		name: "Metagrossite",
		spritenum: 618,
		megaStone: ["Metagross-Mega", "Metagross-Mega-Fantasy"],
		megaEvolves: ["Metagross", "Metagross-Fantasy"],
		itemUser: ["Metagross", "Metagross-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 758,
		gen: 6,
	},
	mewtwonitex: {
		name: "Mewtwonite X",
		spritenum: 600,
		megaStone: ["Mewtwo-Mega-X", "Mewtwo-Mega-X-Fantasy"],
		megaEvolves: ["Mewtwo", "Mewtwo-Fantasy"],
		itemUser: ["Mewtwo", "Mewtwo-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 662,
		gen: 6,
	},
	mewtwonitey: {
		name: "Mewtwonite Y",
		spritenum: 601,
		megaStone: ["Mewtwo-Mega-Y", "Mewtwo-Mega-Y-Fantasy"],
		megaEvolves: ["Mewtwo", "Mewtwo-Fantasy"],
		itemUser: ["Mewtwo", "Mewtwo-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 663,
		gen: 6,
	},
	pidgeotite: {
		name: "Pidgeotite",
		spritenum: 622,
		megaStone: ["Pidgeot-Mega", "Pidgeot-Mega-Fantasy"],
		megaEvolves: ["Pidgeot", "Pidgeot-Fantasy"],
		itemUser: ["Pidgeot", "Pidgeot-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 762,
		gen: 6,
	},
	pinsirite: {
		name: "Pinsirite",
		spritenum: 602,
		megaStone: ["Pinsir-Mega", "Pinsir-Mega-Fantasy"],
		megaEvolves: ["Pinsir", "Pinsir-Fantasy"],
		itemUser: ["Pinsir", "Pinsir-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 671,
		gen: 6,
	},
	sablenite: {
		name: "Sablenite",
		spritenum: 614,
		megaStone: ["Sableye-Mega", "Sableye-Mega-Fantasy"],
		megaEvolves: ["Sableye", "Sableye-Fantasy"],
		itemUser: ["Sableye", "Sableye-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 754,
		gen: 6,
	},
	salamencite: {
		name: "Salamencite",
		spritenum: 627,
		megaStone: ["Salamence-Mega", "Salamence-Mega-Fantasy"],
		megaEvolves: ["Salamence", "Salamence-Fantasy"],
		itemUser: ["Salamence", "Salamence-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 769,
		gen: 6,
	},
	sceptilite: {
		name: "Sceptilite",
		spritenum: 613,
		megaStone: ["Sceptile-Mega", "Sceptile-Mega-Fantasy"],
		megaEvolves: ["Sceptile", "Sceptile-Fantasy"],
		itemUser: ["Sceptile", "Sceptile-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 753,
		gen: 6,
	},
	scizorite: {
		name: "Scizorite",
		spritenum: 605,
		megaStone: ["Scizor-Mega", "Scizor-Mega-Fantasy"],
		megaEvolves: ["Scizor", "Scizor-Fantasy"],
		itemUser: ["Scizor", "Scizor-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 670,
		gen: 6,
	},
	sharpedonite: {
		name: "Sharpedonite",
		spritenum: 619,
		megaStone: ["Sharpedo-Mega", "Sharpedo-Mega-Fantasy"],
		megaEvolves: ["Sharpedo", "Sharpedo-Fantasy"],
		itemUser: ["Sharpedo", "Sharpedo-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 759,
		gen: 6,
	},
	slowbronite: {
		name: "Slowbronite",
		spritenum: 620,
		megaStone: ["Slowbro-Mega", "Slowbro-Mega-Fantasy"],
		megaEvolves: ["Slowbro", "Slowbro-Fantasy"],
		itemUser: ["Slowbro", "Slowbro-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 760,
		gen: 6,
	},
	steelixite: {
		name: "Steelixite",
		spritenum: 621,
		megaStone: ["Steelix-Mega", "Steelix-Mega-Fantasy"],
		megaEvolves: ["Steelix", "Steelix-Fantasy"],
		itemUser: ["Steelix", "Steelix-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 761,
		gen: 6,
	},
	swampertite: {
		name: "Swampertite",
		spritenum: 612,
		megaStone: ["Swampert-Mega", "Swampert-Mega-Fantasy"],
		megaEvolves: ["Swampert", "Swampert-Fantasy"],
		itemUser: ["Swampert", "Swampert-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 752,
		gen: 6,
	},
	tyranitarite: {
		name: "Tyranitarite",
		spritenum: 607,
		megaStone: ["Tyranitar-Mega", "Tyranitar-Mega-Fantasy"],
		megaEvolves: ["Tyranitar", "Tyranitar-Fantasy"],
		itemUser: ["Tyranitar", "Tyranitar-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 669,
		gen: 6,
	},
	venusaurite: {
		name: "Venusaurite",
		spritenum: 608,
		megaStone: ["Venusaur-Mega", "Venusaur-Mega-Fantasy"],
		megaEvolves: ["Venusaur", "Venusaur-Fantasy"],
		itemUser: ["Venusaur", "Venusaur-Fantasy"],
		onTakeItem(item, source) {
			if (
				(Array.isArray(item.megaEvolves)
					? item.megaEvolves
					: [item.megaEvolves]
				).includes(source.baseSpecies.baseSpecies)
			)
				return false;
			return true;
		},
		num: 659,
		gen: 6,
	},








	//以下为zamega石 num从9999开始
	gmegawishingstar: {
		name: "G-Mega Wishing Star",
		spritenum: 709,
		megaStone: [
			"Garbodor-Mega-Fantasy",
			"Corviknight-Mega-Fantasy",
			"Sandaconda-Mega-Fantasy",
			"Toxtricity-Mega-Fantasy",
			"Toxtricity-Low-Key-Mega-Fantasy",
			"Orbeetle-Mega-Fantasy",
			"Drednaw-Mega-Fantasy",
		],
		megaEvolves: [
			"Garbodor-Fantasy",
			"Corviknight-Fantasy",
			"Sandaconda-Fantasy",
			"Toxtricity-Fantasy",
			"Toxtricity-Low-Key-Fantasy",
			"Orbeetle-Fantasy",
			"Drednaw-Fantasy",
		],
		itemUser: [
			"Garbodor-Fantasy",
			"Corviknight-Fantasy",
			"Sandaconda-Fantasy",
			"Toxtricity-Fantasy",
			"Toxtricity-Low-Key-Fantasy",
			"Orbeetle-Fantasy",
			"Drednaw-Fantasy",
		],
		onTakeItem(item, source) {
			if (item.megaEvolves!.includes(source.baseSpecies.name)) return false;
			return true;
		},
		num: 9999,
		gen: 9,
		desc: "超巨进化许愿星。让超巨进化宝可梦携带后，在战斗时就能进行超级进化的一种神奇许愿星",
		shortDesc:
			"超巨进化许愿星。让可以超巨进化的宝可梦携带后,在战斗时就能进行超级进化",
	},
	victreebelite: {
		name: "Victreebelite",
		spritenum: 545,
		megaStone: ["Victreebel-Mega", "Victreebel-Mega-Fantasy"],
		megaEvolves: ["Victreebel", "Victreebel-Fantasy"],
		itemUser: ["Victreebel", "Victreebel-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10000,
		gen: 9,
		desc: "大食花进化石。让大食花携带后,在战斗时就能进行超级进化",
		shortDesc: "大食花进化石。让大食花携带后,在战斗时就能进行超级进化",
	},
	hawluchanite: {
		name: "Hawluchanite",
		spritenum: 566,
		megaStone: ["Hawlucha-Mega", "Hawlucha-Mega-Fantasy"],
		megaEvolves: ["Hawlucha", "Hawlucha-Fantasy"],
		itemUser: ["Hawlucha", "Hawlucha-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10001,
		gen: 9,
		desc: "摔角鹰人进化石。让摔角鹰人携带后,在战斗时就能进行超级进化",
		shortDesc: "摔角鹰人进化石。让摔角鹰人携带后,在战斗时就能进行超级进化",
	},
	chandelurite: {
		name: "Chandelurite",
		spritenum: 557,
		megaStone: ["Chandelure-Mega", "Chandelure-Mega-Fantasy"],
		megaEvolves: ["Chandelure", "Chandelure-Fantasy"],
		itemUser: ["Chandelure", "Chandelure-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10002,
		gen: 9,
		desc: "水晶灯火灵进化石。让水晶灯火灵携带后,在战斗时就能进行超级进化",
		shortDesc:
			"水晶灯火灵进化石。让水晶灯火灵携带后,在战斗时就能进行超级进化",
	},
	froslassite: {
		name: "Froslassite",
		spritenum: 551,
		megaStone: ["Froslass-Mega", "Froslass-Mega-Fantasy"],
		megaEvolves: ["Froslass", "Froslass-Fantasy"],
		itemUser: ["Froslass", "Froslass-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10003,
		gen: 9,
		desc: "雪妖女进化石。让雪妖女携带后,在战斗时就能进行超级进化",
		shortDesc: "雪妖女进化石。让雪妖女携带后,在战斗时就能进行超级进化",
	},
	delphoxite: {
		name: "Delphoxite",
		spritenum: 559,
		megaStone: ["Delphox-Mega", "Delphox-Mega-Fantasy"],
		megaEvolves: ["Delphox", "Delphox-Fantasy"],
		itemUser: ["Delphox", "Delphox-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10004,
		gen: 9,
		desc: "妖火红狐进化石。让妖火红狐携带后,在战斗时就能进行超级进化",
		shortDesc: "妖火红狐进化石。让妖火红狐携带后,在战斗时就能进行超级进化",
	},
	dragalgite: {
		name: "Dragalgite",
		spritenum: 565,
		megaStone: ["Dragalge-Mega", "Dragalge-Mega-Fantasy"],
		megaEvolves: ["Dragalge", "Dragalge-Fantasy"],
		itemUser: ["Dragalge", "Dragalge-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10005,
		gen: 9,
		desc: "毒藻龙进化石。让毒藻龙携带后,在战斗时就能进行超级进化",
		shortDesc: "毒藻龙进化石。让毒藻龙携带后,在战斗时就能进行超级进化",
	},
	excadrite: {
		name: "Excadrite",
		spritenum: 553,
		megaStone: ["Excadrill-Mega", "Excadrill-Mega-Fantasy"],
		megaEvolves: ["Excadrill", "Excadrill-Fantasy"],
		itemUser: ["Excadrill", "Excadrill-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10006,
		gen: 9,
		desc: "龙头地鼠进化石。让龙头地鼠携带后,在战斗时就能进行超级进化",
		shortDesc: "龙头地鼠进化石。让龙头地鼠携带后,在战斗时就能进行超级进化",
	},
	meganiumite: {
		name: "Meganiumite",
		spritenum: 548,
		megaStone: ["Meganium-Mega", "Meganium-Mega-Fantasy"],
		megaEvolves: ["Meganium", "Meganium-Fantasy"],
		itemUser: ["Meganium", "Meganium-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10007,
		gen: 9,
		desc: "大竺葵进化石。让大竺葵携带后,在战斗时就能进行超级进化",
		shortDesc: "大竺葵进化石。让大竺葵携带后,在战斗时就能进行超级进化",
	},
	greninjite: {
		name: "Greninjite",
		spritenum: 560,
		megaStone: ["Greninja-Mega", "Greninja-Mega-Fantasy"],
		megaEvolves: ["Greninja", "Greninja-Fantasy", "Greninja-Bond", "Greninja-Bond-Fantasy"],
		itemUser: ["Greninja", "Greninja-Fantasy", "Greninja-Bond", "Greninja-Bond-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10008,
		gen: 9,
		desc: "甲贺忍蛙进化石。让甲贺忍蛙携带后,在战斗时就能进行超级进化",
		shortDesc: "甲贺忍蛙进化石。让甲贺忍蛙携带后,在战斗时就能进行超级进化",
	},
	starminite: {
		name: "Starminite",
		spritenum: 546,
		megaStone: ["Starmie-Mega", "Starmie-Mega-Fantasy"],
		megaEvolves: ["Starmie", "Starmie-Fantasy"],
		itemUser: ["Starmie", "Starmie-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10009,
		gen: 9,
		desc: "宝石海星进化石。让宝石海星携带后,在战斗时就能进行超级进化",
		shortDesc: "宝石海星进化石。让宝石海星携带后,在战斗时就能进行超级进化",
	},
	barbaracite: {
		name: "Barbaracite",
		spritenum: 564,
		megaStone: ["Barbaracle-Mega", "Barbaracle-Mega-Fantasy"],
		megaEvolves: ["Barbaracle", "Barbaracle-Fantasy"],
		itemUser: ["Barbaracle", "Barbaracle-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10010,
		gen: 9,
		desc: "龟足巨铠进化石。让龟足巨铠携带后,在战斗时就能进行超级进化",
		shortDesc: "龟足巨铠进化石。让龟足巨铠携带后,在战斗时就能进行超级进化",
	},
	dragoninite: {
		name: "Dragoninite",
		spritenum: 547,
		megaStone: "Dragonite-Mega",
		megaEvolves: "Dragonite",
		itemUser: ["Dragonite"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10011,
		gen: 9,
		desc: "快龙进化石。让快龙携带后,在战斗时就能进行超级进化",
		shortDesc: "快龙进化石。让快龙携带后,在战斗时就能进行超级进化",
	},
	chesnaughtite: {
		name: "Chesnaughtite",
		spritenum: 558,
		megaStone: ["Chesnaught-Mega", "Chesnaught-Mega-Fantasy"],
		megaEvolves: ["Chesnaught", "Chesnaught-Fantasy"],
		itemUser: ["Chesnaught", "Chesnaught-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10012,
		gen: 9,
		desc: "布里卡隆进化石。让布里卡隆携带后,在战斗时就能进行超级进化",
		shortDesc: "布里卡隆进化石。让布里卡隆携带后,在战斗时就能进行超级进化",
	},
	drampanite: {
		name: "Drampanite",
		spritenum: 569,
		megaStone: ["Drampa-Mega", "Drampa-Mega-Fantasy"],
		megaEvolves: ["Drampa", "Drampa-Fantasy"],
		itemUser: ["Drampa", "Drampa-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10013,
		gen: 9,
		desc: "老翁龙进化石。让老翁龙携带后,在战斗时就能进行超级进化",
		shortDesc: "老翁龙进化石。让老翁龙携带后,在战斗时就能进行超级进化",
	},
	falinksite: {
		name: "Falinksite",
		spritenum: 570,
		megaStone: ["Falinks-Mega", "Falinks-Mega-Fantasy"],
		megaEvolves: ["Falinks", "Falinks-Fantasy"],
		itemUser: ["Falinks", "Falinks-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10014,
		gen: 9,
		desc: "列阵兵进化石。让列阵兵携带后,在战斗时就能进行超级进化",
		shortDesc: "列阵兵进化石。让列阵兵携带后,在战斗时就能进行超级进化",
	},
	floettite: {
		name: "Floettite",
		spritenum: 562,
		megaStone: ["Floette-Mega", "Floette-Mega-Fantasy"],
		megaEvolves: ["Floette-Eternal", "Floette-Eternal-Fantasy"],
		itemUser: ["Floette-Eternal", "Floette-Eternal-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves!.includes(source.baseSpecies.name)) return false;
			return true;
		},
		num: 10015,
		gen: 9,
		desc: "花叶蒂-永恒之花进化石。让花叶蒂-永恒之花携带后,在战斗时就能进行超级进化",
		shortDesc:
			"花叶蒂-永恒之花进化石。让花叶蒂-永恒之花携带后,在战斗时就能进行超级进化",
	},
	skarmorite: {
		name: "Skarmorite",
		spritenum: 550,
		megaStone: ["Skarmory-Mega", "Skarmory-Mega-Fantasy"],
		megaEvolves: ["Skarmory", "Skarmory-Fantasy"],
		itemUser: ["Skarmory", "Skarmory-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10016,
		gen: 9,
		desc: "盔甲鸟进化石。让盔甲鸟携带后,在战斗时就能进行超级进化",
		shortDesc: "盔甲鸟进化石。让盔甲鸟携带后,在战斗时就能进行超级进化",
	},
	clefablite: {
		name: "Clefablite",
		spritenum: 544,
		megaStone: ["Clefable-Mega", "Clefable-Mega-Fantasy"],
		megaEvolves: ["Clefable", "Clefable-Fantasy"],
		itemUser: ["Clefable", "Clefable-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10017,
		gen: 9,
		desc: "皮可西进化石。让皮可西携带后,在战斗时就能进行超级进化",
		shortDesc: "皮可西进化石。让皮可西携带后,在战斗时就能进行超级进化",
	},
	scraftinite: {
		name: "Scraftinite",
		spritenum: 555,
		megaStone: ["Scrafty-Mega", "Scrafty-Mega-Fantasy"],
		megaEvolves: ["Scrafty", "Scrafty-Fantasy"],
		itemUser: ["Scrafty", "Scrafty-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10018,
		gen: 9,
		desc: "头巾混混进化石。让头巾混混携带后,在战斗时就能进行超级进化",
		shortDesc: "头巾混混进化石。让头巾混混携带后,在战斗时就能进行超级进化",
	},
	eelektrossite: {
		name: "Eelektrossite",
		spritenum: 556,
		megaStone: ["Eelektross-Mega", "Eelektross-Mega-Fantasy"],
		megaEvolves: ["Eelektross", "Eelektross-Fantasy"],
		itemUser: ["Eelektross", "Eelektross-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10019,
		gen: 9,
		desc: "麻麻鳗鱼王进化石。让麻麻鳗鱼王携带后,在战斗时就能进行超级进化",
		shortDesc:
			"麻麻鳗鱼王进化石。让麻麻鳗鱼王携带后,在战斗时就能进行超级进化",
	},
	emboarite: {
		name: "Emboarite",
		spritenum: 552,
		megaStone: ["Emboar-Mega", "Emboar-Mega-Fantasy"],
		megaEvolves: ["Emboar", "Emboar-Fantasy"],
		itemUser: ["Emboar", "Emboar-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10020,
		gen: 9,
		desc: "炎武王进化石。让炎武王携带后,在战斗时就能进行超级进化",
		shortDesc: "炎武王进化石。让炎武王携带后,在战斗时就能进行超级进化",
	},
	feraligite: {
		name: "Feraligite",
		spritenum: 549,
		megaStone: ["Feraligatr-Mega", "Feraligatr-Mega-Fantasy"],
		megaEvolves: ["Feraligatr", "Feraligatr-Fantasy"],
		itemUser: ["Feraligatr", "Feraligatr-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10021,
		gen: 9,
		desc: "大力鳄进化石。让大力鳄携带后,在战斗时就能进行超级进化",
		shortDesc: "大力鳄进化石。让大力鳄携带后,在战斗时就能进行超级进化",
	},
	malamarite: {
		name: "Malamarite",
		spritenum: 563,
		megaStone: ["Malamar-Mega", "Malamar-Mega-Fantasy"],
		megaEvolves: ["Malamar", "Malamar-Fantasy"],
		itemUser: ["Malamar", "Malamar-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10022,
		gen: 9,
		desc: "乌贼王进化石。让乌贼王携带后,在战斗时就能进行超级进化",
		shortDesc: "乌贼王进化石。让乌贼王携带后,在战斗时就能进行超级进化",
	},
	pyroarite: {
		name: "Pyroarite",
		spritenum: 561,
		megaStone: ["Pyroar-Mega", "Pyroar-Mega-Fantasy"],
		megaEvolves: ["Pyroar", "Pyroar-Fantasy"],
		itemUser: ["Pyroar", "Pyroar-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10023,
		gen: 9,
		desc: "火炎狮进化石。让火炎狮携带后,在战斗时就能进行超级进化",
		shortDesc: "火炎狮进化石。让火炎狮携带后,在战斗时就能进行超级进化",
	},
	scolipite: {
		name: "Scolipite",
		spritenum: 554,
		megaStone: ["Scolipede-Mega", "Scolipede-Mega-Fantasy"],
		megaEvolves: ["Scolipede", "Scolipede-Fantasy"],
		itemUser: ["Scolipede", "Scolipede-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10024,
		gen: 9,
		desc: "蜈蚣王进化石。让蜈蚣王携带后,在战斗时就能进行超级进化",
		shortDesc: "蜈蚣王进化石。让蜈蚣王携带后,在战斗时就能进行超级进化",
	},
	absolitez: {
		name: "Absolite Z",
		spritenum: 576,
		megaStone: ["Absol-Mega-Z", "Absol-Mega-Z-Fantasy"],
		megaEvolves: ["Absol", "Absol-Fantasy"],
		itemUser: ["Absol", "Absol-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10025,
		gen: 9,
		desc: "阿勃梭鲁进化石Z。让阿勃梭鲁携带后,在战斗时就能进行超级进化",
		shortDesc: "阿勃梭鲁进化石Z。让阿勃梭鲁携带后,在战斗时就能进行超级进化",
	},
	baxcalibrite: {
		name: "Baxcalibrite",
		spritenum: 0,
		megaStone: ["Baxcalibur-Mega", "Baxcalibur-Mega-Fantasy"],
		megaEvolves: ["Baxcalibur", "Baxcalibur-Fantasy"],
		itemUser: ["Baxcalibur", "Baxcalibur-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10026,
		gen: 9,
		desc: "戟脊龙进化石。让戟脊龙携带后,在战斗时就能进行超级进化",
		shortDesc: "戟脊龙进化石。让戟脊龙携带后,在战斗时就能进行超级进化",
	},
	chimechite: {
		name: "Chimechite",
		spritenum: 0,
		megaStone: ["Chimecho-Mega", "Chimecho-Mega-Fantasy"],
		megaEvolves: ["Chimecho", "Chimecho-Fantasy"],
		itemUser: ["Chimecho", "Chimecho-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10027,
		gen: 9,
		desc: "风铃铃进化石。让风铃铃携带后,在战斗时就能进行超级进化",
		shortDesc: "风铃铃进化石。让风铃铃携带后,在战斗时就能进行超级进化",
	},
	crabominite: {
		name: "Crabominite",
		spritenum: 0,
		megaStone: ["Crabominable-Mega", "Crabominable-Mega-Fantasy"],
		megaEvolves: ["Crabominable", "Crabominable-Fantasy"],
		itemUser: ["Crabominable", "Crabominable-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10028,
		gen: 9,
		desc: "好胜毛蟹进化石。让好胜毛蟹携带后,在战斗时就能进行超级进化",
		shortDesc: "好胜毛蟹进化石。让好胜毛蟹携带后,在战斗时就能进行超级进化",
	},
	darkranite: {
		name: "Darkranite",
		spritenum: 0,
		megaStone: ["Darkrai-Mega", "Darkrai-Mega-Fantasy"],
		megaEvolves: ["Darkrai", "Darkrai-Fantasy"],
		itemUser: ["Darkrai", "Darkrai-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10029,
		gen: 9,
		desc: "达克莱伊进化石。让达克莱伊携带后,在战斗时就能进行超级进化",
		shortDesc: "达克莱伊进化石。让达克莱伊携带后,在战斗时就能进行超级进化",
	},
	garchompitez: {
		name: "Garchompite Z",
		spritenum: 573,
		megaStone: ["Garchomp-Mega-Z", "Garchomp-Mega-Z-Fantasy"],
		megaEvolves: ["Garchomp", "Garchomp-Fantasy"],
		itemUser: ["Garchomp", "Garchomp-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10030,
		gen: 9,
		desc: "烈咬陆鲨进化石Z。让烈咬陆鲨携带后,在战斗时就能进行超级进化",
		shortDesc: "烈咬陆鲨进化石Z。让烈咬陆鲨携带后,在战斗时就能进行超级进化",
	},
	glimmoranite: {
		name: "Glimmoranite",
		spritenum: 0,
		megaStone: ["Glimmora-Mega", "Glimmora-Mega-Fantasy"],
		megaEvolves: ["Glimmora", "Glimmora-Fantasy"],
		itemUser: ["Glimmora", "Glimmora-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10031,
		gen: 9,
		desc: "晶光花进化石。让晶光花携带后,在战斗时就能进行超级进化",
		shortDesc: "晶光花进化石。让晶光花携带后,在战斗时就能进行超级进化",
	},
	golisopite: {
		name: "Golisopite",
		spritenum: 0,
		megaStone: ["Golisopod-Mega", "Golisopod-Mega-Fantasy"],
		megaEvolves: ["Golisopod", "Golisopod-Fantasy"],
		itemUser: ["Golisopod", "Golisopod-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10032,
		gen: 9,
		desc: "具甲武者进化石。让具甲武者携带后,在战斗时就能进行超级进化",
		shortDesc: "具甲武者进化石。让具甲武者携带后,在战斗时就能进行超级进化",
	},
	golurkite: {
		name: "Golurkite",
		spritenum: 0,
		megaStone: ["Golurk-Mega", "Golurk-Mega-Fantasy"],
		megaEvolves: ["Golurk", "Golurk-Fantasy"],
		itemUser: ["Golurk", "Golurk-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10033,
		gen: 9,
		desc: "泥偶巨人进化石。让泥偶巨人携带后,在战斗时就能进行超级进化",
		shortDesc: "泥偶巨人进化石。让泥偶巨人携带后,在战斗时就能进行超级进化",
	},
	heatranite: {
		name: "Heatranite",
		spritenum: 0,
		megaStone: ["Heatran-Mega", "Heatran-Mega-Fantasy"],
		megaEvolves: ["Heatran", "Heatran-Fantasy"],
		itemUser: ["Heatran", "Heatran-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10034,
		gen: 9,
		desc: "席多蓝恩进化石。让席多蓝恩携带后,在战斗时就能进行超级进化",
		shortDesc: "席多蓝恩进化石。让席多蓝恩携带后,在战斗时就能进行超级进化",
	},
	lucarionitez: {
		name: "Lucarionite Z",
		spritenum: 594,
		megaStone: ["Lucario-Mega", "Lucario-Mega-Fantasy"],
		megaEvolves: ["Lucario", "Lucario-Fantasy"],
		itemUser: ["Lucario", "Lucario-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10035,
		gen: 9,
		desc: "路卡利欧进化石Z。让路卡利欧携带后,在战斗时就能进行超级进化",
		shortDesc: "路卡利欧进化石Z。让路卡利欧携带后,在战斗时就能进行超级进化",
	},
	magearnite: {
		name: "Magearnite",
		spritenum: 0,
		megaStone: ["Magearna-Mega", "Magearna-Mega-Fantasy", "Magearna-Original-Mega", "Magearna-Original-Mega-Fantasy"],
		megaEvolves: ["Magearna", "Magearna-Fantasy", "Magearna-Original", "Magearna-Original-Fantasy"],
		itemUser: ["Magearna", "Magearna-Fantasy", "Magearna-Original", "Magearna-Original-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves!.includes(source.baseSpecies.name)) return false;
			return true;
		},
		num: 10036,
		gen: 9,
		desc: "玛机雅娜进化石。让玛机雅娜携带后,在战斗时就能进行超级进化",
		shortDesc: "玛机雅娜进化石。让玛机雅娜携带后,在战斗时就能进行超级进化",
	},
	meowsticite: {
		name: "Meowsticite",
		spritenum: 0,
		megaStone: ["Meowstic-M-Mega", "Meowstic-M-Mega-Fantasy", "Meowstic-F-Mega", "Meowstic-F-Mega-Fantasy"],
		megaEvolves: ["Meowstic", "Meowstic-Fantasy", "Meowstic-F", "Meowstic-F-Fantasy"],
		itemUser: ["Meowstic", "Meowstic-Fantasy", "Meowstic-F", "Meowstic-F-Fantasy"],
		onTakeItem(item, source) {
			if (source.baseSpecies.num === 678) return false;
			return true;
		},
		num: 10037,
		gen: 9,
		desc: "超能妙喵进化石。让超能妙喵携带后,在战斗时就能进行超级进化",
		shortDesc: "超能妙喵进化石。让超能妙喵携带后,在战斗时就能进行超级进化",
	},
	raichunitex: {
		name: "Raichunite X",
		spritenum: 0,
		megaStone: ["Raichu-Mega-X", "Raichu-Mega-X-Fantasy"],
		megaEvolves: ["Raichu", "Raichu-Fantasy"],
		itemUser: ["Raichu", "Raichu-Fantasy"],
		onTakeItem(item, source) {
			if (
				item.megaEvolves === source.baseSpecies.name ||
				item.megaStone === source.baseSpecies.name
			)
				return false;
			return true;
		},
		num: 10038,
		gen: 9,
		desc: "雷丘X进化石。让雷丘携带后,在战斗时就能进行超级进化",
		shortDesc: "雷丘X进化石。让雷丘携带后,在战斗时就能进行超级进化",
	},
	raichunitey: {
		name: "Raichunite Y",
		spritenum: 0,
		megaStone: ["Raichu-Mega-Y", "Raichu-Mega-Y-Fantasy"],
		megaEvolves: ["Raichu", "Raichu-Fantasy"],
		itemUser: ["Raichu", "Raichu-Fantasy"],
		onTakeItem(item, source) {
			if (
				item.megaEvolves === source.baseSpecies.name ||
				item.megaStone === source.baseSpecies.name
			)
				return false;
			return true;
		},
		num: 10039,
		gen: 9,
		desc: "雷丘Y进化石。让雷丘携带后,在战斗时就能进行超级进化",
		shortDesc: "雷丘Y进化石。让雷丘携带后,在战斗时就能进行超级进化",
	},
	scovillainite: {
		name: "Scovillainite",
		spritenum: 0,
		megaStone: ["Scovillain-Mega", "Scovillain-Mega-Fantasy"],
		megaEvolves: ["Scovillain", "Scovillain-Fantasy"],
		itemUser: ["Scovillain", "Scovillain-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10040,
		gen: 9,
		desc: "狠辣椒进化石。让狠辣椒携带后,在战斗时就能进行超级进化",
		shortDesc: "狠辣椒进化石。让狠辣椒携带后,在战斗时就能进行超级进化",
	},
	staraptite: {
		name: "Staraptite",
		spritenum: 0,
		megaStone: ["Staraptor-Mega", "Staraptor-Mega-Fantasy"],
		megaEvolves: ["Staraptor", "Staraptor-Fantasy"],
		itemUser: ["Staraptor", "Staraptor-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10041,
		gen: 9,
		desc: "姆克鹰进化石。让姆克鹰携带后,在战斗时就能进行超级进化",
		shortDesc: "姆克鹰进化石。让姆克鹰携带后,在战斗时就能进行超级进化",
	},
	tatsugirinite: {
		name: "Tatsugirinite",
		spritenum: 0,
		megaStone: [
			"Tatsugiri-Curly-Mega",
			"Tatsugiri-Droopy-Mega",
			"Tatsugiri-Stretchy-Mega",
		],
		megaEvolves: ["Tatsugiri", "Tatsugiri-Droopy", "Tatsugiri-Stretchy"],
		itemUser: ["Tatsugiri", "Tatsugiri-Droopy", "Tatsugiri-Stretchy"],
		onTakeItem(item, source) {
			if (item.megaEvolves!.includes(source.baseSpecies.name)) return false;
			return true;
		},
		num: 10042,
		gen: 9,
		desc: "米立龙进化石。让米立龙携带后,在战斗时就能进行超级进化",
		shortDesc: "米立龙进化石。让米立龙携带后,在战斗时就能进行超级进化",
	},
	zeraorite: {
		name: "Zeraorite",
		spritenum: 0,
		megaStone: ["Zeraora-Mega", "Zeraora-Mega-Fantasy"],
		megaEvolves: ["Zeraora", "Zeraora-Fantasy"],
		itemUser: ["Zeraora", "Zeraora-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10043,
		gen: 9,
		desc: "捷拉奥拉进化石。让捷拉奥拉携带后,在战斗时就能进行超级进化",
		shortDesc: "捷拉奥拉进化石。让捷拉奥拉携带后,在战斗时就能进行超级进化",
	},
	flygonite: {
		name: "Flygonite",
		spritenum: 568,
		megaStone: "Flygon-Mega-Fantasy",
		megaEvolves: "Flygon-Fantasy",
		itemUser: ["Flygon-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves!.includes(source.baseSpecies.name)) return false;
			return true;
		},
		num: 10044,
		gen: 9,
		desc: "沙漠蜻蜓-幻想进化石。让沙漠蜻蜓-幻想携带后,在战斗时就能进行超级进化",
		shortDesc: "沙漠蜻蜓-幻想进化石。让沙漠蜻蜓-幻想携带后,在战斗时就能进行超级进化",
	},
	//以下为Z num从20000开始
	toxtricityz: {
		name: "Toxtricity Z",
		spritenum: 686,
		onTakeItem: false, // Z纯晶不能被移除
		zMove: "Chaopinyaogunpoyinbo",
		zMoveFrom: "Overdrive",
		itemUser: ["Toxtricity-Fantasy", "Toxtricity-Low-Key-Fantasy"], // 再次确认形态名称
		num: 20000,
		gen: 9,
		desc: "颤弦蝾螈Z。颤弦蝾螈携带后,可以把破音转化成特殊的Ｚ招式: 超频摇滚破音波",
		shortDesc:
			"颤弦蝾螈Z。颤弦蝾螈携带后,可以把破音转化成特殊的Ｚ招式: 超频摇滚破音波",
	},
	greninjaashz: {
		name: "Greninja-Ash Z",
		spritenum: 633,
		onTakeItem: false, // Z纯晶不能被移除
		zMove: "Huangjinjibanshoulijian",
		zMoveFrom: "Water Shuriken",
		itemUser: ["Greninja-Bond-Fantasy", "Greninja-Ash-Fantasy"], // 再次确认形态名称
		num: 20002,
		gen: 9,
		desc: "智忍蛙Z。甲贺忍蛙-牵绊携带后,可以把飞水手里剑转化成特殊的Ｚ招式：黄金羁绊手里剑",
		shortDesc:
			"智忍蛙Z。甲贺忍蛙-牵绊携带后,可以把飞水手里剑转化成特殊的Ｚ招式：黄金羁绊手里剑",
	},
	//以下为Z和mega石以外的自制道具 num从30000开始
	fantasypowerlens: {
		name: "Fantasy Power Lens",
		spritenum: 359,
		fling: {
			basePower: 100,
		},
		// 效果1：禁用暴击。
		onModifyMove(move) {
			move.willCrit = false;
		},
		// 效果2：提升命中率。
		onSourceModifyAccuracy(accuracy, source, target, move) {
			// 首先，检查是不是变化类招式。如果是，则道具不生效。
			if (move.category === "Status") return;

			// 然后，再检查招式命中率的类型
			if (typeof move.accuracy !== "number") return;

			// 在这里进行完整的条件判断
			const isHustleAffected =
				source.hasAbility("hustle") && move.category === "Physical";
			if (
				move.accuracy < 100 ||
				(move.accuracy === 100 && isHustleAffected)
			) {
				this.debug("Fantasy Power Lens boosting accuracy");
				return this.chainModify([4915, 4096]); // 1.2倍
			}
		},
		// 效果3：提升威力。
		onBasePower(basePower, source, target, move) {
			// 变化类招式没有威力，直接返回。
			if (move.category === "Status") return;

			// 检查招式的原始命中率是否为数字。
			if (typeof move.accuracy !== "number") return;

			// 在这里重复一次完整的条件判断
			const isHustleAffected =
				source.hasAbility("hustle") && move.category === "Physical";
			if (
				move.accuracy < 100 ||
				(move.accuracy === 100 && isHustleAffected)
			) {
				this.debug("Fantasy Power Lens boosting power");
				return this.chainModify([4915, 4096]); // 1.2倍
			}
		},
		num: 30000,
		gen: 9,
		desc: "幻之力量镜。携带后,虽然攻击将无法击中要害,但命中不满100%的非变化类技能命中率与威力会提升1.2倍",
		shortDesc:
			"幻之力量镜。攻击无法击中要害,命中不满100%的非变化技能威力与命中率提升1.2倍",
	},
	fantasyringtarget: {
		name: "Fantasy Ring Target",
		spritenum: 410,
		fling: { basePower: 30 },
		onStart(pokemon) {
			// 新增：在宝可梦登场时显示提示信息，暴露道具
			this.add("-message", `${pokemon.name}的幻之标靶正在锁定目标!`);
			this.add("-item", pokemon, "Fantasy Ring Target");
		},
		onDisableMove(pokemon) {
			for (const moveSlot of pokemon.moveSlots) {
				const move = this.dex.moves.get(moveSlot.id);
				if (move.category === "Status") {
					// 禁用这个招式
					pokemon.disableMove(moveSlot.id);
				}
			}
		},
		onModifyMove(move, pokemon) {
			if (move.category !== "Status") {
				move.ignoreImmunity = true;
			}
		},
		num: 30001,
		gen: 9,
		desc: "幻之标靶。携带后,登场会暴露道具,虽然无法使用变化招式,但使用的原本属性相性没有效果的招式会变为有效果",
		shortDesc:
			"幻之标靶。登场时暴露道具,使用的招式无视属性免疫,但无法使用变化招式",
	},
	fantasylifeorb: {
		name: "Fantasy Life Orb",
		spritenum: 249, // 暂用 Life Orb 图标
		fling: {
			basePower: 30,
		},
		onSourceModifyDamage(damage, source, target, move) {
			// 检查道具持有者(target)是否存在主要异常状态
			if (target.status) {
				this.debug("幻之生命宝珠:因异常状态,获得伤害减免30%。");
				// 使用 chainModify 来应用乘算修饰。4096 * 0.7 = 2867
				return this.chainModify(2867 / 4096);
			}
		},
		onResidual(pokemon) {
			if (
				pokemon.status &&
				["brn", "par", "slp", "frz", "fst", "psn", "tox"].includes(
					pokemon.status
				)
			) {
				this.damage(
					pokemon.baseMaxhp / 10,
					pokemon,
					pokemon,
					this.dex.items.get("fantasylifeorb")
				);
			}
		},
		//不受异常状态效果影响的效果分别写在各个异常状态里了
		num: 30002,
		gen: 9,
		desc: "幻之生命宝珠。携带后, 不受异常状态效果影响,处于异常状态下的宝可梦,受到的伤害降低30%,但回合结束时将损失最大HP的1/10",
		shortDesc:
			"幻之生命宝珠。异常状态效果无效,异常状态下伤害减免30%,每回合损血1/10",
	},
	fantasysachet: {
		name: "Fantasy Sachet",
		spritenum: 691,
		fling: {
			basePower: 10,
			volatileStatus: "fantasysachetfling",
		} as any,
		onTryBoost(
			boost: { [key: string]: number },
			target: Pokemon,
			source: Pokemon | null,
			effect: Effect | null
		) {
			let hasBoost = false;
			for (const i in boost) {
				if (boost[i] > 0) {
					hasBoost = true;
					delete boost[i];
				}
			}
			if (hasBoost) {
				this.add("-fail", target, "boost", "[from] item: Fantasy Sachet");
			}
		},

		// 效果 1：使用者主动攻击对方时
		onModifyMove(move, pokemon) {
			if (!move.flags["contact"] || !pokemon.hasItem("fantasysachet"))
				return;

			move.onAfterMoveSecondary = (target, source) => {
				if (
					!source ||
					!target ||
					target.isAlly(source) ||
					target === source
				)
					return;

				// 检查：如果在此之前道具已经因为某些特殊反馈效果（如对方的特性“顺手牵羊”）丢失，则不触发
				if (!source.hasItem("fantasysachet")) return;

				if (source.useItem()) {
					this.add("-activate", source, "item: Fantasy Sachet");

					const affected = target;
					// 建立一个权威的、不可更改特性的“黑名单”
					const unchangeableAbilities = [
						// 官方永久特性
						"asone",
						"battlebond",
						"comatose",
						"commander",
						"disguise",
						"gulpmissile",
						"hadronengine",
						"iceface",
						"multitype",
						"orichalcumpulse",
						"powerconstruct",
						"protosynthesis",
						"quarkdrive",
						"rkssystem",
						"schooling",
						"shieldsdown",
						"stancechange",
						"terashift",
						"zenmode",
						"zerotohero",
						// 效果相关特性
						"lingeringaroma",
						"mummy",
						// 你的自定义永久特性
						"woju",
					];

					if (unchangeableAbilities.includes(affected.ability)) {
						// 如果对方的特性在此名单中，则判定失败
						this.add("-fail", source);
					} else if (affected.hasItem("abilityshield")) {
						// 对特性护具的检查保持不变
						this.add("-block", affected, "item: Ability Shield");
					} else {
						// 成功改变特性
						affected.baseAbility = "lingeringaroma" as ID;
						affected.setAbility("lingeringaroma");
						this.add(
							"-ability",
							affected,
							"Lingering Aroma",
							"[from] item: Fantasy Sachet",
							"[of] " + source
						);
					}
				}
			};
		},

		// 效果 2：受击触发 (包含针对夺取类招式的避让逻辑)
		onDamagingHit(damage, target, source, move) {
			// 1. 必须是接触类招式
			if (!move.flags["contact"]) return;
			if (!source || source.isAlly(target) || source === target) return;

			// 2. 核心避让逻辑：预判断招式是否会成功移除道具
			// 针对 拍落 (Knock Off) 或 你的自制技能 咬烂 (Yao Lan)
			if (move.id === "knockoff" || move.id === "yaolan") {
				// 如果持有者没有“黏着”特性，则该招式会成功移除道具，香袋此时不应触发
				if (!target.hasAbility("stickyhold")) return;
			}

			// 针对 小偷 (Thief) 或 渴望 (Covet)
			if (move.id === "thief" || move.id === "covet") {
				// 小偷只有在使用者没有道具时才会偷取成功。
				// 如果偷取会成功，香袋不触发。
				if (source && !source.item) return;
			}

			// 3. 正常触发流程
			if (target.useItem()) {
				this.add("-activate", target, "item: Fantasy Sachet");
				const affected = source;
				// 同样在这里使用权威的“黑名单”
				const unchangeableAbilities = [
					// 官方永久特性
					"asone",
					"battlebond",
					"comatose",
					"commander",
					"disguise",
					"gulpmissile",
					"hadronengine",
					"iceface",
					"multitype",
					"orichalcumpulse",
					"powerconstruct",
					"protosynthesis",
					"quarkdrive",
					"rkssystem",
					"schooling",
					"shieldsdown",
					"stancechange",
					"terashift",
					"zenmode",
					"zerotohero",
					// 效果相关特性
					"lingeringaroma",
					"mummy",
					// 你的自定义永久特性
					"woju",
				];

				if (unchangeableAbilities.includes(affected.ability)) {
					this.add("-fail", target);
				} else if (affected.hasItem("abilityshield")) {
					this.add("-block", affected, "item: Ability Shield");
				} else {
					affected.baseAbility = "lingeringaroma" as ID;
					affected.setAbility("lingeringaroma");
					this.add(
						"-ability",
						affected,
						"Lingering Aroma",
						"[from] item: Fantasy Sachet",
						"[of] " + target
					);
				}
			}
		},
		num: 30003,
		gen: 9,
		desc: "幻之香袋。携带道具后将无法提升能力,当接触对方或被对方接触时,将对方的特性更改为甩不掉的气味,生效一次后消失",
		shortDesc:
			"幻之香袋。无法提升能力,当双方接触时,将对手的特性变为甩不掉的气味",
	},
	fantasyscopelens: {
		name: "Fantasy Scope Lens",
		spritenum: 429,
		fling: {
			basePower: 10,
		},
		// 新增效果：无视反射壁/光墙/极光幕
		onSourceModifyDamage(damage, source, target, move) {
			// 1. 检查是否为射击或球弹类招式
			if (move.flags["shooting"] || move.flags["bullet"]) {
				// 2. 检查是否已经通过其他方式无视了墙（击中要害 或 穿透特性）
				// 如果是击中要害，系统已经忽略了墙，不需要道具补偿
				if (target.getMoveHitData(move).crit) return;
				// 如果有穿透特性，系统已经忽略了墙，不需要道具补偿
				if (source.hasAbility("infiltrator")) return;

				// 3. 检查是否存在对应的墙
				const side = target.side;
				const reflect = side.getSideCondition("reflect");
				const lightScreen = side.getSideCondition("lightscreen");
				const auroraVeil = side.getSideCondition("auroraveil");

				// 物理招式对应反射壁/极光幕，特殊招式对应光墙/极光幕
				if (
					(move.category === "Physical" && (reflect || auroraVeil)) ||
					(move.category === "Special" && (lightScreen || auroraVeil))
				) {
					// 4. 应用伤害补偿（抵消墙的减伤效果）
					this.debug("Fantasy Scope Lens: Ignoring Screens");

					// 判断是单打还是双打/多打
					if (this.gameType !== "singles") {
						// 双打中墙的效果是伤害 * (2732/4096)，约为0.66
						// 为了抵消，我们需要乘以 (4096/2732)，约为1.5
						return this.chainModify([4096, 2732]);
					} else {
						// 单打中墙的效果是伤害 * 0.5
						// 为了抵消，我们需要乘以 2
						return this.chainModify(2);
					}
				}
			}
		},
		// 原有效果：无视防御
		onAnyModifyDef(def, target, source, move) {
			if (!source || source.item !== "fantasyscopelens") return;
			if (move.flags["shooting"] || move.flags["bullet"]) {
				// 检查使用者是否拥有“穿透”特性
				if (source.hasAbility("infiltrator")) {
					// 穿透(10%) + 道具(20%) = 无视30%防御
					this.debug(
						"Fantasy Scope Lens + Infiltrator combined additive drop"
					);
					return this.chainModify(0.7);
				} else {
					// 仅道具：无视20%防御
					this.debug("Fantasy Scope Lens Def drop");
					return this.chainModify(0.8);
				}
			}
		},
		// 原有效果：无视特防
		onAnyModifySpD(spd, target, source, move) {
			if (!source || source.item !== "fantasyscopelens") return;
			if (move.flags["shooting"] || move.flags["bullet"]) {
				// 检查使用者是否拥有“穿透”特性
				if (source.hasAbility("infiltrator")) {
					// 穿透(10%) + 道具(20%) = 无视30%特防
					this.debug(
						"Fantasy Scope Lens + Infiltrator combined additive drop"
					);
					return this.chainModify(0.7);
				} else {
					// 仅道具：无视20%特防
					this.debug("Fantasy Scope Lens SpD drop");
					return this.chainModify(0.8);
				}
			}
		},
		num: 30004,
		gen: 9,
		desc: "幻之焦点镜。使用射击、球和弹类招式时,无视对手的反射壁/光墙/极光幕,且无视目标20%的防御与特防。",
		shortDesc: "幻之焦点镜。射击球弹类招式无视墙,且无视目标20%双防。",
	},
	fantasysyrupyapple: {
		name: "Fantasy Syrupy Apple",
		spritenum: 755,
		fling: {
			basePower: 30,
		},
		// 效果1：降低物攻
		onModifyAtk(atk) {
			// 将物攻值乘以0.8，即降低20%
			return this.chainModify(0.8);
		},
		// 效果1：降低特攻
		onModifySpA(spa) {
			// 将特攻值乘以0.8，即降低20%
			return this.chainModify(0.8);
		},
		// 效果2：回合结束时恢复HP
		onResidual(pokemon) {
			// 为宝可梦恢复其最大HP的1/10
			this.heal(pokemon.baseMaxhp / 10);
		},
		num: 30005,
		gen: 9,
		desc: "幻之蜜汁苹果。携带后,回合结束时恢复最大HP的1/10,但物攻和特攻降低20%",
		shortDesc:
			"幻之蜜汁苹果。携带后,回合结束时恢复最大HP的1/10,但物攻和特攻降低20%",
	},
	fantasyprotector: {
		name: "Fantasy Protector",
		spritenum: 367,
		fling: {
			basePower: 80,
		},
		// 效果1：提升物防
		onModifyDef(def) {
			// 将物防值乘以1.2，即提升20%
			return this.chainModify(1.2);
		},
		// 效果1：提升特防
		onModifySpD(spd) {
			// 将特防值乘以1.2，即提升20%
			return this.chainModify(1.2);
		},
		// 效果2：降低速度
		onModifySpe(spe) {
			// 将速度值乘以0.5，即降低1/2
			return this.chainModify(0.5);
		},
		num: 30006,
		gen: 9,
		desc: "幻之护具。携带后,虽然物防和特防将提高20%,但速度会降低至原来的1/2",
		shortDesc: "幻之护具。携带后,物防和特防提高20%,但速度会降低至原来的1/2",
	},
	fantasyicestone: {
		name: "Fantasy Ice Stone",
		spritenum: 693,
		fling: {
			basePower: 30,
		},
		// 效果 1：将持有者使用的招式中的灼伤效果替换为冻伤（fst）
		onModifyMove(move) {
			let changed = false;

			// 1. 处理直接造成状态的招式（如：鬼火）
			if (move.status === "brn") {
				move.status = "fst" as ID;
				changed = true;
			}

			// 2. 处理单数形式的追加效果（兼容性处理）
			if (move.secondary && move.secondary.status === "brn") {
				move.secondary.status = "fst" as ID;
				changed = true;
			}

			// 3. 处理复数形式的追加效果（如：喷射火焰、大字爆炎）
			if (move.secondaries) {
				for (const secondary of move.secondaries) {
					if (secondary.status === "brn") {
						secondary.status = "fst" as ID;
						changed = true;
					}
				}
			}

			if (changed) {
				this.debug(
					"Fantasy Ice Stone: 将招式带来的灼伤效果变换为冻伤(FST)"
				);
			}
		},
		// 效果 2：反伤逻辑保持不变
		onDamagingHit(damage, target, source, move) {
			if (source.status === "fst") {
				this.debug("Fantasy Ice Stone: 冻伤触发额外反伤");
				this.add(
					"-activate",
					target,
					"item: Fantasy Ice Stone",
					"[of] " + source
				);
				this.damage(source.baseMaxhp / 8, source, target);
			}
		},
		num: 30007,
		gen: 9,
		desc: "幻之冰之石。携带后,使用的招式原本造成灼伤则改为造成冻伤。受到处于冻伤状态的对手攻击时,对手损失最大HP的1/8。",
		shortDesc: "幻之冰之石。技能造成的灼伤变冻伤,对手在冻伤状态下攻击持有者,损失1/8最大HP",
	},
};
