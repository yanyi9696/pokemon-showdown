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
			
			// 1. 处理道具触发的 Mega 进化 (已有的逻辑)
			if (Array.isArray(item.megaEvolves)) {
				const index = item.megaEvolves.indexOf(species.name);
				if (index >= 0 && Array.isArray(item.megaStone)) return item.megaStone[index];
			} else if (item.megaEvolves === species.name) {
				return item.megaStone as string;
			}

			// 2. 新增：处理招式触发的 Mega 进化 (类似裂空坐)
			// 遍历 Pokedex 查找是否有满足【当前形态】且【拥有对应招式】的 Mega 形态
			for (const id in this.dex.data.Pokedex) {
				const megaSpecies = this.dex.species.get(id);
				if (megaSpecies.forme === 'Mega' && 
					megaSpecies.requiredForme === species.name && 
					megaSpecies.requiredMove && 
					pokemon.hasMove(this.dex.toID(megaSpecies.requiredMove))) {
					return megaSpecies.id;
				}
			}

			return null;
		},

		runMegaEvo(pokemon) {
			// canMegaEvo 现在能正确识别招式触发的形态 ID
			const speciesid = pokemon.canMegaEvo || pokemon.canUltraBurst;
			if (!speciesid) return false;

			if (pokemon.canUltraBurst) {
				pokemon.formeChange(speciesid, pokemon.getItem(), true);
				for (const ally of pokemon.side.pokemon) {
					ally.canUltraBurst = null;
				}
				this.battle.runEvent('AfterMega', pokemon);
				return true;
			}

			const standardMega = this.dex.species.get(speciesid);
			let targetSpecies = standardMega;

			// 修复：只有当目标形态 ID 还不带 -fantasy 时才尝试追加，防止重复
			if (pokemon.species.name.endsWith('-Fantasy') && !targetSpecies.id.endsWith('fantasy')) {
				const fantasyMega = this.dex.species.get(standardMega.id + '-fantasy');
				if (fantasyMega.exists) targetSpecies = fantasyMega;
			}

			if (this.battle.ruleTable.isBanned('megarayquazaclause') && targetSpecies.id === 'rayquazamega') {
				this.battle.runEvent('Cant', pokemon, null, null, 'mega');
				return false;
			}

			// 执行标准的 Mega 变身流程
			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);
			this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, targetSpecies.requiredItem || targetSpecies.requiredMove);
			this.battle.add('-start', pokemon, 'ability: ' + pokemon.getAbility().name);
			
			for (const ally of pokemon.side.pokemon) {
				ally.canMegaEvo = null;
			}

			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},
	},
};