/** New campaigns use percentage ranks; archived additive campaigns keep their original numbers. */
export function rogueMetaStat(base: number, rank = 0, percent = false): number {
	return percent ? Math.max(1, Math.floor(base * (100 + rank) / 100 + 1e-9)) : base + rank;
}
