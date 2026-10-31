import { Dex, toID } from '../../sim/dex';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { BlessingDefinition } from '../../sim/rogue-blessing-data';

const dex = Dex.mod('gen9fantasy');
/** Deliberately uses the replacement menu's unlocked pool, never the full learnset. */
export function currentBlessingMoves(team: RoguePokemon[]) {
	return [...new Set(team.filter(mon => !mon.egg).flatMap(mon => [
		...mon.set.moves.map(toID), ...(mon.moveMemory || []).map(move => toID(move.id)),
		...(mon.blessingMoves || []).map(toID),
	]))].map(id => dex.moves.get(id)).filter(move => move.exists);
}

/** Soft preference only; explicit acquisition requirements remain separate. */
export function blessingMoveWeight(def: BlessingDefinition, moves: readonly Move[]) {
	if (!['emissary', 'typelink', 'ascent', 'veteransniper', 'sound', 'multihit',
		'bugchoir', 'explosionart', 'seeds', 'detect', 'swords', 'railgun', 'hazards', 'hoopa', 'meltan'].includes(def.family)) return 1;
	const matching = (move: Move): boolean => {
		switch (def.family) {
		case 'emissary': case 'typelink':
			return move.category !== 'Status' && move.type === def.type;
		case 'ascent': return !!move.flags.slicing;
		case 'veteransniper': return !!move.flags.shooting;
		case 'sound': return !!move.flags.sound;
		case 'multihit': return !!move.multihit;
		case 'bugchoir': return move.id === 'bugbuzz';
		case 'explosionart': return ['selfdestruct', 'explosion'].includes(move.id);
		case 'seeds': return move.id === 'leechseed';
		case 'detect': return move.id === 'detect';
		case 'swords': return move.id === 'sacredsword';
		case 'railgun': return move.id === 'zapcannon';
		case 'hazards': return ['stealthrock', 'spikes', 'gmaxsteelsurge'].includes(move.id);
		case 'hoopa': return move.category !== 'Status' && ['Dark', 'Ghost'].includes(move.type);
		case 'meltan': return move.category !== 'Status' && ['Steel', 'Electric'].includes(move.type);
		default: return true;
		}
	};
	return moves.some(matching) ? 1 : 0.2;
}
