import { Dex } from './dex';

/** Type-chart weaknesses only; abilities and held items are independent damage modifiers. */
export function weaknessProfile(types: readonly string[], dex = Dex.mod('gen9fantasy')) {
	const matchup = [...new Set(types)];
	let points = 0;
	let quadruple = 0;
	for (const type of dex.types.names()) {
		if (!dex.getImmunity(type, matchup)) continue;
		const effectiveness = dex.getEffectiveness(type, matchup);
		if (effectiveness <= 0) continue;
		points += effectiveness;
		if (effectiveness >= 2) quadruple++;
	}
	return { points, quadruple };
}

/** Reduce only the super-effective bonus, never neutral/resisted or fixed damage. */
export function weaknessDamageFactor(typeMod: number, points: number) {
	if (typeMod <= 0) return 1;
	const original = 2 ** typeMod;
	const remaining = Math.max(0, 10 - points) / 10;
	return (1 + (original - 1) * remaining) / original;
}
