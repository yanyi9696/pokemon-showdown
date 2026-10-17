import { Dex, toID } from '../../sim/dex';
import { exclusiveFamily } from './exclusive-items';

const dex = Dex.mod('gen9fantasy');
/** Apply persistent held-item formes; Mega, Primal and Crowned changes stay in the simulator. */
export function applyHeldForme(set: PokemonSet): boolean {
	const current = dex.species.get(set.species), item = dex.items.get(set.item);
	if (!current.exists || current.battleOnly || current.isMega) return false;
	const family = exclusiveFamily(current.name);
	const forms = dex.species.all().filter(form =>
		!form.battleOnly && !form.isMega && exclusiveFamily(form.name) === family);
	const target = forms.find(form => form.requiredItems?.some(name => toID(name) === item.id)) ||
		(current.requiredItems?.length ? forms.find(form => !form.requiredItems?.length &&
			(!form.forme || form.forme === 'Fantasy' || ['Alola', 'Galar', 'Hisui', 'Paldea'].includes(form.forme))) : current);
	if (!target || target.name === current.name) return false;
	const slot = Object.keys(current.abilities).find(key => toID(current.abilities[key as '0']) === toID(set.ability));
	if (slot) set.ability = target.abilities[slot as '0'] || target.abilities[0];
	set.species = target.name;
	return true;
}
