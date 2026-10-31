/** Nature selection is accessible early; mints have a modest, capped utility value. */
export const NATURE_MINT_VALUE = 400;
export const natureMintPrice = (floor: number) =>
	Math.round((400 + 4 * Math.max(1, Math.min(200, floor))) / 50) * 50;

/** Replace most of the old 2,000 mint valuation with useful recovery, rather than more EXP. */
export function natureMintSupplies(floor: number): Record<string, number> {
	return floor < 69 ? { superpotion: 1, ether: 2 } : { hyperpotion: 1 };
}
