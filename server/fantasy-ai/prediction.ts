import type { Combatant, OpponentHypothesis } from './hypotheses';
import type { Observation } from './information';
import type { BattleMemory, SinglesSide } from './memory';
import { canEscapeMatchup, CONDITIONAL_ATTACKS, estimateEntry, type MoveEstimate } from './matchup';
import type { ScoredChoice } from './policy';
import { entryHazards, type HazardMember } from './hazards';
import { switchCycleCost } from './strategy';

type Probe = (
	attacker: Combatant, defender: Combatant, id: string, event?: string, side?: SinglesSide, context?: BattleMemory,
	reply?: { id: string, event?: string } | null,
) => MoveEstimate;

/**
 * Predict replacements from the public roster / authorized initial sets. This
 * distribution is fixed before scoring our actions: no real switch slot or
 * speculative counter-switch is passed into the opponent's choice model.
 */
export function anticipateSwitches(
	ranked: ScoredChoice[], observation: Observation, memory: BattleMemory, own: Combatant[],
	opponents: OpponentHypothesis[], roster: HazardMember[], dex: ModdedDex, probe: Probe,
	format: string,
) {
	const request = observation.request;
	if (!('active' in request)) return;
	const side = observation.ownSide;
	const foe = side === 'p1' ? 'p2' : 'p1';
	const current = own[request.side.pokemon.findIndex(mon => mon.active)];
	const selected = observation.difficulty === 'hard' ? observation.opponentMove : undefined;
	if (!current || selected !== undefined && selected !== null) return;
	const seen = memory.sides[foe].active;
	if (!seen) return;
	const attackSlots = request.active[0].moves.flatMap((move, index) =>
		!move.disabled && (move as { pp?: number }).pp !== 0 ? [{ id: move.id, slot: index + 1 }] : []);
	const attacks = (mon: Combatant, target: Combatant, attackingSide: SinglesSide, context = memory) => {
		const ids = mon === current ? attackSlots.map(move => move.id) : mon.moves;
		return ids.filter(id => dex.moves.get(id).category !== 'Status')
			.map(id => probe(mon, target, id, '', attackingSide, context));
	};
	const threat = (mon: Combatant, target: Combatant, attackingSide: SinglesSide, context = memory) =>
		Math.max(0, ...attacks(mon, target, attackingSide, context).map(attack => attack.damage + attack.knockout * 0.6));
	const total = opponents.reduce((sum, mon) => sum + mon.probability, 0);
	if (!total) return;
	const stayThreat = opponents.reduce((sum, mon) => sum + threat(current, mon, side) * mon.probability / total, 0);
	// A bounded representative per species is enough to retain a counter-switch
	// at the root. Full-turn search subsequently compares legal set hypotheses.
	const species = new Set<string>();
	const reserves = roster.filter(member => !member.active && member.profile.health.upper > 0)
		.sort((a, b) => b.probability - a.probability).filter(member => {
			const name = member.profile.species;
			if (species.has(name)) return false;
			species.add(name);
			return true;
		}).slice(0, 5).flatMap(member => {
			const entry = estimateEntry(format, member.profile, current, memory, foe);
			if (entry.entrant.health.upper <= 0) return [];
			const mon = entry.entrant;
			const danger = threat(entry.opponent, mon, side, entry.memory);
			return [{ mon, danger, current: entry.opponent, field: entry.memory,
				score: -danger * 90 + Math.min(1, threat(mon, entry.opponent, foe, entry.memory)) * 25 - entry.damage * 90 }];
		});
	if (!reserves.length) return;
	reserves.sort((a, b) => b.score - a.score);
	const safest = reserves[0];
	const escaping = stayThreat - safest.danger;
	let chance = selected === null ? 1 : Math.min(0.9, Math.max(0, (escaping - 0.15) * 1.15));
	if (selected !== null) {
		// Valuable boosts discourage abandoning a position. A revealed trapping
		// ability rules out predictions that depend on an unavailable switch.
		if (Object.values(seen.boosts).some(boost => boost && boost >= 2)) chance *= 0.4;
		chance *= opponents.reduce((sum, mon) => sum +
			Number(canEscapeMatchup(format, mon, current, memory, foe)) * mon.probability / total, 0);
	}
	if (chance < 0.15) return;
	const likely = reserves.slice(0, 3).map(entry => ({ ...entry, weight: Math.exp((entry.score - safest.score) / 18) }));
	const weight = likely.reduce((sum, entry) => sum + entry.weight, 0);
	for (const entry of likely) entry.weight /= weight;
	const pressure = (mon: Combatant, target: Combatant, context = memory) => {
		const incoming = attacks(target, mon, foe, context);
		const outgoing = attacks(mon, target, side, context);
		return Math.max(0, ...outgoing.map(attack => {
			const fatalBefore = Math.max(0, ...incoming.map(reply => {
				const first = attack.priority !== reply.priority ? attack.priority > reply.priority :
					memory.pseudoWeather.includes('trickroom') ? attack.speed < reply.speed : attack.speed > reply.speed;
				return first ? 0 : reply.knockout;
			}));
			return (attack.damage * 65 + attack.knockout * 70) * (1 - fatalBefore);
		})) - Math.max(0, ...incoming.map(attack => attack.damage * 45 + attack.knockout * 65));
	};
	const staying = likely.map(entry => pressure(entry.current, entry.mon, entry.field));
	for (const candidate of ranked) {
		const [kind, slot, event = ''] = candidate.choice.split(' ');
		if (kind === 'move') {
			const id = request.active[0].moves[Number(slot) - 1]?.id;
			if (!id) continue;
			const value = (target: Combatant, user = current, context = memory) => {
				const attack = probe(user, target, id, event, side, context,
					user !== current && CONDITIONAL_ATTACKS.has(id) ? null : undefined);
				return { attack, score: attack.damage * 90 + attack.knockout * 100 + attack.status * 20 + attack.disruption * 15 };
			};
			const before = opponents.reduce((sum, mon) => sum + value(mon).score * mon.probability / total, 0);
			let after = 0;
			for (const entry of likely) {
				const outcome = value(entry.mon, entry.current, entry.field);
				after += outcome.score * entry.weight;
				if (outcome.attack.ineffective < 0.999) candidate.ineffective = false;
			}
			candidate.score += (after - before) * chance;
			candidate.reasons.push('predicted-switch');
		} else if (kind === 'switch') {
			const index = Number(slot) - 1;
			const mon = own[index];
			const entry = entryHazards(mon, memory.sides[side].conditions, dex, memory);
			if (entry.damage >= mon.health.upper) continue;
			const entrant = { ...mon, health: {
				lower: Math.max(0, mon.health.lower - entry.damage), upper: mon.health.upper - entry.damage,
			} };
			const improvement = likely.reduce((sum, target, i) => sum +
				(pressure(entrant, target.mon, target.field) - staying[i]) * target.weight, 0);
			const cycle = switchCycleCost(memory, side, request.side.pokemon[index].ident,
				own.reduce((sum, member) => sum + member.health.upper, 0));
			const lostBoosts = Object.values(current.boosts).reduce((sum, boost) => sum + Math.max(0, boost || 0), 0) * 5;
			const gain = improvement * 0.65 - entry.damage * 100 - cycle - lostBoosts - 8;
			candidate.score = candidate.score * (1 - chance) + gain * chance;
			// Preserve a modest positional gain in short searches where both switches
			// deal no immediate damage. Entry risks remain in the native turn outcome.
			candidate.strategic = (candidate.strategic || 0) * (1 - chance) + Math.max(-25, Math.min(25, gain * 0.4)) * chance;
			if (gain > 12) candidate.reasons.push('double-switch');
		}
	}
}
