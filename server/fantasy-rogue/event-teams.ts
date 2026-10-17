import { Dex } from '../../sim/dex';
import type { RogueRandom } from './biome-pools';
import { makeEncounterSet } from './encounter-sets';
import { lowerToEligibleStage } from './evolution';

/** Each cast has a recognizable habitat or occupation, rather than a shared starter trio. */
export const EVENT_TEAM_POOLS = {
	forest: ['Butterfree', 'Beedrill', 'Beautifly', 'Dustox', 'Vivillon', 'Ariados', 'Ledian', 'Masquerain',
		'Leavanny', 'Venomoth', 'Parasect', 'Breloom', 'Amoonguss', 'Shiinotic', 'Shiftry', 'Ludicolo', 'Lilligant',
		'Victreebel', 'Vileplume', 'Bellossom', 'Jumpluff', 'Roserade', 'Trevenant', 'Gourgeist', 'Sawsbuck',
		'Noctowl', 'Pidgeot', 'Talonflame', 'Corviknight', 'Greedent', 'Linoone', 'Furret', 'Dachsbun',
		'Tsareena', 'Scovillain', 'Eldegoss', 'Bibarel', 'Oinkologne', 'Spidops', 'Lokix', 'Orbeetle', 'Ribombee'],
	martial: ['Machamp', 'Hariyama', 'Conkeldurr', 'Medicham', 'Mienshao', 'Lucario', 'Hitmonlee', 'Hitmonchan',
		'Hitmontop', 'Sawk', 'Throh', 'Passimian', 'Grapploct', 'Pangoro', 'Bewear', 'Gallade', 'Poliwrath',
		'Primeape', 'Annihilape', 'Breloom', 'Scrafty', 'Sirfetch’d', 'Hawlucha', 'Crabominable', 'Falinks'],
	tutor: ['Smeargle', 'Alakazam', 'Mr. Mime', 'Oranguru', 'Espeon', 'Xatu', 'Slowking', 'Gallade', 'Medicham',
		'Mienshao', 'Lucario', 'Passimian', 'Hawlucha', 'Ambipom', 'Chatot', 'Oricorio', 'Farfetch’d', 'Crobat',
		'Noivern', 'Zoroark', 'Gardevoir', 'Delphox', 'Blaziken', 'Infernape', 'Quaquaval', 'Indeedee'],
	bandits: ['Mightyena', 'Scrafty', 'Krookodile', 'Pangoro', 'Honchkrow', 'Weavile', 'Drapion', 'Skuntank',
		'Garbodor', 'Arbok', 'Seviper', 'Houndoom', 'Thievul', 'Liepard', 'Obstagoon', 'Raticate-Alola',
		'Muk-Alola', 'Persian-Alola', 'Cacturne', 'Shiftry', 'Toxicroak', 'Malamar', 'Bombirdier', 'Grafaiai'],
	room: ['Gengar', 'Mismagius', 'Banette', 'Dusknoir', 'Chandelure', 'Cofagrigus', 'Runerigus', 'Spiritomb',
		'Sableye', 'Mawile', 'Klefki', 'Aegislash', 'Bronzong', 'Claydol', 'Golurk', 'Dusclops', 'Mimikyu',
		'Polteageist', 'Sinistcha', 'Reuniclus', 'Gothitelle', 'Beheeyem', 'Hypno', 'Meowstic', 'Hatterene'],
};
export type EventTeamTheme = keyof typeof EVENT_TEAM_POOLS;
const dex = Dex.mod('gen9fantasy');
export function eventSpeciesPool(theme: EventTeamTheme, level: number) {
	return [...new Set(EVENT_TEAM_POOLS[theme].map(name => lowerToEligibleStage(name, level)))]
		.filter(name => dex.species.get(name).exists);
}
export function themedEventTeam(theme: EventTeamTheme, level: number, count: number, random: RogueRandom, ivs = 25) {
	const pool = eventSpeciesPool(theme, level);
	const team: PokemonSet[] = [];
	while (team.length < count && pool.length) {
		const name = pool.splice(random(pool.length), 1)[0];
		team.push(makeEncounterSet(name, level, ivs));
		// Different evolutions of the same family do not occupy two places in one cast.
		const root = (species: string): string => {
			const mon = dex.species.get(species);
			return mon.prevo ? root(mon.prevo) : mon.baseSpecies;
		};
		const family = root(name);
		for (let i = pool.length - 1; i >= 0; i--) if (root(pool[i]) === family) pool.splice(i, 1);
	}
	return team;
}
