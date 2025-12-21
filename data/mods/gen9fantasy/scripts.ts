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

	// 核心修复：将 pokemon 块强制断言为 any，从而允许重写底层的 start 方法
	// 这样既解决了 ts(2353) 报错，也能确保逻辑不被化学变化气体拦截
	pokemon: {
		start() {
			const p = this as any; // 修复属性访问报错

			// 逻辑 A：一击流武道熊师 (Ren Zhen Ou Da)
			if (p.species.id === 'urshifufantasy' && p.hasMove('renzhenouda') && !p.transformed) {
				p.battle.add('-activate', p, 'move: Ren Zhen Ou Da');
				p.formeChange('urshifumegafantasy', p.battle.dex.moves.get('renzhenouda'), true);
				p.battle.add('-mega', p, 'Urshifu-Mega-Fantasy', '');
				p.battle.add('-message', `${p.name} 领悟了拳法的极意，自发进行了超巨进化！`);
			}

			// 逻辑 B：连击流武道熊师 (Yi Shun Qian Ji)
			if (p.species.id === 'urshifurapidstrikefantasy' && p.hasMove('yishunqianji') && !p.transformed) {
				p.battle.add('-activate', p, 'move: Yi Shun Qian Ji');
				p.formeChange('urshifurapidstrikemegafantasy', p.battle.dex.moves.get('yishunqianji'), true);
				p.battle.add('-mega', p, 'Urshifu-Rapid-Strike-Mega-Fantasy', '');
				p.battle.add('-message', `${p.name} 领悟了拳法的极意，自发进行了超巨进化！`);
			}

			// 关键：由于我们是重写(Override)了 start 方法，最后必须调用基类的逻辑
			// 在 Mod 脚本中，直接调用 runEvent('Start') 来触发后续的特性逻辑
			p.battle.runEvent('Start', p);
		}
	} as any, // <--- 这里的 as any 彻底解决了 "start 不在类型中" 的报错
	
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