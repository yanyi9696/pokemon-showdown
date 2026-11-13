import { toID } from '../../sim/dex';
import type { RogueBattleResult, RoguePokemon } from '../../sim/fantasy-rogue';
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
