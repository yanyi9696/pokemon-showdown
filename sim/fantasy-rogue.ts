import { rogueBallMultiplier, rogueBallCatchRate, type RogueBallRule } from './rogue-balls';
/** Private campaign state. Never send this object to an opponent or a spectator. */
import type { Battle } from './battle';
import type { Side } from './side';
import type { Pokemon } from './pokemon';
import { toID } from './dex';
import { captureThresholds, rogueSpeciesData } from './fantasy-rogue-rules';
import { blessingProgress, hasBlessing, failedTrainerCapture, battleDragonKing } from './fantasy-rogue-blessings';
import { savedRogueStatuses } from './fantasy-rogue-status';
import { mentorCardProfile } from './rogue-mentor';
import { snapshotEvolutionProgress } from './rogue-evolution-progress';

export const ROGUE_FORMAT = 'gen9fantasyrogue';
export const ROGUE_DUEL_FORMAT = 'gen9fantasyrogueduel';
export const ROGUE_COOP_FORMAT = 'gen9fantasyroguecoop';
export const isRogueFormat = (id: string) => [ROGUE_FORMAT, ROGUE_DUEL_FORMAT, ROGUE_COOP_FORMAT].includes(id);
export const ROGUE_STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export const emptyRogueStats = (): StatsTable => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });

export interface RoguePokemon {
	difficulty?: import('./rogue-difficulty').RogueDifficultyContext;
	formFusion?: { item: string, species: string, ability: string, donor: RoguePokemon };
	/** PP of temporarily unavailable form moves; changing forms cannot refill them. */
	formMoveMemory?: { id: string, pp: number, maxpp: number }[];
	originalDragonUnlocked?: boolean;
	fusion?: { first: RoguePokemon, second: RoguePokemon, baseStats: StatsTable, types: string[], moves: string[], experienceStart: number };
	uncappedLevel?: boolean;
	evolutionProgress?: { followed?: number; lastFloor?: number; moves?: Record<string, number>; criticals?: number;
		recoil?: number; lostHP?: number; scenes?: string[]; branch?: number };
	egg?: { found: number, hatch: number };
	compound?: import('./rogue-compound').RogueCompound;
	/** Explicit provenance for extra abilities granted by a blessing, unlike event rewards. */
	blessingExtraAbilities?: string[];
	/** Run-local personal training in basis points; not EVs or account upgrades. */
	training?: { offense?: number, defense?: number };
	campTraining?: Partial<Record<StatIDExceptHP, number>>;
	mushroomTraining?: { offense: number, defense: number };
	evolutionNotice?: boolean;
	tonics?: import('./rogue-blessing-permanent').RogueTonics;
	mintNature?: string;
	joinOrder?: number;
	initialPartner?: boolean;
	bond?: number;
	bondReady?: boolean;
	/** Half-point remainder for the initial-partner friendship bonus. */
	bondFriendshipRemainder?: number;
	bonusHP?: number;
	insight?: { points: number, gain: number };
	spiral?: number;
	extraAbilities?: string[];
	/** A removable type emblem has its own slot, independent of the held item. */
	emblem?: string;
	/** Temporary learning permissions are kept apart from permanently learned moves. */
	blessingMoves?: string[];
	blessingPP?: { id: string, pp: number, maxpp: number }[];
	statModifiers?: import('./rogue-blessing-data').RogueStatModifiers;
	statuses?: Record<string, { time?: number, startTime?: number, stage?: number, blessingToxic?: boolean }>;
	/** Friendship evolutions qualified at an actual level-up, not by merely opening the party. */
	stars?: number;
	fixedLevel?: number;
	id: string;
	set: PokemonSet;
	hp: number;
	maxhp: number;
	pp: { id: string, pp: number, maxpp: number }[];
	status: string;
	statusState: { time?: number, startTime?: number, stage?: number, blessingToxic?: boolean };
	experience?: number;
	seenMoves?: string[];
	/** Learned moves retain their remaining PP even while not equipped. */
	moveMemory?: { id: string, pp: number, maxpp: number }[];
	abilityPool?: { id: string, hidden: boolean }[];
	/** A server-granted event permits one redistribution of this many EVs. */
	evRespec?: { total: number };
	stats?: StatsTable;
}

