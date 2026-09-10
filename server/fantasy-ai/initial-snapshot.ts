import type { Battle } from '../../sim/battle';

export interface OpponentMoves {
	species: string;
	moves: string[];
}

export interface InitialPokemon extends OpponentMoves {
	level: number;
	item: string;
	ability: string;
	teraType: string;
	stats: StatsTable;
}

/** Both difficulties may know moves, without learning another configuration field or team order. */
export function copyOpponentMoves(team: readonly OpponentMoves[]): OpponentMoves[] {
	return team.map(mon => ({ species: mon.species, moves: mon.moves.slice().sort() }))
		.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/** Copy a whitelist, with no team position, nickname or dynamic state. */
export function copyInitialTeam(team: readonly InitialPokemon[]): InitialPokemon[] {
	return team.map(pokemon => ({
		species: pokemon.species,
		level: pokemon.level,
		moves: pokemon.moves.slice().sort(),
		item: pokemon.item,
		ability: pokemon.ability,
		teraType: pokemon.teraType,
		stats: {
			hp: pokemon.stats.hp, atk: pokemon.stats.atk, def: pokemon.stats.def,
			spa: pokemon.stats.spa, spd: pokemon.stats.spd, spe: pokemon.stats.spe,
		},
	})).sort((a, b) => {
		const left = JSON.stringify(a);
		const right = JSON.stringify(b);
		return left < right ? -1 : left > right ? 1 : 0;
	});
}

/**
 * Trusted simulator-side adapter. Call once at team preview, before passing
 * JSON to an AI. Never send these snapshots to clients or public logs.
 * The decision code receives its result, never the Battle passed here.
 */
function initialPokemon(battle: Battle, side: 'p1' | 'p2') {
	if (battle.gameType !== 'singles' || battle.requestState !== 'teampreview' || battle.turn !== 0) {
		throw new Error('初始快照只能在单打队伍预览阶段采集。');
	}
	const pokemon = battle.getSide(side).pokemon;
	if (pokemon.length !== 6) throw new Error('初始快照要求六只宝可梦。');
	return pokemon;
}

export function captureInitialMoves(battle: Battle, side: 'p1' | 'p2'): OpponentMoves[] {
	return copyOpponentMoves(initialPokemon(battle, side).map(mon => ({
		species: mon.species.name, moves: mon.baseMoveSlots.map(move => move.id),
	})));
}

export function captureInitialTeam(battle: Battle, side: 'p1' | 'p2'): InitialPokemon[] {
	return copyInitialTeam(initialPokemon(battle, side).map(mon => ({
		species: mon.species.name,
		level: mon.level,
		moves: mon.baseMoveSlots.map(move => move.id),
		item: mon.item,
		ability: mon.baseAbility,
		teraType: mon.teraType,
		stats: mon.baseStoredStats,
	})));
}
