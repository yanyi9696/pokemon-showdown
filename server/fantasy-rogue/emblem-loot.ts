import { BLESSING_TYPES, EMBLEM_PREFIX } from '../../sim/rogue-blessing-data';
import { TREASURES } from './economy';
import type { RogueRandom } from './biome-pools';
import type { RogueRun } from './types';

export interface EmblemLootProgress { count: number; lastDropFloor: number; lastRollFloor: number }
/** Only victory loot is eligible. Attempts and reconnects cannot roll again on the same floor. */
export function emblemLootChance(run: RogueRun) {
	const progress = run.emblemLoot;
	if (run.floor < 15 || (progress?.count || 0) >= 2) return 0;
	if (!progress?.count) return 500; // 5% of eligible treasure rewards.
	if (run.floor <= 100 || run.floor < progress.lastDropFloor + 50) return 0;
	return Math.min(200, (run.floor - 100) * 4); // 0.04% -> 2%, then constant.
}
export function replaceTreasureWithEmblem(run: RogueRun, loot: Record<string, number>, random: RogueRandom) {
	const chance = emblemLootChance(run);
	if (!chance || run.emblemLoot?.lastRollFloor === run.floor) return;
	const budget = TREASURES.reduce((sum, item) => sum + (loot[item.id] || 0) * item.sellPrice!, 0);
	if (budget < 600) return;
	const progress = run.emblemLoot ||= { count: 0, lastDropFloor: 0, lastRollFloor: 0 };
	progress.lastRollFloor = run.floor;
	if (random(10000) >= chance) return;
	// Replace only the economic portion, preserving candy, healing and all other rewards.
	let remaining = budget - Math.min(1500, budget);
	for (const item of TREASURES) delete loot[item.id];
	for (const item of [...TREASURES].sort((a, b) => b.sellPrice! - a.sellPrice!)) {
		const count = Math.floor(remaining / item.sellPrice!);
		if (count) { loot[item.id] = count; remaining -= count * item.sellPrice!; }
	}
	const types = Object.keys(BLESSING_TYPES), type = types[random(types.length)];
	loot[EMBLEM_PREFIX + type.toLowerCase()] = 1;
	progress.count++;
	progress.lastDropFloor = run.floor;
	(run.notices ||= []).push(`发现【${BLESSING_TYPES[type]}属性转】！本次部分贵重物品已替换为这件培养道具。`);
}
