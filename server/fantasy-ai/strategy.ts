import { toID } from '../../sim/dex';
import type { Combatant } from './hypotheses';
import { damageContext, fieldContext, type BattleMemory, type SeenPokemon } from './memory';
import { effectiveAbility, effectiveItem, recoveryCapacity } from './mechanics';
import { HAZARDS } from './hazards';

export const PIVOT_MOVES = new Set([
	'uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'chillyreception', 'shedtail', 'biansuzhefan',
]);

/** Capacity, not the amount actually restored when a nearly healthy Pokemon uses the move. */
export const recoveryAmount = recoveryCapacity;

export function remainingPP(move: Move, seen?: SeenPokemon): number {
	// Public usage is a lower bound (Pressure and some Fantasy items spend extra PP).
	return Math.max(0, (move.noPPBoosts ? move.pp : Math.floor(move.pp * 8 / 5)) - (seen?.moveUses[move.id] || 0));
}

export function activeTypes(mon: Combatant, dex: ModdedDex): readonly string[] {
	return mon.terastallized && mon.terastallized !== 'Stellar' ? [mon.terastallized] :
		mon.types || dex.species.get(mon.species).types;
}

export function passiveRecovery(mon: Combatant, dex: ModdedDex, memory: BattleMemory): number {
	if (mon.volatiles.includes('healblock')) return 0;
	const types = activeTypes(mon, dex);
	const item = effectiveItem(mon, memory);
	const ability = effectiveAbility(mon);
	let amount = item === 'leftovers' || item === 'blacksludge' && types.includes('Poison') ? 1 / 16 :
		item === 'fantasysyrupyapple' ? 1 / 8 : 0;
	if (ability === 'zengfuxitong') amount *= 2;
	// Life Orb suppresses burn/poison's residual callback, so neither Zhi Liao nor
	// Poison Heal receives that damage event. Dian Liao has its own residual callback.
	if (item !== 'fantasylifeorb') {
		if (ability === 'poisonheal' && ['psn', 'tox'].includes(mon.status)) amount += 1 / 8;
		if (ability === 'zhiliao' && mon.status === 'brn') amount += 1 / 8;
	}
	if (ability === 'dianliao' && mon.status === 'par') amount += 1 / 8;
	if (mon.volatiles.includes('aquaring')) amount += 1 / 16;
	if (mon.volatiles.includes('ingrain')) amount += 1 / 16;
	return amount;
}

export function residualDamage(mon: Combatant, dex: ModdedDex, seen?: SeenPokemon, memory?: BattleMemory): number {
	const ability = effectiveAbility(mon);
	const item = effectiveItem(mon, memory);
	if (ability === 'magicguard') return 0;
	const types = activeTypes(mon, dex);
	let damage = mon.status === 'brn' ? (ability === 'heatproof' ? 1 / 32 : 1 / 16) :
		mon.status === 'psn' ? 1 / 8 : mon.status === 'tox' ? Math.min(15, (seen?.statusTicks || 0) + 1) / 16 : 0;
	if (mon.status === 'fst') damage = 1 / 16;
	if (ability === 'poisonheal' && ['psn', 'tox'].includes(mon.status) || ability === 'zhiliao' && mon.status === 'brn') {
		damage = 0;
	}
	if (item === 'fantasylifeorb' && mon.status) damage = 0.1;
	if (item === 'shadowbottle' && toID(mon.species) === 'lugiafantasy') damage += 1 / 16;
	if (mon.volatiles.includes('saltcure')) damage += types.some(type => ['Water', 'Steel'].includes(type)) ? 1 / 4 : 1 / 8;
	if (mon.volatiles.includes('leechseed')) damage += 1 / 8;
	if (mon.volatiles.includes('curse')) damage += 1 / 4;
	return damage;
}

