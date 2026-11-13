import type { Pokemon } from './pokemon';
import { ownsBlessing } from './rogue-blessing-data';
import { strongestSniperMember } from './rogue-blessing-permanent';

export const SNIPER_TRAINING_KOS = 15;
export function veteranSniper(mon: Pokemon) {
	const state = mon.battle.fantasyRogue;
	const effects = mon.side.id === 'p1' ? state?.blessings : mon.side.id === 'p2' ? state?.duel?.blessings :
		mon.side.id === 'p3' ? state?.partner?.blessings : undefined;
	const team = mon.side.id === 'p1' ? state?.team : mon.side.id === 'p2' ? state?.duel?.team :
		mon.side.id === 'p3' ? state?.partner?.team : undefined;
	if (!state || !team || !ownsBlessing(effects, 'veteransniper') || !mon.hasAbility('sniper')) return;
	const strongest = strongestSniperMember(team, effects);
	return strongest?.id === mon.set.fantasyRogueId ? strongest : undefined;
}
export function sniperTrainingProgress(mon: Pokemon) {
	const saved = veteranSniper(mon);
	const state = mon.battle.fantasyRogue;
	const progress = mon.side.id === 'p1' ? state?.blessingProgress :
		mon.side.id === 'p3' ? state?.partnerBlessingProgress : undefined;
	return Math.min(SNIPER_TRAINING_KOS, (saved?.sniperKOs || 0) +
		(progress?.kos.filter(ko => ko.sniper && ko.member === saved?.id).length || 0));
}
export function sniperCriticalKO(target: Pokemon, source: Pokemon, effect?: Effect | null) {
	if (!veteranSniper(source) || effect?.effectType !== 'Move') return false;
	const move = effect;
	return !!move.flags.shooting && !move.damage && !move.damageCallback && !move.ohko &&
		move.category !== 'Status' && !!target.getMoveHitData(move).crit;
}
/** A defensive-stat modifier, composed multiplicatively with Ruin and every other modifier. */
export function sniperIgnoresDefense(target: Pokemon, source?: Pokemon | null, move?: ActiveMove | null) {
	return !!source && source.side !== target.side && !!move?.flags?.shooting && move.category !== 'Status' &&
		!move.damage && !move.damageCallback && !move.ohko && !!veteranSniper(source) &&
		sniperTrainingProgress(source) >= SNIPER_TRAINING_KOS;
}
