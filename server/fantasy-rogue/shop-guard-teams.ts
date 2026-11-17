import { Dex } from '../../sim/dex';
import { makeEncounterSet } from './encounter-sets';
import { encounterMovePool } from './encounter-legality';
import { lowerToEligibleStage } from './evolution';
import { fixedFloor } from './content';
import type { RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
const rosters: Record<string, string[]> = {
	nurse: ['Audino', 'Clefable', 'Roselia', 'Miltank', 'Blissey'],
	merchant: ['Persian', 'Greedent', 'Noctowl', 'Lanturn', 'Arcanine'],
	balls: ['Boltund', 'Parasect', 'Noctowl', 'Lanturn', 'Scizor'],
	mint: ['Roselia', 'Kirlia', 'Sableye', 'Lilligant', 'Slowbro'],
	candy: ['Slurpuff', 'Appletun', 'Greedent', 'Alcremie', 'Togekiss'],
	machine: ['Magneton', 'Porygon', 'Rotom', 'Metang', 'Scizor'],
	auction: ['Persian', 'Murkrow', 'Klefki', 'Arcanine', 'Gholdengo'],
	crowns: ['Pawniard', 'Corvisquire', 'Slowking', 'Kingdra', 'Metagross'],
	mushroom: ['Shiinotic', 'Parasect', 'Amoonguss', 'Breloom', 'Toedscruel'],
};
const bossCoverage = ['Lanturn', 'Noctowl', 'Roselia', 'Arcanine'];
const coverage = ['icebeam', 'thunderbolt', 'gigadrain', 'flamethrower', 'psychic', 'surf', 'darkpulse', 'airslash',
	'energyball', 'dazzlinggleam', 'rockslide', 'seedbomb', 'crunch', 'brickbreak', 'drillpeck'];

/** Early teams retain three members; extra slots arrive separately from equipment and move upgrades. */
export function shopGuardTeam(run: RogueRun, nurse: boolean): PokemonSet[] {
	const floor = run.floor, level = Math.min(100, Math.max(3, Math.ceil(floor / 2)));
	const kind = run.node?.trade?.kind || (nurse ? 'nurse' : 'merchant');
	let roster = rosters[kind] || rosters.merchant;
	if (nurse && fixedFloor(floor + 1) === 'boss') {
		const slot = Math.floor((floor + 1) / 10) % bossCoverage.length;
		roster = ['Audino', 'Clefable', bossCoverage[slot], bossCoverage[(slot + 1) % bossCoverage.length], 'Blissey'];
	}
	const count = floor <= 60 ? 3 : floor <= 110 ? 4 : 5;
	return roster.slice(0, count).map((name, i) => {
		const species = lowerToEligibleStage(name, level);
		const set = makeEncounterSet(species, level, 25);
		// Stay in the species' actual learnset. Earlier guards keep their ordinary level-up moves.
		if (level >= 20) {
			const pool = encounterMovePool(species), data = dex.species.get(species);
			const physical = data.baseStats.atk > data.baseStats.spa;
			const attacks = set.moves.filter(id => dex.moves.get(id).category !== 'Status');
			const extra = coverage.find(id => pool.has(id) && dex.moves.get(id).category === (physical ? 'Physical' : 'Special') &&
				!data.types.includes(dex.moves.get(id).type));
			const support = (run.doubleBattle ? ['tailwind', 'icywind', 'helpinghand', 'protect'] :
				['thunderwave', 'synthesis', 'softboiled', 'roost', 'protect']).filter(id => pool.has(id));
			set.moves = [...new Set([...attacks.slice(0, 2), ...(extra ? [extra] : []), ...support, ...set.moves])].slice(0, 4);
		}
		if (level >= 25) set.item = nurse ? ['leftovers', 'sitrusberry'][i % 2] : ['amuletcoin', 'sitrusberry'][i % 2];
		const data = dex.species.get(species);
		set.gender = data.gender || (data.genderRatio.F === 0 ? 'M' : nurse ? 'F' : 'M');
		return set;
	});
}
