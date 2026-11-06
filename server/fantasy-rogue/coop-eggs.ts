import type { RoguePokemon } from '../../sim/fantasy-rogue';
import { toID } from '../../sim/dex';
import { eggView } from './eggs';

/** Both owners and teammates see the same hidden egg, including when control is delegated. */
export function coopPartyPokemon(mon: RoguePokemon, floor: number) {
	if (mon.egg) {
		const hidden = eggView(mon, floor);
		return { id: mon.id, species: 'Egg', level: 1, hp: 0, maxhp: 0, shiny: false, gender: '',
			moves: [], item: '', ability: '', nature: '', experience: null, evs: {},
			egg: hidden.egg, remainingFloors: hidden.remainingFloors };
	}
	return { id: mon.id, species: mon.set.species, level: mon.set.level, hp: mon.hp, maxhp: mon.maxhp,
		shiny: !!mon.set.shiny, gender: mon.set.gender, moves: mon.set.moves.map(toID), item: mon.set.item || '',
		ability: mon.set.ability, nature: mon.set.nature, experience: mon.experience ?? null, evs: { ...mon.set.evs } };
}

export const coopMemberName = (mon: RoguePokemon | undefined) => mon?.egg ? 'Egg' : mon?.set.species || '';

/** An egg can be traded, but cannot replace a player's last hatched, non-permanently-lost partner. */
export function canReceiveEgg(team: RoguePokemon[], outgoing: RoguePokemon, incoming: RoguePokemon) {
	return !incoming.egg || team.some(mon => mon.id !== outgoing.id && !mon.egg && !mon.nuzlockeDead);
}
