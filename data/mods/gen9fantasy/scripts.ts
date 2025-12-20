// scripts.ts

export const Scripts: ModdedBattleScriptsData = {
	gen: 9,

	init() {
		for (const id in this.data.FormatsData) {
			if (this.data.FormatsData[id].isNonstandard === 'Past') delete this.data.FormatsData[id].isNonstandard;
			if (this.data.FormatsData[id].natDexTier) {
				this.data.FormatsData[id].tier = this.data.FormatsData[id].natDexTier;
			}
		}
	},

	actions: {
		canMegaEvo(pokemon) {
			const species = pokemon.baseSpecies;
			const item = pokemon.getItem();
			
			// 1. 处理携带道具的 Mega 进化 (Raichu, Metagross 等)
			if (item.megaEvolves === species.name || (Array.isArray(item.megaEvolves) && item.megaEvolves.includes(species.name))) {
				return item.megaStone as string;
			}

			// 2. 处理通过招式触发的 Mega 进化 (类似 Mega 裂空坐 / 你的武道熊师)
			// 我们遍历图鉴，寻找那些以当前宝可梦为基础形态且有招式要求的 Mega 形态
			for (const megaName in this.dex.data.Pokedex) {
				const megaSpecies = this.dex.species.get(megaName);
				
				// 判定条件：
				// a. 必须有 requiredMove 字段
				// b. requiredForme 必须匹配当前宝可梦的形态名 (关键修复)
				if (megaSpecies.requiredMove && megaSpecies.requiredForme === pokemon.species.name) {
					if (pokemon.moves.includes(toID(megaSpecies.requiredMove))) {
						return megaSpecies.name;
					}
				}
			}
			return null;
		},

		runMegaEvo(pokemon) {
			const speciesid = pokemon.canMegaEvo || pokemon.canUltraBurst;
			if (!speciesid) return false;

			const targetSpecies = this.dex.species.get(speciesid);

			// 执行变身逻辑
			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);
			
			// 修正消息显示：如果是招式进化，显示招式来源
			if (targetSpecies.requiredMove) {
				this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, '[move] ' + targetSpecies.requiredMove);
                // 武道熊师专属文案
                if (targetSpecies.name.includes('Urshifu')) {
                    this.battle.add('-flavor', pokemon, '展现了纯粹的武道极致！');
                }
			} else {
				this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, pokemon.getItem().name);
			}

			this.battle.add('-start', pokemon, 'ability: ' + pokemon.getAbility().name);

			for (const ally of pokemon.side.pokemon) {
				ally.canMegaEvo = null;
			}
			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},
	},
};