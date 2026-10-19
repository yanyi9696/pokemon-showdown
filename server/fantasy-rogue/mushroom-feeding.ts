import type { RogueRun, RogueContent, RogueAccount } from './types';
import type { RogueRandom } from './biome-pools';
import { mushroomSpecies } from './nature-collections';
import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { syncGrowthParty, growthPercent } from './growth';
import { drawBlessingGift, gift } from './blessings';

export const MUSHROOM_FOOD = {
	tinymushroom: { kind: 'offense', amount: 30, name: '小蘑菇', effect: '双攻' },
	bigmushroom: { kind: 'defense', amount: 150, name: '大蘑菇', effect: '双防' },
	balmmushroom: { kind: 'balanced', amount: 300, name: '芳香蘑菇', effect: '双攻、双防' },
} as const;
export function mushroomGift(account: RogueAccount, run: RogueRun, content: RogueContent, random: RogueRandom) {
	const pool = run.floor < 50 ? ['Paras', 'Paras', 'Morelull', 'Morelull', 'Shroomish', 'Foongus'] :
		run.floor < 100 ? ['Foongus', 'Foongus', 'Breloom', 'Breloom', 'Parasect', 'Shiinotic'] :
		run.floor < 150 ? ['Breloom', 'Breloom', 'Amoonguss', 'Amoonguss', 'Brute Bonnet'] :
		['Breloom', 'Amoonguss', 'Brute Bonnet', 'Brute Bonnet', 'Brute Bonnet'];
	// Explicitly authored rare gift: Brute Bonnet starts at floor 100, level 50.
	const mon = drawBlessingGift(run, content, random, { species: pool[random(pool.length)], legendaryReward: true });
	run.blessings!.owned.find(b => b.family === 'mushroomsynthesis')!.target = mon.id;
	gift(account, run, content, mon, '合成大蘑菇');
}
export function feedMushroom(run: RogueRun, member: string, item: string, count: number) {
	if (!ownsBlessing(run.blessings, 'mushroomsynthesis') ||
		!['rest', 'ready', 'choose', 'reward', 'event'].includes(run.phase)) {
		throw new Error('请在获得【合成大蘑菇】后，于战斗外投喂。');
	}
	const mon = run.team.find(m => m.id === member), food = MUSHROOM_FOOD[item as keyof typeof MUSHROOM_FOOD];
	if (!mon || mon.egg || !mushroomSpecies(mon.set.species) || !food ||
		!Number.isSafeInteger(count) || count < 1 || count > (run.bag[item] || 0)) {
		throw new Error('请选择蘑菇伙伴及有效的投喂数量。');
	}
	const keys = food.kind === 'balanced' ? ['offense', 'defense'] as const : [food.kind];
	const before = mon.mushroomTraining || { offense: 0, defense: 0 };
	const total = before.offense + before.defense;
	// Integrating the decreasing marginal rate makes 10 at once identical to ten single feeds.
	const after = 2000 * (((1 + total / 2000) ** 1.5 + 1.5 * count * food.amount * keys.length / 2000) ** (2 / 3) - 1);
	const amount = (after - total) / keys.length;
	if (!Number.isFinite(after) || amount <= 0) throw new Error('投喂数量超出可计算范围。');
	run.bag[item] -= count;
	mon.mushroomTraining = { ...before };
	for (const key of keys) mon.mushroomTraining[key] += amount;
	syncGrowthParty(run);
	const change = keys.map(k => `${k === 'offense' ? '双攻' : '双防'} +` +
		growthPercent((mon.mushroomTraining?.[k] || 0) - (before[k] || 0))).join('、');
	(run.notices ||= []).push(`【合成大蘑菇】投喂【${food.name}】×${count}，本局永久${change}。`);
}
