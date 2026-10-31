import { Dex } from '../../sim/dex';
import { rogueWildLevelBonus } from '../../sim/fantasy-rogue-spirits';
import { minimumEvolutionLevel } from './evolution';
import { makeEncounterSet, randomEncounterIVs, randomEncounterAbility } from './encounter-sets';
import type { RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { ELITE_BOSS_FLOORS } from './content';

const dex = Dex.mod('gen9'), fantasy = Dex.mod('gen9fantasy');

/** Escorts are ordinary wild partners, including at the highest floors. */
export function eliteEscortPool(type: string, level: number) {
	// Gmax and Totem entries are not marked battleOnly in the dex.
	return dex.species.all().filter(s => s.exists && s.num > 0 && !s.battleOnly && !s.isMega && !s.isPrimal &&
		!/(?:Gmax|Totem)/.test(s.forme) &&
		s.types.includes(type) && ![...s.tags, ...dex.species.get(s.baseSpecies).tags].some(tag =>
			tag.includes('Legendary') || tag.includes('Mythical') || tag === 'Ultra Beast' || tag === 'Paradox') &&
		minimumEvolutionLevel(s.name) <= level);
}

export function prepareEliteEscorts(run: RogueRun, random: RogueRandom, repairOnly = false) {
	if (run.phase === 'battle') return;
	if (repairOnly) {
		// Saved forecasts have not received their blessing level costs yet.
		for (const [floor, node] of Object.entries(run.bossPreviews || {})) {
			if (Number(floor) <= run.floor) continue;
			prepareEliteEscorts({ ...run, floor: Number(floor), node, encounter: 0, bossPreviews: undefined }, random, true);
		}
	}
	if (run.node?.kind !== 'boss' || !ELITE_BOSS_FLOORS.has(run.floor)) return;
	for (const encounter of run.node.encounters.slice(run.encounter)) {
		const count = encounter.escortCount || 0;
		if (repairOnly && !count) continue;
		if (!count && encounter.team.length !== 1) continue;
		// Some legacy snapshots retained an escort counter after replacing the whole team.
		// Without an identifiable boss, do not guess which saved opponent to replace.
		const boss = encounter.team[count];
		if (!boss) continue;
		const type = fantasy.species.get(boss.species).types[0];
		const level = Math.min(100, Math.max(3, Math.ceil(run.floor / 2)) + 5 + rogueWildLevelBonus(run.floor, run.spirit));
		const pool = eliteEscortPool(type, level);
		const existing = encounter.team.slice(0, count);
		const valid = existing.map(set => pool.some(s => s.name === set.species) &&
			minimumEvolutionLevel(set.species) <= set.level);
		const used = new Set(existing.filter((_, i) => valid[i]).map(set => set.species));
		const escorts = Array.from({ length: count || 2 }, (_, i) => {
			// Repair only invalid, unplayed escorts in old saves; keep their boss and valid teammates intact.
			if (valid[i]) return existing[i];
			const escortLevel = existing[i]?.level ?? level;
			const available = pool.filter(s => !used.has(s.name) && minimumEvolutionLevel(s.name) <= escortLevel);
			if (!available.length) throw new Error(`没有适合 ${type} 属性、等级 ${level} 的幻想精英跟班。`);
			const s = available[random(available.length)]; used.add(s.name);
			const set = makeEncounterSet(s.name, escortLevel, randomEncounterIVs(random, true));
			set.ability = randomEncounterAbility(s.name, random, true); return set;
		});
		encounter.team = [...escorts, ...encounter.team.slice(count)]; encounter.escortCount = escorts.length;
	}
}
