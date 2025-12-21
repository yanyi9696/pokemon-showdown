export const Scripts: ModdedBattleScriptsData = {
	gen: 9,

	init() {
		// 保留你原来的 FormatsData 处理逻辑
		for (const id in this.data.FormatsData) {
			if (this.data.FormatsData[id].isNonstandard === 'Past') delete this.data.FormatsData[id].isNonstandard;
			if (this.data.FormatsData[id].natDexTier) {
				this.data.FormatsData[id].tier = this.data.FormatsData[id].natDexTier;
			}
		}

		// 【重要修改】移除了原本在 init 里的 this.modData('Abilities', 'unseenfist').onStart 逻辑。
		// 因为 Mega 裂空坐模式是手动触发的，不需要在特性发动时自动变身。
	},

	actions: {
		canMegaEvo(pokemon) {
			const species = pokemon.baseSpecies;
			
			// --- 逻辑 A：处理类似 Mega 裂空坐的招式进化 (Required Move) ---
			// 检查当前形态是否定义了进化后的形态，并且检查是否有招式要求
			const altForme = this.dex.species.get(species.otherFormes?.[0]); // 寻找 Mega 形态
			
			// 遍历所有可能的进化形态（针对具有 requiredMove 的物种）
			if (species.otherFormes) {
				for (const formeName of species.otherFormes) {
					const forme = this.dex.species.get(formeName);
					if (forme.requiredMove && pokemon.hasMove(this.dex.toID(forme.requiredMove))) {
						return forme.name; // 返回需要进化的形态名称
					}
				}
			}

			// --- 逻辑 B：处理你原来的道具/数组映射逻辑 (Required Item) ---
			const item = pokemon.getItem();
			if (Array.isArray(item.megaEvolves)) {
				const index = item.megaEvolves.indexOf(species.name);
				if (index >= 0 && Array.isArray(item.megaStone)) {
					return item.megaStone[index];
				}
				return null;
			}

			// 默认单对单道具进化逻辑
			if (item.megaEvolves === species.name) {
				return item.megaStone as string;
			}

			return null;
		},

		runMegaEvo(pokemon) {
			// 获取由 canMegaEvo 返回的形态 ID
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

			const targetSpecies = this.dex.species.get(speciesid);

			// 检查烈空坐限制（防止在禁用了 Mega 裂空坐的分级中使用）
			if (this.battle.ruleTable.isBanned('megarayquazaclause') && targetSpecies.id === 'rayquazamega') {
				this.battle.runEvent('Cant', pokemon, null, null, 'mega');
				return false;
			}

			// 执行变身
			// 注意：如果是招式进化，通常不需要消耗道具
			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);
			
			// 消息广播：如果是招式进化，requiredItem 为空，显示效果会更自然
			this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, targetSpecies.requiredItem || '');
			this.battle.add('-start', pokemon, 'ability: ' + pokemon.getAbility().name);
			this.battle.add('-ability', pokemon, pokemon.getAbility().name, '[from] ability: ' + pokemon.getAbility().name, '[silent]');

			// 标记该玩家本场战斗已使用过 Mega 进化
			for (const ally of pokemon.side.pokemon) {
				ally.canMegaEvo = null;
			}

			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},
	},
};