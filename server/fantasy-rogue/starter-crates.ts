import { createHash } from 'crypto';
import { Dex, toID } from '../../sim/dex';
import { rogueCaptureCount, rogueStarterSpecies } from '../../sim/fantasy-rogue-rules';
import { echoChance } from '../../sim/rogue-echo';
import { starterTraits } from './starter-traits';
import { dailyCupSummary, dailyCupView, settleDailyCup, type CratePrediction } from './daily-crate-cup';
import type { RogueAccount, RogueContent } from './types';

export const CRATE_RULES = {
	cost: 10, targetPity: 10, legendaryPity: 90, targetedLegendaryPity: 180, shinyTargetPity: 180,
	legendaryPerMillion: 1000, shinyPerMillion: 2000, exchangeCost: 100,
} as const;
export interface CrateResult {
	id: string;
	species: string;
	legendary: boolean;
	shiny: boolean;
	nature: string;
	ability: string;
	gender: string;
	newUnlock: boolean;
	ivs?: number[];
	ivImproved?: boolean;
	refund?: number;
	guarantee?: 'target' | 'legendary' | 'targetedLegendary';
	shinyGuaranteed?: boolean;
}
export interface StarterCrates {
	version: 1 | 2;
	total: number;
	legendaryMisses: number;
	targetedMisses: number;
	/** Only draws with the shiny target selected advance or reset this counter. */
	shinyTargetMisses?: number;
	points: number;
	target: string;
	/** Separate evidence: opening a crate must never fabricate capture counts. */
	unlocked: string[];
	freeDraws?: number;
	predictions?: { [day: string]: CratePrediction };
	lastBatch?: { id: string, source: 'draw' | 'exchange', results: CrateResult[] };
}
interface CrateEntry { id: string; species: string; gen: number; types: string[]; legendary: boolean }
type Random = (max: number) => number;
const pools = new WeakMap<RogueContent, CrateEntry[]>();
const WEEK = 7 * 24 * 60 * 60 * 1000;
// Monday 00:00, Asia/Shanghai. Rotation is shared by all accounts and survives restarts.
const WEEK_ANCHOR = Date.UTC(2026, 10, 1, 16);

export function cratePool(content: RogueContent): readonly CrateEntry[] {
	let pool = pools.get(content);
	if (pool) return pool;
	const dex = Dex.mod('gen9');
	pool = [];
	const seen = new Set<string>();
	for (const starter of content.starters) {
		const species = dex.species.get(starter.set.species);
		if (!species.exists || species.prevo || species.battleOnly || species.isMega ||
			(species.isNonstandard && species.isNonstandard !== 'Past') ||
			toID(rogueStarterSpecies(species.name)) !== species.id || seen.has(starter.id)) continue;
		seen.add(starter.id);
		pool.push({ id: starter.id, species: species.name, gen: species.gen, types: species.types,
			legendary: rogueCaptureCount(species.name) === 10 });
	}
	pool.sort((a, b) => a.id.localeCompare(b.id));
	pools.set(content, pool);
	return pool;
}

export function emptyCrates(): StarterCrates {
	return { version: 2, total: 0, legendaryMisses: 0, targetedMisses: 0, points: 0, target: 'none', unlocked: [] };
}
export function crateSummary(account: RogueAccount) {
	const ledger = account.crates || emptyCrates();
	return { total: ledger.total, legendaryMisses: ledger.legendaryMisses, targetedMisses: ledger.targetedMisses,
		shinyTargetMisses: ledger.shinyTargetMisses || 0,
		points: ledger.points, target: ledger.target, lastBatch: ledger.lastBatch,
		freeDraws: ledger.freeDraws || 0, daily: dailyCupSummary(ledger) };
}

function targetPool(pool: readonly CrateEntry[], target: string) {
	if (target === 'none' || target === 'shiny') return [...pool];
	const match = /^(gen|type):([A-Za-z0-9]+)$/.exec(target);
	if (!match) throw new Error('每次只能选择一个世代、一种属性或闪光定向。');
	const entries = pool.filter(entry => (
		match[1] === 'gen' ? String(entry.gen) === match[2] : entry.types.includes(match[2])
	));
	if (!entries.length) throw new Error('当前定向没有可开箱的初始形态，请重新选择。');
	if (!entries.some(entry => entry.legendary)) throw new Error('当前定向没有传说伙伴，请更换定向后再开箱。');
	return entries;
}

