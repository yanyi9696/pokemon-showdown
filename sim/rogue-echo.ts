import type { Pokemon } from './pokemon';

export const ECHO_TYPES: Record<string, string> = { Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰',
	Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能力', Bug: '虫', Rock: '岩石',
	Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精' };
export const ECHO_SYSTEMS = { mega: '超进化', z: 'Z 招式', tera: '太晶化', gmega: '超巨进化' } as const;
export const ECHO_RULES = { cost: 10, systemCost: 50, exchange: 100, power: 1.1, damage: 0.9, chanceStep: 0.1, chanceCap: 5 } as const;
export interface EchoUpgrades {
	types: string[];
	guard: boolean;
	shiny: number;
	catch: number;
	systems: (keyof typeof ECHO_SYSTEMS)[];
}
export interface CollapseEcho { unlocked: boolean; points: number; earned: number; upgrades: EchoUpgrades; introSeen?: boolean }
export const emptyEchoUpgrades = (): EchoUpgrades => ({ types: [], guard: false, shiny: 0, catch: 0, systems: [] });
export function echoChance(level = 0) { return 1 + Math.max(0, Math.min(ECHO_RULES.chanceCap, level)) * ECHO_RULES.chanceStep; }
function playerEcho(pokemon: Pokemon) {
	return !pokemon.battle.fantasyRogue?.duel && (pokemon.side.id === 'p1' || pokemon.side.id === 'p3') ?
		pokemon.battle.fantasyRogue?.echo : undefined;
}
export function echoPowerMultiplier(source: Pokemon, move: Move | ActiveMove) {
	return playerEcho(source)?.types.includes(move.type) ? ECHO_RULES.power : 1;
}
export function echoPower(power: number, source: Pokemon, move: ActiveMove) {
	return source.battle.modify(power, echoPowerMultiplier(source, move));
}
/** Only incoming opposing direct moves; not confusion, recoil, HP payment or residual damage. */
export function echoDamage(damage: number, target: Pokemon, source: Pokemon | null, effect: Effect) {
	if (!playerEcho(target)?.guard || !source || source.isAlly(target) || effect.effectType !== 'Move' ||
		(effect as Move).ohko || (effect as Move).category === 'Status') return damage;
	return target.battle.modify(damage, ECHO_RULES.damage);
}
