import { PRNG, type PRNGSeed } from '../../sim/prng';
import { Teams } from '../../sim/teams';
import { toID } from '../../sim/dex';
import { enumerateRequestChoices } from './actions';
import { HypothesisBuilder, type Combatant } from './hypotheses';
import type { Observation } from './information';
import { estimateMove, type MoveEstimate } from './matchup';
import { readBattleMemory, type BattleMemory, type SeenPokemon } from './memory';
import { DEFAULT_LIMITS, type ValidatedTrainer } from './types';
import { getTrainerFormat } from './trainers';

export interface ScoredChoice { choice: string; score: number; reasons: string[] }
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

/** Deterministic rule policy; only near-equal candidates consume the supplied decision seed. */
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
			return toID(mon.name && mon.name !== mon.species ? mon.name : this.hypotheses.dex.species.get(mon.species).baseSpecies);
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
			const hazards = mon.moves.some(id => ['stealthrock', 'spikes', 'stickyweb'].includes(id)) ? 6 : 0;
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

	private hazards(mon: Combatant, memory: BattleMemory, observation: Observation): number {
		if (mon.item === 'heavydutyboots' || mon.ability === 'magicguard') return 0;
		const dex = this.hypotheses.dex;
		const types = mon.terastallized && mon.terastallized !== 'Stellar' ? [mon.terastallized] :
			mon.types || dex.species.get(mon.species).types;
		const conditions = memory.sides[observation.ownSide].conditions;
		let damage = conditions.stealthrock ? 0.125 * (2 ** dex.getEffectiveness('Rock', types)) : 0;
		if (!types.includes('Flying') && mon.ability !== 'levitate' && mon.item !== 'airballoon') {
			if (conditions.spikes) damage += [0, 0.125, 1 / 6, 0.25][Math.min(3, conditions.spikes)];
		}
		return damage;
	}

	decide(observation: Observation, seed: PRNGSeed, excluded: readonly string[] = []): RuleDecision {
		const request = observation.request;
		if (request.wait) return { choice: null, candidates: [], phase: 'wait', diagnostics: [] };
		const choices = enumerateRequestChoices(request).filter(choice => !excluded.includes(choice));
		const memory = readBattleMemory(observation.publicLog, this.hypotheses.dex);
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
			const hypotheses = this.hypotheses.build(seen, observation, memory);
			const active = memory.sides[observation.ownSide].active;
			const own = request.side.pokemon.map(mon => this.hypotheses.own(mon, mon.active ? active : undefined));
			const weights = WEIGHTS[this.trainer.style];
			const cache = new Map<string, MoveEstimate>();
			const probe = (
				attacker: Combatant, defender: Combatant, id: string, event = '', attackingSide = observation.ownSide
			) => {
				const key = JSON.stringify([attacker, defender, id, event, attackingSide]);
				let estimate = cache.get(key);
				if (!estimate) {
					estimate = estimateMove(this.trainer.format, attacker, defender, id, event, memory, attackingSide);
					cache.set(key, estimate);
					for (const effect of estimate.omittedVolatiles) diagnostics.add(`approximate-volatile:${effect}`);
				}
				return estimate;
			};
			const danger = (mon: Combatant, opponent: Combatant) => {
				const estimates = opponent.moves.map(id => probe(opponent, mon, id, '', foe));
				return estimates.sort((a, b) => b.damage + b.knockout - a.damage - a.knockout)[0];
			};
			ranked = choices.map(choice => {
				const [kind, slotText, event = ''] = choice.split(' ');
				const index = Number(slotText) - 1;
				const reasons: string[] = [];
				let score = 0;
				try {
					for (const opponent of hypotheses) {
						let value: number;
						if (kind === 'switch') {
							const mon = own[index];
							const incoming = danger(mon, opponent);
							const offense = Math.max(0, ...mon.moves.map(id => {
								const attack = probe(mon, opponent, id);
								return attack.damage * 70 + attack.knockout * 40;
							}));
							const entryDamage = this.hazards(mon, memory, observation);
							value = offense - weights.risk * (incoming.damage * 90 + incoming.knockout * 100 + entryDamage * 100);
							if (entryDamage >= mon.health.upper) value -= 250;
							if (this.isKey(observation, index)) value -= incoming.damage * 25;
							if (!request.forceSwitch) {
								value -= 18;
								const recent = memory.switches.filter(entry => entry.side === observation.ownSide && entry.turn >= memory.turn - 3);
								value -= recent.length * 12;
								const targetName = toID(request.side.pokemon[index].ident.split(': ')[1]);
								if (recent.some(entry => toID(entry.ident.split(': ')[1]) === targetName)) value -= 25;
								value -= Object.values(own[0].boosts).reduce((sum, boost) => sum + Math.max(0, boost || 0), 0) * 5;
								if (this.isKey(observation, 0)) value += danger(own[0], opponent).knockout * 35;
							}
							reasons.push('switch-matchup');
						} else if (kind === 'move' && !request.forceSwitch) {
							const mon = own[0];
							const id = request.active[0].moves[index].id;
							const move = this.hypotheses.dex.moves.get(id);
							const attack = probe(mon, opponent, id, event);
							const incoming = danger(mon, opponent);
							const fast = memory.pseudoWeather.includes('trickroom') ?
								attack.speed < attack.opponentSpeed : attack.speed > attack.opponentSpeed;
							const first = attack.priority !== incoming.priority ? Number(attack.priority > incoming.priority) :
								attack.speed === attack.opponentSpeed ? 0.5 : Number(fast);
							const survives = 1 - incoming.knockout * (1 - first);
							const opportunity = mon.status === 'par' ? 0.75 :
								mon.status === 'slp' && !['sleeptalk', 'snore'].includes(id) ? 0.25 : mon.status === 'frz' ? 0.2 : 1;
							value = survives * opportunity * (attack.damage * 100 * weights.damage + attack.knockout * 85 +
								attack.healing * 115 + attack.status * 24 + attack.boosts * 18 * weights.setup * Math.max(0, 1 - incoming.damage * 2));
							const stopped = attack.knockout * first * opportunity;
							const fatal = incoming.damage >= mon.health.upper + attack.healing * first ? incoming.knockout : 0;
							value -= weights.risk * (1 - stopped) * (incoming.damage * 30 + fatal * 65);
							value -= attack.selfDamage * 55;
							value += survives * (attack.field * 16 + attack.volatile * 12);
							if (id === 'rest') value -= 10;
							if (event) {
								const resource = event === 'ultra' ? 'aura' : event.startsWith('mega') ? 'mega' : event;
								value -= resource === 'mega' ? 8 : 20;
								if (this.trainer.resourcePreferences.some(preference => preference === resource)) value += 5;
							}
							if (attack.knockout) reasons.push('knockout');
							if (attack.healing) reasons.push('recovery');
							if (attack.boosts > 0) reasons.push('setup');
							if (!attack.damage && move.category !== 'Status') reasons.push('no-effective-damage');
						} else {
							value = -100;
						}
						score += value * opponent.probability;
					}
				} catch (error) {
					diagnostics.add(`probe-failed:${error instanceof Error ? error.message : 'unknown'}`);
					score = -1000;
				}
				return { choice, score, reasons: [...new Set(reasons)] };
			});
		}
		ranked.sort((a, b) => b.score - a.score || (a.choice < b.choice ? -1 : a.choice > b.choice ? 1 : 0));
		const close = ranked.filter(candidate => candidate.score >= ranked[0].score - 1.5);
		const choice = close.length ? new PRNG(seed).sample(close).choice : 'default';
		// Always retain the selected near-tie, even when many preview orders tie.
		const selected = ranked.find(candidate => candidate.choice === choice);
		const candidates = selected ?
			[selected, ...ranked.filter(candidate => candidate !== selected)].slice(0, DEFAULT_LIMITS.ownCandidates) : [];
		return { choice, candidates, phase, diagnostics: [...diagnostics] };
	}
}
