import { Dex } from '../../sim/dex';
import { enumerateRequestChoices } from './actions';
import type { Observation } from './information';
import { parseHealth, readBattleMemory } from './memory';
import { DEFAULT_LIMITS } from './types';

export interface TimeBudgetSettings {
	decisionMs: number | null;
	criticalDecisionMs?: number;
	criticalDecisionLimit?: number;
	criticalDecisionCooldownTurns?: number;
}

export type CriticalReason = 'endgame-resource' | 'endgame-damage-race' | 'boosted-threat';
interface DecisionWindow { deadline: number; criticalReason?: CriticalReason }

/** Public, inexpensive eligibility only. Never instantiate a Battle on the server thread. */
function criticalReason(
	observation: Observation, format: string, excluded: readonly string[],
): CriticalReason | undefined {
	const request = observation.request;
	if (request.wait || request.teamPreview || request.forceSwitch) return;
	const memory = readBattleMemory(observation.publicLog, Dex.forFormat(format));
	const own = memory.sides[observation.ownSide];
	const foe = memory.sides[observation.ownSide === 'p1' ? 'p2' : 'p1'];
	const current = request.side.pokemon.find(mon => mon.active);
	const opponent = foe.active;
	if (!current || !opponent?.health.upper) return;
	const choices = enumerateRequestChoices(request, own.resources).filter(choice => !excluded.includes(choice));
	if (choices.length < 2) return;
	const alive = request.side.pokemon.filter(mon => parseHealth(mon.condition, true).upper > 0).length;
	if (alive > 3) return;
	const health = parseHealth(current.condition, true).upper;
	if (!health) return;
	// Unseen/ambiguous members count as alive. A disguised faint must not turn
	// an ordinary position into a supposed last-Pokemon emergency.
	const latest = new Map(foe.appearances.map(mon => [mon.ident, mon]));
	const fainted = [...latest.values()].filter(mon => !mon.ambiguousIdentity && mon.health.upper === 0).length;
	const foeAlive = Math.max(1, (foe.preview.length || 6) - fainted);
	const attackBoost = Math.max(opponent.boosts.atk || 0, opponent.boosts.spa || 0);
	if (opponent.health.upper > 0.25 && (attackBoost >= 2 || attackBoost >= 1 && (opponent.boosts.spe || 0) >= 1)) {
		return 'boosted-threat';
	}
	const resourceChoice = choices.some(choice => choice.startsWith('move ') && choice.split(' ').length > 2);
	if (foeAlive <= 3 && health <= 0.65 && resourceChoice) {
		return 'endgame-resource';
	}
	if (alive <= 2 && foeAlive <= 2 && health <= 0.4 && opponent.health.upper <= 0.5) return 'endgame-damage-race';
}

/**
 * One ledger per battle: at most two rare long decisions by default, separated
 * by ten turns. Retries share a window even when their rqid/disabled moves
 * change. A new phase or active member (e.g. a pivot replacement) is a new
 * decision, but never another critical allocation in the same battle turn.
 */
export class DecisionTimeManager {
	private turn = -1;
	private readonly windows = new Map<string, DecisionWindow>();
	private lastCriticalTurn = -Infinity;
	criticalDecisions = 0;
	readonly criticalReasons: Partial<Record<CriticalReason, number>> = {};
	private readonly settings: TimeBudgetSettings;

	constructor(settings: TimeBudgetSettings) { this.settings = settings; }

	allocate(
		observation: Observation, turn: number, received: number, format: string, excluded: readonly string[],
	): DecisionWindow {
		if (this.turn !== turn) { this.windows.clear(); this.turn = turn; }
		const request = observation.request;
		const phase = request.wait ? 'wait' : request.teamPreview ? 'preview' : request.forceSwitch ? 'switch' : 'move';
		const active = request.side.pokemon.find(mon => mon.active)?.ident || '';
		const key = `${phase}:${active}`;
		const previous = this.windows.get(key);
		if (previous) return previous;
		let budget = this.settings.decisionMs;
		const extended = this.settings.criticalDecisionMs ?? DEFAULT_LIMITS.criticalDecisionMs;
		const limit = this.settings.criticalDecisionLimit ?? DEFAULT_LIMITS.criticalDecisionLimit;
		const cooldown = this.settings.criticalDecisionCooldownTurns ?? DEFAULT_LIMITS.criticalDecisionCooldownTurns;
		let reason: CriticalReason | undefined;
		if (budget !== null && budget > 0 && extended > budget && phase === 'move' &&
			turn >= 10 && turn - this.lastCriticalTurn >= cooldown && this.criticalDecisions < limit) {
			reason = criticalReason(observation, format, excluded);
			if (reason) {
				budget = extended;
				this.lastCriticalTurn = turn;
				this.criticalDecisions++;
				this.criticalReasons[reason] = (this.criticalReasons[reason] || 0) + 1;
			}
		}
		const window = { deadline: budget === null ? Infinity : received + budget, criticalReason: reason };
		this.windows.set(key, window);
		return window;
	}
}
