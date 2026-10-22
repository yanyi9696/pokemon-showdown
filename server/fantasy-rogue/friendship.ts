import type { RoguePokemon, RogueBattleResult } from '../../sim/fantasy-rogue';
import type { RogueRun } from './types';
import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { emissaryCount } from '../../sim/rogue-late-bloomers';

export const ROGUE_INITIAL_FRIENDSHIP = 70;
export const ROGUE_FRIENDSHIP_EVOLUTION = 160;
export const ROGUE_TIME_CYCLE = ['day', 'day', 'dusk', 'night', 'night', 'dawn'] as const;
export const ROGUE_TIME_NAMES = { day: '白天', dusk: '黄昏', night: '夜晚', dawn: '黎明' };

export function rogueTime(floor: number) {
	return ROGUE_TIME_CYCLE[(Math.max(1, Math.floor(floor)) - 1) % ROGUE_TIME_CYCLE.length];
}

/** Preserve the effective simulator value of older saves with no explicit happiness. */
export function friendship(mon: RoguePokemon) {
	return Math.max(0, Math.min(255, Math.floor(mon.set.happiness ?? 255)));
}

export function changeFriendship(mon: RoguePokemon, amount: number, run?: RogueRun) {
	if (amount > 0 && emissaryCount(mon, run?.blessings)) amount *= 2;
	if (amount > 0 && mon.set.pokeball === 'luxuryball') amount *= 2;
	if (amount > 0 && mon.initialPartner && ownsBlessing(run?.blessings, 'bond')) {
		const boosted = amount * 1.5 + (mon.bondFriendshipRemainder || 0);
		amount = Math.floor(boosted); mon.bondFriendshipRemainder = boosted - amount;
	}
	mon.set.happiness = Math.max(0, Math.min(255, friendship(mon) + amount));
	if (mon.set.happiness === 255) delete mon.bondFriendshipRemainder;
}

function ledger(run: RogueRun) {
	if (run.friendshipProgress?.floor !== run.floor) {
		run.friendshipProgress = { floor: run.floor, battles: {}, fainted: {}, settled: [] };
	}
	return run.friendshipProgress;
}

/** Called once per settled attempt, before experience and evolution. No reward for retreating. */
export function battleFriendship(run: RogueRun, result: RogueBattleResult, token: string, previous: RoguePokemon[]) {
	const progress = ledger(run);
	if (progress.settled.includes(token)) return;
	progress.settled.push(token);
	const participants = new Set((result.defeated || []).flatMap(entry => entry.participants));
	for (const mon of run.team) {
		if (!mon.hp && !result.selfDestructed?.includes(mon.id) && previous.some(old => old.id === mon.id && old.hp > 0)) {
			const count = progress.fainted[mon.id] || 0;
			if (count < 2) changeFriendship(mon, -5);
			progress.fainted[mon.id] = count + 1;
		}
		if (result.won && mon.hp && participants.has(mon.id)) {
			const count = progress.battles[mon.id] || 0;
			if (count < 2) changeFriendship(mon, 1, run);
			progress.battles[mon.id] = count + 1;
		}
	}
}

export function floorFriendship(run: RogueRun) {
	const progress = ledger(run);
	if (progress.completed) return;
	progress.completed = true;
	for (const mon of run.team) if (mon.hp > 0) changeFriendship(mon, 3, run);
}
