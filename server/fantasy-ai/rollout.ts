import { performance } from 'perf_hooks';
import type { Battle } from '../../sim/battle';
import type { Pokemon } from '../../sim/pokemon';
import { PRNG, type PRNGSeed } from '../../sim/prng';
import { Teams } from '../../sim/teams';
import { InformationView, type Observation } from './information';
import { hazardCost, hazardLayers, type HazardMember } from './hazards';
import type { SinglesSide } from './memory';
import { RulePolicy, selectCandidates, type RuleDecision } from './policy';
import { reconstructWorld } from './reconstruction';
import { DEFAULT_LIMITS, type ValidatedTrainer } from './types';
import { WorldBuilder, type WorldHypothesis } from './world';
import { recoveryCapacity, statusCost } from './mechanics';

export interface SearchDecision extends RuleDecision {
	method: 'rules' | 'rollout';
	rollouts: number;
	rounds: number;
	stopReason: 'complete' | 'budget' | 'phase' | 'unsupported';
	elapsedMs: number;
	/** Deepest completed comparison. An interrupted deeper round never replaces it. */
	searchDepth?: number;
}
export interface SearchOptions {
	/** Omission uses the normal deadline; null explicitly opts into an untimed plan. */
	budgetMs?: number | null;
	/** Trusted controller already allocated one of the rare long-decision slots. */
	critical?: boolean;
	/** A lower work cap is useful for deterministic regression tests and offline development. */
	maxRollouts?: number | null;
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

function hazardMembers(battle: Battle, side: SinglesSide, keys: ReadonlySet<Pokemon>): HazardMember[] {
	return battle.getSide(side).pokemon.map(mon => ({
		profile: {
			species: mon.species.name, level: mon.level, stats: { hp: mon.maxhp, ...mon.storedStats },
			moves: mon.moveSlots.filter(slot => slot.pp > 0).map(slot => slot.id), ability: mon.ability, item: mon.item,
			health: { lower: mon.hp / mon.maxhp, upper: mon.hp / mon.maxhp }, status: mon.status,
			boosts: {}, volatiles: [], teraType: mon.teraType, terastallized: mon.terastallized || undefined,
		},
		active: mon.isActive, probability: 1, key: keys.has(mon),
	}));
}

function positionValue(battle: Battle, side: SinglesSide, keys: ReadonlySet<Pokemon>, switches: number): number {
	const team = battle.getSide(side);
	let value = team.pokemon.reduce((sum, mon) => {
		if (mon.fainted) return sum;
		const conditionCost = statusCost({
			status: mon.status, item: mon.isActive && mon.ignoringItem() ? '' : mon.item,
			ability: mon.isActive && mon.ignoringAbility() ? '' : mon.ability, volatiles: Object.keys(mon.volatiles),
			moves: mon.moveSlots.filter(slot => slot.pp > 0).map(slot => slot.id),
			stats: { hp: mon.maxhp, ...mon.storedStats },
		}, { pseudoWeather: Object.keys(battle.field.pseudoWeather) }, battle.dex);
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
			const recovery = recoveryCapacity(move);
			return remaining + slot.pp / Math.max(1, slot.maxpp) * (recovery ? 24 : 8);
		}, 0);
		return sum + 120 + (keys.has(mon) ? 30 : 0) + mon.hp / mon.maxhp * (keys.has(mon) ? 95 : 80) -
			conditionCost + boosts + pp +
			(mon.volatiles.substitute ? 12 : 0) - (mon.isActive && exhausted ? 20 : 0);
	}, 0);
	for (const [id, condition] of Object.entries(team.sideConditions)) {
		if (condition && ['reflect', 'lightscreen', 'auroraveil', 'tailwind', 'safeguard'].includes(id)) {
			value += 12;
		}
	}
	const hazards = hazardLayers(team.sideConditions);
	if (Object.keys(hazards).length) {
		value -= hazardCost(hazards, hazardMembers(battle, side, keys),
			hazardMembers(battle, side === 'p1' ? 'p2' : 'p1', keys), battle.dex, {
				terrain: battle.field.terrain, weather: battle.field.weather, pseudoWeather: Object.keys(battle.field.pseudoWeather),
			}, switches);
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
	depth?: number;
}

