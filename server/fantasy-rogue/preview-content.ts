/** Replaceable playtest pack. These rosters and prices are NOT the final game balance. */
import { Dex, toID } from '../../sim/dex';
import { fixedFloor, BOSS_FLOORS } from './content';
import { levelMoves } from './progression';
import type { RogueContent, RogueEncounter, RogueNode } from './types';

const dex = Dex.mod('gen9fantasy');
const ordinary = Dex.mod('gen9');
const stats = (value: number): StatsTable => ({
	hp: value, atk: value, def: value, spa: value, spd: value, spe: value,
});

export const PreviewBalance = {
	version: 'preview-2026-09-v2',
	initialMoney: 1500,
	initialBag: { pokeball: 12, potion: 6, revive: 1, elixir: 1, expcandyxs: 3 },
	wildLevel: (floor: number) => Math.min(100, Math.max(3, 2 + Math.ceil(floor / 2))),
	bossLevel: (floor: number) => Math.min(100, 5 + Math.ceil(floor / 2)),
};

export const PreviewBiomes = [
	{ name: '晨曦草地', pool: ['Pidgey', 'Rattata', 'Sentret', 'Zigzagoon', 'Bidoof', 'Fletchling', 'Rookidee', 'Caterpie'] },
	{ name: '林间溪流', pool: ['Magikarp', 'Poliwag', 'Wooper', 'Buizel', 'Tympole', 'Chewtle', 'Wingull', 'Lotad'] },
	{ name: '苔光森林', pool: ['Weedle', 'Oddish', 'Bellsprout', 'Sewaddle', 'Shroomish', 'Ralts', 'Seedot', 'Venipede'] },
	{ name: '雷鸣山麓', pool: ['Mareep', 'Shinx', 'Magnemite', 'Geodude', 'Roggenrola', 'Machop', 'Electrike', 'Mudbray'] },
	{ name: '熔火荒野', pool: ['Vulpix', 'Growlithe', 'Numel', 'Slugma', 'Sandile', 'Trapinch', 'Houndour', 'Salandit'] },
	{ name: '幽影遗迹', pool: ['Gastly', 'Duskull', 'Litwick', 'Shuppet', 'Honedge', 'Misdreavus', 'Yamask', 'Golett'] },
	{ name: '霜落海岸', pool: ['Spheal', 'Swinub', 'Snorunt', 'Vanillite', 'Snover', 'Shellder', 'Seel', 'Bergmite'] },
	{ name: '苍穹山脊', pool: ['Dratini', 'Bagon', 'Gible', 'Axew', 'Deino', 'Jangmo-o', 'Larvitar', 'Dreepy'] },
	{ name: '星辉秘境', pool: ['Eevee', 'Togedemaru', 'Mimikyu', 'Absol', 'Scyther', 'Heracross', 'Lapras', 'Snorlax'] },
	{ name: '终焉高地', pool: ['Beldum', 'Larvitar', 'Bagon', 'Gible', 'Deino', 'Dreepy', 'Ralts', 'Dratini'] },
];

const starters = [
	'Bulbasaur', 'Charmander', 'Squirtle', 'Chikorita', 'Cyndaquil', 'Totodile', 'Treecko', 'Torchic', 'Mudkip',
	'Turtwig', 'Chimchar', 'Piplup', 'Snivy', 'Tepig', 'Oshawott', 'Chespin', 'Fennekin', 'Froakie',
	'Rowlet', 'Litten', 'Popplio', 'Grookey', 'Scorbunny', 'Sobble', 'Sprigatito', 'Fuecoco', 'Quaxly',
];

