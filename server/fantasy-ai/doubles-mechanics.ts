import { Battle } from '../../sim/battle';
import { Dex, toID } from '../../sim/dex';
import { Format } from '../../sim/dex-formats';
import type { Pokemon } from '../../sim/pokemon';
import { gemType } from './fantasy-state';

type SideID = 'p1' | 'p2';
type Position = 'p1a' | 'p1b' | 'p2a' | 'p2b';
const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const SEEDS = ['gen5,0001000200030004', 'gen5,0011001200130014'] as const;
const VOLATILES = new Set([
	'gastroacid', 'smackdown', 'magnetrise', 'telekinesis', 'ingrain', 'roost', 'embargo',
	'flashfire', 'charge', 'focusenergy', 'substitute', 'foresight', 'miracleeye',
	'auraburstatk', 'auraburstdef', 'auraburstspa', 'auraburstspd', 'auraburstspe', 'auraburstall',
	'gemdefensepermanentboost', 'fantasyultraenergyboost', 'suppressability',
]);
const paradoxBoost = (id: string) => /^(protosynthesis|quarkdrive)(atk|def|spa|spd|spe)$/.exec(id);
const supportedVolatile = (id: string) => VOLATILES.has(id) || !!paradoxBoost(id) || !!gemType(id);

/** Copied own-request data or a hypothesis made only from public battle messages. */
export interface DoublesMechanicsPokemon {
	id: string;
	side: SideID;
	position?: Position;
	species: string;
	level: number;
	health: number;
	stats?: StatsTable;
	ability?: string;
	item?: string;
	moves: string[];
	/** Types before Terastallization, including any publicly disclosed type change. */
	types: string[];
	teraType?: string;
	terastallized?: string;
	status: string;
	toxicStage?: number;
	sleepTurns?: number;
	boosts: SparseBoostsTable;
	volatiles: string[];
	activeActions: number;
	lastMove?: string;
	protectStreak?: number;
	lastTarget?: Position;
	chargeMove?: string;
}

export interface DoublesMechanicsSnapshot {
	mod: string;
	turn: number;
	pokemon: DoublesMechanicsPokemon[];
	weather: string;
	terrain: string;
	trickRoom: boolean;
	magicRoom?: boolean;
	conditions: Record<SideID, string[]>;
}

export interface DoublesDamageEstimate {
	/** Expected HP fractions, with accuracy applied separately to each target/hit. */
	damage: Record<string, number>;
	selfDamage: number;
	omittedVolatiles: string[];
	/** The move charges this turn instead of doing immediate damage. */
	charging: boolean;
	/** Potential damage assumes an attacking reply, not a selected opponent action. */
	conditional: boolean;
}

/** Enumerated own actions and explicitly hypothetical enemy actions, never live choices. */
export interface DoublesTurnAction {
	actor: string;
	kind: 'move' | 'switch' | 'pass';
	move?: string;
	target?: string;
	reserve?: string;
	transform?: string;
}

export interface DoublesTurnSample {
	pokemon: Record<string, { health: number, fainted: boolean, status: string, boosts: SparseBoostsTable }>;
	weather: string;
	terrain: string;
	trickRoom: boolean;
	magicRoom?: boolean;
	conditions: Record<SideID, string[]>;
	/** Public move execution order, useful for verifying coordination and interrupted actions. */
	moves: { actor: string, move: string }[];
	/** A pivot/forced switch interrupted the horizon; the caller must not treat it as a full turn. */
	interrupted: boolean;
}

export interface DoublesTurnEstimate {
	samples: DoublesTurnSample[];
	omittedVolatiles: string[];
}

