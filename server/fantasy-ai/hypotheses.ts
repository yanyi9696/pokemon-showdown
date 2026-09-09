import { Dex, toID } from '../../sim/dex';
import type { PokemonSwitchRequestData } from '../../sim/side';
import type { Observation } from './information';
import type { InitialPokemon } from './initial-snapshot';
import { type BattleMemory, type SeenPokemon, parseDetails, parseHealth } from './memory';
import { DEFAULT_LIMITS } from './types';
import { PIVOT_MOVES, recoveryAmount } from './strategy';
import type { FantasyState } from './fantasy-state';
import { priorItems } from './item-priors';

interface SetSamples { [species: string]: { sets: { movepool: string[], abilities?: string[] }[] } }
const fantasySamples: SetSamples = require('../../data/random-battles/gen9fantasy/sets.json');
const standardSamples: SetSamples = require('../../data/random-battles/gen9/sets.json');

export interface Combatant {
	species: string;
	level: number;
	stats: StatsTable;
	moves: string[];
	ability: string;
	item: string;
	health: { lower: number, upper: number };
	status: string;
	boosts: SparseBoostsTable;
	volatiles: string[];
	types?: string[];
	teraType: string;
	terastallized?: string;
	appearance?: string;
	persistentEffects?: string[];
	fantasy?: FantasyState;
	reserves?: number;
}
export interface OpponentHypothesis extends Combatant {
	probability: number;
	source: 'initial' | 'prior';
	identity: 'visible' | 'illusion';
}

/** Keep the same default-name and truncation rules as sim/Pokemon. */
export function battleNickname(set: PokemonSet, dex: ModdedDex): string {
	return (set.name && toID(set.name) !== toID(set.species) ? set.name :
		dex.species.get(set.species).baseSpecies).slice(0, 20);
}

export function estimateStats(species: Species, level: number, bulky = false, specialBulk = false): StatsTable {
	const physical = species.baseStats.atk >= species.baseStats.spa;
	const result = {} as StatsTable;
	for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
		const trained = bulky ? stat === 'hp' || stat === (specialBulk ? 'spd' : 'def') :
			stat === 'spe' || stat === (physical ? 'atk' : 'spa');
		const value = Math.floor((2 * species.baseStats[stat] + 31 + (trained ? 63 : 0)) * level / 100);
		result[stat] = stat === 'hp' ? (species.baseStats.hp === 1 ? 1 : value + level + 10) : value + 5;
	}
	return result;
}

export class HypothesisBuilder {
	readonly dex: ModdedDex;
	readonly format: string;
	private readonly movePools = new Map<string, string[]>();

	constructor(format: string) {
		this.format = format;
		this.dex = Dex.forFormat(format);
	}

	private priorMoves(species: Species, variant: number, revealed: readonly string[]): string[] {
		let pool = this.movePools.get(species.id);
		if (!pool) {
			const rules = this.dex.formats.getRuleTable(this.dex.formats.get(this.format));
			pool = [...this.dex.species.getMovePool(species.id, rules.has('natdexmod'))]
				.filter(id => {
					const move = this.dex.moves.get(id);
					// Ji Sheng and other adjacent-ally moves have no legal ally target in this singles feature.
					return move.exists && move.target !== 'adjacentAlly' && !rules.isBanned(`move:${id}`);
				}).sort();
			this.movePools.set(species.id, pool);
		}
		const templates = (fantasySamples[species.id] || standardSamples[species.id] ||
			standardSamples[toID(species.baseSpecies)])?.sets || [];
		const preferred = templates.length ? templates[variant % templates.length].movepool.map(toID) : [];
		const rank = (id: string) => {
			const move = this.dex.moves.get(id);
			if (move.category === 'Status') {
				if (recoveryAmount(move)) return variant ? 140 : 65;
				if (PIVOT_MOVES.has(id)) return 90;
				if (move.sideCondition || ['defog', 'taunt', 'encore', 'willowisp', 'toxic', 'protect'].includes(id)) {
					return variant ? 85 : 35;
				}
				return move.boosts ? 70 : move.status ? 45 : 0;
			}
			return (move.basePower || (move.damage ? 80 : 0)) * (species.types.includes(move.type) ? 1.5 : 1) *
				(move.category === (species.baseStats.atk >= species.baseStats.spa ? 'Physical' : 'Special') ? 1 : 0.6) *
				(typeof move.accuracy === 'number' ? move.accuracy / 100 : 1);
		};
		const candidates = pool.slice().sort((a, b) =>
			(Number(preferred.includes(b as ID)) - Number(preferred.includes(a as ID))) || rank(b) - rank(a) || a.localeCompare(b));
		const moves = revealed.filter(id => !this.dex.moves.get(id).isZ).slice(-4);
		const add = (id?: string) => { if (id && moves.length < 4 && !moves.includes(id)) moves.push(id); };
		// Build coherent offensive / physical-wall / special-wall sets. Templates are
		// priors only; revealed recovery and utility moves must survive all variants.
		if (!moves.some(id => this.dex.moves.get(id).category !== 'Status')) {
			add(candidates.find(id => this.dex.moves.get(id).category !== 'Status' &&
				species.types.includes(this.dex.moves.get(id).type)));
		}
		if (variant && !moves.some(id => recoveryAmount(this.dex.moves.get(id)))) {
			add(candidates.find(id => recoveryAmount(this.dex.moves.get(id)) > 0));
		}
		for (const id of candidates) {
			if (moves.length >= 4) break;
			if (moves.includes(id)) continue;
			const move = this.dex.moves.get(id);
			// Avoid four nearly identical STAB attacks in a fallback prior.
			if (moves.some(other => {
				const existing = this.dex.moves.get(other);
				return move.category !== 'Status' && move.type === existing.type && move.category === existing.category;
			})) continue;
			moves.push(id);
		}
		return moves.length ? moves : ['struggle'];
	}

