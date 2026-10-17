import type { RoguePokemon } from '../../sim/fantasy-rogue';
import { experienceAtLevel, levelAtExperience, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { createRoguePokemon, rebuildMember } from './progression';
import type { RogueRun } from './types';

/** Basis points, added before multiplication: 100 = 1%. All values are run-local. */
export interface RogueGrowth { offense: number; defense: number; experience: number }
export type GrowthKind = keyof RogueGrowth;
export type PersonalGrowthKind = 'offense' | 'defense' | 'balanced';
export const GROWTH_LIMITS: RogueGrowth = { offense: 12000, defense: 12000, experience: 4000 };
export const PERSONAL_GROWTH_LIMIT = 6000;
export const growthPercent = (amount: number) => `${Number((amount / 100).toFixed(2))}%`;
export const growthStage = (floor: number) => floor < 100 ? 0 : floor < 150 ? 1 : 2;
export const trainingStats = (kind: PersonalGrowthKind): StatIDExceptHP[] =>
	kind === 'offense' ? ['atk', 'spa'] : kind === 'defense' ? ['def', 'spd'] : ['atk', 'spa', 'def', 'spd'];

export function growthModifiers(run: Pick<RogueRun, 'growth'>, mon: RoguePokemon) {
	const offense = (run.growth?.offense || 0) + (mon.training?.offense || 0);
	const defense = (run.growth?.defense || 0) + (mon.training?.defense || 0);
	return offense || defense ? { atk: offense / 10000, spa: offense / 10000,
		def: defense / 10000, spd: defense / 10000 } : undefined;
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

/** Compare actual rounded stats, including existing boosts/nature/stars; EXP need not reach a level. */
export function personalGrowthAmount(run: RogueRun, mon: RoguePokemon, kind: PersonalGrowthKind,
	nominal: number, experience: number) {
	if (mon.fixedLevel) return 0;
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
	mon.training ||= {};
	for (const key of kind === 'balanced' ? ['offense', 'defense'] as const : [kind]) {
		mon.training[key] = Math.min(PERSONAL_GROWTH_LIMIT, (mon.training[key] || 0) + amount);
	}
	syncGrowthParty(run);
}

export function growthOffers(run: RogueRun) {
	if (run.floor < 51 || run.node?.trade?.kind !== 'growth') return [];
	const stage = growthStage(run.floor), purchases = run.node.trade.services || {};
	return (['offense', 'defense', 'experience'] as const).map(kind => {
		const amount = kind === 'experience' ? 500 : 400;
		const price = (kind === 'experience' ? [1000, 1500, 2000] : [1600, 2400, 3200])[stage];
		const granted = availableGrowth(run, kind, amount);
		return { id: kind, name: kind === 'offense' ? '输出训练' : kind === 'defense' ? '耐久训练' : '经验心得',
			amount: granted, price,
			remaining: Math.max(0, (kind === 'experience' ? 1 : 2) - (purchases[kind] || 0)),
			text: kind === 'experience' ? `全队本局战斗经验 +${growthPercent(granted)}，不影响经验糖果。` :
			`全队本局${kind === 'offense' ? '攻击、特攻' : '防御、特防'} +${growthPercent(granted)}，后来加入的伙伴也有效。` };
	});
}

export function buyGrowth(run: RogueRun, id: string) {
	if (run.phase !== 'rest' || run.node?.kind !== 'trade' || run.node.trade?.kind !== 'growth') {
		throw new Error('请在训练营购买训练。');
	}
	const offer = growthOffers(run).find(entry => entry.id === id);
	if (!offer?.remaining || !offer.amount) throw new Error('该训练已售罄或达到本局上限。');
	if (run.money < offer.price) throw new Error('金币余额不足。');
	run.money -= offer.price;
	const trade = run.node.trade;
	trade.services ||= {};
	trade.services[offer.id] = (trade.services[offer.id] || 0) + 1;
	trade.purchases++;
	grantGrowth(run, offer.id, offer.amount);
	run.notices = [`完成${offer.name}，本局永久提升 ${growthPercent(offer.amount)}。`];
}

/** The successful mushroom branch replaces, rather than accompanies, the old temporary damage buff. */
export function grantMushroomGrowth(run: RogueRun) {
	const experience = Math.max(100, Math.round((200 + 0.6 * run.floor ** 2) / 100) * 100);
	for (const mon of run.team) {
		const amount = run.floor <= 50 ? personalGrowthAmount(run, mon, 'balanced', 200, experience) :
			Math.max(0, Math.min(200, PERSONAL_GROWTH_LIMIT - (mon.training?.offense || 0),
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
		personal: run.team.filter(mon => mon.training?.offense || mon.training?.defense).map(mon =>
			({ member: mon.id, species: mon.set.species, ...mon.training })) };
}
