import { Battle } from '../../sim/battle';
import { Dex, toID } from '../../sim/dex';
import { Teams } from '../../sim/teams';
import type { Pokemon } from '../../sim/pokemon';
import { HAZARDS, hazardLayers, sameHazards, type HazardChange, type HazardID } from './hazards';
import type { Combatant } from './hypotheses';
import type { BattleMemory, SinglesSide } from './memory';
import { FANTASY_VOLATILES, restoreDelayedHealing, restoreFantasyState } from './fantasy-state';
import { statusCost } from './mechanics';
import { compatibleSpreads } from './sets';

const PROBE_SEEDS = ['gen5,0001000200030004', 'gen5,0011001200130014'] as const;
const SIMPLE_VOLATILES = new Set([
	'confusion', 'taunt', 'torment', 'healblock', 'ingrain', 'aquaring', 'magnetrise', 'telekinesis',
	'focusenergy', 'roost', 'auraburstspe', 'auraburstatk', 'auraburstspa', 'auraburstdef', 'auraburstspd', 'auraburstall',
	'saltcure', 'destinybond', 'gemdefensepermanentboost',
	...FANTASY_VOLATILES,
	'flashfire', 'charge', 'imprison', 'substitute', 'stall', 'encore', 'disable',
	'gastroacid', 'embargo', 'smackdown',
	'trapped', 'partiallytrapped',
	'yuannengshifang', 'shiyingli',
	'protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'endure',
]);
const SELF_BENEFITS = new Set([
	'protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'endure',
	'substitute', 'focusenergy', 'aquaring', 'ingrain', 'magnetrise', 'charge', 'twoturnmove', 'bide', 'destinybond',
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
	/** Signed probability of actually starting (+1) or ending (-1) Trick Room. */
	trickRoom: number;
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
	/** Conditional on getting to act; preserves native form, barrier, and protection outcomes. */
	postAction?: { profile: Combatant, probability: number }[];
	protection?: number;
	substituteDamage?: number;
	substituteBroken?: number;
	/** A native direct-attack knockout also faints its attacker (e.g. Destiny Bond). */
	selfKnockout?: number;
	destinyBond?: number;
	targetAfterMove?: { profile: Combatant, probability: number }[];
	/** Native environment after a weather, terrain or screen-changing move. */
	fieldAfter?: ProbeField;
	/** Damage-roll bounds for a single hit, before clipping to the target's current HP. */
	damageRange?: { min: number, max: number };
}

export interface ProbeField {
	weather: string;
	terrain: string;
	pseudoWeather: string[];
	conditions: Record<SinglesSide, Record<string, number>>;
}

function captureField(battle: Battle, side: SinglesSide): ProbeField {
	const conditions = (index: number) => Object.fromEntries(Object.entries(battle.sides[index].sideConditions)
		.filter(([, state]) => !!state).map(([id, state]) => [id, state.layers || 1]));
	const foe = side === 'p1' ? 'p2' : 'p1';
	return { weather: battle.field.weather, terrain: battle.field.terrain,
		pseudoWeather: Object.keys(battle.field.pseudoWeather),
		conditions: { [side]: conditions(0), [foe]: conditions(1) } as ProbeField['conditions'] };
}

export function withProbeField(memory: BattleMemory, field: ProbeField): BattleMemory {
	return { ...memory, weather: field.weather, terrain: field.terrain, pseudoWeather: field.pseudoWeather,
		sides: { p1: { ...memory.sides.p1, conditions: field.conditions.p1 },
			p2: { ...memory.sides.p2, conditions: field.conditions.p2 } } };
}

/** Conditional priority moves need a hypothetical queued reply, never the live opponent queue. */
export const CONDITIONAL_ATTACKS = new Set(['suckerpunch', 'thunderclap', 'upperhand']);

const spreadCache = new Map<string, ReturnType<typeof compatibleSpreads>>();
function probeSpread(format: string, mon: Combatant, sample: number) {
	if (mon.spread) return mon.spread;
	if (mon.ability !== 'stancechange') return {};
	const key = JSON.stringify([format, mon.species, mon.level, mon.stats]);
	let spreads = spreadCache.get(key);
	if (!spreads) {
		const stats = { ...mon.stats };
		if (format === 'gen9fantasyrogue' && mon.rogueBoosts) {
			for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) stats[stat] -= mon.rogueBoosts[stat];
		}
		spreads = compatibleSpreads(Dex.forFormat(format), mon.species, mon.level, stats);
		if (spreadCache.size >= 128) spreadCache.clear();
		spreadCache.set(key, spreads);
	}
	return spreads[sample % spreads.length] || {};
}

