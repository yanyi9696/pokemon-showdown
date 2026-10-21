import { randomSpeciesEligible } from './species-eligibility';
import { randomInt } from 'crypto';
import { Dex } from '../../sim/dex';
import { rogueWildLevelBonus } from '../../sim/fantasy-rogue-spirits';
import { RogueBiomes, type RogueBiome } from './biome-data';
import { biomeTier, isMajorLegendary, MajorLegendaryPool, pickBiomeSlot, unlistedFamilies, weightedPick,
	type RogueRandom } from './biome-pools';
import { makeEncounterSet, randomEncounterIVs, randomEncounterAbility } from './encounter-sets';
import { wildStageAtLevel } from './evolution';
import type { RogueEncounter, RogueNode } from './types';
import { cardBiasedSpecies } from './story';

export type WildEvolutionResolver = (
	name: string, level: number, biome: RogueBiome, tier: number, random: RogueRandom
) => string;

/** Called only inside the save transaction when a floor's routes are first created. */
export function createBiomeRoutes(
	floor: number, templates: RogueNode[], evolve: WildEvolutionResolver = wildStageAtLevel,
	random: RogueRandom = randomInt, spirit?: string, card?: string, attractedLegends: string[] = [],
	history: { id: string, floor: number }[] = []
): RogueNode[] {
	const allExtras = unlistedFamilies();
	const blocked = new Set(history.filter(entry => entry.floor <= floor && floor - entry.floor <= 5).map(entry => entry.id));
	return templates.map(template => {
		if (template.kind !== 'wild' && template.kind !== 'elite') return structuredClone(template);
		const elite = template.kind === 'elite';
		let available = RogueBiomes.filter(biome => !blocked.has(biome.id));
		// Official routes offer at most two ecologies per floor (14 pools cover six floors).
		// Retain compatibility with custom packs that offer more than the finite pool permits.
		if (!available.length) {
			const last = (id: string) => Math.max(-1, ...history.filter(entry => entry.id === id).map(entry => entry.floor));
			const oldest = Math.min(...RogueBiomes.map(biome => last(biome.id)));
			available = RogueBiomes.filter(biome => last(biome.id) === oldest);
		}
		const biome = weightedPick(available, random);
		blocked.add(biome.id);
		const tier = biomeTier(floor, elite);
		const level = Math.min(100, Math.max(3, Math.ceil(floor / 2)) + (elite ? 5 : 0) +
			rogueWildLevelBonus(floor, spirit));
		const extraPool = allExtras.filter(s => randomSpeciesEligible(s, level));
		const attracted = attractedLegends.filter(s => randomSpeciesEligible(s, level));
		const majorBranch = elite && floor >= 161;
		const majorChance = (floor <= 180 ? 25 : 50) + (spirit === 'mew' ? 25 : 0);
		const seen = new Map<string, number>();
		const encounter = (bonus = false): RogueEncounter => {
			const attraction = !bonus && attracted.length && random(100) < (elite ? 12 : 4) ? attracted[random(attracted.length)] : undefined;
			// Draw the legendary branch once; the card only reweights species inside that branch.
			const major = !bonus && majorBranch && random(100) < majorChance;
			const draw = () => {
				let name: string;
				if (attraction) {
					name = attraction;
				} else if (bonus) {
					name = extraPool[random(extraPool.length)];
				} else if (major) {
					name = MajorLegendaryPool[random(MajorLegendaryPool.length)];
				} else {
				// Keep the dedicated legendary probability exact, even for species also in regional pools.
					const slots = biome.tiers[tier].map(slot => ({
						...slot, species: slot.species.filter(species => randomSpeciesEligible(species, level) && (!majorBranch || !isMajorLegendary(species))),
					})).filter(slot => slot.species.length);
					name = pickBiomeSlot(spirit === 'mew' ? slots.map(slot => ({
						...slot, weight: slot.weight < 6 ? slot.weight * 3 : slot.weight,
					})) : slots, random);
				}
				return evolve(name, level, biome, tier, random);
			};
			// Rejection sampling preserves the authored slot/card weights, then discounts repeats.
			let name: string;
			for (let attempt = 0; ; attempt++) {
				name = cardBiasedSpecies(draw, card, random);
				const appearances = seen.get(name) || 0;
				if (!appearances || random(4 ** appearances) === 0 || attempt >= 128) break;
			}
			seen.set(name, (seen.get(name) || 0) + 1);
			const set = makeEncounterSet(name, level, randomEncounterIVs(random, elite));
			set.ability = randomEncounterAbility(name, random, elite);
			const species = Dex.mod('gen9').species.get(name);
			set.gender = species.gender || (random(256) < species.genderRatio.F * 256 ? 'F' : 'M');
			return {
				name: bonus ? '额外野生宝可梦' : elite ? '区域精英' : '野生宝可梦',
				team: [set], style: elite ? 'aggressive' : 'balanced', catchable: true,
				...(bonus ? { bonus: true } : {}),
			};
		};
		const encounters = Array.from({ length: elite ? 1 : 3 }, () => encounter());
		if (!elite && extraPool.length && random(100) < (spirit === 'mew' ? 3 : 1)) encounters.push(encounter(true));
		if (!elite) encounters.splice(0, encounters.length, {
			name: '野生宝可梦群', team: encounters.flatMap(entry => entry.team),
			style: 'balanced', catchable: true, wildPack: { lootRolls: 3 },
		});
		return {
			...structuredClone(template), name: elite ? `${biome.name} · 精英` : biome.name,
			biome: { id: biome.id, name: biome.name, tier, level }, encounters,
		};
	});
}
