import { Dex, toID } from '../../sim/dex';

export const MUSHROOM_SPECIES = ['Paras', 'Parasect', 'Shroomish', 'Breloom', 'Foongus', 'Amoonguss',
	'Morelull', 'Shiinotic', 'Brute Bonnet'];
export function mushroomSpecies(name: string) {
	const species = Dex.mod('gen9fantasy').species.get(name);
	return MUSHROOM_SPECIES.some(s => toID(s) === toID(species.baseSpecies.replace(/-Fantasy$/, '')) ||
		toID(s) === toID(species.name.replace(/-Fantasy$/, '')));
}

/** Appearance allowlist, not Flying typing. Regional/Fantasy forms inherit their base's anatomy.
 * Mechanical birds are included as birds. Insect/membrane wings and mammalian fur are excluded.
 * Flutter Mane and Roaring Moon are explicitly part of the event's authored feather definition.
 */
export const FEATHERED_SPECIES = new Set([
	'Pidgey', 'Pidgeotto', 'Pidgeot', 'Spearow', 'Fearow', 'Farfetch’d', 'Doduo', 'Dodrio',
	'Psyduck', 'Golduck', 'Articuno', 'Zapdos', 'Moltres', 'Hoothoot', 'Noctowl', 'Natu', 'Xatu',
	'Murkrow', 'Honchkrow', 'Delibird', 'Skarmory', 'Lugia', 'Ho-Oh', 'Torchic', 'Combusken', 'Blaziken',
	'Taillow', 'Swellow', 'Wingull', 'Pelipper', 'Swablu', 'Altaria', 'Latias', 'Latios',
	'Piplup', 'Prinplup', 'Empoleon', 'Starly', 'Staravia', 'Staraptor', 'Chatot',
	'Pidove', 'Tranquill', 'Unfezant', 'Ducklett', 'Swanna', 'Archen', 'Archeops', 'Rufflet', 'Braviary',
	'Vullaby', 'Mandibuzz', 'Reshiram', 'Fletchling', 'Fletchinder', 'Talonflame', 'Spritzee', 'Aromatisse',
	'Hawlucha', 'Yveltal', 'Rowlet', 'Dartrix', 'Decidueye', 'Pikipek', 'Trumbeak', 'Toucannon',
	'Oricorio', 'Type: Null', 'Silvally', 'Tapu Koko', 'Rookidee', 'Corvisquire', 'Corviknight',
	'Cramorant', 'Sirfetch’d', 'Quaxly', 'Quaxwell', 'Quaquaval', 'Squawkabilly', 'Wattrel', 'Kilowattrel',
	'Flittle', 'Espathra', 'Bombirdier', 'Flamigo', 'Flutter Mane', 'Roaring Moon', 'Iron Bundle',
	'Koraidon', 'Fezandipiti',
	'Togetic', 'Togekiss', 'Dunsparce', 'Dudunsparce', 'Sigilyph',
	'Sneasel', 'Weavile', 'Sneasler',
].map(toID));
export function featheredSpecies(name: string) {
	const species = Dex.mod('gen9fantasy').species.get(name);
	// Only the bird-shaped Therian form has feathers; the Incarnate form does not.
	if (toID(species.baseSpecies.replace(/-Fantasy$/, '')) === 'tornadus') return species.forme.includes('Therian');
	return FEATHERED_SPECIES.has(toID(species.baseSpecies.replace(/-Fantasy$/, ''))) ||
		FEATHERED_SPECIES.has(toID(species.name.replace(/-Fantasy$/, '')));
}
