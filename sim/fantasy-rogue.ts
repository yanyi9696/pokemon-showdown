import { echoChance, playerEcho } from './rogue-echo';
import {
	initializeRogueItemSources, rogueItemSource, type RogueItemSource, type RogueKnockedOffItem,
} from './rogue-item-sources';
import { isCoopBossBattle } from './rogue-coop-boss';
import { nuzlockeCanCatch } from './rogue-nuzlocke';
import { rogueBallMultiplier, rogueBallCatchRate, type RogueBallRule } from './rogue-balls';
/** Private campaign state. Never send this object to an opponent or a spectator. */
import type { Battle } from './battle';
import type { Side } from './side';
import type { Pokemon } from './pokemon';
import { toID } from './dex';
import { captureThresholds, rogueSpeciesData } from './fantasy-rogue-rules';
import { blessingProgress, hasBlessing, failedTrainerCapture, battleDragonKing } from './fantasy-rogue-blessings';
import { savedRogueStatuses } from './fantasy-rogue-status';
import { snapshotEvolutionProgress } from './rogue-evolution-progress';

export const ROGUE_FORMAT = 'gen9fantasyrogue';
export const ROGUE_DUEL_FORMAT = 'gen9fantasyrogueduel';
export const ROGUE_COOP_FORMAT = 'gen9fantasyroguecoop';
export const ROGUE_DOUBLES_FORMAT = 'gen9fantasyroguedoubles';
export const isRogueFormat = (id: string) =>
	[ROGUE_FORMAT, ROGUE_DUEL_FORMAT, ROGUE_COOP_FORMAT, ROGUE_DOUBLES_FORMAT].includes(id);
export const ROGUE_STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export const emptyRogueStats = (): StatsTable => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });

