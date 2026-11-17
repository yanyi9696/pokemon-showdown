import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { makeEncounterSet, randomEncounterIVs, randomEncounterAbility } from './encounter-sets';
import type { RogueRandom } from './biome-pools';
import type { RogueRun, RogueNode } from './types';

/** Commit once on actual entry; viewing candidate routes never consumes a roll. */
export function prepareEeveeEncounter(node: RogueNode, runs: RogueRun[], random: RogueRandom) {
	if (node.kind !== 'wild' || node.eeveeVisitResolved) return;
	node.eeveeVisitResolved = true;
	const owners = runs.filter(run => ownsBlessing(run.blessings, 'eeveefamily'));
	const encounter = node.encounters[0];
	if (!owners.length || node.encounters.length !== 1 || !encounter?.wildPack || encounter.team.length !== 3) return;
	const guaranteed = owners.some(run => (run.blessings!.eeveeMisses || 0) >= 9);
	if (!guaranteed && random(100) >= 20) {
		for (const run of owners) run.blessings!.eeveeMisses = Math.min(9, (run.blessings!.eeveeMisses || 0) + 1);
		return;
	}
	const level = node.biome?.level || encounter.team[0].level;
	const set = makeEncounterSet('Eevee', level, randomEncounterIVs(random, false));
	set.ability = randomEncounterAbility('Eevee', random, false);
	encounter.team.push(set);
	for (const run of owners) run.blessings!.eeveeMisses = 0;
}