	build(seen: SeenPokemon, observation: Observation, memory: BattleMemory): OpponentHypothesis[] {
		const initial = observation.difficulty === 'hard' ? observation.initialOpponent || [] : [];
		const visible = this.dex.species.get(seen.species);
		if (!visible.exists) throw new Error(`Unknown observed species: ${seen.species}`);
		const matches = initial.filter(mon => {
			const species = this.dex.species.get(mon.species);
			return species.id === visible.id || (!seen.ambiguousIdentity && species.baseSpecies === visible.baseSpecies);
		});
		const identities: { species: Species, initial?: InitialPokemon, illusion: boolean }[] =
			matches.length ? matches.map(mon => ({ species: visible, initial: mon, illusion: false })) :
			[{ species: visible, illusion: false }];
		if (seen.ambiguousIdentity) {
			if (initial.length) {
				for (const mon of initial) {
					if (toID(mon.ability) === 'illusion' && toID(mon.species) !== visible.id) {
						identities.push({ species: this.dex.species.get(mon.species), initial: mon, illusion: true });
					}
				}
			} else {
				for (const member of memory.sides[seen.side].preview) {
					const species = this.dex.species.get(member.species);
					if (species.id !== visible.id && Object.values(species.abilities).some(ability => toID(ability) === 'illusion')) {
						identities.push({ species, illusion: true });
					}
				}
			}
		}
		const result: OpponentHypothesis[] = [];
		const publicSide = memory.sides[seen.side];
		const fainted = new Set(publicSide.appearances.filter(mon => mon.health.upper === 0 && !mon.ambiguousIdentity)
			.map(mon => this.dex.species.get(mon.species).baseSpecies)).size;
		const reserves = Math.max(0, publicSide.preview.length - fainted - 1);
		const defensiveEvidence = seen.moves.some(id => recoveryAmount(this.dex.moves.get(id)) ||
			['protect', 'saltcure', 'willowisp', 'toxic', 'defog'].includes(id));
		for (let variant = 0; result.length < DEFAULT_LIMITS.hypotheses && variant < 3; variant++) {
			for (const identity of identities) {
				if (result.length >= DEFAULT_LIMITS.hypotheses) break;
				if (variant && identity.initial) continue;
				const { species, initial: snapshot, illusion } = identity;
				const unchangedForme = snapshot && toID(snapshot.species) === species.id && !seen.transformed;
				const level = snapshot?.level || seen.level;
				const abilities = Object.values(species.abilities);
				const revealedMoves = seen.moves.filter(id => !this.dex.moves.get(id).isZ);
				const assumedAbility = unchangedForme ? snapshot.ability : abilities[variant % abilities.length];
				const ability = seen.ability ?? (illusion ? 'illusion' : toID(assumedAbility));
				const moves = snapshot && !seen.transformed ? [...new Set([...revealedMoves, ...snapshot.moves])].slice(0, 4) :
					this.priorMoves(species, variant, revealedMoves);
				const items = seen.item === undefined && !snapshot ?
					priorItems(this.dex, this.format, species, moves, ability, variant > 0, seen.status) : [];
				result.push({
					species: species.name, level,
					stats: unchangedForme ? { ...snapshot.stats } : estimateStats(species, level, variant > 0, variant === 2),
					moves, ability, reserves,
					item: seen.item ?? snapshot?.item ?? items[Math.min(variant, items.length - 1)] ?? '',
					health: { ...seen.health }, status: seen.status, boosts: { ...seen.boosts },
					volatiles: seen.volatiles.slice(), types: illusion ? undefined : seen.types?.slice(),
					teraType: snapshot?.teraType || species.types[0], terastallized: seen.teraType,
					appearance: seen.appearance, persistentEffects: seen.persistentEffects?.slice(),
					fantasy: seen.fantasy && structuredClone(seen.fantasy),
					probability: (illusion ? 0.25 : 1) * (!snapshot && defensiveEvidence ? (variant ? 1.4 : 0.45) : 1),
					source: snapshot ? 'initial' : 'prior', identity: illusion ? 'illusion' : 'visible',
				});
			}
		}
		const total = result.reduce((sum, hypothesis) => sum + hypothesis.probability, 0);
		for (const hypothesis of result) hypothesis.probability /= total;
		return result;
	}

	own(mon: PokemonSwitchRequestData, seen?: SeenPokemon): Combatant {
		const { species, level } = parseDetails(mon.details);
		const estimated = estimateStats(this.dex.species.get(species), level);
		const hp = Number((/^\d+\/(\d+)/.exec(mon.condition))?.[1]) || estimated.hp;
		return {
			species, level, stats: { hp, ...mon.stats }, moves: mon.moves.slice(), ability: mon.ability ?? mon.baseAbility,
			item: mon.item, health: parseHealth(mon.condition, true), status: mon.condition.split(' ')[1] || '',
			// A benched member has shed Salt Cure, stat stages and temporary types.
			// Permanent Fantasy effects are restored from the separate fields below.
			boosts: mon.active ? { ...seen?.boosts } : {},
			volatiles: mon.active ? seen?.volatiles.slice() || [] : [],
			types: mon.active ? seen?.types?.slice() : undefined,
			teraType: mon.teraType || this.dex.species.get(species).types[0], terastallized: mon.terastallized || undefined,
			appearance: seen?.appearance, persistentEffects: seen?.persistentEffects?.slice(),
			fantasy: seen?.fantasy && structuredClone(seen.fantasy),
		};
	}
}
