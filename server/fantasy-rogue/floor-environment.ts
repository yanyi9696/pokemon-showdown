import type { RogueRun } from './types';
import type { RogueRandom } from './biome-pools';

export interface FloorEnvironment { floor: number; weather?: string; terrain?: string; name: string }
const WEATHER = [['raindance', '下雨'], ['sunnyday', '晴天'], ['sandstorm', '沙暴'], ['snowscape', '下雪']];
const TERRAIN = [['electricterrain', '电气场地'], ['grassyterrain', '青草场地'], ['mistyterrain', '薄雾场地'], ['psychicterrain', '精神场地']];
/** Roll once per floor. Reconnecting never changes the weather or terrain. */
export function prepareFloorEnvironment(run: RogueRun, random: RogueRandom) {
	if (run.environment?.floor === run.floor) return;
	const weather = random(100) < 25 ? WEATHER[random(WEATHER.length)] : undefined;
	const terrain = random(100) < 20 ? TERRAIN[random(TERRAIN.length)] : undefined;
	run.environment = { floor: run.floor, weather: weather?.[0], terrain: terrain?.[0],
		name: [weather?.[1], terrain?.[1]].filter(Boolean).join(' · ') || '天气平稳' };
}
