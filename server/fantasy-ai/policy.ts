import { PRNG, type PRNGSeed } from '../../sim/prng';
import { Teams } from '../../sim/teams';
import { toID } from '../../sim/dex';
import { enumerateRequestChoices } from './actions';
import { entryHazards, hazardCost, moveHazard, observedHazardTeams, type HazardLayers } from './hazards';
import { battleNickname, HypothesisBuilder, type Combatant } from './hypotheses';
import type { Observation } from './information';
import { estimateMove, type MoveEstimate } from './matchup';
import { ownSeen, readBattleMemory, speedContext, type BattleMemory, type SeenPokemon } from './memory';
import { actionOpportunity, DELAYED_HEALING, effectiveAbility, statusCost } from './mechanics';
import { DEFAULT_LIMITS, type ValidatedTrainer } from './types';
import { getTrainerFormat } from './trainers';
import {
	observedDamage, observedImmunity, passiveRecovery, PIVOT_MOVES, recoveryAmount, remainingPP,
	repeatedRecovery, residualDamage, stalledAttacks, switchCycleCost,
} from './strategy';

export interface ScoredChoice {
	choice: string; score: number; reasons: string[]; strategic?: number; ineffective?: boolean;
}
export interface RuleDecision {
	choice: string | null;
	candidates: ScoredChoice[];
	phase: 'wait' | 'preview' | 'switch' | 'move';
	diagnostics: string[];
}
type PolicyTrainer = Pick<ValidatedTrainer, 'format' | 'style' | 'packedTeam' | 'keyMembers' | 'resourcePreferences'>;
const WEIGHTS = {
	balanced: { risk: 1, damage: 1, setup: 1 },
	aggressive: { risk: 0.7, damage: 1.15, setup: 1.1 },
	defensive: { risk: 1.35, damage: 0.9, setup: 0.8 },
};

/** Search must compare attacking, changing the matchup and useful support, even when raw damage ranks first. */
export function selectCandidates(
	ranked: readonly ScoredChoice[], limit: number, selected = ranked[0]?.choice,
): ScoredChoice[] {
	const candidates: ScoredChoice[] = [];
	const retain = (candidate?: ScoredChoice) => {
		if (candidate && candidates.length < limit && !candidates.includes(candidate)) candidates.push(candidate);
	};
	retain(ranked.find(candidate => candidate.choice === selected));
	for (const reason of ['attack', 'switch-matchup', 'urgent-recovery', 'hazard-removal', 'hazard-pressure', 'setup']) {
		retain(ranked.find(candidate => candidate.reasons.includes(reason)));
	}
	for (const candidate of ranked) retain(candidate);
	return candidates;
}

/**
 * 策略开发入口（普通 / 高难共用，不为某名训练家写固定回合脚本）：
 * - 先根据公开配招、用招频率和局面生成对手行动分布；主动换人仍面对同一分布，不能偷看玩家输入。
 * - 伤害要扣除可持续回复的影响。连续打不出净损耗时，比较破盾、轮转、异常状态与保留 PP。
 * - 回血按实际缺血量、速度、斩杀线和对手强化机会估值；少量缺血不能自动成为最高收益行动。
 * - 每个特殊机制候选用变化后的属性与能力值重新计算承伤；换人按入场伤害和下一次行动机会估值。
 * - 盾牌安全入场后能恢复 / 铺钉也有价值；残局、对方强化或撒钉手将被击杀时压低远期钉子收益。
 * - strategic 保存短搜索容易遗漏的机会成本，交给 rollout.ts 使用；不要用它重复奖励即时伤害。
 * - quick 仅用于假想世界的后续决策，减少配置及伤害采样，让更多回合的推演能够完成。
 * 修改这些权重后，应由实战回放确认行为；构建或类型检查不能证明策略变强。
 */
export class RulePolicy {
	readonly hypotheses: HypothesisBuilder;
	private readonly trainer: PolicyTrainer;
	private readonly keyNames: Set<string>;

	constructor(trainer: PolicyTrainer) {
		getTrainerFormat(trainer.format);
		this.trainer = structuredClone(trainer);
		this.hypotheses = new HypothesisBuilder(trainer.format);
		const team = Teams.unpack(trainer.packedTeam) || [];
		this.keyNames = new Set(trainer.keyMembers.map(slot => {
			const mon = team[slot - 1];
			if (!mon) return '';
			return toID(battleNickname(mon, this.hypotheses.dex));
		}));
	}

	private previewMember(species: string, level: number, side: 'p1' | 'p2'): SeenPokemon {
		return {
			appearance: '', side, ident: '', species, level, health: { lower: 1, upper: 1 },
			status: '', moves: [], moveUses: {}, boosts: {}, volatiles: [], transformed: false, ambiguousIdentity: false,
		};
	}

