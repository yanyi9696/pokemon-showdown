import { Dex } from '../../sim/dex';
import { EVENT_TEAM_POOLS } from './event-teams';
import { lowerToEligibleStage } from './evolution';
import { randomSpeciesEligible } from './species-eligibility';
import { levelMoves } from './progression';
import { makeEncounterSet } from './encounter-sets';

/** Spectator-only additions; authored NPC casts and ordinary wild sets keep their existing pools. */
export const FOREST_EXTRA_SPECIES = [
	'Raichu', 'Ninetales', 'Arcanine', 'Golduck', 'Poliwrath', 'Slowbro', 'Cloyster', 'Kingler',
	'Seaking', 'Starmie', 'Azumarill', 'Ampharos', 'Quagsire', 'Lanturn', 'Octillery', 'Mantine',
	'Pelipper', 'Gardevoir', 'Swellow', 'Exploud', 'Manectric', 'Camerupt', 'Torkoal', 'Flygon',
	'Altaria', 'Whiscash', 'Crawdaunt', 'Milotic', 'Luxray', 'Floatzel', 'Gastrodon', 'Hippowdon',
	'Toxicroak', 'Zebstrika', 'Excadrill', 'Seismitoad', 'Galvantula', 'Eelektross', 'Chandelure',
	'Braviary', 'Mandibuzz', 'Pyroar', 'Heliolisk', 'Mudsdale', 'Boltund', 'Toxtricity',
	'Barraskewda', 'Drednaw', 'Centiskorch', 'Pawmot', 'Kilowattrel', 'Bellibolt', 'Clodsire',
];
const dex = Dex.mod('gen9fantasy');

export function forestSpeciesPool(level: number) {
	return [...new Set([...EVENT_TEAM_POOLS.forest, ...FOREST_EXTRA_SPECIES]
		.map(name => lowerToEligibleStage(name, level)))].filter(name => randomSpeciesEligible(name, level));
}

/** Add coverage only from the same current-level learnset used by native encounter generation. */
export function forestEncounterSet(name: string, level: number, quality: StatsTable) {
	const set = makeEncounterSet(name, level, quality);
	set.item = '';
	const attacks = set.moves.map(id => dex.moves.get(id)).filter(move => move.category !== 'Status');
	const types = new Set(attacks.map(move => move.type));
	if (types.size >= 2 || !types.size) return set;
	const candidates = [...new Set(levelMoves(name).filter(entry => entry.level <= level).map(entry => entry.move))]
		.map(id => dex.moves.get(id)).filter(move => move.category !== 'Status' && !types.has(move.type));
	const species = dex.species.get(name);
	const score = (move: Move) => (move.basePower || 45) *
		species.baseStats[move.category === 'Physical' ? 'atk' : 'spa'] * (species.types.includes(move.type) ? 1.5 : 1);
	candidates.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
	if (!candidates.length) return set;
	if (set.moves.length < 4) set.moves.push(candidates[0].id);
	else {
		const support = set.moves.findIndex(id => dex.moves.get(id).category === 'Status');
		set.moves[support >= 0 ? support : set.moves.length - 1] = candidates[0].id;
	}
	return set;
}