export interface RoguePokemon {
	universalEvolution?: import('./rogue-universal-data').UniversalConfiguration;
	nuzlockeDead?: boolean;
	/** Critical shooting KOs earned while this partner is the strongest Sniper. */
	sniperKOs?: number;
	difficulty?: import('./rogue-difficulty').RogueDifficultyContext;
	formFusion?: { item: string, species: string, ability: string, donor: RoguePokemon };
	/** PP of temporarily unavailable form moves; changing forms cannot refill them. */
	formMoveMemory?: { id: string, pp: number, maxpp: number }[];
	originalDragonUnlocked?: boolean;
	fusion?: { first: RoguePokemon, second: RoguePokemon, baseStats: StatsTable, types: string[], moves: string[], experienceStart: number, sprite?: string };
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
	/** Dual-type slot replaced by the emblem; old saves keep the second slot. */
	emblemSlot?: 0 | 1;
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
	/** Co-op p3 has an independent king, including an explicitly empty value when none is active. */
	partnerDragonKing?: string;
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
	itemSourceVersion?: 1;
	itemSourceSerial?: number;
	capturedItemSources?: Record<string, RogueItemSource>;
	totemTrial?: { species: string, boosts: SparseBoostsTable };
	/** Enabled only for two authenticated humans; full checkpoints stay on the trusted server channel. */
	persistCoop?: boolean;
	checkpointSequence?: number;
	/** Only the campaign manager enables the trusted, transactional growth handshake. */
	liveProgression?: boolean;
	growthSequence?: number;
	growthRevision?: number;
	growthWaiting?: boolean;
	nuzlocke?: import('./rogue-nuzlocke').NuzlockeBattle;
	/** Actual physical policies consumed by the player's party; never counts transfers or renewable uses. */
	weaknessPoliciesSpent?: number;
	partnerWeaknessPoliciesSpent?: number;
	echo?: import('./rogue-echo').EchoUpgrades;
	collapseGasEnded?: boolean;
	collapseGasElapsed?: number;
	collapse?: import('./rogue-collapse-data').CollapseID[];
	collapseMetrics?: import('./rogue-collapse-data').CollapseMetrics;
	difficulty?: import('./rogue-difficulty').RogueDifficultyContext;
	numberUses?: Partial<Record<SideID, boolean>>;
	escortCount?: number;
	/** Last actual faint was a self-sacrifice protected by Art of Explosion. */
	selfDestructed?: string[];
	cooperative?: { opponentOffset: number, singleOpponent?: boolean };
	/** Select each player's 1–3 battlers inside the native battle room. */
	coopTeamPreview?: boolean;
	coopTeamSelected?: boolean;
	coopExit?: 'retreat' | 'abandon';
	/** The server may authorize one coordinated, turn-consuming catch for either human in Rogue Multi. */
	coopCapture?: { ownerSide: 'p1' | 'p3', ball: string, targetSide: 'p2' | 'p4', targetSlot: number, targetId: string };
	coopCaptureCapacity?: Partial<Record<'p1' | 'p3', boolean>>;
	coopCaptureSlots?: Partial<Record<'p1' | 'p3', number>>;
	captureOwners?: Partial<Record<string, 'p1' | 'p3'>>;
	companionZUsed?: Partial<Record<SideID, boolean>>;
	wild?: boolean;
	environment?: { weather?: string, terrain?: string, name: string };
	mentorCard?: import('./rogue-mentor').MentorCard;
	comebackCard?: boolean;
	mentorTier?: import('./rogue-mentor').MentorTier;
	fishingElite?: boolean;
	boss?: import('./rogue-bosses').RogueBossState;
	eventBuff?: boolean;
	blessingRuntime?: Record<string, import('./fantasy-rogue-blessings').SideRuntime>;
	blessingDefeated?: string[];
	blessingPsychicLosses?: string[];
	blessings?: import('./rogue-blessing-data').BlessingEffects;
	blessingProgress?: { kos: { id: string, member: string, sniper?: boolean }[], swords: number, insight: Record<string, { points: number, gain: number }>,
		psychic?: number, psychicLosses?: string[], spiral?: Record<string, number>, numberUpgrade?: boolean, numberPrize?: boolean };
	partnerBlessingProgress?: RogueBattleState['blessingProgress'];
	/** Trusted second archive, only for the dedicated, unranked legacy duel format. */
	duel?: { team: RoguePokemon[], boosts: StatsTable, hazards?: string[], money?: number, eventBuff?: boolean,
		blessings?: import('./rogue-blessing-data').BlessingEffects };
	/** Second real player in a co-op Multi battle; private party snapshot for p3. */
	partner?: {
		team: RoguePokemon[], boosts: StatsTable, blessings?: import('./rogue-blessing-data').BlessingEffects,
		comebackCard?: boolean,
		echo?: import('./rogue-echo').EchoUpgrades, mentorCard?: import('./rogue-mentor').MentorCard, money?: number,
	};
	spirit?: { id: string, floor: number, hazards?: string[], windSide?: number, money?: number };
	opponentStars?: number[];
	/** Original encounter slots survive retreat; captured opponents are omitted from the retry roster. */
	opponentSlots?: number[];
	opponentCount?: number;
	/** Simulator references are serialized by the native battle serializer. */
	futureAttacks?: { turn: number, source: Pokemon, slots: PokemonSlot[], move: ActiveMove }[];
	encounterId: string;
	team: RoguePokemon[];
	boosts: StatsTable;
	bag: Record<string, number>;
	partnerBag?: Record<string, number>;
	/** Explicit per-ball probabilities supplied by the content configuration (0..1). */
	balls: { id: string, name: string, chance?: number, multiplier?: number, rule?: RogueBallRule }[];
	catchable: boolean;
	/** Only NPC captures granted by the Rocket blessing provoke the trainer. */
	npcCapture?: boolean;
	/** Permissions for this encounter, issued by the campaign server. Old/missing flags are locked. */
	tera?: { player: boolean, partner?: boolean, opponent: boolean };
	forcedTera?: boolean;
	/** First forced transformation per enemy seat; persisted by the battle checkpoint. */
	forcedTeraUsed?: ('p2' | 'p4')[];
	systems?: {
		player: { mega: boolean, z: boolean, gmega?: boolean },
		partner?: { mega: boolean, z: boolean, gmega?: boolean },
		opponent?: { mega: boolean, z: boolean, gmega?: boolean },
	};
	evolutionUses?: Partial<Record<SideID, Partial<Record<import('./rogue-universal-data').UniversalKind, boolean>>>>;
	captures?: RoguePokemon[];
	captured?: RoguePokemon;
	progression?: boolean;
	allowReplacement?: boolean;
	caughtSpecies?: number;
	caughtSpeciesIds?: string[];
	partnerCaughtSpecies?: number;
	partnerCaughtSpeciesIds?: string[];
	captureEnvironment?: { water: boolean, dark: boolean, fishing?: boolean };
	participants?: Record<string, string[]>;
	defeated?: RogueDefeat[];
}

