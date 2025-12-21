export const Scripts: ModdedBattleScriptsData = {
	gen: 9,

	// 保留你原来正确的 init 函数
	init() {
		for (const id in this.data.FormatsData) {
			if (this.data.FormatsData[id].isNonstandard === 'Past') delete this.data.FormatsData[id].isNonstandard;
			if (this.data.FormatsData[id].natDexTier) {
				this.data.FormatsData[id].tier = this.data.FormatsData[id].natDexTier;
			}
		}
	},

	actions: {
		// 新增：处理多形态进化的判定逻辑
		canMegaEvo(pokemon) {
			const species = pokemon.baseSpecies;
			const item = pokemon.getItem();
			
			// 核心逻辑：处理类似 Tatsugiri 的数组映射
			if (Array.isArray(item.megaEvolves)) {
				// 检查当前宝可梦的名字是否在进化石的可进化列表中
				const index = item.megaEvolves.indexOf(species.name);
				if (index >= 0) {
					// 如果在，则返回 megaStone 数组中对应下标的形态
					if (Array.isArray(item.megaStone)) {
						return item.megaStone[index];
					}
				}
				return null;
			}

			// 默认逻辑：处理普通的单对单进化
			if (item.megaEvolves === species.name) {
				return item.megaStone as string;
			}

			return null;
		},

		// 保留并兼容你原来的对战执行逻辑
		runMegaEvo(pokemon) {
			// 这里会自动调用上面定义的 canMegaEvo 获取 speciesid
			const speciesid = pokemon.canMegaEvo || pokemon.canUltraBurst;
			if (!speciesid) return false;

			// 究极变身处理
			if (pokemon.canUltraBurst) {
				pokemon.formeChange(speciesid, pokemon.getItem(), true);
				for (const ally of pokemon.side.pokemon) {
					ally.canUltraBurst = null;
				}
				this.battle.runEvent('AfterMega', pokemon);
				return true;
			}

			// Mega 进化路径：保留 Fantasy Mega 的兼容处理
			const standardMega = this.dex.species.get(speciesid);
			let targetSpecies = standardMega;
			if (pokemon.species.name.endsWith('-Fantasy')) {
				const fantasyMega = this.dex.species.get(standardMega.id + '-fantasy');
				if (fantasyMega.exists) targetSpecies = fantasyMega;
			}

			if (this.battle.ruleTable.isBanned('megarayquazaclause') && targetSpecies.id === 'rayquazamega') {
				this.battle.runEvent('Cant', pokemon, null, null, 'mega');
				return false;
			}

			// 执行变身
			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);
			this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, targetSpecies.requiredItem);
			this.battle.add('-start', pokemon, 'ability: ' + pokemon.getAbility().name);
			this.battle.add('-ability', pokemon, pokemon.getAbility().name, '[from] ability: ' + pokemon.getAbility().name, '[silent]');

			for (const ally of pokemon.side.pokemon) {
				ally.canMegaEvo = null;
			}

			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},
	},
};