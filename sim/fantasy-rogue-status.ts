import type { Pokemon, EffectState } from './pokemon';
import { hasBlessing } from './fantasy-rogue-blessings';

export const ROGUE_STATUSES = ['brn', 'par', 'slp', 'psn', 'tox', 'fst', 'frz'];
export function canStackRogueStatus(source: Pokemon | null | undefined, status: string) {
	return ROGUE_STATUSES.includes(status) && !!hasBlessing(source, 'stackstatus');
}
export function rogueStatusStates(mon: Pokemon): Record<string, EffectState> | undefined {
	return mon.battle.fantasyRogue ? mon.m.rogueStatusStack : undefined;
}
export function hasRogueStatus(mon: Pokemon, status: string) {
	return mon.status === status || !!rogueStatusStates(mon)?.[status];
}
export function rememberRogueStatus(mon: Pokemon, old: ID, state: EffectState, stack: boolean) {
	if (stack && old && mon.status && old !== mon.status) {
		(mon.m.rogueStatusStack ||= {})[old] = state;
	}
	const states = rogueStatusStates(mon);
	if (states && mon.status) states[mon.status] = mon.statusState;
}
export function clearRogueStatus(mon: Pokemon) {
	const states = rogueStatusStates(mon);
	if (!states) return false;
	const current = mon.m.rogueStatusContext;
	if (current) delete states[current];
	else for (const id of Object.keys(states)) delete states[id];
	const first = Object.keys(states)[0] as ID | undefined;
	mon.status = first || '' as ID;
	mon.statusState = first ? states[first] : mon.battle.initEffectState({ id: '', target: mon });
	if (!first) delete mon.m.rogueStatusStack;
	return true;
}
/** Native status callbacks still receive their own statusState, including sleep/toxic counters. */
export function wrapRogueStatus(mon: Pokemon, id: string, callback: Function | undefined): Function | undefined {
	if (typeof callback !== 'function') return callback;
	return function (this: Battle, ...args: unknown[]) {
		const states = rogueStatusStates(mon);
		if (!states?.[id]) return;
		const previous = mon.status, context = mon.m.rogueStatusContext;
		mon.status = id as ID; mon.statusState = states[id]; mon.m.rogueStatusContext = id;
		try { return callback.apply(this, args); } finally {
			mon.m.rogueStatusContext = context;
			const surviving = rogueStatusStates(mon);
			const next = surviving?.[previous] ? previous : Object.keys(surviving || {})[0] as ID;
			mon.status = next || '' as ID;
			mon.statusState = next ? surviving![next] : this.initEffectState({ id: '', target: mon });
			// A native cure message clears the client's sole status slot. Sync the
			// final primary status after restoring context, without restarting it.
			if (!surviving?.[id] && next) this.add('-status', mon, next, '[silent]');
		}
	};
}
export function savedRogueStatuses(mon: Pokemon) {
	const states = rogueStatusStates(mon);
	if (!states) return undefined;
	return Object.fromEntries(Object.entries(states).map(([id, state]) => [id, {
		time: state.time, startTime: state.startTime, stage: state.stage, blessingToxic: state.blessingToxic,
	}]));
}

/** Cosmetic volatile labels let the normal client display every concurrent status. */
export function reportRogueStatuses(mon: Pokemon) {
	const current = Object.keys(rogueStatusStates(mon) || {}).filter(id => id !== mon.status);
	const previous: string[] = mon.m.rogueStatusLabels || [];
	for (const id of previous) if (!current.includes(id)) mon.battle.add('-end', mon, `rogue${id}`, '[silent]');
	for (const id of current) if (!previous.includes(id)) mon.battle.add('-start', mon, `rogue${id}`, '[silent]');
	mon.m.rogueStatusLabels = current;
}