function restorePokemon(battle: Battle, mon: Pokemon, profile: DoublesMechanicsPokemon, sample: number) {
	if (mon.species.id !== toID(profile.species)) mon.setSpecies(battle.dex.species.get(profile.species));
	if (profile.stats) {
		mon.baseStoredStats = { ...profile.stats };
		for (const stat of STATS) if (stat !== 'hp') mon.storedStats[stat] = profile.stats[stat];
		mon.baseMaxhp = mon.maxhp = profile.stats.hp;
	}
	mon.hp = Math.max(0, Math.ceil(mon.maxhp * profile.health));
	mon.fainted = !mon.hp;
	mon.isActive = mon.isStarted = !!profile.position && !mon.fainted;
	mon.activeMoveActions = profile.activeActions;
	mon.activeTurns = profile.activeActions ? 1 : 0;
	mon.status = toID(profile.status === 'fnt' ? '' : profile.status);
	mon.statusState = battle.initEffectState({ id: mon.status, target: mon });
	if (mon.status === 'tox') mon.statusState.stage = Math.max(0, Math.min(15, profile.toxicStage || 0));
	if (mon.status === 'slp') {
		// The public log bounds elapsed sleep but never reveals the randomly chosen wake turn.
		const elapsed = (profile.sleepTurns || 0) * (mon.ability === 'earlybird' ? 2 : 1);
		const start = mon.item === 'fantasylifeorb' ? 4 : sample ? 4 : 2;
		mon.statusState.startTime = start;
		mon.statusState.time = Math.max(1, start - elapsed);
	}
	Object.assign(mon.boosts, profile.boosts);
	mon.setType(profile.types, true);
	mon.terastallized = profile.terastallized || '';
	if (profile.teraType) mon.teraType = profile.teraType;
	if (profile.lastMove) mon.lastMove = battle.dex.getActiveMove(profile.lastMove);
	if (profile.protectStreak) mon.volatiles.stall = battle.initEffectState({
		id: 'stall', target: mon, duration: 1, counter: Math.min(729, 3 ** profile.protectStreak),
	});
	// Restore public state directly; replaying entry events would apply Intimidate/weather twice.
	for (const id of profile.volatiles) {
		const paradox = paradoxBoost(id), gem = gemType(id);
		if (paradox) {
			mon.volatiles[paradox[1]] = battle.initEffectState({ id: paradox[1], target: mon, bestStat: paradox[2] });
			continue;
		}
		if (gem) {
			mon.m.gemBoosts ||= [];
			mon.m.gemBoosts.push(gem);
			mon.side.sideConditions.gemboost = battle.initEffectState({ id: 'gemboost', target: mon.side });
			mon.volatiles.gempermanentboost = battle.initEffectState({ id: 'gempermanentboost', target: mon });
			continue;
		}
		if (!VOLATILES.has(id)) continue;
		mon.volatiles[id] = battle.initEffectState({ id, target: mon });
		if (id === 'substitute') mon.volatiles[id].hp = Math.max(1, Math.floor(mon.maxhp / 4));
	}
	if (profile.chargeMove) {
		const id = toID(profile.chargeMove);
		mon.volatiles[id] = battle.initEffectState({ id, target: mon });
		mon.volatiles.twoturnmove = battle.initEffectState({ id: 'twoturnmove', target: mon, move: id });
	}
}

/**
 * Bounded native move probes. This class cannot receive a live Battle, opposing requests,
 * submitted choices or a real RNG seed. Each probe owns and destroys its hypothetical world.
 * Move probes and joint-turn hypotheses are separate; neither predicts hidden selections.
 */
export class DoublesDamageModel {
	private readonly snapshot: DoublesMechanicsSnapshot;
	private readonly cache = new Map<string, DoublesDamageEstimate | undefined>();
	private readonly turnCache = new Map<string, DoublesTurnEstimate | undefined>();
	readonly diagnostics = {
		probes: 0, failures: [] as string[], omittedVolatiles: [] as string[],
		turnProbes: 0, turnFailures: [] as string[],
	};

	constructor(snapshot: DoublesMechanicsSnapshot) {
		this.snapshot = structuredClone(snapshot);
	}

	/** The joint scorer already rejects any omitted state; detect that before native probes. */
	hasIncompleteTurnState() {
		return this.snapshot.pokemon.some(mon => mon.volatiles.some(id => !supportedVolatile(id)));
	}

