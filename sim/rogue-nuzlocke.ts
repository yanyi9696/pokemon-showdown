import type { Battle } from './battle';
import type { Pokemon } from './pokemon';

/** Simulator-only progress; persisted by the parent process, never accepted from a client. */
export interface NuzlockeBattle {
	captureAllowed: boolean;
	target?: string;
	dead: string[];
}

export function nuzlockeCanCatch(battle: Battle, target: Pokemon | null | undefined): boolean {
	const rules = battle.fantasyRogue?.nuzlocke;
	return !rules || !!(rules.captureAllowed && target && rules.target === target.set.fantasyRogueId);
}

export function nuzlockeSwitchIn(mon: Pokemon) {
	const battle = mon.battle, state = battle.fantasyRogue, rules = state?.nuzlocke;
	if (!rules || !state?.catchable || !rules.captureAllowed || rules.target || mon.side.id !== 'p2' || !mon.hp) return;
	rules.target = mon.set.fantasyRogueId;
	battle.send('fantasyroguenuzlocke', JSON.stringify(rules));
	battle.add('-message', 'Nuzlocke：本十层的捕捉机会已锁定当前对手；击倒或撤退后不再开放。');
}

export function nuzlockeFaint(mon: Pokemon) {
	const state = mon.battle.fantasyRogue, rules = state?.nuzlocke, id = mon.set.fantasyRogueId;
	if (!rules || mon.side.id !== 'p1' || !id || rules.dead.includes(id)) return;
	rules.dead.push(id);
	mon.battle.send('fantasyroguenuzlocke', JSON.stringify(rules));
	mon.battle.add('-message', `Nuzlocke：${mon.name}已在本局永久死亡，不能复活或再次出战。`);
}