/** Theme rosters: size and stage scale by floor, with explicit endgame teams. */
export const PreviewBosses: Record<number, { name: string, team: string[] }> = {
	10: { name: '精英首领 · 林间蝶王', team: ['Butterfree'] },
	20: { name: '岩石道馆 · 小刚', team: ['Geodude', 'Onix'] },
	30: { name: '精英首领 · 沼泽毒牙', team: ['Arbok'] },
	40: { name: '水系道馆 · 小霞', team: ['Starmie', 'Gyarados', 'Quagsire'] },
	50: { name: '精英首领 · 雷霆狮王', team: ['Luxray'] },
	60: { name: '电系道馆 · 马志士', team: ['Raichu', 'Electrode', 'Magneton'] },
	70: { name: '精英首领 · 沙海飞龙', team: ['Flygon'] },
	80: { name: '草系道馆 · 莉佳', team: ['Tangrowth', 'Victreebel', 'Vileplume', 'Leafeon'] },
	90: { name: '精英首领 · 炉心钢蛇', team: ['Steelix'] },
	100: { name: '毒系道馆 · 阿桔', team: ['Crobat', 'Muk', 'Weezing', 'Drapion'] },
	110: { name: '精英首领 · 深海歌者', team: ['Milotic'] },
	120: { name: '超能道馆 · 娜姿', team: ['Alakazam', 'Espeon', 'Slowbro', 'Gardevoir', 'Bronzong'] },
	130: { name: '精英首领 · 冰原猛犸', team: ['Mamoswine'] },
	140: { name: '火系道馆 · 夏伯', team: ['Arcanine', 'Ninetales', 'Magmortar', 'Torkoal', 'Volcarona'] },
	150: { name: '精英首领 · 古代暴君', team: ['Tyranitar'] },
	160: { name: '龙系道馆 · 小椿', team: ['Kingdra', 'Flygon', 'Haxorus', 'Altaria', 'Dragonite', 'Dragalge'] },
	165: { name: '四天王 · 恶之试炼', team: ['Umbreon', 'Honchkrow', 'Krookodile', 'Weavile', 'Bisharp', 'Hydreigon'] },
	170: { name: '精英首领 · 合金巨像', team: ['Metagross'] },
	175: { name: '四天王 · 幽灵试炼', team: ['Dusknoir', 'Gengar', 'Chandelure', 'Aegislash', 'Mimikyu', 'Dragapult'] },
	180: { name: '四天王 · 钢铁试炼', team: ['Skarmory', 'Scizor', 'Excadrill', 'Magnezone', 'Lucario', 'Metagross'] },
	185: { name: '四天王 · 龙之试炼', team: ['Kingdra', 'Flygon', 'Haxorus', 'Salamence', 'Garchomp', 'Dragonite'] },
	190: { name: '冠军 · 幻想之巅', team: ['Togekiss', 'Milotic', 'Roserade', 'Lucario', 'Spiritomb', 'Garchomp'] },
	200: { name: '最终首领 · 幻想超梦', team: ['Mewtwo-Fantasy'] },
};

function stageAtLevel(name: string, level: number): string {
	let species = ordinary.species.get(name);
	for (let i = 0; i < 3; i++) {
		const next = species.evos.map(evo => ordinary.species.get(evo)).find(evo => !evo.evoType && evo.evoLevel! <= level);
		if (!next) break;
		species = next;
	}
	return species.name;
}

function movesFor(name: string, level: number) {
	const species = ordinary.species.get(name);
	const candidates = [...new Set(levelMoves(name).filter(entry => entry.level <= level).map(entry => entry.move))]
		.map(move => dex.moves.get(move));
	const ranked = candidates.filter(move => move.category !== 'Status').sort((a, b) => {
		const score = (move: typeof a) => (move.basePower || 40) * (species.types.includes(move.type) ? 1.5 : 1);
		return score(b) - score(a);
	});
	const selected = ranked.slice(0, 2).map(move => move.id);
	const status = candidates.filter(move => move.category === 'Status').slice(-1)[0];
	if (status) selected.push(status.id);
	for (const move of ranked.concat(candidates.slice().reverse())) {
		if (selected.length >= 4) break;
		if (!selected.includes(move.id)) selected.push(move.id);
	}
	if (!selected.length) throw new Error(`试玩初始招式缺失：${name}`);
	return selected;
}

