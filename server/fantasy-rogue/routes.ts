import type { RogueNode, RogueRun } from './types';
import { weightedPick, type RogueRandom } from './biome-pools';

export const ROUTE_STAGES = [2, 4, 8, 12, 16];
export const RED_ROUTES = ['wild', 'elite', 'trainer'];

/** One red, one blue, then a weighted third option; only wild/events can repeat. */
export function rollRoutes(run: RogueRun, pool: RogueNode[], random: RogueRandom): RogueNode[] {
	const trade = ROUTE_STAGES[Math.min(4, Math.floor((run.floor - 1) / 40))];
	const weights: Record<string, number> = { wild: 26, elite: 20, trainer: 16, event: 26, reward: 20, trade };
	const red = pool.filter(node => RED_ROUTES.includes(node.kind));
	const blue = pool.filter(node => !RED_ROUTES.includes(node.kind));
	const pick = (nodes: RogueNode[]) =>
		weightedPick(nodes.map(node => ({ node, weight: weights[node.kind] })), random).node;
	const owns = (family: string) => run.blessings?.owned.some(entry => entry.family === family);
	const selected = [owns('battletask') ? red.find(node => node.kind === 'wild')! : pick(red),
		owns('eventtask') ? blue.find(node => node.kind === 'event')! : pick(blue)];
	const allowRepeat = random(100) < 15;
	selected.push(pick(pool.filter(node => !selected.some(old => old.kind === node.kind) ||
		allowRepeat && ['wild', 'event'].includes(node.kind))));
	// Shuffle only presentation; IDs remain stable when reloading the saved choices.
	for (let i = selected.length - 1; i > 0; i--) {
		const j = random(i + 1);
		[selected[i], selected[j]] = [selected[j], selected[i]];
	}
	const counts: Record<string, number> = {};
	return selected.map(node => {
		const index = counts[node.kind] || 0;
		counts[node.kind] = index + 1;
		const result = structuredClone(node);
		result.id = node.kind === 'wild' || node.kind === 'event' ? `${node.kind}${index}` : node.id;
		if (result.trade) {
			const kinds = ['mint', 'candy', 'machine'] as const;
			result.trade.kind = kinds[random(3)];
			result.name = { mint: '薄荷商店', candy: '经验糖果商店', machine: '招式学习机商店' }[result.trade.kind];
		}
		return result;
	});
}
