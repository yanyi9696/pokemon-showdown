import { encounterBlessingLevels } from './blessing-levels';
import { Dex, toID } from '../../sim/dex';
import { encounterSetProblems, encounterMovePool } from './encounter-legality';
import { lowerToEligibleStage, minimumEvolutionLevel } from './evolution';
import { makeEncounterSet } from './encounter-sets';
import { FantasyEliteBosses } from './elite-bosses';
import type { RogueNode, RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
const replacements: Record<string, string> = {
	blueflare: 'flamethrower', dazzlinggleam: 'energyball', wavecrash: 'liquidation',
	calmmind: 'coil', raoliangzhiyin: 'haze', recover: 'rest',
};
/** Correct authored elite levels without rerolling rosters or reapplying blessing costs. */
function repairEliteLevels(node: RogueNode, floor: number) {
	const pool = node.kind === 'boss' && FantasyEliteBosses[floor];
	if (!pool) return;
	const species = new Set(pool.candidates.map(set => toID(set.species)));
	for (const encounter of node.encounters) {
		for (const [index, set] of encounter.team.entries()) {
			if (index < (encounter.escortCount || 0) || !species.has(toID(set.species))) continue;
			const offset = node.blessingPrepared ? encounter.blessingLevelOffsets?.[index] ?? encounter.blessingLevels ?? 0 : 0;
			set.level = pool.level + offset;
		}
		for (const set of encounter.candidates || []) {
			if (species.has(toID(set.species))) set.level = pool.level;
		}
	}
}
/** Repair old, already-generated opponents before a new battle. Never edits a player or an active battle. */
export function repairSavedEncounters(run: RogueRun) {
	if (run.phase === 'battle') return;
	for (const [floor, node] of Object.entries(run.bossPreviews || {})) {
		if (Number(floor) >= run.floor) repairEliteLevels(node, Number(floor));
	}
	if (!run.node || run.node.event?.memory) return;
	repairEliteLevels(run.node, run.floor);
	if (run.node.blessingPrepared) for (const encounter of run.node.encounters) {
		if (encounter.boss?.kind !== 'summit') continue;
		const previous = encounter.blessingLevelOffsets || encounter.team.map(() => encounter.blessingLevels || 0);
		encounter.blessingLevelOffsets = encounter.team.map((set, index) => {
			const next = encounterBlessingLevels(run, run.node!, encounter, index);
			set.level += next - previous[index];
			return next;
		});
	}
	const fixed = run.node.kind === 'boss';
	const repair = (set: PokemonSet, authoredTrainer = false) => {
		if (!fixed && !authoredTrainer && minimumEvolutionLevel(set.species) > set.level) {
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
		for (const set of [...(encounter.team || []), ...(encounter.candidates || [])]) {
			repair(set, !!encounter.trainer || !!encounter.trainerCandidates?.length);
		}
		for (const set of encounter.cooperative?.team || []) repair(set, true);
		for (const candidate of encounter.trainerCandidates || []) for (const set of candidate.team) repair(set, true);
	}
}
