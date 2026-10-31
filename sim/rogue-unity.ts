import { ownsBlessing, type BlessingEffects } from './rogue-blessing-data';
import type { Pokemon } from './pokemon';

/** Callers exclude eggs, but deliberately retain fainted party members. */
export function sharedPartyTypes(types: string[][]): string[] {
	return types.length >= 2 ? [...new Set(types[0])].filter(type => types.every(member => member.includes(type))) : [];
}
export function unityState(effects: BlessingEffects | undefined, types: string[][]) {
	const type = ownsBlessing(effects, 'unity')?.type;
	return { type, count: types.length, active: !!type && sharedPartyTypes(types).includes(type) };
}
export function battleUnity(mon: Pokemon) {
	const state = mon.battle.fantasyRogue;
	const effects = mon.side.id === 'p1' ? state?.blessings : mon.side.id === 'p2' ? state?.duel?.blessings : undefined;
	if (!ownsBlessing(effects, 'unity')) return { type: undefined, count: 0, active: false };
	return unityState(effects, mon.side.pokemon.map(p => p.getTypes()));
}
/** Ratios replace only the relevant type-chart component, after move-specific effectiveness. */
export function unityDamageFactor(source: Pokemon, target: Pokemon, move: ActiveMove,
	components: { type: string, mod: number }[]) {
	if (!source.battle.fantasyRogue || move.category === 'Status' || move.damage ||
		move.damageCallback || move.ohko) return 1;
	const offense = battleUnity(source), defense = battleUnity(target);
	let factor = 1;
	for (const { type, mod } of components) {
		if (defense.active && type === defense.type) {
			if (mod > 0) factor *= (1.5 / 2) ** mod;
			if (mod < 0 && defense.count >= 4) factor *= (0.25 / 0.5) ** -mod;
		}
		if (offense.active && move.type === offense.type) {
			if (mod < 0 && offense.count >= 3) factor *= (0.75 / 0.5) ** -mod;
			if (mod > 0 && offense.count >= 5) factor *= (3 / 2) ** mod;
		}
	}
	return factor;
}