export interface RogueDefeat {
	/** King when this opponent was defeated; used by experience settlement. */
	dragonKing?: string;
	id?: string;
	attacker?: string;
	species: string;
	level: number;
	participants: string[];
	eligible: string[];
	captured?: boolean;
	killer?: string;
}

export interface RogueBattleState {
	difficulty?: import('./rogue-difficulty').RogueDifficultyContext;
	numberUses?: Partial<Record<SideID, boolean>>;
	escortCount?: number;
	/** Last actual faint was a self-sacrifice protected by Art of Explosion. */
	selfDestructed?: string[];
	cooperative?: { opponentOffset: number };
	companionZUsed?: Partial<Record<SideID, boolean>>;
	wild?: boolean;
	environment?: { weather?: string, terrain?: string, name: string };
	mentorCard?: 'attack' | 'guard' | 'balanced';
	comebackCard?: boolean;
	mentorTier?: import('./rogue-mentor').MentorTier;
	fishingElite?: boolean;
	boss?: import('./rogue-bosses').RogueBossState;
	eventBuff?: boolean;
	blessingRuntime?: Record<string, import('./fantasy-rogue-blessings').SideRuntime>;
	blessingDefeated?: string[];
	blessingPsychicLosses?: string[];
	blessings?: import('./rogue-blessing-data').BlessingEffects;
	blessingProgress?: { kos: { id: string, member: string }[], swords: number, insight: Record<string, { points: number, gain: number }>,
		psychic?: number, psychicLosses?: string[], spiral?: Record<string, number>, numberUpgrade?: boolean, numberPrize?: boolean };
	/** Trusted second archive, only for the dedicated, unranked legacy duel format. */
	duel?: { team: RoguePokemon[], boosts: StatsTable, hazards?: string[], money?: number, eventBuff?: boolean,
		blessings?: import('./rogue-blessing-data').BlessingEffects };
	spirit?: { id: string, floor: number, hazards?: string[], windSide?: number, money?: number };
	opponentStars?: number[];
	/** Simulator references are serialized by the native battle serializer. */
	futureAttacks?: { turn: number, source: Pokemon, slots: PokemonSlot[], move: ActiveMove }[];
	encounterId: string;
	team: RoguePokemon[];
	boosts: StatsTable;
	bag: Record<string, number>;
	/** Explicit per-ball probabilities supplied by the content configuration (0..1). */
	balls: { id: string, name: string, chance?: number, multiplier?: number, rule?: RogueBallRule }[];
	catchable: boolean;
	/** Only NPC captures granted by the Rocket blessing provoke the trainer. */
	npcCapture?: boolean;
	/** Permissions for this encounter, issued by the campaign server. Old/missing flags are locked. */
	tera?: { player: boolean, opponent: boolean };
	forcedTera?: boolean;
	systems?: { player: { mega: boolean, z: boolean, gmega?: boolean }, opponent?: { mega: boolean, z: boolean, gmega?: boolean } };
	captures?: RoguePokemon[];
	captured?: RoguePokemon;
	progression?: boolean;
	allowReplacement?: boolean;
	caughtSpecies?: number;
	caughtSpeciesIds?: string[];
	captureEnvironment?: { water: boolean, dark: boolean, fishing?: boolean };
	participants?: Record<string, string[]>;
	defeated?: RogueDefeat[];
}

export interface RogueBattleResult {
	turns?: number;
	allySurvived?: boolean;
	selfDestructed?: string[];
	companionZUsed?: boolean;
	captures?: RoguePokemon[];
	blessingProgress?: RogueBattleState['blessingProgress'];
	encounterId: string;
	won: boolean;
	team: RoguePokemon[];
	bag: Record<string, number>;
	captured?: RoguePokemon;
	defeated?: RogueDefeat[];
}

