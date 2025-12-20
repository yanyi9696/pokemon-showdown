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

	// 1. 使用 as any 强制避开 onStart 的属性检查报错 (ts2353)
	pokemon: {
		onStart(this: any) {
			// 首先执行原始逻辑，确保特性正常触发
			this.battle.pokemonPrototypes.onStart.call(this);

			// 自动变身逻辑：一击流-武道熊师-幻想 + 认真殴打
			if (this.species.id === 'urshifufantasy' && this.hasMove('renzhenouda')) {
				// 添加共鸣消息
				this.battle.add('-message', `${this.name}的斗志与招式“认真殴打”共鸣了！`);
				this.battle.add('-formechange', this, 'Urshifu-Mega-Fantasy', '[msg]');
				this.formeChange('urshifumegafantasy', this.battle.dex.conditions.get('urshifumegafantasy'), true);
				this.battle.add('-start', this, 'typechange', this.getTypes(true).join('/'), '[silent]');
			} 
			// 自动变身逻辑：连击流-武道熊师-幻想 + 一瞬千击
			else if (this.species.id === 'urshifurapidstrikefantasy' && this.hasMove('yishunqianji')) {
				// 添加共鸣消息
				this.battle.add('-message', `${this.name}的斗志与招式“一瞬千击”共鸣了！`);
				this.battle.add('-formechange', this, 'Urshifu-Rapid-Strike-Mega-Fantasy', '[msg]');
				this.formeChange('urshifurapidstrikemegafantasy', this.battle.dex.conditions.get('urshifurapidstrikemegafantasy'), true);
				this.battle.add('-start', this, 'typechange', this.getTypes(true).join('/'), '[silent]');
			}
		},
	} as any,

	actions: {
		// 2. 修复 canMegaEvo 的返回值类型报错 (ts2322)
		canMegaEvo(pokemon) {
			// 自动变身的宝可梦禁止显示 Mega 按钮
			if (pokemon.species.id.startsWith('urshifu')) {
				return null; 
			}
			
			const species = pokemon.baseSpecies;
			const item = pokemon.getItem();

			// 检查是否符合携带进化石的条件
			if (item.megaEvolves === species.name) {
				return (typeof item.megaStone === 'string') ? item.megaStone : null;
			}
			// 处理多态进化石（如喷火龙石 X/Y）
			if (Array.isArray(item.megaEvolves) && item.megaEvolves.includes(species.name)) {
				const index = item.megaEvolves.indexOf(species.name);
				const stone = Array.isArray(item.megaStone) ? item.megaStone[index] : item.megaStone;
				return (typeof stone === 'string') ? stone : null;
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
			// 兼容你的 Fantasy Mega 逻辑
			if (pokemon.species.name.endsWith('-Fantasy')) {
				const fantasyMega = this.dex.species.get(standardMega.id + '-fantasy');
				if (fantasyMega.exists) targetSpecies = fantasyMega;
			}

			if (this.battle.ruleTable.isBanned('megarayquazaclause') && targetSpecies.id === 'rayquazamega') {
				this.battle.runEvent('Cant', pokemon, null, null, 'mega');
				return false;
			}

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