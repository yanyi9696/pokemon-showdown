import { Dex, toID } from '../../sim/dex';
import { activeRogueSpirits, roguePartyLimit, rogueWildLevelBonus } from '../../sim/fantasy-rogue-spirits';
import type { RogueRandom } from './biome-pools';
import type { RogueContent, RogueItem, RogueNode, RogueRun } from './types';
import { createRoguePokemon, initializeExperience, rebuildMember } from './progression';
import { ROGUE_INITIAL_FRIENDSHIP } from './friendship';
import { makeEncounterSet, randomEncounterIVs } from './encounter-sets';
import { canEditParty, healingLocked, inventoryItem } from './team';
import { drawGiftSpecies } from './gifts';
import { CANDY_SHOP } from './early-balance';

export const SPIRIT_HAZARDS = [
	'stealthrock', 'spikes', 'toxicspikes', 'stickyweb', 'gmaxsteelsurge', 'reflect', 'lightscreen', 'safeguard',
];
// The approved rogue pool is explicit; other custom or signature items are not fantasy-pool rewards.
const FANTASY_ITEMS = ['fantasypowerlens', 'fantasyringtarget', 'fantasylifeorb', 'fantasysachet',
	'fantasyscopelens', 'fantasysyrupyapple', 'fantasyprotector', 'fantasyicestone', 'fantasylaxincense',
	'fantasydefensegem', 'fantasymachobrace'];
function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

export function initializeSpirit(run: RogueRun, content: RogueContent, random: RogueRandom, chosen?: string) {
	const pool = activeRogueSpirits();
	const spirit = chosen ? pool.find(entry => entry.id === chosen) : pool[random(pool.length)];
	requireRule(spirit, '该塔灵尚未开放。');
	run.spirit = spirit.id;
	run.phase = 'intro';
	if (spirit.id === 'zygarde') run.box = [];
	if (spirit.id === 'celebi') {
		if (content.story) run.pendingSpiritGift = true;
		else grantSpiritGift(run, content, random);
	}
}

export function grantSpiritGift(run: RogueRun, content: RogueContent, random: RogueRandom) {
	delete run.pendingSpiritGift;
	if (run.spirit === 'celebi') {
		// Use the configured starter families, excluding temporary battle-only forms.
		const candidates = content.starters.filter(entry => !Dex.mod('gen9fantasy').species.get(entry.set.species).battleOnly);
		const species = drawGiftSpecies(candidates.map(entry => entry.set.species), run.startCard, random);
		const set = makeEncounterSet(species, 40, randomEncounterIVs(random));
		set.happiness = ROGUE_INITIAL_FRIENDSHIP;
		set.shiny = random(1000) < 2 + (run.startCard === 'all' ? 1 : 0);
		const mon = createRoguePokemon(set, run.boosts);
		mon.fixedLevel = 40;
		initializeExperience(mon);
		if (run.team.length < 6) run.team.push(mon);
		else run.pendingCapture = mon;
	}
}

export function spiritItems(content: RogueContent, run?: RogueRun): RogueItem[] {
	if (run?.spirit !== 'meowth') return content.items;
	const candies: Record<string, number> = {
		expcandyxs: 250, expcandys: 1125, expcandym: 3750, expcandyl: 10000, expcandyxl: 22500,
	};
	return content.items.map(item => {
		if (item.kind === 'treasure') return item;
		const candy = candies[item.id];
		return { ...item, price: candy ? Math.ceil(candy * 1.25 / 25) * 25 : Math.ceil(item.price * 1.25),
			shopFloor: candy ? Math.max(9, CANDY_SHOP[item.id].floor) : typeof item.shopFloor === 'number' ? Math.max(9, item.shopFloor - 20) : item.shopFloor };
	});
}
export function spiritShopAvailable(item: RogueItem, floor: number) {
	return item.kind !== 'treasure' && (item.kind !== 'candy' || typeof item.shopFloor === 'number') &&
		item.shopFloor !== false && floor >= (item.shopFloor ?? 1);
}
export function hpPurchaseCost(item: RogueItem, maxhp: number) {
	return Math.ceil(maxhp * Math.min(0.8, Math.max(0.1, Math.ceil(item.price / 250) * 0.05)));
}

export function convertSpiritItem(run: RogueRun, content: RogueContent, id: string, key: string, random: RogueRandom) {
	const item = inventoryItem(content, id);
	if (run.spirit !== 'hoopagift' || item?.kind !== 'held' || FANTASY_ITEMS.includes(id) ||
		id.startsWith('rogueemblem')) return id;
	const ledger = run.spiritConversions ||= {};
	if (ledger[key]) return ledger[key];
	ledger[key] = random(2) === 0 ? FANTASY_ITEMS[random(FANTASY_ITEMS.length)] : id;
	return ledger[key];
}