/** Mushroom vitality affects direct opposing damage, never recoil, weather or one-hit KO moves. */
export function rogueEventDamage(damage: number, target: Pokemon, source: Pokemon, effect: Effect) {
	const state = target.battle.fantasyRogue;
	const original = damage;
	if (!state || damage <= 0 ||
		effect.effectType !== 'Move' || effect.ohko || effect.damage || effect.damageCallback ||
		!source || source.isAlly(target)) return damage;
	const buff = (mon: Pokemon) => mon.side.id === 'p1' ? state.eventBuff : state.duel?.eventBuff;
	if (source.side.id === 'p1' && state.mentorCard) damage *= 1 + mentorCardProfile(state.mentorCard, state.mentorTier).damage / 100;
	if (source.side.id === 'p1' && state.comebackCard) damage *= 1.25;
	if (buff(source)) damage *= 1.2;
	if (buff(target)) damage *= 0.9;
	const spirit = state.spirit;
	if (spirit?.id === 'regigigas' && !state.duel) damage *= source.side.id === 'p1' ? 2 : target.side.id === 'p1' ? 0.5 : 1;
	if (source.side.id === 'p1' || state.duel) {
		if (spirit?.id === 'gimmighoul') damage *= 1 + Math.max(0,
			(source.side.id === 'p1' ? spirit.money : state.duel?.money) || 0) / 5000000;
		if (spirit?.id === 'darkrai') damage *= 1 + Math.floor(spirit.floor / 2) / 100;
	}
	return damage === original ? damage : Math.max(1, Math.floor(damage));
}

export function snapshotRoguePokemon(mon: Pokemon, original: RoguePokemon): RoguePokemon {
	// Temporary battle forms, Transform, Dynamax and volatile effects do not become save data.
	const growth = mon.m.rogueBlessing?.bonusHP || 0;
	const maxhp = original.maxhp + growth;
	const hp = mon.hp ? Math.max(1, maxhp - (mon.baseMaxhp - mon.getUndynamaxedHP())) : 0;
	return {
		...structuredClone(original),
		id: original.id,
		evolutionProgress: snapshotEvolutionProgress(mon, original),
		set: { ...structuredClone(original.set), item: mon.item || '' },
		hp: Math.min(maxhp, hp), maxhp,
		bonusHP: (original.bonusHP || 0) + growth,
		statModifiers: { ...original.statModifiers, hp: (original.bonusHP || 0) + growth },
		stats: original.stats && { ...original.stats, hp: maxhp },
		pp: original.pp.map(slot => {
			const current = mon.baseMoveSlots.find(move => move.id === slot.id);
			return { ...slot, pp: current?.pp ?? slot.pp, maxpp: current?.maxpp ?? slot.maxpp };
		}),
		status: mon.status,
		statuses: savedRogueStatuses(mon),
		statusState: { time: mon.statusState.time, startTime: mon.statusState.startTime, stage: mon.statusState.stage,
			blessingToxic: mon.statusState.blessingToxic },
	};
}

