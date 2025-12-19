export const Scripts: ModdedBattleScriptsData = {
	gen: 9,

	// 关键：保留你原来正确的 init 函数，这会解决所有宝可梦“Illegal”的问题
	init() {
		for (const id in this.data.FormatsData) {
			if (this.data.FormatsData[id].isNonstandard === 'Past') delete this.data.FormatsData[id].isNonstandard;
			if (this.data.FormatsData[id].natDexTier) {
				this.data.FormatsData[id].tier = this.data.FormatsData[id].natDexTier;
			}
		}

		// 动态为自定义的 Mega 宝可梦添加 requiredItem
		for (const id in this.data.Pokedex) {
			const species = this.data.Pokedex[id];
			if (species.forme === 'Mega' && species.name.endsWith('-Fantasy') && !species.requiredItem) {
				// 尝试推断 Mega 石名称：例如 "Altaria-Mega-Fantasy" -> "Altarianite"

				// 1. 尝试查找标准 Mega 形态，复用其 requiredItem
				const standardMegaId = species.id.replace('fantasy', '');
				const standardMega = this.dex.species.get(standardMegaId);

				if (standardMega.exists && standardMega.requiredItem) {
					species.requiredItem = standardMega.requiredItem;
				} else {
					// 2. 如果标准 Mega 不存在（例如可能是完全自制的 Mega），尝试智能推断
					// 常见的命名规则是：BaseSpecies + "ite"
					// 或者如果是 X/Y 形态：BaseSpecies + "ite X"
					// 示例: Delphox-Mega-Fantasy -> Delphoxite

					const baseSpeciesName = species.baseSpecies;
					const potentialItemName = baseSpeciesName + "ite";
					const potentialItem = this.dex.items.get(potentialItemName);

					if (potentialItem.exists && potentialItem.megaEvolves === baseSpeciesName) {
						species.requiredItem = potentialItem.name;
					}

					// 3. 处理不规则命名或手动定义的 Mega 石
					// 有些 Mega 石名字不是简单的 "ite" 结尾，例如 "Hawluchanite", "Dragalgite" 等
					// 我们可以遍历所有 item，找到 megaEvolves 为当前 baseSpecies 的道具
					if (!species.requiredItem) {
						const allItems = this.dex.items.all();
						for (const item of allItems) {
							if (item.megaEvolves === baseSpeciesName) {
								species.requiredItem = item.name;
								break; // 找到即止
							}
						}
					}

					// 处理 X/Y 形态，例如 Charizard-Mega-X-Fantasy
					// id 通常是 charizardmegaxfantasy
					if (!species.requiredItem && (species.name.includes('-Mega-X') || species.name.includes('-Mega-Y'))) {
						const suffix = species.name.includes('-Mega-X') ? ' X' : ' Y';
						const potentialItemNameXY = baseSpeciesName + "ite" + suffix;
						const potentialItemXY = this.dex.items.get(potentialItemNameXY);
						if (potentialItemXY.exists) {
							species.requiredItem = potentialItemXY.name;
						}
					}
				}
			}
		}
	},
	

	// 这是我们最终确定的对战逻辑，确保对战中进化正确
	actions: {
		runMegaEvo(pokemon) {
			// 同时支持 Mega 进化与究极变身（Ultra Burst）
			const speciesid = pokemon.canMegaEvo || pokemon.canUltraBurst;
			if (!speciesid) return false;

			// 如果是究极变身，直接使用标准逻辑，避免误用 Mega 动画
			if (pokemon.canUltraBurst) {
				pokemon.formeChange(speciesid, pokemon.getItem(), true);
				// 限制本场仅一次究极变身
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

			// 执行 Mega 变身并展示动画
			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);
			this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, targetSpecies.requiredItem);
			this.battle.add('-start', pokemon, 'ability: ' + pokemon.getAbility().name);
			this.battle.add('-ability', pokemon, pokemon.getAbility().name, '[from] ability: ' + pokemon.getAbility().name, '[silent]');

			// 限制本场仅一次 Mega 进化
			for (const ally of pokemon.side.pokemon) {
				ally.canMegaEvo = null;
			}

			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},
	},
};