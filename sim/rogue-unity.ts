import { ownsBlessing, type BlessingEffects } from './rogue-blessing-data';
import type { Pokemon } from './pokemon';

/** Callers exclude eggs, but deliberately retain fainted party members. */
export function sharedPartyTypes(types: string[][]): string[] {
	return types.length >= 2 ? [...new Set(types[0])].filter(type => types.every(member => member.includes(type))) : [];
}
export function unityState(effects: BlessingEffects | undefined, types: string[][]) {
	const shared = ownsBlessing(effects, 'unity') ? sharedPartyTypes(types) : [];
	return { types: shared, count: types.length, active: !!shared.length };
}
export function battleUnity(mon: Pokemon) {
	const state = mon.battle.fantasyRogue;
	const effects = mon.side.id === 'p1' ? state?.blessings : mon.side.id === 'p2' ? state?.duel?.blessings :
		mon.side.id === 'p3' ? state?.partner?.blessings : undefined;
	if (!ownsBlessing(effects, 'unity')) return { types: [], count: 0, active: false };
	// Co-op selects at most three members; the owner's remaining party still counts.
	// Selected members use live battle types, including temporary type changes.
	const types = effects?.unityParty?.map(saved =>
		mon.side.pokemon.find(p => p.set.fantasyRogueId === saved.id)?.getTypes() || saved.types) ||
		mon.side.pokemon.map(p => p.getTypes());
	return unityState(effects, types);
}
/** Ratios replace only the relevant type-chart component, after move-specific effectiveness. */
export function unityDamageFactor(source: Pokemon, target: Pokemon, move: ActiveMove,
	components: { type: string, mod: number }[]) {
	if (!source.battle.fantasyRogue || move.category === 'Status' || move.damage ||
		move.damageCallback || move.ohko) return 1;
	const offense = battleUnity(source), defense = battleUnity(target);
	let factor = 1;
	for (const { type, mod } of components) {
		if (defense.active && defense.types.includes(type)) {
			if (mod > 0) factor *= (1.5 / 2) ** mod;
			if (mod < 0 && defense.count >= 4) factor *= (0.25 / 0.5) ** -mod;
		}
		if (offense.active && offense.types.includes(move.type)) {
			if (mod < 0 && offense.count >= 3) factor *= (0.75 / 0.5) ** -mod;
			if (mod > 0 && offense.count >= 5) factor *= (3 / 2) ** mod;
		}
	}
	return factor;
}
