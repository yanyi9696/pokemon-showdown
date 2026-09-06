import { Dex, toID } from '../../sim/dex';
import { TeamValidator } from '../../sim/team-validator';
import type { Combatant } from './hypotheses';

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

/** Find compatible spreads, without claiming to recover hidden nature, IVs or EVs. */
export function compatibleSpreads(dex: ModdedDex, speciesName: string, level: number, stats: StatsTable) {
	const species = dex.species.get(speciesName);
	const result: { nature: string, ivs: StatsTable, evs: StatsTable }[] = [];
	for (const nature of dex.natures.all()) {
		const ivs = {} as StatsTable;
		const evs = {} as StatsTable;
		let valid = true;
		for (const stat of STATS) {
			let found = false;
			for (let sum = 0; sum <= 94; sum++) {
				let value = Math.floor((2 * species.baseStats[stat] + sum) * level / 100) +
					(stat === 'hp' ? level + 10 : 5);
				if (stat === 'hp' && species.baseStats.hp === 1) value = 1;
				if (nature.plus === stat) value = Math.floor(value * 110 / 100);
				if (nature.minus === stat) value = Math.floor(value * 90 / 100);
				if (value !== stats[stat]) continue;
				ivs[stat] = Math.min(31, sum);
				evs[stat] = Math.max(0, sum - 31) * 4;
				found = true;
				break;
			}
			if (!found) { valid = false; break; }
		}
		if (valid && Object.values(evs).reduce((total, value) => total + value, 0) <= 510) {
			result.push({ nature: nature.name, ivs, evs });
		}
	}
	return result;
}

export class HypotheticalSets {
	readonly dex: ModdedDex;
	private readonly validator: TeamValidator;
	private readonly cache = new Map<string, PokemonSet>();

	constructor(format: string) {
		this.dex = Dex.forFormat(format);
		this.validator = new TeamValidator(format);
	}

	create(profile: Combatant, exact: boolean, variant: number, revealed: readonly string[] = []): PokemonSet {
		const key = JSON.stringify([profile.species, profile.level, profile.stats, profile.moves,
			profile.ability, profile.item, profile.teraType, exact, variant, revealed]);
		const cached = this.cache.get(key);
		if (cached) return structuredClone(cached);
		const spreads = compatibleSpreads(this.dex, profile.species, profile.level, profile.stats);
		if (!spreads.length) throw new Error('no-compatible-spread');
		const spread = spreads[variant % spreads.length];
		const base = {
			species: profile.species, level: profile.level, moves: profile.moves.slice(),
			ability: profile.ability, item: profile.item, teraType: profile.teraType, ...spread,
		} as PokemonSet;
		const species = this.dex.species.get(profile.species);
		const abilities = exact ? [base.ability] : [...new Set([base.ability, ...Object.values(species.abilities)])];
		const items = exact ? [base.item] : [...new Set([base.item, ''])];
		for (let count = base.moves.length; count > 0; count--) {
			const moves = base.moves.slice(0, count);
			if (revealed.some(id => !moves.some(move => toID(move) === id))) break;
			for (const ability of abilities) {
				for (const item of items) {
					const set = { ...structuredClone(base), ability, item, moves: moves.slice() };
					if (this.validator.validateSet(set, {})) continue;
					this.cache.set(key, set);
					return structuredClone(set);
				}
			}
			if (exact) break;
		}
		throw new Error('no-legal-configuration-hypothesis');
	}

	validateTeam(team: PokemonSet[]) {
		return this.validator.validateTeam(structuredClone(team)) || [];
	}
}