export interface RogueBattleResult {
	/** Trusted physical equipment origins; absent in checkpoints created before source tracking. */
	itemSources?: Record<string, RogueItemSource>;
	/** Equipment removed by Knock Off, returned once at settlement, never during live growth. */
	knockedOffItems?: Record<string, RogueKnockedOffItem[]>;
	/** Last persisted growth acknowledgement applied by the simulator. */
	growthRevision?: number;
	coopExit?: 'retreat' | 'abandon';
	nuzlocke?: import('./rogue-nuzlocke').NuzlockeBattle;
	collapseMetrics?: import('./rogue-collapse-data').CollapseMetrics;
	turns?: number;
	allySurvived?: boolean;
	selfDestructed?: string[];
	companionZUsed?: boolean;
	partnerCompanionZUsed?: boolean;
	captures?: RoguePokemon[];
	captureOwners?: Partial<Record<string, 'p1' | 'p3'>>;
	blessingProgress?: RogueBattleState['blessingProgress'];
	partnerBlessingProgress?: RogueBattleState['blessingProgress'];
	blessingEffects?: import('./rogue-blessing-data').BlessingEffects;
	partnerBlessingEffects?: import('./rogue-blessing-data').BlessingEffects;
	encounterId: string;
	won: boolean;
	team: RoguePokemon[];
	partnerTeam?: RoguePokemon[];
	bag: Record<string, number>;
	partnerBag?: Record<string, number>;
	captured?: RoguePokemon;
	caughtSpeciesIds?: string[];
	partnerCaughtSpeciesIds?: string[];
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
	if (rogueComebackCard(source)) damage *= 1.2;
	if (buff(source)) damage *= 1.2;
	if (buff(target)) damage *= 0.9;
	const spirit = state.spirit;
	const player = (mon: Pokemon) => mon.side.id === 'p1' || mon.side.id === 'p3' && !!state.partner;
	if (spirit?.id === 'regigigas' && !state.duel) damage *= player(source) ? 2 : player(target) ? 0.5 : 1;
	if (player(source) || state.duel) {
		if (spirit?.id === 'gimmighoul') {
			const money = source.side.id === 'p1' ? spirit.money :
				source.side.id === 'p3' ? state.partner?.money : state.duel?.money;
			damage *= 1 + Math.max(0, money || 0) / 5000000;
		}
		if (spirit?.id === 'darkrai') damage *= 1 + Math.floor(spirit.floor / 2) / 100;
	}
	return damage === original ? damage : Math.max(1, Math.floor(damage));
}