	private previewScores(observation: Observation, memory: BattleMemory, choices: string[]): ScoredChoice[] {
		const dex = this.hypotheses.dex;
		const foe = observation.ownSide === 'p1' ? 'p2' : 'p1';
		const opponents = memory.sides[foe].preview.flatMap(member =>
			this.hypotheses.build(this.previewMember(member.species, member.level, foe), observation, memory));
		const own = observation.request.side.pokemon.map(mon => this.hypotheses.own(mon));
		const teams = observedHazardTeams(this.hypotheses, observation, memory, own, index => this.isKey(observation, index));
		const threat = (attacker: Combatant, defender: Combatant) => Math.max(0, ...attacker.moves.map(id => {
			const move = dex.moves.get(id);
			if (move.category === 'Status' || !dex.getImmunity(move.type, dex.species.get(defender.species).types)) return 0;
			const attack = attacker.stats[move.category === 'Physical' ? 'atk' : 'spa'];
			const defense = defender.stats[move.category === 'Physical' ? 'def' : 'spd'];
			return (move.basePower || 60) * attack / Math.max(1, defense) *
				(2 ** dex.getEffectiveness(move.type, dex.species.get(defender.species).types));
		}));
		const leads = own.map((mon, index) => {
			const matchups = opponents.map(opponent => threat(mon, opponent) - threat(opponent, mon) * 0.75);
			const average = matchups.reduce((sum, score) => sum + score, 0) / Math.max(1, matchups.length);
			const hazards = Math.min(12, Math.max(0, ...mon.moves.map(id => {
				const hazard = moveHazard(dex.moves.get(id));
				return hazard ? hazardCost({ [hazard]: 1 }, teams[foe], teams[observation.ownSide], dex, memory) * 0.12 : 0;
			})));
			return average / 10 + hazards - (this.isKey(observation, index) ? 4 : 0);
		});
		return choices.map(choice => {
			const order = choice.slice(5).split('').map(Number);
			const illusion = own.some(mon => mon.ability === 'illusion');
			const badDisguise = illusion && own[order[5] - 1].ability === 'illusion';
			return { choice, score: leads[order[0] - 1] - (badDisguise ? 8 : 0), reasons: ['preview-matchups'] };
		});
	}

	private isKey(observation: Observation, index: number) {
		return this.keyNames.has(toID(observation.request.side.pokemon[index].ident.split(': ').slice(1).join(': ')));
	}

