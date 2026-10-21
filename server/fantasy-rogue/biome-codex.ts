import { Dex, toID } from '../../sim/dex';
import { RogueBiomes } from './biome-data';
import { MajorLegendaryPool, unlistedFamilies } from './biome-pools';
import { possibleWildStages, wildStageLevels } from './evolution';
import { randomSpeciesEligible } from './species-eligibility';
import type { RogueAccount } from './types';

let catalog: { id: string, name: string, regional: string[], visitors: string[] }[] | undefined;

/** Catalog only; built once for the content fingerprint/guide, never per battle. */
function biomeCatalog() {
	if (catalog) return catalog;
	const dex = Dex.mod('gen9');
	const sorted = (names: Set<string>) => [...names].sort((a, b) => dex.species.get(a).num - dex.species.get(b).num || a.localeCompare(b));
	catalog = RogueBiomes.map(biome => {
		const regional = new Set<string>(), visitors = new Set<string>();
		for (let tier = 0; tier < biome.tiers.length; tier++) {
			// Spirits can raise the encounter level above the floor's normal tier. Include
			// every level the production resolver permits, including early-stage fallbacks.
			for (const [names, collection] of [
				[biome.tiers[tier].flatMap(slot => slot.species), regional], [unlistedFamilies(), visitors],
			] as const) {
				for (const name of new Set(names)) for (const level of wildStageLevels(name, biome, tier)) {
					if (!randomSpeciesEligible(name, level)) continue;
					for (const stage of possibleWildStages(name, level, biome, tier)) collection.add(stage);
				}
			}
		}
		for (const name of MajorLegendaryPool) visitors.add(name);
		return { id: biome.id, name: biome.name, regional: sorted(regional),
			visitors: sorted(new Set([...visitors].filter(name => !regional.has(name)))),
		};
	});
	return catalog;
}

export function biomeCodex(account?: RogueAccount, preview = false) {
	return biomeCatalog().map(biome => {
		const caught = new Set(account?.biomeCaptures?.[biome.id] || []);
		const icons = (names: string[]) => names.map(species => ({ species, caught: preview || caught.has(toID(species)) }));
		return { id: biome.id, name: biome.name,
			text: '在这里成功捕捉后，对应图标会显出原貌。区域生态池随楼层变化，进化阶段也受等级影响。',
			pokemon: icons(biome.regional), visitors: icons(biome.visitors),
		};
	});
}