export function crateWeekly(content: RogueContent, now = Date.now()) {
	const legends = cratePool(content).filter(entry => entry.legendary).map(entry => ({ ...entry,
		rank: createHash('sha256').update(`fantasy-starter-crates-v1:${entry.id}`).digest('hex'),
	})).sort((a, b) => a.rank.localeCompare(b.rank));
	const week = Math.max(0, Math.floor((now - WEEK_ANCHOR) / WEEK));
	const featured = legends.length < 2 ? legends.map(entry => entry.id) :
		[legends[(week * 2) % legends.length].id, legends[(week * 2 + 1) % legends.length].id];
	return { key: String(week), refreshAt: WEEK_ANCHOR + (week + 1) * WEEK, featured,
		catalog: legends.map((entry, index) => ({ id: entry.id, species: entry.species,
			seen: index < Math.min(legends.length, week * 2 + 2) })) };
}

export function crateView(account: RogueAccount, content: RogueContent, now = Date.now()) {
	const pool = cratePool(content);
	const weekly = crateWeekly(content, now);
	return { revision: account.revision, growthPoints: account.points, rules: CRATE_RULES,
		shinyPerMillion: Math.round(CRATE_RULES.shinyPerMillion * echoChance(account.echo?.upgrades.shiny)),
		ledger: crateSummary(account), daily: dailyCupView(account.crates, now),
		locked: false,
		generations: [...new Set(pool.map(entry => entry.gen))].sort((a, b) => a - b),
		types: [...new Set(pool.flatMap(entry => entry.types))].sort(),
		weekly: { ...weekly, catalog: weekly.catalog.map(entry => ({ ...entry,
			owned: account.unlocked.includes(entry.id) || !!content.starters.find(s => s.id === entry.id)?.availableInitially,
		})) } };
}

function grant(
	account: RogueAccount, content: RogueContent, ledger: StarterCrates,
	entry: CrateEntry, random: Random, duplicateBonus = false, forceShiny = false
): CrateResult {
	const dex = Dex.mod('gen9fantasy');
	const species = dex.species.get(entry.species);
	const natures = dex.natures.all();
	const abilities = [...new Set(Object.values(species.abilities))];
	const nature = natures[random(natures.length)].name;
	const ability = abilities[random(abilities.length)];
	const gender = species.gender || (random(1000) < species.genderRatio.F * 1000 ? 'F' : 'M');
	const shiny = random(1000000) <
		Math.round(CRATE_RULES.shinyPerMillion * echoChance(account.echo?.upgrades.shiny)) || forceShiny;
	const newUnlock = !account.unlocked.includes(entry.id) &&
		!content.starters.find(s => s.id === entry.id)?.availableInitially;
	if (!account.unlocked.includes(entry.id)) account.unlocked.push(entry.id);
	if (!ledger.unlocked.includes(entry.id)) ledger.unlocked.push(entry.id);
	const traits = starterTraits(account, entry.id);
	for (const [key, value] of [['natures', toID(nature)], ['abilities', toID(ability)], ['genders', gender]] as const) {
		if (!traits[key].includes(value)) traits[key].push(value);
	}
	if (shiny) traits.shiny = true;
	// Duplicate draws raise the permanent starter record, never the current adventure.
	const stats = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
	const refund = !newUnlock && duplicateBonus && stats.every(stat => traits.ivs.max[stat] >= 31) ? 2 : 0;
	let ivImproved = false;
	const ivs: number[] = [];
	for (const stat of stats) {
		const before = traits.ivs.max[stat];
		traits.ivs.min[stat] = Math.min(traits.ivs.min[stat], 15);
		traits.ivs.max[stat] = !newUnlock && duplicateBonus ?
			Math.max(before, Math.min(31, Math.max(15, before) + 1)) : Math.max(before, 15);
		ivImproved ||= !newUnlock && duplicateBonus && traits.ivs.max[stat] > before;
		ivs.push(traits.ivs.max[stat]);
	}
	(account.starterTraits ||= {})[entry.id] = traits;
	account.points += refund;
	return {
		id: entry.id, species: entry.species, legendary: entry.legendary,
		shiny, nature, ability, gender, newUnlock, ivs, ivImproved, refund,
	};
}

