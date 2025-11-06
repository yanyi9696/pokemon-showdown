// (!!!) 关键修复：导入基础的对战行动 (BattleActions) 和 宝可梦类型 (Pokemon)
import { BattleActions } from '../../../sim/battle-actions';
import { Pokemon } from '../../../sim/pokemon';

export const Scripts: ModdedBattleScriptsData = {
	gen: 9,

	// 关键：保留你原来正确的 init 函数
	init() {
		for (const id in this.data.FormatsData) {
			if (this.data.FormatsData[id].isNonstandard === 'Past') delete this.data.FormatsData[id].isNonstandard;
			if (this.data.FormatsData[id].natDexTier) {
				this.data.FormatsData[id].tier = this.data.FormatsData[id].natDexTier;
			}
		}
	},

	// (!!!) 关键修复：
	// 在顶层定义 'actions' 对象
	// 这是PS用来合并模组战斗逻辑的正确方式
	actions: {
		// (!!!) 关键修复：
		// 导入并继承所有原始的对战逻辑 (BattleActions)
		// 这样你就不会丢失 runUltraBurst, terastallize, runMove 等关键功能
		...BattleActions,

		// 你自定义的 runMegaEvo 逻辑将覆盖上面的默认版本
		// (!!!) 关键修复：为 'pokemon' 参数添加 'Pokemon' 类型
		runMegaEvo(pokemon: Pokemon) {
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

			// 现在所有 Mega 进化都会显示特性动画
			this.battle.add('-start', pokemon, 'ability: ' + pokemon.getAbility().name);
			this.battle.add('-ability', pokemon, pokemon.getAbility().name, '[from] ability: ' + pokemon.getAbility().name, '[silent]');

			const side = pokemon.side;
			for (const ally of side.pokemon) {
				ally.canMegaEvo = null;
			}

			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},
	},
};