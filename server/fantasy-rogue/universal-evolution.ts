import { Dex, toID } from '../../sim/dex';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import { permanentMemberTypes } from '../../sim/rogue-blessing-permanent';
import { UNIVERSAL_ITEMS, UNIVERSAL_STATS, universalItem, validUniversalBonus, universalAuraChoices,
	type UniversalConfiguration } from '../../sim/rogue-universal-data';
import type { RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
export function universalEligible(run: RogueRun, mon: RoguePokemon, id: string) {
	const item = universalItem(id), species = dex.species.get(mon.set.species);
	return !!item && !!run[`${item.kind}Unlocked`] &&
		!mon.egg && !mon.nuzlockeDead && !mon.fusion && !mon.formFusion && !!mon.hp &&
		(item.kind === 'gmega' || !species.nfe) && !species.isMega && !species.battleOnly &&
		(!item.type || permanentMemberTypes(mon).includes(item.type));
}
export function universalOptions(run: RogueRun, mon: RoguePokemon) {
	const baseStats = { ...dex.species.get(mon.set.species).baseStats };
	for (const stat of UNIVERSAL_STATS) baseStats[stat] += mon.statModifiers?.baseStats?.[stat] || 0;
	return UNIVERSAL_ITEMS.filter(item => (run.bag[item.id] || 0) > 0 || toID(mon.set.item) === item.id)
		.map(item => ({ ...item, eligible: universalEligible(run, mon, item.id), baseStats,
			configuration: mon.universalEvolution?.item === item.id ? mon.universalEvolution : undefined }));
}
export function prepareUniversalConfiguration(
	run: RogueRun, mon: RoguePokemon, id: string, bonus: StatsTable | undefined, aura?: StatIDExceptHP
): UniversalConfiguration {
	if (!universalEligible(run, mon, id)) {
		throw new Error('需要解锁对应系统及存活伙伴，超级石和霸主 Z 需要最终形态，霸主 Z 还需匹配当前属性；融合伙伴不可使用。');
	}
	if (!validUniversalBonus(id, bonus)) throw new Error('新增种族点的总量、HP 固定值或单项上限不符合该万用道具。');
	if (universalItem(id)!.kind === 'z') {
		const stats = universalOptions(run, mon).find(item => item.id === id)?.baseStats;
		if (!stats) throw new Error('背包中没有该万用道具。');
		const choices = universalAuraChoices(stats, bonus);
		aura ||= choices.length === 1 ? choices[0] : undefined;
		if (!aura || !choices.includes(aura)) throw new Error('请选择分配后最高非 HP 种族值对应的气场；并列时可自选。');
	}
	return { version: 1, item: id, bonus: { ...bonus }, ...(universalItem(id)!.kind === 'z' ? { aura } : {}) };
}
