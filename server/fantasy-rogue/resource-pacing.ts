/** Shared across all difficulties. Interpolate budgets, never reprice saved inventory. */
export function pacingCurve(floor: number, points: readonly (readonly [number, number])[]) {
	if (floor <= points[0][0]) return points[0][1];
	for (let i = 1; i < points.length; i++) {
		const [end, value] = points[i], [start, previous] = points[i - 1];
		if (floor <= end) return previous + (value - previous) * (floor - start) / (end - start);
	}
	return points[points.length - 1][1];
}
export const candySupplyMultiplier = (floor: number) => pacingCurve(floor,
	[[1, 0.35], [20, 0.35], [30, 0.45], [40, 0.55], [60, 0.65], [100, 0.8], [150, 1]]);
export const coinSupplyMultiplier = (floor: number) => pacingCurve(floor,
	[[1, 1], [30, 0.95], [50, 0.8], [80, 0.72], [100, 0.8], [140, 0.94], [160, 1]]);
export const lootProgressFloor = (floor: number) => pacingCurve(floor,
	[[1, 1], [30, 30], [80, 60], [120, 100], [160, 160], [200, 200]]);
export const catchupTargetLevel = (floor: number) => Math.floor(pacingCurve(floor,
	[[1, 5], [20, 16], [30, 21], [40, 27], [60, 40], [80, 52], [100, 65], [140, 85], [160, 95], [180, 100]]));
