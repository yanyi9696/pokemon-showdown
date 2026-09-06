import { performance } from 'perf_hooks';
import type { Battle } from '../../sim/battle';
import { PRNG, type PRNGSeed } from '../../sim/prng';
import { Teams } from '../../sim/teams';
import { InformationView, type Observation } from './information';
import type { SinglesSide } from './memory';
import { RulePolicy, type RuleDecision } from './policy';
import { reconstructWorld } from './reconstruction';
import { DEFAULT_LIMITS, type ValidatedTrainer } from './types';
import { WorldBuilder, type WorldHypothesis } from './world';

export interface SearchDecision extends RuleDecision {
	method: 'rules' | 'rollout';
	rollouts: number;
	rounds: number;
	stopReason: 'complete' | 'budget' | 'phase' | 'unsupported';
	elapsedMs: number;
}
export interface SearchOptions {
	budgetMs?: number;
	/** A lower work cap is useful for deterministic regression tests and offline development. */
	maxRollouts?: number;
	excluded?: readonly string[];
	onProgress?: (decision: SearchDecision) => void;
}

function observeHypothesis(battle: Battle, world: WorldHypothesis, side: SinglesSide): Observation {
	const view = new InformationView(side === world.ownSide && world.initialOpponent ? {
		ownSide: side, difficulty: 'hard', initialOpponent: world.initialOpponent,
	} : { ownSide: side, difficulty: 'normal' });
	view.receiveUpdate(battle.log.join('\n'));
	return view.observe(battle.getSide(side).activeRequest!);
}

function positionValue(battle: Battle, side: SinglesSide): number {
	const team = battle.getSide(side);
	let value = team.pokemon.reduce((sum, mon) => {
		if (mon.fainted) return sum;
		const statusCost = mon.status === 'slp' || mon.status === 'frz' ? 22 : mon.status ? 12 : 0;
		const attacks = mon.moveSlots.filter(slot => slot.pp > 0 && battle.dex.moves.get(slot.id).category !== 'Status');
		let boosts = 0;
		if (mon.isActive) {
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) {
				if (stat === 'atk' && !attacks.some(slot => battle.dex.moves.get(slot.id).category === 'Physical')) continue;
				if (stat === 'spa' && !attacks.some(slot => battle.dex.moves.get(slot.id).category === 'Special')) continue;
				boosts += mon.boosts[stat] * (stat === 'atk' || stat === 'spa' ? 16 : 8);
			}
		}
		const exhausted = !attacks.length && mon.moves.some(id => battle.dex.moves.get(id).category !== 'Status');
		if (exhausted) boosts *= 0.2;
		// Healing now can otherwise look free forever in a one-turn horizon.
		const pp = mon.moveSlots.reduce((remaining, slot) => {
			const move = battle.dex.moves.get(slot.id);
			const recovery = move.heal || ['rest', 'wish', 'strengthsap'].includes(slot.id);
			return remaining + slot.pp / Math.max(1, slot.maxpp) * (recovery ? 24 : 8);
		}, 0);
		return sum + 120 + mon.hp / mon.maxhp * 80 - statusCost + boosts + pp +
			(mon.volatiles.substitute ? 12 : 0) - (mon.isActive && exhausted ? 20 : 0);
	}, 0);
	for (const [id, condition] of Object.entries(team.sideConditions)) {
		if (['spikes', 'toxicspikes', 'stealthrock', 'stickyweb', 'gmaxsteelsurge'].includes(id)) {
			value -= 10 * (condition.layers || 1);
		} else if (['reflect', 'lightscreen', 'auroraveil', 'tailwind', 'safeguard'].includes(id)) {
			value += 12;
		}
	}
	if (team.zMoveUsed) value -= 15;
	if (team.pokemon.some(mon => mon.terastallized)) value -= 12;
	if (team.pokemon.some(mon => mon.species.isMega)) value -= 5;
	return value;
}

