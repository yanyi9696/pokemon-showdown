import { randomInt } from 'crypto';
import { Dex } from '../../sim/dex';
import { RogueBiomes, type RogueBiome } from './biome-data';
import { biomeTier, isMajorLegendary, MajorLegendaryPool, pickBiomeSlot, unlistedFamilies, weightedPick,
	type RogueRandom } from './biome-pools';
import { makeEncounterSet } from './encounter-sets';
import { wildStageAtLevel } from './evolution';
import type { RogueEncounter, RogueNode } from './types';

export type WildEvolutionResolver = (
	name: string, level: number, biome: RogueBiome, tier: number, random: RogueRandom
) => string;

/** Called only inside the save transaction when a floor's routes are first created. */
export function createBiomeRoutes(
	floor: number, templates: RogueNode[], evolve: WildEvolutionResolver = wildStageAtLevel, random: RogueRandom = randomInt
): RogueNode[] {
	const extraPool = unlistedFamilies();
	return templates.map(template => {
		if (template.kind !== 'wild' && template.kind !== 'elite') return structuredClone(template);
		const elite = template.kind === 'elite';
		const biome = weightedPick(RogueBiomes, random);
		const tier = biomeTier(floor, elite);
		const level = Math.min(100, Math.max(3, Math.ceil(floor / 2)) + (elite ? 5 : 0));
		const majorBranch = elite && floor >= 161;
		const encounter = (bonus = false): RogueEncounter => {
			let name: string;
			if (bonus) {
				name = extraPool[random(extraPool.length)];
			} else if (majorBranch && random(2) === 0) {
				name = MajorLegendaryPool[random(MajorLegendaryPool.length)];
			} else {
				// Keep the endgame elite split exactly 50/50, including species also named in regional pools.
				const slots = majorBranch ? biome.tiers[tier].map(slot => ({
					...slot, species: slot.species.filter(species => !isMajorLegendary(species)),
				})).filter(slot => slot.species.length) : biome.tiers[tier];
				name = pickBiomeSlot(slots, random);
			}
			name = evolve(name, level, biome, tier, random);
			const set = makeEncounterSet(name, level, elite ? 31 : 15);
			const species = Dex.mod('gen9').species.get(name);
			set.gender = species.gender || (random(256) < species.genderRatio.F * 256 ? 'F' : 'M');
			return {
				name: bonus ? '额外野生宝可梦' : elite ? '区域精英' : '野生宝可梦',
				team: [set], style: elite ? 'aggressive' : 'balanced', catchable: true,
				...(bonus ? { bonus: true } : {}),
			};
		};
		const encounters = Array.from({ length: elite ? 1 : 3 }, () => encounter());
		if (!elite && extraPool.length && random(100) === 0) encounters.push(encounter(true));
		return {
			...structuredClone(template), name: elite ? `${biome.name} · 精英` : biome.name,
			biome: { id: biome.id, name: biome.name, tier, level }, encounters,
		};
	});
}