function afterMove(mon: Pokemon, profile: Combatant): Combatant {
	return {
		...profile, species: mon.species.name, stats: { hp: mon.maxhp, ...mon.storedStats },
		ability: mon.ability, item: mon.item, types: mon.getTypes(), status: mon.status,
		terastallized: mon.terastallized || undefined, boosts: { ...mon.boosts },
		volatiles: Object.keys(mon.volatiles), health: { lower: mon.hp / mon.maxhp, upper: mon.hp / mon.maxhp },
		substituteHP: mon.volatiles.substitute ? {
			lower: mon.volatiles.substitute.hp / mon.maxhp, upper: mon.volatiles.substitute.hp / mon.maxhp,
		} : undefined,
		protectCounter: mon.volatiles.stall?.counter,
		lastMove: mon.lastMove?.id,
		activeMoveActions: mon.activeMoveActions,
		moveLocks: { encore: mon.volatiles.encore?.move, disable: mon.volatiles.disable?.move },
	};
}

/** Construct an isolated two-Pokemon matchup from data, never from a real battle. */
export function createMatchup(
	format: string, attacker: Combatant, defender: Combatant, memory: BattleMemory, side: SinglesSide, sample = 0,
): { battle: Battle, omittedVolatiles: string[] } {
	const set = (mon: Combatant) => ({
		...probeSpread(format, mon, sample),
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
			if (format === 'gen9fantasyrogue' && profile.rogueBoosts) mon.set.fantasyRogueStats = { ...profile.rogueBoosts };
			team.active[0] = mon;
			mon.isActive = mon.isStarted = true;
			mon.activeTurns = profile.activeMoveActions ? 1 : 0;
			mon.activeMoveActions = profile.activeMoveActions || 0;
			if (mon.species.id !== toID(profile.species)) mon.setSpecies(battle.dex.species.get(profile.species));
			mon.baseStoredStats = { ...profile.stats };
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) mon.storedStats[stat] = profile.stats[stat];
			mon.baseMaxhp = mon.maxhp = profile.stats.hp;
			mon.hp = Math.max(1, Math.ceil(profile.health.upper * mon.maxhp));
			mon.status = profile.status === 'fnt' ? '' as ID : profile.status as ID;
			mon.statusState = battle.initEffectState({ id: mon.status, target: mon });
			if (profile.lastMove) mon.lastMove = battle.dex.getActiveMove(profile.lastMove);
			if (battle.dex.items.get(mon.item).isChoice && profile.lastMove && mon.hasMove(profile.lastMove)) {
				mon.volatiles.choicelock = battle.initEffectState({ id: 'choicelock', target: mon, move: profile.lastMove });
			}
			for (const slot of mon.moveSlots) slot.pp = Math.max(0, slot.maxpp - (profile.moveUses?.[slot.id] || 0));
			Object.assign(mon.boosts, profile.boosts);
			if (profile.types?.length) mon.setType(profile.types, true);
			if (profile.terastallized) mon.terastallized = profile.terastallized;
			restoreFantasyState(battle, mon, profile);
			for (const id of profile.volatiles) {
				if (!SIMPLE_VOLATILES.has(id)) { omittedVolatiles.push(id); continue; }
				mon.volatiles[id] = battle.initEffectState({ id, target: mon, ...(id === 'imprison' ? { source: mon } : {}) });
				if (id === 'substitute') {
					const hp = profile.substituteHP;
					mon.volatiles[id].hp = Math.max(1, Math.floor(mon.maxhp * (hp ? (hp.lower + hp.upper) / 2 : 0.25)));
				}
				if (id === 'encore' || id === 'disable') {
					mon.volatiles[id].move = profile.moveLocks?.[id] || profile.lastMove;
					mon.volatiles[id].duration = 1;
				}
			}
			if (profile.protectCounter) mon.volatiles.stall = battle.initEffectState({
				id: 'stall', target: mon, counter: profile.protectCounter, duration: 1,
			});
			const sourceSide = index === 0 ? side : side === 'p1' ? 'p2' : 'p1';
			for (const [id, layers] of Object.entries(memory.sides[sourceSide].conditions)) {
				team.sideConditions[id] = battle.initEffectState({ id, target: team, layers });
			}
		}
		for (const [index, profile] of [attacker, defender].entries()) {
			const sourceSide = index === 0 ? side : side === 'p1' ? 'p2' : 'p1';
			for (const id of ['trapped', 'partiallytrapped']) {
				const state = battle.sides[index].active[0].volatiles[id];
				if (state) state.source = battle.sides[1 - index].active[0];
			}
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

/** Run the real entry event, including hazards, status, items, Intimidate and field setters. */
export function estimateEntry(
	format: string, entrant: Combatant, opponent: Combatant, memory: BattleMemory, side: SinglesSide,
) {
	const { battle, omittedVolatiles } = createMatchup(format, entrant, opponent, memory, side);
	try {
		const mon = battle.p1.active[0];
		mon.isStarted = false;
		mon.activeTurns = mon.activeMoveActions = 0;
		mon.lastMove = null;
		delete mon.volatiles.choicelock;
		mon.abilityState.effectOrder = battle.effectOrder++;
		mon.itemState.effectOrder = battle.effectOrder++;
		battle.runEvent('BeforeSwitchIn', mon);
		battle.actions.runSwitch(mon);
		const profile = afterMove(mon, entrant);
		// Public HP may be an interval; preserve its width after deterministic entry damage.
		profile.health.lower = Math.max(0, profile.health.upper - (entrant.health.upper - entrant.health.lower));
		return { entrant: profile, opponent: afterMove(battle.p2.active[0], opponent),
			memory: withProbeField(memory, captureField(battle, side)), omittedVolatiles,
			damage: Math.max(0, entrant.health.upper - profile.health.upper) };
	} finally { battle.destroy(); }
}

/** Native trapping rules include Ghosts, groundedness, Shed Shell and custom abilities. */
export function canEscapeMatchup(
	format: string, mon: Combatant, opponent: Combatant, memory: BattleMemory, side: SinglesSide,
): boolean {
	const { battle } = createMatchup(format, mon, opponent, memory, side);
	try {
		battle.runEvent('TrapPokemon', battle.p1.active[0]);
		return !battle.p1.active[0].trapped;
	} finally { battle.destroy(); }
}

/** Legal Mega possibilities from a disclosed/guessed set, never the player's selected mechanic. */
export function possibleMegaForms(
	format: string, profile: Combatant, target: Combatant, memory: BattleMemory, side: SinglesSide,
): Combatant[] {
	if (memory.sides[side].resources.mega || profile.terastallized) return [];
	const { battle } = createMatchup(format, profile, target, memory, side);
	let events: string[];
	try {
		const mon = battle.p1.active[0];
		events = [mon.canMegaEvo && 'mega', mon.canMegaEvoX && 'megax', mon.canMegaEvoY && 'megay']
			.filter((event): event is string => !!event);
	} finally { battle.destroy(); }
	return events.flatMap(event => {
		const matchup = createMatchup(format, profile, target, memory, side).battle;
		try {
			applyMechanic(matchup, event);
			const evolved = afterMove(matchup.p1.active[0], profile);
			return evolved.species === profile.species ? [] : [evolved];
		} finally { matchup.destroy(); }
	});
}

/**
 * A native single-move probe, not a full-turn rollout. Accuracy is scored
 * separately; non-guaranteed critical hits are excluded. All mutations and
 * random samples are confined to fresh, hypothetical matchups.
 */
export function estimateMove(
	format: string, attacker: Combatant, defender: Combatant, moveID: string, event: string,
	memory: BattleMemory, side: SinglesSide, samples: number = PROBE_SEEDS.length,
	reply?: { id: string, event?: string } | null,
): MoveEstimate {
	const result: MoveEstimate = {
		damage: 0, knockout: 0, healing: 0, selfDamage: 0, delayedHealing: 0, utility: 0,
		disruption: 0, pivot: 0, ineffective: 0,
		boosts: 0, status: 0, field: 0, trickRoom: 0, hazardChanges: [], volatile: 0,
		accuracy: 0, speed: 0, opponentSpeed: 0, priority: 0, omittedVolatiles: [],
	};
	const sampleCount = Math.max(1, Math.min(PROBE_SEEDS.length, samples));
	const rolls: { damage: number, hp: number, maxhp: number, calls: number, knockout: boolean, accuracy: number }[] = [];
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
			let rolledDamage = 0;
			let damageCalls = 0;
			const nativeDamage = battle.actions.getDamage.bind(battle.actions);
			battle.actions.getDamage = (...args) => {
				const damage = nativeDamage(...args);
				if (args[0] === source && args[1] === target && typeof damage === 'number') {
					rolledDamage += damage;
					damageCalls++;
				}
				return damage;
			};
			// Two endpoint probes bound ordinary damage rolls without sixteen Battle allocations.
			if (sampleCount === 2) battle.randomizer = base => Math.floor(base * (sample ? 100 : 85) / 100);
			const expiredBond = !!source.volatiles.destinybond && move.id !== 'destinybond';
			if (expiredBond) {
				// useMove omits BeforeMove. Run this native expiry hook without also
				// resampling status-based action failure, which the policy models separately.
				battle.singleEvent('BeforeMove', battle.dex.conditions.get('destinybond'),
					source.volatiles.destinybond, source, target, move);
			}
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
			const beforeSpecies = source.species.id;
			const targetHP = target.hp;
			const substituteHP = target.volatiles.substitute?.hp || 0;
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
			const roomBefore = !!battle.field.pseudoWeather.trickroom;
			const fieldBefore = captureField(battle, side);
			result.speed += source.getStat('spe') / sampleCount;
			result.opponentSpeed += target.getStat('spe') / sampleCount;
			move.priority = battle.runEvent('ModifyPriority', source, target, move, move.priority);
			result.priority = move.priority;
			const zMove = event === 'zmove' ? battle.actions.getZMove(move, source) : undefined;
			if (CONDITIONAL_ATTACKS.has(move.id) && !zMove) {
				// Without a supplied reply this is only potential coverage. RulePolicy
				// later mixes concrete replies; a known switch/status move cannot trigger it.
				const id = reply === undefined ? defender.moves.find(replyID => {
					const other = battle.dex.moves.get(replyID);
					return other.category !== 'Status' && (move.id !== 'upperhand' || other.priority > 0);
				}) : reply?.id;
				if (id) {
					const other = battle.dex.getActiveMove(id);
					other.priority = battle.runEvent('ModifyPriority', target, source, other, other.priority);
					const first = move.priority !== other.priority ? move.priority > other.priority :
						source.getStat('spe') === target.getStat('spe') ? sample === 0 :
						memory.pseudoWeather.includes('trickroom') ? source.getStat('spe') < target.getStat('spe') :
						source.getStat('spe') > target.getStat('spe');
					if (first) battle.queue.addChoice({ choice: 'move', pokemon: target, move: other });
				}
			}
			const cursor = battle.log.length;
			// Respect deterministic move restrictions without resampling sleep/paralysis,
			// which the policy already accounts for via actionOpportunity.
			battle.runEvent('DisableMove', source);
			const disabled = !zMove && source.getMoveData(move)?.disabled;
			let protectionChance = 1;
			if (move.stallingMove) {
				// A protection probe measures the attempt, not a secretly chosen opponent move.
				// A pending placeholder lets the native onPrepareHit check run; it is never executed.
				battle.queue.addChoice({ choice: 'move', pokemon: target, move: 'splash' });
				const nativeRandom = battle.randomChance.bind(battle);
				battle.randomChance = (numerator, denominator) => {
					if (battle.event?.id === 'StallMove') {
						protectionChance *= numerator / denominator;
						return numerator > 0;
					}
					return nativeRandom(numerator, denominator);
				};
			}
			// useMove bypasses runMove's first-action counter (Fake Out / First Impression).
			source.activeMoveActions++;
			const didSomething = !disabled && battle.actions.useMove(move, source, { target, zMove });
			// useMove queues faints; resolve Destiny Bond's native onFaint trade.
			// Other probes do not need to finish an artificial battle here.
			if (target.volatiles.destinybond && battle.faintQueue.length) battle.faintMessages();
			const factor = hitChance / sampleCount;
			result.selfKnockout = (result.selfKnockout || 0) + Number(source.hp <= 0) * factor;
			const protectedNow = !!(move.stallingMove && source.volatiles[move.volatileStatus || move.id]);
			const bonded = move.id === 'destinybond' && !!source.volatiles.destinybond;
			if (bonded) result.destinyBond = (result.destinyBond || 0) + factor;
			if (protectedNow) result.protection = (result.protection || 0) + protectionChance / sampleCount;
			if (beforeSpecies !== source.species.id || protectedNow || bonded || expiredBond || move.id === 'substitute' &&
				!ownVolatilesBefore.includes('substitute') && source.volatiles.substitute) {
				const profile = afterMove(source, attacker);
				(result.postAction ||= []).push({ profile, probability: (protectedNow ? protectionChance : 1) / sampleCount });
				if (protectedNow && protectionChance < 1) {
					result.postAction.push({ profile: { ...profile,
						volatiles: profile.volatiles.filter(id => id !== (move.volatileStatus || move.id) && id !== 'stall'),
					}, probability: (1 - protectionChance) / sampleCount });
				}
			}
			result.substituteDamage = (result.substituteDamage || 0) +
				Math.max(0, substituteHP - (target.volatiles.substitute?.hp || 0)) / target.maxhp * factor;
			result.substituteBroken = (result.substituteBroken || 0) +
				Number(substituteHP > 0 && !target.volatiles.substitute) * factor;
			const roomChange = Number(!!battle.field.pseudoWeather.trickroom) - Number(roomBefore);
			result.trickRoom += roomChange * factor;
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
			rolls.push({ damage: rolledDamage, hp: targetHP, maxhp: target.maxhp, calls: damageCalls,
				knockout: target.hp <= 0, accuracy: hitChance });
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
			if (newTargetEffects.includes('encore') || newTargetEffects.includes('disable')) {
				(result.targetAfterMove ||= []).push({ profile: targetAfter, probability: factor });
			}
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
			const fieldAfter = captureField(battle, side);
			if (JSON.stringify(fieldAfter) !== JSON.stringify(fieldBefore)) result.fieldAfter = fieldAfter;
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) {
				const relevant = !['atk', 'spa'].includes(stat) || attacker.moves.some(id =>
					battle.dex.moves.get(id).category === (stat === 'atk' ? 'Physical' : 'Special'));
				if (relevant) result.boosts += (source.boosts[stat] - beforeBoosts[stat]) * factor;
			}
			if (!result.userAfterMove && (beforeSpecies !== source.species.id || ownStatusBefore !== source.status ||
				Object.keys(source.boosts).some(stat => source.boosts[stat as BoostID] !== beforeBoosts[stat as BoostID]))) {
				result.userAfterMove = afterMove(source, attacker);
			}
			const progressed = target.hp < targetHP || source.hp > beforeHP || beforeSpecies !== source.species.id ||
				(substituteHP > (target.volatiles.substitute?.hp || 0)) || delayedHeal > 0 || utility > 0 ||
				source.switchFlag || statusValue > 0 || hindrance ||
				Object.keys(source.boosts).some(stat => source.boosts[stat as BoostID] > beforeBoosts[stat as BoostID]) ||
				!sameHazards(ownHazardsBefore, ownHazards) || !sameHazards(foeHazardsBefore, foeHazards) ||
				newFieldCondition || roomChange || weatherBefore !== battle.field.weather || terrainBefore !== battle.field.terrain;
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
	if (rolls.length === 2 && rolls.every(roll => roll.calls === 1) && rolls[0].hp === rolls[1].hp &&
		rolls[0].maxhp === rolls[1].maxhp && rolls[0].accuracy === rolls[1].accuracy &&
		rolls[0].damage <= rolls[1].damage) {
		const [low, high] = rolls;
		result.damageRange = { min: low.damage / low.maxhp, max: high.damage / high.maxhp };
		if (!low.knockout && high.knockout) {
			// Interpolate the 16 damage rolls; the native endpoints still decide guaranteed
			// survival / KO, including Sturdy, Sash, immunities and custom damage prevention.
			let lethal = 0;
			for (let roll = 0; roll < 16; roll++) if (low.damage + (high.damage - low.damage) * roll / 15 >= low.hp) lethal++;
			result.knockout = lethal / 16 * high.accuracy;
		}
	}
	return result;
}
