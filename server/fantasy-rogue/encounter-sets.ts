import { Dex } from '../../sim/dex';
import { levelMoves } from './progression';

const ordinary = Dex.mod('gen9');
const dex = Dex.mod('gen9fantasy');
const stats = (value: number): StatsTable => ({
	hp: value, atk: value, def: value, spa: value, spd: value, spe: value,
});

function movesFor(name: string, level: number): string[] {
	const species = ordinary.species.get(name);
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
export function makeEncounterSet(name: string, level: number, quality = 15): PokemonSet {
	const species = dex.species.get(name);
	if (!species.exists) throw new Error(`肉鸽物种不存在：${name}`);
	return {
		name: species.name, species: species.name, ability: species.abilities[0], level, nature: 'Hardy',
		moves: movesFor(name, level), item: species.requiredItem || '',
		evs: stats(0), ivs: stats(quality), gender: species.gender || 'M',
	};
}
