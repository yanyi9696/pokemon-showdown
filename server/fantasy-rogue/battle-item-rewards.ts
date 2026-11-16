import { toID } from '../../sim/dex';
import type { RogueBattleResult, RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueKnockedOffItem } from '../../sim/rogue-item-sources';
import type { RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { convertSpiritItem } from './spirits';

/** Final retained equipment, not a per-Pokemon comparison that mistakes transfers for prizes. */
export function battleItemReward(
	run: Pick<RogueRun, 'spirit' | 'spiritConversions'>, content: RogueContent, mon: RoguePokemon,
	result: Pick<RogueBattleResult, 'encounterId' | 'itemSources'> | undefined, random: RogueRandom, capture = false
) {
	const item = toID(mon.set.item);
	if (!item || run.spirit !== 'hoopagift') return mon.set.item || '';
	const source = result?.itemSources?.[mon.id];
	if (source && !source.owned && source.item === item) {
		return convertSpiritItem(run, content, item, `battle-source:${result.encounterId}:${source.key}`, random);
	}
	// Older capture packets retain their established reward path. Unknown transfers never reroll owned items.
	if (capture && !result?.itemSources) return convertSpiritItem(run, content, item, `capture:${mon.id}`, random);
	return mon.set.item || '';
}

/** Run inside the existing once-only settlement transaction, including exits from saved checkpoints. */
export function restoreKnockedOffItems(
	run: Pick<RogueRun, 'spirit' | 'spiritConversions'>, content: RogueContent,
	result: RogueBattleResult, random: RogueRandom,
	options: { partner?: boolean, failedChallengeTeam?: RoguePokemon[], convertRewards?: boolean } = {}
): RogueBattleResult {
	const originalTeam = options.partner ? result.partnerTeam : result.team;
	if (!result.knockedOffItems || !originalTeam?.some(mon => result.knockedOffItems?.[mon.id]?.length)) return result;
	const team: RoguePokemon[] = structuredClone(originalTeam);
	const bag = { ...(options.partner ? result.partnerBag : result.bag) };
	const itemSources = result.itemSources && { ...result.itemSources };
	for (const mon of team) {
		const removals: RogueKnockedOffItem[] = result.knockedOffItems[mon.id] || [];
		for (const removed of removals) {
			if (options.failedChallengeTeam) {
				const original = options.failedChallengeTeam.find(entry => entry.id === mon.id);
				if (!original || toID(original.set.item) !== removed.item) continue;
				// Failed trials cannot bank extra stolen equipment, even if it has the same item name.
				if (toID(mon.set.item) !== toID(original.set.item)) mon.set.item = '';
				if (mon.set.item) continue;
			}
			if (!mon.set.item) {
				mon.set.item = removed.item;
				if (itemSources) {
					if (removed.source) itemSources[mon.id] = { ...removed.source };
					else delete itemSources[mon.id];
				}
			} else {
				// Keep newly acquired equipment equipped; return the displaced item to its owner's bag.
				const item = options.convertRewards === false ? removed.item : battleItemReward(run, content,
					{ ...mon, set: { ...mon.set, item: removed.item } },
					{ encounterId: result.encounterId, itemSources: removed.source ? { [mon.id]: removed.source } : undefined }, random);
				bag[item] = (bag[item] || 0) + 1;
			}
		}
	}
	return { ...result, itemSources, ...(options.partner ? { partnerTeam: team, partnerBag: bag } : { team, bag }) };
}
