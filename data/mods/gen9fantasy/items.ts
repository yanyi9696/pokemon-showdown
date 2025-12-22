export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
	//以下为mega石 num从9999开始
	gmegawishingstar: {
		name: "G-Mega Wishing Star",
		spritenum: 709,
		megaStone: ["Garbodor-Mega-Fantasy", "Corviknight-Mega-Fantasy", "Sandaconda-Mega-Fantasy",
					"Toxtricity-Mega-Fantasy", "Toxtricity-Low-Key-Mega-Fantasy"],
		megaEvolves: ["Garbodor-Fantasy", "Corviknight-Fantasy", "Sandaconda-Fantasy",
					"Toxtricity-Fantasy", "Toxtricity-Low-Key-Fantasy"],
		itemUser: ["Garbodor-Fantasy", "Corviknight-Fantasy", "Sandaconda-Fantasy",
					"Toxtricity-Fantasy", "Toxtricity-Low-Key-Fantasy"],
		onTakeItem(item, source) {
			if (item.megaEvolves!.includes(source.baseSpecies.name)) return false;
			return true;
		},
		num: 9999,
		gen: 9,
		desc: "超巨进化许愿星。让超巨进化宝可梦携带后，在战斗时就能进行超级进化的一种神奇许愿星",
		shortDesc: "超巨进化许愿星。让可以超巨进化的宝可梦携带后,在战斗时就能进行超级进化",
	},
	victreebelite: {
		name: "Victreebelite",
		spritenum: 545,
		megaStone: "Victreebel-Mega",
		megaEvolves: "Victreebel",
		itemUser: ["Victreebel"],
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
		megaStone: "Hawlucha-Mega",
		megaEvolves: "Hawlucha",
		itemUser: ["Hawlucha"],
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
		megaStone: "Chandelure-Mega",
		megaEvolves: "Chandelure",
		itemUser: ["Chandelure"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10002, 
		gen: 9, 
		desc: "水晶灯火灵进化石。让水晶灯火灵携带后,在战斗时就能进行超级进化",
		shortDesc: "水晶灯火灵进化石。让水晶灯火灵携带后,在战斗时就能进行超级进化",
	},
	froslassite: {
		name: "Froslassite",
		spritenum: 551,
		megaStone: "Froslass-Mega",
		megaEvolves: "Froslass",
		itemUser: ["Froslass"],
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
		megaStone: "Delphox-Mega",
		megaEvolves: "Delphox",
		itemUser: ["Delphox"],
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
		megaStone: "Dragalge-Mega",
		megaEvolves: "Dragalge",
		itemUser: ["Dragalge"],
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
		megaStone: "Excadrill-Mega",
		megaEvolves: "Excadrill",
		itemUser: ["Excadrill"],
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
		megaStone: "Meganium-Mega",
		megaEvolves: "Meganium",
		itemUser: ["Meganium"],
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
		megaStone: "Greninja-Mega",
		megaEvolves: "Greninja",
		itemUser: ["Greninja"],
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
		megaStone: "Starmie-Mega",
		megaEvolves: "Starmie",
		itemUser: ["Starmie"],
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
		megaStone: "Barbaracle-Mega",
		megaEvolves: "Barbaracle",
		itemUser: ["Barbaracle"],
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
		megaStone: "Chesnaught-Mega",
		megaEvolves: "Chesnaught",
		itemUser: ["Chesnaught"],
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
		megaStone: "Drampa-Mega",
		megaEvolves: "Drampa",
		itemUser: ["Drampa"],
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
		megaStone: "Falinks-Mega",
		megaEvolves: "Falinks",
		itemUser: ["Falinks"],
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
		shortDesc: "花叶蒂-永恒之花进化石。让花叶蒂-永恒之花携带后,在战斗时就能进行超级进化",
	},
	skarmorite: {
		name: "Skarmorite",
		spritenum: 550,
		megaStone: "Skarmory-Mega",
		megaEvolves: "Skarmory",
		itemUser: ["Skarmory"],
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
		megaStone: "Clefable-Mega",
		megaEvolves: "Clefable",
		itemUser: ["Clefable"],
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
		megaStone: "Scrafty-Mega",
		megaEvolves: "Scrafty",
		itemUser: ["Scrafty"],
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
		megaStone: "Eelektross-Mega",
		megaEvolves: "Eelektross",
		itemUser: ["Eelektross"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.baseSpecies) return false;
			return true;
		},
		num: 10019, 
		gen: 9, 
		desc: "麻麻鳗鱼王进化石。让麻麻鳗鱼王携带后,在战斗时就能进行超级进化",
		shortDesc: "麻麻鳗鱼王进化石。让麻麻鳗鱼王携带后,在战斗时就能进行超级进化",
	},
	emboarite: {
		name: "Emboarite",
		spritenum: 552,
		megaStone: "Emboar-Mega",
		megaEvolves: "Emboar",
		itemUser: ["Emboar"],
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
		megaStone: "Feraligatr-Mega",
		megaEvolves: "Feraligatr",
		itemUser: ["Feraligatr"],
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
		megaStone: "Malamar-Mega",
		megaEvolves: "Malamar",
		itemUser: ["Malamar"],
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
		megaStone: "Pyroar-Mega",
		megaEvolves: "Pyroar",
		itemUser: ["Pyroar"],
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
		megaStone: "Scolipede-Mega",
		megaEvolves: "Scolipede",
		itemUser: ["Scolipede"],
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
		megaStone: "Absol-Mega-Z",
		megaEvolves: "Absol",
		itemUser: ["Absol"],
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
		megaStone: "Baxcalibur-Mega",
		megaEvolves: "Baxcalibur",
		itemUser: ["Baxcalibur"],
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
		megaStone: "Chimecho-Mega",
		megaEvolves: "Chimecho",
		itemUser: ["Chimecho"],
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
		megaStone: "Crabominable-Mega",
		megaEvolves: "Crabominable",
		itemUser: ["Crabominable"],
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
		megaStone: "Darkrai-Mega",
		megaEvolves: "Darkrai",
		itemUser: ["Darkrai"],
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
		megaStone: "Garchomp-Mega-Z",
		megaEvolves: "Garchomp",
		itemUser: ["Garchomp"],
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
		megaStone: "Glimmora-Mega",
		megaEvolves: "Glimmora",
		itemUser: ["Glimmora"],
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
		megaStone: "Golisopod-Mega",
		megaEvolves: "Golisopod",
		itemUser: ["Golisopod"],
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
		megaStone: "Golurk-Mega",
		megaEvolves: "Golurk",
		itemUser: ["Golurk"],
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
		megaStone: "Heatran-Mega",
		megaEvolves: "Heatran",
		itemUser: ["Heatran"],
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
		megaStone: "Lucario-Mega-Z",
		megaEvolves: "Lucario",
		itemUser: ["Lucario"],
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
		megaStone: ["Magearna-Mega", "Magearna-Original-Mega"],
		megaEvolves: ["Magearna", "Magearna-Original"],
		itemUser: ["Magearna", "Magearna-Original"],
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
		megaStone: ["Meowstic-Mega", "Meowstic-F-Mega"],
		megaEvolves: ["Meowstic", "Meowstic-F"],
		itemUser: ["Meowstic", "Meowstic-F"],
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
		megaStone: "Raichu-Mega-X",
		megaEvolves: "Raichu",
		itemUser: ["Raichu"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.name ||
				item.megaStone === source.baseSpecies.name) return false;
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
		megaStone: "Raichu-Mega-Y",
		megaEvolves: "Raichu",
		itemUser: ["Raichu"],
		onTakeItem(item, source) {
			if (item.megaEvolves === source.baseSpecies.name ||
				item.megaStone === source.baseSpecies.name) return false;
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
		megaStone: "Scovillain-Mega",
		megaEvolves: "Scovillain",
		itemUser: ["Scovillain"],
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
		megaStone: "Staraptor-Mega",
		megaEvolves: "Staraptor",
		itemUser: ["Staraptor"],
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
		megaStone: ["Tatsugiri-Curly-Mega", "Tatsugiri-Droopy-Mega", "Tatsugiri-Stretchy-Mega"],
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
		megaStone: "Zeraora-Mega",
		megaEvolves: "Zeraora",
		itemUser: ["Zeraora"],
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
		shortDesc: "颤弦蝾螈Z。颤弦蝾螈携带后,可以把破音转化成特殊的Ｚ招式: 超频摇滚破音波",
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
		shortDesc: "智忍蛙Z。甲贺忍蛙-牵绊携带后,可以把飞水手里剑转化成特殊的Ｚ招式：黄金羁绊手里剑",
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
        if (move.category === 'Status') return;

        // 然后，再检查招式命中率的类型
        if (typeof move.accuracy !== 'number') return;

        // 在这里进行完整的条件判断
        const isHustleAffected = source.hasAbility('hustle') && move.category === 'Physical';
        if (move.accuracy < 100 || (move.accuracy === 100 && isHustleAffected)) {
            this.debug('Fantasy Power Lens boosting accuracy');
            return this.chainModify([4915, 4096]); // 1.2倍
        }
    },
    // 效果3：提升威力。
    onBasePower(basePower, source, target, move) {
        // 变化类招式没有威力，直接返回。
        if (move.category === 'Status') return;
        
        // 检查招式的原始命中率是否为数字。
        if (typeof move.accuracy !== 'number') return;

        // 在这里重复一次完整的条件判断
        const isHustleAffected = source.hasAbility('hustle') && move.category === 'Physical';
        if (move.accuracy < 100 || (move.accuracy === 100 && isHustleAffected)) {
            this.debug('Fantasy Power Lens boosting power');
            return this.chainModify([4915, 4096]); // 1.2倍
        }
    },
		num: 30000,
		gen: 9,
		desc: "幻之力量镜。携带后,虽然攻击将无法击中要害,但命中不满100%的非变化类技能命中率与威力会提升1.2倍",
		shortDesc: "幻之力量镜。攻击无法击中要害,命中不满100%的非变化技能威力与命中率提升1.2倍",
	},
	fantasyringtarget: {
		name: "Fantasy Ring Target",
		spritenum: 410,
		fling: { basePower: 30 },
		onStart(pokemon) {
        // 新增：在宝可梦登场时显示提示信息，暴露道具
        this.add('-message', `${pokemon.name}的幻之标靶正在锁定目标!`);
		this.add('-item', pokemon, 'Fantasy Ring Target');
		},
		onDisableMove(pokemon) {
			for (const moveSlot of pokemon.moveSlots) {
				const move = this.dex.moves.get(moveSlot.id);
				if (move.category === 'Status') {
					// 禁用这个招式
					pokemon.disableMove(moveSlot.id);
				}
			}
		},
		onModifyMove(move, pokemon) {
			if (move.category !== 'Status') {
				move.ignoreImmunity = true;
			}
		},
		num: 30001,
		gen: 9,
		desc: "幻之标靶。携带后,登场会暴露道具,虽然无法使用变化招式,但使用的原本属性相性没有效果的招式会变为有效果",
		shortDesc: "幻之标靶。登场时暴露道具,使用的招式无视属性免疫,但无法使用变化招式",
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
            this.debug('幻之生命宝珠:因异常状态,获得伤害减免30%。');
            // 使用 chainModify 来应用乘算修饰。4096 * 0.7 = 2867
            return this.chainModify(2867 / 4096);
			}
		},
		onResidual(pokemon) {
			if (pokemon.status && ['brn', 'par', 'slp', 'frz', 'psn', 'tox'].includes(pokemon.status)) {
				this.damage(pokemon.baseMaxhp / 10, pokemon, pokemon, this.dex.items.get('fantasylifeorb'));
			}
		},
		//不受异常状态效果影响的效果分别写在各个异常状态里了
		num: 30002,
		gen: 9,
		desc: "幻之生命宝珠。携带后, 不受异常状态效果影响,处于异常状态下的宝可梦,受到的伤害降低30%,但回合结束时将损失最大HP的1/10",
		shortDesc: "幻之生命宝珠。异常状态效果无效,异常状态下伤害减免30%,每回合损血1/10",
	},
	fantasysachet: {
		name: "Fantasy Sachet",
		spritenum: 691,
		fling: {
			basePower: 10,
			volatileStatus: 'fantasysachetfling',
		} as any,
		onTryBoost(boost: {[key: string]: number}, target: Pokemon, source: Pokemon | null, effect: Effect | null) {
			let hasBoost = false;
			for (const i in boost) {
				if (boost[i] > 0) {
					hasBoost = true;
					delete boost[i];
				}
			}
			if (hasBoost) {
				this.add('-fail', target, 'boost', '[from] item: Fantasy Sachet');
			}
		},

		// 效果 1：使用者主动攻击对方时
		onModifyMove(move, pokemon) {
			if (!move.flags['contact'] || !pokemon.hasItem('fantasysachet')) return;
			
			move.onAfterMoveSecondary = (target, source) => {
				if (!source || !target || target.isAlly(source) || target === source) return;

				// 检查：如果在此之前道具已经因为某些特殊反馈效果（如对方的特性“顺手牵羊”）丢失，则不触发
				if (!source.hasItem('fantasysachet')) return;

				if (source.useItem()) {
					this.add('-activate', source, 'item: Fantasy Sachet');

					const affected = target;
					// 建立一个权威的、不可更改特性的“黑名单”
					const unchangeableAbilities = [
						// 官方永久特性
						'asone', 'battlebond', 'comatose', 'commander', 'disguise', 'gulpmissile', 'hadronengine', 'iceface', 
						'multitype', 'orichalcumpulse', 'powerconstruct', 'protosynthesis', 'quarkdrive', 'rkssystem', 'schooling', 'shieldsdown', 
						'stancechange', 'terashift', 'zenmode', 'zerotohero',
						// 效果相关特性
						'lingeringaroma', 'mummy',
						// 你的自定义永久特性
						'woju',
					];

					if (unchangeableAbilities.includes(affected.ability)) {
						// 如果对方的特性在此名单中，则判定失败
						this.add('-fail', source);
					} else if (affected.hasItem('abilityshield')) {
						// 对特性护具的检查保持不变
						this.add('-block', affected, 'item: Ability Shield');
					} else {
						// 成功改变特性
						affected.baseAbility = 'lingeringaroma' as ID;
						affected.setAbility('lingeringaroma');
						this.add('-ability', affected, 'Lingering Aroma', '[from] item: Fantasy Sachet', '[of] ' + source);
					}
				}
			};
		},

		// 效果 2：修复版 - 持有者被攻击时
		// 修复版：使用 onDamagingHit 确保正常受击触发
		onDamagingHit(damage, target, source, move) {
			// 1. 必须是接触类招式
			if (!move.flags['contact']) return;
			
			// 2. 核心逻辑：
			// 如果此时道具已经不在身上了（说明被偷走了），或者招式标记了 itemRemoved（说明被拍落或咬烂了）
			// 我们使用 (move as any) 来绕过 TS 的类型检查报错
			if (!target.hasItem('fantasysachet') || (move as any).itemRemoved) {
				return;
			}
			
			if (!source || source.isAlly(target) || source === target) return;

			// 3. 正常受击触发
			if (target.useItem()) {
				this.add('-activate', target, 'item: Fantasy Sachet');
				const affected = source;
				// 同样在这里使用权威的“黑名单”
				const unchangeableAbilities = [
						// 官方永久特性
						'asone', 'battlebond', 'comatose', 'commander', 'disguise', 'gulpmissile', 'hadronengine', 'iceface', 
						'multitype', 'orichalcumpulse', 'powerconstruct', 'protosynthesis', 'quarkdrive', 'rkssystem', 'schooling', 'shieldsdown', 
						'stancechange', 'terashift', 'zenmode', 'zerotohero',
						// 效果相关特性
						'lingeringaroma', 'mummy',
						// 你的自定义永久特性
						'woju',
				];

				if (unchangeableAbilities.includes(affected.ability)) {
					this.add('-fail', target);
				} else if (affected.hasItem('abilityshield')) {
					this.add('-block', affected, 'item: Ability Shield');
				} else {
					affected.baseAbility = 'lingeringaroma' as ID;
					affected.setAbility('lingeringaroma');
					this.add('-ability', affected, 'Lingering Aroma', '[from] item: Fantasy Sachet', '[of] ' + target);
				}
			}
		},
		num: 30003,
		gen: 9,
		desc: "幻之香袋。携带道具后将无法提升能力,当接触对方或被对方接触时,将对方的特性更改为甩不掉的气味,生效一次后消失",
		shortDesc: "幻之香袋。无法提升能力,当双方接触时,将对手的特性变为甩不掉的气味",
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
			if (move.flags['shooting'] || move.flags['bullet']) {
				// 2. 检查是否已经通过其他方式无视了墙（击中要害 或 穿透特性）
				// 如果是击中要害，系统已经忽略了墙，不需要道具补偿
				if (target.getMoveHitData(move).crit) return;
				// 如果有穿透特性，系统已经忽略了墙，不需要道具补偿
				if (source.hasAbility('infiltrator')) return;

				// 3. 检查是否存在对应的墙
				const side = target.side;
				const reflect = side.getSideCondition('reflect');
				const lightScreen = side.getSideCondition('lightscreen');
				const auroraVeil = side.getSideCondition('auroraveil');

				// 物理招式对应反射壁/极光幕，特殊招式对应光墙/极光幕
				if ((move.category === 'Physical' && (reflect || auroraVeil)) ||
					(move.category === 'Special' && (lightScreen || auroraVeil))) {
					
					// 4. 应用伤害补偿（抵消墙的减伤效果）
					this.debug('Fantasy Scope Lens: Ignoring Screens');
					
					// 判断是单打还是双打/多打
					if (this.gameType !== 'singles') {
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
			if (!source || source.item !== 'fantasyscopelens') return;
			if (move.flags['shooting'] || move.flags['bullet']) {
				// 检查使用者是否拥有“穿透”特性
				if (source.hasAbility('infiltrator')) {
					// 穿透(10%) + 道具(20%) = 无视30%防御
					this.debug('Fantasy Scope Lens + Infiltrator combined additive drop');
					return this.chainModify(0.7); 
				} else {
					// 仅道具：无视20%防御
					this.debug('Fantasy Scope Lens Def drop');
					return this.chainModify(0.8);
				}
			}
		},
		// 原有效果：无视特防
		onAnyModifySpD(spd, target, source, move) {
			if (!source || source.item !== 'fantasyscopelens') return;
			if (move.flags['shooting'] || move.flags['bullet']) {
				// 检查使用者是否拥有“穿透”特性
				if (source.hasAbility('infiltrator')) {
					// 穿透(10%) + 道具(20%) = 无视30%特防
					this.debug('Fantasy Scope Lens + Infiltrator combined additive drop');
					return this.chainModify(0.7);
				} else {
					// 仅道具：无视20%特防
					this.debug('Fantasy Scope Lens SpD drop');
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
		shortDesc: "幻之蜜汁苹果。携带后,回合结束时恢复最大HP的1/10,但物攻和特攻降低20%",
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
};
