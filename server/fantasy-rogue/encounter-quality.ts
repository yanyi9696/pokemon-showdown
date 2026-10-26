import { Dex } from '../../sim/dex';
import { qualityFor } from '../../sim/rogue-quality';
import { pickBiomeSlot, weightedPick, type RogueRandom } from './biome-pools';
import type { RogueBiomeSlot } from './biome-data';
import type { RogueRun } from './types';

type QualityRun = Pick<RogueRun, 'difficulty' | 'difficultyRulesVersion'>;
export const qualityTier = (run: QualityRun) => (run.difficultyRulesVersion || 1) >= 4 ? run.difficulty || 0 : undefined;
export const rareEncounterScale = (run?: QualityRun) => run && qualityTier(run) !== undefined ? qualityFor(run.difficulty).legendary : 1;

/** Uses the same broad rare-family classification as capture unlocks, including Fantasy formes. */
export const rareSpecies = (name: string) => {
	const species = Dex.mod('gen9fantasy').species.get(name);
	const base = Dex.species.get(species.baseSpecies.replace(/-Fantasy$/, ''));
	return [...species.tags, ...base.tags].some(tag =>
		['Restricted Legendary', 'Sub-Legendary', 'Mythical', 'Ultra Beast', 'Paradox'].includes(tag));
};
export function pickQualitySpecies(names: readonly string[], random: RogueRandom, run?: QualityRun): string {
 const scale = rareEncounterScale(run);
 if (scale === 1) return names[random(names.length)];
 return weightedPick(names.map(name => ({ name, weight: Math.round(10000 * (rareSpecies(name) ? scale : 1)) })), random).name;
}
export function pickQualityBiomeSlot(slots: readonly RogueBiomeSlot[], random: RogueRandom, run?: QualityRun, mew = false) {
 if (!run || qualityTier(run) === undefined || run.difficulty === 3) {
  return pickBiomeSlot(mew ? slots.map(slot => ({ ...slot, weight: slot.weight < 6 ? slot.weight * 3 : slot.weight })) : slots, random);
 }
 const p = qualityFor(run.difficulty);
 // Flatten each authored slot, preserving its weight shared equally among its species.
 return weightedPick(slots.flatMap(slot => slot.species.map(name => ({ name,
  weight: Math.max(1, Math.round(100000 * slot.weight / slot.species.length *
   (slot.weight === 4 ? p.medium : slot.weight === 2 ? p.rare : 1) *
   (mew && slot.weight < 6 ? 3 : 1) * (rareSpecies(name) ? p.legendary : 1))),
 }))), random).name;
}
export const legendaryEventScale = (run: QualityRun, id: string) =>
 ['legendarytracks', 'kubfumaster'].includes(id) ? rareEncounterScale(run) : 1;
