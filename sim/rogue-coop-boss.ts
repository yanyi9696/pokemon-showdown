import type { Battle } from './battle';
import type { Pokemon } from './pokemon';
import type { Side } from './side';
import type { RogueBattleState } from './fantasy-rogue';

/** Trusted campaign flag; an ordinary Multi battle still requires four nonempty teams. */
export function isCoopBossBattle(battle: Battle) {
	return isCoopBossState(battle.format.id, battle.fantasyRogue);
}
export function isCoopBossState(format: string, state?: RogueBattleState) {
	return format === 'gen9fantasyroguecoop' && state?.persistCoop === true &&
		state.cooperative?.singleOpponent === true && ['summit', 'arceus'].includes(state.boss?.kind || '');
}
export function emptyCoopBossSide(side: Side) {
	return side.id === 'p4' && isCoopBossBattle(side.battle);
}
/** Derive from freshly computed base HP, never multiply a previous health bar or a restored value. */
export function coopBossMaxHP(pokemon: Pokemon, hp: number) {
	return pokemon.side.id === 'p2' && isCoopBossBattle(pokemon.battle) ? hp * 2 : hp;
}