export function rogueComebackCard(mon: Pokemon) {
	const state = mon.battle.fantasyRogue;
	return !!(mon.side.id === 'p1' ? state?.comebackCard : mon.side.id === 'p3' ? state?.partner?.comebackCard : false);
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

export interface RogueGrowthNotice {
	species: string;
	experience: number;
	level?: number;
	evolved: boolean;
	moves: string[];
	evolutionReady: boolean;
}

export function rogueGrowthNotice(before: RoguePokemon, after: RoguePokemon): RogueGrowthNotice | undefined {
	const notice = {
		species: after.set.species,
		experience: Math.max(0, (after.experience || 0) - (before.experience || 0)),
		level: after.set.level !== before.set.level ? after.set.level : undefined,
		evolved: before.set.species !== after.set.species,
		moves: (after.moveMemory || []).filter(move => !(before.moveMemory || []).some(old => old.id === move.id)).map(move => move.id),
		evolutionReady: !!after.evolutionNotice && !before.evolutionNotice,
	};
	return notice.experience || notice.level || notice.evolved || notice.moves.length || notice.evolutionReady ? notice : undefined;
}

export function initializeRogueBattle(battle: Battle) {
	// AI hypothetical worlds are restored separately from public observations.
	if (battle.deserialized) return;
	const state = battle.fantasyRogue;
	if (!state) throw new Error('幻想杯肉鸽必须从冒险存档进入。');
	state.participants = {};
	state.selfDestructed = [];
	state.weaknessPoliciesSpent = 0;
	state.partnerWeaknessPoliciesSpent = 0;
	state.defeated = [];
	state.blessingProgress = { kos: [], swords: 0, insight: {} };
	if (state.partner) state.partnerBlessingProgress = { kos: [], swords: 0, insight: {} };
	if (state.boss?.kind === 'arceus') battle.add('-message', '神之挑战：阿尔宙斯拥有十九条生命。当前为第 1 / 19 条生命。');
	if (state.boss?.kind === 'summit') battle.add('-message', '幻想超梦悬在塔顶，指挥五位守卫作战。击败它们后，超梦才会亲自下场。');
	if (isCoopBossBattle(battle)) {
		battle.add('-roguecoopboss', state.boss!.kind);
		battle.add('-message', '联机终局：两位玩家同时参战，敌方每次仅一只出场，全员 HP ×2。' +
			'巨大化仅改变外观，不是极巨化，不改变招式或免疫；超梦仍可超级进化。');
	}
	for (const [i, mon] of [...battle.p2.pokemon, ...(state.cooperative ? battle.p4!.pokemon : [])].entries()) {
		const slot = state.opponentSlots?.[i] ?? i;
		mon.set.fantasyRogueId = `${state.encounterId}:foe:${slot}`;
		if (slot < (state.escortCount || 0)) mon.canTerastallize = null;
		if (!state.duel && (state.opponentStars?.[slot] || 1) > 1) {
			const stars = state.opponentStars![slot];
			battle.add('-message', `${mon.species.name}为${'★'.repeat(stars)}宝可梦，六项能力值 ×${[1, 1, 1.2, 1.5, 2, 3][stars]}。`);
		}
	}
	if (state.duel) {
		for (const [i, mon] of battle.p2.pokemon.entries()) mon.set.fantasyRogueId = state.duel.team[i].id;
	}
	const savedSides = state.duel ? battle.sides.map(side => ({
		side, team: side.id === 'p1' ? state.team : state.duel!.team,
	})) : [
		{ side: battle.p1, team: state.team },
		...(state.partner ? [{ side: battle.p3!, team: state.partner.team }] : []),
	];
	for (const { side, team } of savedSides) {
		for (const mon of side.pokemon) {
			const saved = team.find(entry => entry.id === mon.set.fantasyRogueId);
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
		// Solo doubles skips Team Preview. Publish only already-fainted partners;
		// unrevealed healthy members and the existing lead-selection rules stay intact.
		if (!battle.ruleTable.has('teampreview')) {
			for (const mon of side.pokemon) {
				if (!mon.fainted) continue;
				const fusion = mon.getRogueFusionSprite();
				battle.add('poke', side.id, mon.details, '', `[fainted] ${mon.name}`,
					...(fusion ? [`[fusion] ${fusion}`] : []));
			}
		}
	}
	initializeRogueItemSources(battle);
}

export function startRogueArea(battle: Battle) {
	const env = battle.fantasyRogue?.environment, source = battle.p2.pokemon[0];
	if (!env || !source) return;
	if (env.weather && battle.field.setWeather(env.weather, source, battle.format)) battle.field.weatherState.duration = 5;
	if (env.terrain && battle.field.setTerrain(env.terrain, source, battle.format)) battle.field.terrainState.duration = 5;
	battle.add('-message', `区域环境：${env.name}，持续 5 回合。`);
}

/** The client must receive the switch record before a transformation record. */
export function rogueSwitchIn(pokemon: Pokemon) {
	const battle = pokemon.battle;
	const state = battle.fantasyRogue;
	const trial = state?.totemTrial;
	if (trial && ['p2', ...(state?.partner ? ['p4'] : [])].includes(pokemon.side.id) &&
		pokemon.species.id === toID(trial.species) && !pokemon.m.rogueTotemAura) {
		pokemon.m.rogueTotemAura = true;
		battle.add('-message', '霸主的气场提升了能力！强化可被清除，离场后不会重新触发。');
		// The trial aura is not a move or ability: Contrary/Simple must not reverse or double it.
		for (const [stat, amount] of Object.entries(trial.boosts)) {
			const key = stat as BoostID, increase = Math.min(6 - pokemon.boosts[key], Math.max(0, amount));
			if (!increase) continue;
			pokemon.boosts[key] += increase;
			battle.add('-boost', pokemon, key, increase, '[from] 霸主气场');
		}
	}
	if (!state?.forcedTera || pokemon.terastallized) return;
	const side = pokemon.side.id;
	const cooperative = battle.gameType === 'multi' && !!state.partner;
	if (side !== 'p2' && !(cooperative && side === 'p4')) return;
	if (state.forcedTeraUsed?.includes(side)) return;
	battle.actions.terastallize(pokemon);
	if (!pokemon.terastallized) return;
	(state.forcedTeraUsed ||= []).push(side);
	if (!cooperative || state.forcedTeraUsed.includes('p2') && state.forcedTeraUsed.includes('p4')) {
		state.forcedTera = false;
	}
}

export function canRogueSystem(pokemon: Pokemon, system: 'mega' | 'gmega' | 'z'): boolean {
	if (system !== 'z' && isRogueFormat(pokemon.battle.format.id) && pokemon.set.fantasyRogueModifiers?.fusion) return false;
	const state = pokemon.battle.fantasyRogue;
	if (!state) return true;
	if (system !== 'z' && state.evolutionUses?.[pokemon.side.id]?.[system]) return false;
	if (pokemon.side.id === 'p1') return !!state.systems?.player[system];
	if (pokemon.side.id === 'p3' && state.partner) return !!state.systems?.partner?.[system];
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
	const playerSides = [battle.p1, ...(state.partner ? [battle.p3!] : [])];
	const active = playerSides.flatMap(side => side.active).filter(mon => mon?.hp);
	if (!active.length) return;
	for (const foe of [...battle.p2.active, ...(state.cooperative ? battle.p4!.active : [])]) {
		if (!foe) continue;
		const participants = state.participants![foe.set.fantasyRogueId!] ||= [];
		for (const mon of active) {
			if (!participants.includes(mon.set.fantasyRogueId!)) participants.push(mon.set.fantasyRogueId!);
		}
	}
}

/** Record before spread damage resolves: the user faints before Explosion hits its opponents. */
export function recordRogueSelfDestruct(mon: Pokemon, source: Pokemon | null, effect: Effect | null) {
	const state = mon.battle.fantasyRogue, id = mon.set.fantasyRogueId;
	if (!state || mon.side.id !== 'p1' && !(state.partner && mon.side.id === 'p3') || !id) return;
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
		killer: source?.side.id === 'p1' || state.partner && source?.side.id === 'p3' ? source.set.fantasyRogueId : undefined,
		species: mon.set.species, level: mon.level, captured,
		participants: [...(state.participants![mon.set.fantasyRogueId!] || [])],
		eligible: [...battle.p1.pokemon, ...(state.partner ? battle.p3!.pokemon : [])]
			.filter(member => member.hp > 0 || !state.nuzlocke && (hasBlessing(member, 'insight') ||
				state.selfDestructed?.includes(member.set.fantasyRogueId!)))
			.map(member => member.set.fantasyRogueId!),
		dragonKing: battleDragonKing(battle.p1)?.member || '',
		...(state.partner ? { partnerDragonKing: battleDragonKing(battle.p3!)?.member || '' } : {}),
	});
}

