import { BLESSING_TYPES } from '../../sim/rogue-blessing-data';
import { permanentMemberTypes } from '../../sim/rogue-blessing-permanent';
import type { RogueRandom } from './biome-pools';
import type { RogueRun } from './types';

const CHECKPOINTS: Record<number, number> = { 1: 50, 50: 100, 100: 150, 150: 200 };
export interface LakeQuestRound {
	floor: number;
	checkAt: number;
	types: string[];
	/** Actual costs paid at this node, including the separate normal/boss rates. */
	normal: number;
	boss: number;
	result?: 'reverted' | 'kept';
	/** The checkpoint snapshot, not a later team's coverage. */
	matched?: string[];
	partnerMatched?: string[];
}
export interface LakeQuestState {
	version: 1;
	rounds: LakeQuestRound[];
}

export function lakeQuestPartyTypes(run: RogueRun) {
	return new Set(run.team.filter(mon => !mon.egg && !mon.nuzlockeDead).flatMap(permanentMemberTypes));
}

/** Record charges at their source; owned blessings can include cost-free gifts and legacy effects. */
export function recordLakeQuestCost(run: RogueRun, cost: { normal: number, boss: number }) {
	if (run.spirit !== 'lakeguardians' || !run.blessings || !CHECKPOINTS[run.floor]) return;
	const quest = run.blessings.lakeQuest ||= { version: 1, rounds: [] };
	let round = quest.rounds.find(entry => entry.floor === run.floor);
	if (!round) {
		round = { floor: run.floor, checkAt: CHECKPOINTS[run.floor], types: [], normal: 0, boss: 0 };
		quest.rounds.push(round);
	}
	round.normal += cost.normal;
	round.boss += cost.boss;
}

/** Finalize once all rewards and party choices at this blessing node have been handled. */
export function openLakeQuestRound(run: RogueRun, random: RogueRandom, sharedTypes?: string[]) {
	if (run.spirit !== 'lakeguardians') return;
	const round = run.blessings?.lakeQuest?.rounds.find(entry => entry.floor === run.floor);
	if (!round || round.types.length || round.result) return;
	if (sharedTypes) round.types = [...sharedTypes];
	const present = lakeQuestPartyTypes(run), all = Object.keys(BLESSING_TYPES);
	const missing = all.filter(type => !present.has(type));
	const covered = all.filter(type => present.has(type));
	while (round.types.length < 3) {
		const pool = missing.length ? missing : covered;
		round.types.push(pool.splice(random(pool.length), 1)[0]);
	}
	(run.notices ||= []).push(`三圣菇的求索：本周期指定${round.types.map(type => BLESSING_TYPES[type]).join('、')}属性。` +
		`进入第 ${round.checkAt} 层时检查当时队伍，${sharedTypes ? '双方各自队伍都' : ''}全部覆盖即可永久回退第 ${round.floor} 层祝福的等级加成。`);
}

/** Only real floor entry calls this, after deferred costs activate and before any node is prepared. */
export function settleLakeQuestRound(run: RogueRun, partner?: RogueRun) {
	if (run.spirit !== 'lakeguardians' || run.postgame) return;
	const state = run.blessings;
	const round = state?.lakeQuest?.rounds.find(entry =>
		entry.checkAt === run.floor && !entry.result && entry.types.length === 3);
	if (!state || !round) return;
	const present = lakeQuestPartyTypes(run);
	round.matched = round.types.filter(type => present.has(type));
	if (partner) round.partnerMatched = round.types.filter(type => lakeQuestPartyTypes(partner).has(type));
	round.result = round.matched.length === 3 && (!partner || round.partnerMatched?.length === 3) ? 'reverted' : 'kept';
	if (round.result === 'reverted') {
		const boss = state.bossLevels ?? state.levels;
		state.levels = Math.max(0, state.levels - round.normal);
		state.bossLevels = Math.max(0, boss - round.boss);
	}
	(run.notices ||= []).push(`三圣菇的求索 · 第 ${round.floor} 层任务：` + (round.result === 'reverted' ?
		`已全部覆盖，永久回退本阶段固定首领 ${round.boss} 级、普通遭遇 ${round.normal} 级。` :
		(partner ? `双方未同时覆盖目标属性（你 ${round.matched.length}/3、队友 ${round.partnerMatched!.length}/3），` :
		`未覆盖${round.types.filter(type => !present.has(type)).map(type => BLESSING_TYPES[type]).join('、')}属性，`) +
		'保留本阶段等级加成；其他阶段已回退的加成不会恢复。'));
}

/** Viewing progress cannot settle a quest or change an earlier checkpoint's result. */
export function lakeQuestView(run: RogueRun) {
	if (run.spirit !== 'lakeguardians' || !run.blessings?.lakeQuest) return undefined;
	const present = lakeQuestPartyTypes(run);
	return { version: 1, rounds: run.blessings.lakeQuest.rounds.filter(round => round.types.length === 3).map(round => ({
		...round, matched: round.result ? round.matched || [] : round.types.filter(type => present.has(type)),
	})) };
}
