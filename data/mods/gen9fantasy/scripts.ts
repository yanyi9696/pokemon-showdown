export const Scripts: ModdedBattleScriptsData = {
	gen: 9,

	// 保留：这是你原来正确的 init 函数，用于处理分级数据。
	init() {
		for (const id in this.data.FormatsData) {
			if (this.data.FormatsData[id].isNonstandard === 'Past') delete this.data.FormatsData[id].isNonstandard;
			if (this.data.FormatsData[id].natDexTier) {
				this.data.FormatsData[id].tier = this.data.FormatsData[id].natDexTier;
			}
		}
	},

	actions: {
		// 替换并修正：这是新的、更强大的 runMegaEvo 函数。
		// 它能统一处理所有Mega进化情况，并且因为使用了官方的 formeChange 方法，
		// 你原来的 switchIn 补丁也就不再需要了。
		runMegaEvo(pokemon) {
			const speciesid = pokemon.canMegaEvo;
			if (!speciesid) return false;

			// 1. 从Mega石信息中获取标准的Mega形态ID (e.g., 'charizardmegax')
			const standardMega = this.dex.species.get(speciesid);
			
			// 2. 基于标准Mega形态，推断并检查是否存在一个对应的 -Fantasy Mega 形态
			const fantasyMega = this.dex.species.get(standardMega.id + '-fantasy');
			
			// 3. 决定最终进化目标：如果-Fantasy Mega形态存在，就用它；否则，就用标准Mega形态。
			const targetSpecies = fantasyMega.exists ? fantasyMega : standardMega;

			// 检查 Mega Rayquaza Clause
			if (this.battle.ruleTable.isBanned('megarayquazaclause') && targetSpecies.id === 'rayquazamega') {
				this.battle.runEvent('Cant', pokemon, null, null, 'mega');
				return false;
			}

			// 执行变身，这个函数会正确处理所有状态，包括特性。
			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);

			// --- 重点修改 ---
			// 1. 发送标准的 `-mega` 动画指令
			this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, targetSpecies.requiredItem);

			// 2. 发送一个 `-start` 指令，用于触发你想要的【客户端动画】
			this.battle.add('-start', pokemon, 'ability: ' + pokemon.getAbility().name);

			// 3. 同时，为了兼容性，仍然在右侧文本日志中显示一次特性信息
			this.battle.add('-ability', pokemon, pokemon.getAbility().name, '[from] ability: ' + pokemon.getAbility().name, '[silent]');
			// --- 修改结束 ---

			// 标记玩家已经使用过Mega进化
			const side = pokemon.side;
			for (const ally of side.pokemon) {
				ally.canMegaEvo = null;
			}

			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},
	},
};