function captureSide(state: RogueBattleState, requested?: Side): 'p1' | 'p3' {
	if (state.coopCapture) return state.coopCapture.ownerSide;
	return state.cooperative && requested?.id === 'p3' ? 'p3' : 'p1';
}
function captureInventory(state: RogueBattleState, side: 'p1' | 'p3') {
	return side === 'p3' ? state.partnerBag : state.bag;
}
function caughtCount(state: RogueBattleState, side: 'p1' | 'p3') {
	return side === 'p3' ? state.partnerCaughtSpecies || 0 : state.caughtSpecies || 0;
}
function caughtIDs(state: RogueBattleState, side: 'p1' | 'p3') {
	return side === 'p3' ? (state.partnerCaughtSpeciesIds ||= []) : (state.caughtSpeciesIds ||= []);
}

export function chooseRogueBall(side: Side, id: string) {
	const state = side.battle.fantasyRogue;
	const permittedSide = state && (state.cooperative ?
		state.coopCapture?.ownerSide === side.id && state.coopCapture.ball === id : side.id === 'p1');
	const inventory = state && captureInventory(state, side.id === 'p3' ? 'p3' : 'p1');
	const target = state?.coopCapture ?
		(state.coopCapture.targetSide === 'p2' ? side.battle.p2 : side.battle.p4)?.active[state.coopCapture.targetSlot] :
		side.foe.active[0];
	const capacity = state?.cooperative ? !!state.coopCaptureCapacity?.[side.id as 'p1' | 'p3'] :
		!!state && (state.team.length < 6 || state.allowReplacement);
	if (!state || !permittedSide || side.requestState !== 'move' || !state.catchable || !capacity ||
		!nuzlockeCanCatch(side.battle, target) ||
		(id === 'masterball' && (!state.wild || state.npcCapture)) || !state.balls.some(ball => ball.id === id) ||
		!inventory || !(inventory[id] > 0) ||
		!side.active[0]?.hp || !target?.hp ||
		state.coopCapture && target.set.fantasyRogueId !== state.coopCapture.targetId) {
		return side.emitChoiceError('当前不能使用这个精灵球。');
	}
	side.choice.actions.push({ choice: 'rogueball', pokemon: side.active[0], moveid: id });
	return true;
}

