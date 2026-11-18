import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { makeEncounterSet, randomEncounterIVs, randomEncounterAbility } from './encounter-sets';
import type { RogueRandom } from './biome-pools';
import type { RogueRun, RogueNode } from './types';
import { Dex } from '../../sim/dex';
import { blessingSpeciesID } from '../../sim/rogue-species-identity';

type Counter = 'eeveeMisses' | 'devotionMisses';
interface ExtraEncounter {
	species: string;
	families: Set<string>;
	owners: { run: RogueRun, counter: Counter }[];
	misses: number;
	guaranteed: boolean;
	triggered: boolean;
}

/** Commit once on actual entry; viewing candidate routes never consumes a roll. */
export function prepareEeveeEncounter(node: RogueNode, runs: RogueRun[], random: RogueRandom) {
	if (node.kind !== 'wild' || node.eeveeVisitResolved) return;
	node.eeveeVisitResolved = true;
	const encounter = node.encounters[0];
	if (node.encounters.length !== 1 || !encounter?.wildPack || encounter.team.length !== 3) return;
	const groups = new Map<string, ExtraEncounter>();
	const add = (run: RogueRun, name: string, family: string, counter: Counter) => {
		const species = Dex.mod('gen9fantasy').species.get(name);
		if (!species.exists) return;
		const group = groups.get(species.id) || {
			species: species.name, families: new Set<string>(), owners: [], misses: 0, guaranteed: false, triggered: false,
		};
		group.families.add(family);
		group.owners.push({ run, counter });
		group.misses = Math.max(group.misses, run.blessings![counter] || 0);
		groups.set(species.id, group);
	};
	for (const run of runs) {
		if (ownsBlessing(run.blessings, 'eeveefamily')) add(run, 'Eevee', 'eeveefamily', 'eeveeMisses');
		const devotion = run.blessings?.owned.find(entry => entry.family === 'devotion');
		if (devotion?.species) {
			// Old saves retain the locked species even if the selected member later evolved or left.
			const member = [...run.team, ...(run.box || [])].find(mon => mon.id === devotion.target);
			const encounterSpecies = devotion.encounterSpecies ||
				(member && blessingSpeciesID(member.set.species) === devotion.species ? member.set.species : devotion.species);
			devotion.encounterSpecies = encounterSpecies;
			add(run, encounterSpecies, 'devotion', 'devotionMisses');
		}
	}
	for (const group of groups.values()) {
		group.guaranteed = group.misses >= 9;
		group.triggered = group.guaranteed || random(100) < 20 * group.families.size;
	}
	const triggered = [...groups.values()].filter(group => group.triggered);
	const guaranteed = triggered.filter(group => group.guaranteed);
	const candidates = guaranteed.length ? guaranteed : triggered;
	const selected = candidates.length ? candidates[candidates.length > 1 ? random(candidates.length) : 0] : undefined;
	for (const group of groups.values()) {
		const missesByRun = new Map<RogueRun, number>();
		for (const { run, counter } of group.owners) {
			missesByRun.set(run, Math.max(missesByRun.get(run) || 0, run.blessings![counter] || 0));
		}
		for (const { run, counter } of group.owners) {
			// A second successful roll cannot add a fifth member; retain it as a pending guarantee.
			// Co-op owners keep their own pre-existing misses; only the two matching blessings of one owner share them.
			run.blessings![counter] = group === selected ? 0 : group.triggered ? 9 : Math.min(9, missesByRun.get(run)! + 1);
		}
	}
	if (!selected) return;
	const level = node.biome?.level || encounter.team[0].level;
	const set = makeEncounterSet(selected.species, level, randomEncounterIVs(random, false));
	set.ability = randomEncounterAbility(selected.species, random, false);
	encounter.team.push(set);
}
