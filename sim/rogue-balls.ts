import type { Battle } from './battle';
import { Dex } from './dex';
import type { RogueBattleState } from './fantasy-rogue';

export interface RogueBallRule {
	types?: string[]; bonus?: number;
	condition?: 'water' | 'dark' | 'quick' | 'timer' | 'repeat' | 'nest' | 'sleep' | 'ultra' |
		'fast' | 'level' | 'fishing' | 'heavy' | 'love' | 'moon';
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
	case 'fast': return target.species.baseStats.spe >= 100 ? 4 : base;
	case 'fishing': return state.captureEnvironment?.fishing ? 4 : base;
	case 'level': {
		const level = battle.p1.active[0]?.level || 0;
		return level >= target.level * 4 ? 8 : level >= target.level * 2 ? 4 : level > target.level ? 2 : base;
	}
	case 'love': {
		const player = battle.p1.active[0];
		return player?.gender && target.gender && player.gender !== target.gender &&
			player.baseSpecies.baseSpecies === target.baseSpecies.baseSpecies ? 8 : base;
	}
	case 'moon': {
		const dex = Dex.mod('gen9');
		let species = dex.species.get(target.baseSpecies.baseSpecies);
		while (species.prevo) species = dex.species.get(species.prevo);
		const family = [species];
		for (const member of family) {
			if (member.evoItem === 'Moon Stone') return 4;
			for (const name of member.evos) family.push(dex.species.get(name));
		}
		return base;
	}
	}
	return base;
}

export function rogueBallCatchRate(battle: Battle, ball: RogueBattleState['balls'][number], rate: number) {
	if (ball.rule?.condition !== 'heavy') return rate;
	const weight = battle.p2.active[0].species.weightkg;
	return Math.max(1, Math.min(255, rate + (weight >= 300 ? 30 : weight >= 200 ? 20 : weight < 100 ? -20 : 0)));
}