/** Uses the exact integer shake/critical thresholds used by throwRogueBall, without drawing RNG. */
export function rogueCaptureChance(battle: Battle, ball: RogueBattleState['balls'][number], requestedSide?: Side,
	requestedTarget?: Pokemon): number | null {
	const state = battle.fantasyRogue;
	const target = requestedTarget || (state?.coopCapture ?
		(state.coopCapture.targetSide === 'p2' ? battle.p2 : battle.p4)?.active[state.coopCapture.targetSlot] : battle.p2?.active[0]);
	if (!state?.catchable || !target?.hp || !nuzlockeCanCatch(battle, target)) return null;
	if (ball.id === 'masterball') return state.wild && !state.npcCapture ? 1 : null;
	const ownerSide = captureSide(state, requestedSide);
	const catcher = (ownerSide === 'p3' ? battle.p3 : battle.p1)?.active[0];
	if (!catcher?.hp) return null;
	const multiplier = (state.spirit?.id === 'mew' ? 2 : 1) *
		(hasBlessing(catcher, 'catcher') ? 1.5 : 1) * echoChance(playerEcho(catcher)?.catch);
	if (ball.chance !== undefined) return Math.min(1, Math.round(ball.chance * 1000000) / 1000000 * multiplier);
	const threshold = captureThresholds(rogueBallCatchRate(battle, ball, rogueSpeciesData(target.set.species).catchRate, target),
		target.maxhp, target.hp, target.status, rogueBallMultiplier(battle, ball, target, catcher), caughtCount(state, ownerSide));
	if (threshold.guaranteed) return 1;
	const shake = threshold.shake / 65536;
	const critical = threshold.critical / 256;
	return Math.min(1, (critical * shake + (1 - critical) * shake ** 4) * multiplier);
}

