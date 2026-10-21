import type { Pokemon } from './pokemon';
import type { ActiveMove } from './dex-moves';
import type { RoguePokemon } from './fantasy-rogue';

function current(mon: Pokemon) {
	mon.m.rogueEvolution ||= { moves: {} as Record<string, number>, criticals: 0, recoil: 0, lostHP: 0 };
	return mon.m.rogueEvolution;
}
export function recordEvolutionMove(mon: Pokemon, move: ActiveMove) {
	if (!mon.battle.fantasyRogue || mon.side.id !== 'p1' || !mon.set.fantasyRogueId || mon.transformed || move.isZ || move.isMax) return;
	const state = current(mon); state.moves[move.id] = (state.moves[move.id] || 0) + 1;
}
export function recordEvolutionHit(damage: number, target: Pokemon, source: Pokemon, move: ActiveMove) {
	if (damage > 0 && source?.side.id === 'p1' && !source.isAlly(target) && source.battle.fantasyRogue && target.getMoveHitData(move).crit) {
		current(source).criticals++;
	}
}
export function recordEvolutionDamage(damage: number, target: Pokemon, effect: Effect) {
	if (!target.battle.fantasyRogue || target.side.id !== 'p1' || damage <= 0) return;
	const state = current(target); state.lostHP += damage;
	if (effect?.id === 'recoil') state.recoil += damage;
}
export function resetEvolutionDamageOnFaint(mon: Pokemon) {
	if (!mon.battle.fantasyRogue || mon.side.id !== 'p1') return;
	const state = current(mon);
	state.recoil = 0; state.lostHP = 0; state.resetDamage = true;
}
export function snapshotEvolutionProgress(mon: Pokemon, original: RoguePokemon) {
	const next = structuredClone(original.evolutionProgress || {}), state = mon.m.rogueEvolution;
	if (!state) return original.evolutionProgress;
	for (const [move, count] of Object.entries(state.moves as Record<string, number>)) {
		(next.moves ||= {})[move] = (next.moves[move] || 0) + count;
	}
	next.criticals = Math.max(next.criticals || 0, state.criticals);
	next.recoil = mon.hp ? (state.resetDamage ? 0 : next.recoil || 0) + state.recoil : 0;
	next.lostHP = mon.hp ? (state.resetDamage ? 0 : next.lostHP || 0) + state.lostHP : 0;
	return next;
}
