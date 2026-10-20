import type { Pokemon } from './pokemon';
import { blessingEffects, hasBlessing, savedBlessingMember } from './fantasy-rogue-blessings';
import { addSpiral, robeDurability, robeMember, SPIRAL_SURVIVAL, type RobeKind } from './rogue-awakening';
import { strongestBlessingMember } from './rogue-blessing-permanent';

export function robeActive(mon: Pokemon | null | undefined, kind: RobeKind) {
	if (!mon?.battle.fantasyRogue || !mon.set.fantasyRogueId || mon.transformed) return false;
	const state = mon.battle.fantasyRogue;
	const team = mon.side.id === 'p1' ? state.team : state.duel?.team || [];
	return robeMember(team, blessingEffects(mon), kind)?.id === mon.set.fantasyRogueId;
}
export function spiralActive(mon: Pokemon) {
	return !!mon.set.fantasyRogueId && hasBlessing(mon, 'spiral')?.target === mon.set.fantasyRogueId;
}
export function spiralPoints(mon: Pokemon): number {
	return mon.m.rogueSpiral ?? savedBlessingMember(mon)?.spiral ?? 0;
}
export function gainSpiral(mon: Pokemon, amount: number) {
	if (spiralActive(mon)) mon.m.rogueSpiral = addSpiral(spiralPoints(mon), amount);
}
export function robeMultiplier(mon: Pokemon) {
	const kind = robeActive(mon, 'godrobe') ? 'godrobe' : robeActive(mon, 'puregodrobe') ? 'puregodrobe' : undefined;
	return kind ? robeDurability(mon.hp, mon.maxhp, !!hasBlessing(mon, kind)?.completed) : 1;
}
export function awakeningUpdate(mon: Pokemon) {
	const battle = mon.battle, state = battle.fantasyRogue;
	if (!state || !mon.hp) return;
	if (robeActive(mon, 'puregodrobe') && mon.hp <= mon.maxhp / 2 && !mon.m.roguePureHalf) {
		mon.m.roguePureHalf = true;
		if (!hasBlessing(mon, 'puregodrobe')?.completed) mon.addVolatile('confusion', mon, battle.format);
		battle.boost({ spa: 1 }, mon, mon, battle.format);
		battle.add('-message', '【神衣纯洁】半血觉醒：特攻提升，每场仅一次。');
	}
	const team = mon.side.id === 'p1' ? state.team : state.duel?.team || [];
	if (hasBlessing(mon, 'spiral') && !mon.transformed && mon.species.isMega &&
		strongestBlessingMember(team, 'excadrill')?.id === mon.set.fantasyRogueId && mon.ability !== 'heavenpiercingdrill') {
		mon.setAbility('heavenpiercingdrill', mon, true);
		battle.add('-message', '【我的钻头是可以突破天际的】超进化特性变为【突破天际的钻头】。');
	}
}
export function awakeningLethal(damage: number, mon: Pokemon, effect: Effect) {
	if (damage < mon.hp || mon.m.rogueRobeRevived || !robeActive(mon, 'godrobe') || effect.id === 'roguebloodcost') return;
	mon.m.rogueRobeRevived = true;
	mon.sethp(Math.max(1, Math.floor(mon.maxhp / 2)));
	mon.battle.add('-heal', mon, mon.getHealth, '[from] 神衣鲜血');
	return 0;
}
export function spiralLethal(damage: number, mon: Pokemon) {
	if (damage < mon.hp || !spiralActive(mon) || spiralPoints(mon) < SPIRAL_SURVIVAL || mon.m.rogueSpiralSurvived) return;
	mon.m.rogueSpiralSurvived = true;
	mon.battle.add('-message', '【螺旋力】突破极限，保留 1 HP！');
	return Math.max(0, mon.hp - 1);
}
export function bloodRequest(mon: Pokemon | null | undefined) {
	if (!mon?.hp || !robeActive(mon, 'godrobe')) return;
	return { cost: Math.min(mon.hp - 1, Math.max(1, Math.ceil(mon.hp / 10))), available: mon.hp > 1,
		factor: hasBlessing(mon, 'godrobe')?.completed ? 1.6 : 1.5 };
}
export function empowerBloodMove(mon: Pokemon, move: ActiveMove) {
	if (mon.m.rogueBloodPending !== mon.battle.turn || move.isExternal) return;
	delete mon.m.rogueBloodPending;
	const request = bloodRequest(mon);
	if (!request?.available || move.category === 'Status' || move.damage || move.damageCallback || move.ohko) return;
	mon.battle.directDamage(request.cost, mon, mon, mon.battle.dex.conditions.get('roguebloodcost'));
	move.rogueBloodFactor = request.factor;
	mon.battle.add('-message', `【神衣鲜血】消耗 ${request.cost} HP，本次招式伤害 +${Math.round((request.factor - 1) * 100)}%。`);
}
export function drainPureRobe(mon: Pokemon) {
	// Format residual callbacks can be visited for multiple active Pokemon (including co-op).
	if (!mon.hp || !robeActive(mon, 'puregodrobe') || mon.m.roguePureDrainTurn === mon.battle.turn) return;
	mon.m.roguePureDrainTurn = mon.battle.turn;
	const cost = Math.min(mon.hp - 1, Math.max(1, Math.ceil(mon.hp * (hasBlessing(mon, 'puregodrobe')?.completed ? 0.07 : 0.1))));
	if (cost > 0) mon.battle.directDamage(cost, mon, mon, mon.battle.dex.conditions.get('roguepurecost'));
	awakeningUpdate(mon);
}
