import type { Pokemon } from './pokemon';
import { hasBlessing, savedBlessingMember } from './fantasy-rogue-blessings';
import { strongestBlessingMember } from './rogue-blessing-permanent';

const ELEMENTS = ['Dark', 'Electric', 'Fire'];
export function ghidorahActive(mon: Pokemon) {
	if (!hasBlessing(mon, 'ghidorah')) return false;
	const state = mon.battle.fantasyRogue;
	const team = mon.side.id === 'p1' ? state?.team : state?.duel?.team;
	return !!team && strongestBlessingMember(team, 'Hydreigon')?.id === savedBlessingMember(mon)?.id;
}
export function ghidorahTypes(mon: Pokemon, types: string[]) {
	return ghidorahActive(mon) && !mon.transformed ? [...new Set([mon.m.rogueGhidorahType || '???', ...types.slice(1)])] : types;
}
export function ghidorahEntry(mon: Pokemon) {
	if (!ghidorahActive(mon)) return;
	mon.m.rogueGhidorahType = '???';
	mon.addVolatile('rogueghidorah', mon, mon.battle.format);
	mon.battle.add('-start', mon, 'typechange', mon.getTypes().join('/'), '[silent]');
}
export function ghidorahMove(mon: Pokemon, move: ActiveMove) {
	if (!ghidorahActive(mon) || mon.transformed || !ELEMENTS.includes(move.type)) return;
	if (mon.m.rogueGhidorahType === move.type) return;
	mon.m.rogueGhidorahType = move.type;
	if (!mon.terastallized) mon.battle.add('-start', mon, 'typechange', mon.getTypes().join('/'), '[silent]');
}
export function ghidorahEffectiveness(mod: number, mon: Pokemon, type: string, move: ActiveMove) {
	if (!ghidorahActive(mon)) return mod;
	const dex = mon.battle.dex;
	// Replace only the natural matchup of the changing first type, leaving other effects intact.
	if (!mon.terastallized && type === mon.getTypes()[0] && ELEMENTS.includes(type)) {
		const natural = dex.getEffectiveness(move, type);
		// The format has already inverted natural matchups before applying blessing bonuses.
		mod -= mon.battle.fantasyRogue?.spirit?.id === 'malamar' ?
			(!dex.getImmunity(move, type) ? 1 : -natural) : natural;
	}
	if (type === mon.getTypes()[0]) for (const element of ELEMENTS) mod += Math.min(0, dex.getEffectiveness(move, element));
	return mod;
}
