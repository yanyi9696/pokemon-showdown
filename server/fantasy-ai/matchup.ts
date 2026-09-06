import { Battle } from '../../sim/battle';
import { toID } from '../../sim/dex';
import { Teams } from '../../sim/teams';
import type { Combatant } from './hypotheses';
import type { BattleMemory, SinglesSide } from './memory';

const PROBE_SEEDS = ['gen5,0001000200030004', 'gen5,0011001200130014'] as const;
const SIMPLE_VOLATILES = new Set([
	'confusion', 'taunt', 'torment', 'healblock', 'ingrain', 'aquaring', 'magnetrise', 'telekinesis',
	'focusenergy', 'roost', 'auraburstspe', 'auraburstatk', 'auraburstspa', 'auraburstall',
]);

export interface MoveEstimate {
	damage: number;
	knockout: number;
	healing: number;
	selfDamage: number;
	boosts: number;
	status: number;
	field: number;
	volatile: number;
	accuracy: number;
	speed: number;
	opponentSpeed: number;
	priority: number;
	omittedVolatiles: string[];
}

/** Construct an isolated two-Pokemon matchup from data, never from a real battle. */
export function createMatchup(
	format: string, attacker: Combatant, defender: Combatant, memory: BattleMemory, side: SinglesSide, sample = 0,
): { battle: Battle, omittedVolatiles: string[] } {
	const set = (mon: Combatant) => ({
		species: mon.species, level: mon.level, ability: mon.ability, item: mon.item,
		moves: mon.moves, teraType: mon.teraType,
	});
	const battle = new Battle({
		formatid: toID(format), seed: PROBE_SEEDS[sample % PROBE_SEEDS.length], deserialized: true,
		p1: { team: Teams.pack([set(attacker) as PokemonSet]) }, p2: { team: Teams.pack([set(defender) as PokemonSet]) },
	});
	const omittedVolatiles: string[] = [];
	try {
		battle.p1.foe = battle.p2;
		battle.p2.foe = battle.p1;
		battle.started = true;
		battle.turn = memory.turn;
		for (const [index, profile] of [attacker, defender].entries()) {
			const team = battle.sides[index];
			const mon = team.pokemon[0];
			team.active[0] = mon;
			mon.isActive = true;
			mon.activeTurns = 1;
			mon.baseStoredStats = { ...profile.stats };
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) mon.storedStats[stat] = profile.stats[stat];
			mon.baseMaxhp = mon.maxhp = profile.stats.hp;
			mon.hp = Math.max(1, Math.ceil(profile.health.upper * mon.maxhp));
			mon.status = profile.status === 'fnt' ? '' as ID : profile.status as ID;
			mon.statusState = battle.initEffectState({ id: mon.status, target: mon });
			Object.assign(mon.boosts, profile.boosts);
			if (profile.types?.length) mon.setType(profile.types, true);
			if (profile.terastallized) mon.terastallized = profile.terastallized;
			for (const id of profile.volatiles) {
				if (!SIMPLE_VOLATILES.has(id)) { omittedVolatiles.push(id); continue; }
				mon.volatiles[id] = battle.initEffectState({ id, target: mon });
			}
			const sourceSide = index === 0 ? side : side === 'p1' ? 'p2' : 'p1';
			for (const [id, layers] of Object.entries(memory.sides[sourceSide].conditions)) {
				team.sideConditions[id] = battle.initEffectState({ id, target: team, layers });
			}
		}
		battle.field.weather = memory.weather as ID;
		battle.field.weatherState = battle.initEffectState({ id: memory.weather });
		battle.field.terrain = memory.terrain as ID;
		battle.field.terrainState = battle.initEffectState({ id: memory.terrain });
		for (const id of memory.pseudoWeather) battle.field.pseudoWeather[id] = battle.initEffectState({ id });
		return { battle, omittedVolatiles };
	} catch (error) {
		battle.destroy();
		throw error;
	}
}

function applyMechanic(battle: Battle, event: string) {
	const mon = battle.p1.active[0];
	const before = mon.species;
	const stats = { ...mon.baseStoredStats };
	const hpLost = mon.maxhp - mon.hp;
	if (event === 'terastallize') battle.actions.terastallize(mon);
	if (event === 'mega' || event === 'ultra') {
		if (event === 'mega') mon.canUltraBurst = null;
		else mon.canMegaEvo = null;
		battle.actions.runMegaEvo(mon);
	}
	if (event === 'megax') battle.actions.runMegaEvoX?.(mon);
	if (event === 'megay') battle.actions.runMegaEvoY?.(mon);
	if (mon.species.id !== before.id) {
		// Exact initial stats do not reveal nature/EVs. Project the base-stat
		// difference for this heuristic probe; full-turn hypotheses will refine it.
		for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
			const projected = Math.max(1, stats[stat] + Math.floor(2 *
				(mon.species.baseStats[stat] - before.baseStats[stat]) * mon.level / 100));
			mon.baseStoredStats[stat] = projected;
			if (stat !== 'hp') mon.storedStats[stat] = projected;
		}
		mon.baseMaxhp = mon.maxhp = mon.baseStoredStats.hp;
		mon.hp = Math.max(1, mon.maxhp - hpLost);
	}
}

