import type { EventID } from './event-text';
import { pacingCurve } from './resource-pacing';

/** Tests of the player's roster/moves, or exchanges that consume a supplied item. */
export const PREPARATION_EVENTS = new Set<EventID>([
	'relicpuzzle', 'minicontest', 'feathers', 'fossillab', 'sweetdance', 'peatmoon',
	'evolutiondojo', 'stonegate', 'invertedstars', 'unioncircle', 'kubfuscroll', 'greninjatraining',
]);
const OPENING_REWARDS = new Set<EventID>([
	'forest', 'identityquiz', 'mysteryball', 'dittoshow', 'poffinworkshop', 'safaripark',
	'blackjack', 'grassegg', 'meowthcoin', 'chanseycoin', 'shuckledice', 'delibirddice',
]);

/** Weight only newly drawn ordinary events. Existing stories and invitation conditions stay intact. */
export function eventPacingWeight(floor: number, id: EventID) {
	if (PREPARATION_EVENTS.has(id)) return floor <= 30 ? 0 :
		pacingCurve(floor, [[31, 0.15], [50, 0.35], [60, 1]]);
	return OPENING_REWARDS.has(id) ? pacingCurve(floor, [[1, 1.8], [30, 1.8], [50, 1]]) : 1;
}
