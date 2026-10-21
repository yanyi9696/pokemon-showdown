import { Dex, toID } from './dex';
import type { RoguePokemon } from './fantasy-rogue';
const dogs = new Set([
	'Vulpix', 'Ninetales', 'Growlithe', 'Arcanine', 'Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon',
	'Snubbull', 'Granbull', 'Houndour', 'Houndoom', 'Smeargle', 'Poochyena', 'Mightyena', 'Electrike', 'Manectric', 'Riolu', 'Lucario',
	'Lillipup', 'Herdier', 'Stoutland', 'Zorua', 'Zoroark', 'Fennekin', 'Braixen', 'Delphox', 'Furfrou', 'Rockruff', 'Lycanroc',
	'Nickit', 'Thievul', 'Yamper', 'Boltund', 'Zacian', 'Zamazenta', 'Fidough', 'Dachsbun', 'Maschiff', 'Mabosstiff', 'Greavard', 'Houndstone', 'Okidogi',
]);
const cats = new Set([
	'Meowth', 'Persian', 'Perrserker', 'Skitty', 'Delcatty', 'Shinx', 'Luxio', 'Luxray', 'Glameow', 'Purugly', 'Purrloin', 'Liepard',
	'Espurr', 'Meowstic', 'Litleo', 'Pyroar', 'Litten', 'Torracat', 'Incineroar', 'Raikou', 'Entei', 'Suicune', 'Solgaleo',
	'Zeraora', 'Chien-Pao', 'Zangoose', 'Sprigatito', 'Floragato', 'Meowscarada', 'Mew', 'Mewtwo',
]);
export function petSpecies(name: string, family: 'dogs' | 'cats') {
	const dex = Dex.mod('gen9fantasy');
	const species = dex.species.get(name);
	if (!species.exists) return false;
	if (species.num === 645) return family === 'cats' && species.forme.includes('Therian');
	if (species.num === 718) return family === 'dogs' && species.forme.startsWith('10%');
	return (family === 'dogs' ? dogs : cats).has(species.baseSpecies.replace(/-Fantasy/g, ''));
}
export const CAT_ABILITIES = [
	['poisonheal', 'dianliao', 'zhiliao', 'toxicboost', 'flareboost', 'quickfeet'],
	['woju', 'berserk', 'cutecharm'],
] as const;
export function defaultCatAbilities(mon: RoguePokemon) {
	return CAT_ABILITIES.map(group => group.find(id => id !== toID(mon.set.ability))!);
}
export const POWER_TRAINING_ITEMS = ['powerlens', 'powerbracer', 'poweranklet', 'powerbelt', 'powerweight', 'powerband'];
/** Power items add eight EVs only to earned battle yields, never to vitamins. */
export const POWER_TRAINING_STATS: Record<string, StatID> = {
	powerlens: 'spa', powerbracer: 'atk', poweranklet: 'spe', powerbelt: 'def', powerweight: 'hp', powerband: 'spd',
};
export function dogBoostCount(team: RoguePokemon[]) {
	const dex = Dex.mod('gen9fantasy');
	return Math.min(5, Math.max(0, new Set(team.filter(p => !p.egg && petSpecies(p.set.species, 'dogs'))
		.map(p => dex.species.get(p.set.species).num)).size - 1));
}
