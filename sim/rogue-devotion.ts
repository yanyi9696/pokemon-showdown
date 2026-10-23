import { ownsBlessing, type BlessingEffects } from './rogue-blessing-data';
import { blessingSpeciesID } from './rogue-species-identity';

/** Count species, not evolutionary families, nicknames, or currently transformed appearances. */
export function devotionBonus(effects: BlessingEffects | undefined, species: string, party: readonly string[]) {
	const entry = ownsBlessing(effects, 'devotion');
	const count = entry?.species && blessingSpeciesID(species) === entry.species ?
		Math.min(6, party.filter(name => blessingSpeciesID(name) === entry.species).length) : 0;
	return { count, power: [0, 0, 12, 25, 40, 60, 85][count], reduction: Math.max(0, count - 1) * 5 };
}
