import { toID } from '../../sim/dex';
import { Teams } from '../../sim/teams';
import type { PokemonMoveRequestData } from '../../sim/side';
import { HypothesisBuilder, type Combatant } from './hypotheses';
import type { Observation } from './information';
import type { InitialPokemon } from './initial-snapshot';
import { readBattleMemory, type BattleMemory, type SeenPokemon, type SinglesSide } from './memory';
import { HypotheticalSets } from './sets';
import { DEFAULT_LIMITS, type ValidatedTrainer } from './types';

export interface WorldMember {
	set: PokemonSet;
	profile: Combatant;
	exactStats: boolean;
	seen?: SeenPokemon;
	disguise?: string;
	request?: PokemonMoveRequestData;
}
export interface WorldHypothesis {
	format: string;
	ownSide: SinglesSide;
	turn: number;
	variant: number;
	probability: number;
	teams: Record<SinglesSide, WorldMember[]>;
	memory: BattleMemory;
	publicLog: string[];
	initialOpponent?: InitialPokemon[];
	diagnostics: string[];
}
export type WorldTrainer = Pick<ValidatedTrainer, 'format' | 'packedTeam'>;

function unseen(species: string, level: number, side: SinglesSide): SeenPokemon {
	return {
		appearance: '', side, ident: '', species, level, health: { lower: 1, upper: 1 },
		status: '', moves: [], moveUses: {}, boosts: {}, volatiles: [], transformed: false, ambiguousIdentity: false,
	};
}

/** Full teams are assembled from allowed data; their order is an invented hypothesis, not a revealed slot mapping. */
export class WorldBuilder {
	private readonly hypotheses: HypothesisBuilder;
	private readonly sets: HypotheticalSets;
	private readonly trainer: WorldTrainer;

	constructor(trainer: WorldTrainer) {
		this.trainer = structuredClone(trainer);
		this.hypotheses = new HypothesisBuilder(trainer.format);
		this.sets = new HypotheticalSets(trainer.format);
	}