	private create(sample: number, actions: readonly DoublesTurnAction[] = []) {
		const dex = Dex.mod(this.snapshot.mod);
		const members = (side: SideID) => {
			const team = this.snapshot.pokemon.filter(mon => mon.side === side);
			// A vacant native slot must stay vacant; never shift the remaining b slot to a.
			const active = ['a', 'b'].map(slot => team.find(mon => mon.position === `${side}${slot}`) || {
				id: `vacant-${side}${slot}`, side, position: `${side}${slot}` as Position,
				species: 'Magikarp', level: 100, health: 0, types: ['Water'], moves: ['splash'],
				status: '', boosts: {}, volatiles: [], activeActions: 0,
			});
			return [...active, ...team.filter(mon => !mon.position)];
		};
		const teams = { p1: members('p1'), p2: members('p2') };
		const set = (mon: DoublesMechanicsPokemon) => ({
			species: mon.species, level: mon.level, ability: mon.ability || '', item: mon.item || '',
			moves: [...new Set([...mon.moves, ...actions.filter(action => action.actor === mon.id && action.move)
				.map(action => action.move!)])].concat(mon.moves.length ? [] : ['splash']), teraType: mon.teraType,
			// Unknown opponents use a disclosed neutral hypothesis, not their actual configuration.
			evs: { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 }, nature: 'Serious',
		}) as PokemonSet;
		const battle = new Battle({
			formatid: toID('gen9fantasyroguedoubles'),
			format: new Format({ name: 'Isolated doubles damage', mod: dex.currentMod, gameType: 'doubles', ruleset: [] }),
			seed: SEEDS[sample], deserialized: true,
			p1: { team: teams.p1.map(set) }, p2: { team: teams.p2.map(set) },
		});
		try {
			battle.p1.foe = battle.p2;
			battle.p2.foe = battle.p1;
			battle.started = true;
			battle.turn = this.snapshot.turn;
			const pokemon = new Map<string, Pokemon>();
			for (const side of [battle.p1, battle.p2]) {
				for (const [index, profile] of teams[side.id as SideID].entries()) {
					const mon = side.pokemon[index];
					if (index < 2) side.active[index] = mon;
					restorePokemon(battle, mon, profile, sample);
					pokemon.set(profile.id, mon);
				}
				side.pokemonLeft = side.pokemon.filter(mon => !mon.fainted).length;
				for (const id of this.snapshot.conditions[side.id as SideID]) {
					side.sideConditions[id] = battle.initEffectState({ id, target: side });
				}
			}
			battle.field.weather = toID(this.snapshot.weather);
			battle.field.weatherState = battle.initEffectState({ id: this.snapshot.weather });
			battle.field.terrain = toID(this.snapshot.terrain);
			battle.field.terrainState = battle.initEffectState({ id: this.snapshot.terrain });
			if (this.snapshot.trickRoom) {
				battle.field.pseudoWeather.trickroom = battle.initEffectState({ id: 'trickroom' });
			}
			if (this.snapshot.magicRoom) {
				battle.field.pseudoWeather.magicroom = battle.initEffectState({ id: 'magicroom' });
			}
			return { battle, pokemon };
		} catch (error) {
			battle.destroy();
			throw error;
		}
	}

	private transform(battle: Battle, mon: Pokemon, event: string) {
		const before = mon.species, stats = { ...mon.baseStoredStats }, lostHP = mon.maxhp - mon.hp;
		if (event === 'terastallize') battle.actions.terastallize(mon);
		if (event === 'mega' || event === 'ultra') {
			if (event === 'mega') mon.canUltraBurst = null;
			else mon.canMegaEvo = null;
			battle.actions.runMegaEvo(mon);
		}
		if (event === 'megax') battle.actions.runMegaEvoX?.(mon);
		if (event === 'megay') battle.actions.runMegaEvoY?.(mon);
		if (mon.species.id !== before.id) {
			// Requests expose stats but not nature/EVs. As in singles probes, project the base-stat
			// delta; this is explicitly approximate until full compatible-set hypotheses are searched.
			for (const stat of STATS) {
				const value = Math.max(1, stats[stat] + Math.floor(2 *
					(mon.species.baseStats[stat] - before.baseStats[stat]) * mon.level / 100));
				mon.baseStoredStats[stat] = value;
				if (stat !== 'hp') mon.storedStats[stat] = value;
			}
			mon.baseMaxhp = mon.maxhp = mon.baseStoredStats.hp;
			mon.hp = Math.max(1, mon.maxhp - lostHP);
		}
		if (event === 'dynamax' && !mon.volatiles.dynamax) mon.addVolatile('dynamax');
	}