export function initializeRogueBattle(battle: Battle) {
	// AI hypothetical worlds are restored separately from public observations.
	if (battle.deserialized) return;
	const state = battle.fantasyRogue;
	if (!state) throw new Error('幻想杯肉鸽必须从冒险存档进入。');
	state.participants = {};
	state.selfDestructed = [];
	state.defeated = [];
	state.blessingProgress = { kos: [], swords: 0, insight: {} };
	if (state.boss?.kind === 'arceus') battle.add('-message', '神之挑战：阿尔宙斯拥有十九条生命。当前为第 1 / 19 条生命。');
	if (state.boss?.kind === 'summit') battle.add('-message', '幻想超梦悬在塔顶，指挥五位守卫作战。击败它们后，超梦才会亲自下场。');
	for (const [i, mon] of [...battle.p2.pokemon, ...(state.cooperative ? battle.p4!.pokemon : [])].entries()) {
		mon.set.fantasyRogueId = `${state.encounterId}:foe:${i}`;
		if (i < (state.escortCount || 0)) mon.canTerastallize = null;
		if (!state.duel && (state.opponentStars?.[i] || 1) > 1) {
			const stars = state.opponentStars![i];
			battle.add('-message', `${mon.species.name}为${'★'.repeat(stars)}宝可梦，六项能力值 ×${[1, 1, 1.2, 1.5, 2, 3][stars]}。`);
		}
	}
	if (state.duel) {
		for (const [i, mon] of battle.p2.pokemon.entries()) mon.set.fantasyRogueId = state.duel.team[i].id;
	}
	for (const side of state.duel ? battle.sides : [battle.p1]) {
		for (const mon of side.pokemon) {
			const saved = (side.id === 'p1' ? state.team : state.duel!.team).find(entry => entry.id === mon.set.fantasyRogueId);
			if (!saved) throw new Error('Missing rogue party member');
			mon.hp = Math.min(mon.maxhp, saved.hp);
			mon.fainted = !mon.hp;
			mon.status = toID(saved.status);
			mon.statusState = battle.initEffectState({ id: mon.status, target: mon, ...saved.statusState });
			if (saved.statuses) {
				mon.m.rogueStatusStack = Object.fromEntries(Object.entries(saved.statuses).map(([id, state]) =>
					[id, battle.initEffectState({ id, target: mon, ...state })]));
				if (mon.m.rogueStatusStack[mon.status]) mon.statusState = mon.m.rogueStatusStack[mon.status];
			}
			for (const slot of mon.moveSlots) {
				const pp = saved.pp.find(entry => entry.id === slot.id);
				if (pp) slot.pp = Math.min(slot.maxpp, pp.pp);
			}
		}
		side.pokemonLeft = side.pokemon.filter(mon => mon.hp > 0).length;
		if (!side.pokemonLeft) throw new Error('没有可出战的宝可梦。');
	}
}

export function startRogueArea(battle: Battle) {
	const env = battle.fantasyRogue?.environment, source = battle.p2.pokemon[0];
	if (source && battle.fantasyRogue?.forcedTera && !source.terastallized) battle.actions.terastallize(source);
	if (!env || !source) return;
	if (env.weather && battle.field.setWeather(env.weather, source, battle.format)) battle.field.weatherState.duration = 5;
	if (env.terrain && battle.field.setTerrain(env.terrain, source, battle.format)) battle.field.terrainState.duration = 5;
	battle.add('-message', `区域环境：${env.name}，持续 5 回合。`);
}

export function canRogueSystem(pokemon: Pokemon, system: 'mega' | 'gmega' | 'z'): boolean {
	if (system !== 'z' && isRogueFormat(pokemon.battle.format.id) && pokemon.set.fantasyRogueModifiers?.fusion) return false;
	const state = pokemon.battle.fantasyRogue;
	if (!state) return true;
	if (pokemon.side.id === 'p1') return !!state.systems?.player[system];
	return state.duel ? !!state.systems?.opponent?.[system] : true;
}

export function canRogueTerastallize(pokemon: Pokemon): boolean {
	const state = pokemon.battle.fantasyRogue;
	if (pokemon.side.id === 'p2' && state?.escortCount &&
		Number(/:foe:(\d+)$/.exec(pokemon.set.fantasyRogueId || '')?.[1]) < state.escortCount) return false;
	if (pokemon.side.id === 'p2' && pokemon.battle.fantasyRogue?.boss &&
		(pokemon.battle.fantasyRogue.boss.kind === 'arceus' || pokemon.baseSpecies.baseSpecies === 'Mewtwo-Fantasy')) return false;
	return pokemon.side.fantasyRogueTera !== false;
}

export function markRogueParticipants(battle: Battle) {
	const state = battle.fantasyRogue;
	if (!state?.progression) return;
	const active = battle.p1.active[0];
	if (!active?.hp) return;
	for (const foe of [...battle.p2.active, ...(state.cooperative ? battle.p4!.active : [])]) {
		if (!foe) continue;
		const participants = state.participants![foe.set.fantasyRogueId!] ||= [];
		if (!participants.includes(active.set.fantasyRogueId!)) participants.push(active.set.fantasyRogueId!);
	}
}

