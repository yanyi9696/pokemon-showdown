import { Dex, toID } from './dex';
import type { RoguePokemon } from './fantasy-rogue';

export interface RogueCompound { blessing: string; finalSpecies: string; bonus: StatsTable }
const ordinary = Dex.mod('gen9'), dex = Dex.mod('gen9fantasy');
function plain(name: string) {
	return ordinary.species.get(name.replace(/-Fantasy/g, ''));
}
function children(name: string) {
	const species = plain(name);
	const evos = [...species.evos];
	if (species.id === 'rockruff') evos.push('Lycanroc-Dusk');
	return evos.map(id => ordinary.species.get(id)).filter(s => s.exists && !s.battleOnly && !s.isMega);
}
function finals(name: string, seen = new Set<string>()): string[] {
	const species = plain(name);
	if (!species.exists || seen.has(species.id)) return [];
	seen.add(species.id);
	const next = children(species.name);
	return next.length ? next.flatMap(s => finals(s.name, new Set(seen))) : [species.name];
}
/** Current forms can only choose a descendant, never turn back into a sibling branch. */
export function compoundFinals(mon: RoguePokemon): string[] {
	if (mon.compound) return [];
	const species = plain(mon.set.species);
	if (!species.exists || species.battleOnly || species.isMega || !species.prevo && !species.evos.length) return [];
	return finals(species.name).map(name => {
		const fantasy = dex.species.get(`${name}-Fantasy`);
		return mon.set.species.includes('-Fantasy') && fantasy.exists ? fantasy.name : name;
	}).filter(name => {
		const final = dex.species.get(name);
		return final.bst <= 500 && (!final.gender || final.gender === mon.set.gender);
	});
}
export function compoundEvolutionAllowed(mon: RoguePokemon, next: string) {
	return !mon.compound || finals(next).some(name => toID(name) === plain(mon.compound!.finalSpecies).id);
}
export function compoundPoints(finalSpecies: string, tier: string) {
	return (tier === 'prismatic' ? 650 : 525) - dex.species.get(finalSpecies).bst;
}
