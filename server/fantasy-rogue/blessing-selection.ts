/** Pure selection rules. The campaign persists the returned round before showing it to a player. */
export type BlessingTier = 'silver' | 'gold' | 'prismatic';
export type BlessingRoundTier = BlessingTier | 'mixed';
export type BlessingFloor = 1 | 50 | 100 | 150;
export type BlessingRandom = (max: number) => number;

export interface BlessingSelectionContext {
	floor: BlessingFloor;
	killlaReady?: boolean;
	spirit?: string;
	/** The floor on which Gathering Wishes was actually acquired, not the current floor. */
	prayerFloor?: BlessingFloor;
	/** Permanently set when members are replaced after acquiring Gathering Wishes. */
	prayerPartyChanged?: boolean;
}

export const NORMAL_BLESSING_WEIGHTS = { silver: 24, gold: 26, prismatic: 22, mixed: 28 } as const;
export const PRAYER_BLESSING_WEIGHTS = { silver: 20, gold: 60, prismatic: 10, mixed: 10 } as const;
const TIERS: BlessingTier[] = ['silver', 'gold', 'prismatic'];
const ROUND_TIERS: BlessingRoundTier[] = [...TIERS, 'mixed'];

/** Only the immediately following round benefits. Missing historical evidence never grants the perk. */
export function hasPrayerQualityBonus(context: BlessingSelectionContext) {
	return context.prayerFloor !== undefined && context.prayerFloor < 150 &&
		context.floor === (context.prayerFloor === 1 ? 50 : context.prayerFloor + 50) && context.prayerPartyChanged === false;
}

export function blessingQualityWeights(context: BlessingSelectionContext): Record<BlessingRoundTier, number> {
	// These identifiers are stable save IDs, independent of translated spirit names.
	const locked = context.spirit === 'terapagos' ? 'prismatic' :
		context.spirit === 'gholdengo' ? 'gold' : context.spirit === 'silvally' ? 'silver' :
		context.spirit === 'necrozma' ? 'mixed' : undefined;
	if (locked) return { silver: 0, gold: 0, prismatic: 0, mixed: 0, [locked]: 100 };
	// Two offered cards cannot represent all three tiers. Keep Jirachi's original quality rolls.
	if (context.spirit === 'jirachi') return context.killlaReady ? { silver: 32, gold: 28, prismatic: 40, mixed: 0 } : hasPrayerQualityBonus(context) ?
		{ silver: 25, gold: 60, prismatic: 15, mixed: 0 } : { silver: 40, gold: 35, prismatic: 25, mixed: 0 };
	return context.killlaReady ? { silver: 19, gold: 21, prismatic: 32, mixed: 28 } : { ...(hasPrayerQualityBonus(context) ? PRAYER_BLESSING_WEIGHTS : NORMAL_BLESSING_WEIGHTS) };
}

export function drawBlessingTier(context: BlessingSelectionContext, random: BlessingRandom): BlessingRoundTier {
	const weights = blessingQualityWeights(context);
	const locked = ROUND_TIERS.find(tier => weights[tier] === 100);
	if (locked) return locked;
	let roll = random(100);
	if (!Number.isInteger(roll) || roll < 0 || roll >= 100) throw new Error('祝福品质随机结果无效。');
	for (const tier of ROUND_TIERS) {
		roll -= weights[tier];
		if (roll < 0) return tier;
	}
	throw new Error('祝福品质权重无效。');
}

export function canOfferTopClearMind(context: BlessingSelectionContext) {
	return context.prayerFloor !== undefined && context.floor > context.prayerFloor &&
		context.prayerPartyChanged === false;
}

export function guaranteesTopClearMind(context: BlessingSelectionContext, tier: BlessingRoundTier) {
	return tier === 'gold' && hasPrayerQualityBonus(context);
}

