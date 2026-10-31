import { EASY_IV_LIMIT, qualityDescription, qualityFor } from './rogue-quality';
/** Versioned, independent of star rank and permanent training. Missing legacy values mean tier 0. */
export type RogueDifficulty = 'easy' | 0 | 1 | 2 | 3 | 4 | 5;
export const ROGUE_DIFFICULTY_VERSION = 5;
/** Historical version-3 player allowance, used only to read old saves. */
export const ROGUE_PLAYER_DIFFICULTY = { peak: [0, 0.01, 0.03, 0.06, 0.10, 0.15], initialFraction: 0.2 } as const;
export const ROGUE_DIFFICULTIES: readonly RogueDifficulty[] = ['easy', 0, 1, 2, 3, 4, 5];
export interface RogueDifficultyContext { tier: RogueDifficulty; floor: number; card?: boolean; version?: number }
export function isRogueDifficulty(value: unknown): value is RogueDifficulty {
	return ROGUE_DIFFICULTIES.includes(value as RogueDifficulty);
}
export function difficultyLabel(tier: RogueDifficulty = 0) {
	return tier === 'easy' ? '护符庇佑' : `${tier} 档${tier === 0 ? ' · 基础' : ' · 进阶'}`;
}
export function difficultyProgress(floor: number) {
	return Math.max(0, Math.min(1, (floor - 1) / 199)) ** 2;
}
export function difficultyScale(tier: RogueDifficulty = 0, floor = 1, opponent = false, version = ROGUE_DIFFICULTY_VERSION): number {
	const g = difficultyProgress(floor);
	if (tier === 'easy') return opponent ? 0.75 : 0.98 - 0.08 * g;
	if (version >= 4) return 1;
	if (opponent) return version < 2 ? 1 + tier * (0.012 + 0.088 * g) : 1;
	if (version < 3) return 1 + tier * (0.006 + 0.044 * g);
	return 1 + ROGUE_PLAYER_DIFFICULTY.peak[tier] * (ROGUE_PLAYER_DIFFICULTY.initialFraction + 0.8 * g);
}
export const advancedDifficulty = (tier: RogueDifficulty = 0) => tier === 'easy' ? 0 : tier;
/** Resource floor, never an encounter level or a special-evolution permission. */
export function difficultySupplyFloor(_tier: RogueDifficulty = 0, floor = 1) {
	return Math.min(200, floor);
}
/** All current tiers share the baseline resource schedule and quantities. */
export function difficultyRewardScale(_tier: RogueDifficulty = 0, _floor = 1) {
	return 1;
}
export function difficultyRewardDescription(tier: RogueDifficulty = 0) {
	return qualityDescription(tier) + '金币、糖果、幻想碎片和商店解锁进度不因档位额外提高。';
}
export function difficultyCardScale(tier: RogueDifficulty = 0, version = ROGUE_DIFFICULTY_VERSION) {
	return tier === 'easy' ? 0.9 : version < 4 ? 1 + tier * 0.02 : 1;
}
export function memberDifficultyScale(context?: RogueDifficultyContext) {
	return !context ? 1 : context.card ? difficultyCardScale(context.tier, context.version) : difficultyScale(context.tier, context.floor, false, context.version);
}
export function difficultyIVs(ivs: StatsTable, tier: RogueDifficulty = 0, floor = 1, version = ROGUE_DIFFICULTY_VERSION): StatsTable {
	if (version >= 4) return Object.fromEntries(Object.entries(ivs).map(([stat, value]) =>
		[stat, tier === 'easy' ? Math.min(value, EASY_IV_LIMIT) : value])) as StatsTable;
	const delta = tier === 'easy' ? 0 : Math.round(11 * tier / 5 * (0.5 + 0.5 * difficultyProgress(floor)));
	return Object.fromEntries(Object.entries(ivs).map(([stat, value]) => [stat,
		tier === 'easy' ? Math.min(value, 10) : value === 0 ? 0 : Math.min(31, value + delta),
	])) as StatsTable;
}
export const CHARM_DESCRIPTION = '本局为新手简易档。敌方六项能力整局固定为原本的 75%（降低 25%），不随楼层改变；我方六项能力由第 1 层的 98% 逐渐降至第 200 层的 90%。遇到的宝可梦个体值约 10，六项独立随机，不会遇到任何单项个体值超过 15 的宝可梦；本局伙伴、首领与个体值培养也以 15 为上限。保留物种、闪光与图鉴收集，不获得局外点数，也不积累初始伙伴的资质、性格、特性和招式配置。通关解锁简易档塔灵，通关卡标记“护符庇佑”，不解锁进阶档位。';
export function difficultyDescription(tier: RogueDifficulty) {
	if (tier === 'easy') return CHARM_DESCRIPTION;
	if (!tier) return qualityDescription(tier) + '通关 200 层解锁本档塔灵；完成本档故事并曾通关本档后，解锁 1 档。';
	return qualityDescription(tier) + `开局自选 ${tier * 2} 条幻想崩坏，整局锁定。` +
		`本档不额外提升我方能力或通关卡倍率，成果来自捕捉与培养。通关 200 层解锁本档塔灵。${tier < 5 ? `完成本档故事并曾通关本档后，解锁 ${tier + 1} 档。` : ''}`;
}

/** Concise menu copy; the expandable detail retains precise capture probabilities. */
export function difficultyMenuDescription(tier: RogueDifficulty) {
 if (tier === 'easy') return CHARM_DESCRIPTION;
 const quality = qualityFor(tier);
 return `野生伙伴个体值约 **${quality.wild}**，精英${tier === 5 ? '**绝大多数单项为 31**' : `约 **${quality.elite}**`}。` +
  (tier ? `稀有伙伴与隐藏特性更易遇见。开局自选 **${tier * 2} 条幻想崩坏**，本局敌人获得对应强化；我方**没有额外能力加成**。` :
   '稀有伙伴较少，适合熟悉队伍培养与路线选择。');
}
