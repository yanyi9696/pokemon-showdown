import { AIChallengeManager, type AISettings } from '../fantasy-ai/manager';

export const DEFAULT_ROGUE_BATTLES = 128;
export interface RogueBattleCapacity {
	enabled?: boolean;
	maxBattles?: number;
	battleWorkers?: number;
}

/** Campaign rooms and search jobs must never consume ordinary AI challenge slots. */
export function createRogueAIManager(
	rogue: RogueBattleCapacity = Config.fantasyrogue, ai: AISettings = Config.fantasyai,
) {
	return new AIChallengeManager([], {
		...ai,
		enabled: rogue?.enabled === true,
		allowDevelopmentTrainers: false,
		maxBattles: rogue?.maxBattles ?? DEFAULT_ROGUE_BATTLES,
		// Solo and co-op share this per-participant guard, independent of ordinary AI battles.
		maxBattlesPerPlayer: 1,
		// Undefined uses the scheduler's CPU-capped default, not the ordinary AI pool's setting.
		workers: rogue?.battleWorkers,
	});
}

let manager: AIChallengeManager | undefined;
/** Server-owned settings are applied on restart, just like the ordinary AI manager. */
export function getRogueAIManager() {
	if (!manager) manager = createRogueAIManager();
	return manager;
}
