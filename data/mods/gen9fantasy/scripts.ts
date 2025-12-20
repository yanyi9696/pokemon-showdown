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
		/**
		 * @description 处理 Mega 进化的判定逻辑
		 * 修复了 this.toID 的报错问题，改为直接使用全局的 toID 函数。
		 */
		canMegaEvo(pokemon) {
			const species = pokemon.baseSpecies;
			const item = pokemon.getItem();
			
			// 1. 处理类似 Tatsugiri 的数组映射进化石逻辑
			if (Array.isArray(item.megaEvolves)) {
				const index = item.megaEvolves.indexOf(species.name);
				if (index >= 0) {
					if (Array.isArray(item.megaStone)) {
						return item.megaStone[index];
					}
				}
				return null;
			}

			// 2. 处理普通的单对单进化石
			if (item.megaEvolves === species.name) {
				return item.megaStone as string;
			}

			// 3. 处理通过招式触发的 Mega 进化 (例如武道熊师)
			for (const megaName in this.dex.data.Pokedex) {
				const megaSpecies = this.dex.species.get(megaName);
				if (megaSpecies.baseSpecies === species.name && megaSpecies.requiredMove) {
					// --- 关键修复：移除 this. 关键字 ---
					if (pokemon.moves.includes(toID(megaSpecies.requiredMove))) {
						return megaSpecies.name;
					}
				}
			}
			return null;
		},

		/**
		 * @description 执行 Mega 进化的对战逻辑
		 */
		runMegaEvo(pokemon) {
			const speciesid = pokemon.canMegaEvo || pokemon.canUltraBurst;
			if (!speciesid) return false;

			// 究极变身处理 (Ultra Burst)
			if (pokemon.canUltraBurst) {
				pokemon.formeChange(speciesid, pokemon.getItem(), true);
				for (const ally of pokemon.side.pokemon) {
					ally.canUltraBurst = null;
				}
				this.battle.runEvent('AfterMega', pokemon);
				return true;
			}

			// 确定最终形态，处理 Fantasy 版本的优先级
			const standardMega = this.dex.species.get(speciesid);
			let targetSpecies = standardMega;
			if (pokemon.species.name.endsWith('-Fantasy')) {
				const fantasyMega = this.dex.species.get(standardMega.id + '-fantasy');
				if (fantasyMega.exists) targetSpecies = fantasyMega;
			}

			// 检查 Mega 裂空坐限制
			if (this.battle.ruleTable.isBanned('megarayquazaclause') && targetSpecies.id === 'rayquazamega') {
				this.battle.runEvent('Cant', pokemon, null, null, 'mega');
				return false;
			}

			// --- 武道熊师专属文案逻辑 ---
			if (targetSpecies.name.includes('Urshifu-Mega')) {
				this.battle.add('-flavor', pokemon, '展现了纯粹的武道极致！');
			}

			// 执行变身
			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);
			
			// 修正日志：如果是因为招式进化没有道具，则显示 [move]
			this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, targetSpecies.requiredItem || "[move]");
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