/** Prepare new choices once; old saved encounters are never rewritten. */
export function prepareSpiritNode(run: RogueRun, node: RogueNode, content: RogueContent, random: RogueRandom) {
	if (!run.spiritVersion || node.spiritPrepared) return;
	node.spiritPrepared = true;
	for (const encounter of node.encounters) {
		if (encounter.trainer) continue;
		if (run.spirit === 'diancie' && encounter.catchable) {
			encounter.stars = encounter.team.map(() => random(100) < 8 ? 2 : 1);
		}
		for (const set of encounter.team) {
			if (encounter.catchable && !set.shiny) {
				set.shiny = random(1000) < (run.spirit === 'hooh' ? 20 : 2) + (run.startCard === 'all' ? 1 : 0);
			}
			if (run.spirit === 'mew' && !node.biome) {
				const level = set.level + rogueWildLevelBonus(run.floor, run.spirit);
				set.level = encounter.boss ? level : Math.min(100, level);
			}
		}
	}
	const reward: Record<string, number> = {};
	for (const [id, count] of Object.entries(node.reward.items)) {
		for (let n = 0; n < count; n++) {
			const next = convertSpiritItem(run, content, id, `floor:${run.floor}:${id}:${n}`, random);
			reward[next] = (reward[next] || 0) + 1;
		}
	}
	node.reward.items = reward;
	if (run.spirit === 'persian' && ['rest', 'trade'].includes(node.kind) && random(100) < 15) {
		const stage = Math.min(4, Math.floor((run.floor - 1) / 40));
		const level = Math.min(100, Math.max(3, Math.ceil(run.floor / 2)) + 3);
		const species = stage === 0 ? ['Rattata', 'Ekans', 'Zubat', 'Koffing', 'Meowth'] :
			stage === 1 ? ['Raticate', 'Arbok', 'Golbat', 'Koffing', 'Persian'] :
			['Raticate', 'Arbok', 'Golbat', 'Weezing', 'Muk', 'Persian'];
		const pool = [...species];
		const team: PokemonSet[] = [];
		for (let i = 0; i < [2, 3, 3, 4, 5][stage]; i++) {
			team.push(makeEncounterSet(pool.splice(random(pool.length), 1)[0], level, 20));
		}
		node.rocket = { cleared: false, reward: [3000, 6000, 10000, 16000, 25000][stage] };
		node.encounters = [{ name: '火箭队', style: 'aggressive', catchable: false, team,
			trainer: { id: 'rocketgrunt', name: '火箭队', avatar: 'rocketgrunt', role: 'rocket', tera: false } }];
	}
	if (run.spirit === 'hoopamischief') {
		for (const encounter of node.encounters) {
			encounter.spiritHazards = [0, 1].map(() => SPIRIT_HAZARDS[random(SPIRIT_HAZARDS.length)]);
		}
	}
}

/** The run owns these flat bonuses, so future captures inherit them too. */
export function completeSpiritRegion(run: RogueRun) {
	const kind = run.node?.kind;
	const stat = run.spirit === 'zacian' && ['wild', 'elite', 'trainer', 'encounter'].includes(kind || '') ? 'atk' :
		run.spirit === 'mewtwo' && ['event', 'reward', 'trade'].includes(kind || '') ? 'spa' : undefined;
	if (!stat) return;
	run.boosts[stat]++;
	for (const mon of [...run.team, ...(run.box || [])]) rebuildMember(mon, run.boosts);
	(run.notices ||= []).push(`本局全队永久${stat === 'atk' ? '攻击' : '特攻'} +1，后续加入的伙伴同样享受。`);
}

export function editSpiritBox(run: RogueRun, member: string, target?: string) {
	requireRule(run.spirit === 'zygarde' && run.box && canEditParty(run) && !healingLocked(run), '当前不能整理宝可梦箱子。');
	const teamIndex = run.team.findIndex(mon => mon.id === member);
	const boxIndex = run.box.findIndex(mon => mon.id === member);
	if (teamIndex >= 0) {
		requireRule(run.team.length > 1 && run.box.length < 30, '至少保留一名队员，且箱子不能超过 30 只。');
		run.box.push(run.team.splice(teamIndex, 1)[0]);
	} else {
		requireRule(boxIndex >= 0, '箱子中没有这位伙伴。');
		const replace = run.team.findIndex(mon => mon.id === target);
		if (replace >= 0) [run.team[replace], run.box[boxIndex]] = [run.box[boxIndex], run.team[replace]];
		else {
			requireRule(run.team.length < roguePartyLimit(run.spirit), '队伍已满，请选择交换的队员。');
			run.team.push(run.box.splice(boxIndex, 1)[0]);
		}
	}
}

export function mergeSpiritPokemon(run: RogueRun, member: string, consume: string[] | undefined) {
	requireRule(run.spirit === 'zygarde' && run.box && canEditParty(run) && !healingLocked(run), '当前不能升星。');
	const owned = [...run.team, ...run.box];
	const keep = owned.find(mon => mon.id === member);
	requireRule(keep && (keep.stars || 1) < 4 && Array.isArray(consume) && consume.length === 2 &&
		new Set([member, ...consume]).size === 3, '请保留一只并选择两只相同伙伴，四星不能继续合成。');
	const removed = consume.map(id => owned.find(mon => mon.id === id));
	requireRule(removed.every(mon => mon && toID(mon.set.species) === toID(keep.set.species) &&
		(mon.stars || 1) === (keep.stars || 1)), '需要三只同物种、同形态、同星级的伙伴。');
	for (const mon of removed) for (const item of [mon!.set.item, mon!.emblem]) if (item) {
		const id = toID(item); run.bag[id] = (run.bag[id] || 0) + 1;
	}
	run.team = run.team.filter(mon => !consume.includes(mon.id));
	run.box = run.box.filter(mon => !consume.includes(mon.id));
	if (!run.team.length) { run.box = run.box.filter(mon => mon.id !== keep.id); run.team.push(keep); }
	keep.stars = (keep.stars || 1) + 1;
	rebuildMember(keep, run.boosts);
	run.notices = [`${keep.set.species} 已升至 ${keep.stars} 星。消耗成员的携带道具及属性转已返还背包。`];
}