	build(observation: Observation): WorldHypothesis[] {
		if (observation.request.wait || observation.request.teamPreview || observation.request.forceSwitch) return [];
		const request = observation.request;
		const dex = this.hypotheses.dex;
		const memory = readBattleMemory(observation.publicLog, dex);
		const side = observation.ownSide;
		const foe = side === 'p1' ? 'p2' : 'p1';
		const active = memory.sides[foe].active;
		if (!active || memory.turn < 1) throw new Error('missing-public-position');
		if (Object.values(memory.sides).some(team => team.active?.transformed)) throw new Error('unsupported-transform');
		// Do not silently resurrect or double-count a fainted disguise on the bench.
		if (memory.sides[foe].appearances.some(mon => mon.ambiguousIdentity && mon.health.upper === 0)) {
			throw new Error('unresolved-fainted-identity');
		}
		const family = (species: string) => dex.species.get(species).baseSpecies;
		const initial = observation.difficulty === 'hard' ? observation.initialOpponent || [] : [];
		const roster = initial.length ? initial.map(mon => ({ species: mon.species, level: mon.level, snapshot: mon })) :
			memory.sides[foe].preview.map(mon => ({ ...mon, snapshot: undefined as InitialPokemon | undefined }))
				.sort((a, b) => a.species.localeCompare(b.species) || a.level - b.level);
		if (roster.length !== 6) throw new Error('missing-full-public-preview');
		const ownSets = Teams.unpack(this.trainer.packedTeam);
		if (!ownSets || ownSets.length !== 6) throw new Error('missing-own-team');
		const remaining = ownSets.slice();
		const own = request.side.pokemon.map((mon, index): WorldMember => {
			const profile = this.hypotheses.own(mon, mon.active ? memory.sides[side].active : undefined);
			const name = toID(mon.ident.split(': ').slice(1).join(': '));
			const matchingNames = remaining.map((set, position) => ({ set, index: position }))
				.filter(({ set }) => toID(set.name || family(set.species)) === name);
			const matchingMoves = matchingNames.filter(({ set }) =>
				set.moves.map(toID).sort().join(',') === profile.moves.map(toID).sort().join(','));
			const matches = matchingNames.length === 1 ? matchingNames : matchingMoves;
			const match = matches.length === 1 ? matches[0].index : -1;
			if (match < 0) throw new Error('ambiguous-own-configuration');
			const [set] = remaining.splice(match, 1);
			const seen = mon.active ? memory.sides[side].active : memory.sides[side].appearances.slice().reverse()
				.find(member => toID(member.ident.split(': ').slice(1).join(': ')) === name);
			return {
				set, profile, exactStats: true, seen: seen && structuredClone(seen),
				request: index === 0 ? structuredClone(request.active[0]) : undefined,
			};
		});
		const activeOptions = this.hypotheses.build(active, observation, memory);
		const worlds: WorldHypothesis[] = [];
		const failures: string[] = [];
		for (let variant = 0; variant < 2 && worlds.length < DEFAULT_LIMITS.hypotheses; variant++) {
			for (const option of activeOptions) {
				if (worlds.length >= DEFAULT_LIMITS.hypotheses) break;
				try {
					const possible = roster.map((member, index) => ({ member, index }))
						.filter(({ member }) => family(member.species) === family(option.species));
					if (!possible.length) throw new Error('unmatched-public-identity');
					const activeIndex = possible[variant % possible.length].index;
					const diagnostics: string[] = ['hypothesized-hidden-counters'];
					const opponents = roster.map((member, index): WorldMember => {
						const onField = index === activeIndex;
						const seen = onField ? active : memory.sides[foe].appearances.slice().reverse().find(mon =>
							mon !== active && !mon.ambiguousIdentity && !mon.transformed && family(mon.species) === family(member.species));
						const shell = unseen(member.species, member.level, foe);
						const snapshot = member.snapshot;
						const priors = this.hypotheses.build(shell, { ...observation, difficulty: 'normal' }, memory);
						const prior = priors[variant % priors.length];
						const base: Combatant = snapshot ? {
							...prior, ...snapshot, moves: snapshot.moves.slice(), stats: { ...snapshot.stats },
						} : { ...prior, moves: onField ? option.moves.slice() : seen?.moves.length ?
							[...new Set([...seen.moves, ...prior.moves])].slice(0, 4) : prior.moves.slice() };
						const set = this.sets.create(base, !!snapshot, variant, seen?.moves.filter(id => !dex.moves.get(id).isZ));
						// Synthetic names never encode the real opponent's initial position.
						set.name = onField ? active.ident.split(': ').slice(1).join(': ') : `Hypothesis ${index + 1}`;
						let profile: Combatant = { ...base, ability: toID(set.ability), item: toID(set.item), moves: set.moves.slice() };
						if (seen) {
							const visible = onField ? option : this.hypotheses.build(seen, observation, memory)[0];
							const changed = dex.species.get(visible.species).id !== dex.species.get(member.species).id;
							profile = {
								...profile, species: visible.species, health: { ...seen.health }, status: seen.status,
								boosts: onField ? { ...seen.boosts } : {}, volatiles: onField ? seen.volatiles.slice() : [],
								types: onField && option.identity !== 'illusion' ? seen.types?.slice() : undefined,
								ability: (onField ? seen.ability : undefined) ?? (changed ?
									dex.species.get(visible.species).abilities['0'] : profile.ability),
								item: seen.item ?? profile.item, terastallized: seen.teraType,
							};
						}
						return {
							set, profile, seen: seen && structuredClone(seen),
							exactStats: !!snapshot && toID(profile.species) === toID(snapshot.species),
							disguise: onField && option.identity === 'illusion' ? active.species : undefined,
						};
					});
					if (this.sets.validateTeam(opponents.map(mon => mon.set)).length) throw new Error('illegal-team-hypothesis');
					const [lead] = opponents.splice(activeIndex, 1);
					opponents.unshift(lead);
					if (lead.disguise) diagnostics.push('hypothesized-illusion-identity');
					const teams = { [side]: structuredClone(own), [foe]: opponents } as WorldHypothesis['teams'];
					worlds.push({
						format: this.trainer.format, ownSide: side, turn: memory.turn, variant, probability: option.probability,
						teams, memory: structuredClone(memory), publicLog: observation.publicLog.slice(), diagnostics,
						initialOpponent: initial.length ? structuredClone(initial) : undefined,
					});
				} catch (error) {
					failures.push(error instanceof Error ? error.message : 'world-build-failed');
				}
			}
		}
		if (!worlds.length) throw new Error(failures[0] || 'no-world-hypothesis');
		const total = worlds.reduce((sum, world) => sum + world.probability, 0);
		for (const world of worlds) {
			world.probability /= total;
			world.diagnostics.push(...new Set(failures));
		}
		return worlds;
	}
}