/**
 * A native single-move probe, not a full-turn rollout. Accuracy is scored
 * separately; non-guaranteed critical hits are excluded. All mutations and
 * random samples are confined to fresh, hypothetical matchups.
 */
export function estimateMove(
	format: string, attacker: Combatant, defender: Combatant, moveID: string, event: string,
	memory: BattleMemory, side: SinglesSide,
): MoveEstimate {
	const result: MoveEstimate = {
		damage: 0, knockout: 0, healing: 0, selfDamage: 0, boosts: 0, status: 0, field: 0, volatile: 0,
		accuracy: 0, speed: 0, opponentSpeed: 0, priority: 0, omittedVolatiles: [],
	};
	for (let sample = 0; sample < PROBE_SEEDS.length; sample++) {
		const { battle, omittedVolatiles } = createMatchup(format, attacker, defender, memory, side, sample);
		try {
			applyMechanic(battle, event);
			const source = battle.p1.active[0];
			const target = battle.p2.active[0];
			const move = battle.dex.getActiveMove(moveID);
			let hitChance = 1;
			const nativeAccuracy = battle.actions.hitStepAccuracy.bind(battle.actions);
			battle.actions.hitStepAccuracy = (targets, pokemon, activeMove) => {
				// Let the engine apply weather, abilities, stages, OHKO and Z-move
				// accuracy rules, then measure a hit without sampling it twice.
				const randomChance = battle.randomChance;
				battle.randomChance = (numerator, denominator) => {
					const chance = Math.max(0, Math.min(1, numerator / denominator));
					hitChance *= chance;
					return chance > 0;
				};
				try {
					return nativeAccuracy(targets, pokemon, activeMove);
				} finally {
					battle.randomChance = randomChance;
				}
			};
			if (move.willCrit === undefined) move.willCrit = false;
			const beforeHP = source.hp;
			const targetHP = target.hp;
			const beforeStatus = target.status;
			const beforeBoosts = { ...source.boosts };
			const beforeVolatiles = Object.keys(target.volatiles);
			const conditionSide = move.target === 'allySide' ? source.side : target.side;
			const conditionBefore = move.sideCondition ? conditionSide.sideConditions[move.sideCondition] : undefined;
			const weatherBefore = battle.field.weather;
			const terrainBefore = battle.field.terrain;
			result.speed += source.getStat('spe') / PROBE_SEEDS.length;
			result.opponentSpeed += target.getStat('spe') / PROBE_SEEDS.length;
			result.priority = battle.runEvent('ModifyPriority', source, target, move, move.priority);
			const zMove = event === 'zmove' ? battle.actions.getZMove(move, source) : undefined;
			battle.actions.useMove(move, source, { target, zMove });
			const factor = hitChance / PROBE_SEEDS.length;
			result.accuracy += factor;
			result.damage += Math.max(0, targetHP - target.hp) / target.maxhp * factor;
			result.knockout += (target.hp <= 0 ? 1 : 0) * factor;
			result.healing += Math.max(0, source.hp - beforeHP) / source.maxhp * factor;
			result.selfDamage += Math.max(0, beforeHP - source.hp) / source.maxhp * factor;
			result.status += (!beforeStatus && target.status ? 1 : 0) * factor;
			if (Object.keys(target.volatiles).some(id => !beforeVolatiles.includes(id))) result.volatile += factor;
			if (
				(move.sideCondition && !conditionBefore && conditionSide.sideConditions[move.sideCondition]) ||
				(move.weather && weatherBefore !== battle.field.weather) ||
				(move.terrain && terrainBefore !== battle.field.terrain)
			) result.field += factor;
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) {
				const relevant = !['atk', 'spa'].includes(stat) || attacker.moves.some(id =>
					battle.dex.moves.get(id).category === (stat === 'atk' ? 'Physical' : 'Special'));
				if (relevant) result.boosts += (source.boosts[stat] - beforeBoosts[stat]) * factor;
			}
			result.omittedVolatiles = [...new Set([...result.omittedVolatiles, ...omittedVolatiles])];
		} finally {
			battle.destroy();
		}
	}
	return result;
}
