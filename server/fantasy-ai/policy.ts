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
import { assessTrickRoom, trickRoomTurns } from './trick-room';
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
	for (const reason of [
		'emergency-counterplay', 'reliable-finish', 'attack', 'trick-room-setup', 'trick-room-pivot', 'switch-matchup', 'urgent-recovery',
		'defensive-cycle', 'hazard-removal', 'hazard-pressure', 'setup',
	]) {
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
		const team = Teams.unpack(trainer.packedTeam) || [];
		this.hypotheses = new HypothesisBuilder(trainer.format, team);
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
		const room = own.some(mon => mon.moves.includes('trickroom')) ?
			assessTrickRoom(teams[observation.ownSide], teams[foe], dex, memory) : undefined;
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
			const roomLead = mon.moves.includes('trickroom') ? Math.max(0, room?.value || 0) * 12 : 0;
			return average / 10 + hazards + roomLead - (this.isKey(observation, index) ? 4 : 0);
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
			const roomTurns = trickRoomTurns(memory);
			let room = { value: 0, benefits: own.map(() => 0) };
			if (roomTurns || own.some(mon => mon.health.upper && mon.moves.includes('trickroom'))) {
				hazardTeams = observedHazardTeams(this.hypotheses, observation, memory, own, index => this.isKey(observation, index));
				room = assessTrickRoom(own.map((profile, index) => ({ profile, active: index === activeIndex, probability: 1,
					tailwind: !!memory.sides[observation.ownSide].conditions.tailwind })),
				hazardTeams[foe].map(member => ({ ...member, tailwind: !!memory.sides[foe].conditions.tailwind })), dex, memory);
			}
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
						!estimate.hazardChanges.length && !estimate.boosts && !estimate.volatile && !estimate.pivot && !estimate.trickRoom) {
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
				Math.max(0, ...moveIDs(mon).map(id => {
					const attack = probe(mon, opponent, id);
					return attack.damage + (attack.substituteDamage || 0) * 0.6;
				}));
			const modelCache = new Map<string, { id: string, weight: number }[]>();
			const model = (opponent: Combatant, target = current) => {
				const key = JSON.stringify([opponent, target]);
				let responses = modelCache.get(key);
				if (responses) return responses;
				const outgoing = offense(target, opponent);
				const scored = opponent.moves.filter(id => remainingPP(dex.moves.get(id), seen) > 0 &&
					(!opponent.moveLocks?.encore || opponent.moveLocks.encore === id) && opponent.moveLocks?.disable !== id).map(id => {
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
			function assessDanger(mon: Combatant, opponent: Combatant, action?: { attack: MoveEstimate, opportunity: number }) {
				// These probabilities are fixed against the CURRENT active Pokemon.
				// A proposed switch must not make the opponent magically choose its perfect coverage move.
				const responses = model(opponent, takesEntryAction ? current : mon).map(entry => {
					const before = probe(opponent, mon, entry.id, '', foe);
					const estimate = { ...before };
					if (action?.attack.postAction || action?.attack.targetAfterMove) {
						const first = firstChance(action.attack, before) * action.opportunity;
						if (first) {
							const states = (outcomes: MoveEstimate['postAction'], fallback: Combatant) => {
								const entries = outcomes || [];
								const remaining = Math.max(0, 1 - entries.reduce((sum, outcome) => sum + outcome.probability, 0));
								return remaining ? [...entries, { profile: fallback, probability: remaining }] : entries;
							};
							// One action can change both sides: Encore expires our old Destiny
							// Bond while locking the opponent. Neither outcome may hide the other.
							for (const user of states(action.attack.postAction, mon)) {
								for (const target of states(action.attack.targetAfterMove, opponent)) {
									const after = probe(target.profile, user.profile, target.profile.moveLocks?.encore || entry.id, '', foe);
									const probability = user.probability * target.probability * first;
									for (const key of ['damage', 'knockout', 'status', 'disruption', 'volatile', 'boosts', 'healing',
										'substituteDamage', 'substituteBroken', 'selfKnockout'] as const) {
										estimate[key] = (estimate[key] || 0) + ((after[key] || 0) - (before[key] || 0)) * probability;
									}
								}
							}
						}
					}
					const opportunity = actionOpportunity(opponent, dex.moves.get(entry.id), memory);
					return { ...entry, estimate: { ...estimate, damage: estimate.damage * opportunity,
						knockout: estimate.knockout * opportunity, boosts: estimate.boosts * opportunity,
						status: estimate.status * opportunity, disruption: estimate.disruption * opportunity,
						volatile: estimate.volatile * opportunity, selfKnockout: (estimate.selfKnockout || 0) * opportunity } };
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
					// Contact into a shield can lower Attack, but that alternative must
					// not cancel the risk of a different response using Swords Dance.
					setup: responses.reduce((sum, entry) => sum + entry.weight * Math.max(0, entry.estimate.boosts), 0),
					responses, followup,
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
			// The most damaging response can have a different priority (e.g. Focus
			// Punch). It must not lend its slow action order to every other attack.
			const orderRisk = (attack: MoveEstimate, incoming: ReturnType<typeof danger>, useEvidence = true) => {
				const replies = incoming.responses.map(entry => ({ ...entry,
					first: firstChance(attack, entry.estimate, useEvidence) }));
				const beforeKO = (entry: typeof replies[number]) => entry.estimate.knockout * (1 - entry.first);
				return {
					first: replies.reduce((sum, entry) => sum + entry.weight * entry.first, 0),
					survives: 1 - replies.reduce((sum, entry) => sum + entry.weight * beforeKO(entry), 0) * 0.7 -
						Math.max(0, ...replies.map(beforeKO)) * 0.3,
				};
			};
			const finishCache = new Map<Combatant, number>();
			const finishWindow = (opponent: Combatant) => {
				if (!roomTurns || request.forceSwitch) return 0;
				let chance = finishCache.get(opponent);
				if (chance !== undefined) return chance;
				const incoming = danger(current, opponent);
				chance = Math.max(0, ...moveIDs(current).map(id => {
					const attack = probe(current, opponent, id);
					return attack.knockout * orderRisk(attack, incoming).first *
						actionOpportunity(current, dex.moves.get(id), memory);
				}));
				finishCache.set(opponent, chance);
				return chance;
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
				let finishProbability = 0;
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
								const afterDanger = danger(afterEntry, opponent);
								const canAct = orderRisk(attack, afterDanger, false).survives *
									actionOpportunity(afterEntry, dex.moves.get(id), memory);
								const counterplay = attack.destinyBond ? attack.destinyBond * afterDanger.responses.reduce((sum, entry) =>
									sum + entry.weight * entry.estimate.knockout * firstChance(attack, entry.estimate, false), 0) : 0;
								return { id, attack, canAct, counterplay };
							}) : [];
							const attackValue = Math.max(0, ...future.map(({ attack, canAct, counterplay }) => canAct *
								(attack.damage * 75 * (1 - recoveryWall(opponent, attack.damage, attack.knockout) * 0.8) +
									attack.knockout * 75 + counterplay * 150)));
							const futureChance = Math.max(0, ...future.map(move => move.canAct)) *
								(1 - (takesEntryAction ? incoming.knockout : 0));
							const canRecover = future.some(({ id, canAct }) => canAct > 0.5 &&
								recoveryAmount(dex.moves.get(id), afterEntry, memory) > incoming.worst.damage + incoming.followup - passive);
							const discount = takesEntryAction ? 0.4 : 1;
							if (!takesEntryAction && future.some(entry => entry.counterplay > 0.5 && entry.canAct > 0.5)) {
								reasons.push('emergency-counterplay', 'counterplay-entry');
							}
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
								const finish = finishWindow(opponent);
								if (finish > 0.85 && !opponent.volatiles.includes('destinybond')) {
									const canEscape = seen.moves.some(id => recoveryAmount(dex.moves.get(id)) || dex.moves.get(id).selfSwitch);
									longTerm -= finish * (canEscape ? 55 : 30);
									reasons.push('concedes-finishing-window');
								}
								if (stalled && futureChance > 0.75 && attackValue > 45 &&
									future.some(({ attack }) => attack.damage > offense(current, opponent) + 0.15 &&
										!recoveryWall(opponent, attack.damage, attack.knockout))) {
									value += Math.min(16, stalled * 5);
									reasons.push('break-recovery-loop');
								}
							}
							if (!roomTurns && room.value > 0.15) {
								const setter = future.find(entry => entry.id === 'trickroom' && entry.attack.trickRoom > 0);
								if (setter && setter.canAct > 0 && (!moveIDs(current).includes('trickroom') || request.forceSwitch)) {
									const benefit = room.value * 65 * setter.canAct * discount *
										(1 - (takesEntryAction ? incoming.knockout : 0));
									value += benefit;
									if (benefit > 5) reasons.push('trick-room-setup', 'trick-room-setter-entry');
								}
							} else if (roomTurns > (takesEntryAction ? 1 : 0) && room.value > 0.15) {
								value += Math.max(0, room.benefits[index]) * futureChance * Math.min(1, attackValue / 60) * 24;
								if (room.benefits[index] > 0.2 && futureChance > 0.5 && attackValue > 20) {
									reasons.push('trick-room-attacker-entry');
								}
								if (takesEntryAction && room.benefits[activeIndex] > 0.2 &&
									offense(current, opponent) >= attackValue / 75) longTerm -= 16;
							}
							reasons.push('switch-matchup');
						} else if (kind === 'move' && !request.forceSwitch) {
							const mon = current;
							const id = request.active[0].moves[index].id;
							const move = this.hypotheses.dex.moves.get(id);
							const attack = probe(mon, opponent, id, event);
							const futileSetup = !!attack.userAfterMove && !attack.postAction && !attack.damage && !attack.healing &&
								!attack.delayedHealing && !attack.status && !attack.field && !attack.trickRoom && !attack.hazardChanges.length &&
								!attack.utility && !attack.volatile && !attack.pivot &&
								!moveIDs(mon).some(moveID => dex.moves.get(moveID).selfSwitch === 'copyvolatile') &&
								residualDamage(opponent, dex, seen, memory) <= passiveRecovery(opponent, dex, memory) &&
								offense({ ...attack.userAfterMove, moves: moveIDs(mon) }, opponent) === 0;
							ineffective &&= attack.ineffective >= 0.999 || futileSetup;
							const defending = attack.userAfterMechanic || mon;
							const baseIncoming = danger(defending, opponent);
							const opportunity = actionOpportunity(defending, move, memory);
							const incoming = attack.postAction || attack.targetAfterMove ?
								assessDanger(defending, opponent, { attack, opportunity }) : baseIncoming;
							const { first, survives } = orderRisk(attack, incoming, !event);
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
							finishProbability += stopped * survives * opponent.probability / hypothesisWeight;
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
							value += survives * opportunity * (attack.substituteDamage || 0) * 60;
							value += survives * (attack.field * 16 + attack.volatile * 12 + attack.utility * 12);
							if (attack.destinyBond) {
								const trade = incoming.responses.reduce((sum, entry) => sum +
									entry.weight * (entry.estimate.selfKnockout || 0), 0);
								const threatened = own.filter((member, slot) => slot !== activeIndex && member.health.upper > 0 &&
									danger(member, opponent).knockout > 0.5).length;
								value += trade * (180 + Math.min(60, threatened * 20));
								if (trade > 0.25 && alive > 1) reasons.push('emergency-counterplay', 'destiny-bond-trade');
							}
							if (id === 'encore' && attack.targetAfterMove) {
								const denied = Math.max(0, baseIncoming.knockout - incoming.knockout);
								longTerm += denied * 35;
								if (denied > 0.25) reasons.push('emergency-counterplay', 'encore-disruption');
							}
							const cycle = mon.moves.includes('toxic') && mon.moves.some(moveID => dex.moves.get(moveID).stallingMove);
							const poison = Math.max(0, residualDamage(opponent, dex, seen, memory) - passiveRecovery(opponent, dex, memory));
							if (move.stallingMove && attack.protection) {
								// Apply the same key-member rescue credit as a safe switch.
								if (this.isKey(observation, activeIndex)) value += Math.max(0,
									baseIncoming.knockout - incoming.knockout) * 35;
								const recovery = incoming.responses.reduce((sum, entry) =>
									sum + entry.estimate.healing * entry.weight, 0);
								const progress = Math.max(0, poison - recovery);
								value += opportunity * attack.protection *
									(Math.min(passive, 1 - mon.health.upper) * 85 + progress * 100);
								if (progress >= opponent.health.upper && progress > 0) value += attack.protection * 80;
								longTerm -= (1 - attack.protection) * 22 + incoming.setup * 28 + recovery * 25;
								if (cycle && (progress > 0 || baseIncoming.knockout > incoming.knockout + 0.2)) {
									// An escalating poison clock can force a future recovery/switch beyond the short horizon.
									if (opponent.status === 'tox') longTerm += attack.protection * Math.min(20, progress * 160);
									reasons.push('defensive-cycle', 'residual-stall');
								}
								if (id === 'kingsshield' && attack.userAfterMove && mon.species !== attack.userAfterMove.species) {
									const shield = { ...attack.userAfterMove,
										volatiles: attack.userAfterMove.volatiles.filter(effect => !['kingsshield', 'stall'].includes(effect)) };
									longTerm += opportunity * Math.min(30, Math.max(0,
										baseIncoming.damage - danger(shield, opponent).damage) * 45);
									reasons.push('defensive-cycle', 'shield-forme');
								}
							}
							if (cycle && id === 'substitute' && attack.postAction && !mon.volatiles.includes('substitute')) {
								const afterSub = attack.postAction[0].profile;
								const future = danger(afterSub, opponent);
								const holds = future.responses.reduce((sum, entry) => sum + entry.weight *
									(1 - (entry.estimate.substituteBroken || 0)) * Math.max(0, 1 - entry.estimate.damage * 4), 0);
								const statusSaved = Math.max(0, baseIncoming.disruption - future.disruption);
								const canPlace = first + (1 - first) * Number(mon.health.upper > baseIncoming.worst.damage + attack.selfDamage);
								longTerm += survives * opportunity * canPlace *
									(holds * 36 + Math.min(30, statusSaved * 1.5) + poison * 40);
								longTerm -= (1 - canPlace) * 80 + future.setup * 30;
								if (canPlace && holds > 0.5 && future.knockout < 0.2) reasons.push('defensive-cycle', 'safe-substitute');
							}
							if (cycle && id === 'toxic') {
								const pressure = (attack.targetAfterStatus || []).reduce((sum, outcome) => {
									if (outcome.profile.status !== 'tox') return sum;
									const next = residualDamage(outcome.profile, dex, undefined, memory);
									const gain = next > 0 ? Math.max(0, next * 6 - passiveRecovery(outcome.profile, dex, memory) * 3) : 0;
									return sum + gain * outcome.probability;
								}, 0);
								longTerm += survives * opportunity * Math.min(30, pressure * 100);
								if (pressure > 0) reasons.push('defensive-cycle', 'toxic-pressure');
							}
							if (id === 'trickroom') {
								if (attack.trickRoom > 0) {
									const duration = effectiveAbility(defending) === 'persistent' ? 7 : 5;
									value += survives * opportunity * attack.trickRoom * Math.max(0, room.value) * 65 * (duration - 1) / 4;
									if (room.value > 0.15) reasons.push('trick-room-setup');
									else { longTerm -= 45; reasons.push('trick-room-unfavorable'); }
								} else if (attack.trickRoom < 0) {
									value -= survives * opportunity * room.value * Math.min(1.4, roomTurns / 3) * 65;
									if (room.value > 0.15) {
										longTerm -= 35;
										reasons.push('trick-room-cancels-own-window');
									} else if (room.value < -0.15) reasons.push('trick-room-setup', 'trick-room-reverse');
									else longTerm -= 25;
								}
							} else if (roomTurns && room.value > 0.15) {
								if (damage > 0 && move.priority <= 0) {
									value += survives * Math.max(0, room.benefits[activeIndex]) * Math.min(1, damage * 2) * 18;
									reasons.push('trick-room-attack');
								}
								if (attack.pivot && roomTurns > 1) {
									const candidates = own.map((member, slot) => ({ member, slot }))
										.filter(entry => entry.slot !== activeIndex && room.benefits[entry.slot] > 0.2)
										.sort((a, b) => room.benefits[b.slot] - room.benefits[a.slot]).slice(0, 2);
									const best = Math.max(0, ...candidates.map(({ member, slot }) => {
										const entry = entryHazards(member, memory.sides[observation.ownSide].conditions, dex, memory);
										if (member.health.upper <= entry.damage) return 0;
										return Math.max(0, offense(member, opponent) - offense(mon, opponent)) *
											Math.max(0, room.benefits[slot]) * (1 - entry.damage);
									}));
									value += survives * opportunity * attack.pivot * Math.min(1.5, best) * 70;
									if (best > 0.1) reasons.push('trick-room-pivot');
								}
								if (move.category === 'Status' && !attack.pivot) {
									const urgent = reasons.includes('urgent-recovery');
									longTerm -= room.value * (roomTurns <= 2 ? 22 : 10) * (urgent ? 0.15 : 1);
									reasons.push('trick-room-turn-cost');
								}
							}
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
				if (finishProbability > 0.85) reasons.push('reliable-finish');
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