export interface TurnResult {
	value: number;
	turn: number;
	ended: boolean;
	additionalChoices: number;
	log: string[];
	invalidSide?: SinglesSide;
}

/** Both initial actions are fixed before simulation; additional requests only read detached observations. */
export function simulateTurn(
	world: WorldHypothesis, choices: Record<SinglesSide, string>, seed: PRNGSeed,
	continuation: (observation: Observation, seed: PRNGSeed) => string,
	deadline = Infinity,
): TurnResult {
	const battle = reconstructWorld(world, seed);
	const foe = world.ownSide === 'p1' ? 'p2' : 'p1';
	const base = positionValue(battle, world.ownSide) - positionValue(battle, foe);
	const cursor = battle.log.length;
	let additionalChoices = 0;
	const decisionRng = new PRNG(seed);
	try {
		for (const side of ['p1', 'p2'] as const) {
			if (!battle.choose(side, choices[side])) {
				return { value: side === world.ownSide ? -600 : 0, turn: battle.turn, ended: false,
					additionalChoices, log: [], invalidSide: side };
			}
		}
		while (!battle.ended && (battle.turn <= world.turn || battle.requestState !== 'move')) {
			if (performance.now() >= deadline) throw new Error('rollout-budget');
			if (++additionalChoices > 12) throw new Error('rollout-continuation-limit');
			const pending = (['p1', 'p2'] as const).flatMap(side => {
				const request = battle.getSide(side).activeRequest;
				if (!request || request.wait || battle.getSide(side).isChoiceDone()) return [];
				if (!request.forceSwitch) throw new Error('unexpected-rollout-request');
				const choice = continuation(observeHypothesis(battle, world, side), decisionRng.getSeed());
				decisionRng.random();
				return [{ side, request, choice }];
			});
			if (!pending.length) throw new Error('missing-rollout-continuation');
			for (const { side, request, choice } of pending) {
				if (battle.ended || battle.getSide(side).activeRequest !== request) continue;
				if (!battle.choose(side, choice) && !battle.choose(side, 'default')) throw new Error('illegal-rollout-continuation');
			}
		}
		let value = positionValue(battle, world.ownSide) - positionValue(battle, foe) - base;
		if (battle.ended && battle.winner) value += battle.winner === battle.getSide(world.ownSide).name ? 1000 : -1000;
		return { value, turn: battle.turn, ended: battle.ended, additionalChoices, log: battle.log.slice(cursor) };
	} finally {
		battle.destroy();
	}
}

export class RolloutPolicy {
	private readonly rules: RulePolicy;
	private readonly worlds: WorldBuilder;
	private readonly trainer: ValidatedTrainer;

	constructor(trainer: ValidatedTrainer) {
		this.trainer = structuredClone(trainer);
		this.rules = new RulePolicy(trainer);
		this.worlds = new WorldBuilder(trainer);
	}

