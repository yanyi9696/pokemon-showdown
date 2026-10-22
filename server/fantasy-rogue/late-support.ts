import type { RogueNode, RogueRun } from './types';

// Internal pacing only: the player sees an ordinary reward route and a training invitation.
const CHECKPOINTS = [82, 96, 112, 128, 144, 158, 172, 186];
export const lateRewardScale = (floor: number) => floor <= 80 ? 1 : floor <= 100 ? 1.15 : floor <= 140 ? 1.25 : 1.35;
export function dueCatchup(run: RogueRun) {
	return run.postgame ? undefined : CHECKPOINTS.filter(f => f <= run.floor && f > (run.catchupCheckpoint || 0)).pop();
}
export function catchupRoutes(run: RogueRun, routes: RogueNode[], pool: RogueNode[]) {
	if (!dueCatchup(run) || routes.some(n => n.kind === 'reward')) return routes;
	const reward = pool.find(n => n.kind === 'reward');
	if (!reward) return routes;
	const result = [...routes];
	// Keep the rival invitation and one combat route available.
	let index = result.findIndex(n => ['event', 'trade'].includes(n.kind) && n.id !== 'rival');
	if (index < 0) index = result.findIndex((n, i) => n.id !== 'rival' &&
		result.some((other, j) => i !== j && ['wild', 'elite', 'trainer'].includes(other.kind)));
	if (index >= 0) result[index] = structuredClone(reward);
	return result;
}
export const catchupLevels = (floor: number) => floor <= 80 ? 3 : floor <= 100 ? 5 : floor <= 140 ? 6 : 8;
