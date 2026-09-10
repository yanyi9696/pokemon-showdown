import type { Battle } from '../../sim/battle';
import type { ChoiceRequest } from '../../sim/side';
import { toID } from '../../sim/dex';

/** Only the selected move is authorized; no target, Mega/Tera choice, PP or live Pokemon. */
export interface SelectedOpponentMove {
	move: string;
	baseMove: string;
	event?: 'zmove' | 'dynamax';
}

export interface OpponentChoiceState {
	version: number;
	ready: boolean;
	/** null means the submitted action is not a move; omission means no actionable move request. */
	move?: SelectedOpponentMove | null;
}

/** Match by move identity, never by the real player's move slot or replacement target. */
export function matchesOpponentMove(request: ChoiceRequest, choice: string, selected: SelectedOpponentMove | null) {
	if (selected === null) return choice.startsWith('switch ');
	const [kind, slot, event = ''] = choice.split(' ');
	const active = 'active' in request ? request.active[0] : undefined;
	if (kind !== 'move' || !active || toID(active.moves[Number(slot) - 1]?.id) !== toID(selected.baseMove)) return false;
	if (selected.event === 'zmove') {
		const offered = active.canZMove?.[Number(slot) - 1]?.move || '';
		return event === 'zmove' && (toID(offered) === toID(selected.move) ||
			toID(offered.replace(/^Z-/, '')) === toID(selected.move));
	}
	if (selected.event === 'dynamax') return event === 'dynamax';
	return event !== 'zmove' && event !== 'dynamax';
}

/** Trusted simulator adapter, called after accepted choices and public updates have been flushed. */
export function captureOpponentChoice(battle: Battle, side: 'p1' | 'p2', version = 0): OpponentChoiceState {
	const player = battle.getSide(side);
	if (battle.requestState !== 'move' || !player.activeRequest || player.activeRequest.wait) {
		return { version, ready: true };
	}
	if (!player.isChoiceDone()) return { version, ready: false };
	const action = player.choice.actions.find(candidate => candidate.choice === 'move');
	if (!action || action.choice !== 'move') return { version, ready: true, move: null };
	return {
		version, ready: true,
		move: {
			move: battle.toID(action.zmove || action.maxMove || action.moveid),
			baseMove: action.moveid,
			event: action.zmove ? 'zmove' : action.maxMove ? 'dynamax' : undefined,
		},
	};
}
