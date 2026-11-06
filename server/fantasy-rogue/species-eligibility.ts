import { Dex, toID } from '../../sim/dex';

export function rogueSpeciesID(name: string) {
	const id = toID(name);
	return id === 'kyuremoriginal' ? 'kyuremoriginalfantasy' : id;
}

/** Retain old capture credit under the renamed identity, without inventing new catches. */
export function migrateRenamedSpeciesIds(ids: string[] | undefined) {
	return ids?.includes('kyuremoriginal') ? [...new Set(ids.map(rogueSpeciesID))] : ids;
}

/** Fantasy event membership includes the renamed original dragon and its legacy alias. */
export function isFantasySpecies(name: string) {
	const species = Dex.mod('gen9fantasy').species.get(name);
	return species.exists && species.name.includes('Fantasy');
}

/** Explicit legendary rewards opt out; ordinary random encounters never do. */
export function randomSpeciesEligible(name: string, level: number, legendaryReward = false) {
	const species = Dex.mod('gen9fantasy').species.get(name);
	if (!species.exists) return false;
	const base = Dex.species.get(species.baseSpecies.replace(/-Fantasy$/, ''));
	const tags = [...species.tags, ...(base.exists ? base.tags : [])];
	return legendaryReward || level > 50 || !tags.some(tag =>
		['Restricted Legendary', 'Sub-Legendary', 'Mythical', 'Ultra Beast', 'Paradox'].includes(tag));
}
