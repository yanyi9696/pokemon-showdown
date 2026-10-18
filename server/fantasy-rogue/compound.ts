import { Dex } from '../../sim/dex';
import { ROGUE_STATS } from '../../sim/fantasy-rogue';
import { compoundFinals, compoundPoints } from '../../sim/rogue-compound';
import type { BlessingReward } from './blessings';
import type { RogueCommand, RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
export function compoundView(run: RogueRun, reward: BlessingReward) {
	const entry = run.blessings!.owned.find(b => b.id === reward.blessing)!;
	const selection = reward.compound || {};
	const mon = run.team.find(m => m.id === selection.member);
	const finalSpecies = selection.final;
	const options = !mon ? run.team.filter(m => compoundFinals(m).length).map(m => ({ id: m.id, name: m.set.species })) :
		!finalSpecies ? compoundFinals(mon).map(name => ({ id: name, name })) : [];
	return { ...reward, options, compound: { ...selection, stage: !mon ? 'member' : !finalSpecies ? 'final' : 'allocate',
		points: finalSpecies ? compoundPoints(finalSpecies, entry.tier) : 0,
		baseStats: finalSpecies ? dex.species.get(finalSpecies).baseStats : undefined } };
}
export function chooseCompound(run: RogueRun, reward: BlessingReward, command: RogueCommand) {
	const selection = reward.compound ||= {};
	const entry = run.blessings!.owned.find(b => b.id === reward.blessing)!;
	if (command.value === 'back') {
		delete selection.member; delete selection.final; return;
	}
	if (!selection.member) {
		const mon = run.team.find(m => m.id === command.value);
		if (!mon || !compoundFinals(mon).length) throw new Error('该伙伴不符合五号化合物的条件。');
		selection.member = mon.id;
		const finals = compoundFinals(mon);
		if (finals.length === 1) selection.final = finals[0];
		return;
	}
	const mon = run.team.find(m => m.id === selection.member);
	if (!mon || mon.compound) throw new Error('请重新选择尚未使用化合物的伙伴。');
	const finals = compoundFinals(mon);
	if (!selection.final) {
		if (!finals.includes(command.value || '')) throw new Error('请选择符合条件的最终形态。');
		selection.final = command.value; return;
	}
	if (command.value !== 'allocate' || !finals.includes(selection.final)) throw new Error('化合物分配状态无效。');
	const points = compoundPoints(selection.final, entry.tier), bonus = command.evs;
	if (!bonus || Object.keys(bonus).length !== 6 ||
		!ROGUE_STATS.every(stat => Number.isSafeInteger(bonus[stat]) && bonus[stat] >= 0) ||
		ROGUE_STATS.reduce((sum, stat) => sum + bonus[stat], 0) !== points) throw new Error(`请恰好分配 ${points} 点新增种族值。`);
	mon.compound = { blessing: entry.id, finalSpecies: selection.final, bonus: { ...bonus } };
	mon.set.ability = 'Power of Alchemy';
	mon.abilityPool = [{ id: 'powerofalchemy', hidden: false }];
	entry.target = mon.id; entry.completed = true;
	run.blessings!.pending.shift();
	(run.notices ||= []).push('五号化合物已生效，新增种族值将随伙伴的进化保留，主特性变为【化学之力】。');
}
