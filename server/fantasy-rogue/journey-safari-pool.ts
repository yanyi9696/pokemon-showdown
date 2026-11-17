import { Dex } from '../../sim/dex';
import type { RogueRandom } from './biome-pools';
import { minimumEvolutionLevel } from './evolution';

const dex = Dex.mod('gen9fantasy');
export const SAFARI_RARE_TAGS = ['Ultra Beast', 'Sub-Legendary', 'Paradox'] as const;
export const safariRare = (name: string) => dex.species.get(name).tags.some(tag =>
	(SAFARI_RARE_TAGS as readonly string[]).includes(tag));
/** Basis points per target; a park fixes three targets once, shared by both players. */
export const safariRareChance = (floor: number) => floor <= 50 ? 0 : floor < 100 ? 25 : floor < 150 ? 50 : 100;
const pools = new Map<number, { ordinary: string[], rare: string[] }>();
export function safariPools(floor: number) {
	const level = Math.max(3, Math.min(100, Math.ceil(floor / 2)));
	if (!pools.has(level)) {
		const eligible = dex.species.all().filter(s => s.exists && s.num > 0 && !s.battleOnly && !s.forme &&
			!s.tags.some(tag => tag === 'Restricted Legendary' || tag === 'Mythical') && minimumEvolutionLevel(s.name) <= level);
		pools.set(level, {
			ordinary: eligible.filter(s => !safariRare(s.name) && !s.tags.some(t => t.includes('Legendary'))).map(s => s.name),
			rare: eligible.filter(s => safariRare(s.name)).map(s => s.name) });
	}
	return pools.get(level)!;
}
export function drawSafariTargets(floor: number, random: RogueRandom) {
	const { ordinary, rare } = safariPools(floor), chance = safariRareChance(floor);
	if (!ordinary.length) throw new Error('狩猎地带暂无合法普通候选。');
	return Array.from({ length: 3 }, () => {
		const pool = chance && rare.length && random(10000) < chance ? rare : ordinary;
		return pool[random(pool.length)];
	});
}
/** A legacy early-floor rare target cannot bypass the new boundary on reload or capture.
 * The replacement is deterministic, consumes no roll and leaves balls/index/rewards untouched. */
export function safariTargets(floor: number, names: readonly string[] = []) {
	if (floor > 50) return [...names];
	return names.map((name, index) => {
		if (!safariRare(name)) return name;
		const pool = safariPools(floor).ordinary;
		let hash = index + floor;
		for (const char of name) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
		return pool[hash % pool.length];
	});
}
