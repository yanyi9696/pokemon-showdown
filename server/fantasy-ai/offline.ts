import { Battle, extractChannelMessages } from '../../sim/battle';
import { performance } from 'perf_hooks';
import { PRNG, type PRNGSeed } from '../../sim/prng';
import { toID } from '../../sim/dex';
import { InformationView } from './information';
import { captureInitialTeam } from './initial-snapshot';
import { RulePolicy } from './policy';
import { RolloutPolicy } from './rollout';
import { validatePlayerTeam } from './trainers';
import type { Difficulty, ValidatedTrainer } from './types';

export interface OfflineOptions {
	trainers: [ValidatedTrainer, ValidatedTrainer];
	difficulties: [Difficulty, Difficulty];
	battleSeed: PRNGSeed;
	decisionSeed: PRNGSeed;
	maxTurns?: number;
	strategy?: 'rules' | 'rollout';
	maxRollouts?: number;
	/** Optional development trace, containing spectator-visible protocol only. */
	onPublicUpdate?: (update: string) => void;
}
export interface OfflineResult {
	winner: string;
	turns: number;
	endReason: 'finished' | 'turn-limit' | 'request-limit';
	decisions: number;
	illegalChoices: number;
	probeFailures: number;
	approximateDecisions: number;
	maxDecisionMs: number;
	meanDecisionMs: number;
	rollouts: number;
	searchFallbacks: number;
	budgetStops: number;
	searchIssues: Record<string, number>;
}

/**
 * Development-only synchronous driver. The trusted driver schedules requests;
 * each policy gets only its InformationView. This is not the online controller
 * or a strength benchmark; hard deadlines are enforced separately by DecisionScheduler.
 */
export function runOfflineBattle(options: OfflineOptions): OfflineResult {
	const [first, second] = options.trainers;
	if (first.format !== second.format) throw new Error('离线对照必须使用相同赛制。');
	const maxTurns = options.maxTurns ?? 200;
	if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 1000) throw new Error('离线回合上限必须为 1 至 1000。');
	for (const trainer of options.trainers) {
		const result = validatePlayerTeam(trainer.format, trainer.packedTeam);
		if (result.problems.length) throw new Error(`离线队伍不合法：${result.problems.join('; ')}`);
	}
	const battle = new Battle({
		formatid: toID(first.format), seed: options.battleSeed, strictChoices: false,
		p1: { name: 'AI P1', team: first.packedTeam }, p2: { name: 'AI P2', team: second.packedTeam },
	});
	const result: OfflineResult = {
		winner: '', turns: 0, endReason: 'finished', decisions: 0, illegalChoices: 0, probeFailures: 0,
		approximateDecisions: 0, maxDecisionMs: 0, meanDecisionMs: 0,
		rollouts: 0, searchFallbacks: 0, budgetStops: 0, searchIssues: {},
	};
	try {
		const views = options.difficulties.map((difficulty, index) => {
			const ownSide = index === 0 ? 'p1' : 'p2';
			return new InformationView(difficulty === 'normal' ? { ownSide, difficulty } : {
				ownSide, difficulty, initialOpponent: captureInitialTeam(battle, index === 0 ? 'p2' : 'p1'),
			});
		});
		const policies = options.trainers.map(trainer => new RulePolicy(trainer));
		const searches = options.strategy === 'rollout' ? options.trainers.map(trainer => new RolloutPolicy(trainer)) : null;
		const rng = new PRNG(options.decisionSeed);
		const rejected = [new Map<string, string[]>(), new Map<string, string[]>()];
		let logCursor = 0;
		let decisionMs = 0;
		for (let iteration = 0; !battle.ended && iteration < maxTurns * 8 + 10; iteration++) {
			if (battle.turn > maxTurns) { result.endReason = 'turn-limit'; battle.tie(); break; }
			const update = battle.log.slice(logCursor).join('\n');
			logCursor = battle.log.length;
			for (const view of views) view.receiveUpdate(update);
			options.onPublicUpdate?.(extractChannelMessages(update, [0])[0].join('\n'));
			const pending = battle.sides.map((side, index) => {
				if (!side.activeRequest || side.activeRequest.wait || side.isChoiceDone()) return null;
				const request = side.activeRequest;
				const observation = views[index].observe(request);
				const fingerprint = JSON.stringify(observation.request);
				const started = performance.now();
				const excluded = rejected[index].get(fingerprint);
				const search = searches?.[index].decide(observation, rng.getSeed(), { maxRollouts: options.maxRollouts, excluded });
				const decision = search || policies[index].decide(observation, rng.getSeed(), excluded);
				if (search) {
					result.rollouts += search.rollouts;
					if (search.method === 'rules' && search.phase === 'move') result.searchFallbacks++;
					if (search.stopReason === 'budget') result.budgetStops++;
					if (search.stopReason === 'unsupported') {
						const issue = search.diagnostics.find(note =>
							/^(unsupported|no-|invalid-|unresolved|unmatched|missing)/.test(note)) || 'other';
						result.searchIssues[issue] = (result.searchIssues[issue] || 0) + 1;
					}
				}
				rng.random();
				const elapsed = performance.now() - started;
				result.decisions++;
				decisionMs += elapsed;
				result.maxDecisionMs = Math.max(result.maxDecisionMs, elapsed);
				if (decision.diagnostics.some(note => note.startsWith('probe-failed:'))) result.probeFailures++;
				if (decision.diagnostics.some(note => note.startsWith('approximate-volatile:'))) result.approximateDecisions++;
				return { request, choice: decision.choice, fingerprint };
			});
			for (const [index, decision] of pending.entries()) {
				if (!decision?.choice || battle.ended || battle.sides[index].activeRequest !== decision.request) continue;
				if (!battle.choose(index === 0 ? 'p1' : 'p2', decision.choice)) {
					result.illegalChoices++;
					const failed = rejected[index].get(decision.fingerprint) || [];
					failed.push(decision.choice);
					rejected[index].set(decision.fingerprint, failed);
				}
			}
		}
		if (!battle.ended) { result.endReason = 'request-limit'; battle.tie(); }
		result.winner = battle.winner || '';
		result.turns = Math.min(battle.turn, maxTurns);
		result.meanDecisionMs = decisionMs / Math.max(1, result.decisions);
		options.onPublicUpdate?.(extractChannelMessages(battle.log.slice(logCursor).join('\n'), [0])[0].join('\n'));
		return result;
	} finally {
		battle.destroy();
	}
}
