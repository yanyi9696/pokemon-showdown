import { performance } from 'perf_hooks';
import type { DoublesChoice } from './doubles-actions';
import { rankDoublesChoices, type DoublesScoredChoice } from './doubles-policy';
import type { Observation } from './information';
import type { SearchDecision } from './rollout';

/** Server-owned candidate mapping, never a client-supplied action list. */
export interface DoublesWorkerOptions {
	allowSwitch: boolean;
	/** Trusted trainer/boss rooms opt in; wild encounters retain the lighter move ranking. */
	jointTurns?: boolean;
	/** Multi seats retain independently legal transformations and native reserve commands. */
	candidates?: DoublesChoice[];
}

/** Runs inside the existing bounded decision worker, using detached public-information inputs. */
export function decideDoubles(
	observation: Observation, format: string, excluded: readonly string[], options: DoublesWorkerOptions,
	onProgress?: (decision: SearchDecision) => void,
): SearchDecision {
	const start = performance.now();
	const result = (scored: DoublesScoredChoice[]): SearchDecision => ({
		choice: scored[0]?.choice || (observation.request.wait ? null : 'default'),
		candidates: scored.slice(0, 8).map(({ choice, score, reasons }) => ({ choice, score, reasons })),
		phase: observation.request.wait ? 'wait' : observation.request.forceSwitch ? 'switch' : 'move',
		diagnostics: scored.length ? [] : ['doubles-policy-no-candidate'],
		method: 'rules', rollouts: 0, rounds: 0, stopReason: 'complete', elapsedMs: performance.now() - start,
		doubles: { candidates: scored.length, mechanics: scored[0]?.mechanics, jointTurn: scored[0]?.jointTurn },
	});
	const scored = rankDoublesChoices(observation, format, excluded, options.allowSwitch, options.candidates,
		options.jointTurns, onProgress ? baseline => onProgress(result(baseline)) : undefined);
	return result(scored);
}
