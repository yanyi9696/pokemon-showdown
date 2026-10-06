import { randomInt } from 'crypto';
import { Dex } from '../../sim/dex';
import { RogueBiomes, type RogueBiomeSlot } from './biome-data';

export type RogueRandom = (max: number) => number;
const dex = Dex.mod('gen9');

export function weightedPick<T extends { weight: number }>(entries: readonly T[], random: RogueRandom = randomInt): T {
	const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
	if (!entries.length || entries.some(entry => !Number.isInteger(entry.weight) || entry.weight <= 0)) {
		throw new Error('肉鸽随机池的权重或内容无效。');
	}
	let roll = random(total);
	if (!Number.isInteger(roll) || roll < 0 || roll >= total) throw new Error('肉鸽随机结果越界。');
	for (const entry of entries) {
		roll -= entry.weight;
		if (roll < 0) return entry;
	}
	throw new Error('肉鸽随机池为空。');
}

export function biomeTier(floor: number, elite = false) {
	return Math.min(4, Math.max(0, Math.floor((floor - 1) / 40)) + (elite ? 1 : 0));
}

/** A slash/form group occupies one 6/4/2-percent slot, shared equally by its alternatives. */
export function pickBiomeSlot(slots: readonly RogueBiomeSlot[], random: RogueRandom = randomInt) {
	const slot = weightedPick(slots, random);
	return slot.species[random(slot.species.length)];
}

export function validateBiomePools() {
	if (RogueBiomes.length !== 14) throw new Error('肉鸽必须配置完整的 14 个区域。');
	for (const biome of RogueBiomes) {
		if (biome.tiers.length !== 5) throw new Error(`${biome.name} 必须配置五档宝可梦池。`);
		for (const [tier, slots] of biome.tiers.entries()) {
			if (slots.length !== 20 || [6, 4, 2].some((weight, i) =>
				slots.filter(slot => slot.weight === weight).length !== [12, 6, 2][i])) {
				throw new Error(`${biome.name} 第 ${tier + 1} 档需要高 12 / 中 6 / 低 2，共 20 格。`);
			}
			for (const slot of slots) {
				if (!slot.species.length || slot.species.some(name => !dex.species.get(name).exists)) {
					throw new Error(`${biome.name} 的物种不存在。`);
				}
			}
		}
	}
}

/** Regigigas is explicitly classed as 一级神 in the user's regional document. */
export function isMajorLegendary(name: string) {
	const species = dex.species.get(name);
	return species.tags.includes('Restricted Legendary') || species.baseSpecies === 'Regigigas';
}

/** One slot per species, without Mega/fusion/temporary forms or unevolved Cosmog/Cosmoem. */
export const MajorLegendaryPool = dex.species.all().filter(species => !species.forme &&
	isMajorLegendary(species.name) && !species.evos.length).map(species => species.name);

/** Regional variants and every stage share a family, even when only an evolved form was listed. */
function familyNumbers() {
	const parents = new Map<number, number>();
	const root = (num: number): number => parents.has(num) ? root(parents.get(num)!) : num;
	for (const species of dex.species.all()) {
		if (species.num <= 0 || !species.prevo) continue;
		const a = root(species.num);
		const b = root(dex.species.get(species.prevo).num);
		if (a !== b) parents.set(a, b);
	}
	// Showdown omits this GO-only evolution from its battle dex.
	parents.set(root(dex.species.get('Melmetal').num), root(dex.species.get('Meltan').num));
	return root;
}

let extraFamilies: string[] | undefined;
export function unlistedFamilies() {
	if (extraFamilies) return [...extraFamilies];
	const family = familyNumbers();
	const mentioned = new Set<number>();
	for (const biome of RogueBiomes) {
		for (const slot of biome.tiers.flat()) {
			for (const name of slot.species) mentioned.add(family(dex.species.get(name).num));
		}
	}
	const majorFamilies = new Set(dex.species.all().filter(species => isMajorLegendary(species.name))
		.map(species => family(species.num)));
	extraFamilies = dex.species.all().filter(species => species.num > 0 && !species.forme && !species.prevo &&
		(!species.isNonstandard || species.isNonstandard === 'Past') &&
		!mentioned.has(family(species.num)) && !majorFamilies.has(family(species.num))).map(species => species.name);
	return [...extraFamilies];
}
