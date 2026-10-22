import type { RoguePokemon } from '../../sim/fantasy-rogue';
import { experienceAtLevel, levelAtExperience, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { createRoguePokemon, rebuildMember } from './progression';
import type { RogueRun, RogueCommand } from './types';
import type { RogueRandom } from './biome-pools';

/** Basis points, added before multiplication: 100 = 1%. All values are run-local. */
export interface RogueGrowth { offense: number; defense: number; experience: number }
export type GrowthKind = keyof RogueGrowth;
export type PersonalGrowthKind = 'offense' | 'defense' | 'balanced';
export const GROWTH_LIMITS: RogueGrowth = { offense: 12000, defense: 12000, experience: 4000 };
export const PERSONAL_GROWTH_LIMIT = 6000;
export const JOURNEY_GROWTH_START = 40;
/** Preserve the first 80 floors; reinforce the two difficult late-game stretches. */
export const journeyGrowthAmount = (floor: number) => floor < 40 ? 0 : floor <= 80 ? 115 : floor <= 100 ? 175 : floor <= 140 ? 200 : 225;
export const personalRewardGrowth = (floor: number) => floor <= 80 ? 600 : floor <= 100 ? 900 : floor <= 140 ? 1000 : 1100;
export const growthPercent = (amount: number) => `${Number((amount / 100).toFixed(2))}%`;
export const growthStage = (floor: number) => floor < 100 ? 0 : floor < 150 ? 1 : 2;
export const trainingStats = (kind: PersonalGrowthKind): StatIDExceptHP[] =>
	kind === 'offense' ? ['atk', 'spa'] : kind === 'defense' ? ['def', 'spd'] : ['atk', 'spa', 'def', 'spd'];

export function growthModifiers(run: Pick<RogueRun, 'growth'>, mon: RoguePokemon) {
	const offense = (run.growth?.offense || 0) + (mon.training?.offense || 0) + (mon.mushroomTraining?.offense || 0);
	const defense = (run.growth?.defense || 0) + (mon.training?.defense || 0) + (mon.mushroomTraining?.defense || 0);
	const camp = mon.campTraining || {};
	return offense || defense || Object.values(camp).some(Boolean) ? {
		atk: (offense + (camp.atk || 0)) / 10000, spa: (offense + (camp.spa || 0)) / 10000,
		def: (defense + (camp.def || 0)) / 10000, spd: (defense + (camp.spd || 0)) / 10000,
		spe: (camp.spe || 0) / 10000 } : undefined;
}

/** Also used in content packs without blessings. Rebuild never heals damage or restores PP. */
export function syncGrowthParty(run: RogueRun) {
	for (const mon of [...run.team, ...(run.box || [])]) {
		const training = growthModifiers(run, mon);
		if (JSON.stringify(mon.statModifiers?.training) === JSON.stringify(training)) continue;
		mon.statModifiers = { ...mon.statModifiers, training };
		rebuildMember(mon, run.boosts);
	}
}

export function availableGrowth(run: RogueRun, kind: GrowthKind, amount: number) {
	if (run.floor < JOURNEY_GROWTH_START && kind !== 'experience') return 0;
	return Math.max(0, Math.min(amount, GROWTH_LIMITS[kind] - (run.growth?.[kind] || 0)));
}
export function grantGrowth(run: RogueRun, kind: GrowthKind, amount: number) {
	const granted = availableGrowth(run, kind, amount);
	if (!granted) return 0;
	run.growth ||= { offense: 0, defense: 0, experience: 0 };
	run.growth[kind] += granted;
	syncGrowthParty(run);
	return granted;
}

/** Additive rewards: never substitute existing money, candies, items or chosen training. */
export function grantJourneyGrowth(run: RogueRun, random: RogueRandom) {
	const node = run.node, event = node?.event;
	if (!node || node.journeyGrowthResolved || run.postgame || node.companionLoss || run.floor < JOURNEY_GROWTH_START) return;
	const successfulEvent = event?.settled && (event.journeyBattleWon ||
		!event.trainingAidBlocked && event.journeyBattleWon !== false);
	const eligible = event ? successfulEvent && node.kind !== 'trade' :
		['elite', 'trainer', 'reward'].includes(node.kind);
	if (!eligible) return;
	node.journeyGrowthResolved = true;
	const chance = run.floor < 50 ? 30 : run.floor < 80 ? 35 : run.floor < 150 ? 45 : 50;
	if (random(100) >= chance) return;
	const ledger = run.journeyGrowth ||= { offense: 0, defense: 0 };
	const cap = run.floor <= 80 ? 2000 : 3500;
	const choices = (['offense', 'defense'] as const).filter(kind =>
		ledger[kind] < cap && availableGrowth(run, kind, 1));
	if (!choices.length) return;
	const kind = choices[random(choices.length)];
	const amount = grantGrowth(run, kind, Math.min(cap - ledger[kind],
		journeyGrowthAmount(run.floor)));
	ledger[kind] += amount;
	const source = node.kind === 'reward' ? '补给后的训练心得' : node.kind === 'elite' ? '精英历练' :
		node.kind === 'trainer' ? '切磋心得' : '旅途心得';
	const text = `【${source}】额外获得全队本局${kind === 'offense' ? '攻击、特攻' : '防御、特防'} +${growthPercent(amount)}；后来加入的伙伴同样生效。`;
	(run.notices ||= []).push(text);
	if (event?.result) event.result.push(text);
	if (run.lastReward?.floor === run.floor) run.lastReward.effect = [run.lastReward.effect, text].filter(Boolean).join(' ');
}

/** Compare actual rounded stats, including existing boosts/nature/stars; EXP need not reach a level. */
export function personalGrowthAmount(run: RogueRun, mon: RoguePokemon, kind: PersonalGrowthKind,
	nominal: number, experience: number) {
	if (mon.fixedLevel || run.floor < JOURNEY_GROWTH_START) return 0;
	const keys = kind === 'balanced' ? ['offense', 'defense'] as const : [kind];
	const limit = Math.min(nominal, ...keys.map(key => PERSONAL_GROWTH_LIMIT - (mon.training?.[key] || 0)));
	if (limit <= 0) return 0;
	const growth = rogueSpeciesData(mon.set.species).growth;
	const currentExperience = mon.experience ?? experienceAtLevel(growth, mon.set.level);
	const level = Math.max(mon.set.level, levelAtExperience(growth, currentExperience + experience));
	const modifiers = { ...mon.statModifiers, training: growthModifiers(run, mon) };
	const afterEXP = createRoguePokemon({ ...mon.set, level }, run.boosts, mon.id, mon.stars, modifiers).stats!;
	const stats = trainingStats(kind);
	// Monotone integer search avoids an unchecked approximation near a stat rounding boundary.
	let lo = 0, hi = Math.floor(limit);
	while (lo < hi) {
		const amount = Math.ceil((lo + hi) / 2);
		const personal = { ...mon, training: { ...mon.training } };
		for (const key of keys) personal.training[key] = (personal.training[key] || 0) + amount;
		const trained = createRoguePokemon(mon.set, run.boosts, mon.id, mon.stars,
			{ ...modifiers, training: growthModifiers(run, personal) }).stats!;
		if (stats.every(stat => trained[stat] <= afterEXP[stat])) lo = amount; else hi = amount - 1;
	}
	return lo;
}

export function grantPersonalGrowth(run: RogueRun, mon: RoguePokemon, kind: PersonalGrowthKind, amount: number) {
	if (run.floor < JOURNEY_GROWTH_START) return;
	mon.training ||= {};
	for (const key of kind === 'balanced' ? ['offense', 'defense'] as const : [kind]) {
		mon.training[key] = Math.min(PERSONAL_GROWTH_LIMIT, (mon.training[key] || 0) + amount);
	}
	syncGrowthParty(run);
}

export const CAMP_STATS: StatIDExceptHP[] = ['atk', 'def', 'spa', 'spd', 'spe'];
export const CAMP_TIERS = [
	{ id: 'junior', name: '助理训练员', amount: 300, price: 150 },
	{ id: 'expert', name: '资深训练员', amount: 800, price: 300 },
	{ id: 'master', name: '王牌训练员', amount: 1500, price: 450 },
];
export function growthOffers(run: RogueRun) {
	if (run.floor < 51 || run.node?.trade?.kind !== 'growth') return [];
	const claimed = run.node.trade.trainingClaimed || run.node.trade.purchases > 0;
	return CAMP_TIERS.map(tier => ({ ...tier,
		price: Math.round(tier.price * [1, 1.3, 1.6][growthStage(run.floor)] / 10) * 10,
		remaining: claimed ? 0 : 1,
		text: `每位伙伴每项能力本局永久 +${growthPercent(tier.amount)}；个人各项训练上限 60%。` }));
}
export function buyGrowth(run: RogueRun, command: RogueCommand) {
	if (run.phase !== 'rest' || run.node?.kind !== 'trade' || run.node.trade?.kind !== 'growth') throw new Error('请在训练营安排训练。');
	const offer = growthOffers(run).find(entry => entry.id === command.value);
	if (!offer?.remaining) throw new Error('本营地的训练已完成，或训练员无效。');
	const ids = command.trainingMembers, stats = command.trainingStats;
	if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
		!Array.isArray(stats) || !stats.length || new Set(stats).size !== stats.length || !stats.every(s => CAMP_STATS.includes(s))) {
		throw new Error('请选择至少一位伙伴与至少一项训练，不可重复选择。');
	}
	const members = ids.map(id => run.team.find(p => p.id === id && !p.egg && !p.fusion));
	if (members.some(p => !p)) throw new Error('只能训练队内已孵化且未融合的伙伴。');
	if (members.some(p => stats.some(s => (p!.campTraining?.[s] || 0) >= PERSONAL_GROWTH_LIMIT))) throw new Error('所选项目已有伙伴达到上限，请取消该项目或伙伴。');
	const price = offer.price * ids.length * stats.length;
	if (run.money < price) throw new Error(`本次训练需要 ${price} 金币，余额不足。`);
	run.money -= price;
	for (const mon of members) for (const stat of stats) {
		mon!.campTraining ||= {};
		mon!.campTraining[stat] = Math.min(PERSONAL_GROWTH_LIMIT, (mon!.campTraining[stat] || 0) + offer.amount);
	}
	run.node.trade.trainingClaimed = true; run.node.trade.purchases++;
	syncGrowthParty(run);
	run.notices = [`${offer.name}完成了 ${ids.length} 位伙伴的 ${stats.length} 项训练，花费 ${price} 金币；每项本局永久提升 ${growthPercent(offer.amount)}，接近上限时只提升至 60%。伙伴留在队伍中。`];
}