/** Record before spread damage resolves: the user faints before Explosion hits its opponents. */
export function recordRogueSelfDestruct(mon: Pokemon, source: Pokemon | null, effect: Effect | null) {
	const state = mon.battle.fantasyRogue, id = mon.set.fantasyRogueId;
	if (!state || mon.side.id !== 'p1' || !id) return;
	state.selfDestructed = (state.selfDestructed || []).filter(old => old !== id);
	if (source === mon && effect?.effectType === 'Move' && ['selfdestruct', 'explosion'].includes(effect.id) &&
		hasBlessing(mon, 'explosionart')) state.selfDestructed.push(id);
}
export function recordRogueDefeat(battle: Battle, mon: Pokemon, captured = false, source?: Pokemon | null) {
	const state = battle.fantasyRogue;
	if (!state?.progression || mon.side.id !== 'p2' && !(state.cooperative && mon.side.id === 'p4')) return;
	markRogueParticipants(battle);
	state.defeated!.push({
		id: mon.set.fantasyRogueId,
		killer: source?.side.id === 'p1' ? source.set.fantasyRogueId : undefined,
		species: mon.set.species, level: mon.level, captured,
		participants: [...(state.participants![mon.set.fantasyRogueId!] || [])],
		eligible: battle.p1.pokemon.filter(member => member.hp > 0 || hasBlessing(member, 'insight') ||
			state.selfDestructed?.includes(member.set.fantasyRogueId!))
			.map(member => member.set.fantasyRogueId!),
		dragonKing: battleDragonKing(battle.p1)?.member || '',
	});
}

export function chooseRogueBall(side: Side, id: string) {
	const state = side.battle.fantasyRogue;
	if (!state || side.id !== 'p1' || side.requestState !== 'move' || !state.catchable ||
		(state.team.length >= 6 && !state.allowReplacement) ||
		!state.balls.some(ball => ball.id === id) || !(state.bag[id] > 0) ||
		!side.active[0]?.hp || !side.foe.active[0]?.hp) {
		return side.emitChoiceError('当前不能使用这个精灵球。');
	}
	side.choice.actions.push({ choice: 'rogueball', pokemon: side.active[0], moveid: id });
	return true;
}

/** Uses the exact integer shake/critical thresholds used by throwRogueBall, without drawing RNG. */
export function rogueCaptureChance(battle: Battle, ball: RogueBattleState['balls'][number]): number | null {
	const state = battle.fantasyRogue;
	const target = battle.p2?.active[0];
	if (!state?.catchable || !target?.hp) return null;
	const multiplier = (state.spirit?.id === 'mew' ? 2 : 1) * (hasBlessing(battle.p1.active[0], 'catcher') ? 1.5 : 1);
	if (ball.chance !== undefined) return Math.min(1, Math.round(ball.chance * 1000000) / 1000000 * multiplier);
	const threshold = captureThresholds(rogueBallCatchRate(battle, ball, rogueSpeciesData(target.set.species).catchRate),
		target.maxhp, target.hp, target.status, rogueBallMultiplier(battle, ball), state.caughtSpecies || 0);
	if (threshold.guaranteed) return 1;
	const shake = threshold.shake / 65536;
	const critical = threshold.critical / 256;
	return Math.min(1, (critical * shake + (1 - critical) * shake ** 4) * multiplier);
}

