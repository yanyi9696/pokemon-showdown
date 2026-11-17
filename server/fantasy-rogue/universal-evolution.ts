import { Dex, toID } from '../../sim/dex';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import { permanentMemberTypes } from '../../sim/rogue-blessing-permanent';
import { UNIVERSAL_ITEMS, UNIVERSAL_STATS, universalItem, validUniversalBonus, universalAuraChoices,
	type UniversalConfiguration } from '../../sim/rogue-universal-data';
import type { RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
export function universalUnavailable(run: RogueRun, mon: RoguePokemon, id: string) {
	const item = universalItem(id), species = dex.species.get(mon.set.species);
	if (!item) return '这不是万用进化道具。';
	if (!run[`${item.kind}Unlocked`]) return '本局尚未解锁对应进化系统。';
	if (mon.egg) return '蛋尚不能携带进化道具。';
	if (mon.nuzlockeDead || !mon.hp) return '请先恢复伙伴的战斗能力。';
	if (mon.fusion || mon.formFusion) return '融合伙伴不能使用万用进化道具。';
	if (item.kind !== 'gmega' && species.nfe) return '超级石和霸主 Z 需要最终形态（完成全部进化）。';
	if (species.isMega || species.battleOnly) return '请先恢复可在局外保留的形态。';
	if (item.type && !permanentMemberTypes(mon).includes(item.type)) return '该霸主 Z 与伙伴当前属性不匹配。';
	return '';
}
export const universalEligible = (run: RogueRun, mon: RoguePokemon, id: string) => !universalUnavailable(run, mon, id);
export function universalOptions(run: RogueRun, mon: RoguePokemon) {
	const baseStats = { ...dex.species.get(mon.set.species).baseStats };
	for (const stat of UNIVERSAL_STATS) baseStats[stat] += mon.statModifiers?.baseStats?.[stat] || 0;
	return UNIVERSAL_ITEMS.filter(item => (run.bag[item.id] || 0) > 0 || toID(mon.set.item) === item.id)
		.map(item => ({ ...item, eligible: universalEligible(run, mon, item.id), baseStats,
			reason: universalUnavailable(run, mon, item.id),
			configuration: mon.universalEvolution?.item === item.id ? mon.universalEvolution : undefined }));
}
export function prepareUniversalConfiguration(
	run: RogueRun, mon: RoguePokemon, id: string, bonus: StatsTable | undefined, aura?: StatIDExceptHP
): UniversalConfiguration {
	const reason = universalUnavailable(run, mon, id);
	if (reason) throw new Error(reason);
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
