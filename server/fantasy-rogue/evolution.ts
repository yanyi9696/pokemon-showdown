import { Dex } from '../../sim/dex';
import { randomInt } from 'crypto';
import type { RogueBiome } from './biome-data';
import type { RogueRandom } from './biome-pools';

const dex = Dex.mod('gen9');
function generationSpecies(name: string) {
	const base = dex.species.get(name);
	if (base.exists) return base;
	const custom = Dex.mod('gen9fantasy').species.get(name);
	const original = dex.species.get(custom.name.replace(/-Fantasy/g, ''));
	return original.exists ? original : custom;
}

/** Form changes are not extra evolution stages. Preserve regional pre-evolutions. */
export function evolutionParent(name: string): string | undefined {
	const species = generationSpecies(name);
	if (species.prevo) return species.prevo;
	if (species.id === 'melmetal') return 'Meltan';
	if (species.name !== species.baseSpecies) return dex.species.get(species.baseSpecies).prevo || undefined;
	return undefined;
}

export function evolutionChildren(name: string) {
	const species = dex.species.get(name);
	const children = [...species.evos];
	// The document explicitly permits all three Lycanroc branches for wild Rockruff.
	if (species.id === 'rockruff') children.push('Lycanroc-Dusk');
	if (species.id === 'meltan') children.push('Melmetal');
	return children.map(child => dex.species.get(child)).filter(child => child.exists && !child.isMega &&
		!child.battleOnly && !child.forme.endsWith('Gmax'));
}

/** Special-condition evolutions cannot be generated below 30; player evolution has its own rules. */
export function minimumEvolutionLevel(name: string): number {
	const species = generationSpecies(name);
	const parent = evolutionParent(name);
	const form = species.name !== species.baseSpecies ? dex.species.get(species.baseSpecies) : species;
	const special = parent && [species, form].some(entry => entry.evoItem || entry.evoType);
	return Math.max(special ? 30 : 1, species.evoLevel || (parent && form.evoLevel) || 1,
		parent ? minimumEvolutionLevel(parent) : 1);
}

/** A higher-tier encounter cannot spawn an evolved form below its chain's explicit level requirements. */
export function lowerToEligibleStage(name: string, level: number): string {
	let species = dex.species.get(name);
	if (!species.exists) {
		const custom = Dex.mod('gen9fantasy').species.get(name);
		if (!custom.exists) return name;
		const original = dex.species.get(custom.name.replace('-Fantasy', ''));
		if (original.exists) return minimumEvolutionLevel(original.name) > level ? lowerToEligibleStage(original.name, level) : custom.name;
		const parent = evolutionParent(custom.name);
		return parent && minimumEvolutionLevel(custom.name) > level ? lowerToEligibleStage(parent, level) : custom.name;
	}
	while (minimumEvolutionLevel(species.name) > level) {
		const parent = evolutionParent(species.name);
		if (!parent) break;
		species = dex.species.get(parent);
	}
	return species.name;
}

/** Party level gates: keep explicit levels; otherwise allow the next stage after a 15-level gap. */
export function partyEvolutionLevel(name: string): number {
	const species = dex.species.get(name);
	const parent = evolutionParent(name);
	if (!parent) return 1;
	const previous = partyEvolutionLevel(parent);
	return species.evoLevel ? Math.max(previous, species.evoLevel) : Math.max(20, previous + 15);
}

/** First appearance in this biome supplies the anchor for the document's Scyther 20 -> 35 example. */
function wildAppearanceLevel(name: string, biome: RogueBiome): number {
	const species = dex.species.get(name);
	const firstTier = biome.tiers.findIndex(slots => slots.some(slot => slot.species.includes(species.name)));
	const listed = firstTier < 0 ? Infinity : Math.max(1, firstTier * 20, minimumEvolutionLevel(species.name));
	const parent = evolutionParent(name);
	if (!parent) return listed;
	const previous = wildAppearanceLevel(parent, biome);
	const evolved = species.evoLevel ? Math.max(previous, species.evoLevel) : Math.max(20, previous + 15);
	return Math.min(listed, evolved);
}

/** Resolve an authored slot at actual encounter level, retaining all eligible branch choices. */
export function wildStageAtLevel(
	name: string, level: number, biome: RogueBiome, tier: number, random: RogueRandom = randomInt
): string {
	let species = dex.species.get(lowerToEligibleStage(name, level));
	// A too-early evolved slot becomes its own pre-evolution, never a different eligible branch.
	if (species.name !== dex.species.get(name).name) return species.name;
	let previous = wildAppearanceLevel(species.name, biome);
	if (!Number.isFinite(previous)) previous = partyEvolutionLevel(species.name);
	const explicitlyListed = new Set(biome.tiers[tier].flatMap(slot => slot.species));
	for (let depth = 0; depth < 5; depth++) {
		const choices = evolutionChildren(species.name).map(child => ({
			child,
			level: Math.max(minimumEvolutionLevel(child.name), child.evoLevel ||
				(explicitlyListed.has(child.name) ? 1 : Math.max(20, previous + 15))),
		})).filter(option => option.level <= level);
		if (!choices.length) break;
		const selected = choices[random(choices.length)];
		species = selected.child;
		previous = selected.level;
	}
	return species.name;
}
