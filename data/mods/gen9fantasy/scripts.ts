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

			// --- 新增：Urshifu 招式进化判定 ---
			// 检查是否携带了“认真殴打”
			if (pokemon.species.name === 'Urshifu-Fantasy' && pokemon.moves.includes('renzhenouda')) {
				return 'urshifumegafantasy';
			}
			// 检查是否携带了“一瞬千击”
			if (pokemon.species.name === 'Urshifu-Rapid-Strike-Fantasy' && pokemon.moves.includes('yishunqianji')) {
				return 'urshifurapidstrikemegafantasy';
			}
			// --------------------------------

			// 保留：处理类似 Tatsugiri 的数组映射
			if (Array.isArray(item.megaEvolves)) {
				const index = item.megaEvolves.indexOf(species.name);
				if (index >= 0) {
					if (Array.isArray(item.megaStone)) {
						return item.megaStone[index];
					}
				}
				return null;
			}

			// 保留：处理普通的单对单进化
			if (item.megaEvolves === species.name) {
				return item.megaStone as string;
			}

			return null;
		},

		runMegaEvo(pokemon) {
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

			// 保留：针对普通 Mega 石的 Fantasy 兼容逻辑
			// 注意：对于 Urshifu，因为 canMegaEvo 已经返回了特定的 ID，这里会找不到后缀为 -fantasy-fantasy 的物种，
			// 从而安全地跳过，保持 targetSpecies 不变。
			if (pokemon.species.name.endsWith('-Fantasy') && !standardMega.id.endsWith('fantasy')) {
				const fantasyMega = this.dex.species.get(standardMega.id + 'fantasy');
				if (fantasyMega.exists) targetSpecies = fantasyMega;
			}

			if (this.battle.ruleTable.isBanned('megarayquazaclause') && targetSpecies.id === 'rayquazamega') {
				this.battle.runEvent('Cant', pokemon, null, null, 'mega');
				return false;
			}

			// 执行变身
			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);
			
			// 修改：在对战记录中显示进化条件（道具或招式）
			// 这样烈空坐式进化就能正确显示招式名
			this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, targetSpecies.requiredItem || targetSpecies.requiredMove);
			
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