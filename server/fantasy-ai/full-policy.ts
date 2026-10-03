import { performance } from 'perf_hooks';
import type { Battle } from '../../sim/battle';
import type { Pokemon } from '../../sim/pokemon';
import { PRNG, type PRNGSeed } from '../../sim/prng';
import { Teams } from '../../sim/teams';
import { enumerateRequestChoices } from './actions';
import { restoreFullState } from './full-state';
import { InformationView, type Observation } from './information';
import { positionValue } from './position';
import { RulePolicy, type ScoredChoice } from './policy';
import type { SearchDecision, SearchOptions } from './rollout';
import { DEFAULT_LIMITS, type ValidatedTrainer } from './types';
import { adaptiveRisk } from './planning';
import type { Combatant } from './hypotheses';
import { assessMegaPreference, isMegaEvent } from './mega';
import { estimateMove } from './matchup';
import { readBattleMemory } from './memory';

type Trainer = Pick<ValidatedTrainer, 'format' | 'style' | 'packedTeam' | 'keyMembers' | 'resourcePreferences'>;
type SideID = 'p1' | 'p2';

function profile(mon: Pokemon): Combatant {
	return {
		species: mon.species.name, level: mon.level, stats: { hp: mon.maxhp, ...mon.storedStats },
		moves: mon.moveSlots.filter(move => move.pp > 0).map(move => move.id), movesKnown: true,
		ability: mon.ability, item: mon.item, health: { lower: mon.hp / mon.maxhp, upper: mon.hp / mon.maxhp },
		status: mon.status, boosts: { ...mon.boosts }, volatiles: Object.keys(mon.volatiles), types: mon.getTypes(),
		teraType: mon.teraType, terastallized: mon.terastallized || undefined,
	};
}

/** Future, unsubmitted actions are predicted before either hypothetical side submits. */
function predict(battle: Battle, side: SideID, trainer: Trainer, seed: PRNGSeed): string {
	const foe = battle.getSide(side === 'p1' ? 'p2' : 'p1');
	const own = battle.getSide(side);
	const view = new InformationView({ ownSide: side, difficulty: 'hard', initialOpponent: foe.pokemon.map(mon => ({
		species: mon.species.name, level: mon.level, item: mon.item, ability: mon.ability, teraType: mon.teraType,
		moves: mon.moveSlots.filter(move => move.pp > 0).map(move => move.id), stats: { hp: mon.maxhp, ...mon.storedStats },
	})) });
	view.receiveUpdate(battle.log.join('\n'));
	const policy = new RulePolicy({ ...trainer, packedTeam: Teams.pack(own.team) });
	return policy.decide(view.observe(own.activeRequest!), seed, [], { quick: true }).choice || 'default';
}

/**
 * Use the same native outcomes, position evaluation, risk and depth/budget limits as
 * ordinary search. Exact state replaces reconstructed hypotheses; accepted actions
 * stay in the cloned engine, including switch slots and every mechanic flag.
 */
