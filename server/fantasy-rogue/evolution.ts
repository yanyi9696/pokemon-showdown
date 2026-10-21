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
	return resolveWildStages(name, level, biome, tier, random)[0];
}

/** The codex enumerates the same branches as encounter generation, without random sampling. */
export function possibleWildStages(name: string, level: number, biome: RogueBiome, tier: number): string[] {
	return resolveWildStages(name, level, biome, tier);
}

function wildEvolutionChoices(species: Species, previous: number, listed: Set<string>) {
	return evolutionChildren(species.name).map(child => ({
		child,
		level: Math.max(minimumEvolutionLevel(child.name), child.evoLevel ||
		(listed.has(child.name) ? 1 : Math.max(20, previous + 15))),
	}));
}

/** Only these level boundaries can change the resolver's outcome. Avoid scanning
 * all 98 levels per slot while building the lazy ecology catalog. */
export function wildStageLevels(name: string, biome: RogueBiome, tier: number) {
	const species = dex.species.get(name), levels = new Set([3, 51, 100]);
	let parent: string | undefined = name;
	while (parent) {
		levels.add(minimumEvolutionLevel(parent));
		parent = evolutionParent(parent);
	}
	const listed = new Set(biome.tiers[tier].flatMap(slot => slot.species));
	const appearance = wildAppearanceLevel(name, biome);
	const walk = (current: Species, anchor: number, depth: number) => {
		if (depth >= 5) return;
		for (const choice of wildEvolutionChoices(current, anchor, listed)) {
			levels.add(choice.level);
			walk(choice.child, choice.level, depth + 1);
		}
	};
	walk(species, Number.isFinite(appearance) ? appearance : partyEvolutionLevel(name), 0);
	return [...levels].filter(level => level >= 3 && level <= 100).sort((a, b) => a - b);
}

function resolveWildStages(name: string, level: number, biome: RogueBiome, tier: number, random?: RogueRandom): string[] {
	let species = dex.species.get(lowerToEligibleStage(name, level));
	// A too-early evolved slot becomes its own pre-evolution, never a different eligible branch.
	if (species.name !== dex.species.get(name).name) return [species.name];
	let previous = wildAppearanceLevel(species.name, biome);
	if (!Number.isFinite(previous)) previous = partyEvolutionLevel(species.name);
	const explicitlyListed = new Set(biome.tiers[tier].flatMap(slot => slot.species));
	const walk = (current: Species, anchor: number, depth: number): string[] => {
		if (depth >= 5) return [current.name];
		const choices = wildEvolutionChoices(current, anchor, explicitlyListed).filter(option => option.level <= level);
		if (!choices.length) return [current.name];
		const selected = random ? [choices[random(choices.length)]] : choices;
		return selected.flatMap(option => walk(option.child, option.level, depth + 1));
	};
	return [...new Set(walk(species, previous, 0))];
}