	decide(observation: Observation, seed: PRNGSeed, options: SearchOptions = {}): SearchDecision {
		const start = performance.now();
		if ((options.budgetMs !== undefined && !Number.isFinite(options.budgetMs)) ||
			(options.maxRollouts !== undefined && !Number.isFinite(options.maxRollouts))) throw new Error('invalid-search-limits');
		const budget = Math.max(0, Math.min(DEFAULT_LIMITS.decisionMs, options.budgetMs ?? DEFAULT_LIMITS.decisionMs));
		const limit = Math.max(0, Math.min(192, Math.floor(options.maxRollouts ?? 192)));
		const deadline = start + budget;
		const rule = this.rules.decide(observation, seed, options.excluded);
		const result: SearchDecision = { ...rule, method: 'rules', rollouts: 0, rounds: 0, stopReason: 'phase', elapsedMs: 0 };
		const publish = () => {
			result.elapsedMs = performance.now() - start;
			options.onProgress?.(structuredClone(result));
		};
		publish();
		if (rule.phase !== 'move' || !rule.candidates.length) return result;
		result.stopReason = 'complete';
		const candidates = rule.candidates.slice(0, DEFAULT_LIMITS.ownCandidates);
		const moments = candidates.map(() => ({ weight: 0, sum: 0, square: 0 }));
		const risk = { balanced: 0.2, aggressive: 0.1, defensive: 0.35 }[this.trainer.style];
		const rng = new PRNG(seed);
		const samples = Array.from({ length: DEFAULT_LIMITS.samples }, () => { rng.random(); return rng.getSeed(); });
		try {
			if (performance.now() >= deadline || limit < candidates.length) { result.stopReason = 'budget'; return result; }
			const worlds = this.worlds.build(observation);
			search: for (const world of worlds) {
				const foe = observation.ownSide === 'p1' ? 'p2' : 'p1';
				const opponentPolicy = new RulePolicy({
					...this.trainer, style: 'balanced', keyMembers: [], resourcePreferences: [],
					packedTeam: Teams.pack(world.teams[foe].map(mon => mon.set)),
				});
				const setup = reconstructWorld(world, samples[0]);
				let responses: RuleDecision;
				try { responses = opponentPolicy.decide(observeHypothesis(setup, world, foe), seed); } finally { setup.destroy(); }
				const opponents = responses.candidates.slice(0, DEFAULT_LIMITS.opponentCandidates);
				if (!opponents.length) throw new Error('no-opponent-candidates');
				const best = Math.max(...opponents.map(candidate => candidate.score));
				const weights = opponents.map(candidate => Math.exp(Math.max(-4, (candidate.score - best) / 20)));
				const total = weights.reduce((sum, weight) => sum + weight, 0);
				for (const [opponentIndex, opponent] of opponents.entries()) {
					for (const sample of samples) {
						if (result.rollouts + candidates.length > limit || performance.now() >= deadline) {
							result.stopReason = 'budget'; break search;
						}
						const values: number[] = [];
						for (const candidate of candidates) {
							if (performance.now() >= deadline) { result.stopReason = 'budget'; break search; }
							result.rollouts++;
							const choices = { [observation.ownSide]: candidate.choice, [foe]: opponent.choice } as Record<SinglesSide, string>;
							const outcome = simulateTurn(world, choices, sample, (view, decisionSeed) =>
								(view.ownSide === observation.ownSide ? this.rules : opponentPolicy).decide(view, decisionSeed).choice || 'default',
							deadline);
							if (outcome.invalidSide === foe) throw new Error('invalid-opponent-hypothesis-choice');
							values.push(outcome.value);
						}
						// Only commit a round after every candidate has faced the same scenario and sample.
						const weight = world.probability * weights[opponentIndex] / total / samples.length;
						for (const [index, value] of values.entries()) {
							moments[index].weight += weight;
							moments[index].sum += value * weight;
							moments[index].square += value * value * weight;
						}
						result.rounds++;
						const ranked = candidates.map((candidate, index) => {
							const moment = moments[index];
							const mean = moment.sum / moment.weight;
							const deviation = Math.sqrt(Math.max(0, moment.square / moment.weight - mean * mean));
							return { ...candidate, score: mean - risk * deviation + candidate.score * 0.1,
								reasons: [...candidate.reasons, 'full-turn-expectation'] };
						}).sort((a, b) => b.score - a.score || a.choice.localeCompare(b.choice));
						const close = ranked.filter(candidate => candidate.score >= ranked[0].score - 1.5);
						result.choice = new PRNG(seed).sample(close).choice;
						result.candidates = ranked;
						result.method = 'rollout';
						result.diagnostics = [...new Set([...rule.diagnostics, ...world.diagnostics])];
						publish();
					}
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'rollout-error';
			result.stopReason = message === 'rollout-budget' ? 'budget' : 'unsupported';
			result.diagnostics = [...new Set([...result.diagnostics, message])];
		} finally {
			result.elapsedMs = performance.now() - start;
		}
		return result;
	}
}
