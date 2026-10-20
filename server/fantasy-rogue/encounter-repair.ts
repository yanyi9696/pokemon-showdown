import { Dex, toID } from '../../sim/dex';
import { encounterSetProblems, encounterMovePool } from './encounter-legality';
import { lowerToEligibleStage, minimumEvolutionLevel } from './evolution';
import { makeEncounterSet } from './encounter-sets';
import type { RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
const replacements: Record<string, string> = {
	blueflare: 'flamethrower', dazzlinggleam: 'energyball', wavecrash: 'liquidation',
	calmmind: 'coil', raoliangzhiyin: 'haze', recover: 'rest',
};
/** Repair old, already-generated opponents before a new battle. Never edits a player or an active battle. */
export function repairSavedEncounters(run: RogueRun) {
	if (run.phase === 'battle' || !run.node || run.node.event?.memory) return;
	const fixed = run.node.kind === 'boss';
	const repair = (set: PokemonSet) => {
		if (fixed) set.level = Math.max(set.level, minimumEvolutionLevel(set.species));
		else if (minimumEvolutionLevel(set.species) > set.level) {
			set.species = lowerToEligibleStage(set.species, set.level);
			set.name = set.species;
		}
		if (!encounterSetProblems(set).length) return;
		const species = dex.species.get(set.species), pool = encounterMovePool(species.name);
		if (!Object.values(species.abilities).some(a => toID(a) === toID(set.ability))) set.ability = species.abilities[0];
		const moves: string[] = [];
		for (const old of set.moves) {
			const id = toID(old), next = pool.has(id) ? id : replacements[id];
			if (next && pool.has(next) && !moves.includes(next)) moves.push(next);
		}
		if (!moves.length) moves.push(...makeEncounterSet(species.name, set.level).moves);
		set.moves = moves;
	};
	for (const encounter of run.node.encounters || []) {
		for (const set of [...(encounter.team || []), ...(encounter.cooperative?.team || []), ...(encounter.candidates || []),
			...(encounter.trainerCandidates || []).flatMap(candidate => candidate.team)]) repair(set);
	}
}
