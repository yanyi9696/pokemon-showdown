import type { RogueRun } from './types';
import type { RogueRandom } from './biome-pools';

export type FragmentAlternative = 'forest' | 'room' | 'bandits';
export interface EventFragmentOffer { stage: string; amount: number; alternative: FragmentAlternative }

export function eventFragmentTier(floor: number) {
	return floor < 51 ? undefined : floor < 80 ? { key: '51', min: 8, max: 12, cap: 30 } :
		floor < 100 ? { key: '80', min: 12, max: 18, cap: 45 } :
		floor < 150 ? { key: '100', min: 16, max: 22, cap: 60 } : { key: '150', min: 20, max: 30, cap: 80 };
}

/** Offer only after the branch succeeds; the alternative reward has not been paid yet. */
export function offerEventFragments(run: RogueRun, alternative: FragmentAlternative, random: RogueRandom) {
	const tier = eventFragmentTier(run.floor), event = run.node!.event!;
	if (!tier || !run.blessings) return false;
	const remaining = tier.cap - (run.eventFragments?.[tier.key] || 0);
	if (remaining < tier.min) return false;
	const low = alternative === 'forest' ? tier.min : tier.max - 2;
	const high = alternative === 'forest' ? Math.min(tier.max, tier.min + 2) : tier.max;
	event.fragmentOffer = { stage: tier.key, alternative, amount: Math.min(remaining, low + random(high - low + 1)) };
	event.stage = 'fragments'; event.settled = false; run.phase = 'event';
	event.result = [alternative === 'forest' ? '宝可梦们推来一堆果实。旁边还有几块发光的碎片，它们示意你挑一份带走。' :
		alternative === 'room' ? '门终于打开了。门边放着一个工具箱和一袋发光的碎片，纸条上写着：「选一份，继续走吧。」' :
		'山贼们倒了一地。你搜到了他们藏起的财物和一袋发光的碎片，决定带走其中一份。'];
	return true;
}

export function eventFragmentOptions(run: RogueRun) {
	const offer = run.node?.event?.fragmentOffer;
	return offer ? [{ id: 'fragments', name: '带走幻想碎片。', text: `幻想碎片 ×${offer.amount}`, disabled: false },
		{ id: 'supplies', name: offer.alternative === 'forest' ? '拿些果实和补给。' : offer.alternative === 'room' ?
			'带走工具箱和随附的小份碎片。' : '带走财物。', text: '', disabled: false }] : [];
}

export function claimEventFragments(run: RogueRun) {
	const offer = run.node!.event!.fragmentOffer!, tier = eventFragmentTier(run.floor)!;
	const ledger = run.eventFragments ||= {};
	if (tier.key !== offer.stage || (ledger[offer.stage] || 0) + offer.amount > tier.cap) throw new Error('本阶段碎片奖励已更新。');
	ledger[offer.stage] = (ledger[offer.stage] || 0) + offer.amount;
	run.blessings!.shards += offer.amount;
	return `你收好了发光的碎片。获得幻想碎片 ×${offer.amount}。`;
}
