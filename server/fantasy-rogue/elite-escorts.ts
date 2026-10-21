import { Dex } from '../../sim/dex';
import { rogueWildLevelBonus } from '../../sim/fantasy-rogue-spirits';
import { minimumEvolutionLevel } from './evolution';
import { makeEncounterSet, randomEncounterIVs, randomEncounterAbility } from './encounter-sets';
import type { RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { ELITE_BOSS_FLOORS } from './content';

export function prepareEliteEscorts(run: RogueRun, random: RogueRandom) {
	if (run.node?.kind !== 'boss' || !ELITE_BOSS_FLOORS.has(run.floor)) return;
	const dex = Dex.mod('gen9'), fantasy = Dex.mod('gen9fantasy');
	for (const encounter of run.node.encounters) {
		if (encounter.escortCount || encounter.team.length !== 1) continue;
		const type = fantasy.species.get(encounter.team[0].species).types[0];
		const level = Math.min(100, Math.max(3, Math.ceil(run.floor / 2)) + 5 + rogueWildLevelBonus(run.floor, run.spirit));
		const pool = dex.species.all().filter(s => s.exists && s.num > 0 && !s.battleOnly && !s.isMega &&
			s.types.includes(type) && !s.tags.some(tag => tag.includes('Legendary') || tag.includes('Mythical')) &&
			minimumEvolutionLevel(s.name) <= level);
		const escorts = Array.from({ length: 2 }, () => {
			const s = pool.splice(random(pool.length), 1)[0];
			const set = makeEncounterSet(s.name, level, randomEncounterIVs(random, true));
			set.ability = randomEncounterAbility(s.name, random, true); return set;
		});
		encounter.team = [...escorts, ...encounter.team]; encounter.escortCount = 2;
	}
}