export function decideFullInformation(
	observation: Observation, trainer: Trainer, seed: PRNGSeed, options: SearchOptions = {}, depthLimit?: number,
): SearchDecision {
	if (observation.difficulty !== 'hard' || !observation.fullState) throw new Error('missing-full-information');
	const start = performance.now();
	const budget = options.budgetMs === undefined ? DEFAULT_LIMITS.decisionMs : options.budgetMs;
	const workLimit = options.maxRollouts ?? Infinity;
	if (budget !== null && (!Number.isFinite(budget) || budget < 0) ||
		options.maxRollouts != null && (!Number.isFinite(options.maxRollouts) || options.maxRollouts < 0)) {
		throw new Error('invalid-search-limits');
	}
	const deadline = budget === null ? Infinity : start + budget - Math.min(150, budget * 0.03);
	const ownSide = observation.ownSide;
	const foeSide = ownSide === 'p1' ? 'p2' : 'p1';
	const request = observation.request;
	const phase = request.wait ? 'wait' : request.teamPreview ? 'preview' : request.forceSwitch ? 'switch' : 'move';
	let choices = enumerateRequestChoices(request).filter(choice => !options.excluded?.includes(choice));
	if (phase === 'preview') {
		// Compare every lead while retaining the rule policy's Illusion-aware tail order.
		const preview = new RulePolicy(trainer).decide({ ...observation, fullState: undefined }, seed);
		const order = (preview.choice || 'team 123456').slice(5).split('');
		const team = Teams.unpack(trainer.packedTeam)!;
		choices = order.flatMap(lead => {
			const next = [lead, ...order.filter(slot => slot !== lead)];
			if (team[Number(next[5]) - 1].ability.toLowerCase() === 'illusion') {
				const tail = next.findIndex((slot, index) => index > 0 &&
					team[Number(slot) - 1].ability.toLowerCase() !== 'illusion');
				if (tail > 0) [next[tail], next[5]] = [next[5], next[tail]];
			}
			const preferred = `team ${next.join('')}`;
			const choice = choices.includes(preferred) ? preferred : choices.find(entry => entry.startsWith(`team ${lead}`));
			return choice ? [choice] : [];
		});
	}
	const result: SearchDecision = {
		choice: choices[0] || null, phase, candidates: [], diagnostics: [], method: 'rules',
		rollouts: 0, rounds: 0, stopReason: 'phase', elapsedMs: 0, searchDepth: 0,
	};
	if (!choices.length) return result;
	const publish = () => {
		result.elapsedMs = performance.now() - start;
		options.onProgress?.(structuredClone(result));
	};
	const rng = new PRNG(seed);
	const samples = Array.from({ length: DEFAULT_LIMITS.samples }, () => { rng.random(); return rng.getSeed(); });
	const maxDepth = depthLimit ?? (options.critical || budget === null && options.maxRollouts === null ?
		DEFAULT_LIMITS.criticalSearchDepth : DEFAULT_LIMITS.searchDepth);
	const megaPreferences = new Map<string, number>();
	let risk = 0.2;
	const evaluate = (battle: Battle) => {
		if (battle.ended) return battle.winner ? (battle.winner === battle.getSide(ownSide).name ? 2000 : -2000) : 0;
		const own = battle.getSide(ownSide);
		const keys = new Set(own.pokemon.filter(mon => trainer.keyMembers.some(slot => mon.set === own.team[slot - 1])));
		const resources = new Map();
		return positionValue(battle, ownSide, keys, 0, resources) - positionValue(battle, foeSide, new Set(), 0, resources);
	};
	const simulate = (choice: string, sample: PRNGSeed, depth: number) => {
		const battle = restoreFullState(observation.fullState!, sample);
		try {
			battle.log.push(...observation.publicLog);
			const material = (side: SideID) => battle.getSide(side).pokemon.reduce((sum, mon) =>
				sum + (mon.hp ? 0.65 + mon.hp / mon.maxhp * 0.35 : 0), 0);
			risk = adaptiveRisk(trainer.style, material(ownSide), material(foeSide));
			const turn = battle.turn + (phase === 'preview' ? 1 : 0);
			const actor = battle.getSide(ownSide).active[0];
			const before = actor && profile(actor);
			const foe = battle.getSide(foeSide);
			const roster = foe.pokemon.map(mon => ({ profile: profile(mon), active: mon.isActive, probability: 1, key: false }));
			// Offline first movers have no accepted opponent action. Online hard mode
			// waits for it; only an actually missing choice is predicted here.
			const predicted = foe.activeRequest && !foe.activeRequest.wait && !foe.isChoiceDone() ?
				predict(battle, foeSide, trainer, sample) : null;
			if (!battle.choose(ownSide, choice)) return -Infinity;
			if (predicted && !battle.choose(foeSide, predicted) && !battle.choose(foeSide, 'default')) return -Infinity;
			let extra = 0;
			while (!battle.ended && (battle.turn < turn + depth || battle.requestState !== 'move')) {
				if (performance.now() >= deadline) throw new Error('full-information-budget');
				if (++extra > 12 * depth) throw new Error('full-information-continuation');
				const pending = (['p1', 'p2'] as const).flatMap(side => {
					const player = battle.getSide(side);
					const next = player.activeRequest;
					return !next || next.wait || player.isChoiceDone() ? [] :
						[{ side, next, choice: predict(battle, side, trainer, sample) }];
				});
				if (!pending.length) throw new Error('full-information-no-request');
				for (const action of pending) {
					if (battle.ended || battle.getSide(action.side).activeRequest !== action.next) continue;
					if (!battle.choose(action.side, action.choice) && !battle.choose(action.side, 'default')) {
						throw new Error('full-information-invalid-continuation');
					}
				}
			}
			// Preserve the shared Mega and configured resource preferences as bounded
			// long-term tie breakers, after the native engine has measured survival.
			const event = choice.split(' ')[2];
			let preference = 0;
			if (isMegaEvent(event) && before && actor.hp && actor.species.isMega) {
				if (!megaPreferences.has(actor.species.id)) {
					const memory = readBattleMemory(observation.publicLog, battle.dex);
					const mega = assessMegaPreference(before, profile(actor), () => roster, battle.dex,
						(attacker, defender, move) => estimateMove(trainer.format, attacker, defender, move, '', memory, foeSide));
					megaPreferences.set(actor.species.id, mega.value);
				}
				preference = megaPreferences.get(actor.species.id)! * 0.8;
			}
			const resource = event === 'ultra' ? 'aura' : isMegaEvent(event) ? 'mega' : event;
			if (actor?.hp && trainer.resourcePreferences.some(value => value === resource)) preference += 5;
			// A small switch cost breaks otherwise equal loops.
			return evaluate(battle) + preference - (choice.startsWith('switch ') && phase === 'move' ? 2 : 0);
		} finally {
			battle.destroy();
		}
	};
	try {
		result.stopReason = 'complete';
		for (let depth = 1; depth <= maxDepth; depth++) {
			const ranked: ScoredChoice[] = [];
			for (const choice of choices) {
				const values = [];
				for (const sample of samples) {
					if (performance.now() >= deadline || result.rollouts + depth > workLimit) {
						throw new Error('full-information-budget');
					}
					result.rollouts += depth;
					values.push(simulate(choice, sample, depth));
				}
				if (values.some(value => !Number.isFinite(value))) continue;
				const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
				const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
				ranked.push({ choice, score: mean - risk * deviation, reasons: ['full-information', `search-depth:${depth}`] });
				ranked.sort((a, b) => b.score - a.score || a.choice.localeCompare(b.choice));
				if (depth === 1) {
					result.candidates = ranked.slice(); result.choice = ranked[0].choice;
					result.method = 'rollout'; publish();
				}
			}
			if (!ranked.length) throw new Error('full-information-no-legal-choice');
			result.candidates = ranked; result.choice = ranked[0].choice;
			result.method = 'rollout'; result.searchDepth = depth; result.rounds++;
			publish();
			choices = ranked.slice(0, options.critical ? DEFAULT_LIMITS.criticalDeepCandidates : DEFAULT_LIMITS.deepCandidates)
				.map(candidate => candidate.choice);
		}
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'full-information-error';
		result.stopReason = reason === 'full-information-budget' ? 'budget' : 'unsupported';
		if (result.stopReason === 'unsupported') result.diagnostics.push(reason);
	} finally {
		publish();
	}
	return result;
}
