import { Dex } from '../../sim/dex';

/** Explicit legendary rewards opt out; ordinary random encounters never do. */
export function randomSpeciesEligible(name: string, level: number, legendaryReward = false) {
	const species = Dex.mod('gen9fantasy').species.get(name);
	if (!species.exists) return false;
	const base = Dex.species.get(species.baseSpecies.replace(/-Fantasy$/, ''));
	const tags = [...species.tags, ...(base.exists ? base.tags : [])];
	return legendaryReward || level > 50 || !tags.some(tag =>
		['Restricted Legendary', 'Sub-Legendary', 'Mythical', 'Ultra Beast', 'Paradox'].includes(tag));
}
