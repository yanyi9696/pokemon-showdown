import { Battle } from '../../sim/battle';
import { PRNG, type PRNGSeed } from '../../sim/prng';
import { captureOpponentChoice, type OpponentChoiceState } from './opponent-choice';

/** Detached simulator state, with the real random stream and logs removed. */
export interface FullBattleState {
	state: AnyObject;
	/** Choice already accepted for this request; null when the opponent has no request. */
	choice: string | null;
	phase: string;
}

const PRIVATE_SEED = 'gen5,0000000000000000';

/** Only trusted simulator adapters may call this; never send the result to a client. */
export function captureFullState(battle: Battle, opponent: 'p1' | 'p2'): FullBattleState {
	const player = battle.getSide(opponent);
	const state = battle.toJSON();
	// Replace both seed fields BEFORE the JSON copy crosses the AI boundary.
	state.prng = PRIVATE_SEED;
	state.prngSeed = PRIVATE_SEED;
	state.log = [];
	state.inputLog = [];
	state.messageLog = [];
	state.hints = [];
	state.sentLogPos = 0;
	return {
		state: JSON.parse(JSON.stringify(state)), phase: battle.requestState,
		choice: player.activeRequest && !player.activeRequest.wait && player.isChoiceDone() ? player.getChoice() : null,
	};
}

/** Each reconstruction owns its complete mutable graph and independent random source. */
export function restoreFullState(snapshot: FullBattleState, seed: PRNGSeed): Battle {
	const state = structuredClone(snapshot.state);
	state.prng = seed;
	state.prngSeed = seed;
	const battle = Battle.fromJSON(state);
	battle.prng = new PRNG(seed);
	return battle;
}

export function captureFullChoice(battle: Battle, opponent: 'p1' | 'p2', version: number): OpponentChoiceState {
	const player = battle.getSide(opponent);
	const request = player.activeRequest;
	const ready = !request || !!request.wait || player.isChoiceDone();
	const legacy = captureOpponentChoice(battle, opponent, version);
	return { ...legacy, ready, ...(ready && !battle.ended ? { fullState: captureFullState(battle, opponent) } : {}) };
}
