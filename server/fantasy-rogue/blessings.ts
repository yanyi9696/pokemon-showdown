import { candyAtFloor } from './early-balance';
import { grantCompanion } from './companions';
import { companionAppearance, syncCompanions } from '../../sim/rogue-companions';
import { growthModifiers } from './growth';
import { randomUUID } from 'crypto';
import { Dex, toID } from '../../sim/dex';
import { TeamValidator } from '../../sim/team-validator';
import { Format } from '../../sim/dex-formats';
import { ROGUE_STATS, type RoguePokemon, type RogueBattleResult } from '../../sim/fantasy-rogue';
import { rogueStarterSpecies } from '../../sim/fantasy-rogue-rules';
import { roguePartyLimit } from '../../sim/fantasy-rogue-spirits';
import { ROGUE_BLESSINGS, BLESSING_TYPES, EMBLEM_PREFIX, EMBLEM_MOVES, FANTASY_BLESSING_ITEMS, ELECTRIC_MOUSE_FAMILY, inBlessingFamily,
	TYPE_EVOLUTION_EXTRAS, blessing, blessingTitle, blessingLevelCost, addPsychicCharge, ownsBlessing, emblemType,
	blessingStage, blessingCoins, medicRecovery, treasureBudget, lateBlessingReward, OVERTIME_ABILITIES, emblemDescription,
	type BlessingEffects, type OwnedBlessing, type BlessingDefinition } from '../../sim/rogue-blessing-data';
import { createBlessingRound, refreshBlessingOption, chooseBlessingOption,
	type BlessingRound, type BlessingFloor } from './blessing-selection';
import { createRoguePokemon, rebuildMember, rememberMove, initializeExperience, evolveMember } from './progression';
import { makeEncounterSet, randomEncounterIVs } from './encounter-sets';
import type { RogueRandom } from './biome-pools';
import { recordStarterTraits, recordStarterMoves } from './starter-traits';
import { ELITE_BOSS_FLOORS, fixedFloor } from './content';
import { convertSpiritItem } from './spirits';
import { drawGiftSpecies } from './gifts';
import { lowerToEligibleStage } from './evolution';
import { permanentMemberTypes, strongestDragon, memberStatTotal, strongestBlessingMember,
	TARGET_BLESSING_ABILITIES, POWER_CHOICE_ABILITIES, canGrantExtraAbility, dragonKingAbilityOptions } from '../../sim/rogue-blessing-permanent';
