import { Dex } from '../../../sim/dex';
import { isRogueFormat } from '../../../sim/fantasy-rogue';
import { battleFusionSprite } from '../../../sim/rogue-fusion-art';

function visualState(pokemon: Pokemon) {
	const visible = pokemon.illusion || pokemon;
	const stats = visible.getRogueBaseStats();
	const text = (['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map(stat => stats[stat]).join('/');
	const fusion = isRogueFormat(pokemon.battle.format.id) ? battleFusionSprite(pokemon) : undefined;
	return { visible, stats, text, fusion, key: `${pokemon.illusion ? 'illusion_' : ''}${visible.species.id}:${text}:${fusion || ''}` };
}

/**
 * Keep only data in Pokemon.m: functions stored there are lost by State's
 * JSON round trip. These format hooks always use the current battle instead
 * of closing over the battle in which a Pokemon first switched in.
 */
export function onFantasySwitchIn(this: Battle, pokemon: Pokemon) {
	// Preserve the old hook's "has switched in" guard with serializable data.
	pokemon.m.fantasyVisualsInitialized = true;
	const visual = visualState(pokemon);
	pokemon.m.lastVisualShown = visual.key;
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
	if (isRogueFormat(this.format.id)) {
		if (visual.fusion || pokemon.m.lastFusionSprite) this.add('-roguefusion', pokemon, visual.fusion || '');
		pokemon.m.lastFusionSprite = visual.fusion;
		const original = this.dex.species.get(visual.visible.species.id).baseStats;
		const changed = (Object.keys(visual.stats) as StatID[]).some(stat => visual.stats[stat] !== original[stat]);
		if (changed) {
			this.add('-start', pokemon, 'roguebasestats', visual.text, '[silent]');
			pokemon.m.rogueStatsUIAttached = true;
		} else if (pokemon.m.rogueStatsUIAttached) {
			this.add('-end', pokemon, 'roguebasestats', '[silent]');
			pokemon.m.rogueStatsUIAttached = false;
		}
	}
}

export function onFantasyUpdate(this: Battle, pokemon: Pokemon) {
	const visualId = visualState(pokemon).key;
	if (pokemon.m.lastVisualShown !== visualId) {
		pokemon.m.lastVisualShown = visualId;
		if (pokemon.m.fantasyVisualsInitialized) onFantasySwitchIn.call(this, pokemon);
	}
}
