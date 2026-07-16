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
		// ==========================================
		// 1. 气场爆发 / 究极爆发的按钮判定逻辑 (保持独立)
		// ==========================================
		canUltraBurst(pokemon) {
			const item = pokemon.getItem();

			// --- 原版奈克洛兹玛究极爆发 ---
			if (['Necrozma-Dawn-Wings', 'Necrozma-Dusk-Mane'].includes(pokemon.baseSpecies.name) &&
				item.id === 'ultranecroziumz') {
				return "Necrozma-Ultra";
			}

			// --- 自定义：气场爆发 ---
			// 核心机制：已经使用了Z招式，直接返回 null，按钮不显示！
			if (pokemon.side.zMoveUsed) return null;

			if ((item as any).auraBurst && pokemon.baseSpecies.name === (item as any).auraBurstSpecies) {
				return (item as any).auraBurst;
			}

			return null;
		},

		// ==========================================
		// 2. 将变身逻辑统合进 runMegaEvo (解决TS报错)
		// ==========================================
		runMegaEvo(pokemon) {
			const speciesid = pokemon.canMegaEvo || pokemon.canUltraBurst;
			if (!speciesid) return false;

			// ==============================
			// 【处理 气场爆发 / 究极爆发】
			// ==============================
			if (pokemon.canUltraBurst) {
				const item = pokemon.getItem();

				// --- 气场爆发逻辑 ---
				if ((item as any).auraBurst && (item as any).auraBurst === speciesid) {
					pokemon.side.zMoveUsed = true; // 消耗Z招式机会
					
					pokemon.formeChange(speciesid, item, true);
					// 使用 pokemon.battle 替代 this.battle 解决报错
					pokemon.battle.add('-burst', pokemon, (item as any).auraBurstSpecies, item.name);
					
					if ((item as any).auraCondition) {
						pokemon.addVolatile((item as any).auraCondition);
					}

					for (const ally of pokemon.side.pokemon) {
						ally.canUltraBurst = null;
					}
					return true;
				}

				// --- 原版奈克洛兹玛爆发逻辑 ---
				if (speciesid === 'Necrozma-Ultra') {
					pokemon.formeChange(speciesid, item, true);
					pokemon.battle.add('-burst', pokemon, pokemon.baseSpecies.name, item.name);
					
					for (const ally of pokemon.side.pokemon) {
						ally.canUltraBurst = null;
					}
					return true;
				}
				return false;
			}

			// ==============================
			// 【处理 常规 Mega 进化】
			// ==============================
			const standardMega = pokemon.battle.dex.species.get(speciesid);
			let targetSpecies = standardMega;
			if (pokemon.species.name.endsWith('-Fantasy')) {
				const fantasyMega = pokemon.battle.dex.species.get(standardMega.id + '-fantasy');
				if (fantasyMega.exists) targetSpecies = fantasyMega;
			}

			if (pokemon.battle.ruleTable.isBanned('megarayquazaclause') && targetSpecies.id === 'rayquazamega') {
				pokemon.battle.runEvent('Cant', pokemon, null, null, 'mega');
				return false;
			}

			const prevHp = pokemon.hp;
			const prevMaxHp = pokemon.maxhp;

			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);

			let newMaxHp = 1; 
			if (targetSpecies.baseStats.hp !== 1) {
				newMaxHp = Math.floor(
					Math.floor(
						2 * targetSpecies.baseStats.hp + pokemon.set.ivs.hp + Math.floor(pokemon.set.evs.hp / 4) + 100
					) * pokemon.level / 100
				) + 10;
			}

			if (newMaxHp !== prevMaxHp) {
				pokemon.baseMaxhp = newMaxHp;
				pokemon.maxhp = newMaxHp;
				pokemon.hp = pokemon.maxhp - (prevMaxHp - prevHp);

				if (pokemon.hp <= 0) pokemon.hp = 1;
				if (pokemon.hp > pokemon.maxhp) pokemon.hp = pokemon.maxhp;

				pokemon.battle.add('-heal', pokemon, pokemon.getHealth, '[silent]');
			}

			pokemon.battle.add('-ability', pokemon, pokemon.getAbility().name, '[from] Mega Evolution');

			for (const ally of pokemon.side.pokemon) {
				ally.canMegaEvo = null;
			}

			pokemon.battle.runEvent('AfterMega', pokemon);
			return true;
		},

		// 保持原样不变的 canMegaEvo
		canMegaEvo(pokemon) {
			const species = pokemon.baseSpecies;
			const item = pokemon.getItem();

			const altFormes = species.otherFormes || (species.baseSpecies && pokemon.battle.dex.species.get(species.baseSpecies).otherFormes);
			if (altFormes) {
				for (const formeName of altFormes) {
					const forme = pokemon.battle.dex.species.get(formeName);
					if (forme.isMega && forme.requiredMove &&
						pokemon.baseMoves.includes(pokemon.battle.toID(forme.requiredMove)) && !item.zMove) {
						if (forme.requiredForme && species.name !== forme.requiredForme) {
							continue;
						}
						return forme.name;
					}
				}
			}

			if (Array.isArray(item.megaEvolves)) {
				const index = item.megaEvolves.indexOf(species.name);
				if (index >= 0) {
					if (Array.isArray(item.megaStone)) {
						return item.megaStone[index];
					}
				}
				return null;
			}

			if (item.megaEvolves === species.name) {
				return item.megaStone as string;
			}

			return null;
		},
	},
};