	/**
	 * Execute a whole hypothetical turn with native priority, speed updates, redirection, Protect,
	 * flinches, faint cancellation and residual effects. Two independent fixed RNG samples are
	 * hypotheses, not predictions of live randomness. Mid-turn switches are explicitly incomplete.
	 */
	projectTurn(actions: readonly DoublesTurnAction[]): DoublesTurnEstimate | undefined {
		const key = JSON.stringify(actions);
		if (this.turnCache.has(key)) return this.turnCache.get(key);
		const result: DoublesTurnEstimate = { samples: [], omittedVolatiles: [...new Set(this.snapshot.pokemon
			.flatMap(mon => mon.volatiles.filter(id => !supportedVolatile(id))))] };
		try {
			if (new Set(actions.map(action => action.actor)).size !== actions.length) throw new Error('duplicate-turn-actor');
			for (let sample = 0; sample < SEEDS.length; sample++) {
				const { battle, pokemon } = this.create(sample, actions);
				this.diagnostics.turnProbes++;
				try {
					battle.randomizer = base => Math.floor(base * (sample ? 100 : 85) / 100);
					// Queue native transformations before attacks, retaining native switch/transform order.
					// Mega projected stats use the same disclosed approximation as single-move probes.
					const runAction = battle.runAction.bind(battle);
					const transforms = new Map<Pokemon, string>();
					const permissions = new Map([...pokemon.values()].map(mon => [mon, {
						canMegaEvo: mon.canMegaEvo, canMegaEvoX: mon.canMegaEvoX, canMegaEvoY: mon.canMegaEvoY,
						canUltraBurst: mon.canUltraBurst,
					}]));
					for (const action of actions) {
						if (action.kind === 'pass') continue;
						const actor = pokemon.get(action.actor);
						if (!actor?.isActive || !actor.hp) throw new Error('inactive-turn-actor');
						if (action.transform) transforms.set(actor, action.transform);
					}
					battle.runAction = action => {
						const transform = action.pokemon && transforms.get(action.pokemon);
						if (transform && ['megaEvo', 'megaEvoX', 'megaEvoY', 'terastallize', 'runDynamax'].includes(action.choice)) {
							// Multi legality was checked per seat before this projection. The temporary
							// doubles Side must not let one seat consume the other's Mega permission.
							Object.assign(action.pokemon, permissions.get(action.pokemon));
							this.transform(battle, action.pokemon, transform);
							transforms.delete(action.pokemon);
							battle.updateSpeed();
							for (const pending of battle.queue.list) if (pending.pokemon) battle.getActionSpeed(pending);
							battle.queue.sort();
							return false;
						}
						return runAction(action);
					};
					battle.updateSpeed();
					for (const action of actions) {
						if (action.kind === 'pass') continue;
						const actor = pokemon.get(action.actor)!;
						if (action.kind === 'switch') {
							const reserve = pokemon.get(action.reserve || '');
							if (!reserve?.hp || reserve.isActive || reserve.side !== actor.side) throw new Error('invalid-turn-reserve');
							battle.queue.addChoice({ choice: 'switch', pokemon: actor, target: reserve });
							continue;
						}
						const move = battle.dex.getActiveMove(action.move || '');
						if (!move.exists) throw new Error('invalid-turn-move');
						if (move.willCrit === undefined) move.willCrit = false;
						const target = pokemon.get(action.target || '');
						const transform = action.transform || '';
						const event = transform === 'megax' ? 'megaEvoX' : transform === 'megay' ? 'megaEvoY' :
							transform === 'terastallize' ? 'terastallize' :
							['mega', 'ultra'].includes(transform) ? 'megaEvo' : '';
						if (event) battle.queue.addChoice({ choice: event, pokemon: actor });
						battle.queue.addChoice({
							choice: 'move', pokemon: actor, move,
							targetLoc: target ? actor.getLocOf(target) : 0,
							zmove: transform === 'zmove' ? battle.actions.getZMove(move, actor) : undefined,
							maxMove: transform === 'dynamax' || actor.volatiles.dynamax ?
								battle.actions.getMaxMove(move, actor)?.name : undefined,
						});
					}
					battle.queue.sort();
					const logStart = battle.log.length;
					const byIdent = new Map([...pokemon].map(([id, mon]) => [mon.toString(), id]));
					battle.turnLoop();
					for (const [id, mon] of pokemon) byIdent.set(mon.toString(), id);
					result.samples.push({
						pokemon: Object.fromEntries([...pokemon].filter(([id]) => !id.startsWith('vacant-')).map(([id, mon]) =>
							[id, { health: mon.hp / mon.maxhp, fainted: mon.fainted || !mon.hp,
								status: mon.status, boosts: { ...mon.boosts } }])),
						weather: battle.field.weather, terrain: battle.field.terrain,
						trickRoom: !!battle.field.pseudoWeather.trickroom,
						magicRoom: !!battle.field.pseudoWeather.magicroom,
						conditions: { p1: Object.keys(battle.p1.sideConditions), p2: Object.keys(battle.p2.sideConditions) },
						moves: battle.log.slice(logStart).filter(line => line.startsWith('|move|')).map(line => {
							const [, , ident, name] = line.split('|');
							return { actor: byIdent.get(ident) || ident, move: toID(name) };
						}),
						interrupted: !!battle.requestState && !!battle.queue.list.length && !battle.ended,
					});
				} finally { battle.destroy(); }
			}
			this.turnCache.set(key, result);
			return result;
		} catch (error) {
			this.diagnostics.turnFailures.push(error instanceof Error ? error.message : String(error));
			this.turnCache.set(key, undefined);
			return undefined;
		}
	}