export function throwRogueBall(battle: Battle, id: string) {
	const state = battle.fantasyRogue!;
	const ownerSide = captureSide(state);
	const catcher = (ownerSide === 'p3' ? battle.p3 : battle.p1)?.active[0];
	if (!catcher?.hp) return;
	const inventory = captureInventory(state, ownerSide);
	const ball = state.balls.find(entry => entry.id === id)!;
	const target = state.coopCapture ?
		(state.coopCapture.targetSide === 'p2' ? battle.p2 : battle.p4)?.active[state.coopCapture.targetSlot] : battle.p2.active[0];
	if (!state.catchable || !target?.hp || !nuzlockeCanCatch(battle, target) || !inventory || !(inventory[id] > 0) ||
		state.coopCapture && target.set.fantasyRogueId !== state.coopCapture.targetId ||
		id === 'masterball' && (!state.wild || state.npcCapture)) return;
	inventory[id]--;
	battle.add('-message', `投出了${ball.name}！`);
	let success: boolean;
	let shakes = 0;
	let critical = false;
	// The order spirit removes battle randomness, never the advertised capture roll.
	const chance = state.spirit?.id === 'zygardeorder' ?
		battle.prng.randomChance.bind(battle.prng) : battle.randomChance.bind(battle);
	if (id === 'masterball') {
		success = true; shakes = 3;
	} else if (state.spirit?.id === 'mew' || hasBlessing(catcher, 'catcher') || playerEcho(catcher)?.catch) {
		success = chance(Math.round(rogueCaptureChance(battle, ball, battle[ownerSide])! * 1000000), 1000000);
		shakes = success ? 3 : 1;
	} else if (ball.chance !== undefined) {
		success = chance(Math.round(ball.chance * 1000000), 1000000);
		shakes = success ? 3 : 1;
	} else {
		const threshold = captureThresholds(rogueBallCatchRate(battle, ball, rogueSpeciesData(target.set.species).catchRate, target),
			target.maxhp, target.hp, target.status, rogueBallMultiplier(battle, ball, target, catcher), caughtCount(state, ownerSide));
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
		id: (state.opponentCount ?? battle.p2.pokemon.length) === 1 ? state.encounterId : target.set.fantasyRogueId!,
		set: structuredClone(target.set), hp: target.hp, maxhp: target.m.rogueCollapseBaseHP ?? target.baseMaxhp,
		pp: target.baseMoveSlots.map(slot => ({ id: slot.id, pp: slot.pp, maxpp: slot.maxpp })),
		status: target.status, statusState: {},
	};
	delete original.set.fantasyRogueStats;
	delete original.set.fantasyRogueScale;
	delete original.set.fantasyRogueDifficulty;
	delete original.set.fantasyRogueModifiers;
	delete original.set.fantasyRogueId;
	state.captured = snapshotRoguePokemon(target, original);
	const capturedItemSource = rogueItemSource(target);
	if (capturedItemSource) (state.capturedItemSources ||= {})[original.id] = capturedItemSource;
	state.captured.set.pokeball = id;
	if (id === 'friendball') state.captured.set.happiness = 150;
	if (id === 'healball') {
		state.captured.hp = state.captured.maxhp; state.captured.status = '';
		state.captured.statusState = {}; delete state.captured.statuses;
		for (const slot of state.captured.pp) slot.pp = slot.maxpp;
	}
	(state.captures ||= []).push(state.captured);
	(state.captureOwners ||= {})[state.captured.id] = ownerSide;
	if (state.cooperative && state.coopCaptureSlots) {
		const remainingSlots = Math.max(0, (state.coopCaptureSlots[ownerSide] || 0) - 1);
		state.coopCaptureSlots[ownerSide] = remainingSlots;
		state.coopCaptureCapacity ||= {};
		state.coopCaptureCapacity[ownerSide] = remainingSlots > 0;
	}
	const caught = caughtIDs(state, ownerSide);
	if (!caught.includes(target.species.id)) {
		caught.push(target.species.id);
		if (ownerSide === 'p3') state.partnerCaughtSpecies = (state.partnerCaughtSpecies || 0) + 1;
		else state.caughtSpecies = (state.caughtSpecies || 0) + 1;
	}
	recordRogueDefeat(battle, target, true);
	battle.add('-message', `成功捕捉了${target.species.name}！`);
	// Remove the caught opponent without KO abilities, KO rewards or a second faint animation.
	battle.queue.cancelAction(target);
	target.hp = 0;
	target.fainted = true;
	target.side.pokemonLeft--;
	// Commit both the catch and its recovery snapshot before the end packet, in one transaction.
	battle.send('fantasyroguecapture', JSON.stringify({ captured: state.captured, ownerSide,
		result: { ...rogueBattleResult(battle, false), won: !target.side.pokemonLeft } }));
	// The capture protocol removes it visually; a zero-HP update would look like a knockout.
	const opposingSides = state.cooperative ? [battle.p2, battle.p4].filter((side): side is Side => !!side) : [target.side];
	if (opposingSides.every(side => !side.pokemonLeft)) battle.win(battle.p1);
}

