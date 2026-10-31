import { Dex } from '../../sim/dex';
import { levelMoves } from './progression';
import type { RogueRandom } from './biome-pools';
import type { RogueDifficulty } from '../../sim/rogue-difficulty';
import { hiddenAbilityChance, rollEncounterIVs } from '../../sim/rogue-quality';
import { rogueWildLevelBonus } from '../../sim/fantasy-rogue-spirits';

/** Regional elites and challenge rosters share exactly the same base level. Blessing offsets are applied later. */
export const regionalEncounterLevel = (floor: number, elite: boolean, spirit?: string) =>
	Math.min(100, Math.max(3, Math.ceil(floor / 2)) + (elite ? 5 : 0) + rogueWildLevelBonus(floor, spirit));

const ordinary = Dex.mod('gen9');
const dex = Dex.mod('gen9fantasy');
const stats = (value: number): StatsTable => ({
	hp: value, atk: value, def: value, spa: value, spd: value, spe: value,
});
export function randomEncounterAbility(name: string, random: RogueRandom, elite = false, tier?: RogueDifficulty) {
	const abilities = dex.species.get(name).abilities;
	const chance = tier === undefined ? (elite ? 15 : 0) : hiddenAbilityChance(tier, elite);
	if (chance && abilities.H && random(100) < chance) return abilities.H;
	const normal = [abilities[0], abilities[1]].filter(Boolean) as string[];
	return normal[random(normal.length)];
}

/** Roll once when creating a new wild encounter or gift, never when rebuilding a saved member. */
export function randomEncounterIVs(random: RogueRandom, elite = false, tier?: RogueDifficulty): StatsTable {
	if (tier !== undefined) return rollEncounterIVs(random, tier, elite);
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
	const selected: string[] = [];
	const attacks = candidates.filter(move => move.category !== 'Status');
	const bestStat = Math.max(species.baseStats.atk, species.baseStats.spa);
	const score = (move: Move) => {
		if (move.category === 'Status') {
			if (selected.some(id => dex.moves.get(id).category === 'Status')) return -10;
			if (move.heal || move.id === 'strengthsap') return 78;
			if (move.status && move.target !== 'self' || move.volatileStatus === 'leechseed') return 70;
			if (move.boosts && move.target === 'self') {
				const offensive = attacks.some(attack => (attack.category === 'Physical' ? move.boosts!.atk : move.boosts!.spa));
				return offensive ? 72 : move.boosts.spe ? 48 : 20;
			}
			if (move.sideCondition) return 48;
			if (['encore', 'taunt', 'yawn'].includes(move.volatileStatus || '')) return 60;
			if (move.id === 'protect' && candidates.some(m => m.status || m.volatileStatus === 'leechseed')) return 45;
			return 0;
		}
		let power = move.basePower || (move.damage === 'level' ? 70 : typeof move.damage === 'number' ? move.damage : 40);
		if (move.multihit) power *= typeof move.multihit === 'number' ? move.multihit : 3;
		if (move.flags.charge || move.self?.volatileStatus === 'mustrecharge') power *= 0.55;
		if (move.selfdestruct) power *= 0.18;
		const stat = species.baseStats[move.category === 'Physical' ? 'atk' : 'spa'];
		const duplicate = selected.some(id => {
			const prior = dex.moves.get(id);
			return prior.type === move.type && prior.category !== 'Status';
		});
		return power * (move.accuracy === true ? 1 : move.accuracy / 100) * stat / bestStat *
			(species.types.includes(move.type) ? 1.5 : 1) * (duplicate ? 0.35 : 1) + (move.priority > 0 ? 12 : 0);
	};
	while (selected.length < Math.min(4, candidates.length)) {
		const pool = candidates.filter(move => !selected.includes(move.id) && (selected.length ||
			!attacks.length || move.category !== 'Status'));
		pool.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
		selected.push(pool[0].id);
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
