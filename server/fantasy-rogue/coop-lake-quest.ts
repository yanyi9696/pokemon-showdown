import { BLESSING_TYPES } from '../../sim/rogue-blessing-data';
import { lakeQuestPartyTypes, openLakeQuestRound, settleLakeQuestRound } from './lake-quest';
import type { RogueRandom } from './biome-pools';
import type { RogueRun } from './types';

/** Prioritize types absent from both parties, then one party, before already-covered types. */
export function openCoopLakeQuest(runs: RogueRun[], random: RogueRandom) {
	if (runs.length !== 2 || runs.some(run => run.spirit !== 'lakeguardians')) return;
	const rounds = runs.map(run => run.blessings?.lakeQuest?.rounds.find(round => round.floor === run.floor));
	if (rounds.some(round => !round || round.result)) return;
	const saved = rounds.filter(round => round!.types.length).map(round => round!.types);
	if (saved.length === 2 && saved[0].join() !== saved[1].join()) throw new Error('三圣菇共同目标不一致，请保留存档检查。');
	if (saved.length === 2) return;
	const types = saved[0]?.slice() || [];
	if (!types.length) {
		const parties = runs.map(lakeQuestPartyTypes);
		const pools = [0, 1, 2].map(count => Object.keys(BLESSING_TYPES).filter(type =>
			parties.filter(party => party.has(type)).length === count));
		while (types.length < 3) {
			const pool = pools.find(entries => entries.length)!;
			types.push(pool.splice(random(pool.length), 1)[0]);
		}
	}
	for (const run of runs) openLakeQuestRound(run, random, types);
}

/** Call after both owners activate deferred costs, before preparing this checkpoint's content. */
export function settleCoopLakeQuest(runs: RogueRun[]) {
	if (runs.length !== 2 || runs.some(run => run.spirit !== 'lakeguardians' || run.postgame)) return;
	const rounds = runs.map(run => run.blessings?.lakeQuest?.rounds.find(round => round.checkAt === run.floor));
	if (rounds.some(round => round?.types.length !== 3)) return;
	const [first, second] = rounds;
	if (first!.floor !== second!.floor || first!.types.join() !== second!.types.join() ||
		first!.result !== second!.result) {
		throw new Error('三圣菇共同周期不一致，请保留存档检查。');
	}
	for (const [index, run] of runs.entries()) settleLakeQuestRound(run, runs[1 - index]);
}
