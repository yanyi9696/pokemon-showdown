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
	},

	// 这是我们最终确定的对战逻辑，确保对战中进化正确
	actions: {
		runMegaEvo(pokemon) {
			const speciesid = pokemon.canMegaEvo;
			if (!speciesid) return false;

			const standardMega = this.dex.species.get(speciesid);
			let targetSpecies = standardMega; // 默认进化目标是标准Mega

			// 只有当发起进化的宝可梦是-Fantasy形态时，才去寻找-Fantasy Mega形态
			if (pokemon.species.name.endsWith('-Fantasy')) {
				const fantasyMega = this.dex.species.get(standardMega.id + '-fantasy');
				if (fantasyMega.exists) {
					targetSpecies = fantasyMega; // 如果存在，则更新进化目标
				}
			}
            
			if (this.battle.ruleTable.isBanned('megarayquazaclause') && targetSpecies.id === 'rayquazamega') {
				this.battle.runEvent('Cant', pokemon, null, null, 'mega');
				return false;
			}

			// 执行变身
			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);
			this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, targetSpecies.requiredItem);

			// 如果是-Fantasy Mega，则显示特性动画的“信号”
			if (targetSpecies.name.endsWith('-Mega-Fantasy')) {
				this.battle.add('-start', pokemon, 'ability: ' + pokemon.getAbility().name);
				this.battle.add('-ability', pokemon, pokemon.getAbility().name, '[from] ability: ' + pokemon.getAbility().name, '[silent]');
			}

			const side = pokemon.side;
			for (const ally of side.pokemon) {
				ally.canMegaEvo = null;
			}

			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},
	},
};
