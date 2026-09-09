import type { TrainerDefinition } from "../server/fantasy-ai/types";

export const Trainers: TrainerDefinition[] = [
	{
		id: "acelora-ou",
		name: "阿塞萝拉",
		avatar: "acerola-masters",
		description: "以骨纹巨声鳄和盐石巨灵防守消耗和灵活轮转创造机会，用洛托姆干扰对手的战术，依靠Mega阿勃梭鲁与霸主阿罗拉嘎啦嘎啦突破防线，再由谜拟丘强化收割的幽灵主题平衡队。",
		format: "gen9fcou",
		style: "balanced",
		keyMembers: [1, 2, 3],
		resourcePreferences: ["mega", "zmove", "terastallize", "aura"],
		team: `
		Mimikyu-Fantasy @ fantasypowerlens
		Ability: Disguise
		EVs: 252 Atk / 4 SpD / 252 Spe
		Adamant Nature
		- Shadow Sneak
		- Poltergeist
		- Play Rough
		- Swords Dance

		Skeledirge-Fantasy @ Heavy-Duty Boots
		Ability: Unaware
		Tera Type: Water
		EVs: 248 HP / 8 SpA / 252 SpD
		Calm Nature
		IVs: 0 Atk
		- Torch Song
		- Infernal Parade
		- Slack Off
		- Will-O-Wisp

		Garganacl-Fantasy @ fantasysyrupyapple
		Ability: Purifying Salt
		Tera Type: Fairy
		EVs: 252 HP / 252 Def / 4 SpD
		Impish Nature
		- Salt Cure
		- Recover
		- Stealth Rock
		- Protect

		Marowak-Alola-Totem-Fantasy @ Firium Z
		Ability: Lightning Rod
		EVs: 4 HP / 252 SpA / 252 Spe
		Timid Nature
		IVs: 0 Atk
		- Shadow Ball
		- Fiery Dance
		- Focus Blast
		- Ice Beam

		Absol-Mega-Z-Fantasy @ absolitez
		Ability: Justified
		EVs: 252 Atk / 4 SpD / 252 Spe
		Jolly Nature
		- Shadow Claw
		- Knock Off
		- U-turn
		- Close Combat

		Rotom-Fantasy @ fantasydefensegem
		Ability: Prankster
		Tera Type: Ghost
		EVs: 4 HP / 252 SpA / 252 Spe
		Timid Nature
		IVs: 0 Atk
		- Volt Switch
		- yuannengshifang
		- Destiny Bond
		- Defog
		`,
	},
	{
		id: "acelora-ubuu",
		name: "阿塞萝拉",
		avatar: "acerola-masters",
		description: "以坚盾剑怪、桃歹郎和骑拉帝纳承伤消耗，配合多龙巴鲁托轮转施压，为谜拟丘与武道熊师创造强化突破机会的幽灵主题平衡队。",
		format: "gen9fcubersuu",
		style: "balanced",
		keyMembers: [1, 2, 3],
		resourcePreferences: ["mega", "zmove", "terastallize", "aura"],
		team: `
		Mimikyu-Fantasy @ Mimikium Z
		Ability: Disguise
		EVs: 252 Atk / 4 SpD / 252 Spe
		Jolly Nature
		- Play Rough
		- Poltergeist
		- Trailblaze
		- Swords Dance

		Urshifu-Rapid-Strike-G-Mega-Fantasy @ Ghost Gem
		Ability: Unseen Fist
		Tera Type: Ghost
		EVs: 252 HP / 252 Atk / 4 SpD
		Adamant Nature
		- yishunqianji
		- Close Combat
		- U-turn
		- Swords Dance

		Dragapult-Fantasy @ fantasypowerlens
		Ability: Parental Bond
		Tera Type: Fairy
		EVs: 252 Atk / 4 SpD / 252 Spe
		Jolly Nature
		- Night Shade
		- Poltergeist
		- Dragon Rush
		- U-turn

		Aegislash-Fantasy @ Leftovers
		Ability: Stance Change
		Tera Type: Water
		EVs: 252 HP / 56 SpA / 156 SpD / 44 Spe
		Modest Nature
		IVs: 0 Atk
		- Toxic
		- King's Shield
		- Shadow Ball
		- Tachyon Cutter

		Pecharunt-Fantasy @ fantasydefensegem
		Ability: Levitate
		Tera Type: Steel
		EVs: 252 HP / 252 Def / 4 SpA
		Modest Nature
		IVs: 0 Atk
		- Malignant Chain
		- Hex
		- Body Press
		- Recover

		Giratina @ Leftovers
		Ability: Pressure
		Tera Type: Fairy
		EVs: 252 HP / 4 Def / 252 SpD
		Careful Nature
		- Dragon Tail
		- Thunder Wave
		- Defog
		- Rest
		`,
	},
	{
		id: "acelora-uu",
		name: "阿塞萝拉",
		avatar: "acerola-masters",
		description: "由魔灵珊瑚与黑夜魔灵开启戏法空间，支持Mega泥偶巨人和粗骨头阿罗拉嘎啦嘎啦输出，以耿鬼干扰和坚盾剑怪消耗衔接攻防的幽灵主题空间队。",
		format: "gen9fcuu",
		style: "balanced",
		keyMembers: [3, 4, 6],
		resourcePreferences: ["mega", "terastallize"],
		team: `
		Gengar-Fantasy @ Heavy-Duty Boots
		Ability: Prankster
		EVs: 252 SpA / 4 SpD / 252 Spe
		Timid Nature
		IVs: 0 Atk
		- wasitihuan
		- Bitter Malice
		- Encore
		- Destiny Bond

		Cursola-Fantasy @ fantasydefensegem
		Ability: Persistent
		Tera Type: Fairy
		EVs: 252 HP / 4 SpA / 252 SpD
		Quiet Nature
		IVs: 0 Atk
		- Hex
		- Will-O-Wisp
		- Trick Room
		- Strength Sap

		Golurk-Mega @ golurkite
		Ability: Iron Fist
		EVs: 252 HP / 252 Atk / 4 SpD
		Adamant Nature
		- Poltergeist
		- Close Combat
		- Earthquake
		- Knock Off

		Dusknoir-Fantasy @ fantasyprotector
		Ability: shouhun
		Tera Type: Fairy
		EVs: 252 HP / 4 Atk / 252 Def
		Relaxed Nature
		- Poltergeist
		- Recover
		- Trick Room
		- Teleport

		Aegislash @ Leftovers
		Ability: Stance Change
		EVs: 252 HP / 56 SpA / 156 SpD / 44 Spe
		Modest Nature
		IVs: 0 Atk
		- Substitute
		- Toxic
		- King's Shield
		- Shadow Ball

		Marowak-Alola-Fantasy @ Thick Club
		Ability: Rock Head
		EVs: 248 HP / 252 Atk / 8 SpD
		Adamant Nature
		- Shadow Bone
		- Flare Blitz
		- Shadow Sneak
		- Swords Dance
		`,
	},
];
