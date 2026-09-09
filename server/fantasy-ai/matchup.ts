import { Battle } from '../../sim/battle';
import { toID } from '../../sim/dex';
import { Teams } from '../../sim/teams';
import type { Pokemon } from '../../sim/pokemon';
import { HAZARDS, hazardLayers, sameHazards, type HazardChange, type HazardID } from './hazards';
import type { Combatant } from './hypotheses';
import type { BattleMemory, SinglesSide } from './memory';
import { FANTASY_VOLATILES, restoreDelayedHealing, restoreFantasyState } from './fantasy-state';
import { statusCost } from './mechanics';

const PROBE_SEEDS = ['gen5,0001000200030004', 'gen5,0011001200130014'] as const;
const SIMPLE_VOLATILES = new Set([
	'confusion', 'taunt', 'torment', 'healblock', 'ingrain', 'aquaring', 'magnetrise', 'telekinesis',
	'focusenergy', 'roost', 'auraburstspe', 'auraburstatk', 'auraburstspa', 'auraburstdef', 'auraburstspd', 'auraburstall',
	'saltcure', 'destinybond', 'gemdefensepermanentboost',
	...FANTASY_VOLATILES,
	'flashfire', 'charge',
]);
const SELF_BENEFITS = new Set([
	'protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'endure',
	'substitute', 'focusenergy', 'aquaring', 'ingrain', 'magnetrise', 'charge', 'twoturnmove', 'bide',
	'gempermanentboost', 'gemdefensepermanentboost', 'fantasyultraenergyboost',
]);
const TARGET_HINDRANCES = new Set([
	'confusion', 'taunt', 'torment', 'healblock', 'leechseed', 'encore', 'disable', 'yawn', 'nightmare', 'curse',
	'perishsong', 'embargo', 'gastroacid', 'smackdown', 'saltcure', 'attract', 'partiallytrapped',
]);

export interface MoveEstimate {
	damage: number;
	knockout: number;
	healing: number;
	selfDamage: number;
	delayedHealing: number;
	utility: number;
	/** Item loss/stat drops imposed on the target, excluding the user's own healing/protection. */
	disruption: number;
	pivot: number;
	/** Fraction of successful probes proving no progress, excluding temporary failures and missing state. */
	ineffective: number;
	boosts: number;
	status: number;
	field: number;
	hazardChanges: HazardChange[];
	volatile: number;
	accuracy: number;
	speed: number;
	opponentSpeed: number;
	priority: number;
	omittedVolatiles: string[];
	/** Defensive profile immediately after a special mechanic, before using the move. */
	userAfterMechanic?: Combatant;
	/** Includes boosts attached to attacks, not just pure setup; also checks immunity after setup. */
	userAfterMove?: Combatant;
	/** Native status outcomes for bounded follow-up probes (e.g. Will-O-Wisp into Infernal Parade). */
	targetAfterStatus?: { profile: Combatant, probability: number }[];
}

