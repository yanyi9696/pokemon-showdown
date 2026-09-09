/** Data crossing the AI boundary must be JSON, never live simulator objects. */
export type Difficulty = 'normal' | 'hard';
export type TrainerStyle = 'balanced' | 'aggressive' | 'defensive';
export type ResourcePreference = 'mega' | 'zmove' | 'terastallize' | 'aura';

export interface TrainerDefinition {
	id: string;
	name: string;
	/** Existing client trainer avatar identifier; never an arbitrary URL. */
	avatar?: string;
	description?: string;
	format: string;
	/** Showdown import text, not a generated or packed team. */
	team: string;
	style: TrainerStyle;
	/** One-based positions in the trainer's original team. */
	keyMembers?: number[];
	resourcePreferences?: ResourcePreference[];
	developmentOnly?: boolean;
}

export interface TrainerSummary {
	id: string;
	name: string;
	avatar: string;
	description: string;
	format: string;
	style: TrainerStyle;
	developmentOnly: boolean;
}

export interface ValidatedTrainer extends TrainerSummary {
	packedTeam: string;
	keyMembers: number[];
	resourcePreferences: ResourcePreference[];
}

export interface TrainerDiagnostic {
	index: number;
	id: string;
	problems: string[];
}

/** These limits will be shared by both difficulty levels. */
export const DEFAULT_LIMITS = Object.freeze({
	workers: 1,
	maxBattles: 2,
	maxBattlesPerPlayer: 1,
	/** Normal decisions have a hard deadline; null remains an explicit development override. */
	decisionMs: 10000 as number | null,
	criticalDecisionMs: 20000,
	criticalDecisionLimit: 2,
	criticalDecisionCooldownTurns: 10,
	/** Explicit finite budgets are still available to development tools. */
	maxRollouts: null as number | null,
	disconnectMs: 10 * 60 * 1000,
	ownCandidates: 6,
	criticalOwnCandidates: 8,
	opponentCandidates: 4,
	hypotheses: 4,
	samples: 2,
	searchDepth: 4,
	criticalSearchDepth: 6,
	/** Only narrow the root choices when an explicit finite budget was requested. */
	deepCandidates: 3,
	criticalDeepCandidates: 4,
});
