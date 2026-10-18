import type { Pokemon } from './pokemon';

export type FantasyMovePowers = Record<string, { power: number, source: string }>;

/** Preview the next use without calling callbacks which advance their own counters. */
export function fantasyMovePowers(pokemon: Pokemon): FantasyMovePowers {
	const result: FantasyMovePowers = {};
	if (pokemon.battle.dex.currentMod !== 'gen9fantasy') return result;
	for (const id of pokemon.moves) {
		const base = pokemon.battle.dex.moves.get(id).basePower;
		const state = pokemon.volatiles[id];
		if (id === 'furycutter') {
			result[id] = { power: Math.min(160, base * (state ? Math.min(4, state.multiplier * 2) : 1)), source: '连斩·连续命中' };
		} else if (id === 'rollout' || id === 'iceball') {
			result[id] = { power: base * 2 ** (state?.hitCount ? state.contactHitCount : 0) *
				(pokemon.volatiles.defensecurl ? 2 : 1), source: (id === 'rollout' ? '滚动' : '冰球') +
					'·连续命中' + (pokemon.volatiles.defensecurl ? '＋变圆' : '') };
		} else if (id === 'echoedvoice') {
			const echo = pokemon.battle.field.pseudoWeather.echoedvoice;
			result[id] = { power: base * (echo ? Math.min(5, echo.multiplier + (echo.duration === 2 ? 0 : 1)) : 1),
				source: '回声·连续回合' };
		}
	}
	return result;
}