/** Both initial actions are fixed before simulation; additional requests only read detached observations. */
export function simulateTurn(
	world: WorldHypothesis, choices: Record<SinglesSide, string>, seed: PRNGSeed,
	continuation: (observation: Observation, seed: PRNGSeed) => string,
	deadline = Infinity, horizon = 1,
): TurnResult {
	const battle = reconstructWorld(world, seed);
	const foe = world.ownSide === 'p1' ? 'p2' : 'p1';
	const keys = new Set(world.teams[world.ownSide].flatMap((member, index) =>
		member.keyMember ? [battle.getSide(world.ownSide).pokemon[index]] : []));
	const position = (side: SinglesSide) => positionValue(battle, side, keys,
		world.memory.switches.filter(entry => entry.side === side && entry.turn > 0 && entry.turn >= world.turn - 4).length);
	const base = position(world.ownSide) - position(foe);
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
		while (!battle.ended && (battle.turn < world.turn + horizon || battle.requestState !== 'move')) {
			if (performance.now() >= deadline) throw new Error('rollout-budget');
			if (++additionalChoices > 12 * horizon) throw new Error('rollout-continuation-limit');
			const pending = (['p1', 'p2'] as const).flatMap(side => {
				const request = battle.getSide(side).activeRequest;
				if (!request || request.wait || battle.getSide(side).isChoiceDone()) return [];
				if (request.teamPreview) throw new Error('unexpected-rollout-request');
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
		let value = position(world.ownSide) - position(foe) - base;
		if (battle.ended && battle.winner) value += battle.winner === battle.getSide(world.ownSide).name ? 1000 : -1000;
		return { value, turn: battle.turn, ended: battle.ended, additionalChoices, log: battle.log.slice(cursor),
			depth: Math.max(1, battle.turn - world.turn) };
	} finally {
		battle.destroy();
	}
}

/**
 * 先发布规则结果，再逐层完成公平比较；常规最多四回合，少量关键决策最多六回合。
 * 有限预算内缩窄候选，避免接近截止才启动来不及完成的新一轮；显式不限时才完整遍历每层。
 * 后续回合双方都从自己的独立观察决定行动，先收集双方选择再提交，不能从提交顺序获得对手行动。
 * 时间或工作量不足时保留上一次完整比较；searchDepth 记录已完成的比较深度，而不是配置上限。
 * 不支持的世界留下诊断并跳过；严禁为了“搜索成功”而抹掉未知复杂状态。
 */
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
		const budgetMs = options.budgetMs === undefined ? DEFAULT_LIMITS.decisionMs : options.budgetMs;
		const maxRollouts = options.maxRollouts === undefined ? DEFAULT_LIMITS.maxRollouts : options.maxRollouts;
		if ((budgetMs !== null && (!Number.isFinite(budgetMs) || budgetMs < 0)) ||
			(maxRollouts !== null && (!Number.isFinite(maxRollouts) || maxRollouts < 0))) throw new Error('invalid-search-limits');
		const budget = budgetMs ?? Infinity;
		const limit = maxRollouts === null ? Infinity : Math.floor(maxRollouts);
		const completePlan = budgetMs === null && maxRollouts === null;
		const expanded = completePlan || !!options.critical;
		const maxDepth = expanded ? DEFAULT_LIMITS.criticalSearchDepth : DEFAULT_LIMITS.searchDepth;
		const ownCandidates = expanded ? DEFAULT_LIMITS.criticalOwnCandidates : DEFAULT_LIMITS.ownCandidates;
		const deepCandidates = options.critical ? DEFAULT_LIMITS.criticalDeepCandidates : DEFAULT_LIMITS.deepCandidates;
		// Return just before the scheduler's hard deadline, leaving room for the
		// worker message. The controller's original receipt time remains authoritative.
		const reserve = Number.isFinite(budget) ? Math.min(150, budget * 0.03) : 0;
		const deadline = start + budget - reserve;
		const rule = this.rules.decide(observation, seed, options.excluded, { critical: expanded });
		const result: SearchDecision = {
			...rule, method: 'rules', rollouts: 0, rounds: 0, stopReason: 'phase', elapsedMs: 0, searchDepth: 0,
		};
		const publish = () => {
			result.elapsedMs = performance.now() - start;
			options.onProgress?.(structuredClone(result));
		};
		publish();
		if (rule.phase !== 'move' || !rule.candidates.length) return result;
		result.stopReason = 'complete';
		let candidates = rule.candidates.slice(0, ownCandidates);
		const risk = { balanced: 0.2, aggressive: 0.1, defensive: 0.35 }[this.trainer.style];
		const rng = new PRNG(seed);
		const samples = Array.from({ length: DEFAULT_LIMITS.samples }, () => { rng.random(); return rng.getSeed(); });
		try {
			if (performance.now() >= deadline || limit < candidates.length) { result.stopReason = 'budget'; return result; }
			const worlds = this.worlds.build(observation);
			const foe = observation.ownSide === 'p1' ? 'p2' : 'p1';
			const scenarios: {
				world: WorldHypothesis, opponentPolicy: RulePolicy, choice: string, weight: number, responseIndex: number,
			}[] = [];
			for (const world of worlds) {
				if (performance.now() >= deadline) { result.stopReason = 'budget'; break; }
				const opponentPolicy = new RulePolicy({
					...this.trainer, style: 'balanced', keyMembers: [], resourcePreferences: [],
					packedTeam: Teams.pack(world.teams[foe].map(mon => mon.set)),
				});
				try {
					const setup = reconstructWorld(world, samples[0]);
					let responses: RuleDecision;
					try {
						responses = opponentPolicy.decide(observeHypothesis(setup, world, foe), seed, [], { quick: true });
					} finally {
						setup.destroy();
					}
					const opponents = selectCandidates(
						responses.candidates, DEFAULT_LIMITS.opponentCandidates, responses.choice || undefined)
						.sort((a, b) => b.score - a.score);
					if (!opponents.length) throw new Error('no-opponent-candidates');
					const best = Math.max(...opponents.map(candidate => candidate.score));
					const weights = opponents.map(candidate => Math.exp(Math.max(-4, (candidate.score - best) / 22)));
					const total = weights.reduce((sum, weight) => sum + weight, 0);
					for (const [responseIndex, opponent] of opponents.entries()) {
						scenarios.push({ world, opponentPolicy, choice: opponent.choice,
							weight: world.probability * weights[responseIndex] / total, responseIndex });
					}
					result.diagnostics = [...new Set([...result.diagnostics, ...world.diagnostics])];
				} catch (error) {
					result.diagnostics.push(error instanceof Error ? error.message : 'world-build-failed');
				}
			}
			if (!scenarios.length) throw new Error('no-supported-world');
			// Interleave worlds and response ranks. Spending every sample on the first
			// guessed set can otherwise look like a confident prediction of the opponent.
			scenarios.sort((a, b) => a.responseIndex - b.responseIndex);
			const schedule = samples.flatMap(sample => scenarios.map(scenario => ({ ...scenario, sample })));
			let msPerStep = 0;
			search: for (let depth = 1; depth <= maxDepth; depth++) {
				if (depth > 1 && !completePlan) {
					candidates = selectCandidates(result.candidates, deepCandidates, result.choice || undefined);
				}
				const moments = candidates.map(() => ({ weight: 0, sum: 0, square: 0, worst: Infinity }));
				let completed = 0;
				for (const scenario of schedule) {
					const roundStarted = performance.now();
					const work = candidates.length * depth;
					const predictedMs = msPerStep * work * 1.25;
					if (roundStarted >= deadline || result.rollouts + work > limit ||
						result.method === 'rollout' && predictedMs > deadline - roundStarted) {
						result.stopReason = 'budget'; break search;
					}
					// Only explicit budgets trade breadth for depth. With no deadline or
					// work cap, visit every scenario/sample at every configured depth.
					const depthShare = (depth + 1) / (maxDepth + 1);
					if (!completePlan && depth < maxDepth && completed > 0 &&
						(performance.now() - start >= budget * depthShare || completed >= worlds.length * 2)) break;
					const { world, opponentPolicy, sample } = scenario;
					const values: number[] = [];
					for (const candidate of candidates) {
						if (performance.now() >= deadline) { result.stopReason = 'budget'; break search; }
						result.rollouts += depth;
						const choices = { [observation.ownSide]: candidate.choice, [foe]: scenario.choice } as Record<SinglesSide, string>;
						const outcome = simulateTurn(world, choices, sample, (view, decisionSeed) => {
							const policy = view.ownSide === observation.ownSide ? this.rules : opponentPolicy;
							return policy.decide(view, decisionSeed, [], { quick: true }).choice || 'default';
						}, deadline, depth);
						if (outcome.invalidSide === foe) { values.length = 0; break; }
						values.push(outcome.value);
					}
					const measuredMs = (performance.now() - roundStarted) / work;
					msPerStep = msPerStep ? msPerStep * 0.5 + measuredMs * 0.5 : measuredMs;
					if (values.length !== candidates.length) continue;
					// Only complete, equal-depth rounds can replace a published decision.
					for (const [index, value] of values.entries()) {
						const moment = moments[index];
						moment.weight += scenario.weight;
						moment.sum += value * scenario.weight;
						moment.square += value * value * scenario.weight;
						moment.worst = Math.min(moment.worst, value);
					}
					completed++;
					result.rounds++;
					result.searchDepth = depth;
					const ranked = candidates.map((candidate, index) => {
						const original = rule.candidates.find(entry => entry.choice === candidate.choice)!;
						const moment = moments[index];
						const mean = moment.sum / moment.weight;
						const deviation = Math.sqrt(Math.max(0, moment.square / moment.weight - mean * mean));
						const score = mean - risk * deviation - risk * Math.max(0, mean - moment.worst) * 0.25 +
							original.score * 0.1 + (original.strategic || 0) * 0.8;
						return { ...original, score, reasons: [...original.reasons, 'full-turn-expectation', `search-depth:${depth}`] };
					}).sort((a, b) => b.score - a.score || a.choice.localeCompare(b.choice));
					const close = ranked.filter(candidate => candidate.score >= ranked[0].score - 1.5);
					result.choice = new PRNG(seed).sample(close).choice;
					result.candidates = ranked;
					result.method = 'rollout';
					publish();
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
