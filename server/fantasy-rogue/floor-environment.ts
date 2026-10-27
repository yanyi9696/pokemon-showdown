import { Dex, toID } from '../../sim/dex';
import type { RogueRun, RogueNode } from './types';
import type { RogueRandom } from './biome-pools';

export interface FloorEnvironment { floor: number; weather?: string; terrain?: string; name: string }
const WEATHER = [['raindance', '下雨'], ['sunnyday', '晴天'], ['sandstorm', '沙暴'], ['snowscape', '下雪']];
const TERRAIN = [['electricterrain', '电气场地'], ['grassyterrain', '青草场地'], ['mistyterrain', '薄雾场地'], ['psychicterrain', '精神场地']];
export const FLOOR_ENVIRONMENT_CHANCE = { weather: 20, terrain: 14, terrainWithWeather: 5 };
const weatherTypes = [['Water', 'Electric'], ['Fire', 'Grass'], ['Rock', 'Ground', 'Steel'], ['Ice']];
const weatherAbilities = [['drizzle', 'swiftswim', 'raindish', 'hydration'], ['drought', 'chlorophyll', 'solarpower'],
	['sandstream', 'sandrush', 'sandforce', 'sandveil'], ['snowwarning', 'slushrush', 'icebody', 'snowcloak']];
function matchingEnvironment(entries: string[][], types: string[][], sets: PokemonSet[], random: RogueRandom, weather = false) {
	const dex = Dex.mod('gen9fantasy');
	const weights = entries.map((_, index) => 1 + sets.reduce((weight, set) => weight +
		(dex.species.get(set.species).types.some(type => types[index].includes(type)) ? 4 : 0) +
		(weather && weatherAbilities[index].includes(toID(set.ability)) ? 8 : 0), 0));
	let roll = random(weights.reduce((sum, n) => sum + n, 0));
	return entries[weights.findIndex(n => { roll -= n; return roll < 0; })];
}
/** Roll once per floor. Reconnecting never changes the weather or terrain. */
export function prepareFloorEnvironment(run: RogueRun, random: RogueRandom, routes: RogueNode[] = run.choices || (run.node ? [run.node] : [])) {
	if (run.environment?.floor === run.floor) return;
	const sets = routes.flatMap(node => node.encounters.flatMap(encounter =>
		encounter.trainerCandidates?.flatMap(candidate => candidate.team) || encounter.candidates || encounter.team));
	const weather = random(100) < FLOOR_ENVIRONMENT_CHANCE.weather ? matchingEnvironment(WEATHER, weatherTypes, sets, random, true) : undefined;
	const terrain = random(100) < (weather ? FLOOR_ENVIRONMENT_CHANCE.terrainWithWeather : FLOOR_ENVIRONMENT_CHANCE.terrain) ?
		matchingEnvironment(TERRAIN, [['Electric'], ['Grass'], ['Fairy', 'Dragon'], ['Psychic']], sets, random) : undefined;
	run.environment = { floor: run.floor, weather: weather?.[0], terrain: terrain?.[0],
		name: [weather?.[1], terrain?.[1]].filter(Boolean).join(' · ') || '天气平稳' };
}
