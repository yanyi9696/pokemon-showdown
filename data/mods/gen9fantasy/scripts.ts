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

			// 招式进化逻辑 (类似 Mega 裂空座)
			const altFormes = species.otherFormes || (species.baseSpecies && this.dex.species.get(species.baseSpecies).otherFormes);
			if (altFormes) {
				for (const formeName of altFormes) {
					const forme = this.dex.species.get(formeName);
					if (forme.isMega && forme.requiredMove &&
						pokemon.baseMoves.includes(this.battle.toID(forme.requiredMove)) && !item.zMove) {
						if (forme.requiredForme && species.name !== forme.requiredForme) {
							continue;
						}
						return forme.name;
					}
				}
			}

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

			// ==========================================
			// 【新增】第 1 步：记录变身前的 HP 数据
			// ==========================================
			const prevHp = pokemon.hp;
			const prevMaxHp = pokemon.maxhp;

			// 执行变身
			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);

			// ==========================================
			// 【新增】第 2 步：计算变身后的真实最大 HP
			// ==========================================
			let newMaxHp = 1; // 兼容类似脱壳忍者（HP固定为1）的情况
			if (targetSpecies.baseStats.hp !== 1) {
				// 套用 Showdown 底层的 HP 计算公式，结合了当前的 IV、EV 和等级
				newMaxHp = Math.floor(
					Math.floor(
						2 * targetSpecies.baseStats.hp + pokemon.set.ivs.hp + Math.floor(pokemon.set.evs.hp / 4) + 100
					) * pokemon.level / 100
				) + 10;
			}

			// ==========================================
			// 【新增】第 3 步：如果 HP 上限变了，刷新当前的 HP 状态
			// ==========================================
			if (newMaxHp !== prevMaxHp) {
				pokemon.baseMaxhp = newMaxHp;
				pokemon.maxhp = newMaxHp;

				// 核心需求：保持损失的HP与改变形态前一致
				// 推导公式：新的当前HP = 新的最大HP - (旧的最大HP - 旧的当前HP)
				pokemon.hp = pokemon.maxhp - (prevMaxHp - prevHp);

				// 容错处理：确保血量既不会因为奇葩机制变负，也不会超过最大值
				if (pokemon.hp <= 0) pokemon.hp = 1;
				if (pokemon.hp > pokemon.maxhp) pokemon.hp = pokemon.maxhp;

				// 向客户端发送静默加血/扣血指令，用于刷新前端血条视觉
				this.battle.add('-heal', pokemon, pokemon.getHealth, '[silent]');
			}
			// ==========================================

			// 发送特性变更动画和 Mega 进化提示语
			this.battle.add('-ability', pokemon, pokemon.getAbility().name, '[from] Mega Evolution');

			for (const ally of pokemon.side.pokemon) {
				ally.canMegaEvo = null;
			}

			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},
	},
};