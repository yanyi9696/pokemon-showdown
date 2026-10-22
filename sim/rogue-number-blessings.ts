import type { Battle } from './battle';
import type { Pokemon } from './pokemon';
import type { Side } from './side';
import { hasBlessing, rogueStatSnapshot } from './fantasy-rogue-blessings';

export const NUMBER_STATS = ['atk', 'def', 'spa', 'spd', 'spe'] as const;
export function numberRequest(side: Side, isMoveRequest = side.requestState === 'move') {
	const mon = side.active.find(p => p?.hp);
	if (!mon || !isMoveRequest) return;
	const superNumber = hasBlessing(mon, 'supernumber');
	if (!superNumber && !hasBlessing(mon, 'bignumber')) return;
	return { super: !!superNumber, available: !side.battle.fantasyRogue?.numberUses?.[side.id],
		stats: superNumber ? ['all'] : [...NUMBER_STATS] };
}
/** Commit once after both players have chosen, before speed/order is calculated. Undo never spends it. */
export function commitNumberChoices(battle: Battle) {
	for (const side of battle.sides) for (const action of side.choice.actions) {
		if (!action.rogueNumber || !numberRequest(side)?.available || !action.pokemon?.hp) continue;
		const state = battle.fantasyRogue!;
		(state.numberUses ||= {})[side.id] = true;
		action.pokemon.m.rogueNumber = { turn: battle.turn, stat: action.rogueNumber,
			factor: hasBlessing(action.pokemon, 'supernumber') ? 5 : 2 };
		battle.add('-message', `【${action.pokemon.m.rogueNumber.factor === 5 ? '超大数字' : '大数字'}】本回合增幅已发动。`);
		recordNumberThreshold(action.pokemon);
	}
}
export function numberStatMultiplier(mon: Pokemon, stat: StatIDExceptHP) {
	const boost = mon.m.rogueNumber;
	return boost?.turn === mon.battle.turn && (boost.stat === 'all' || boost.stat === stat) ? boost.factor : 1;
}
export function recordNumberThreshold(mon: Pokemon) {
	const boost = mon.m.rogueNumber, progress = mon.battle.fantasyRogue?.blessingProgress;
	if (!progress || mon.side.id !== 'p1' || boost?.turn !== mon.battle.turn || !mon.hp) return;
	// Inspect actual neutral-context stats, like the private stat tooltip. Direct getStat(atk/spa)
	// has no move context and crashes abilities such as Overgrow; move-specific damage is not a stat.
	const snapshot = rogueStatSnapshot(mon);
	const maximum = Math.max(...NUMBER_STATS.map(stat => stat === 'spe' ? mon.getStat('spe') : snapshot[stat]));
	if (boost.factor === 2 && maximum >= 3000) progress.numberUpgrade = true;
	if (boost.factor === 5 && maximum >= 13000) progress.numberPrize = true;
}