export interface BlessingCandidate {
	id: string;
	family: string;
	tier: BlessingTier;
	/** A zero weight removes a candidate. Omitted means an ordinary family weight of 100. */
	weight?: number;
	/** Per-variant multiplier, in percent; multi-attribute families retain one family weight. */
	appearanceWeight?: number;
}

export interface BlessingRound {
	floor: BlessingFloor;
	tier: BlessingRoundTier;
	/** Older uniform rounds omitted the slot tier; use the saved round tier in that case. */
	options: { id: string, tier?: BlessingTier, refreshes: number, chosen: boolean }[];
	remaining: number;
	topClearMindEligible: boolean;
	/** Refreshed-away attribute evolutions must not return as another attribute. */
	familiesSeen: string[];
	/** Every card offered in this round, including cards discarded from other slots. */
	idsSeen?: string[];
}

export function blessingSlotTier(round: BlessingRound, slot: number): BlessingTier {
	const tier = round.options[slot]?.tier || (round.tier === 'mixed' ? TIERS[slot] : round.tier);
	if (!TIERS.includes(tier)) throw new Error('祝福位置的品质无效。');
	return tier;
}

function weighted<T>(entries: { value: T, weight: number }[], random: BlessingRandom): T {
	const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
	if (!total) throw new Error('没有符合条件的祝福选项。');
	let roll = random(total);
	if (!Number.isInteger(roll) || roll < 0 || roll >= total) throw new Error('祝福选项随机结果无效。');
	for (const entry of entries) {
		roll -= entry.weight;
		if (roll < 0) return entry.value;
	}
	throw new Error('祝福选项权重无效。');
}

/** Draw families first, so eighteen attribute variants do not receive eighteen times the weight. */
function drawCandidate(
	candidates: readonly BlessingCandidate[], round: BlessingRound, tier: BlessingTier,
	excluded: Set<string>, random: BlessingRandom
) {
	const groups = new Map<string, BlessingCandidate[]>();
	for (const candidate of candidates) {
		if (candidate.tier !== tier || excluded.has(candidate.id) || candidate.weight === 0) continue;
		if (candidate.id === 'topclearmind' && !round.topClearMindEligible) continue;
		if (candidate.family === 'typeevolution' && round.familiesSeen.includes(candidate.family)) continue;
		if (candidate.weight !== undefined && (!Number.isSafeInteger(candidate.weight) || candidate.weight < 0)) {
			throw new Error('祝福类别权重无效。');
		}
		if (candidate.appearanceWeight !== undefined && (!Number.isSafeInteger(candidate.appearanceWeight) || candidate.appearanceWeight < 1)) {
			throw new Error('祝福出现权重无效。');
		}
		const group = groups.get(candidate.family) || [];
		group.push(candidate);
		groups.set(candidate.family, group);
	}
	const family = weighted([...groups].map(([id, group]) => ({
		value: id,
		weight: Math.max(1, Math.round((group[0].weight ?? 100) * (round.familiesSeen.includes(id) ? 15 : 100) *
			group.reduce((sum, entry) => sum + (entry.appearanceWeight ?? 100), 0) / group.length / 100)),
	})), random);
	const pool = groups.get(family)!;
	const candidate = pool.every(entry => (entry.appearanceWeight ?? 100) === 100) ? pool[random(pool.length)] :
		weighted(pool.map(entry => ({ value: entry, weight: entry.appearanceWeight ?? 100 })), random);
	if (!candidate) throw new Error('祝福变体随机结果无效。');
	return candidate;
}