	decide(
		observation: Observation, seed: PRNGSeed, excluded: readonly string[] = [],
		options: { quick?: boolean, critical?: boolean } = {},
	): RuleDecision {
		const request = observation.request;
		if (request.wait) return { choice: null, candidates: [], phase: 'wait', diagnostics: [] };
		const memory = readBattleMemory(observation.publicLog, this.hypotheses.dex);
		const choices = enumerateRequestChoices(request, memory.sides[observation.ownSide].resources)
			.filter(choice => !excluded.includes(choice));
		const phase = request.teamPreview ? 'preview' : request.forceSwitch ? 'switch' : 'move';
		const diagnostics = new Set<string>();
		let ranked: ScoredChoice[];
		if (request.teamPreview) {
			ranked = this.previewScores(observation, memory, choices);
		} else {
			const foe = observation.ownSide === 'p1' ? 'p2' : 'p1';
			const seen = memory.sides[foe].active;
			if (!seen) {
				return { choice: choices[0] || 'default', candidates: [], phase, diagnostics: ['missing-public-opponent'] };
			}
			const hypotheses = this.hypotheses.build(seen, observation, memory).slice(0, options.quick ? 1 : undefined);
			const hypothesisWeight = hypotheses.reduce((sum, opponent) => sum + opponent.probability, 0);
			const active = memory.sides[observation.ownSide].active;
			const own = request.side.pokemon.map(mon =>
				this.hypotheses.own(mon, ownSeen(memory, observation.ownSide, mon.ident, mon.active)));
			const activeIndex = Math.max(0, request.side.pokemon.findIndex(mon => mon.active));
			const current = own[activeIndex];
			const dex = this.hypotheses.dex;
			const turnStart = observation.publicLog.lastIndexOf(`|turn|${memory.turn}`);
			const opponentActed = memory.moveEvidence?.some(entry =>
				entry.turn === memory.turn && entry.user === seen.appearance) ||
				observation.publicLog.slice(Math.max(0, turnStart)).some(line => line.startsWith(`|cant|${seen.ident}|`));
			// A fast U-turn/Shed Tail request is forced but its replacement may still
			// take the opponent's queued action. Only public action order is consulted.
			const takesEntryAction = !request.forceSwitch || current.health.upper > 0 && seen.health.upper > 0 &&
				active?.lastMoveTurn === memory.turn && !opponentActed;
			const alive = own.filter(mon => mon.health.upper > 0).length;
			for (const mon of own) mon.reserves = Math.max(0, alive - 1);
			const stalled = stalledAttacks(memory, active, seen);
			const healingLoop = repeatedRecovery(memory, active, dex);
			const weights = WEIGHTS[this.trainer.style];
			let hazardTeams: ReturnType<typeof observedHazardTeams> | undefined;
			const hazardCache = new Map<string, number>();
			const cost = (side: typeof foe, layers: HazardLayers) => {
				const key = JSON.stringify([side, layers]);
				let value = hazardCache.get(key);
				if (value === undefined) {
					hazardTeams ||= observedHazardTeams(
						this.hypotheses, observation, memory, own, index => this.isKey(observation, index));
					const other = side === 'p1' ? 'p2' : 'p1';
					const switches = memory.switches.filter(entry =>
						entry.side === side && entry.turn > 0 && entry.turn >= memory.turn - 4);
					value = hazardCost(layers, hazardTeams[side], hazardTeams[other], this.hypotheses.dex, memory, switches.length);
					hazardCache.set(key, value);
				}
				return value;
			};
			const cache = new Map<string, MoveEstimate>();
			const probe = (
				attacker: Combatant, defender: Combatant, id: string, event = '', attackingSide = observation.ownSide
			) => {
				const key = JSON.stringify([attacker, defender, id, event, attackingSide]);
				let estimate = cache.get(key);
				if (!estimate) {
					estimate = estimateMove(
						this.trainer.format, attacker, defender, id, event, memory, attackingSide, options.quick ? 1 : 2);
					const isCurrent = attacker === current && !event;
					const isIncoming = defender === current && attackingSide === foe;
					const measured = isCurrent ? observedDamage(memory, active, seen, id) :
						isIncoming ? observedDamage(memory, seen, active, id) : undefined;
					if (measured !== undefined && !estimate.knockout) {
						estimate.damage = estimate.damage * 0.3 + measured * 0.7;
						if (measured > 0) estimate.ineffective = 0;
					}
					if (isCurrent && observedImmunity(memory, active, seen, id) && !estimate.omittedVolatiles.length &&
						!estimate.healing && !estimate.delayedHealing && !estimate.utility && !estimate.field &&
						!estimate.hazardChanges.length && !estimate.boosts && !estimate.volatile && !estimate.pivot) {
						estimate.damage = estimate.knockout = 0;
						estimate.ineffective = 1;
					}
					cache.set(key, estimate);
					for (const effect of estimate.omittedVolatiles) diagnostics.add(`approximate-volatile:${effect}`);
				}
				return estimate;
			};
			const firstChance = (attack: MoveEstimate, incoming: MoveEstimate, useEvidence = true) => {
				if (attack.priority !== incoming.priority) return Number(attack.priority > incoming.priority);
				const modifiers = ['prankster', 'galewings', 'triage', 'quickdraw', 'stall', 'myceliummight'];
				const orderItems = ['quickclaw', 'custapberry', 'laggingtail', 'fullincense'];
				if (active && useEvidence && !modifiers.includes(active.ability || '') && !modifiers.includes(seen.ability || '') &&
					![active.item, seen.item].some(item => orderItems.includes(item || ''))) {
					const ownState = speedContext(active, memory);
					const foeState = speedContext(seen, memory);
					const evidence = memory.speedEvidence.slice().reverse().find(entry => {
						if (entry.turn < memory.turn - 5) return false;
						return (entry.first === active.appearance && entry.second === seen.appearance &&
							entry.firstState === ownState && entry.secondState === foeState) ||
							(entry.second === active.appearance && entry.first === seen.appearance &&
								entry.secondState === ownState && entry.firstState === foeState);
					});
					if (evidence) return evidence.first === active.appearance ? 0.95 : 0.05;
				}
				if (attack.speed === attack.opponentSpeed) return 0.5;
				return Number(memory.pseudoWeather.includes('trickroom') ?
					attack.speed < attack.opponentSpeed : attack.speed > attack.opponentSpeed);
			};
			const moveIDs = (mon: Combatant) => mon.moves.filter(id => {
				if (mon === current && !request.forceSwitch && !request.teamPreview) {
					const slot = request.active[0].moves.find(move => move.id === id) as { pp?: number, disabled?: boolean } | undefined;
					if (!slot || slot.disabled || slot.pp === 0) return false;
				}
				return remainingPP(dex.moves.get(id), mon === current ? active : undefined) > 0;
			});
			const offense = (mon: Combatant, opponent: Combatant) =>
				Math.max(0, ...moveIDs(mon).map(id => probe(mon, opponent, id).damage));
			const modelCache = new Map<string, { id: string, weight: number }[]>();
			const model = (opponent: Combatant, target = current) => {
				const key = JSON.stringify([opponent, target]);
				let responses = modelCache.get(key);
				if (responses) return responses;
				const outgoing = offense(target, opponent);
				const scored = opponent.moves.filter(id => remainingPP(dex.moves.get(id), seen) > 0).map(id => {
					const move = dex.moves.get(id);
					const estimate = probe(opponent, target, id, '', foe);
					const slower = memory.pseudoWeather.includes('trickroom') ? estimate.speed > estimate.opponentSpeed :
						estimate.speed < estimate.opponentSpeed;
					const recoverable = Math.min(recoveryAmount(move, opponent, memory),
						1 - opponent.health.upper + (slower ? outgoing : 0));
					const learned = seen.moves.includes(id) ? 1 + Math.min(0.5, (seen.moveUses[id] || 0) * 0.08) : 0.55;
					let value = estimate.damage * 90 + estimate.knockout * 85 + recoverable * (DELAYED_HEALING[id] ? 65 : 105) +
						Math.max(0, estimate.boosts) * 22 + estimate.status * 18 + estimate.utility * 12;
					if (estimate.ineffective >= 0.999) value -= 100;
					if (estimate.pivot) value += 10;
					if (id === 'destinybond' && opponent.health.upper < outgoing && estimate.speed >= estimate.opponentSpeed) value += 60;
					if (seen.lastMove === id && seen.lastMoveTurn === memory.turn - 1) value += 4;
					return { id, value, learned };
				});
				if (!scored.length) scored.push({ id: 'struggle', value: 0, learned: 1 });
				const best = Math.max(...scored.map(entry => entry.value));
				responses = scored.map(entry => ({
					id: entry.id, weight: (0.025 + Math.exp(Math.max(-6, (entry.value - best) / 22))) * entry.learned,
				}));
				const total = responses.reduce((sum, entry) => sum + entry.weight, 0);
				for (const entry of responses) entry.weight /= total;
				modelCache.set(key, responses);
				return responses;
			};
			const dangerCache = new Map<string, ReturnType<typeof assessDanger>>();
			function assessDanger(mon: Combatant, opponent: Combatant) {
				// These probabilities are fixed against the CURRENT active Pokemon.
				// A proposed switch must not make the opponent magically choose its perfect coverage move.
				const responses = model(opponent, takesEntryAction ? current : mon).map(entry => {
					const estimate = probe(opponent, mon, entry.id, '', foe);
					const opportunity = actionOpportunity(opponent, dex.moves.get(entry.id), memory);
					return { ...entry, estimate: { ...estimate, damage: estimate.damage * opportunity,
						knockout: estimate.knockout * opportunity, boosts: estimate.boosts * opportunity,
						status: estimate.status * opportunity, disruption: estimate.disruption * opportunity,
						volatile: estimate.volatile * opportunity } };
				});
				const worst = responses.slice().sort((a, b) =>
					b.estimate.damage + b.estimate.knockout - a.estimate.damage - a.estimate.knockout)[0].estimate;
				const average = (key: 'damage' | 'knockout' | 'boosts' | 'status' | 'disruption' | 'volatile') =>
					responses.reduce((sum, entry) => sum + entry.estimate[key] * entry.weight, 0);
				// Bound the extra native probes: inspect the strongest coverage options,
				// never recursively run another danger model. Probabilities still come
				// from the current matchup, including when pricing a proposed switch.
				const coverage = responses.filter(entry => dex.moves.get(entry.id).category !== 'Status')
					.sort((a, b) => b.estimate.damage - a.estimate.damage).slice(0, options.quick ? 1 : 2);
				let followup = 0;
				for (const response of responses) {
					const estimate = response.estimate;
					const opportunity = actionOpportunity(opponent, dex.moves.get(response.id), memory);
					for (const outcome of estimate.targetAfterStatus || []) {
						const changed = { ...outcome.profile, health: mon.health };
						const extra = Math.max(0, ...coverage.map(entry =>
							probe(opponent, changed, entry.id, '', foe).damage *
							actionOpportunity(opponent, dex.moves.get(entry.id), memory) - entry.estimate.damage));
						followup += extra * outcome.probability * response.weight * opportunity;
					}
					if (estimate.boosts > 0 && estimate.userAfterMove) {
						const boosted = estimate.userAfterMove;
						const extra = Math.max(0, ...coverage.map(entry =>
							probe(boosted, mon, entry.id, '', foe).damage *
							actionOpportunity(boosted, dex.moves.get(entry.id), memory) - entry.estimate.damage));
						followup += extra * response.weight * estimate.accuracy * opportunity;
					}
				}
				return {
					worst, damage: average('damage') * 0.7 + worst.damage * 0.3,
					knockout: average('knockout') * 0.7 + worst.knockout * 0.3,
					setup: Math.max(0, average('boosts')), responses, followup,
					disruption: average('status') * 28 + Math.max(0, average('disruption')) * 16 +
						Math.max(0, average('volatile')) * 16,
				};
			}
			const danger = (mon: Combatant, opponent: Combatant) => {
				const key = JSON.stringify([mon, opponent]);
				let value = dangerCache.get(key);
				if (!value) { value = assessDanger(mon, opponent); dangerCache.set(key, value); }
				return value;
			};
			const recoveryWall = (opponent: Combatant, damage: number, knockout = 0) => {
				if (knockout > 0.5 || opponent.volatiles.some(id => ['taunt', 'healblock'].includes(id))) return 0;
				const recoveries = opponent.moves.map(id => dex.moves.get(id))
					.filter(move => recoveryAmount(move) && remainingPP(move, seen) > 0);
				const capacity = Math.max(0, ...recoveries.map(move =>
					recoveryAmount(move, opponent, memory) * (DELAYED_HEALING[move.id] ? 0.5 : 1))) +
					passiveRecovery(opponent, dex, memory) - residualDamage(opponent, dex, seen, memory);
				if (damage > capacity || !recoveries.length) return 0;
				const revealed = recoveries.some(move => seen.moves.includes(move.id));
				const pp = Math.max(...recoveries.map(move => remainingPP(move, seen)));
				return (revealed ? 0.9 : 0.4) * Math.min(1, pp / 3);
			};
			const canDrainRecovery = (opponent: Combatant, mon: Combatant, id: string, attack: MoveEstimate) => {
				if (request.forceSwitch || request.teamPreview || attack.damage < 0.25 ||
					attack.selfDamage > 0.02 || attack.boosts < 0 || mon.volatiles.includes('healblock')) return false;
				const recoveries = opponent.moves.map(moveID => dex.moves.get(moveID))
					.filter(move => recoveryAmount(move, opponent, memory) && remainingPP(move, seen));
				if (!recoveries.length || recoveries.some(move =>
					!seen.moves.includes(move.id) || DELAYED_HEALING[move.id])) return false;
				const capacity = Math.max(...recoveries.map(move => recoveryAmount(move, opponent, memory)));
				const recoveryPP = recoveries.reduce((sum, move) => sum + remainingPP(move, seen), 0);
				const netDamage = attack.damage + residualDamage(opponent, dex, seen, memory) - passiveRecovery(opponent, dex, memory);
				if (netDamage <= 0 || recoveryPP > 4) return false;
				const turns = Math.ceil(recoveryPP * capacity / netDamage) + 1;
				const pp = (request.active[0].moves.find(move => move.id === id) as { pp?: number } | undefined)?.pp || 0;
				const pressure = effectiveAbility(opponent) === 'pressure' ? 2 : 1;
				const incoming = danger(mon, opponent);
				const attrition = Math.max(0, residualDamage(mon, dex, active, memory) - passiveRecovery(mon, dex, memory));
				return turns <= 6 && pp >= turns * pressure && incoming.knockout < 0.1 &&
					incoming.setup < 0.1 && incoming.disruption < 8 &&
					mon.health.lower > turns * (attrition + incoming.damage) + 0.15;
			};
			ranked = choices.map(choice => {
				const [kind, slotText, event = ''] = choice.split(' ');
				const index = Number(slotText) - 1;
				const reasons: string[] = [];
				let score = 0;
				let strategic = 0;
				let ineffective = kind === 'move';
				try {
					for (const opponent of hypotheses) {
						let value: number;
						let longTerm = 0;
						if (kind === 'switch') {
							const mon = own[index];
							const layers = memory.sides[observation.ownSide].conditions;
							const hazardEntry = entryHazards(mon, layers, this.hypotheses.dex, memory);
							const entrant = { ...mon, health: {
								lower: Math.max(0, mon.health.lower - hazardEntry.damage),
								upper: Math.max(0, mon.health.upper - hazardEntry.damage),
							} };
							const incoming = danger(entrant, opponent);
							const entryDamage = hazardEntry.damage;
							const passive = passiveRecovery(entrant, dex, memory);
							const entryHit = takesEntryAction ? incoming.damage : 0;
							const entryResidual = takesEntryAction ? residualDamage(entrant, dex, undefined, memory) - passive : 0;
							const endurance = Math.max(0, Math.min(1, entrant.health.upper - entryHit - entryResidual));
							const afterEntry = { ...entrant, health: {
								lower: Math.max(0, Math.min(1, entrant.health.lower - entryHit - entryResidual)), upper: endurance,
							} };
							// Hard switches spend this turn taking the entry action. Future offense
							// is discounted and requires surviving the entry AND reaching a move on
							// the next turn. Free replacements and slow pivots have no entry attack.
							const future = endurance > 0 ? moveIDs(mon).map(id => {
								const attack = probe(afterEntry, opponent, id);
								const first = firstChance(attack, incoming.worst, false);
								const canAct = (first + (1 - first) * Number(endurance > incoming.worst.damage + incoming.followup)) *
									actionOpportunity(afterEntry, dex.moves.get(id), memory);
								return { id, attack, canAct };
							}) : [];
							const attackValue = Math.max(0, ...future.map(({ attack, canAct }) => canAct *
								(attack.damage * 75 * (1 - recoveryWall(opponent, attack.damage, attack.knockout) * 0.8) + attack.knockout * 75)));
							const futureChance = Math.max(0, ...future.map(move => move.canAct)) *
								(1 - (takesEntryAction ? incoming.knockout : 0));
							const canRecover = future.some(({ id, canAct }) => canAct > 0.5 &&
								recoveryAmount(dex.moves.get(id), afterEntry, memory) > incoming.worst.damage + incoming.followup - passive);
							const discount = takesEntryAction ? 0.4 : 1;
							value = attackValue * discount * (1 - (takesEntryAction ? incoming.knockout : 0)) -
								weights.risk * (entryHit * 80 + incoming.knockout * (takesEntryAction ? 125 : 35) + entryDamage * 100);
							if (takesEntryAction) {
								const revealedFatal = Math.max(0, ...incoming.responses.filter(entry => seen.moves.includes(entry.id))
									.map(entry => entry.estimate.knockout));
								value -= weights.risk * (Math.max(0, entryResidual) * 70 + incoming.disruption +
									incoming.setup * 22 + incoming.followup * 70 + revealedFatal * 45);
								if (revealedFatal > 0.5 || futureChance < 0.25) reasons.push('unsafe-entry');
								if (incoming.disruption > 12 || incoming.followup > 0.08) reasons.push('status-or-setup-exposure');
							}
							const absorb = takesEntryAction ? Math.max(0, danger(current, opponent).damage - incoming.damage) : 0;
							let utility = 0;
							for (const id of mon.moves) {
								const hazard = moveHazard(dex.moves.get(id));
								if (!hazard) continue;
								const currentLayers = memory.sides[foe].conditions;
								const maxLayers = hazard === 'spikes' ? 3 : hazard === 'toxicspikes' ? 2 : 1;
								if ((currentLayers[hazard] || 0) >= maxLayers) continue;
								utility = Math.max(utility, cost(foe, {
									...currentLayers, [hazard]: (currentLayers[hazard] || 0) + 1,
								}) - cost(foe, currentLayers));
							}
							if (incoming.worst.damage + incoming.followup < 0.38 && endurance > 0.35 &&
								!incoming.worst.knockout && incoming.setup < 0.4 && incoming.disruption < 15) {
								value += futureChance * (Math.min(16, utility * 0.3) + absorb * 22 + (canRecover ? 6 : 0));
								if (utility > 2) reasons.push('defensive-pivot', 'hazard-opportunity');
							}
							if (entryDamage >= mon.health.upper) value -= 250;
							if (hazardEntry.absorbsToxicSpikes) {
								const benefit = cost(observation.ownSide, layers) - cost(observation.ownSide, { ...layers, toxicspikes: 0 });
								value += benefit * weights.risk;
								if (benefit > 1) reasons.push('hazard-removal', 'toxic-spikes-absorption');
							}
							if (this.isKey(observation, index)) value -= incoming.damage * 25;
							if (!request.forceSwitch) {
								const present = danger(current, opponent);
								const escaping = absorb > 0.15 || present.knockout > incoming.knockout + 0.3;
								longTerm -= escaping ? 5 : 14;
								const cycle = switchCycleCost(memory, observation.ownSide, request.side.pokemon[index].ident,
									own.reduce((sum, member) => sum + member.health.upper, 0));
								longTerm -= cycle * (escaping ? 0.35 : 1);
								if (cycle) reasons.push('losing-switch-cycle');
								longTerm -= Object.values(current.boosts).reduce((sum, boost) => sum + Math.max(0, boost || 0), 0) * 5;
								// Only effects that really end on switching confer relief. Burn/poison
								// do not disappear by alternating two already afflicted members.
								value += Math.max(0, residualDamage(current, dex, active, memory) -
								residualDamage({ ...current, volatiles: [] }, dex, active, memory)) * 40;
								if (effectiveAbility(current) === 'naturalcure') value += Math.max(0, statusCost(current, memory, dex)) * 0.75;
								if (effectiveAbility(current) === 'regenerator') value += Math.min(1 / 3, 1 - current.health.upper) * 55;
								if (this.isKey(observation, activeIndex)) value += present.knockout * 35;
								if (stalled && futureChance > 0.75 && attackValue > 45 &&
									future.some(({ attack }) => attack.damage > offense(current, opponent) + 0.15 &&
										!recoveryWall(opponent, attack.damage, attack.knockout))) {
									value += Math.min(16, stalled * 5);
									reasons.push('break-recovery-loop');
								}
							}
							reasons.push('switch-matchup');
						} else if (kind === 'move' && !request.forceSwitch) {
							const mon = current;
							const id = request.active[0].moves[index].id;
							const move = this.hypotheses.dex.moves.get(id);
							const attack = probe(mon, opponent, id, event);
							const futileSetup = !!attack.userAfterMove && !attack.damage && !attack.healing &&
								!attack.delayedHealing && !attack.status && !attack.field && !attack.hazardChanges.length &&
								!attack.utility && !attack.volatile && !attack.pivot &&
								!moveIDs(mon).some(moveID => dex.moves.get(moveID).selfSwitch === 'copyvolatile') &&
								residualDamage(opponent, dex, seen, memory) <= passiveRecovery(opponent, dex, memory) &&
								offense({ ...attack.userAfterMove, moves: moveIDs(mon) }, opponent) === 0;
							ineffective &&= attack.ineffective >= 0.999 || futileSetup;
							const defending = attack.userAfterMechanic || mon;
							const incoming = danger(defending, opponent);
							const first = firstChance(attack, incoming.worst, !event);
							const survives = 1 - incoming.knockout * (1 - first);
							const opportunity = actionOpportunity(defending, move, memory);
							let damage = attack.damage * opportunity;
							let knockout = attack.knockout * opportunity;
							for (const response of incoming.responses) {
								const beforeUs = 1 - firstChance(attack, response.estimate, !event);
								if (!beforeUs) continue;
								for (const outcome of response.estimate.targetAfterStatus || []) {
									const changed = { ...outcome.profile, health: defending.health };
									const afterStatus = probe(changed, opponent, id, event === 'zmove' ? event : '');
									const chance = actionOpportunity(changed, move, memory);
									const probability = outcome.probability * response.weight * beforeUs *
										actionOpportunity(opponent, dex.moves.get(response.id), memory);
									damage += (afterStatus.damage * chance - attack.damage * opportunity) * probability;
									knockout += (afterStatus.knockout * chance - attack.knockout * opportunity) * probability;
								}
							}
							let wall = recoveryWall(opponent, damage, knockout);
							if (wall && canDrainRecovery(opponent, defending, id, { ...attack, damage, knockout })) {
								wall *= 0.15;
								reasons.push('recovery-pp-pressure');
							}
							value = survives * (damage * 100 * weights.damage * (1 - wall * 0.85) + knockout * 100 +
								opportunity * (attack.status * 28 + Math.max(0, attack.boosts) * 18 * weights.setup *
								Math.max(0, 1 - incoming.damage * 2) + Math.min(0, attack.boosts) * 8 * (1 - attack.knockout * 0.8)));
							if (wall && move.category !== 'Status' && !PIVOT_MOVES.has(id)) {
								longTerm -= wall * (8 + Math.min(32, stalled * 10));
								reasons.push('recovery-wall');
							}
							const stopped = knockout * first;
							const passive = passiveRecovery(defending, dex, memory);
							const residual = Math.max(0, residualDamage(defending, dex, active, memory) - passive);
							let fatal = incoming.knockout;
							if (DELAYED_HEALING[id]) {
								// A delayed heal cannot rescue the user from this turn's knockout.
								value += survives * Math.min(attack.delayedHealing, 1 - mon.health.upper + incoming.damage) * 65;
								longTerm -= incoming.setup * 18;
							} else if (recoveryAmount(move)) {
								const recovered = { ...defending, health: { lower: Math.min(1, mon.health.lower + attack.healing),
									upper: Math.min(1, mon.health.upper + attack.healing) } };
								const afterHealing = danger(recovered, opponent);
								fatal = first * afterHealing.knockout + (1 - first) * incoming.knockout;
								const saves = Math.max(0, incoming.knockout - fatal);
								const urgent = saves > 0.2 || mon.health.upper < Math.max(0.5, incoming.worst.damage + residual + 0.12);
								value += attack.healing * (urgent ? 100 : 45) + saves * 65;
								if (urgent && attack.healing > 0.12) reasons.push('urgent-recovery');
								if (mon.health.upper > 0.78 && attack.healing < 0.22 && saves <= 0.2) {
									longTerm -= 18 + (0.22 - attack.healing) * 60;
								}
								if (attack.healing < 0.01) longTerm -= 35;
								longTerm -= incoming.setup * (22 + healingLoop * 8);
								if (!saves && healingLoop && attack.healing <= incoming.damage + residual + 0.08) longTerm -= healingLoop * 10;
								if (id === 'rest') longTerm -= 12;
							} else {
								value += attack.healing * 80;
							}
							value -= weights.risk * (1 - stopped) * (incoming.damage * 45 + fatal * 105 + residual * 70 +
								incoming.disruption + incoming.setup * 12 + incoming.followup * 60);
							if (incoming.disruption > 12 || incoming.followup > 0.08) reasons.push('status-or-setup-exposure');
							if (mon.health.upper <= incoming.damage + residual && !stopped) value -= 20;
							value -= attack.selfDamage * 55;
							value += survives * (attack.field * 16 + attack.volatile * 12 + attack.utility * 12);
							let removal = 0;
							let pressure = 0;
							for (const change of attack.hazardChanges) {
								removal += (cost(observation.ownSide, memory.sides[observation.ownSide].conditions) -
									cost(observation.ownSide, change.own)) * change.probability;
								pressure += (cost(foe, change.foe) - cost(foe, memory.sides[foe].conditions)) * change.probability;
							}
							// The existing survival/KO scoring prices the tempo spent clearing. Extra
							// layers must earn their marginal benefit; do not sacrifice a setter blindly.
							const setupSafety = Math.max(0, 1 - incoming.worst.knockout) *
								Math.max(0.05, 1 - incoming.worst.damage * 1.4 - incoming.setup * 0.25) *
								(alive <= 2 ? 0.2 : alive === 3 ? 0.6 : 1);
							value += survives * opportunity * (removal * weights.risk + pressure * (pressure > 0 ? setupSafety : 1));
							if (survives * opportunity > 0 && removal + pressure > 1) {
								if (removal > 1) reasons.push('hazard-removal');
								if (pressure * setupSafety > 1) reasons.push('hazard-pressure');
							}
							if (moveHazard(move) && move.category === 'Status' && removal + pressure <= 0) value -= 16;
							if (moveHazard(move) && move.category === 'Status' && setupSafety < 0.2) longTerm -= 35;
							if (move.category === 'Status' && !recoveryAmount(move)) longTerm -= incoming.setup * 18;
							if (attack.pivot && alive > 1) { value += attack.pivot * (14 + wall * 12); reasons.push('pivot'); }
							if (attack.ineffective >= 0.999 || futileSetup) {
								longTerm -= 100;
								reasons.push(futileSetup ? 'setup-cannot-break-immunity' : 'ineffective-action');
							}
							const bond = incoming.responses.find(entry => entry.id === 'destinybond');
							if (attack.knockout && (opponent.volatiles.includes('destinybond') && first || bond && !first)) {
								longTerm -= attack.knockout * (opponent.volatiles.includes('destinybond') && first ? 1 : bond!.weight) * 135;
								reasons.push('destiny-bond-risk');
							}
							if (event) {
								const resource = event === 'ultra' ? 'aura' : event.startsWith('mega') ? 'mega' : event;
								longTerm -= resource === 'mega' ? 8 : 20;
								if (this.trainer.resourcePreferences.some(preference => preference === resource)) value += 5;
							}
							if (attack.knockout) reasons.push('knockout');
							if (attack.damage) reasons.push('attack');
							if (attack.healing) reasons.push('recovery');
							if (attack.boosts > 0) reasons.push('setup');
							if (!attack.damage && move.category !== 'Status') reasons.push('no-effective-damage');
						} else {
							value = -100;
						}
						score += (value + longTerm) * opponent.probability / hypothesisWeight;
						strategic += longTerm * opponent.probability / hypothesisWeight;
					}
				} catch (error) {
					ineffective = false;
					diagnostics.add(`probe-failed:${error instanceof Error ? error.message : 'unknown'}`);
					score = -1000;
				}
				return { choice, score, strategic, ineffective, reasons: [...new Set(reasons)] };
			});
			// Filter before publishing either the rule fallback or search candidates.
			// A native probe failure/omitted effect never proves immunity. Keep the last
			// legal move if trapped or no replacement/other effective action exists.
			const useful = ranked.filter(candidate => !candidate.ineffective);
			if (useful.length && useful.length < ranked.length) {
				const onlySwitches = useful.every(candidate => candidate.choice.startsWith('switch '));
				if (onlySwitches) {
					for (const candidate of useful) candidate.reasons.push('escape-ineffective-matchup');
					diagnostics.add('switch-no-effective-action');
				}
				ranked = useful;
			}
		}
		ranked.sort((a, b) => b.score - a.score || (a.choice < b.choice ? -1 : a.choice > b.choice ? 1 : 0));
		const close = ranked.filter(candidate => candidate.score >= ranked[0].score - 1.5);
		const choice = close.length ? new PRNG(seed).sample(close).choice : 'default';
		const candidates = selectCandidates(ranked,
			options.critical ? DEFAULT_LIMITS.criticalOwnCandidates : DEFAULT_LIMITS.ownCandidates, choice);
		return { choice, candidates, phase, diagnostics: [...diagnostics] };
	}
}
