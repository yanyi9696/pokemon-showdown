import { Dex, toID } from './dex';
import { RogueExperienceTables, RogueSpeciesData } from './fantasy-rogue-data';
import { RogueEffortData } from './fantasy-rogue-evs';

/** Fantasy forms explicitly inherit their base species' out-of-battle RPG data. */
export function rogueSpeciesData(name: string) {
	const species = Dex.mod('gen9fantasy').species.get(name);
	const data = RogueSpeciesData[species.id] || RogueSpeciesData[toID(species.baseSpecies)];
	if (!data) throw new Error(`缺少 ${name} 的经验与捕获率数据。`);
	return { growth: data[0], baseExperience: data[1], catchRate: data[2] };
}

export function rogueEffortYield(name: string): StatsTable {
	const species = Dex.mod('gen9fantasy').species.get(name);
	const data = RogueEffortData[species.id] || RogueEffortData[toID(species.baseSpecies)];
	if (!data) throw new Error(`缺少 ${name} 的努力值产出数据。`);
	return { hp: data[0], atk: data[1], def: data[2], spa: data[3], spd: data[4], spe: data[5] };
}

export function experienceAtLevel(growth: number, level: number) {
	if (!Number.isInteger(level) || level < 1 || level > 100 || !RogueExperienceTables[growth]) {
		throw new Error('试玩版原作经验表支持 1～100 级。');
	}
	return RogueExperienceTables[growth][level];
}

export function levelAtExperience(growth: number, experience: number) {
	let level = 1;
	while (level < 100 && experience >= experienceAtLevel(growth, level + 1)) level++;
	return level;
}

/** Gen VII scaled EXP; participants get full EXP, other eligible party members half. */
export function experienceYield(base: number, defeatedLevel: number, recipientLevel: number, participated: boolean) {
	return Math.max(1, Math.floor(base * defeatedLevel / (participated ? 5 : 10) *
		((2 * defeatedLevel + 10) / (defeatedLevel + recipientLevel + 10)) ** 2.5 + 1));
}

/** Gen VI/VII normal ball mechanics, without environment/O-Power bonuses. */
export function captureThresholds(
	rate: number, maxhp: number, hp: number, status: string, ball: number, caught: number
) {
	const statusBonus = ['slp', 'frz'].includes(status) ? 2.5 : ['par', 'psn', 'tox', 'brn'].includes(status) ? 1.5 : 1;
	const modified = Math.floor((3 * maxhp - 2 * hp) * rate * ball / (3 * maxhp) * statusBonus);
	const shake = modified >= 255 ? 65536 : modified <= 0 ? 0 : Math.floor(65536 * (modified / 255) ** (3 / 16));
	const pokedex = caught > 600 ? 2.5 : caught > 450 ? 2 : caught > 300 ? 1.5 : caught > 150 ? 1 : caught > 30 ? 0.5 : 0;
	return { guaranteed: modified >= 255, shake, critical: Math.floor(Math.min(255, modified) * pokedex / 6) };
}
