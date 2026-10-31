import type { Pokemon } from './pokemon';
import { hasBlessing, savedBlessingMember } from './fantasy-rogue-blessings';
import { strongestBlessingMember } from './rogue-blessing-permanent';

function active(mon: Pokemon) {
	const state = mon.battle.fantasyRogue;
	const team = mon.side.id === 'p1' ? state?.team : state?.duel?.team;
	return !!hasBlessing(mon, 'spindance') && !!team &&
		strongestBlessingMember(team, 'Spinda')?.id === savedBlessingMember(mon)?.id;
}
/** Only a newly established confusion counts; failed attempts and refreshes do not. */
export function spindaConfused(target: Pokemon, source: Pokemon) {
	if (!target.isAlly(source) && active(source)) {
		target.battle.boost({ accuracy: -1 }, target, source, target.battle.format);
	}
}
function confuse(target: Pokemon, source: Pokemon) {
	if (!target.hp || target.fainted) return;
	if (target.volatiles.confusion) {
		// Ask the same immunity/event hooks as ordinary confusion before refreshing.
		if (target.battle.runEvent('TryAddVolatile', target, source, target.battle.format, target.battle.dex.conditions.get('confusion'))) {
			target.volatiles.confusion.time = target.battle.random(2, 6);
			target.battle.add('-message', `【摇~摇~晃~摇】${target.name}的混乱时间重新开始。`);
		}
	} else target.addVolatile('confusion', source, target.battle.format);
}
export function spindaEntry(mon: Pokemon) {
	if (active(mon)) for (const foe of mon.foes()) confuse(foe, mon);
}
export function spindaHit(target: Pokemon, source: Pokemon) {
	if (!target.isAlly(source) && active(target)) confuse(source, target);
}
export function spindaDamage(damage: number, mon: Pokemon, source: Pokemon | null, effect: Effect) {
	if (mon.volatiles.roguespindasleep) {
		return source && !source.isAlly(mon) && effect.effectType === 'Move' ? mon.hp : 0;
	}
	if (damage < mon.hp || !active(mon) || mon.m.rogueSpindaUsed) return;
	mon.m.rogueSpindaUsed = true;
	mon.addVolatile('roguespindasleep', mon, mon.battle.format);
	mon.battle.add('-message', '【摇~摇~晃~摇】以 1 HP 进入濒死睡眠；熬过两个回合即可回满，但再受对手攻击就会倒下。');
	return Math.max(0, mon.hp - 1);
}
