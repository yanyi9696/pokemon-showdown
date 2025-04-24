import { Dex } from '../../../sim/dex'; // 只导入 Dex (命名导出)
import ID from '../../../sim/dex'; // 默认导入 ID
import { Items } from './items'; // 引入你的 Mod 道具定义
// import { ID } from '../../../sim/dex-species'; // 注释掉或删除这行

// 获取你的 Mod 道具 ID 列表
const modItemIDs: ID[] = []; // 明确类型为 ID[]
for (const id in Items) {
	if (!Object.prototype.hasOwnProperty.call(Items, id)) continue;
	modItemIDs.push(Dex.toID(id)); // 使用 Dex.toID 确保是小写 ID 格式
}

// 创建包含 Mod 道具 ID 的 Set
const fantasyItemSet = new Set(modItemIDs);

// 注入到全局 window 对象
// 这段代码理论上会在服务器和客户端都尝试执行
// 在服务器端，window 是 undefined，不会出错
// 在客户端，window 存在，会成功注入
if (typeof window !== 'undefined') {
	// 明确告诉 TypeScript window 上可以有这个属性
	(window as any).Gen9FantasyModItemIDs = fantasyItemSet;
	console.log('[Fantasy Mod] Gen9FantasyModItemIDs injected:', fantasyItemSet); // 添加日志确认注入
}

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
					this.battle.add('-mega', pokemon.fullname, megaFantasySpecies.name, item.name);
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