export function rogueBattleResult(battle: Battle, final = true): RogueBattleResult {
	const state = battle.fantasyRogue!;
	const knockedOffItems: Record<string, RogueKnockedOffItem[]> = {};
	for (const side of [battle.p1, ...(state.partner ? [battle.p3!] : [])]) {
		for (const mon of side.pokemon) {
			if (mon.set.fantasyRogueId && mon.m.rogueKnockedOffItems?.length) {
				knockedOffItems[mon.set.fantasyRogueId] = structuredClone(mon.m.rogueKnockedOffItems);
			}
		}
	}
	const itemSources = state.itemSourceVersion ? { ...state.capturedItemSources } : undefined;
	if (itemSources) for (const side of [battle.p1, ...(state.partner ? [battle.p3!] : [])]) {
		for (const mon of side.pokemon) {
			const source = rogueItemSource(mon);
			if (source && mon.set.fantasyRogueId) itemSources[mon.set.fantasyRogueId] = source;
		}
	}
	// Produce a pure snapshot: previews and repeated serialization cannot issue an extra refund.
	const bag = { ...state.bag };
	const partnerBag = state.partnerBag && { ...state.partnerBag };
	if (final && state.weaknessPoliciesSpent) bag.weaknesspolicy = (bag.weaknesspolicy || 0) + state.weaknessPoliciesSpent;
	if (final && partnerBag && state.partnerWeaknessPoliciesSpent) {
		partnerBag.weaknesspolicy = (partnerBag.weaknesspolicy || 0) + state.partnerWeaknessPoliciesSpent;
	}
	return {
		itemSources, growthRevision: state.growthRevision,
		...(Object.keys(knockedOffItems).length ? { knockedOffItems } : {}),
		turns: battle.turn, allySurvived: battle.p3?.pokemon.some(mon => mon.hp > 0),
		coopExit: state.coopExit,
		nuzlocke: state.nuzlocke && structuredClone(state.nuzlocke),
		collapseMetrics: state.collapseMetrics && structuredClone(state.collapseMetrics),
		companionZUsed: !!state.companionZUsed?.p1,
		partnerCompanionZUsed: state.partner ? !!state.companionZUsed?.p3 : undefined,
		selfDestructed: state.selfDestructed && [...state.selfDestructed],
		encounterId: state.encounterId, won: battle.winner === battle.p1.name || !!state.cooperative && battle.winner === battle.p3!.name,
		team: state.team.map(saved => {
			const mon = battle.p1.pokemon.find(entry => entry.set.fantasyRogueId === saved.id)!;
			return snapshotRoguePokemon(mon, saved);
		}),
		partnerTeam: state.partner?.team.map(saved => {
			const mon = battle.p3!.pokemon.find(entry => entry.set.fantasyRogueId === saved.id)!;
			return snapshotRoguePokemon(mon, saved);
		}),
		bag, partnerBag,
		captureOwners: state.captureOwners && { ...state.captureOwners },
		caughtSpeciesIds: state.caughtSpeciesIds && [...state.caughtSpeciesIds],
		partnerCaughtSpeciesIds: state.partnerCaughtSpeciesIds && [...state.partnerCaughtSpeciesIds],
		captured: state.captured && structuredClone(state.captured),
		captures: state.captures && structuredClone(state.captures),
		defeated: state.defeated && structuredClone(state.defeated),
		blessingProgress: structuredClone(blessingProgress(battle)),
		partnerBlessingProgress: state.partner ? structuredClone(blessingProgress(battle, battle.p3)) : undefined,
		blessingEffects: state.blessings && structuredClone(state.blessings),
		partnerBlessingEffects: state.partner?.blessings && structuredClone(state.partner.blessings),
	};
}
