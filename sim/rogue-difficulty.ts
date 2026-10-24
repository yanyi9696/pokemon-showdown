/** Versioned, independent of star rank and permanent training. Missing legacy values mean tier 0. */
export type RogueDifficulty = 'easy' | 0 | 1 | 2 | 3 | 4 | 5;
export const ROGUE_DIFFICULTY_VERSION = 1;
export const ROGUE_DIFFICULTIES: readonly RogueDifficulty[] = ['easy', 0, 1, 2, 3, 4, 5];
export interface RogueDifficultyContext { tier: RogueDifficulty; floor: number; card?: boolean }
export function isRogueDifficulty(value: unknown): value is RogueDifficulty {
	return ROGUE_DIFFICULTIES.includes(value as RogueDifficulty);
}
export function difficultyLabel(tier: RogueDifficulty = 0) {
	return tier === 'easy' ? '护符庇佑' : `${tier} 档${tier === 0 ? ' · 基础' : ' · 进阶'}`;
}
export function difficultyProgress(floor: number) {
	return Math.max(0, Math.min(1, (floor - 1) / 199)) ** 2;
}
export function difficultyScale(tier: RogueDifficulty = 0, floor = 1, opponent = false): number {
	const g = difficultyProgress(floor);
	if (tier === 'easy') return opponent ? 0.95 - 0.30 * g : 0.98 - 0.08 * g;
	return 1 + tier * (opponent ? 0.012 + 0.088 * g : 0.006 + 0.044 * g);
}
export const advancedDifficulty = (tier: RogueDifficulty = 0) => tier === 'easy' ? 0 : tier;
/** Resource floor, never an encounter level or a special-evolution permission. */
export function difficultySupplyFloor(tier: RogueDifficulty = 0, floor = 1) {
	return Math.min(200, floor + 4 * advancedDifficulty(tier));
}
/** Ordinary coins/candy budgets: +3–5% per tier, with a smooth late-game increase. */
export function difficultyRewardScale(tier: RogueDifficulty = 0, floor = 1) {
	return 1 + advancedDifficulty(tier) * (0.03 + 0.02 * Math.max(0, Math.min(1, (floor - 1) / 199)));
}
export function difficultyRewardDescription(tier: RogueDifficulty = 0) {
	const d = advancedDifficulty(tier);
	return d ? `常规金币、战利品与糖果收益约 +${d * 3}%～${d * 5}%；商店常规培养补给提前最多 ${d * 4} 层。` +
		`第 20～160 层道馆首胜额外获得幻想碎片 ×${d * 2}；碎片奖励选项提前 ${d * 3} 层，数量与阶段上限 +${d * 4}%。` +
		'祝福品质、永久培养上限与特殊进化解锁条件保持原有规则。' : '';
}
export function difficultyCardScale(tier: RogueDifficulty = 0) {
	return tier === 'easy' ? 0.9 : 1 + tier * 0.02;
}
export function memberDifficultyScale(context?: RogueDifficultyContext) {
	return !context ? 1 : context.card ? difficultyCardScale(context.tier) : difficultyScale(context.tier, context.floor);
}
export function difficultyIVs(ivs: StatsTable, tier: RogueDifficulty = 0, floor = 1): StatsTable {
	const delta = tier === 'easy' ? 0 : Math.round(11 * tier / 5 * (0.5 + 0.5 * difficultyProgress(floor)));
	return Object.fromEntries(Object.entries(ivs).map(([stat, value]) => [stat,
		tier === 'easy' ? Math.min(value, 10) : value === 0 ? 0 : Math.min(31, value + delta),
	])) as StatsTable;
}
export const CHARM_DESCRIPTION = '本局为新手简易档。双方六项能力随楼层降低，对手降幅更大；我方由 98% 降至 90%，敌方由 95% 降至 65%。本局所有伙伴与对手的个体值上限为 10。保留物种、闪光与图鉴收集，不获得局外点数，也不积累初始伙伴的资质、性格、特性和招式配置。通关解锁简易档塔灵，通关卡标记“护符庇佑”，不解锁进阶档位。';
export function difficultyDescription(tier: RogueDifficulty) {
	if (tier === 'easy') return CHARM_DESCRIPTION;
	if (!tier) return '标准爬塔规则。首次通关 200 层后解锁 1 档和本档塔灵模式。';
	return `双方能力随楼层提高，对手提升更多；培养补给更充足、幻想碎片更早集齐，高层伙伴资质与通关卡能力小幅提高。首次通关 200 层后${tier < 5 ? `解锁 ${tier + 1} 档和` : '解锁'}本档塔灵模式。`;
}