function makeSet(name: string, level: number, quality = 15, boss = false): PokemonSet {
	const species = dex.species.get(name);
	const base = ordinary.species.get(species.baseSpecies);
	return {
		name: species.name, species: species.name, ability: species.abilities[0], level, nature: 'Hardy',
		moves: name === 'Mewtwo-Fantasy' ? ['Psystrike', 'Aura Sphere', 'Shadow Ball', 'Recover'] : movesFor(base.name, level),
		item: boss && level >= 30 ? 'Sitrus Berry' : boss && level >= 12 ? 'Oran Berry' : '',
		evs: stats(0), ivs: stats(quality), gender: species.gender || (species.id === 'salandit' ? 'F' : 'M'),
	};
}

export function createPreviewContent(): RogueContent {
	const content: RogueContent = {
		version: PreviewBalance.version, label: '幻想杯肉鸽 · 200 层试玩版（队伍与价格为测试配置）',
		progression: 'mainline7', allowReplacement: true,
		initialMoney: PreviewBalance.initialMoney, initialBag: { ...PreviewBalance.initialBag },
		starters: starters.map(name => ({ id: toID(name), set: makeSet(name, 5, 20), availableInitially: true })),
		unlocks: {}, floors: {}, items: [
			{ id: 'pokeball', name: '精灵球', kind: 'ball', price: 200, multiplier: 1, icon: 'pokeball' },
			{ id: 'greatball', name: '超级球', kind: 'ball', price: 600, multiplier: 1.5, icon: 'greatball' },
			{ id: 'ultraball', name: '高级球', kind: 'ball', price: 1200, multiplier: 2, icon: 'ultraball' },
			{ id: 'potion', name: '伤药（20 HP）', kind: 'heal', price: 150, amount: 20, icon: 'potion' },
			{ id: 'superpotion', name: '好伤药（60 HP）', kind: 'heal', price: 500, amount: 60, icon: 'superpotion' },
			{ id: 'hyperpotion', name: '厉害伤药（120 HP）', kind: 'heal', price: 1200, amount: 120, icon: 'hyperpotion' },
			{ id: 'revive', name: '活力碎片（复活至半血）', kind: 'revive', price: 1000, amount: 0.5, icon: 'revive' },
			{ id: 'fullheal', name: '万灵药', kind: 'cure', price: 400, icon: 'fullheal' },
			{ id: 'elixir', name: 'PP 多项小补剂（各招 +10）', kind: 'ether', price: 800, amount: 10, icon: 'elixir' },
			{ id: 'expcandyxs', name: '经验糖果 XS（100 经验）', kind: 'candy', price: 100, amount: 100 },
			{ id: 'expcandys', name: '经验糖果 S（800 经验）', kind: 'candy', price: 600, amount: 800 },
			{ id: 'expcandym', name: '经验糖果 M（3000 经验）', kind: 'candy', price: 1800, amount: 3000 },
			{ id: 'expcandyl', name: '经验糖果 L（10000 经验）', kind: 'candy', price: 5000, amount: 10000 },
			...['Fire', 'Water', 'Thunder', 'Leaf', 'Moon', 'Sun', 'Shiny', 'Dusk', 'Dawn', 'Ice'].map(name => ({
				id: toID(`${name} Stone`), name: dex.items.get(`${name} Stone`).name, kind: 'evolution' as const, price: 1200,
			})),
			{ id: 'linkingcord', name: '联系绳（替代通信进化）', kind: 'evolution', price: 2000 },
		],
	};
	const registerCatch = (name: string) => {
		const captured = ordinary.species.get(name);
		let first = captured;
		while (first.prevo) first = ordinary.species.get(first.prevo);
		if (!content.starters.some(starter => starter.id === first.id)) {
			content.starters.push({ id: first.id, set: makeSet(first.name, 5, 20), availableInitially: false });
		}
		const legendary = !captured.prevo && !captured.evos.length &&
			captured.tags.some(tag => ['Mythical', 'Restricted Legendary', 'Sub-Legendary'].includes(tag));
		content.unlocks[captured.id] = { starter: first.id, captures: legendary ? 10 : 1 };
	};
	const encounter = (name: string, level: number, catchable: boolean, elite = false): RogueEncounter => {
		const species = stageAtLevel(name, level);
		if (catchable) registerCatch(species);
		return { name: catchable ? '野生宝可梦' : '塔中训练家', team: [makeSet(species, level, elite ? 31 : 15)],
			style: elite ? 'aggressive' : 'balanced', catchable };
	};
	for (let floor = 1; floor <= 200; floor++) {
		const level = PreviewBalance.wildLevel(floor);
		if (fixedFloor(floor) === 'rest') {
			content.floors[floor] = [{
				id: 'center', name: '宝可梦中心', kind: 'rest', encounters: [], reward: { money: 0, items: {} },
			}];
			continue;
		}
		if (BOSS_FLOORS.has(floor)) {
			const boss = PreviewBosses[floor];
			if (!boss) throw new Error(`缺少第 ${floor} 层试玩 Boss`);
			const bossLevel = PreviewBalance.bossLevel(floor);
			content.floors[floor] = [{ id: 'boss', name: boss.name, kind: 'boss',
				reward: { money: 800 + floor * 40, items: { greatball: 3, revive: 1 } }, encounters: [{
					name: boss.name, team: boss.team.map(name => makeSet(name, bossLevel, 25, true)), style: 'balanced', catchable: false,
				}] }];
			continue;
		}
		const zone = Math.min(9, Math.floor((floor - 1) / 20));
		const wild = (offset: number): RogueNode => {
			const biome = PreviewBiomes[(zone + offset) % PreviewBiomes.length];
			return { id: `wild${offset}`, name: biome.name, kind: 'wild',
				reward: { money: 150 + floor * 12, items: floor % 3 === 0 ? { potion: 1 } : {} },
				encounters: [0, 1, 2].map(i => encounter(biome.pool[(floor * 3 + i) % biome.pool.length], level, true)),
			};
		};
		let third: RogueNode;
		if (floor >= 6 && floor % 3 === 0) {
			const legends = ['Articuno', 'Zapdos', 'Moltres', 'Raikou', 'Entei', 'Suicune', 'Latias', 'Latios', 'Mew'];
			const pool = PreviewBiomes[zone].pool;
			const name = floor >= 130 ? legends[Math.floor(floor / 3) % legends.length] : pool[floor % pool.length];
			third = { id: 'elite', name: '精英挑战（等级 +5）', kind: 'elite',
				reward: { money: 280 + floor * 20, items: { greatball: 1 } },
				encounters: [encounter(name, Math.min(100, level + 5), true, true)] };
		} else if (floor >= 5 && floor % 3 === 1) {
			const pool = PreviewBiomes[zone].pool;
			third = { id: 'trainer', name: '旅行训练家', kind: 'trainer', reward: { money: 400 + floor * 24, items: {} }, encounters: [{
				name: '旅行训练家', style: 'balanced', catchable: false,
				team: Array.from({ length: Math.min(4, 2 + Math.floor(floor / 70)) }, (_, i) =>
					makeSet(stageAtLevel(pool[(floor + i) % pool.length], level), level, 20)),
			}] };
		} else {
			const candy = floor < 30 ? 'expcandyxs' : floor < 80 ? 'expcandys' : floor < 140 ? 'expcandym' : 'expcandyl';
			third = { id: 'supplies', name: '补给箱', kind: 'reward', encounters: [],
				reward: { money: 100 + floor * 8, items: { [candy]: 1, potion: 1, pokeball: 2 } } };
		}
		content.floors[floor] = [wild(0), wild(1), third];
	}
	return content;
}
