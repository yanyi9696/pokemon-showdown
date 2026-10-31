import type { RoguePokemon } from './fantasy-rogue';
import { blessingSpeciesID } from './rogue-species-identity';
import { toID } from './dex';

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
/** Multipliers are kept separate from type-evolution and training so they compose correctly. */
export function teamBlessingStats(synergy: Partial<StatsTable>) {
	const result: Partial<StatsTable> = {};
	// Emissaries affect move power only; legacy six-stat modifiers are rebuilt without them.
	for (const key of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
		const value = synergy[key] || 0;
		if (value) result[key] = value;
	}
	return Object.keys(result).length ? result : undefined;
}
