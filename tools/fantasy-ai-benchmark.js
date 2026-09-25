'use strict';

// Paired offline comparisons, using the same legal teams, seeds and information
// permissions for both versions. Run `node build` before invoking this tool.
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { runOfflineBattle } = require('../dist/server/fantasy-ai/offline');
const { TrainerRegistry } = require('../dist/server/fantasy-ai/trainers');

function main() {
	const args = process.argv.slice(2);
	const option = (name, fallback) => {
		const index = args.indexOf(`--${name}`);
		return index >= 0 ? args[index + 1] : fallback;
	};
	const baselinePath = option('baseline');
	if (!baselinePath) throw new Error('Specify --baseline <directory containing the previous compiled AI modules>.');
	const baseline = {
		RulePolicy: require(path.resolve(baselinePath, 'policy.js')).RulePolicy,
		RolloutPolicy: require(path.resolve(baselinePath, 'rollout.js')).RolloutPolicy,
	};
	const currentPath = option('current', path.join(__dirname, '../dist/server/fantasy-ai'));
	const current = {
		RulePolicy: require(path.resolve(currentPath, 'policy.js')).RulePolicy,
		RolloutPolicy: require(path.resolve(currentPath, 'rollout.js')).RolloutPolicy,
	};
	const difficulties = option('difficulties', 'normal,hard').split(',');
	const opponentDifficulty = option('opponent-difficulty');
	if (difficulties.some(difficulty => !['normal', 'hard'].includes(difficulty)) ||
		opponentDifficulty && !['normal', 'hard'].includes(opponentDifficulty)) {
		throw new Error('Use --difficulties normal,hard (or either one).');
	}
	const strategy = option('strategy', 'rules');
	const games = Number(option('games', '2'));
	const maxTurns = Number(option('max-turns', '120'));
	const maxRollouts = Number(option('max-rollouts', '12'));
	const budgetMs = Number(option('budget-ms', '3000'));
	if (!['rules', 'rollout'].includes(strategy) || !Number.isInteger(games) || games < 2 || games % 2 || games > 100 ||
		!Number.isInteger(maxRollouts) || maxRollouts < 0 || !Number.isFinite(budgetMs) || budgetMs < 0) {
		throw new Error('Use rules/rollout, an even --games count from 2 to 100, and nonnegative work/time limits.');
	}
	const registry = new TrainerRegistry(require('../dist/config/fantasy-ai-trainers').Trainers,
		{ enabled: true, allowDevelopmentTrainers: false });
	const trainers = option('trainers', 'acelora-ou,acelora-ubuu,acelora-uu').split(',').map(id => {
		const trainer = registry.get(id);
		if (!trainer) throw new Error(`Unknown trainer ${id}: ${JSON.stringify(registry.getDiagnostics())}`);
		return trainer;
	});
	const output = option('output');
	const emit = record => {
		const line = JSON.stringify(record);
		if (output) fs.appendFileSync(output, `${line}\n`);
		process.stdout.write(`${line}\n`);
	};
	for (const trainer of trainers) {
		for (const difficulty of difficulties) {
			for (let game = 0; game < games; game++) {
				const seed = `gen5,000100020003${(4 + Math.floor(game / 2)).toString(16).padStart(4, '0')}`;
				const newSide = game % 2 ? 'p2' : 'p1';
				const counters = () => ({ decisions: 0, ms: 0, maxMs: 0, rollouts: 0,
					searchFallbacks: 0, searchIssues: {} });
				const metrics = { current: counters(), baseline: counters() };
				const result = runOfflineBattle({
					trainers: [trainer, trainer], difficulties: newSide === 'p1' ?
						[difficulty, opponentDifficulty || difficulty] : [opponentDifficulty || difficulty, difficulty],
					battleSeed: seed, decisionSeed: seed, maxTurns, strategy, maxRollouts, budgetMs,
					createPolicy(definition, side) {
						const version = side === newSide ? 'current' : 'baseline';
						const implementation = version === 'current' ? current : baseline;
						const wrap = policy => ({ decide(...parameters) {
							const start = performance.now();
							const decision = policy.decide(...parameters);
							const duration = performance.now() - start;
							metrics[version].decisions++;
							metrics[version].ms += duration;
							metrics[version].maxMs = Math.max(metrics[version].maxMs, duration);
							metrics[version].rollouts += decision.rollouts || 0;
							if (decision.method === 'rules' && decision.phase === 'move') metrics[version].searchFallbacks++;
							if (decision.stopReason === 'unsupported') {
								const issue = decision.diagnostics.find(note =>
									/^(unsupported|no-|invalid-|unresolved|unmatched|missing)/.test(note)) || 'other';
								metrics[version].searchIssues[issue] = (metrics[version].searchIssues[issue] || 0) + 1;
							}
							return decision;
						} });
						return { rules: wrap(new implementation.RulePolicy(definition)),
							search: strategy === 'rollout' ? wrap(new implementation.RolloutPolicy(definition)) : undefined };
					},
				});
				const winner = !result.winner ? 'draw' : result.winner === `AI ${newSide.toUpperCase()}` ? 'current' : 'baseline';
				emit({ trainer: trainer.id, difficulty, opponentDifficulty: opponentDifficulty || difficulty,
					strategy, game, seed, newSide, metrics, ...result,
					versionWinner: winner });
			}
		}
	}
}

if (require.main === module) main();
