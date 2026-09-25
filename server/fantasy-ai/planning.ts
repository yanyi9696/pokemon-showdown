import type { Combatant } from './hypotheses';
import { entryHazards, type HazardMember } from './hazards';
import type { BattleMemory, SinglesSide } from './memory';
import type { MoveEstimate } from './matchup';
import { actionOpportunity, recoveryCapacity } from './mechanics';

type Probe = (attacker: Combatant, defender: Combatant, id: string, event?: string, side?: SinglesSide) => MoveEstimate;

/**
 * A bounded, team-relative preservation value. A member earns extra value when
 * it is one of the few remaining answers to a disclosed/hypothesized threat.
 * Damage, immunities, priority and speed are probed through the Fantasy engine.
 * This is a short-horizon estimate, not a claim to have solved the endgame.
 */
export function teamResourceValues(
	own: readonly Combatant[], roster: readonly HazardMember[], dex: ModdedDex,
	memory: BattleMemory, side: SinglesSide, probe: Probe,
): number[] {
	const foe = side === 'p1' ? 'p2' : 'p1';
	const values = own.map(() => 0);
	const threats = new Map<string, HazardMember>();
	for (const member of roster) {
		if (member.profile.health.upper <= 0) continue;
		const key = member.profile.species;
		if (!threats.has(key) || member.probability > threats.get(key)!.probability) threats.set(key, member);
	}
	for (const { profile: target } of threats.values()) {
		const answers = own.map(mon => {
			if (mon.health.upper <= 0) return 0;
			const entry = entryHazards(mon, memory.sides[side].conditions, dex, memory);
			const current = mon.appearance && mon.appearance === memory.sides[side].active?.appearance;
			const health = mon.health.upper - (current ? 0 : entry.damage);
			if (health <= 0) return 0;
			const ready = { ...mon, health: { lower: Math.max(0, health - 0.01), upper: health } };
			const incoming = target.moves.filter(id => dex.moves.get(id).category !== 'Status')
				.map(id => probe(target, ready, id, '', foe));
			const damage = Math.max(0, ...incoming.map(reply => reply.damage));
			return Math.max(0, ...mon.moves.filter(id => dex.moves.get(id).category !== 'Status').map(id => {
				const attack = probe(ready, target, id, '', side);
				const fatal = Math.max(0, ...incoming.map(reply => {
					const first = attack.priority !== reply.priority ? Number(attack.priority > reply.priority) :
						attack.speed === attack.opponentSpeed ? 0.5 : Number(memory.pseudoWeather.includes('trickroom') ?
							attack.speed < attack.opponentSpeed : attack.speed > attack.opponentSpeed);
					return reply.knockout * (1 - first * attack.knockout);
				}));
				const healing = Math.max(0, ...mon.moves.map(moveID => recoveryCapacity(dex.moves.get(moveID), ready, memory)));
				const wall = damage < Math.min(health * 0.45, healing) && attack.damage > 0.12 ? 0.25 : 0;
				return ((Math.min(1, attack.damage) * 0.55 + attack.knockout * 0.65) * (1 - fatal) + wall) *
					actionOpportunity(ready, dex.moves.get(id), memory);
			}));
		});
		for (let index = 0; index < own.length; index++) {
			const alternative = Math.max(0, ...answers.filter((_, other) => other !== index));
			values[index] += Math.max(0, answers[index] - alternative) * 38 + answers[index] * 4;
		}
	}
	return values.map(value => Math.min(70, value));
}

/** When materially behind, preserve plausible winning lines instead of minimizing every possible loss. */
export function adaptiveRisk(style: 'balanced' | 'aggressive' | 'defensive', own: number, foe: number): number {
	const base = { balanced: 0.2, aggressive: 0.1, defensive: 0.35 }[style];
	return Math.max(0.04, Math.min(0.45, base + Math.max(-2, Math.min(2, own - foe)) * 0.08));
}

/** Unsearched replies keep their heuristic prior instead of disappearing from the decision. */
export function coverageAdjustedScore(search: number, prior: number, coveredMass: number): number {
	const confidence = Math.max(0, Math.min(1, coveredMass));
	return search * confidence + prior * (1 - confidence);
}
