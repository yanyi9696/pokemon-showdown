import type { Battle } from './battle';
import { rogueBattleResult, type RogueBattleResult } from './fantasy-rogue';

/** Trusted simulator data only: includes private teams, choices and the real PRNG state. Never expose in a client view or AI observation. */
export interface RogueCoopCheckpoint {
	version: 1;
	sequence: number;
	state: AnyObject;
	result: RogueBattleResult;
}

export function captureCoopCheckpoint(battle: Battle): RogueCoopCheckpoint | undefined {
	const rogue = battle.fantasyRogue;
	if (!rogue?.persistCoop || !rogue.partner || !battle.started || battle.sides.some(side => !side)) return;
	rogue.checkpointSequence = (rogue.checkpointSequence || 0) + 1;
	return { version: 1, sequence: rogue.checkpointSequence, state: battle.toJSON(),
		result: rogueBattleResult(battle, battle.ended) };
}

export function validCoopCheckpoint(checkpoint: RogueCoopCheckpoint, encounterId: string): boolean {
	const state = checkpoint?.state;
	return checkpoint?.version === 1 && Number.isSafeInteger(checkpoint.sequence) && checkpoint.sequence > 0 &&
		state?.formatid === 'gen9fantasyroguecoop' && state.fantasyRogue?.persistCoop === true &&
		state.fantasyRogue.encounterId === encounterId && state.fantasyRogue.checkpointSequence === checkpoint.sequence &&
		checkpoint.result?.encounterId === encounterId && Array.isArray(state.sides) && state.sides.length === 4 &&
		state.sides.every((side: AnyObject, index: number) => side?.id === `p${index + 1}`);
}
