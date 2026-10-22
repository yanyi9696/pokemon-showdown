import { Dex, toID } from './dex';

/** Fantasy and battle forms keep the original species identity, never the nickname. */
export function blessingSpeciesID(name: string): ID {
	const species = Dex.mod('gen9fantasy').species.get(name);
	const original = Dex.mod('gen9').species.get((species.exists ? species.baseSpecies : name).replace(/-Fantasy\b/g, ''));
	return toID(original.exists ? original.baseSpecies : name.replace(/-Fantasy\b/g, ''));
}

/** Only the initial selection pays slots. Captures and the travelling party keep their normal limit. */
export function rogueStarterSlotCost(name: string): number {
	const species = Dex.mod('gen9fantasy').species.get(name);
	const original = Dex.mod('gen9').species.get(blessingSpeciesID(name));
	const tags = [...species.tags, ...original.tags];
	if (tags.includes('Restricted Legendary') || original.id === 'regigigas') return 6;
	if (tags.includes('Sub-Legendary') || tags.includes('Mythical')) return 4;
	return 1;
}
