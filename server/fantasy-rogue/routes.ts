import type { RogueNode, RogueRun } from './types';
import { weightedPick, type RogueRandom } from './biome-pools';
import { tradeKind, TRADE_NAMES } from './trading';
import { companionOwned } from '../../sim/rogue-companions';

export const ROUTE_STAGES = [2, 4, 8, 12, 16];
export const RED_ROUTES = ['wild', 'elite', 'trainer'];
export const ELITE_PITY_ROOMS = 12;
export const ROUTE_RETENTION: Record<string, number> = {
	wild: 0.85, event: 0.85, reward: 0.8, elite: 0.35, trade: 0.35, trainer: 0.55,
};
export function baseRouteWeights(floor: number): Record<string, number> {
	// Elite has a slightly higher raw weight to compensate for its mandatory next-floor absence.
	return { wild: 50, elite: floor < 30 ? 14 : 16, trainer: floor < 30 ? 10 : 12, event: 22, reward: 20,
		trade: ROUTE_STAGES[Math.min(4, Math.floor((floor - 1) / 40))] };
}

/** Fixed floors do not roll routes; elapsed floors still let old penalties recover. */
export function normalizeRouteHistory(run: RogueRun) {
	run.routeHistory ||= { floor: run.floor - 1, factors: {}, tradeSeen: false, eliteMisses: 0 };
	if (run.node?.kind === 'trade' || run.choices?.some(node => node.kind === 'trade')) run.routeHistory.tradeSeen = true;
	return run.routeHistory;
}

/** One red, one blue, then a weighted third option; only wild/events can repeat. */
export function rollRoutes(run: RogueRun, pool: RogueNode[], random: RogueRandom): RogueNode[] {
	const history = normalizeRouteHistory(run), weights = baseRouteWeights(run.floor);
	// Remember offered elites, even if the player chose a different route.
	const previousElite = history.lastEliteFloor ?? (history.floor > 0 && history.eliteMisses === 0 ? history.floor : -1);
	if (previousElite === run.floor - 1) pool = pool.filter(node => node.kind !== 'elite');
	if (companionOwned(run.blessings, 'poppy')) weights.reward *= 1.3;
	const elapsed = Math.max(0, run.floor - history.floor);
	const factors = Object.fromEntries(Object.keys(weights).map(kind =>
		[kind, 1 - (1 - (history.factors[kind] ?? 1)) * 0.5 ** elapsed]));
	const red = pool.filter(node => RED_ROUTES.includes(node.kind));
	const blue = pool.filter(node => !RED_ROUTES.includes(node.kind));
	const pick = (nodes: RogueNode[]) => weightedPick(nodes.map(node => ({ node,
		weight: Math.max(1, Math.round((weights[node.kind] || 1) * (factors[node.kind] ?? 1) * 1000)),
	})), random).node;
	const owns = (family: string) => run.blessings?.owned.some(entry => entry.family === family);
	const selected: RogueNode[] = [];
	const add = (node: RogueNode) => {
		selected.push(node);
		factors[node.kind] = Math.max(0.15, (factors[node.kind] ?? 1) * (ROUTE_RETENTION[node.kind] ?? 0.85));
	};
	const requireKind = (kind: string) => {
		const node = pool.find(entry => entry.kind === kind);
		if (node && selected.length < 3 && !selected.some(entry => entry.kind === kind)) add(node);
	};
	if (owns('battletask')) requireKind('wild');
	if (owns('eventtask')) requireKind('event');
	if (history.eliteMisses >= ELITE_PITY_ROOMS - 1) requireKind('elite');
	if (!selected.some(node => RED_ROUTES.includes(node.kind))) add(pick(red));
	if (!selected.some(node => !RED_ROUTES.includes(node.kind))) add(pick(blue));
	const allowRepeat = random(100) < 15;
	while (selected.length < 3) add(pick(pool.filter(node => !selected.some(old => old.kind === node.kind) ||
		allowRepeat && ['wild', 'event'].includes(node.kind))));
	history.floor = run.floor;
	history.factors = factors;
	history.tradeSeen ||= selected.some(node => node.kind === 'trade');
	history.eliteMisses = selected.some(node => node.kind === 'elite') ? 0 : history.eliteMisses + 1;
	if (history.eliteMisses === 0) history.lastEliteFloor = run.floor;
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
			result.trade.kind = tradeKind(run.floor, random);
			result.name = TRADE_NAMES[result.trade.kind];
		}
		return result;
	});
}
