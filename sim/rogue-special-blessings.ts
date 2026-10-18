import type { Pokemon } from './pokemon';
import type { RoguePokemon } from './fantasy-rogue';
import type { BlessingEffects } from './rogue-blessing-data';
import { toID } from './dex';
import { assignedExtraAbilities, memberStatTotal } from './rogue-blessing-permanent';

export function memberHasMoldBreaker(mon: RoguePokemon, team: RoguePokemon[], effects?: BlessingEffects) {
	return toID(mon.set.ability) === 'moldbreaker' ||
		assignedExtraAbilities(mon, team, effects).includes(toID('moldbreaker'));
}
export function strongestRailgunMember(team: RoguePokemon[]) {
	return team.filter(mon => mon.set.moves.some(move => toID(move) === 'zapcannon'))
		.sort((a, b) => memberStatTotal(b) - memberStatTotal(a) || (a.joinOrder || 0) - (b.joinOrder || 0))[0];
}
export function railgunActive(mon: Pokemon) {
	const state = mon.battle.fantasyRogue;
	const effects = mon.side.id === 'p1' ? state?.blessings : state?.duel?.blessings;
	const team = mon.side.id === 'p1' ? state?.team : state?.duel?.team;
	return !!effects?.owned.some(b => b.family === 'railgun') && !!team &&
		strongestRailgunMember(team)?.id === mon.set.fantasyRogueId && mon.moveSlots.some(move => move.id === 'zapcannon');
}
/** The blessing belongs to current Mold Breaker holders, not every member of their side. */
export function rulebreakerActive(mon: Pokemon | null | undefined): boolean {
	if (!mon?.battle.fantasyRogue) return false;
	const state = mon.battle.fantasyRogue;
	const effects = mon.side.id === 'p1' ? state.blessings : state.duel?.blessings;
	if (!effects?.owned.some(b => b.family === 'rulebreaker')) return false;
	return mon.ability === 'moldbreaker' || !!mon.m.rogueBlessing?.abilities?.includes('moldbreaker');
}
/** Suppress defensive callbacks only while this move is resolving, including shared items. */
export function bypassRogueDefense(attacker: Pokemon | null, holder: Pokemon, event: string) {
	return rulebreakerActive(attacker) && attacker!.battle.activeMove?.effectType === 'Move' &&
		holder.side !== attacker!.side && ['ModifyDef', 'ModifySpD', 'ModifyDamage', 'Damage', 'TryHit', 'TryPrimaryHit',
		'Immunity', 'Effectiveness', 'CriticalHit', 'ModifyAccuracy', 'Accuracy', 'ModifyAtk', 'ModifySpA', 'BasePower'].includes(event);
}

/** Ignore protection only for the holder's own attack; do not remove it for other attackers. */
export function bypassRogueProtection(attacker: Pokemon | null, effect: Effect, event: string) {
	if (!rulebreakerActive(attacker) || attacker!.battle.activeMove?.effectType !== 'Move') return false;
	const id = effect.id, move = attacker!.battle.activeMove;
	if (event === 'TryHit' && ['protect', 'maxguard', 'banefulbunker', 'burningbulwark', 'kingsshield',
		'obstruct', 'silktrap', 'spikyshield', 'craftyshield', 'matblock', 'quickguard', 'wideguard', 'psychicterrain'].includes(id)) return true;
	if (event === 'Damage' && id === 'endure') return true;
	if (event === 'BasePower' && (id === 'mistyterrain' && move.type === 'Dragon' ||
		id === 'grassyterrain' && ['earthquake', 'bulldoze', 'magnitude'].includes(move.id))) return true;
	return false;
}