/** The successful mushroom branch replaces, rather than accompanies, the old temporary damage buff. */
export function grantMushroomGrowth(run: RogueRun) {
	if (run.floor < JOURNEY_GROWTH_START) return '伙伴们打起了精神，准备好继续旅行。';
	for (const mon of run.team) {
		const base = personalRewardGrowth(run.floor) / 2;
		const amount = Math.max(0, Math.min(base, PERSONAL_GROWTH_LIMIT - (mon.training?.offense || 0),
			PERSONAL_GROWTH_LIMIT - (mon.training?.defense || 0)));
		if (!amount) continue;
		grantPersonalGrowth(run, mon, 'balanced', amount);
		return `奇异活力留在了【${mon.set.species}】身上。本局双攻、双防各 +${growthPercent(amount)}。`;
	}
	return '伙伴们精神十足；它们目前的个人训练已经足够了。';
}

export function growthView(run: RogueRun) {
	return { offense: run.growth?.offense || 0, defense: run.growth?.defense || 0,
		experience: run.growth?.experience || 0, limits: GROWTH_LIMITS,
		mushrooms: run.team.filter(mon => mon.mushroomTraining).map(mon =>
			({ member: mon.id, species: mon.set.species, ...mon.mushroomTraining })),
		personal: run.team.filter(mon => mon.training?.offense || mon.training?.defense).map(mon =>
			({ member: mon.id, species: mon.set.species, ...mon.training })) };
}
