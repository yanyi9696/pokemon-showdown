// (!!!) 修复点 1：移除了 'BattleScriptsData' 的导入
import type {Battle} from '../../../sim/battle';
import type {Pokemon} from '../../../sim/pokemon';
import type {BattleActions} from '../../../sim/battle-actions';

// (!!!) 修复点 2：使用 & { onSwitchIn?: ... } 
// 这会告诉 TypeScript 我们的 Scripts 对象也包含 onSwitchIn 属性
// 这将修复 "ts(2353)" 错误
export const Scripts: ModdedBattleScriptsData & {
	onSwitchIn?(this: Battle, pokemon: Pokemon): void;
} = {
	gen: 9,

	// 保留你原来的 init 函数
	init() {
		for (const id in this.data.FormatsData) {
			if (this.data.FormatsData[id].isNonstandard === 'Past') delete this.data.FormatsData[id].isNonstandard;
			if (this.data.FormatsData[id].natDexTier) {
				this.data.FormatsData[id].tier = this.data.FormatsData[id].natDexTier;
			}
		}
	},

	// 这里的代码是完全正确的，不需要修改
	onSwitchIn(this: Battle, pokemon: Pokemon) {
		// 检查宝可梦是否为 -Fantasy 形态
		if (pokemon.species.name.endsWith('-Fantasy')) {
			// 添加 'Fantasy' 状态标识
			this.add('-start', pokemon, 'Fantasy');
		}
	},

	// 这里的代码也是完全正确的
	actions: {
		runMegaEvo(this: BattleActions, pokemon: Pokemon) {
			const speciesid = pokemon.canMegaEvo;
			if (!speciesid) return false;

			const oldIsFantasy = pokemon.species.name.endsWith('-Fantasy');

			const standardMega = this.dex.species.get(speciesid);
			let targetSpecies = standardMega; 

			if (pokemon.species.name.endsWith('-Fantasy')) {
				const fantasyMega = this.dex.species.get(standardMega.id + '-fantasy');
				if (fantasyMega.exists) {
					targetSpecies = fantasyMega;
				}
			}
            
			const newIsFantasy = targetSpecies.name.endsWith('-Fantasy');
			
			if (this.battle.ruleTable.isBanned('megarayquazaclause') && targetSpecies.id === 'rayquazamega') {
				this.battle.runEvent('Cant', pokemon, null, null, 'mega');
				return false;
			}

			pokemon.formeChange(targetSpecies, pokemon.getItem(), true);
			this.battle.add('-mega', pokemon, targetSpecies.baseSpecies, targetSpecies.requiredItem);

			this.battle.add('-start', pokemon, 'ability: '.concat(pokemon.getAbility().name));
			
			// (!!!) 修复点 3：修正了我之前引入的语法错误（移除了多余的 ." ）
			this.battle.add('-ability', pokemon, pokemon.getAbility().name, '[from] ability: ' + pokemon.getAbility().name, '[silent]');

			if (newIsFantasy && !oldIsFantasy) {
				this.battle.add('-start', pokemon, 'Fantasy');
			} else if (!newIsFantasy && oldIsFantasy) {
				this.battle.add('-end', pokemon, 'Fantasy');
			}

			const side = pokemon.side;
			for (const ally of side.pokemon) {
				ally.canMegaEvo = null;
			}

			this.battle.runEvent('AfterMega', pokemon);
			return true;
		},
	},
};