export function throwRogueBall(battle: Battle, id: string) {
	const state = battle.fantasyRogue!;
	const ball = state.balls.find(entry => entry.id === id)!;
	const target = battle.p2.active[0];
	if (!state.catchable || !target?.hp || !(state.bag[id] > 0)) return;
	state.bag[id]--;
	battle.add('-message', `投出了${ball.name}！`);
	let success: boolean;
	let shakes = 0;
	let critical = false;
	// The order spirit removes battle randomness, never the advertised capture roll.
	const chance = state.spirit?.id === 'zygardeorder' ?
		battle.prng.randomChance.bind(battle.prng) : battle.randomChance.bind(battle);
	if (state.spirit?.id === 'mew' || hasBlessing(battle.p1.active[0], 'catcher')) {
		success = chance(Math.round(rogueCaptureChance(battle, ball)! * 1000000), 1000000);
		shakes = success ? 3 : 1;
	} else if (ball.chance !== undefined) {
		success = chance(Math.round(ball.chance * 1000000), 1000000);
		shakes = success ? 3 : 1;
	} else {
		const threshold = captureThresholds(rogueBallCatchRate(battle, ball, rogueSpeciesData(target.set.species).catchRate),
			target.maxhp, target.hp, target.status, rogueBallMultiplier(battle, ball), state.caughtSpecies || 0);
		critical = chance(threshold.critical, 256);
		if (critical) battle.add('-message', '会心捕捉！');
		success = threshold.guaranteed;
		if (!success) {
			success = true;
			for (let i = 0; i < (critical ? 1 : 4); i++) {
				if (!chance(threshold.shake, 65536)) { success = false; break; }
				shakes++;
			}
		}
		shakes = critical ? 1 : threshold.guaranteed ? 3 : Math.min(3, shakes);
	}
	// Presentation data is authoritative and consumes no extra RNG. Replays use the same outcome.
	battle.add('-roguecapture', target, id, success ? 'success' : 'failure', shakes, critical ? 'critical' : 'normal');
	if (!success) {
		battle.add('-message', '宝可梦挣脱了精灵球！');
		failedTrainerCapture(battle);
		return;
	}
	const original: RoguePokemon = {
		...(target.set.fantasyRogueScale === 1.2 ? { stars: 2 } : {}),
		id: battle.p2.pokemon.length === 1 ? state.encounterId : target.set.fantasyRogueId!,
		set: structuredClone(target.set), hp: target.hp, maxhp: target.baseMaxhp,
		pp: target.baseMoveSlots.map(slot => ({ id: slot.id, pp: slot.pp, maxpp: slot.maxpp })),
		status: target.status, statusState: {},
	};
	delete original.set.fantasyRogueStats;
	delete original.set.fantasyRogueScale;
	delete original.set.fantasyRogueDifficulty;
	delete original.set.fantasyRogueModifiers;
	delete original.set.fantasyRogueId;
	state.captured = snapshotRoguePokemon(target, original);
	state.captured.set.pokeball = id;
	if (id === 'friendball') state.captured.set.happiness = 150;
	if (id === 'healball') {
		state.captured.hp = state.captured.maxhp; state.captured.status = '';
		state.captured.statusState = {}; delete state.captured.statuses;
		for (const slot of state.captured.pp) slot.pp = slot.maxpp;
	}
	(state.captures ||= []).push(state.captured);
	const caught = state.caughtSpeciesIds ||= [];
	if (!caught.includes(target.species.id)) { caught.push(target.species.id); state.caughtSpecies = (state.caughtSpecies || 0) + 1; }
	recordRogueDefeat(battle, target, true);
	battle.add('-message', `成功捕捉了${target.species.name}！`);
	// A private message commits the account-level catch immediately, before the end packet.
	battle.send('fantasyroguecapture', JSON.stringify(state.captured));
	// Remove the caught opponent without KO abilities, KO rewards or a second faint animation.
	battle.queue.cancelAction(target);
	target.hp = 0;
	target.fainted = true;
	target.side.pokemonLeft--;
	// The capture protocol removes it visually; a zero-HP update would look like a knockout.
	if (!target.side.pokemonLeft) battle.win(battle.p1);
}

export function rogueBattleResult(battle: Battle): RogueBattleResult {
	const state = battle.fantasyRogue!;
	return {
		turns: battle.turn, allySurvived: battle.p3?.pokemon.some(mon => mon.hp > 0),
		companionZUsed: !!state.companionZUsed?.p1,
		selfDestructed: state.selfDestructed && [...state.selfDestructed],
		encounterId: state.encounterId, won: battle.winner === battle.p1.name || !!state.cooperative && battle.winner === battle.p3!.name,
		team: state.team.map(saved => {
			const mon = battle.p1.pokemon.find(entry => entry.set.fantasyRogueId === saved.id)!;
			return snapshotRoguePokemon(mon, saved);
		}),
		bag: { ...state.bag }, captured: state.captured && structuredClone(state.captured),
		captures: state.captures && structuredClone(state.captures),
		defeated: state.defeated && structuredClone(state.defeated),
		blessingProgress: structuredClone(blessingProgress(battle)),
	};
}
