/** Data crossing the AI boundary must be JSON, never live simulator objects. */
export type Difficulty = 'normal' | 'hard';
export type TrainerStyle = 'balanced' | 'aggressive' | 'defensive';
export type ResourcePreference = 'mega' | 'zmove' | 'terastallize' | 'aura';

export interface TrainerDefinition {
	id: string;
	name: string;
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
	decisionMs: 5000,
	disconnectMs: 10 * 60 * 1000,
	ownCandidates: 6,
	opponentCandidates: 4,
	hypotheses: 4,
	samples: 2,
});
