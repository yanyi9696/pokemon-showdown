import { Dex } from '../../sim/dex';
import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { makeEncounterSet } from './encounter-sets';
import { shopDoublesTeam } from './shop-doubles';
import { shopStock } from './trading';
import { SPIRIT_HAZARDS, convertSpiritItem } from './spirits';
import { syncExclusiveItems } from './exclusive-items';
import type { RogueRandom } from './biome-pools';
import type { RogueRun, RogueContent } from './types';

export function beginShopChallenge(
	run: RogueRun, content: RogueContent, random: RogueRandom, availableStock?: ReturnType<typeof shopStock>
) {
	if (run.node?.trade?.kind === 'buyback') throw new Error('回收摊位只回收物品，没有出售的商品。');
	if (run.node?.trade?.kind === 'growth') throw new Error('训练营提供训练服务，没有可争取的商店商品。');
	if (run.phase !== 'rest' || !run.node || run.node.shopChallenge || !ownsBlessing(run.blessings, 'shopraid') ||
		!run.team.some(mon => mon.hp > 0)) throw new Error('当前不能发起商店挑战。');
	const nurse = /中心|医院/.test(run.node.name);
	const level = Math.max(3, Math.ceil(run.floor / 2));
	const roster = nurse ? (level < 32 ? ['Happiny', 'Audino', 'Clefairy'] :
		['Blissey', 'Audino', 'Alomomola', 'Comfey', 'Wigglytuff']) : (level < 28 ?
		['Meowth', 'Skwovet', 'Delibird'] : ['Persian', 'Greedent', 'Delibird', 'Murkrow', 'Gholdengo']);
	const count = Math.min(roster.length, 3 + Math.floor((run.floor - 1) / 80));
	const team = run.doubleBattle ? shopDoublesTeam(nurse ? 'nurse' : 'merchant', run.floor, Math.min(100, level)) :
		roster.slice(0, count).map((name, i) => {
			const set = makeEncounterSet(name, Math.min(100, level), 25);
			const themed = (nurse ? { Blissey: ['softboiled', 'seismictoss', 'thunderwave', 'protect'],
				Audino: ['hypervoice', 'drainingkiss', 'wish', 'protect'], Alomomola: ['scald', 'wish', 'protect', 'whirlpool'],
				Comfey: ['drainingkiss', 'gigadrain', 'synthesis', 'calmmind'],
				Wigglytuff: ['hypervoice', 'dazzlinggleam', 'wish', 'protect'] } :
				{ Persian: ['payday', 'fakeout', 'bite', 'taunt'], Greedent: ['bodyslam', 'crunch', 'stockpile', 'rest'],
					Delibird: ['present', 'icepunch', 'drillpeck', 'protect'], Murkrow: ['foulplay', 'roost', 'taunt', 'tailwind'],
					Gholdengo: ['makeitrain', 'shadowball', 'recover', 'nastyplot'] }) as Record<string, string[]>;
			if (level >= 40 && themed[name]) set.moves = themed[name];
			if (level >= 25) set.item = nurse ? ['leftovers', 'sitrusberry'][i % 2] : ['amuletcoin', 'sitrusberry'][i % 2];
			const species = Dex.mod('gen9fantasy').species.get(name);
			set.gender = species.gender || (nurse ? 'F' : 'M');
			if (species.genderRatio.F === 0) set.gender = 'M';
			return set;
		});
	const stock = (availableStock || shopStock(content, run))
		.filter(item => item.remaining === undefined || item.remaining > 0);
	const rewards: Record<string, number> = {};
	for (let i = 0; i < 3 && stock.length; i++) rewards[stock.splice(random(stock.length), 1)[0].id] = 1;
	run.node.shopChallenge = { rewards, closed: false };
	run.node.encounters.push({ name: nurse ? '乔伊小姐' : '旅行商人', team, style: nurse ? 'balanced' : 'aggressive', catchable: false,
		trainer: { id: nurse ? 'nursejoy' : 'shopmerchant', name: nurse ? '乔伊小姐' : '旅行商人', avatar: nurse ? 'nurse' : 'gentleman',
			role: nurse ? 'nurse' : 'merchant', tera: false },
		...(run.spirit === 'hoopamischief' ? { spiritHazards: [0, 1].map(() => SPIRIT_HAZARDS[random(SPIRIT_HAZARDS.length)]) } : {}),
	});
	run.encounter = run.node.encounters.length - 1;
	const encounter = run.node.encounters[run.encounter];
	encounter.blessingLevels = run.blessings?.levels || 0;
	for (const set of encounter.team) set.level += encounter.blessingLevels;
	run.phase = 'ready';
}

/** Award actual inventory items; the caller closes the challenge atomically after all owners receive them. */
export function grantShopChallengeReward(run: RogueRun, content: RogueContent, random: RogueRandom) {
	const items: Record<string, number> = {};
	syncExclusiveItems(run);
	for (const [item, count] of Object.entries(run.node!.shopChallenge!.rewards)) for (let i = 0; i < count; i++) {
		// Keep the historical first-unit key compatible with existing saves.
		const key = `shopchallenge:${run.floor}:${item}${i ? `:${i}` : ''}`;
		const received = convertSpiritItem(run, content, item, key, random);
		run.bag[received] = (run.bag[received] || 0) + 1;
		items[received] = (items[received] || 0) + 1;
		if (run.exclusiveItems?.[item]) run.exclusiveItems[item].obtained = true;
	}
	return items;
}
