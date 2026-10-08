import type { RogueItem, RogueNode } from './types';
import type { RogueRandom } from './biome-pools';

/** Ordinary shop sale prices in Generation IX, not specialist NPC premiums. */
export const TREASURES: RogueItem[] = [
	['tinymushroom', '小蘑菇', 250], ['bigmushroom', '大蘑菇', 2500], ['balmmushroom', '芳香蘑菇', 7500],
	['prettyfeather', '美丽之羽', 500], ['stardust', '星星沙子', 1500], ['starpiece', '星星碎片', 6000],
	['cometshard', '彗星碎片', 12500], ['pearl', '珍珠', 1000], ['bigpearl', '大珍珠', 4000],
	['pearlstring', '丸子珍珠', 10000], ['nugget', '金珠', 5000], ['bignugget', '巨大金珠', 20000],
].map(([id, name, sellPrice]) => ({
	id: id as string, name: name as string, kind: 'treasure', price: 0, shopFloor: false, sellPrice: sellPrice as number,
}));

/** Weights follow TREASURES order; every item stays possible at every floor. */
export const LOOT_STAGES = [
	{ min: 1, max: 1, weights: [7600, 150, 5, 1400, 200, 15, 1, 580, 30, 3, 15, 1] },
	{ min: 1, max: 2, weights: [5900, 750, 40, 1400, 650, 80, 5, 800, 200, 20, 150, 5] },
	{ min: 2, max: 2, weights: [3900, 1400, 150, 1200, 1000, 300, 30, 900, 450, 80, 570, 20] },
	{ min: 2, max: 3, weights: [2100, 1800, 400, 800, 1300, 650, 100, 900, 700, 200, 1000, 50] },
	{ min: 3, max: 3, weights: [1000, 1900, 700, 500, 1300, 1050, 200, 850, 900, 400, 1100, 100] },
];

export function rollWildLoot(floor: number, random: RogueRandom): Record<string, number> {
	const stage = LOOT_STAGES[Math.min(4, Math.max(0, Math.floor((floor - 1) / 40)))];
	const count = stage.min + (stage.max > stage.min ? random(stage.max - stage.min + 1) : 0);
	const total = stage.weights.reduce((sum, weight) => sum + weight, 0);
	const loot: Record<string, number> = {};
	for (let n = 0; n < count; n++) {
		let roll = random(total);
		const index = stage.weights.findIndex(weight => { roll -= weight; return roll < 0; });
		const id = TREASURES[index].id;
		loot[id] = (loot[id] || 0) + 1;
	}
	return loot;
}

/** Does not modify selected legacy nodes or reroll a persisted route. */
export function prepareEconomy(node: RogueNode, floor: number, random: RogueRandom) {
	if (!node.encounters.length || node.wildLoot) return;
	const trainer = node.kind === 'trainer' || node.encounters.some(encounter =>
		encounter.trainer || encounter.trainerCandidates?.length);
	if (trainer) {
		node.reward.items = {};
	} else {
		node.reward = { money: 0, items: {} };
		node.wildLoot = node.encounters.map(() => rollWildLoot(floor, random));
	}
}

export function shopAvailable(item: RogueItem, floor: number): boolean {
	return item.kind !== 'candy' && item.kind !== 'treasure' && item.shopFloor !== false && floor >= (item.shopFloor ?? 1);
}

const SHOP_FLOORS: Record<string, number> = {
	pokeball: 9, potion: 9, revive: 9, oranberry: 9,
	fullheal: 19,
	greatball: 29, superpotion: 29, sitrusberry: 29,
	miracleseed: 39, mysticwater: 39, charcoal: 39,
	firestone: 39, waterstone: 39, thunderstone: 39, leafstone: 39, moonstone: 39, sunstone: 39,
	elixir: 49, shinystone: 49, duskstone: 49, dawnstone: 49, icestone: 49,
	ultraball: 69, hyperpotion: 69, linkingcord: 69,
	leftovers: 99,
};

export function configureShop(items: RogueItem[]) {
	for (const item of items) {
		item.shopFloor = item.kind === 'candy' ? false : SHOP_FLOORS[item.id] ?? 69;
		if (item.id === 'blackaugurite') item.name = '黑奇石';
	}
	const stats: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
	const feathers = ['healthfeather', 'musclefeather', 'resistfeather', 'geniusfeather', 'cleverfeather', 'swiftfeather'];
	const featherNames = ['体力之羽', '肌力之羽', '抵抗之羽', '智力之羽', '精神之羽', '瞬发之羽'];
	const vitamins = ['hpup', 'protein', 'iron', 'calcium', 'zinc', 'carbos'];
	const vitaminNames = ['HP增强剂', '攻击增强剂', '防御增强剂', '特攻增强剂', '特防增强剂', '速度增强剂'];
	stats.forEach((stat, i) => {
		items.push({ id: feathers[i], name: featherNames[i], kind: 'effort', stat, amount: 1, price: 500, shopFloor: 19 });
		items.push({ id: vitamins[i], name: vitaminNames[i], kind: 'effort', stat, amount: 10, price: 4000, shopFloor: 89 });
	});
	items.push(...structuredClone(TREASURES));
}
