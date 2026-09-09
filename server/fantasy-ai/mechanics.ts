import { toID } from '../../sim/dex';
import type { Combatant } from './hypotheses';
import type { BattleMemory } from './memory';

type Field = Pick<BattleMemory, 'pseudoWeather' | 'weather'>;
type StatusProfile = Pick<Combatant, 'status' | 'item' | 'ability' | 'volatiles'> &
	Partial<Pick<Combatant, 'moves' | 'stats'>>;

/**
 * Fantasy 规则解释的共用入口。实际伤害仍交给原生引擎；这里仅解释策略所需的
 * 行动概率、回复容量与异常机会成本。新增道具/特性时要同时核对 conditions.ts
 * 的 hasItem/hasAbility 例外，不能只看普通游戏规则或说明文字。
 * 输入必须来自合法观察或独立假设，禁止在这里读取真实对手 Pokemon。
 */
export function effectiveAbility(mon: StatusProfile): string {
	return mon.volatiles.includes('gastroacid') ? '' : toID(mon.ability);
}

export function effectiveItem(mon: StatusProfile, field?: Pick<Field, 'pseudoWeather'>): string {
	return field?.pseudoWeather.includes('magicroom') || effectiveAbility(mon) === 'klutz' ||
		mon.volatiles.includes('embargo') ? '' : toID(mon.item);
}

export function actionOpportunity(mon: StatusProfile, move?: Move, field?: Pick<Field, 'pseudoWeather'>): number {
	const item = effectiveItem(mon, field);
	const ability = effectiveAbility(mon);
	if (item === 'fantasylifeorb') return 1;
	if (mon.status === 'frz') return item === 'fantasyicestone' || move?.flags.defrost ? 1 : 0.2;
	if (mon.status === 'par') return ability === 'dianliao' ? 1 : 0.75;
	if (mon.status === 'slp') return ability === 'meimenggongyou' || move?.sleepUsable ? 1 : 0.25;
	return 1;
}

export function statusCost(mon: StatusProfile, field?: Pick<Field, 'pseudoWeather'>, dex?: ModdedDex): number {
	if (!mon.status || mon.status === 'fnt') return 0;
	const ability = effectiveAbility(mon);
	const item = effectiveItem(mon, field);
	if (item === 'fantasylifeorb') return ability === 'magicguard' ? 0 : 7;
	if (mon.status === 'frz' && item === 'fantasyicestone') return 0;
	if (mon.status === 'slp' && ability === 'meimenggongyou') return 0;
	if (mon.status === 'brn' && ability === 'zhiliao' || mon.status === 'par' && ability === 'dianliao' ||
		['psn', 'tox'].includes(mon.status) && ability === 'poisonheal') return -6;
	// Price the role that is actually impaired. Body Press still takes the native
	// burn modifier, while Facade/fixed damage do not; a special Dragonite is not
	// an Attack-based wallbreaker just because its species has high base Attack.
	const attacks = dex && mon.moves ? mon.moves.map(id => dex.moves.get(id))
		.filter(move => move.category !== 'Status' && !move.damage && !move.damageCallback) : [];
	const strength = (move: Move) => (move.basePower || 60) *
		(mon.stats?.[move.overrideOffensiveStat || (move.category === 'Physical' ? 'atk' : 'spa')] || 100);
	const physical = Math.max(0, ...attacks.filter(move => move.category === 'Physical').map(strength));
	const special = Math.max(0, ...attacks.filter(move => move.category === 'Special').map(strength));
	const total = Math.max(1, physical + special);
	const burnAffected = Math.max(0, ...attacks.filter(move => move.category === 'Physical' && move.id !== 'facade')
		.map(strength)) / total;
	const speedReliance = attacks.some(move => move.priority <= 0 && move.id !== 'gyroball') &&
		!mon.moves?.includes('trickroom') ? Math.min(1, (mon.stats?.spe || 150) / 250) : 0;
	const residual = ability === 'magicguard' ? 0 : 1;
	let cost: number;
	if (mon.status === 'brn') {
		cost = residual * (ability === 'heatproof' ? 5 : 10) +
			(ability === 'guts' ? -18 * physical / total : burnAffected * 32);
		if (ability === 'flareboost') cost -= 18 * special / total;
	} else if (mon.status === 'fst') {
		cost = residual * 10 + special / total * 32;
	} else if (mon.status === 'par') {
		cost = 18 + speedReliance * (ability === 'quickfeet' ? -12 : 14);
	} else if (mon.status === 'slp' || mon.status === 'frz') {
		const usable = attacks.some(move => mon.status === 'frz' ? move.flags.defrost : move.sleepUsable) ||
			mon.status === 'slp' && mon.moves?.includes('sleeptalk');
		cost = usable ? 12 : 32;
	} else {
		cost = residual * (mon.status === 'tox' ? 22 : 14);
		if (['guts', 'toxicboost'].includes(ability)) cost -= 16 * physical / total;
	}
	// Natural Cure limits lasting damage but does not stop the current turn's
	// status or make the subsequent switch free. Entry immunity stays native.
	return cost > 0 && ability === 'naturalcure' ? cost * 0.6 : cost;
}

/** Capacity before missing HP and timing are applied. Delayed healing is priced separately. */
export function recoveryCapacity(move: Move, mon?: Combatant, field?: Field): number {
	if (mon?.volatiles.includes('healblock')) return 0;
	if (move.heal) return move.heal[0] / move.heal[1];
	if (move.id === 'rest') return 1;
	if (move.id === 'youzhipeiyu') return 0.25;
	if (['wish', 'strengthsap'].includes(move.id)) return 0.5;
	if (['synthesis', 'morningsun', 'moonlight'].includes(move.id)) {
		if (!field) return 0.5;
		return ['sunnyday', 'desolateland'].includes(field.weather) ? 2 / 3 : field.weather ? 0.25 : 0.5;
	}
	if (move.id === 'shoreup') return field?.weather === 'sandstorm' ? 2 / 3 : 0.5;
	return 0;
}

export const DELAYED_HEALING: Readonly<Record<string, number>> = { wish: 0.5, youzhipeiyu: 0.25 };
