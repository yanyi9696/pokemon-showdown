import type { RogueDifficulty } from './rogue-difficulty';

/** Capture rewards, independent from battle multipliers. Tier 3 is the old ecology. */
export const ROGUE_QUALITY = [
	{ wild: 15, elite: 18, medium: 0.45, rare: 0.25, legendary: 0.30 },
	{ wild: 17, elite: 21, medium: 0.60, rare: 0.45, legendary: 0.50 },
	{ wild: 20, elite: 24, medium: 0.80, rare: 0.70, legendary: 0.75 },
	{ wild: 23, elite: 27, medium: 1, rare: 1, legendary: 1 },
	{ wild: 26, elite: 29, medium: 1.15, rare: 1.25, legendary: 1.20 },
	{ wild: 28, elite: 31, medium: 1.30, rare: 1.50, legendary: 1.40 },
] as const;
export const EASY_IV_LIMIT = 15;
export const INITIAL_PARTNER_IV = 15;
/** Percentage chances, conditional on the species having a hidden ability. */
export const ROGUE_HIDDEN_ABILITY = { wild: [1, 2, 4, 6, 9, 12], elite: [3, 6, 10, 15, 22, 30] } as const;
export const hiddenAbilityChance = (tier: RogueDifficulty = 0, elite = false) =>
	ROGUE_HIDDEN_ABILITY[elite ? 'elite' : 'wild'][tier === 'easy' ? 0 : tier];
export function qualityFor(tier: RogueDifficulty = 0) { return ROGUE_QUALITY[tier === 'easy' ? 0 : tier]; }

/** Independent stat rolls. Nonzero tails retain 0 and 31 outside charm mode. */
export function encounterIVWeights(tier: RogueDifficulty = 0, elite = false): number[] {
	if (tier === 5 && elite) return Array.from({ length: 32 }, (_, iv) =>
		iv === 31 ? 252000 : iv === 30 ? 22400 : iv === 29 ? 4200 : iv === 28 ? 108 : 46);
	const mean = tier === 'easy' ? 10 : qualityFor(tier)[elite ? 'elite' : 'wild'];
	return Array.from({ length: tier === 'easy' ? EASY_IV_LIMIT + 1 : 32 }, (_, iv) =>
		Math.max(1, Math.round(100000 * Math.exp(-0.5 * ((iv - mean) / 1.8) ** 2))));
}
export function rollEncounterIVs(random: (max: number) => number, tier: RogueDifficulty = 0, elite = false): StatsTable {
	const weights = encounterIVWeights(tier, elite), total = weights.reduce((a, b) => a + b, 0);
	const roll = () => {
		let n = random(total);
		return weights.findIndex(weight => (n -= weight) < 0);
	};
	return { hp: roll(), atk: roll(), def: roll(), spa: roll(), spd: roll(), spe: roll() };
}
export function qualityDescription(tier: RogueDifficulty = 0) {
	if (tier === 'easy') return '遇到的宝可梦个体值约 10，六项独立随机，任何一项均不超过 15。';
	const p = qualityFor(tier);
	return `普通野生伙伴个体值约 ${p.wild}，区域精英${tier === 5 ? '绝大多数单项为 31' : `约 ${p.elite}`}；` +
		'六项独立随机，最高可达 31。' +
		`有隐藏特性的物种，普通野生／区域精英出现隐藏特性的概率为 ${hiddenAbilityChance(tier)}%／${hiddenAbilityChance(tier, true)}%。` +
		(tier < 3 ? '稀有物种与传说伙伴较少，随档位提高而更易遇见。' :
			tier === 3 ? '有更多机会遇见稀有物种与传说伙伴。' : '稀有物种与传说伙伴出现得更加频繁。');
}
