import type { RogueEncounter, RogueNode, RogueRun } from './types';
import { blessingLevelCost, type BlessingTier } from '../../sim/rogue-blessing-data';

/** Opening grace includes floors 1-10; milestone rewards cover the next ten floors. */
export const BLESSING_LEVEL_GRACE = 10;
export const blessingLevelStart = (floor: number) =>
	floor === 1 ? 1 + BLESSING_LEVEL_GRACE : floor + BLESSING_LEVEL_GRACE + 1;
export interface DeferredBlessingLevels {
	floor: number; startsAt: number; normal: number; boss: number;
}

/** Already-active legacy costs stay intact. Never reconstruct costs from owned blessings. */
export function deferBlessingLevels(run: RogueRun, tier: BlessingTier) {
	const normal = blessingLevelCost(tier, run.floor), boss = blessingLevelCost(tier, run.floor, true);
	if (!normal && !boss) return;
	(run.blessings!.deferredLevels ||= []).push({
		floor: run.floor, startsAt: blessingLevelStart(run.floor), normal, boss,
	});
}

/** Pure forecast: looking ahead must not activate costs in the current save. */
export function blessingLevelsAt(run: RogueRun, floor = run.floor) {
	const state = run.blessings;
	let normal = state?.levels || 0, boss = state?.bossLevels ?? normal;
	for (const cost of state?.deferredLevels || []) if (cost.startsAt <= floor) {
		normal += cost.normal; boss += cost.boss;
	}
	return { normal, boss };
}

export function activateBlessingLevels(run: RogueRun) {
	const state = run.blessings;
	if (!state?.deferredLevels?.some(cost => cost.startsAt <= run.floor)) return;
	const levels = blessingLevelsAt(run);
	const normal = levels.normal - state.levels, boss = levels.boss - (state.bossLevels ?? state.levels);
	state.levels = levels.normal; state.bossLevels = levels.boss;
	state.deferredLevels = state.deferredLevels.filter(cost => cost.startsAt > run.floor);
	(run.notices ||= []).push(`祝福加级开始生效：固定首领再提高 ${boss} 级，普通遭遇再提高 ${normal} 级。`);
}

/** Only authored elite escorts use ordinary costs; the entire summit team uses boss costs. */
export function encounterBlessingLevels(
	run: RogueRun, node: RogueNode, encounter: RogueEncounter, index: number, floor = run.floor
) {
	if (encounter.fixedLevels) return 0;
	const levels = blessingLevelsAt(run, floor);
	const guard = index < (encounter.escortCount || 0);
	return node.kind !== 'boss' || guard ? levels.normal : levels.boss;
}
