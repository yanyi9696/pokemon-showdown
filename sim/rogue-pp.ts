import { Dex, toID } from './dex';
import type { RoguePokemon } from './fantasy-rogue';

/** A run-owned receipt distinguishes intentional PP Max from old boosted snapshots. */
export function rogueMovePP(mon: Pick<RoguePokemon, 'ppMaxed'>, id: string) {
	const move = Dex.mod('gen9fantasy').moves.get(id);
	return mon.ppMaxed?.includes(toID(id)) && !move.noPPBoosts ? Math.floor(move.pp * 8 / 5) : move.pp;
}
