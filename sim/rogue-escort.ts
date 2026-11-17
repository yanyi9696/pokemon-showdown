import type { Battle } from './battle';

/** Only the authored escort encounter enables this; no Commander stat boosts are granted. */
export function updateRogueEscort(battle: Battle) {
	const sideid = battle.fantasyRogue?.cooperative?.escortSide;
	if (!sideid || battle.gameType !== 'multi') return;
	const escort = battle.getSide(sideid)?.active[0];
	if (!escort || escort.fainted || !escort.hp) return;
	const ally = battle.getSide(sideid === 'p1' ? 'p3' : 'p1')?.active[0];
	const protectedNow = !!ally?.hp && !ally.fainted && ally.isActive;
	if (protectedNow && !escort.volatiles.rogueescort) {
		// Use the native Commanding move/request rules, without changing species or ability.
		escort.addVolatile('commanding');
		escort.volatiles.rogueescort = battle.initEffectState({ id: 'rogueescort', target: escort });
		battle.queue.cancelAction(escort);
		battle.add('-start', escort, 'rogueescort', '[silent]');
	} else if (!protectedNow && escort.volatiles.rogueescort) {
		escort.removeVolatile('commanding');
		delete escort.volatiles.rogueescort;
		battle.add('-end', escort, 'rogueescort', '[silent]');
	}
}