import { tonicItems } from './blessing-consumables';
import { blessingDisplay } from './blessing-text';
import { taskRewardTier } from '../../sim/rogue-blessing-data';
import type { RogueAccount, RogueCommand, RogueContent, RogueItem, RogueNode, RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
const baseDex = Dex.mod('gen9');
export const BLESSING_STARTERS = ['Bulbasaur', 'Charmander', 'Squirtle', 'Chikorita', 'Cyndaquil', 'Totodile',
	'Treecko', 'Torchic', 'Mudkip', 'Turtwig', 'Chimchar', 'Piplup', 'Snivy', 'Tepig', 'Oshawott',
	'Chespin', 'Fennekin', 'Froakie', 'Rowlet', 'Litten', 'Popplio', 'Grookey', 'Scorbunny', 'Sobble',
	'Sprigatito', 'Fuecoco', 'Quaxly'];
export const isStarterFamily = (name: string) => BLESSING_STARTERS.includes(rogueStarterSpecies(name).name);
const swords = ['cobalion', 'virizion', 'terrakion'];
const regis = ['Regirock', 'Regice', 'Registeel', 'Regieleki', 'Regidrago'];
const regiTypes = ['Rock', 'Ice', 'Steel', 'Electric', 'Dragon'];
function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export interface BlessingReward {
	id: string; title: string; kind: 'gift' | 'toolbox' | 'target' | 'starter' | 'ability' | 'tera' | 'stone' | 'system';
	pokemon?: RoguePokemon; options?: string[]; blessing?: string;
	ability?: string;
}
export interface RogueBlessings extends BlessingEffects {
	version: 1; levels: number; bossLevels?: number; round?: BlessingRound;
	/** Only new adventures opt in; never insert an opening round into an existing save. */
	beforeAdventure?: boolean;
	prayer?: { floor: BlessingFloor, changed: boolean, team: string[] };
	pending: BlessingReward[]; completed: number[]; settled: string[]; defeated: string[];
	caught: string[]; nextJoin: number; afterFloor?: boolean;
	stage?: { kind: 'direction' | 'upgrade', options: string[] };
	evolutionCosts?: number[];
	/** Fighting receives its ten-floor upgrade before the milestone direction change. */
	evolutionResetPending?: boolean;
	shards: number; candy: number; swordUses: number; swordRewards: string[];
	/** Intrinsic Meltan progress; retained here for compatibility with existing saves. */
	candyDefeated?: string[];
	regis: string[]; regiBoss?: boolean; regiReward?: boolean;
	wishStar?: boolean; pandoraFloor?: number;
	bondBattles: string[];
	psychicLosses?: string[];
	negativeEvents?: string[];
	itemGifts?: number;
	teraShards?: Record<string, number>;
	rewardedCaptures?: string[];
	learnedMembers?: string[];
	beforeGym?: boolean;
}
export const ROGUE_SYSTEM_NAMES: Record<string, string> = { mega: '超进化', gmega: '超巨进化', z: 'Z 招式', tera: '太晶化' };
export function grantSystem(run: RogueRun, system: string, title: string) {
	requireRule(Object.prototype.hasOwnProperty.call(ROGUE_SYSTEM_NAMES, system), '系统类型无效。');
	const state = normalizeBlessings(run);
	if (system === 'mega') run.megaUnlocked = true;
	if (system === 'gmega') {
		run.gmegaUnlocked = true;
		give(run, 'gmegawishingstar');
		(run.notices ||= []).push('超巨进化已解锁，获得超巨进化许愿星 ×1。准备好队伍后再进入战斗。');
		return;
	}
	if (system === 'z') run.zUnlocked = true;
	if (system === 'tera') run.teraUnlocked = true;
	state.pending.push({ id: randomUUID(), title,
		kind: system === 'tera' ? 'tera' : 'stone', options: system === 'tera' ? Object.keys(BLESSING_TYPES) :
		dex.items.all().filter(item => system === 'mega' ? !!item.megaStone && item.id !== 'gmegawishingstar' : !!item.zMove).map(item => item.id) });
}
export function gymSystemGift(run: RogueRun) {
	const state = normalizeBlessings(run);
	const options = Object.keys(ROGUE_SYSTEM_NAMES).filter(id => !run[`${id}Unlocked` as 'megaUnlocked' | 'gmegaUnlocked' | 'zUnlocked' | 'teraUnlocked']);
	run.gymGiftReceived = true;
	if (options.length) {
		state.beforeGym = true;
		state.pending.push({ id: randomUUID(), title: '馆主的赠礼 · 选择解锁一种系统', kind: 'system', options });
		run.phase = 'blessing';
	} else { run.phase = 'ready'; run.notices = ['四种系统均已解锁，馆主期待与你的对战。']; }
}
export function normalizeBlessings(run: RogueRun) {
	const state = run.blessings ||= { version: 1, owned: [], levels: 0, pending: [], completed: [], settled: [],
		defeated: [], caught: [], nextJoin: 0, shards: 0, candy: 0, swordUses: 0, swordRewards: [], regis: [], bondBattles: [] };
	// Preserve already-paid costs in old saves; only later selections use the new split costs.
	state.bossLevels ??= state.levels;
	// Checkpoints own their own inventory. Migrating one must not duplicate items in another.
	for (const inventory of [run, run.checkpoint].filter(Boolean)) {
		for (const mon of [...inventory.team, ...(inventory.box || []), ...(inventory === run ?
			[run.pendingCapture, ...state.pending.map(reward => reward.pokemon)].filter((m): m is RoguePokemon => !!m) : [])]) {
			const oldEmblem = toID(mon.set.item);
			if (!emblemType(oldEmblem)) continue;
			if (mon.emblem) inventory.bag[oldEmblem] = (inventory.bag[oldEmblem] || 0) + 1;
			else mon.emblem = oldEmblem;
			mon.set.item = '';
		}
	}
	for (const mon of [...run.team, ...(run.box || [])]) {
		if (!ownsBlessing(state, 'insight')) delete mon.insight;
		if (mon.joinOrder === undefined) mon.joinOrder = state.nextJoin++;
		if (!state.caught.includes(toID(mon.set.species))) state.caught.push(toID(mon.set.species));
	}
	if (state.prayer && (state.prayer.team.length !== run.team.length ||
		run.team.some(mon => !state.prayer!.team.includes(mon.id)))) state.prayer.changed = true;
	// Old unclaimed all-moves rewards become the new per-member learning entitlement.
	state.pending = state.pending.filter(reward => !(reward.kind === 'target' && reward.blessing === 'learnall'));
	for (const entry of state.owned) if (entry.family === 'friend') { entry.id = 'friend'; delete entry.type; }
	// Paid historical first/second stars remain paid after changing the thresholds.
	for (const entry of state.owned) if (entry.family === 'starquest') {
		entry.milestones = [...new Set((entry.milestones || []).map(count => count === 30 ? 10 : count === 60 ? 90 : count))];
		const mon = [...run.team, ...(run.box || [])].find(member => member.id === entry.target);
		if (mon) for (const count of [10, 90, 180]) if ((entry.progress || 0) >= count && !entry.milestones.includes(count)) {
			entry.milestones.push(count); mon.stars = Math.min(5, (mon.stars || 1) + 1); rebuildMember(mon, run.boosts);
		}
	}
	for (const option of state.round?.options || []) if (blessing(option.id)?.family === 'friend') option.id = 'friend';
	if (run.previousBlessings) run.previousBlessings = run.previousBlessings.map(id => blessing(id)?.id || id);
	for (const reward of state.pending) {
		if (reward.kind === 'gift' && reward.pokemon) {
			const mon = reward.pokemon, species = lowerToEligibleStage(mon.set.species, mon.set.level);
			if (species !== mon.set.species) {
				const set = makeEncounterSet(species, mon.set.level, mon.set.ivs);
				set.nature = mon.set.nature; set.gender = mon.set.gender; set.shiny = mon.set.shiny;
				set.happiness = mon.set.happiness;
				reward.pokemon = createRoguePokemon(set, run.boosts, mon.id, mon.stars || 1);
				reward.pokemon.joinOrder = mon.joinOrder;
				initializeExperience(reward.pokemon);
			}
		}
		const ability = reward.ability || TARGET_BLESSING_ABILITIES[blessing(reward.blessing || '')?.family || ''];
		if (reward.kind === 'target' && ability) {
			reward.options = run.team.filter(mon => canGrantExtraAbility(mon, ability, run.team, state)).map(mon => mon.id);
		} else if (reward.kind === 'ability') {
			reward.options = POWER_CHOICE_ABILITIES.filter(id => run.team.some(mon => canGrantExtraAbility(mon, id, run.team, state)));
		} else continue;
		// A pre-update reward may have no eligible recipient. Let the player close it without a dead end.
		if (!reward.options.length) reward.options = ['skip'];
	}
	return state;
}
const legalMoveCache = new Map<string, string[]>();
export function blessingLearnChoices(mon: RoguePokemon) {
	const species = dex.species.get(mon.set.species);
	if (!legalMoveCache.has(species.id)) {
		const validator = new TeamValidator(new Format({ ...Dex.formats.get('gen9nationaldex'),
			name: 'Rogue Move Unlock', mod: 'gen9fantasy' }));
		legalMoveCache.set(species.id, dex.moves.all().filter(move => move.exists && !move.isZ && !move.isMax &&
			move.id !== 'struggle' && !validator.checkCanLearn(move, species, undefined, { level: 100 })).map(move => move.id));
	}
	const known = new Set([...mon.moveMemory?.map(move => move.id) || [], ...mon.set.moves.map(toID), ...mon.blessingMoves || []]);
	return legalMoveCache.get(species.id)!.filter(id => !known.has(id));
}
export function fantasyForm(name: string): string | undefined {
	const species = dex.species.get(name);
	const direct = dex.species.get(`${species.name}-Fantasy`);
	return direct.exists && !direct.battleOnly ? direct.name : undefined;
}
export function futureFantasy(name: string, seen = new Set<string>()): boolean {
	const species = baseDex.species.get(name);
	if (seen.has(species.id)) return false;
	seen.add(species.id);
	return !!fantasyForm(name) || species.evos.some(next => futureFantasy(next, seen));
}
export function blessingMemberTypes(mon: RoguePokemon) {
	return permanentMemberTypes(mon);
}
export function strongestMember(team: RoguePokemon[], baseSpecies: string) {
	return strongestBlessingMember(team, baseSpecies);
}
export function blessingCandidates(run: RogueRun, content: RogueContent) {
	const state = normalizeBlessings(run);
	const has = (id: string) => ownsBlessing(state, id);
	return ROGUE_BLESSINGS.filter(def => {
		if (state.owned.some(entry => entry.id === def.id)) return false;
		if (def.floors && !def.floors.includes(run.floor)) return false;
		if (def.emblem && state.owned.some(entry => blessing(entry.id)?.emblem)) return false;
		if (def.family === 'coin' && run.spirit === 'zygardeorder') return false;
		if (def.family === 'pandorasilver' && has('pandoragold') || def.family === 'pandoragold' && has('pandorasilver')) return false;
		if (['singer', 'dancer'].includes(def.family) && (!strongestMember(run.team, 'Meloetta') ||
			has(def.family === 'singer' ? 'dancer' : 'singer'))) return false;
		if (def.family === 'swords' && !run.team.some(mon => swords.includes(toID(dex.species.get(mon.set.species).baseSpecies)))) return false;
		if (def.family === 'topclearmind' && (!state.prayer || state.prayer.changed)) return false;
		if (def.family === 'typeevolution' && !giftPool(run, content, def.type).length) return false;
		if (def.family === 'friend' && !giftPool(run, content, def.type, true).length) return false;
		if (def.family === 'overtime' && !overtimeGiftPool(run, content, def.type!).length) return false;
		if (TARGET_BLESSING_ABILITIES[def.family] && !run.team.some(mon =>
			canGrantExtraAbility(mon, TARGET_BLESSING_ABILITIES[def.family], run.team, state))) return false;
		if (def.family === 'powerchoice' && !run.team.some(mon =>
			POWER_CHOICE_ABILITIES.some(ability => canGrantExtraAbility(mon, ability, run.team, state)))) return false;
		return true;
	}).map(def => {
		let weight = run.previousBlessings?.includes(def.id) ? 40 : 100;
		weight *= companionAppearance(def.family, run.team);
		if (def.family === 'bond') weight *= Math.min(6, run.team.filter(mon => mon.initialPartner).length || run.team.length) / 6;
		return { ...def, appearanceWeight: Math.max(1, Math.round(weight)) };
	});
}
function giftPool(run: RogueRun, content: RogueContent, type?: string, uncaught = false, fantasy = false) {
	const level = run.floor === 1 ? 5 : Math.max(3, Math.min(100, Math.ceil(run.floor / 2)));
    return baseDex.species.all().filter(species => lowerToEligibleStage(species.name, level) === species.name && species.exists && species.num > 0 && !species.battleOnly &&
		!species.isMega && !species.isPrimal && (!species.forme || /Alola|Galar|Hisui|Paldea/.test(species.forme)) &&
		content.unlocks[species.id] && (!type || species.types.includes(type)) &&
		(!uncaught || !run.blessings?.caught.includes(species.id)) && (!fantasy || futureFantasy(species.name)));
}
export { OVERTIME_ABILITIES };
const overtimePoolCache = new Map<string, string[]>();
export function overtimeGiftPool(run: RogueRun, content: RogueContent, effect: string) {
	const level = run.floor === 1 ? 5 : Math.min(100, Math.ceil(run.floor / 2));
	const key = `${effect}:${level}`;
	if (!overtimePoolCache.has(key)) {
		const validator = new TeamValidator(new Format({ ...Dex.formats.get('gen9nationaldex'), name: 'Rogue setter', mod: 'gen9fantasy' }));
		const ability = OVERTIME_ABILITIES[effect];
		overtimePoolCache.set(key, baseDex.species.all().filter(s => s.exists && s.num > 0 && !s.battleOnly &&
			!s.isMega && !s.isPrimal && (!s.forme || /Alola|Galar|Hisui|Paldea/.test(s.forme)) &&
			lowerToEligibleStage(s.name, level) === s.name && (ability ?
				Object.values(dex.species.get(s.name).abilities).some(a => toID(a) === ability) :
				['tailwind', 'trickroom'].includes(effect) && !validator.checkCanLearn(dex.moves.get(effect), dex.species.get(s.name), undefined, { level })))
			.map(s => s.name));
	}
	return overtimePoolCache.get(key)!.filter(name => content.unlocks[toID(name)]);
}
export function drawBlessingGift(run: RogueRun, content: RogueContent, random: RogueRandom,
	options: { type?: string, uncaught?: boolean, fantasy?: boolean, species?: string, pool?: string[], eligibleStage?: boolean,
		stars?: number, level?: number, perfect?: number, strong?: boolean, } = {}) {
	const level = options.level || (run.floor === 1 ? 5 : Math.max(3, Math.min(100, Math.ceil(run.floor / 2))));
	let name = options.species && lowerToEligibleStage(options.species, level);
	if (!name) {
		let pool = options.pool || giftPool(run, content, options.type, options.uncaught, options.fantasy).map(s => s.name);
		pool = [...new Set(pool.map(s => lowerToEligibleStage(s, level)))].filter(s =>
			(!options.type || dex.species.get(s).types.includes(options.type)) &&
			(!options.uncaught || !run.blessings?.caught.includes(toID(s))));
		requireRule(pool.length, '当前等级没有符合条件的赠送伙伴。');
		name = drawGiftSpecies(pool, run.startCard, random, options.strong);
	}
	const ivs = randomEncounterIVs(random);
	const stats = [...ROGUE_STATS];
	for (let i = 0; i < (options.perfect || 0); i++) ivs[stats.splice(random(stats.length), 1)[0]] = 31;
	const set = makeEncounterSet(name, level, ivs);
	const species = dex.species.get(name), natures = dex.natures.all();
	set.nature = natures[random(natures.length)].name;
	set.gender = species.gender || (random(256) < species.genderRatio.F * 256 ? 'F' : 'M');
	const abilities = Object.values(species.abilities).filter(Boolean);
	set.ability = abilities[random(abilities.length)];
	set.shiny = random(1000) < (run.spirit === 'hooh' ? 20 : 2) + (!options.species && run.startCard === 'all' ? 1 : 0);
	set.happiness = 70;
	const mon = createRoguePokemon(set, run.boosts, randomUUID(), options.stars || 1);
	mon.joinOrder = normalizeBlessings(run).nextJoin++;
	initializeExperience(mon);
	return mon;
}
/** A granted gift counts once even when the player declines the party slot. */
export function recordBlessingGift(account: RogueAccount, run: RogueRun, content: RogueContent, mon: RoguePokemon) {
	if (run.caught.includes(mon.id)) return;
	const rule = content.unlocks[toID(mon.set.species)] || content.unlocks[toID(dex.species.get(mon.set.species).baseSpecies)];
	requireRule(rule, '赠送伙伴缺少捕获统计映射。');
	run.caught.push(mon.id);
	const state = normalizeBlessings(run);
	if (!state.caught.includes(toID(mon.set.species))) state.caught.push(toID(mon.set.species));
	account.caughtSpecies ||= [];
	if (!account.caughtSpecies.includes(toID(mon.set.species))) account.caughtSpecies.push(toID(mon.set.species));
	account.captures[rule.starter] = (account.captures[rule.starter] || 0) + 1;
	if (account.captures[rule.starter] >= rule.captures && !account.unlocked.includes(rule.starter)) account.unlocked.push(rule.starter);
	recordStarterTraits(account, content, mon.set, true);
	recordStarterMoves(account, content, mon.set);
}
function give(run: RogueRun, item: string, count = 1) { run.bag[item] = (run.bag[item] || 0) + count; }
export function giveEquipment(run: RogueRun, content: RogueContent, random: RogueRandom, item: string, count = 1) {
	for (let i = 0; i < count; i++) {
		const state = run.blessings!;
		const serial = state.itemGifts = (state.itemGifts || 0) + 1;
		const next = convertSpiritItem(run, content, item, `blessing-item:${serial}`, random);
		give(run, next);
		if (next !== item) (run.notices ||= []).push(`梦幻的奇赠：${dex.items.get(item).name}变为了${dex.items.get(next).name}。`);
	}
}
export function gift(account: RogueAccount, run: RogueRun, content: RogueContent, mon: RoguePokemon, title: string) {
	recordBlessingGift(account, run, content, mon);
	run.blessings!.pending.push({ id: randomUUID(), title, kind: 'gift', pokemon: mon });
}
const commonEquipment: string[] = ['leftovers', 'lifeorb', 'focussash', 'assaultvest', 'rockyhelmet', 'choiceband', 'choicespecs',
	'choicescarf', 'heavydutyboots', 'expertbelt', 'eviolite', 'scopelens', 'wide lens'].map(toID);
const boosters = ['silkscarf', 'charcoal', 'mysticwater', 'miracleseed', 'magnet', 'nevermeltice', 'blackbelt',
	'poisonbarb', 'softsand', 'sharpbeak', 'twistedspoon', 'silverpowder', 'hardstone', 'spelltag', 'dragonfang', 'blackglasses', 'metalcoat', 'fairyfeather'];
const gems: string[] = Object.keys(BLESSING_TYPES).map(type => toID(type + ' Gem')).filter(id => dex.items.get(id).exists);
const evolutionEquipment = new Set(dex.species.all().flatMap(species =>
	[species.evoItem, ...species.requiredItems || []].filter(Boolean).map(toID)));
const battleEquipment = dex.items.all().filter(item => !item.isNonstandard && !item.megaStone && !item.zMove &&
	!item.onPlate && !item.onMemory && !item.onDrive && !evolutionEquipment.has(item.id) &&
	Object.keys(item).some(key => key.startsWith('on') && typeof (item as any)[key] === 'function')).map(item => item.id);
export function equipmentCategory(id: string): string | undefined {
	if (emblemType(id)) return '属性转';
	if (FANTASY_BLESSING_ITEMS.includes(id)) return '幻想道具';
	if (dex.items.get(id).isBerry) return '树果';
	if (gems.includes(id)) return '属性宝石';
	if (boosters.includes(id)) return '属性增强';
	if (commonEquipment.includes(id) || battleEquipment.includes(id as ID)) return '对战装备';
}
function categoryPool(category: string) {
	if (category === '属性转') return Object.keys(BLESSING_TYPES).map(type => EMBLEM_PREFIX + type.toLowerCase());
	if (category === '幻想道具') return FANTASY_BLESSING_ITEMS.filter(id => equipmentCategory(id) === category);
	if (category === '树果') return dex.items.all().filter(item => item.isBerry && !item.isNonstandard).map(item => item.id);
	if (category === '属性宝石') return gems;
	if (category === '属性增强') return boosters.filter(id => dex.items.get(id).exists);
	return [...new Set([...commonEquipment, ...battleEquipment])].filter(id => equipmentCategory(id) === category);
}
export function toolbox(run: RogueRun, random: RogueRandom, advanced = false) {
	const choices: string[] = [];
	const draw = (pool: string[]) => { const available = pool.filter(id => !choices.includes(id)); choices.push(available[random(available.length)]); };
	draw(commonEquipment); draw(advanced ? commonEquipment : [...boosters, ...gems]);
	if (advanced) draw([...boosters, ...gems]);
	while (choices.length < 4) draw([...commonEquipment, ...boosters, ...gems].filter(id => dex.items.get(id).exists));
	run.blessings!.pending.push({ id: randomUUID(), kind: 'toolbox', title: (advanced ? '高级工具箱' : '工具箱') + ' · 选择一件装备', options: choices });
}
export function treasure(run: RogueRun, content: RogueContent, random: RogueRandom, extraBudget = 0) {
	const budget = treasureBudget(run.floor) + extraBudget;
	const pool = content.items.filter(item => ['heal', 'revive', 'cure', 'ether', 'ball', 'treasure', 'held'].includes(item.kind) &&
		(item.kind !== 'ball' || ['pokeball', 'greatball', 'ultraball'].includes(item.id)) &&
		(item.sellPrice || item.price) > 0).map(item => ({ id: item.id, value: item.sellPrice || item.price }));
	// Stable reward valuations, independent of shop prices and the merchant spirit.
	for (const item of dex.items.all()) if ((!item.isNonstandard && item.isBerry || item.megaStone) && !pool.some(p => p.id === item.id)) {
		pool.push({ id: item.id, value: item.megaStone ? 6000 : 600 });
	}
	let remaining = Math.floor(budget * (0.8 + random(401) / 1000));
	const groups = 3 + random(4), selected = new Set<string>();
	const cheapest = Math.min(...pool.map(item => item.value));
	for (let i = 0; i < groups; i++) {
		const available = pool.filter(item => !selected.has(item.id) && item.value <= remaining - cheapest * (groups - i - 1));
		if (!available.length) break;
		const item = available[random(available.length)];
		const count = Math.max(1, Math.floor(remaining / (groups - i) / item.value));
		giveEquipment(run, content, random, item.id, count); selected.add(item.id); remaining -= item.value * count;
	}
	if (remaining > 0) run.money += remaining;
	(run.notices ||= []).push('已打开【藏宝袋】，物资已收入背包。');
}

/** Called only by trusted event resolution, once for each saved negative outcome. */
export function recordNegativeBlessingEvent(run: RogueRun, event: string) {
	const state = run.blessings;
	if (!ownsBlessing(state, 'psychic') || !['event', 'adventure'].includes(run.node?.kind || '')) return;
	const key = `${run.floor}:${run.node!.id}:${event}`;
	if ((state!.negativeEvents ||= []).includes(key)) return;
	state!.negativeEvents.push(key);
	state!.psychic = addPsychicCharge(state!.psychic || 0, 25);
}
function taskReward(account: RogueAccount, run: RogueRun, content: RogueContent, entry: OwnedBlessing, random: RogueRandom) {
	const reward = taskRewardTier(entry.floor), stage = reward.stage;
	const outcome = random(6);
	if (outcome === 0) give(run, reward.candy, reward.candyCount);
	if (outcome === 1) treasure(run, content, random);
	if (outcome === 2) { toolbox(run, random, stage === 2); if (stage === 3) toolbox(run, random); }
	if (outcome === 3) { give(run, FANTASY_BLESSING_ITEMS[random(FANTASY_BLESSING_ITEMS.length)]); run.money += reward.itemCoins; }
	if (outcome === 4) run.blessings!.shards += reward.shards;
	if (outcome === 5) gift(account, run, content, drawBlessingGift(run, content, random,
		{ level: reward.level, perfect: stage >= 2 ? 2 : 1, strong: stage === 3 }), blessingTitle(entry));
	(run.notices ||= []).push(`${blessingTitle(entry)}：已完成 15 个区域，奖励已领取，此任务不会重复发放。`);
}
function convertFantasy(run: RogueRun, mon: RoguePokemon) {
	const next = fantasyForm(mon.set.species);
	if (!next) return false;
	const old = dex.species.get(mon.set.species), species = dex.species.get(next);
	if (ownsBlessing(run.blessings, 'kid') && toID(mon.set.item) === 'eviolite' && old.evos.length && !species.evos.length) return false;
	const slot = Object.keys(old.abilities).find(key => old.abilities[key as '0'] === mon.set.ability) || '0';
	mon.set.species = mon.set.name = species.name;
	mon.set.ability = species.abilities[slot as '0'] || species.abilities[0];
	rebuildMember(mon, run.boosts);
	(run.notices ||= []).push(`${old.name} 已幻想化为 ${species.name}。`);
	return true;
}
/** Recompute permissions and permanent display stats; never merge temporary permissions into moveMemory. */
export function syncBlessingParty(run: RogueRun) {
	const state = normalizeBlessings(run);
	const has = (id: string) => ownsBlessing(state, id);
	const meloetta = strongestMember(run.team, 'Meloetta'), melmetal = strongestMember(run.team, 'Melmetal');
	const duck = has('duck') && strongestMember(run.team, 'Psyduck|Golduck');
	const mouseMoves = has('mousefamily') && run.team.length === 6 && run.team.every(mon => inBlessingFamily(mon.set.species, ELECTRIC_MOUSE_FAMILY)) ?
		[...new Set(run.team.flatMap(mon => mon.moveMemory?.map(move => move.id) || mon.set.moves.map(toID)))] : [];
	for (const mon of [...run.team, ...(run.box || [])]) {
		const reserved = has('reservation');
		const oldMoves = mon.set.moves.join(',');
		if (reserved?.target === mon.id && run.floor >= 100 && !reserved.completed && convertFantasy(run, mon)) reserved.completed = true;
		const extra: string[] = [], type = emblemType(mon.emblem || '');
		if (run.team.includes(mon)) extra.push(...mouseMoves);
		if (type) extra.push(...EMBLEM_MOVES[type]);
		if (has('dancer') && meloetta?.id === mon.id) extra.push('victorydance');
		if (has('meltan') && melmetal?.id === mon.id) {
			extra.push('doubleironbash');
			if (dex.species.get(mon.set.species).forme.includes('Fantasy')) {
				extra.push('chargebeam');
				if (!state.wishStar) { give(run, 'gmegawishingstar'); state.wishStar = true; }
			}
		}
		mon.blessingPP ||= [];
		for (const pp of mon.pp) {
			if (mon.blessingMoves?.includes(pp.id) && !mon.moveMemory?.some(move => move.id === pp.id)) {
				const old = mon.blessingPP.find(move => move.id === pp.id);
				if (old) old.pp = pp.pp; else mon.blessingPP.push({ ...pp });
			}
		}
		const previous = mon.blessingMoves || [];
		mon.blessingMoves = [...new Set(extra)];
		mon.set.moves = mon.set.moves.filter(move => !previous.includes(toID(move)) || extra.includes(toID(move)) ||
			mon.moveMemory?.some(known => known.id === toID(move)));
		for (const move of extra) if (!mon.blessingPP.some(pp => pp.id === move)) {
			const data = dex.moves.get(move); mon.blessingPP.push({ id: move, pp: data.pp, maxpp: data.pp });
		}
		if (!mon.set.moves.length) mon.set.moves = [mon.moveMemory?.[0]?.id || 'struggle'];
		const modifiers = { ...(mon.mintNature ? { nature: mon.mintNature } : {}), emblem: mon.emblem,
			...(growthModifiers(run, mon) ? { training: growthModifiers(run, mon) } : {}),
			smallFinal: !!has('smallfinal'), swap: !!has('swapstats'), hp: mon.bonusHP || 0,
			...(duck && duck.id === mon.id ? { baseStats: { spa: 20, spe: 20 }, extraType: 'Psychic' } : {}),
			stats: { ...state.evolution?.stats }, ...(state.evolution ? { statsType: state.evolution.type } : {}) };
		if (oldMoves !== mon.set.moves.join(',') || JSON.stringify(mon.statModifiers) !== JSON.stringify(modifiers)) {
			mon.statModifiers = modifiers; rebuildMember(mon, run.boosts);
		}
	}
	if (has('dragonking')) {
		const king = strongestDragon(run.team);
		if (!king) delete state.dragonKing;
		else if (state.dragonKing?.member !== king.id) state.dragonKing = { member: king.id };
		if (king && state.dragonKing?.ability && !dragonKingAbilityOptions(king, run.team, state).includes(state.dragonKing.ability)) {
			delete state.dragonKing.ability;
		}
	}
	syncCompanions(state, run.team);
}
export function beginBlessingFloor(run: RogueRun, random: RogueRandom) {
	const state = normalizeBlessings(run);
	if ((ownsBlessing(state, 'pandorasilver') || ownsBlessing(state, 'pandoragold')) && state.pandoraFloor !== run.floor) {
		state.pandoraFloor = run.floor;
		const bag: Record<string, number> = {};
		for (const [id, count] of Object.entries(run.bag)) {
			const category = equipmentCategory(id), pool = category && categoryPool(category);
			for (let n = 0; n < count; n++) { const next = pool ? pool[random(pool.length)] : id; bag[next] = (bag[next] || 0) + 1; }
		}
		run.bag = bag;
	}
	syncBlessingParty(run);
}
export function prepareOpeningBlessings(run: RogueRun, content: RogueContent, random: RogueRandom) {
	const state = run.blessings;
	if (!state?.beforeAdventure || run.floor !== 1) return false;
	state.round ||= createBlessingRound({ floor: 1, spirit: run.spirit }, blessingCandidates(run, content), random);
	run.phase = 'blessing';
	return true;
}
export function blessingRouteTemplates(run: RogueRun, templates: RogueNode[]) {
	if (fixedFloor(run.floor)) return templates;
	const state = run.blessings;
	const result = structuredClone(templates);
	const required: string[] = [];
	for (const [family, kind] of [['battletask', 'wild'], ['eventtask', 'event']]) {
		if (!ownsBlessing(state, family)) continue;
		required.push(kind);
		if (result.some(node => node.kind === kind)) continue;
		const index = result.findIndex(node => !required.includes(node.kind));
		if (index < 0) continue;
		result[index] = { id: `blessing-${kind}`, name: kind === 'wild' ? '战斗区域' : '旅行者的补给', kind: kind as 'wild' | 'event',
			encounters: [], reward: { money: 0, items: kind === 'event' ? { potion: 2, pokeball: 2 } : {} } };
	}
	return result;
}
export function prepareBlessingEncounter(run: RogueRun, random: RogueRandom) {
	const state = run.blessings, node = run.node;
	if (!state || !node || node.blessingPrepared) return;
	node.blessingPrepared = true;
	if (ownsBlessing(state, 'regis') && node.kind === 'elite' && state.regis.length < 5) {
		const pool = regis.filter(name => !state.regis.includes(name));
		const name = pool[random(pool.length)];
		node.encounters = [{ name, style: 'aggressive', catchable: true,
			team: [makeEncounterSet(name, node.biome?.level || Math.min(100, Math.ceil(run.floor / 2) + 5), randomEncounterIVs(random, true))] }];
	}
	if (ownsBlessing(state, 'regis') && state.regis.length === 5 && !state.regiBoss && ELITE_BOSS_FLOORS.has(run.floor)) {
		state.regiBoss = true;
		const set = makeEncounterSet('Regigigas', Math.min(100, Math.ceil(run.floor / 2) + 5), 31);
		Object.assign(set, { species: 'Regigigas-Fantasy', name: 'Regigigas-Fantasy', ability: 'chuanshuodejuren', nature: 'Jolly', evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
			moves: ['crushgrip', 'trailblaze', 'woodhammer', 'kingsshield'] });
		node.name = '传说的巨人 · 雷吉奇卡斯';
		node.encounters = [{ name: node.name, style: 'aggressive', catchable: false, team: [set] }];
		node.regiBoss = true;
	}
	for (const encounter of node.encounters) {
		const levels = node.kind === 'boss' ? state.bossLevels ?? state.levels : state.levels;
		encounter.blessingLevels = levels;
		for (const set of encounter.team) set.level += levels;
	}
}
function evolutionOptions(run: RogueRun, random: RogueRandom): string[] {
	const evo = run.blessings!.evolution!;
	const immune = (attack: string, defense: string) => run.spirit !== 'malamar' && !dex.getImmunity(attack, defense);
	const effectiveness = (attack: string, defense: string) => run.spirit === 'malamar' ?
		(!dex.getImmunity(attack, defense) ? 1 : -dex.getEffectiveness(attack, defense)) : dex.getEffectiveness(attack, defense);
	const sample = (pool: string[], count: number) => {
		const result: string[] = [];
		while (pool.length && result.length < count) result.push(pool.splice(random(pool.length), 1)[0]);
		return result;
	};
	if (evo.direction === 'stats') return sample(ROGUE_STATS.map(stat => 'stat:' + stat), 3);
	if (evo.direction === 'resistance') {
		let pool = Object.keys(BLESSING_TYPES).filter(type => effectiveness(type, evo.type) + (evo.defense[type] || 0) > 0);
		if (!pool.length) pool = Object.keys(BLESSING_TYPES).filter(type => !immune(type, evo.type) &&
			effectiveness(type, evo.type) + (evo.defense[type] || 0) >= 0);
		return sample(pool.map(type => 'defense:' + type), 3);
	}
	let targets = Object.keys(BLESSING_TYPES).filter(type => !immune(evo.type, type) &&
		effectiveness(evo.type, type) + (evo.offense[type] || 0) < 0);
	if (!targets.length) targets = Object.keys(BLESSING_TYPES).filter(type => immune(evo.type, type) && !evo.offense[type]);
	if (!targets.length) targets = Object.keys(BLESSING_TYPES).filter(type =>
		effectiveness(evo.type, type) + (evo.offense[type] || 0) - (immune(evo.type, type) ? 1 : 0) < 1);
	const extras = Object.keys(TYPE_EVOLUTION_EXTRAS).filter(id => !evo.extras.includes(id));
	return [...sample(targets.map(type => 'offense:' + type), 1), 'power', ...sample(extras.map(id => 'extra:' + id), 1)];
}
function prepareEvolutionUpgrade(run: RogueRun, random: RogueRandom) {
	const state = run.blessings!, options = evolutionOptions(run, random);
	state.stage = options.length ? { kind: 'upgrade', options } : { kind: 'direction', options: ['moves', 'stats'] };
	if (!options.length) (run.notices ||= []).push('抗性方向已全部强化，改选招式或数值方向后仍可领取本次强化。');
}
export function completeBlessingFloor(account: RogueAccount, run: RogueRun, content: RogueContent, random: RogueRandom) {
	const state = normalizeBlessings(run);
	if (state.completed.includes(run.floor)) return;
	state.completed.push(run.floor);
	const reserved = ownsBlessing(state, 'reservation');
	if (reserved && !reserved.completed && run.floor >= 100 && reserved.reservedShards) {
		state.shards += reserved.reservedShards;
		reserved.completed = true;
		(run.notices ||= []).push(`预定幻想：返还提前幻想化使用的 ${reserved.reservedShards} 幻想碎片。`);
	}
	for (const entry of state.owned) if (!entry.completed && run.floor >= 100 &&
		['reservemega', 'reservegmega', 'reservetera', 'reservez'].includes(entry.family)) {
		entry.completed = true;
		grantSystem(run, entry.family.slice('reserve'.length), blessing(entry.id)!.name + ' · 领取奖励');
	}
	const kind = run.node?.kind;
	if (ownsBlessing(state, 'psychic') && ['event', 'adventure'].includes(kind || '')) {
		state.psychic = addPsychicCharge(state.psychic || 0, 8);
	}
	for (const entry of state.owned) if (!entry.completed && ((entry.family === 'battletask' && kind === 'wild') ||
		(entry.family === 'eventtask' && kind === 'event'))) {
		entry.progress = (entry.progress || 0) + 1;
		const reward = taskRewardTier(entry.floor);
		if (entry.progress === 5) {
			run.money += reward.coins;
			(run.notices ||= []).push(`${blessingTitle(entry)}：完成 5 个区域，获得 ${reward.coins} 金币。`);
		}
		if (entry.progress === 10) {
			give(run, reward.candy, reward.milestoneCandy);
			(run.notices ||= []).push(`${blessingTitle(entry)}：完成 10 个区域，获得经验糖果 ${reward.candy.slice(8).toUpperCase()} ×${reward.milestoneCandy}。`);
		}
		if (entry.progress === 15) { entry.completed = true; taskReward(account, run, content, entry, random); }
	}
	for (const mon of run.team) {
		if (!(ownsBlessing(state, 'bond') && mon.initialPartner || ownsBlessing(state, 'starters') && isStarterFamily(mon.set.species))) continue;
		if (mon.hp && mon.bondReady) mon.bond = Math.min(100, (mon.bond || 0) +
			(ownsBlessing(state, 'bond') && mon.initialPartner ? 10 : 3) +
			(state.bondBattles.includes(mon.id) || ['event', 'adventure'].includes(kind || '') ? 1 : 0));
		mon.bondReady = (mon.set.happiness || 0) >= 255;
	}
	state.bondBattles = [];
	if (ELITE_BOSS_FLOORS.has(run.floor)) state.shards += 10;
	const trainer = run.node?.encounters[0]?.trainer;
	if (trainer && ((trainer.role === 'gym' && run.floor >= 100) || ['elitefour', 'champion'].includes(trainer.role))) state.shards += 25;
	if (state.evolution && run.floor % 10 === 0 && run.floor >= 10 && run.floor <= 200) {
		if ([50, 100, 150].includes(run.floor)) {
			const paid = state.evolutionCosts ||= [];
			if (!paid.includes(run.floor)) {
				state.bossLevels! += blessingLevelCost('prismatic', run.floor, true);
				state.levels += blessingLevelCost('prismatic', run.floor);
				paid.push(run.floor);
			}
			if (state.evolution.type === 'Fighting') {
				state.evolutionResetPending = true;
				prepareEvolutionUpgrade(run, random);
			} else state.stage = { kind: 'direction', options: ['resistance', 'moves', 'stats'] };
		} else prepareEvolutionUpgrade(run, random);
	} else if ([50, 100, 150].includes(run.floor)) {
		state.round = createBlessingRound({ floor: run.floor as BlessingFloor, spirit: run.spirit,
			prayerFloor: state.prayer?.floor, prayerPartyChanged: state.prayer?.changed }, blessingCandidates(run, content), random);
	}
	syncBlessingParty(run);
}
function grantBlessing(account: RogueAccount, run: RogueRun, content: RogueContent, def: BlessingDefinition, random: RogueRandom, grantedBy?: string) {
	const state = run.blessings!;
	const entry: OwnedBlessing = { id: def.id, family: def.family, tier: def.tier, floor: run.floor, type: def.type, grantedBy };
	state.owned.push(entry);
	if (def.family === 'companionbea') grantCompanion(run, 'bea');
	if (def.family === 'companionacerola') grantCompanion(run, 'acerola');
	if (def.family === 'companionlana') grantCompanion(run, 'lana');
	const lateReward = lateBlessingReward(def.family, run.floor);
	if (lateReward.treasure) treasure(run, content, random);
	for (let i = 0; i < lateReward.toolboxes; i++) toolbox(run, random, lateReward.advanced);
	if (!grantedBy) {
		state.bossLevels = (state.bossLevels ?? state.levels) + blessingLevelCost(def.tier, run.floor, true);
		state.levels += blessingLevelCost(def.tier, run.floor);
	}
	if (def.family.startsWith('fate')) {
		const candidates = blessingCandidates(run, content).filter(candidate => candidate.tier === def.tier && !candidate.family.startsWith('fate'));
		const families = [...new Set(candidates.map(candidate => candidate.family))];
		requireRule(families.length, '当前没有可赠送的同品质祝福。');
		const family = families[random(families.length)], variants = candidates.filter(candidate => candidate.family === family);
		const received = variants[random(variants.length)];
		grantBlessing(account, run, content, received, random, def.id);
		const coins = ({ silver: 800, gold: 1000, prismatic: 1200 })[def.tier] * Math.max(1, blessingStage(run.floor));
		run.money += coins;
		(run.notices ||= []).push(`${def.name}：获得${received.name}及 ${coins} 金币，赠送祝福不额外加级。`);
	}
	if (def.family === 'psychic') state.psychic = 0;
	if (def.family === 'insight') give(run, 'maxrevive', 10);
	if (def.family === 'overtime') {
		const mon = drawBlessingGift(run, content, random, { pool: overtimeGiftPool(run, content, def.type!) });
		const ability = OVERTIME_ABILITIES[def.type!];
		if (ability) mon.set.ability = dex.abilities.get(ability).name;
		else {
			rememberMove(mon, def.type!);
			mon.set.moves = [def.type!, ...mon.set.moves.filter(move => toID(move) !== def.type)].slice(0, 4);
		}
		rebuildMember(mon, run.boosts);
		gift(account, run, content, mon, def.name);
	}
	if (def.family === 'wine' || def.family === 'cephalosporin') give(run, `rogue${def.family}`);
	if (def.family === 'renewable') {
		const pool = [...gems, 'focussash', 'whiteherb', 'mentalherb', 'powerherb', 'sitrusberry', 'lumberry', 'weaknesspolicy'];
		giveEquipment(run, content, random, pool[random(pool.length)]);
	}
	if (def.family === 'mousefamily') {
		const pool = dex.species.all().filter(species => species.exists && !species.battleOnly && !species.isMega &&
			inBlessingFamily(species.name, ELECTRIC_MOUSE_FAMILY) && content.unlocks[species.id]);
		gift(account, run, content, drawBlessingGift(run, content, random, { pool: pool.map(species => species.name) }), def.name);
	}
	if (def.family === 'eeveefamily') {
		gift(account, run, content, drawBlessingGift(run, content, random, { species: 'Eevee' }), def.name);
		state.pending.push({ id: randomUUID(), title: '伊布大家族 · 选择一颗进化石', kind: 'stone',
			options: ['firestone', 'waterstone', 'thunderstone', 'leafstone', 'icestone'] });
	}
	if (def.family === 'fantasysix') state.shards += 200;
	if (def.family === 'powerchoice') state.pending.push({ id: randomUUID(), kind: 'ability', title: def.name,
		blessing: def.id, options: POWER_CHOICE_ABILITIES.filter(ability => run.team.some(mon => canGrantExtraAbility(mon, ability, run.team, state))) });
	if (def.family === 'duck' || def.family === 'hero') gift(account, run, content,
		drawBlessingGift(run, content, random, def.family === 'hero' ? { stars: 3 } :
		{ species: Math.ceil(run.floor / 2) >= 33 ? 'Golduck' : 'Psyduck' }), def.name);
	if (def.emblem && def.type) give(run, EMBLEM_PREFIX + def.type.toLowerCase());
	if (def.family === 'money' || def.family === 'bigmoney') run.money += blessingCoins(def.family, run.floor);
	if (['reservation', 'reservemega', 'reservegmega', 'reservetera', 'reservez'].includes(def.family)) run.money += 500;
	if (def.family === 'kid') giveEquipment(run, content, random, 'eviolite');
	if (def.family === 'pandoragold') {
		toolbox(run, random); toolbox(run, random);
		giveEquipment(run, content, random, FANTASY_BLESSING_ITEMS[random(FANTASY_BLESSING_ITEMS.length)]);
	}
	if (def.family === 'secondchoice') for (const id of ['choiceband', 'choicespecs', 'choicescarf']) giveEquipment(run, content, random, id);
	if (def.family === 'prayer') state.prayer = { floor: run.floor as BlessingFloor, changed: false, team: run.team.map(mon => mon.id) };
	if (def.family === 'typeevolution') {
		state.evolution = { type: def.type!, direction: 'stats', defense: {}, offense: {}, stats: {}, power: 0, extras: [] };
		state.stage = { kind: 'direction', options: ['resistance', 'moves', 'stats'] };
		gift(account, run, content, drawBlessingGift(run, content, random, { type: def.type }), def.name);
	}
	if (['friend', 'starquest', 'slacker', 'meltan', 'hoopa'].includes(def.family)) {
		const mon = drawBlessingGift(run, content, random, { type: def.type, uncaught: def.family === 'friend',
			stars: def.family === 'friend' ? 2 : 1, species: ({ slacker: 'Slaking', meltan: 'Meltan', hoopa: 'Hoopa' } as Record<string, string>)[def.family] });
		if (def.family === 'starquest') {
			entry.target = mon.id; entry.progress = 0; entry.milestones = [];
		}
		gift(account, run, content, mon, def.name);
	}
	if (def.target) {
		if (def.target === 'fantasy' && !run.team.some(mon => futureFantasy(mon.set.species))) {
			const mon = drawBlessingGift(run, content, random, { fantasy: true }); entry.target = mon.id;
			gift(account, run, content, mon, def.name);
		} else state.pending.push({ id: randomUUID(), title: def.name, kind: def.target === 'starter' ? 'starter' : 'target', blessing: def.id,
			options: def.target === 'starter' ? BLESSING_STARTERS : run.team.filter(mon =>
				(def.target !== 'fantasy' || futureFantasy(mon.set.species)) && (!TARGET_BLESSING_ABILITIES[def.family] ||
				canGrantExtraAbility(mon, TARGET_BLESSING_ABILITIES[def.family], run.team, state))).map(mon => mon.id) });
	}
	if (def.family === 'bond' || def.family === 'starters') for (const mon of run.team) {
		if (def.family === 'bond' ? mon.initialPartner : isStarterFamily(mon.set.species)) {
			mon.bond ??= 0; mon.bondReady = (mon.set.happiness || 0) >= 255;
		}
	}
	syncBlessingParty(run);
}
export function handleBlessingCommand(account: RogueAccount, run: RogueRun, content: RogueContent, command: RogueCommand, random: RogueRandom) {
	const state = normalizeBlessings(run);
	if (command.action === 'learnbonus') {
		const mon = run.team.find(member => member.id === command.member);
		requireRule(['choose', 'ready', 'rest', 'reward'].includes(run.phase) && ownsBlessing(state, 'learnall') && mon &&
			!state.learnedMembers?.includes(mon.id), '该伙伴当前没有可领取的祝福学习机会。');
		requireRule(blessingLearnChoices(mon).includes(command.value!), '请选择该伙伴合法可学且尚未掌握的招式。');
		rememberMove(mon, command.value!);
		(state.learnedMembers ||= []).push(mon.id);
		recordStarterMoves(account, content, { ...mon.set, moves: [command.value!] });
		run.notices = ['已学会新招式，可在队伍的招式栏自由装备。']; return;
	}
	if (command.action === 'settera') {
		requireRule(['choose', 'ready', 'rest', 'reward'].includes(run.phase) && run.teraUnlocked, '请在解锁太晶化后，于对战外调整太晶属性。');
		const mon = run.team.find(member => member.id === command.member), type = command.value!;
		requireRule(mon && Object.keys(BLESSING_TYPES).includes(type) && (state.teraShards?.[type] || 0) >= 50,
			'需要选择队员并拥有 50 片对应属性的太晶碎片。');
		requireRule(mon.set.teraType !== type, '该伙伴已经是这个太晶属性。');
		state.teraShards![type] -= 50; mon.set.teraType = type;
		run.notices = [`已消耗 50 片${BLESSING_TYPES[type]}太晶碎片，更改伙伴的太晶属性。`]; return;
	}
	if (command.action === 'exchangeshards') {
		requireRule(['choose', 'ready', 'rest', 'reward'].includes(run.phase) && ownsBlessing(state, 'fantasysix') &&
			run.team.length === 6 && run.team.every(mon => dex.species.get(mon.set.species).forme.includes('Fantasy')),
		'最终幻想6：需要六名在队伙伴全部为幻想宝可梦，且在对战外兑换。');
		const count = command.value === 'all' ? state.shards : Number(command.value);
		requireRule((command.value === 'all' || ['1', '10'].includes(command.value!)) &&
			Number.isSafeInteger(count) && count > 0 && state.shards >= count && Number.isSafeInteger(run.money + count * 150), '碎片数量不足或无效。');
		state.shards -= count; run.money += count * 150;
		run.notices = [`兑换 ${count} 幻想碎片，获得 ${count * 150} 金币。`]; return;
	}
	if (command.action === 'fantasize' || command.action === 'meltanevolve' || command.action === 'swordreward') {
		requireRule(['choose', 'ready', 'rest', 'reward'].includes(run.phase), '请在对战外完成当前结算后操作。');
		const mon = run.team.find(member => member.id === command.member);
		requireRule(mon?.hp, '请选择存活队员。');
		if (command.action === 'fantasize') {
			requireRule(state.shards >= 100 && fantasyForm(mon.set.species), '需要 100 幻想碎片及对应幻想形态。');
			requireRule(convertFantasy(run, mon), '进化奇石限制当前伙伴转换为最终形态。'); state.shards -= 100;
			const reserved = ownsBlessing(state, 'reservation');
			if (reserved?.target === mon.id && !reserved.completed && run.floor < 100) reserved.reservedShards = 100;
		} else if (command.action === 'meltanevolve') {
			requireRule(toID(mon.set.species) === 'meltan' && state.candy >= 400, '需要美录坦和 400 个糖果。');
			requireRule(!(ownsBlessing(state, 'kid') && toID(mon.set.item) === 'eviolite'), '小鬼当家限制携带进化奇石的伙伴进化为最终形态。');
			evolveMember(run, mon, 'Melmetal');
		} else {
			const species = toID(dex.species.get(mon.set.species).baseSpecies);
			requireRule(swords.includes(species) && !state.swordRewards.includes(species) &&
				state.swordUses >= (state.swordRewards.length + 1) * 15, '没有可领取的锋锐奖励。');
			requireRule(canGrantExtraAbility(mon, 'sharpness', run.team, state), '该伙伴已经拥有锋锐，不能重复赋予相同特性。');
			(mon.extraAbilities ||= []).push('sharpness'); state.swordRewards.push(species);
		}
		syncBlessingParty(run); return;
	}
	requireRule(run.phase === 'blessing', '当前没有待选择的祝福。');
	if (command.action === 'blessingrefresh') {
		requireRule(state.round && !state.pending.length && !state.stage, '请先处理当前奖励。');
		state.round = refreshBlessingOption(state.round, command.slot!, blessingCandidates(run, content), random); return;
	}
	if (command.action === 'blessing') {
		requireRule(!state.pending.length, '请先领取或安置当前奖励。');
		if (state.stage) {
			const id = command.value!; requireRule(state.stage.options.includes(id), '强化选项无效。');
			const evo = state.evolution!;
			if (state.stage.kind === 'direction') {
				evo.direction = id as typeof evo.direction;
				prepareEvolutionUpgrade(run, random);
			} else {
				const [kind, key] = id.split(':');
				if (kind === 'stat') evo.stats[key as StatID] = (evo.stats[key as StatID] || 0) + 0.15;
				if (kind === 'power') evo.power += 0.1;
				if (kind === 'extra') evo.extras.push(key);
				if (kind === 'defense') evo.defense[key] = (evo.defense[key] || 0) - 1;
				if (kind === 'offense') evo.offense[key] = (evo.offense[key] || 0) + 1;
				delete state.stage;
				if (state.evolutionResetPending) {
					delete state.evolutionResetPending;
					state.stage = { kind: 'direction', options: ['resistance', 'moves', 'stats'] };
				}
			}
		} else {
			requireRule(state.round, '没有可选择的祝福。');
			const next = chooseBlessingOption(state.round, command.slot!);
			const def = blessing(state.round.options[command.slot!].id)!;
			requireRule(blessingCandidates(run, content).some(candidate => candidate.id === def.id), '该祝福与已选内容冲突，请刷新该选项。');
			grantBlessing(account, run, content, def, random); state.round = next;
		}
	} else if (command.action === 'blessingreward') {
		const reward = state.pending[0]; requireRule(reward && reward.id === command.member, '这份奖励已处理或不存在。');
		if (reward.kind === 'gift') {
			const mon = reward.pokemon!;
			if (command.value !== 'release') {
				if (command.value === 'join' && run.team.length < roguePartyLimit(run.spirit)) run.team.push(mon);
				else if (command.value === 'box' && run.box && run.box.length < 30) run.box.push(mon);
				else {
					const index = run.team.findIndex(member => member.id === command.value);
					requireRule(index >= 0, '请选择加入、存入箱子、替换队员或放走。'); run.team[index] = mon;
				}
			}
		} else {
			requireRule(reward.options!.includes(command.value!), '奖励选项无效。');
			if (reward.kind === 'toolbox') giveEquipment(run, content, random, command.value!);
			if (reward.kind === 'stone') give(run, command.value!);
			if (reward.kind === 'system') grantSystem(run, command.value!, `${ROGUE_SYSTEM_NAMES[command.value!]}已解锁 · 选择配套道具`);
			if (reward.kind === 'tera') {
				state.teraShards ||= {};
				state.teraShards[command.value!] = (state.teraShards[command.value!] || 0) + 50;
			}
			if (reward.kind === 'starter') gift(account, run, content,
				drawBlessingGift(run, content, random, { species: command.value }), '最初的伙伴');
			if (reward.kind === 'ability' && command.value !== 'skip') state.pending.push({ id: randomUUID(), title: '选择获得额外特性的伙伴',
				kind: 'target', blessing: reward.blessing, ability: command.value,
				options: run.team.filter(mon => canGrantExtraAbility(mon, command.value!, run.team, state)).map(mon => mon.id) });
			if (reward.kind === 'target' && command.value !== 'skip') {
				const entry = state.owned.find(owned => owned.id === reward.blessing)!;
				const mon = run.team.find(member => member.id === command.value)!;
				const ability = reward.ability || TARGET_BLESSING_ABILITIES[entry.family];
				requireRule(mon && (!ability || canGrantExtraAbility(mon, ability, run.team, state)), '该伙伴已经拥有这个特性，不能重复赋予。');
				entry.target = mon.id;
				if (reward.ability) mon.extraAbilities = [...new Set([...mon.extraAbilities || [], reward.ability])];
			}
		}
		state.pending.shift();
	}
	if (state.round?.remaining === 0) delete state.round;
	syncBlessingParty(run);
	repairBlessingRound(run, content, random);
}
/** Also repairs saved offers after their floor restrictions or party requirements change. */
export function repairBlessingRound(run: RogueRun, content: RogueContent, random: RogueRandom) {
	const state = run.blessings;
	if (state?.round?.remaining) {
		const eligible = blessingCandidates(run, content);
		for (let i = 0; i < state.round.options.length; i++) {
			const option = state.round.options[i];
			if (option.chosen || eligible.some(candidate => candidate.id === option.id)) continue;
			const credits = option.refreshes; option.refreshes = 1;
			state.round = refreshBlessingOption(state.round, i, eligible, random);
			state.round.options[i].refreshes = credits;
		}
	}
}
export function settleBlessingBattle(account: RogueAccount, run: RogueRun, content: RogueContent, result: RogueBattleResult, random: RogueRandom, escaped = false) {
	const state = normalizeBlessings(run);
	if (ownsBlessing(state, 'capturebonus')) for (const captured of result.captures || (result.captured ? [result.captured] : [])) {
		const received = state.rewardedCaptures ||= [];
		if (received.includes(captured.id)) continue;
		received.push(captured.id);
		const stage = Math.min(4, Math.max(0, Math.floor((run.floor - 1) / 40)));
		const coins = 400 + stage * 150;
		const candy = candyAtFloor(run.floor);
		give(run, candy, run.floor < 40 ? 4 : 1);
		const pool = [['pokeball', 'potion'], ['greatball', 'superpotion'], ['greatball', 'superpotion', 'revive'],
			['ultraball', 'hyperpotion', 'elixir'], ['ultraball', 'hyperpotion', 'revive', 'elixir']][stage]
			.filter(id => content.items.some(item => item.id === id));
		const item = pool.length ? pool[random(pool.length)] : undefined;
		run.money += coins;
		if (item) give(run, item);
		(run.notices ||= []).push(`带资进组：获得 ${coins} 金币、经验糖果 ${candy.slice(8).toUpperCase()} ×${run.floor < 40 ? 4 : 1}${item ? '及 ' + content.items.find(entry => entry.id === item)!.name + ' ×1' : ''}。`);
	}
	// Captured partners are retained, but an escape commits no combat stacks or defeat ledgers.
	if (escaped || state.settled.includes(result.encounterId)) return;
	if (run.team.some(mon => toID(mon.set.species) === 'meltan')) {
		const received = state.candyDefeated ||= [];
		for (const [index, defeated] of (result.defeated || []).entries()) {
			const key = defeated.id || `${result.encounterId}:${index}`;
			if (received.includes(key)) continue;
			received.push(key);
			state.candy += dex.species.get(defeated.species).types.includes('Steel') ? 10 : 1;
		}
	}
	// Count permanent defeats once across real defeats and retries.
	for (const ko of result.blessingProgress?.kos || []) {
		if (state.defeated.includes(ko.id)) continue;
		state.defeated.push(ko.id);
		const mon = run.team.find(member => member.id === ko.member); if (!mon) continue;
		const star = ownsBlessing(state, 'starquest');
		if (star?.target === mon.id) {
			star.progress = (star.progress || 0) + 1;
			for (const count of [10, 90, 180]) if (star.progress >= count && !star.milestones!.includes(count)) {
				star.milestones!.push(count);
				if ((mon.stars || 1) < 5) mon.stars = (mon.stars || 1) + 1;
				rebuildMember(mon, run.boosts);
			}
		}
	}
	state.swordUses += result.blessingProgress?.swords || 0;
	for (const mon of run.team) {
		const insight = result.blessingProgress?.insight[mon.id];
		if (insight) mon.insight = { ...insight };
	}
	if (ownsBlessing(state, 'psychic') && result.blessingProgress) {
		state.psychic = result.blessingProgress.psychic ?? state.psychic ?? 0;
		state.psychicLosses = [...new Set([...(state.psychicLosses || []), ...(result.blessingProgress.psychicLosses || [])])];
	}
	if (!result.won) { syncBlessingParty(run); return; }
	state.settled.push(result.encounterId);
	for (const defeated of result.defeated || []) {
		for (const id of defeated.participants) if (!state.bondBattles.includes(id)) state.bondBattles.push(id);
		if (ownsBlessing(state, 'regis') && run.node?.kind === 'elite' && regis.includes(defeated.species) && !state.regis.includes(defeated.species)) {
			state.regis.push(defeated.species); give(run, EMBLEM_PREFIX + regiTypes[regis.indexOf(defeated.species)].toLowerCase());
		}
	}
	if (run.node?.regiBoss && !state.regiReward) {
		state.regiReward = true; state.shards += 50;
		treasure(run, content, random, 1000); toolbox(run, random, true);
		const mon = createRoguePokemon({ ...run.node.encounters[0].team[0],
			level: run.node.encounters[0].team[0].level - (run.node.encounters[0].blessingLevels || 0) }, run.boosts);
		initializeExperience(mon); ownsBlessing(state, 'regis')!.target = mon.id;
		gift(account, run, content, mon, '传说的巨人们');
	}
	const medic = ownsBlessing(state, 'medic');
	if (medic) for (const mon of run.team) if (mon.hp) {
		mon.hp = Math.min(mon.maxhp, mon.hp + Math.max(1, Math.floor(mon.maxhp * medicRecovery(medic.floor) / 100)));
		mon.status = ''; mon.statusState = {}; delete mon.statuses;
	}
	syncBlessingParty(run);
}
export function blessingExperience(run: RogueRun, mon: RoguePokemon, dragonKing = run.blessings?.dragonKing?.member) {
	const state = run.blessings; let multiplier = 1;
	const ordinary = ownsBlessing(state, 'ordinary');
	if (ordinary && run.team.every(member => dex.species.get(member.set.species).bst <= 500)) multiplier *= 1 + (Math.max(1, Math.floor(ordinary.floor / 50)) + 1) / 10;
	for (const entry of state?.owned || []) if (entry.family === 'typexp' && blessingMemberTypes(mon).includes(entry.type!)) multiplier *= 1.3;
	if (ownsBlessing(state, 'dragonking') && mon.id !== dragonKing) multiplier *= 1.3;
	return multiplier;
}
/** Stochastic rounding preserves the advertised expected quantity even for one-item drops. */
export function blessingLoot(run: RogueRun, loot: Record<string, number>, random: RogueRandom) {
	const entry = ownsBlessing(run.blessings, 'ordinary');
	if (!entry || !run.team.every(mon => dex.species.get(mon.set.species).bst <= 500)) return { ...loot };
	const bonus = (Math.max(1, Math.floor(entry.floor / 50)) + 1) / 10;
	return Object.fromEntries(Object.entries(loot).map(([id, count]) => {
		const extra = count * bonus, whole = Math.floor(extra);
		return [id, count + whole + (random(1000) < Math.round((extra - whole) * 1000) ? 1 : 0)];
	}));
}
export function blessingItems(discovered = false): RogueItem[] {
	return [...Object.entries(BLESSING_TYPES).map(([type, name]): RogueItem => ({ id: EMBLEM_PREFIX + type.toLowerCase(),
		name: `${name}属性转`, kind: 'emblem', price: 0, shopFloor: false, icon: toID(type + 'gem'),
		description: emblemDescription(type) })), ...tonicItems(discovered)];
}
export function blessingView(run: RogueRun, discovered = false) {
	const state = run.blessings; if (!state) return undefined;
	const describe = (id: string, floor = run.floor) => {
		const def = blessing(id)!;
		return { ...blessingDisplay(def, floor, discovered),
			levelCost: { normal: blessingLevelCost(def.tier, floor), boss: blessingLevelCost(def.tier, floor, true) } };
	};
	const king = run.team.find(mon => mon.id === state.dragonKing?.member);
	return { ...state, dragonKing: king && { ...state.dragonKing!, species: king.set.species, total: memberStatTotal(king),
		options: dragonKingAbilityOptions(king, run.team, state) },
		learning: ownsBlessing(state, 'learnall') ? run.team.filter(mon => !state.learnedMembers?.includes(mon.id))
		.map(mon => ({ member: mon.id, moves: blessingLearnChoices(mon) })) : [],
	owned: state.owned.map(entry => ({ ...entry, ...describe(entry.id, entry.floor),
		targetName: [...run.team, ...(run.box || [])].find(mon => mon.id === entry.target)?.set.species })),
	round: state.round && { ...state.round, options: state.round.options.map(option => ({ ...option, ...describe(option.id) })) },
	stage: state.stage && { ...state.stage, options: state.stage.options.map(id => ({ id, name: upgradeName(id) })) },
	pending: state.pending.map(reward => ({ ...reward, options: reward.options?.map(id => ({ id,
		name: id === 'skip' ? '队伍已具备这些特性，无需重复赋予，继续冒险' : reward.kind === 'system' ? ROGUE_SYSTEM_NAMES[id] + (state.owned.some(entry => entry.family === `reserve${id}` && !entry.completed) ? '（已预定：战后也会解锁）' : '') :
		reward.kind === 'tera' ? BLESSING_TYPES[id] + '太晶碎片 ×50' :
		reward.kind === 'stone' ? dex.items.get(id).name :
		reward.kind === 'ability' ? id === 'hugepower' ? '大力士：攻击 ×2' : '大法师：特攻 ×2' :
		reward.kind === 'target' ? run.team.find(mon => mon.id === id)?.set.species :
		reward.kind === 'toolbox' ? blessingItems().find(item => item.id === id)?.name || dex.items.get(id).name : id })) })) };
}
function upgradeName(id: string) {
	const [kind, key] = id.split(':');
	if (kind === 'power') return '本属性招式威力 +10%';
	if (kind === 'extra') return TYPE_EVOLUTION_EXTRAS[key];
	if (kind === 'stat') return `${({ hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' } as Record<string, string>)[key]} +15%`;
	if (kind === 'offense') return `对${BLESSING_TYPES[key]}属性打击面强化`;
	if (kind === 'defense') return `对${BLESSING_TYPES[key]}属性抗性强化`;
	return ({ resistance: '抗性进化', moves: '招式进化', stats: '数值进化' } as Record<string, string>)[id];
}
