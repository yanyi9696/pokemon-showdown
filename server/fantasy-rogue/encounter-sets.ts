import { Dex } from '../../sim/dex';
import { levelMoves } from './progression';
import type { RogueRandom } from './biome-pools';

const ordinary = Dex.mod('gen9');
const dex = Dex.mod('gen9fantasy');
const stats = (value: number): StatsTable => ({
	hp: value, atk: value, def: value, spa: value, spd: value, spe: value,
});
export function randomEncounterAbility(name: string, random: RogueRandom, elite = false) {
	const abilities = dex.species.get(name).abilities;
	if (elite && abilities.H && random(100) < 15) return abilities.H;
	const normal = [abilities[0], abilities[1]].filter(Boolean) as string[];
	return normal[random(normal.length)];
}

/** Roll once when creating a new wild encounter or gift, never when rebuilding a saved member. */
export function randomEncounterIVs(random: RogueRandom, elite = false): StatsTable {
	const weights = elite ? [100, 70, 50, 35, 25, 15, 5] : [140, 140, 140, 140, 140, 100, 70, 50, 35, 25, 15, 5];
	const roll = () => {
		let value = random(weights.reduce((sum, weight) => sum + weight, 0));
		return (elite ? 25 : 20) + weights.findIndex(weight => { value -= weight; return value < 0; });
	};
	return { hp: roll(), atk: roll(), def: roll(), spa: roll(), spd: roll(), spe: roll() };
}

function movesFor(name: string, level: number): string[] {
	const species = ordinary.species.get(name);
	if (!species.exists) {
		const plain = ordinary.species.get(name.replace(/-Fantasy$/, ''));
		return movesFor(plain.exists ? plain.name : dex.species.get(name).baseSpecies, level);
	}
	const candidates = [...new Set(levelMoves(name).filter(entry => entry.level <= level).map(entry => entry.move))]
		.map(move => dex.moves.get(move));
	const ranked = candidates.filter(move => move.category !== 'Status').sort((a, b) => {
		const score = (move: typeof a) => (move.basePower || 40) * (species.types.includes(move.type) ? 1.5 : 1);
		return score(b) - score(a);
	});
	const selected = ranked.slice(0, 2).map(move => move.id as string);
	const status = candidates.filter(move => move.category === 'Status').slice(-1)[0];
	if (status) selected.push(status.id);
	for (const move of ranked.concat(candidates.slice().reverse())) {
		if (selected.length >= 4) break;
		if (!selected.includes(move.id)) selected.push(move.id);
	}
	if (!selected.length && species.prevo) return movesFor(species.prevo, level);
	if (!selected.length) throw new Error(`肉鸽初始招式缺失：${name} Lv.${level}`);
	return selected;
}

/** Preserve regional learnsets and the held item required by an explicitly listed form. */
export function makeEncounterSet(name: string, level: number, quality: number | StatsTable = 15): PokemonSet {
	const species = dex.species.get(name);
	if (!species.exists) throw new Error(`肉鸽物种不存在：${name}`);
	return {
		name: species.name, species: species.name, ability: species.abilities[0], level, nature: 'Hardy',
		moves: movesFor(name, level), item: species.requiredItem || '',
		evs: stats(0), ivs: typeof quality === 'number' ? stats(quality) : { ...quality }, gender: species.gender || 'M',
	};
}