function afterMove(mon: Pokemon, profile: Combatant): Combatant {
	return {
		...profile, species: mon.species.name, stats: { hp: mon.maxhp, ...mon.storedStats },
		ability: mon.ability, item: mon.item, types: mon.getTypes(), status: mon.status,
		terastallized: mon.terastallized || undefined, boosts: { ...mon.boosts },
		volatiles: Object.keys(mon.volatiles), health: { lower: mon.hp / mon.maxhp, upper: mon.hp / mon.maxhp },
	};
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
		// A probe contains no bench. Supply only the disclosed/hypothesized reserve
		// count to native pivot eligibility checks; never invent bench attackers for Beat Up etc.
		const canSwitch = battle.canSwitch.bind(battle);
		battle.canSwitch = team => [attacker, defender][team.n].reserves ?? canSwitch(team);
		battle.format.onBegin?.call(battle);
		for (const rule of battle.ruleTable.keys()) {
			if (!'+*-!'.includes(rule.charAt(0))) battle.dex.formats.get(rule).onBegin?.call(battle);
		}
		for (const [index, profile] of [attacker, defender].entries()) {
			const team = battle.sides[index];
			const mon = team.pokemon[0];
			team.active[0] = mon;
			mon.isActive = mon.isStarted = true;
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
			restoreFantasyState(battle, mon, profile);
			for (const id of profile.volatiles) {
				if (!SIMPLE_VOLATILES.has(id)) { omittedVolatiles.push(id); continue; }
				mon.volatiles[id] = battle.initEffectState({ id, target: mon });
			}
			const sourceSide = index === 0 ? side : side === 'p1' ? 'p2' : 'p1';
			for (const [id, layers] of Object.entries(memory.sides[sourceSide].conditions)) {
				team.sideConditions[id] = battle.initEffectState({ id, target: team, layers });
			}
		}
		for (const [index, profile] of [attacker, defender].entries()) {
			const sourceSide = index === 0 ? side : side === 'p1' ? 'p2' : 'p1';
			omittedVolatiles.push(...restoreDelayedHealing(battle, battle.sides[index], memory.sides[sourceSide],
				appearance => appearance === profile.appearance ? battle.sides[index].active[0] : undefined, true));
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
	memory: BattleMemory, side: SinglesSide, samples: number = PROBE_SEEDS.length,
): MoveEstimate {
	const result: MoveEstimate = {
		damage: 0, knockout: 0, healing: 0, selfDamage: 0, delayedHealing: 0, utility: 0,
		disruption: 0, pivot: 0, ineffective: 0,
		boosts: 0, status: 0, field: 0, hazardChanges: [], volatile: 0,
		accuracy: 0, speed: 0, opponentSpeed: 0, priority: 0, omittedVolatiles: [],
	};
	const sampleCount = Math.max(1, Math.min(PROBE_SEEDS.length, samples));
	for (let sample = 0; sample < sampleCount; sample++) {
		const { battle, omittedVolatiles } = createMatchup(format, attacker, defender, memory, side, sample);
		try {
			applyMechanic(battle, event);
			const source = battle.p1.active[0];
			const target = battle.p2.active[0];
			if (event && !result.userAfterMechanic) {
				result.userAfterMechanic = afterMove(source, attacker);
			}
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
			const ownStatusBefore = source.status;
			const beforeBoosts = { ...source.boosts };
			const targetBoostsBefore = { ...target.boosts };
			const beforeVolatiles = Object.keys(target.volatiles);
			const ownVolatilesBefore = Object.keys(source.volatiles);
			const targetItemBefore = target.item;
			const slotBefore = move.slotCondition && source.side.slotConditions[source.position][move.slotCondition];
			const conditionSide = move.target === 'allySide' ? source.side : target.side;
			const conditionBefore = move.sideCondition ? conditionSide.sideConditions[move.sideCondition] : undefined;
			const ownHazardsBefore = hazardLayers(source.side.sideConditions);
			const foeHazardsBefore = hazardLayers(target.side.sideConditions);
			const weatherBefore = battle.field.weather;
			const terrainBefore = battle.field.terrain;
			result.speed += source.getStat('spe') / sampleCount;
			result.opponentSpeed += target.getStat('spe') / sampleCount;
			result.priority = battle.runEvent('ModifyPriority', source, target, move, move.priority);
			const zMove = event === 'zmove' ? battle.actions.getZMove(move, source) : undefined;
			const cursor = battle.log.length;
			const didSomething = battle.actions.useMove(move, source, { target, zMove });
			const factor = hitChance / sampleCount;
			const ownHazards = hazardLayers(source.side.sideConditions);
			const foeHazards = hazardLayers(target.side.sideConditions);
			// Observe actual side effects: this also handles extra layers, reflection,
			// failed spins/Defog, Court Change, and hazards attached to damaging moves.
			if (!sameHazards(ownHazardsBefore, ownHazards) || !sameHazards(foeHazardsBefore, foeHazards)) {
				result.hazardChanges.push({ own: ownHazards, foe: foeHazards, probability: factor });
			}
			result.accuracy += factor;
			result.damage += Math.max(0, targetHP - target.hp) / target.maxhp * factor;
			result.knockout += (target.hp <= 0 ? 1 : 0) * factor;
			result.healing += Math.max(0, source.hp - beforeHP) / source.maxhp * factor;
			result.selfDamage += Math.max(0, beforeHP - source.hp) / source.maxhp * factor;
			const targetAfter = afterMove(target, defender);
			const statusValue = beforeStatus !== target.status ?
				(statusCost(targetAfter, memory, battle.dex) - statusCost(defender, memory, battle.dex)) / 12 : 0;
			if (beforeStatus !== target.status && target.hp > 0) {
				(result.targetAfterStatus ||= []).push({ profile: targetAfter, probability: factor });
			}
			result.status += statusValue * factor;
			const newTargetEffects = Object.keys(target.volatiles).filter(id => !beforeVolatiles.includes(id));
			const hindrance = newTargetEffects.some(id => TARGET_HINDRANCES.has(id));
			const helpedTarget = newTargetEffects.some(id => id === 'flashfire' || SELF_BENEFITS.has(id));
			result.volatile += (Number(hindrance) - Number(helpedTarget)) * factor;
			let utility = Object.keys(source.volatiles).some(id =>
				!ownVolatilesBefore.includes(id) && SELF_BENEFITS.has(id)) ? 1 : 0;
			let disruption = targetItemBefore && !target.item ? 1 : 0;
			if (ownStatusBefore !== source.status) {
				utility += (statusCost(attacker, memory, battle.dex) -
					statusCost(afterMove(source, attacker), memory, battle.dex)) / 12;
			}
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const) {
				if (['atk', 'spa'].includes(stat) && !defender.moves.some(id =>
					battle.dex.moves.get(id).category === (stat === 'atk' ? 'Physical' : 'Special'))) continue;
				disruption += (targetBoostsBefore[stat] - target.boosts[stat]) * 0.5;
			}
			utility += disruption;
			result.disruption += disruption * factor;
			result.utility += utility * factor;
			result.pivot += source.switchFlag ? factor : 0;
			const pendingHeal = move.slotCondition ? source.side.slotConditions[source.position][move.slotCondition] : undefined;
			const delayedHeal = !slotBefore && pendingHeal?.hp ? pendingHeal.hp / source.maxhp : 0;
			result.delayedHealing += delayedHeal * factor;
			const newFieldCondition = move.sideCondition && !HAZARDS.includes(move.sideCondition as HazardID) &&
				!conditionBefore && conditionSide.sideConditions[move.sideCondition];
			if (
				newFieldCondition ||
				weatherBefore !== battle.field.weather || terrainBefore !== battle.field.terrain
			) result.field += factor;
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) {
				const relevant = !['atk', 'spa'].includes(stat) || attacker.moves.some(id =>
					battle.dex.moves.get(id).category === (stat === 'atk' ? 'Physical' : 'Special'));
				if (relevant) result.boosts += (source.boosts[stat] - beforeBoosts[stat]) * factor;
			}
			if (!result.userAfterMove && (ownStatusBefore !== source.status ||
				Object.keys(source.boosts).some(stat => source.boosts[stat as BoostID] !== beforeBoosts[stat as BoostID]))) {
				result.userAfterMove = afterMove(source, attacker);
			}
			const progressed = target.hp < targetHP || source.hp > beforeHP || delayedHeal > 0 || utility > 0 ||
				source.switchFlag || statusValue > 0 || hindrance ||
				Object.keys(source.boosts).some(stat => source.boosts[stat as BoostID] > beforeBoosts[stat as BoostID]) ||
				!sameHazards(ownHazardsBefore, ownHazards) || !sameHazards(foeHazardsBefore, foeHazards) ||
				newFieldCondition || weatherBefore !== battle.field.weather || terrainBefore !== battle.field.terrain;
			const log = battle.log.slice(cursor);
			const temporary = log.some(line => /\|(?:-miss|-prepare|cant)\|/.test(line) ||
				/\|-activate\|[^|]+\|move: (?:Protect|Detect|King's Shield|Spiky Shield|Baneful Bunker|Silk Trap|Burning Bulwark)/.test(line));
			const immune = log.some(line => line.startsWith('|-immune|p2'));
			if (!progressed && !temporary && !omittedVolatiles.length &&
				(!didSomething || immune || helpedTarget || statusValue < 0 || utility < 0)) {
				result.ineffective += 1 / sampleCount;
			}
			result.omittedVolatiles = [...new Set([...result.omittedVolatiles, ...omittedVolatiles])];
		} finally {
			battle.destroy();
		}
	}
	return result;
}
