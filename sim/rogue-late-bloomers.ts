import { blessingSpeciesID } from './rogue-species-identity';
import { toID } from './dex';
import type { RoguePokemon } from './fantasy-rogue';
import type { BlessingEffects } from './rogue-blessing-data';
import { permanentMemberTypes } from './rogue-blessing-permanent';

export const LATE_BLOOMERS = [
	{ stages: ['Dratini', 'Dragonair', 'Dragonite'], stat: 'spe' },
	{ stages: ['Larvitar', 'Pupitar', 'Tyranitar'], stat: 'spd' },
	{ stages: ['Bagon', 'Shelgon', 'Salamence'], stat: 'spa' },
	{ stages: ['Beldum', 'Metang', 'Metagross'], stat: 'def' },
	{ stages: ['Gible', 'Gabite', 'Garchomp'], stat: 'atk' },
	{ stages: ['Deino', 'Zweilous', 'Hydreigon'], stat: 'spa' },
	{ stages: ['Goomy', 'Sliggoo', 'Goodra'], stat: 'spd' },
	{ stages: ['Jangmo-o', 'Hakamo-o', 'Kommo-o'], stat: 'def' },
	{ stages: ['Dreepy', 'Drakloak', 'Dragapult'], stat: 'spe' },
	{ stages: ['Frigibax', 'Arctibax', 'Baxcalibur'], stat: 'atk' },
] as const;
const LATE_BLOOMER_FAMILIES = new Map(LATE_BLOOMERS.flatMap(family =>
	family.stages.map(stage => [toID(stage), family] as const)));
export function lateBloomer(name: string) {
	return LATE_BLOOMER_FAMILIES.get(blessingSpeciesID(name));
}
export function finalLateBloomer(name: string) {
	const family = lateBloomer(name);
	return !!family && blessingSpeciesID(name) === toID(family.stages[2]);
}
export function lateBloomerSynergy(team: RoguePokemon[]) {
	const families = new Set(team.filter(p => !p.egg).map(p => lateBloomer(p.set.species)).filter(Boolean));
	const amount = families.size ? (6 + 4 * (Math.min(6, families.size) - 1)) / 100 : 0;
	const stats: Partial<StatsTable> = {};
	for (const family of families) stats[family!.stat] = amount;
	return { count: families.size, stats };
}
export function emissaryCount(mon: RoguePokemon, effects?: BlessingEffects) {
	if (mon.egg) return 0;
	const types = permanentMemberTypes(mon);
	return (effects?.owned || []).filter(b => b.family === 'emissary' && types.includes(b.type!)).length;
}
/** Multipliers are kept separate from type-evolution and training so they compose correctly. */
export function teamBlessingStats(mon: RoguePokemon, effects: BlessingEffects, synergy: Partial<StatsTable>) {
	const result: Partial<StatsTable> = {};
	const emissaries = emissaryCount(mon, effects), multiplier = 1.1 ** emissaries;
	for (const key of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
		const value = multiplier * (1 + (synergy[key] || 0)) - 1;
		if (value) result[key] = value;
	}
	return Object.keys(result).length ? result : undefined;
}