	project(actorID: string, moveID: string, targetID = '', transform = ''): DoublesDamageEstimate | undefined {
		const key = JSON.stringify([actorID, moveID, targetID, transform]);
		if (this.cache.has(key)) return this.cache.get(key);
		const result: DoublesDamageEstimate = {
			damage: {}, selfDamage: 0, charging: false, conditional: false, omittedVolatiles: [],
		};
		try {
			for (let sample = 0; sample < SEEDS.length; sample++) {
				const { battle, pokemon } = this.create(sample);
				this.diagnostics.probes++;
				try {
					const actor = pokemon.get(actorID);
					if (!actor?.isActive) throw new Error('inactive-probe-actor');
					const profile = this.snapshot.pokemon.find(mon => mon.id === actorID)!;
					const target = pokemon.get(targetID || profile.lastTarget || '');
					this.transform(battle, actor, transform);
					const move = battle.dex.getActiveMove(moveID);
					if (move.willCrit === undefined) move.willCrit = false;
					battle.randomizer = base => Math.floor(base * (sample ? 100 : 85) / 100);
					const chances = new Map<Pokemon, number>();
					const hitAccuracy = battle.actions.hitStepAccuracy.bind(battle.actions);
					battle.actions.hitStepAccuracy = (targets, source, activeMove) => {
						const randomChance = battle.randomChance;
						battle.randomChance = (numerator, denominator) => {
							const chance = Math.max(0, Math.min(1, numerator / denominator));
							const current = battle.activeTarget;
							if (current) chances.set(current, (chances.get(current) ?? 1) * chance);
							return chance > 0;
						};
						try { return hitAccuracy(targets, source, activeMove); } finally { battle.randomChance = randomChance; }
					};
					const damage = battle.spreadDamage.bind(battle);
					const ids = new Map([...pokemon].map(([id, mon]) => [mon, id]));
					battle.spreadDamage = (...args) => {
						const dealt = damage(...args);
						if (args[2] === actor && typeof args[3] === 'object' && args[3]?.effectType === 'Move') {
							for (const [index, mon] of (args[1] || []).entries()) {
								const amount = dealt[index];
								if (!mon || mon === actor || typeof amount !== 'number') continue;
								const id = ids.get(mon)!;
								result.damage[id] = (result.damage[id] || 0) +
									amount / mon.maxhp * (chances.get(mon) ?? 1) / SEEDS.length;
							}
						}
						return dealt;
					};
					const beforeHP = actor.hp;
					const zMove = transform === 'zmove' ? battle.actions.getZMove(move, actor) : undefined;
					const maxMove = transform === 'dynamax' || actor.volatiles.dynamax ?
						battle.actions.getMaxMove(move, actor)?.name : undefined;
					if (target && !zMove && !maxMove && ['suckerpunch', 'thunderclap', 'upperhand'].includes(move.id)) {
						result.conditional = true;
						const known = this.snapshot.pokemon.find(mon => mon.id === targetID)?.moves || [];
						const replyID = known.find(id => {
							const reply = battle.dex.moves.get(id);
							return reply.category !== 'Status' && (move.id !== 'upperhand' || reply.priority > 0);
						}) || (move.id === 'upperhand' ? 'quickattack' : 'tackle');
						// A hypothetical pending attack permits the engine's conditional-hit hook to run.
						// The policy discounts this potential; no real selected action is consulted.
						battle.queue.addChoice({ choice: 'move', pokemon: target, move: replyID });
					}
					actor.activeMoveActions++;
					battle.actions.useMove(move, actor, { target, zMove, maxMove });
					result.selfDamage += Math.max(0, beforeHP - actor.hp) / actor.maxhp / SEEDS.length;
					result.charging ||= !!actor.volatiles.twoturnmove && !profile.chargeMove;
				} finally { battle.destroy(); }
			}
			result.omittedVolatiles = [...new Set(this.snapshot.pokemon.flatMap(mon =>
				mon.volatiles.filter(id => !supportedVolatile(id))))];
			this.diagnostics.omittedVolatiles = result.omittedVolatiles;
			this.cache.set(key, result);
			return result;
		} catch (error) {
			this.diagnostics.failures.push(`${moveID}: ${error instanceof Error ? error.message : String(error)}`);
			this.cache.set(key, undefined);
			return undefined;
		}
	}
}
