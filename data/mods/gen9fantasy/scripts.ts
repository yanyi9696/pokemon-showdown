export const Scripts: ModdedBattleScriptsData = {
	gen: 9,

	// 关键：保留你原来正确的 init 函数，这会解决所有宝可梦“Illegal”的问题
	init() {
		for (const id in this.data.FormatsData) {
			// 修复报错 1：直接使用 this.species.get 而不是 this.dex.species.get
			const species = this.species.get(id);
			
			// 1. 保留原有逻辑
			if (this.data.FormatsData[id].isNonstandard === 'Past') delete this.data.FormatsData[id].isNonstandard;
			if (this.data.FormatsData[id].natDexTier) {
				this.data.FormatsData[id].tier = this.data.FormatsData[id].natDexTier;
			}

			// 2. 修复报错 2：使用 (any) 绕过类型检查，将 Mega 石绑定到 FormatsData
			if (species.requiredItem) {
				(this.data.FormatsData[id] as any).requiredItems = [species.requiredItem];
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