/** Called only inside RogueStore.change: spending, unlocks, pity and receipt commit together. */
export function openStarterCrates(account: RogueAccount, content: RogueContent, id: string, count: number,
	target: string, random: Random) {
	if (count !== 1 && count !== 10) throw new Error('请选择单次开箱或十连开箱。');
	const pool = cratePool(content);
	const targeted = targetPool(pool, target);
	const shinyTarget = target === 'shiny';
	const speciesTarget = target !== 'none' && !shinyTarget;
	const legends = pool.filter(entry => entry.legendary);
	if (!legends.length || !pool.some(entry => !entry.legendary)) throw new Error('开箱内容尚未配置完整。');
	const ledger = account.crates ||= emptyCrates();
	settleDailyCup(ledger);
	const free = Math.min(count, ledger.freeDraws || 0), cost = (count - free) * CRATE_RULES.cost;
	if (account.points < cost) throw new Error(`局外成长点数不足，需要 ${cost} 点。`);
	ledger.version = 2;
	ledger.freeDraws = (ledger.freeDraws || 0) - free;
	account.points -= cost;
	ledger.target = target;
	const results: CrateResult[] = [];
	for (let i = 0; i < count; i++) {
		ledger.total++;
		ledger.legendaryMisses++;
		ledger.targetedMisses = Math.min(CRATE_RULES.targetedLegendaryPity, ledger.targetedMisses + 1);
		if (shinyTarget) ledger.shinyTargetMisses = Math.min(CRATE_RULES.shinyTargetPity, (ledger.shinyTargetMisses || 0) + 1);
		const shinyDue = shinyTarget && (ledger.shinyTargetMisses || 0) >= CRATE_RULES.shinyTargetPity;
		const targetDue = speciesTarget && ledger.total % CRATE_RULES.targetPity === 0;
		const targetedLegendDue = speciesTarget && ledger.targetedMisses >= CRATE_RULES.targetedLegendaryPity;
		const legendDue = ledger.legendaryMisses >= CRATE_RULES.legendaryPity;
		const legendary = targetedLegendDue || legendDue || random(1000000) < CRATE_RULES.legendaryPerMillion;
		const candidates = (targetDue || targetedLegendDue ? targeted : pool).filter(entry => entry.legendary === legendary);
		if (!candidates.length) throw new Error('当前定向缺少对应品质的伙伴，请更换定向。');
		const entry = candidates[random(candidates.length)];
		const result = grant(account, content, ledger, entry, random, true, shinyDue);
		if (targetedLegendDue) result.guarantee = 'targetedLegendary';
		else if (legendDue) result.guarantee = 'legendary';
		else if (targetDue) result.guarantee = 'target';
		if (shinyDue) result.shinyGuaranteed = true;
		if (shinyTarget && result.shiny) ledger.shinyTargetMisses = 0;
		if (legendary) ledger.legendaryMisses = 0;
		if (legendary && speciesTarget && targeted.some(candidate => candidate.id === entry.id)) ledger.targetedMisses = 0;
		ledger.points++;
		results.push(result);
	}
	ledger.lastBatch = { id, source: 'draw', results };
}

export function exchangeStarterCrate(account: RogueAccount, content: RogueContent, id: string,
	value: string, random: Random, now = Date.now()) {
	const weekly = crateWeekly(content, now);
	const [week, species, extra] = value.split(':');
	if (extra !== undefined || week !== weekly.key || !weekly.featured.includes(species)) {
		throw new Error('每周兑换已更新或伙伴不在本周名单中，请刷新后重试。');
	}
	const ledger = account.crates;
	if (!ledger || ledger.points < CRATE_RULES.exchangeCost) throw new Error('定向开箱点数不足，需要 100 点。');
	const entry = cratePool(content).find(candidate => candidate.id === species && candidate.legendary)!;
	ledger.points -= CRATE_RULES.exchangeCost;
	ledger.lastBatch = { id, source: 'exchange', results: [grant(account, content, ledger, entry, random)] };
}
