import { soloDoublesExperience } from './solo-doubles-rewards';
import { Dex, toID } from '../../sim/dex';
import { ROGUE_STATS, rogueGrowthNotice, type RogueBattleResult } from '../../sim/fantasy-rogue';
import { rogueEffortYield, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { permanentMemberTypes } from '../../sim/rogue-blessing-permanent';
import { POWER_TRAINING_STATS } from '../../sim/rogue-pets';
import { companionOwned } from '../../sim/rogue-companions';
import { gainEffort, gainExperience } from './progression';
import { towerExperience } from './early-balance';
import { blessingExperience } from './blessings';
import { companionExperience } from './companions';
import { comebackActive, comebackExperience } from './comeback';
import type { RogueRun } from './types';

/** Each opponent pays once; called both at safe battle pauses and final settlement. */
export function awardBattleExperience(run: RogueRun, result: RogueBattleResult, cooperative = false) {
	run.notices ||= [];
	const before = structuredClone(run.team);
	const fresh = (result.defeated || []).filter((defeated, index) =>
		!run.experienceReceipts?.includes(`${result.encounterId}:${defeated.id || index}`));
	if (companionOwned(run.blessings, 'iris') && fresh.some(defeated => run.team.some(mon =>
		defeated.eligible.includes(mon.id) && mon.id !== (defeated.dragonKing || run.blessings?.dragonKing?.member) &&
		permanentMemberTypes(mon).includes('Dragon')))) {
		run.notices.push('【同行训练家 - 爱丽丝】龙王以外的龙系伙伴战斗经验提升 30%。');
	}
	if (companionOwned(run.blessings, 'lana') && fresh.some(defeated =>
		Dex.mod('gen9fantasy').species.get(defeated.species).types.includes('Water'))) {
		run.notices.push('【同行训练家 - 水莲】从水系对手身上获得的全队战斗经验提升 20%。');
	}
	for (const [index, defeated] of (result.defeated || []).entries()) {
		const key = `${result.encounterId}:${defeated.id || index}`;
		if ((run.experienceReceipts ||= []).includes(key)) continue;
		run.experienceReceipts.push(key);
		for (const mon of run.team) {
			if (!defeated.eligible.includes(mon.id)) continue;
			if (!defeated.captured) {
				const yieldStats = { ...rogueEffortYield(defeated.species) };
				const powerStat = POWER_TRAINING_STATS[toID(mon.set.item)];
				if (powerStat) yieldStats[powerStat] += 8;
				if (companionOwned(run.blessings, 'bea') && permanentMemberTypes(mon).includes('Fighting')) {
					for (const stat of ROGUE_STATS) yieldStats[stat] *= 2;
					(run.notices ||= []).push('【同行训练家 - 彩豆】格斗系伙伴的努力值翻倍，战斗经验提升 30%。');
				}
				if (companionOwned(run.blessings, 'kahili') && permanentMemberTypes(mon).includes('Flying')) {
					for (const stat of ROGUE_STATS) yieldStats[stat] *= 2;
					run.notices.push('【同行训练家 - 卡希丽】飞行系伙伴的努力值翻倍，战斗经验提升 30%。');
				}
				if (companionOwned(run.blessings, 'giovanni') && defeated.killer === mon.id &&
					permanentMemberTypes(mon).includes('Psychic')) {
					run.notices.push('【同行训练家 - 坂木】超能系伙伴完成击倒，所得经验提升 20%。');
				}
				gainEffort(run, mon, yieldStats);
			}
			if (comebackActive(run)) (run.comeback!.battleFloors ||= []).push(run.floor);
			gainExperience(run, mon, Math.floor(towerExperience(rogueSpeciesData(defeated.species).baseExperience,
				defeated.level, mon.set.level, defeated.participants.includes(mon.id), run.floor,
				run.node!.kind === 'wild' && !run.node!.event && !defeated.captured,
				run.node!.kind === 'wild' && !run.node!.event && !!defeated.captured) *
				(run.spirit === 'hooh' && mon.set.shiny ? 3 : 1) * blessingExperience(run, mon, defeated.dragonKing) *
				(1 + (run.growth?.experience || 0) / 10000) * companionExperience(run, mon, defeated) * comebackExperience(run) * soloDoublesExperience(run, cooperative)));
		}
	}
	return run.team.flatMap(mon => {
		const old = before.find(saved => saved.id === mon.id);
		const notice = old && rogueGrowthNotice(old, mon);
		return notice ? [notice] : [];
	});
}
