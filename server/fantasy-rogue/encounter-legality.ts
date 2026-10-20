import { Dex, toID } from '../../sim/dex';

const dex = Dex.mod('gen9fantasy'), ordinary = Dex.mod('gen9');
const pools = new Map<string, ReadonlySet<string>>();
/** RPG partners keep their ordinary movepool as well as their authored Fantasy moves. */
export function encounterMovePool(name: string): ReadonlySet<string> {
	const species = dex.species.get(name);
	let pool = pools.get(species.id);
	if (!pool) {
		const moves = new Set<string>(dex.species.getMovePool(species.id, true));
		const original = ordinary.species.get(species.name.replace(/-Fantasy/g, ''));
		if (original.exists) for (const id of ordinary.species.getMovePool(original.id, true)) moves.add(id);
		pool = moves; pools.set(species.id, pool);
	}
	return pool;
}
/** Applies to generated/configured teams, before any explicit in-run blessing grants. */
export function encounterSetProblems(set: PokemonSet) {
	const species = dex.species.get(set.species), problems: string[] = [];
	if (!species.exists) return [`物种不存在：${set.species}`];
	if (!Object.values(species.abilities).some(ability => toID(ability) === toID(set.ability))) {
		problems.push(`${species.name} 不能拥有特性 ${set.ability}`);
	}
	const pool = encounterMovePool(species.name);
	for (const move of set.moves) if (!pool.has(toID(move))) problems.push(`${species.name} 不能学习招式 ${move}`);
	return problems;
}
