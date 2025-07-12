import { FormatsData } from './formats-data';

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
	// 添加 actions 属性来覆盖对战行为
	actions: {
		switchIn(pokemon: Pokemon, pos: number, source?: Effect | null, isDrag?: boolean) {
			// 首先，我们必须执行原始的 switchIn 逻辑。
			// 我们在原型链上找到它，就像我们对 runMegaEvo 所做的那样。
			// @ts-ignore
			const baseImplementation = this.battle.actions.__proto__?.switchIn;
			if (!baseImplementation) {
				this.battle.debug("错误：找不到基础 switchIn 实现。");
				return false;
			}

			// 调用原始函数并储存其结果
			const result = baseImplementation.call(this, pokemon, pos, source, isDrag);

			// 现在，在原始逻辑运行之后，我们添加我们的修复。
			// 检查刚刚上场的宝可梦是否是我们的自定义 Mega 形态。
			if (pokemon.species.isMega && pokemon.species.name.endsWith('-Fantasy')) {
				// 宝可梦的特性名已经是正确的了，但它的效果可能处于“休眠”状态。
				// 我们再次调用 setAbility 来“唤醒”这些效果。
				// 第三个参数 'true' 可以防止“（宝可梦）的特性是（xxx）！”这类信息重复显示在对战日志中。
				pokemon.setAbility(pokemon.getAbility(), null, true);
			}

			// 返回原始调用的结果
			return result;
		},

		// 覆盖 runMegaEvo 方法
		runMegaEvo(pokemon: Pokemon) {
			const speciesid = pokemon.species.id;
			const item = pokemon.getItem();

			// --- 通用 Mega Fantasy 逻辑 ---
			// 检查宝可梦 ID 是否以 'fantasy' 结尾
			if (speciesid.endsWith('fantasy')) {
				// 推导潜在的 Mega Fantasy ID
				// 例如: 'garchompfantasy' -> 'garchomp-mega-fantasy'
				const baseName = speciesid.substring(0, speciesid.length - 'fantasy'.length);
				const potentialMegaFantasyId = `${baseName}-mega-fantasy`;
				const megaFantasySpecies = this.dex.species.get(potentialMegaFantasyId);

				// 检查：Mega Fantasy 形态是否存在、是否是 Mega 形态、宝可梦能否进化、
				// 且携带的道具是否与 Mega Fantasy 形态要求的道具匹配
				if (
					megaFantasySpecies?.exists &&
					megaFantasySpecies.isMega &&
					pokemon.canMegaEvo &&
					item.id === megaFantasySpecies.requiredItem?.toLowerCase() // 直接检查 requiredItem
				) {
					// 执行向 Mega Fantasy 形态的 Mega 进化
					pokemon.formeChange(megaFantasySpecies, item, true);
					const newAbility = megaFantasySpecies.abilities[0];
					pokemon.baseAbility = newAbility as ID;
					pokemon.setAbility(newAbility);
					this.battle.singleEvent('Start', this.dex.abilities.get(newAbility), {}, pokemon);
					this.battle.add('-mega', pokemon.fullname, megaFantasySpecies.name, item.name);
					this.battle.add('-ability', pokemon, newAbility);
					pokemon.canMegaEvo = null; // 标记为已 Mega 进化
					this.battle.runEvent('AfterMega', pokemon);
					return true; // Mega 进化成功
				}
				// 如果特定的 Fantasy Mega 条件不满足，则会继续执行下面的基础逻辑。
			}

			// --- 回退到基础 Mega 进化逻辑 ---
			// 如果不是 Fantasy 宝可梦，或者特定的 Fantasy Mega 条件失败，
			// 则尝试运行原始/基础的 Mega 进化逻辑。
			// 警告：根据 PS 模组的继承处理方式，此调用可能需要调整。
			// @ts-ignore - 假设基础调用有效
			const baseImplementation = this.battle.actions.__proto__?.runMegaEvo;
			if (baseImplementation) {
				// 调用找到的基础实现
				return baseImplementation.call(this, pokemon);
			} else {
				// 如果找不到基础实现，记录错误并可能执行简化的后备逻辑
				console.error("无法找到基础 runMegaEvo 实现以供回退。 ");
				// 你可以在这里复制粘贴基础 runMegaEvo 的核心逻辑作为最终后备，
				// 但为了简洁，我们先返回 false。
				// 简化的基础检查示例（可能遗漏边缘情况）：
				const M = item.megaStone ? this.dex.species.get(item.megaStone) : null;
				if (M?.exists && M.isMega && pokemon.canMegaEvo && item.megaEvolves === pokemon.baseSpecies.name) {
					pokemon.formeChange(M, item, true);
					this.battle.add('-mega', pokemon.fullname, M.name, item.name);
					pokemon.canMegaEvo = null;
					this.battle.runEvent('AfterMega', pokemon);
					return true;
				}
				return false; // 如果没有逻辑执行，则默认失败
			}
		},
	},
};