export function createBlessingRound(
	context: BlessingSelectionContext, candidates: readonly BlessingCandidate[], random: BlessingRandom,
	replacement?: { tier: BlessingRoundTier, previous: BlessingRound }
): BlessingRound {
	const round: BlessingRound = {
		floor: context.floor, tier: replacement?.tier ?? drawBlessingTier(context, random), options: [],
		remaining: context.spirit === 'jirachi' ? 2 : 1,
		familiesSeen: replacement?.previous.familiesSeen.slice() || [],
		idsSeen: replacement ? [...new Set([...(replacement.previous.idsSeen || []), ...replacement.previous.options.map(o => o.id)])] : [],
		topClearMindEligible: canOfferTopClearMind(context),
	};
	const count = context.spirit === 'jirachi' ? 2 : 3;
	const excluded = new Set<string>(round.idsSeen);
	for (let i = 0; i < count; i++) {
		const tier = blessingSlotTier(round, i);
		const guarantees = i === (round.tier === 'mixed' ? 1 : 0) && guaranteesTopClearMind(context, tier);
		const guaranteed = guarantees ?
			candidates.find(entry => entry.id === 'topclearmind' && entry.tier === tier && entry.weight !== 0) : undefined;
		if (guarantees && !guaranteed) {
			throw new Error('本轮祈愿所需的 Top Clear Mind 尚未配置。');
		}
		const awakening = context.killlaReady && tier === 'prismatic' && !round.options.some(o => o.id === 'killlagirl') ? candidates.find(c => c.id === 'killlagirl') : undefined;
		const candidate = awakening || guaranteed || drawCandidate(candidates, round, tier, excluded, random);
		excluded.add(candidate.id);
		round.idsSeen!.push(candidate.id);
		round.options.push({ id: candidate.id, tier,
			refreshes: awakening ? 0 : replacement ? replacement.previous.options[i].refreshes : context.spirit === 'victini' ? 2 : 1,
			chosen: false });
		round.familiesSeen.push(candidate.family);
	}
	return round;
}

export function fixedBlessingQuality(spirit?: string) {
	return ['terapagos', 'gholdengo', 'silvally', 'necrozma'].includes(spirit || '');
}
/** One campaign-level opportunity; callers persist its use only after this atomic draw succeeds. */
export function rerollBlessingQuality(
	saved: BlessingRound, context: BlessingSelectionContext, candidates: readonly BlessingCandidate[], random: BlessingRandom
) {
	if (fixedBlessingQuality(context.spirit)) throw new Error('本局塔灵已固定祝福品阶，不能更换。');
	if (!saved.remaining || saved.options.some(o => o.chosen)) throw new Error('请在本轮领取任何祝福前更换品阶。');
	const weights = blessingQualityWeights(context);
	const tier = weighted(ROUND_TIERS.filter(t => t !== saved.tier && weights[t] > 0)
		.map(t => ({ value: t, weight: weights[t] })), random);
	return createBlessingRound(context, candidates, random, { tier, previous: saved });
}

/** Returns a new value: a failed draw never consumes a saved refresh or mutates the original round. */
export function refreshBlessingOption(
	saved: BlessingRound, slot: number, candidates: readonly BlessingCandidate[], random: BlessingRandom
): BlessingRound {
	if (!Number.isInteger(slot) || slot < 0 || slot >= saved.options.length || !saved.remaining ||
		saved.options[slot].chosen || saved.options[slot].refreshes < 1) throw new Error('这个祝福位置不能刷新。');
	const round = structuredClone(saved);
	round.idsSeen = [...new Set([...(round.idsSeen || []), ...round.options.map(option => option.id)])];
	if (round.options[slot].id === 'killlagirl' && candidates.some(candidate => candidate.id === 'killlagirl')) {
		throw new Error('这项必定出现的祝福无需刷新。');
	}
	const next = drawCandidate(
		candidates, round, blessingSlotTier(round, slot), new Set(round.idsSeen), random
	);
	round.idsSeen.push(next.id);
	round.options[slot].id = next.id;
	round.options[slot].refreshes--;
	round.familiesSeen.push(next.family);
	return round;
}

export function chooseBlessingOption(saved: BlessingRound, slot: number): BlessingRound {
	if (!Number.isInteger(slot) || slot < 0 || slot >= saved.options.length || !saved.remaining ||
		saved.options[slot].chosen) throw new Error('这个祝福已经处理或不存在。');
	const round = structuredClone(saved);
	round.options[slot].chosen = true;
	round.remaining--;
	return round;
}
