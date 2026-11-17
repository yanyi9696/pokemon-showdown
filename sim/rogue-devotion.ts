import { ownsBlessing, type BlessingEffects } from './rogue-blessing-data';
import { blessingFamilyID } from './rogue-species-identity';

/** Count the declared family of the persistent species, never nicknames or Transform copies. */
export function devotionBonus(effects: BlessingEffects | undefined, species: string, party: readonly string[]) {
	const entry = ownsBlessing(effects, 'devotion');
	const family = entry?.species && blessingFamilyID(entry.species);
	const count = family && blessingFamilyID(species) === family ?
		Math.min(6, party.filter(name => blessingFamilyID(name) === family).length) : 0;
	return { count, power: [0, 0, 12, 25, 40, 60, 85][count], reduction: Math.max(0, count - 1) * 5 };
}
