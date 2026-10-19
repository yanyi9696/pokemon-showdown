import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { drawBlessingGift, normalizeBlessings, recordBlessingGift } from './blessings';
import { rebuildMember } from './progression';
import type { RoguePokemon } from '../../sim/fantasy-rogue';

export const eggEventWeight = (floor: number) => Math.max(2, 14 - Math.floor(floor / 16));
/** Roll once when the egg is found. Reloading, boxing and hatching cannot reroll it. */
export function giveEgg(run: RogueRun, content: RogueContent, random: RogueRandom, title: string) {
	const floor = run.floor;
	const mon = drawBlessingGift(run, content, random, { strong: floor >= 80, perfect: floor >= 150 ? 2 : floor >= 80 ? 1 : 0 });
	mon.egg = { found: floor, hatch: floor + 5 + random(4) };
	mon.hp = 0;
	normalizeBlessings(run).pending.push({ id: randomUUID(), title, kind: 'gift', pokemon: mon });
	return mon;
}
export function hatchEggs(account: RogueAccount, run: RogueRun, content: RogueContent, instant = false) {
	let count = 0;
	for (const mon of [...run.team, ...(run.box || [])]) {
		if (!mon.egg || !instant && run.floor < mon.egg.hatch) continue;
		delete mon.egg;
		rebuildMember(mon, run.boosts); mon.hp = mon.maxhp;
		recordBlessingGift(account, run, content, mon);
		(run.notices ||= []).push(`蛋壳裂开了！【${mon.set.species}】成为了新的伙伴。`);
		count++;
	}
	return count;
}
/** Do not reveal the rolled partner through the party or the pending-gift packet. */
export function eggView(mon: RoguePokemon, floor: number) {
	return { id: mon.id, egg: { ...mon.egg! }, set: { species: 'Egg', name: '宝可梦蛋', ability: '', item: '', moves: [],
		ivs: {}, evs: {}, nature: '', gender: '', level: 1 }, pp: [], moveMemory: [], abilityPool: [],
		hp: 0, maxhp: 0, stats: undefined, remainingFloors: Math.max(0, mon.egg!.hatch - floor) };
}
