import { Dex } from '../../../sim/dex';

/**
 * Keep only data in Pokemon.m: functions stored there are lost by State's
 * JSON round trip. These format hooks always use the current battle instead
 * of closing over the battle in which a Pokemon first switched in.
 */
export function onFantasySwitchIn(this: Battle, pokemon: Pokemon) {
	// Preserve the old hook's "has switched in" guard with serializable data.
	pokemon.m.fantasyVisualsInitialized = true;
	const visualSpecies = pokemon.illusion ? pokemon.illusion.species : pokemon.species;
	if (!Dex.species.get(visualSpecies.id).exists) {
		const types = pokemon.illusion ? pokemon.illusion.species.types : pokemon.getTypes();
		this.add('-start', pokemon, 'typechange', types.join('/'), '[silent]');
		this.add('-start', pokemon, 'fantasystats', Object.values(visualSpecies.baseStats).join('/'), '[silent]');
		pokemon.m.fantasyUIAttached = true;
	} else {
		this.add('-end', pokemon, 'fantasystats', '[silent]');
		// Transform already publishes the new types; preserve its native label.
		if (pokemon.m.fantasyUIAttached && !pokemon.transformed) {
			this.add('-end', pokemon, 'typechange', '[silent]');
			pokemon.m.fantasyUIAttached = false;
		}
	}
}

export function onFantasyUpdate(this: Battle, pokemon: Pokemon) {
	const visualId = pokemon.illusion ? `illusion_${pokemon.illusion.species.id}` : pokemon.species.id;
	if (pokemon.m.lastVisualShown !== visualId) {
		pokemon.m.lastVisualShown = visualId;
		if (pokemon.m.fantasyVisualsInitialized) onFantasySwitchIn.call(this, pokemon);
	}
}
