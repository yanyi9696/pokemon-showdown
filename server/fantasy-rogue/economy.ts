import { captureItems } from './capture-items';
import { difficultyRewardScale, type RogueDifficulty } from '../../sim/rogue-difficulty';
import type { RogueItem, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import {
	CANDY_SHOP, routeCandyReward, eliteTreasureBudget, encounterCoins, journeyCoins, LATE_INCOME_BONUS_PERCENT,
} from './early-balance';

/** Tower sale prices: 60% of the previous ordinary-shop values. */
export const TREASURES: RogueItem[] = [
	['tinymushroom', '小蘑菇', 150], ['bigmushroom', '大蘑菇', 1500], ['balmmushroom', '芳香蘑菇', 4500],
	['prettyfeather', '美丽之羽', 300], ['stardust', '星星沙子', 900], ['starpiece', '星星碎片', 3600],
	['cometshard', '彗星碎片', 7500], ['pearl', '珍珠', 600], ['bigpearl', '大珍珠', 2400],
	['pearlstring', '丸子珍珠', 6000], ['nugget', '金珠', 3000], ['bignugget', '巨大金珠', 12000],
].map(([id, name, sellPrice]) => ({
	id: id as string, name: name as string, kind: 'treasure', price: 0, shopFloor: false, sellPrice: sellPrice as number,
}));

/** Fossils are collectible treasures here; no unimplemented revival action is advertised. */
export const FOSSILS: RogueItem[] = [
	['helixfossil', '贝壳化石'], ['domefossil', '甲壳化石'], ['oldamber', '秘密琥珀'],
	['rootfossil', '根状化石'], ['clawfossil', '爪子化石'], ['skullfossil', '头盖化石'],
	['armorfossil', '盾甲化石'], ['coverfossil', '背盖化石'], ['plumefossil', '羽毛化石'],
	['jawfossil', '颚之化石'], ['sailfossil', '鳍之化石'], ['fossilizedbird', '化石鸟'],
	['fossilizeddino', '化石海兽'], ['fossilizeddrake', '化石龙'], ['fossilizedfish', '化石鱼'],
].map(([id, name]) => ({ id, name, kind: 'treasure', price: 0, shopFloor: false, sellPrice: 600,
	description: '原石中保存的古代化石，可收藏或在商店兑换金币。' }));

/** Weights follow TREASURES order; every item stays possible at every floor. */
export const LOOT_STAGES = [
	{ min: 1, max: 1, weights: [7600, 150, 5, 1400, 200, 15, 1, 580, 30, 3, 15, 1] },
	{ min: 1, max: 1, weights: [5900, 750, 40, 1400, 650, 80, 5, 800, 200, 20, 150, 5] },
	{ min: 1, max: 2, weights: [3900, 1400, 150, 1200, 1000, 300, 30, 900, 450, 80, 570, 20] },
	{ min: 1, max: 2, weights: [2100, 1800, 400, 800, 1300, 650, 100, 900, 700, 200, 1000, 50] },
	{ min: 2, max: 2, weights: [1000, 1900, 700, 500, 1300, 1050, 200, 850, 900, 400, 1100, 100] },
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
	// Preserve every original drop, with a 12% chance of one extra copy per item.
	// Roll only once with the route; this raises expected sale value without repricing saved bags.
	if (floor >= 81) {
		for (const [id, quantity] of Object.entries(loot)) {
			for (let n = 0; n < quantity; n++) {
				if (random(100) < LATE_INCOME_BONUS_PERCENT) loot[id]++;
			}
		}
	}
	return loot;
}

/** Does not modify selected legacy nodes or reroll a persisted route. */
export function prepareEconomy(node: RogueNode, floor: number, random: RogueRandom, difficulty: RogueDifficulty = 0) {
	if (!node.encounters.length || node.wildLoot || node.economyPrepared) return;
	node.economyPrepared = true;
	const scale = difficultyRewardScale(difficulty, floor);
	const trainer = node.kind === 'trainer' || node.encounters.some(encounter =>
		encounter.trainer || encounter.trainerCandidates?.length);
	if (trainer) {
		node.reward.items = node.kind === 'trainer' ? routeCandyReward(floor, 'trainer', scale) : {};
		if (node.kind === 'trainer') node.reward.money = encounterCoins(floor);
		else node.reward.money = journeyCoins(floor, node.reward.money);
		node.reward.money = Math.round(node.reward.money * scale);
		if (node.kind === 'trainer') diversifyBattleReward(node.reward, floor, random);
	} else {
		node.reward = { money: 0, items: {} };
		node.wildLoot = node.encounters.map(encounter => {
			const loot: Record<string, number> = {};
			for (let n = 0; n < (encounter.wildPack?.lootRolls || 1); n++) {
				for (const [id, count] of Object.entries(rollWildLoot(floor, random))) loot[id] = (loot[id] || 0) + count;
			}
			if (node.kind === 'elite') {
				let budget = eliteTreasureBudget(floor);
				for (const item of [...TREASURES].sort((a, b) => b.sellPrice! - a.sellPrice!)) {
					const count = Math.floor(budget / item.sellPrice!);
					if (count) { loot[item.id] = (loot[item.id] || 0) + count; budget -= count * item.sellPrice!; }
				}
				Object.assign(loot, routeCandyReward(floor, 'elite', scale));
			}
			// Roll once with the saved route; scale expected treasure value without repricing bags or doubling every singleton.
			if (scale > 1) for (const { id } of TREASURES) {
				const original = loot[id] || 0;
				for (let n = 0; n < original; n++) if (random(10000) < Math.round((scale - 1) * 10000)) loot[id]++;
			}
			if (node.kind !== 'boss') diversifyBattleReward({ money: 0, items: loot }, floor, random);
			return loot;
		});
	}
}

/** Unchosen equipment is budgeted at half retail. Never replaces healing or unique story gifts. */
export function diversifyBattleReward(reward: { money: number, items: Record<string, number> }, floor: number, random: RogueRandom) {
	const chance = floor < 30 ? 10 : floor < 60 ? 18 : floor < 100 ? 26 : 35;
	if (random(100) >= chance) return;
	const values: Record<string, number> = Object.fromEntries([
		...TREASURES.map(i => [i.id, i.sellPrice!]), ...Object.entries(CANDY_SHOP).map(([id, item]) => [id, item.price]),
	]);
	const total = reward.money + Object.entries(reward.items).reduce((sum, [id, n]) => sum + (values[id] || 0) * n, 0);
	const pool: [string, number][] = [['oranberry', 150], ['cheriberry', 150], ['pechaberry', 150], ['rawstberry', 150], ['chestoberry', 150]];
	if (floor >= 30) pool.push(['sitrusberry', 400], ['lumberry', 500], ['leppaberry', 400], ...TYPE_BOOSTERS.map(([id]) => [id, 2000] as [string, number]));
	if (floor >= 60) pool.push(...BATTLE_GOODS.map(([id, , price]) => [id, price / 2] as [string, number]));
	const candidates = pool.filter(([, cost]) => cost <= total * 0.4);
	if (!candidates.length) return;
	const [id, cost] = candidates[random(candidates.length)];
	const items = { ...reward.items };
	let money = reward.money, remaining = cost;
	// Mix which resource is exchanged, while leaving at least 60% of the original reward budget.
	const spendCoins = () => {
		const n = Math.min(money, remaining);
		money -= n; remaining -= n;
	};
	if (random(2)) spendCoins();
	for (const [source, value] of Object.entries(values).sort((a, b) => a[1] - b[1])) {
		const n = Math.min(items[source] || 0, Math.floor(remaining / value));
		if (n) { items[source] -= n; remaining -= n * value; }
	}
	spendCoins();
	if (remaining) return; // No free upgrade and no rounding away expensive candy.
	items[id] = (items[id] || 0) + 1;
	for (const key of Object.keys(reward.items)) delete reward.items[key];
	Object.assign(reward.items, Object.fromEntries(Object.entries(items).filter(([, n]) => n > 0)));
	reward.money = money;
}

export function shopAvailable(item: RogueItem, floor: number): boolean {
	return item.kind !== 'candy' && item.kind !== 'treasure' && item.shopFloor !== false && floor >= (item.shopFloor ?? 1);
}

const SHOP_FLOORS: Record<string, number | false> = {
	maxrevive: false,
	pokeball: 9, potion: 9, revive: 9, oranberry: 9,
	antidote: 9, burnheal: 9, iceheal: 9, awakening: 9, paralyzeheal: 9,
	fullheal: 39, ether: 9,
	maxether: 81, maxelixir: 141,
	greatball: 29, superpotion: 29, sitrusberry: 29,
	miracleseed: 69, mysticwater: 69, charcoal: 69,
	firestone: 39, waterstone: 39, thunderstone: 39, leafstone: 39, moonstone: 39, sunstone: 39,
	elixir: 49, shinystone: 39, duskstone: 39, dawnstone: 39, icestone: 39,
	ultraball: 69, hyperpotion: 69, linkingcord: 89,
	leftovers: 99,
};

export const TYPE_BOOSTERS = [
	['silkscarf', '丝绸围巾'], ['charcoal', '木炭'], ['mysticwater', '神秘水滴'], ['miracleseed', '奇迹种子'],
	['magnet', '磁铁'], ['nevermeltice', '不融冰'], ['blackbelt', '黑带'], ['poisonbarb', '毒针'],
	['softsand', '柔软沙子'], ['sharpbeak', '锐利鸟嘴'], ['twistedspoon', '弯曲的汤匙'], ['silverpowder', '银粉'],
	['hardstone', '硬石头'], ['spelltag', '诅咒之符'], ['dragonfang', '龙之牙'], ['blackglasses', '黑色眼镜'],
	['metalcoat', '金属膜'], ['fairyfeather', '妖精之羽'],
];
export const BATTLE_GOODS: [string, string, number][] = [
	['leftovers', '吃剩的东西', 8000], ['choiceband', '讲究头带', 10000], ['choicespecs', '讲究眼镜', 10000],
	['choicescarf', '讲究围巾', 10000], ['lifeorb', '生命宝珠', 10000], ['assaultvest', '突击背心', 8000],
	['focussash', '气势披带', 6000], ['rockyhelmet', '凸凸头盔', 6000], ['heavydutyboots', '厚底靴', 6000],
	['expertbelt', '达人带', 5000], ['airballoon', '气球', 4000], ['lightclay', '光之黏土', 4000],
	['flameorb', '火焰宝珠', 5000], ['toxicorb', '剧毒宝珠', 5000], ['whiteherb', '白色香草', 4000],
	['powerherb', '强力香草', 5000], ['mentalherb', '心灵香草', 4000],
	['metronome', '节拍器', 5000], ['shellbell', '贝壳之铃', 4500], ['widelens', '广角镜', 4500],
	['zoomlens', '对焦镜', 4000], ['scopelens', '焦点镜', 5000],
	['protectivepads', '部位护具', 5000], ['safetygoggles', '防尘护目镜', 5000], ['clearamulet', '清净坠饰', 6500],
	['covertcloak', '密探斗篷', 6500], ['ejectbutton', '逃脱按键', 4000], ['redcard', '红牌', 4000],
	['blunderpolicy', '打空保险', 4000], ['throatspray', '爽喉喷雾', 4500], ['terrainextender', '大地膜', 4500],
];
const PRICES: Record<string, number> = {
	pokeball: 250, greatball: 750, ultraball: 1500, potion: 200, superpotion: 650, hyperpotion: 1500,
	revive: 900, fullheal: 600, antidote: 500, burnheal: 500, iceheal: 500, awakening: 500, paralyzeheal: 500,
	ether: 400, elixir: 1200, oranberry: 300, sitrusberry: 800, linkingcord: 2500,
	maxether: 750, maxelixir: 1600,
};

/** Same quote for the client and transaction; no fee when there is nothing this center can restore. */
export function centerCare(run: RogueRun) {
	const revives = run.spirit !== 'yveltal';
	const partners = run.team.filter(mon => !mon.egg);
	const fainted = revives ? partners.filter(mon => !mon.hp).length : 0;
	const needed = partners.some(mon => (revives || mon.hp > 0) &&
		(revives && mon.hp < mon.maxhp || mon.status || Object.keys(mon.statuses || {}).length ||
			[...mon.pp, ...(mon.moveMemory || []), ...(mon.blessingPP || [])].some(slot => slot.pp < slot.maxpp)));
	const base = Math.ceil((150 + 5 * run.floor) / 50) * 50;
	const perRevive = Math.ceil((450 + 7 * run.floor) / 50) * 50;
	return { cost: needed ? base + fainted * perRevive : 0, fainted, needed: !!needed, revives };
}

export function configureShop(items: RogueItem[]) {
	for (const item of items) {
		item.shopFloor = item.kind === 'candy' ? false : SHOP_FLOORS[item.id] ?? (item.kind === 'evolution' ? 89 : 99);
		item.price = CANDY_SHOP[item.id]?.price ?? PRICES[item.id] ?? (item.kind === 'evolution' ? 1600 : Math.ceil(item.price * 1.25 / 50) * 50);
		if (item.id === 'blackaugurite') item.name = '黑奇石';
	}
	for (const [id, name] of TYPE_BOOSTERS) {
		const item = items.find(entry => entry.id === id);
		const data: RogueItem = { id, name, kind: 'held', price: 4000, shopFloor: 49 };
		if (item) Object.assign(item, data); else items.push(data);
	}
	for (const [id, name, price] of BATTLE_GOODS) {
		const item = items.find(entry => entry.id === id);
		const data: RogueItem = { id, name, kind: 'held', category: '对战影响道具', price, shopFloor: 99 };
		if (item) Object.assign(item, data); else items.push(data);
	}
	for (const [id, name, price] of [
		['cheriberry', '樱子果', 300], ['pechaberry', '桃桃果', 300], ['rawstberry', '莓莓果', 300],
		['chestoberry', '零余果', 300], ['lumberry', '木子果', 1000], ['leppaberry', '苹野果', 800],
	] as [string, string, number][]) {
		items.push({ id, name, kind: 'held', category: '树果', price, shopFloor: false });
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
	items.push({ id: 'bottlecap', name: '银色王冠', kind: 'crown', price: 6000, shopFloor: false, icon: 'bottlecap', description: '将一名伙伴自选一项个体值提升至 31。' },
		{ id: 'goldbottlecap', name: '金色王冠', kind: 'crown', price: 24000, shopFloor: false, icon: 'goldbottlecap', description: '将一名伙伴的六项个体值全部提升至 31。' });
	items.push(...captureItems());
	items.push(...structuredClone(TREASURES), ...structuredClone(FOSSILS));
}