/** Same public configuration only: do not carry a damage roll across Tera, stat changes or a critical hit. */
export function observedDamage(
	memory: BattleMemory, source: SeenPokemon | undefined, target: SeenPokemon | undefined, move: string,
): number | undefined {
	if (!source || !target) return;
	const context = damageContext(source, target);
	const samples = (memory.moveEvidence || []).filter(entry => entry.user === source.appearance &&
		entry.target === target.appearance && entry.move === move && entry.context === context &&
		(!entry.environment || entry.environment === fieldContext(memory)) &&
		!entry.critical && entry.damage > 0 && entry.damage < entry.targetHealth - 0.02 && entry.turn >= memory.turn - 6);
	if (!samples.length) return;
	return samples.reduce((sum, entry) => sum + entry.damage, 0) / samples.length;
}

export function observedImmunity(
	memory: BattleMemory, source: SeenPokemon | undefined, target: SeenPokemon | undefined, move: string,
): boolean {
	if (!source || !target) return false;
	return (memory.moveEvidence || []).some(entry =>
		entry.user === source.appearance && entry.target === target.appearance && entry.move === move &&
		entry.immune && !entry.damage && !entry.missed &&
		(entry.immunityContext || entry.context) === damageContext(source, target) &&
		entry.environment === fieldContext(memory));
}

/** Repeated attacks that are healed off are evidence to change plans, not proof of the opponent's next input. */
export function stalledAttacks(memory: BattleMemory, source?: SeenPokemon, target?: SeenPokemon): number {
	if (!source || !target) return 0;
	return (memory.moveEvidence || []).filter(entry => entry.user === source.appearance &&
		entry.target === target.appearance && entry.turn >= memory.turn - 4 && entry.damage > 0 &&
		(entry.targetEndHealth ?? 0) >= entry.targetHealth - 0.025).length;
}

export function repeatedRecovery(memory: BattleMemory, mon: SeenPokemon | undefined, dex: ModdedDex): number {
	if (!mon) return 0;
	return (memory.moveEvidence || []).filter(entry => entry.user === mon.appearance &&
		entry.turn >= memory.turn - 3 && recoveryAmount(dex.moves.get(entry.move)) > 0).length;
}

/**
 * Discourage only a losing, unproductive cycle against the same public threat.
 * A pivot, replacement, changed opponent, successful hazard work or net healing
 * breaks the cycle. This is a horizon cost passed through to search, not a ban:
 * escaping an immunity/KO and deliberate sacrifices remain legal candidates.
 */
export function switchCycleCost(memory: BattleMemory, side: 'p1' | 'p2', target: string, ownHealth: number): number {
	const opponentSide = memory.sides[side === 'p1' ? 'p2' : 'p1'];
	const opponent = opponentSide.active;
	if (!opponent) return 0;
	const recent: BattleMemory['switches'] = [];
	for (const entry of memory.switches.slice().reverse()) {
		if (entry.side !== side) continue;
		if (entry.turn < memory.turn - 4 || entry.kind !== 'voluntary' || entry.opponent !== opponent.appearance) break;
		recent.unshift(entry);
	}
	if (!recent.length) return 0;
	const start = recent[0];
	if (start.ownHealth === undefined || start.foeHealth === undefined) return 0;
	const ownLoss = start.ownHealth - ownHealth;
	const boostGain = Object.values(opponent.boosts).reduce((sum, boost) => sum + Math.max(0, boost || 0), 0) -
		(start.foeBoosts || 0);
	if (opponent.health.upper < start.foeHealth - 0.08 || ownLoss < -0.06) return 0;
	if (HAZARDS.some(id => (memory.sides[side].conditions[id] || 0) < (start.ownConditions?.[id] || 0) ||
		(opponentSide.conditions[id] || 0) > (start.foeConditions?.[id] || 0))) return 0;
	if (ownLoss < 0.06 && boostGain <= 0) return 0;
	const name = toID(target.split(': ').slice(1).join(': '));
	const returning = recent.some(entry => toID(entry.from?.split(': ').slice(1).join(': ')) === name);
	return Math.min(55, recent.length * 10 + (returning ? 12 : 0) + Math.max(0, ownLoss) * 30 + boostGain * 8);
}
