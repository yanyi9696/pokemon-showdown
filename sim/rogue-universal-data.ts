import { BLESSING_TYPES } from './rogue-blessing-data';

export type UniversalKind = 'mega' | 'gmega' | 'z';
export interface UniversalConfiguration { version: 1; item: string; bonus: StatsTable; aura?: StatIDExceptHP }
export const UNIVERSAL_STATS: StatIDExceptHP[] = ['atk', 'def', 'spa', 'spd', 'spe'];
const zIcons: Record<string, string> = {
	Bug: 'buginiumz', Dark: 'darkiniumz', Dragon: 'dragoniumz', Electric: 'electriumz', Fairy: 'fairiumz',
	Fighting: 'fightiniumz', Fire: 'firiumz', Flying: 'flyiniumz', Ghost: 'ghostiumz', Grass: 'grassiumz',
	Ground: 'groundiumz', Ice: 'iciumz', Normal: 'normaliumz', Poison: 'poisoniumz', Psychic: 'psychiumz',
	Rock: 'rockiumz', Steel: 'steeliumz', Water: 'wateriumz',
};
export const UNIVERSAL_ITEMS = [
	{ id: 'rogueuniversalmegastone', kind: 'mega' as UniversalKind, name: '万用超级石',
		dexName: 'Rogue Universal Mega Stone', points: 100, cap: 30, hp: 0, icon: 'intriguingstone', type: '' },
	{ id: 'rogueuniversalwishingstar', kind: 'gmega' as UniversalKind, name: '万用许愿星',
		dexName: 'Rogue Universal Wishing Star', points: 60, cap: 40, hp: 40, icon: 'gmegawishingstar', type: '' },
	...Object.entries(BLESSING_TYPES).map(([type, name]) => ({
		id: `rogueuniversal${type.toLowerCase()}z`, kind: 'z' as UniversalKind, name: `${name}属性霸主 Z`,
		dexName: `Rogue Universal ${type} Z`, points: 50, cap: 20, hp: 0, icon: zIcons[type], type,
	})),
];
export const universalItem = (id: string) => UNIVERSAL_ITEMS.find(item => item.id === id);
export function universalAuraChoices(baseStats: StatsTable, bonus: StatsTable) {
	const highest = Math.max(...UNIVERSAL_STATS.map(stat => baseStats[stat] + bonus[stat]));
	return UNIVERSAL_STATS.filter(stat => baseStats[stat] + bonus[stat] === highest);
}
export function validUniversalBonus(id: string, bonus: StatsTable | undefined): bonus is StatsTable {
	const item = universalItem(id);
	return !!item && !!bonus && Object.keys(bonus).length === 6 && bonus.hp === item.hp &&
		UNIVERSAL_STATS.every(stat => Number.isSafeInteger(bonus[stat]) && bonus[stat] >= 0 && bonus[stat] <= item.cap) &&
		UNIVERSAL_STATS.reduce((sum, stat) => sum + bonus[stat], 0) === item.points;
}
