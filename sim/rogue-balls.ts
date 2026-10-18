import type { Battle } from './battle';
import type { RogueBattleState } from './fantasy-rogue';

export interface RogueBallRule {
	types?: string[]; bonus?: number;
	condition?: 'water' | 'dark' | 'quick' | 'timer' | 'repeat' | 'nest' | 'sleep' | 'ultra';
}
/** Shared by the displayed probability and the actual capture roll. */
export function rogueBallMultiplier(battle: Battle, ball: RogueBattleState['balls'][number]) {
	const rule = ball.rule, state = battle.fantasyRogue!, target = battle.p2.active[0];
	const base = ball.multiplier || 1;
	if (!rule) return base;
	if (rule.types?.some(type => target.getTypes().includes(type))) return rule.bonus || 3;
	switch (rule.condition) {
	case 'water': return state.captureEnvironment?.water ? 3.5 : base;
	case 'dark': return state.captureEnvironment?.dark ? 3 : base;
	case 'quick': return battle.turn === 1 ? 5 : base;
	case 'timer': return Math.min(4, 1 + 0.3 * Math.max(0, battle.turn - 1));
	case 'repeat': return state.caughtSpeciesIds?.includes(target.species.id) ? 3.5 : base;
	case 'nest': return Math.max(1, (41 - target.level) / 10);
	case 'sleep': return target.status === 'slp' ? 4 : base;
	case 'ultra': return target.species.tags.includes('Ultra Beast') ? 5 : 0.1;
	}
	return base;
}
