import { Dex, toID } from '../../sim/dex';
import type { ChoiceRequest, PokemonSwitchRequestData } from '../../sim/side';
import type { Observation } from './information';
import {
	enumerateDoublesChoices, type DoublesAction, type DoublesChoice, type DoublesChoiceOptions,
} from './doubles-actions';
import { readBattleMemory } from './memory';
import {
	DoublesDamageModel, type DoublesMechanicsPokemon, type DoublesTurnAction, type DoublesTurnSample,
} from './doubles-mechanics';

type Position = 'p1a' | 'p1b' | 'p2a' | 'p2b';
type SideID = 'p1' | 'p2';
type StatID = 'atk' | 'def' | 'spa' | 'spd' | 'spe';

interface PublicPokemon {
	position: Position;
	ident: string;
	species: string;
	level: number;
	hp: number;
	status: string;
	toxicStage?: number;
	sleepTurns?: number;
	volatiles: Set<string>;
	ability?: string;
	item?: string;
	types: string[];
	baseTypes: string[];
	teraType?: string;
	terastallized?: string;
	boosts: SparseBoostsTable;
	moves: Set<string>;
	lastMove?: string;
	lastMoveTurn?: number;
	protectStreak?: number;
	lastTarget?: Position;
	chargeMove?: string;
	activeActions: number;
}

interface PublicState {
	turn: number;
	active: Map<Position, PublicPokemon>;
	preview: Record<SideID, { species: string, level: number }[]>;
	conditions: Record<SideID, Set<string>>;
	weather: string;
	terrain: string;
	trickRoom: boolean;
	magicRoom?: boolean;
	damageModel?: DoublesDamageModel;
}

interface OwnPokemon {
	request: PokemonSwitchRequestData;
	species: string;
	level: number;
	hp: number;
	status: string;
	maxHP: number;
	types: string[];
	ability: string;
	teraType?: string;
	boosts: SparseBoostsTable;
	volatiles: Set<string>;
	position?: Position;
}

interface ActionValue {
	action: DoublesAction;
	damage: Map<string, number>;
	utility: number;
	reasons: string[];
	moveID?: string;
	targets: string[];
}

export interface DoublesScoredChoice {
	choice: string;
	score: number;
	reasons: string[];
	resourcesUsed: number;
	mechanics?: {
		probes: number, failures: string[], omittedVolatiles: string[], turnProbes?: number, turnFailures?: string[],
	};
	jointTurn?: { hypotheses: number, candidates: number, skipped: number };
}

export interface DoublesPolicyResult {
	choice: string;
	scored: DoublesScoredChoice[];
	foes: number[];
	turn: number;
}

const POSITION_ORDER: Position[] = ['p1a', 'p1b', 'p2a', 'p2b'];
const PROTECT_MOVES = new Set([
	'protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'maxguard',
]);
const REDIRECT_MOVES = new Set(['followme', 'ragepowder', 'spotlight']);
const plausibleMoveCache = new WeakMap<ModdedDex, Map<string, string[]>>();
const threatEstimateCache = new WeakMap<PublicPokemon, WeakMap<OwnPokemon, number>>();

// The Multi controller supplies a mod ID; solo callers supply a registered format ID.
// Dex.forFormat('gen9fantasy') resolves an unknown format to the base Dex, losing all custom species.
const policyDex = (format: string) => format === 'gen9fantasy' ? Dex.mod(format) : Dex.forFormat(format);

function parseHealth(condition: string): number {
	if (condition === '0' || condition.endsWith(' fnt')) return 0;
	const fraction = /^(\d+)\/(\d+)/.exec(condition);
	if (fraction && Number(fraction[2])) return Math.max(0, Math.min(1, Number(fraction[1]) / Number(fraction[2])));
	const percent = /^(\d+(?:\.\d+)?)%/.exec(condition);
	return percent ? Math.max(0, Math.min(1, Number(percent[1]) / 100)) : 1;
}

function parseDetails(details: string): { species: string, level: number, teraType?: string } {
	const parts = details.split(', ');
	return {
		species: parts[0],
		level: Number(parts.find(part => /^L\d+$/.test(part))?.slice(1)) || 100,
		teraType: parts.find(part => part.startsWith('tera:'))?.slice(5),
	};
}

function publicPosition(ident: string): Position | undefined {
	const position = ident.slice(0, 3) as Position;
	return POSITION_ORDER.includes(position) ? position : undefined;
}

function positionLocation(position: Position): number {
	return position[2] === 'a' ? 1 : 2;
}

function newPublicPokemon(
	position: Position, ident: string, details: string, condition: string, dex: ModdedDex,
): PublicPokemon {
	const parsed = parseDetails(details);
	const species = dex.species.get(parsed.species);
	return {
		position, ident, species: parsed.species, level: parsed.level,
		hp: parseHealth(condition), status: condition.split(' ')[1] || '',
		types: parsed.teraType && parsed.teraType !== 'Stellar' ? [parsed.teraType] : species.types.slice(),
		baseTypes: species.types.slice(), teraType: parsed.teraType,
		terastallized: parsed.teraType,
		boosts: {}, moves: new Set(), volatiles: new Set(), activeActions: 0,
	};
}

/** Parses only the filtered public protocol already held by InformationView. */
function readPublicState(log: readonly string[], dex: ModdedDex): PublicState {
	const state: PublicState = {
		turn: 0, active: new Map(), preview: { p1: [], p2: [] },
		conditions: { p1: new Set(), p2: new Set() }, weather: '', terrain: '', trickRoom: false,
	};
	for (const line of log) {
		const fields = line.split('|');
		const [, event, target = '', value = '', extra = ''] = fields;
		const position = publicPosition(target);
		const side = target.slice(0, 2) as SideID;
		let mon = position ? state.active.get(position) : undefined;
		// Native activation/damage/weather messages also publicly disclose ability/item owners.
		const ownerField = fields.find(field => field.startsWith('[of] '));
		const ownerPosition = ownerField ? publicPosition(ownerField.slice(5)) : position;
		const owner = ownerPosition && state.active.get(ownerPosition);
		const ability = fields.find(field => field.startsWith('[from] ability: '))?.slice(16) ||
			(event === '-activate' && value.startsWith('ability: ') ? value.slice(9) : '');
		const item = fields.find(field => field.startsWith('[from] item: '))?.slice(13);
		if (owner && ability) owner.ability = toID(ability);
		if (owner && item) owner.item = toID(item);
		if (event === 'turn') {
			state.turn = Number(target) || state.turn;
			continue;
		}
		if (event === 'poke' && (side === 'p1' || side === 'p2')) {
			const details = parseDetails(value);
			state.preview[side].push({ species: details.species, level: details.level });
			continue;
		}
		if ((event === 'switch' || event === 'drag' || event === 'replace') && position) {
			const previous = mon;
			mon = newPublicPokemon(position, target, value, extra, dex);
			if (event === 'replace' && previous) {
				Object.assign(mon, { hp: extra ? mon.hp : previous.hp, status: extra ? mon.status : previous.status,
					activeActions: previous.activeActions, boosts: previous.boosts,
					toxicStage: previous.toxicStage, sleepTurns: previous.sleepTurns,
					moves: previous.moves, volatiles: previous.volatiles,
					lastMove: previous.lastMove, lastMoveTurn: previous.lastMoveTurn, protectStreak: previous.protectStreak,
					lastTarget: previous.lastTarget, chargeMove: previous.chargeMove });
			}
			state.active.set(position, mon);
			continue;
		}
		if (event === 'faint' && mon) {
			mon.hp = 0;
			continue;
		}
		if (['-damage', '-heal', '-sethp'].includes(event) && mon) {
			mon.hp = parseHealth(value);
			mon.status = value.split(' ')[1] || mon.status;
			if (event === '-damage' && mon.status === 'tox' && fields.includes('[from] psn')) {
				mon.toxicStage = Math.min(15, (mon.toxicStage || 0) + 1);
			}
			continue;
		}
		if (event === '-status' && mon) {
			mon.status = toID(value); mon.toxicStage = mon.sleepTurns = 0;
			continue;
		}
		if (event === '-curestatus' && mon) { mon.status = ''; continue; }
		if (event === '-ability' && mon) {
			mon.ability = toID(value); mon.volatiles.delete('suppressability'); continue;
		}
		if (event === '-endability' && mon) { mon.volatiles.add('suppressability'); continue; }
		if (event === '-item' && mon) { mon.item = toID(value); continue; }
		if (event === '-enditem' && mon) { delete mon.item; continue; }
		if ((event === '-start' || event === '-end') && mon) {
			const effect = toID(value.replace(/^(move|ability): /i, ''));
			if (effect === 'typechange' && event === '-start') {
				mon.baseTypes = extra.split('/');
				if (!mon.terastallized) mon.types = mon.baseTypes.slice();
				continue;
			}
			if (event === '-start') mon.volatiles.add(effect);
			else {
				mon.volatiles.delete(effect);
				if (effect === 'protosynthesis' || effect === 'quarkdrive') {
					for (const id of mon.volatiles) if (id.startsWith(effect)) mon.volatiles.delete(id);
				}
			}
			continue;
		}
		if (event === '-transform' && mon) {
			const copiedPosition = publicPosition(value);
			const copied = copiedPosition && state.active.get(copiedPosition);
			if (copied) {
				mon.species = copied.species;
				mon.baseTypes = copied.baseTypes.slice();
				if (!mon.terastallized) mon.types = mon.baseTypes.slice();
				mon.ability = copied.ability;
				mon.boosts = { ...copied.boosts };
			}
			continue;
		}
		if (event === 'detailschange' || event === '-formechange') {
			if (position && mon) {
				const details = parseDetails(value);
				mon.species = details.species;
				if (/, L\d+(,|$)/.test(value)) mon.level = details.level;
				mon.baseTypes = dex.species.get(details.species).types.slice();
				if (!mon.terastallized) mon.types = mon.baseTypes.slice();
			}
			continue;
		}
		if (event === '-terastallize' && mon) {
			mon.teraType = mon.terastallized = value;
			if (value !== 'Stellar') mon.types = [value];
			continue;
		}
		if (event === '-boost' || event === '-unboost' || event === '-setboost') {
			if (!mon) continue;
			const stat = toID(value) as BoostID;
			if (!['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'].includes(stat)) continue;
			const amount = Number(extra) || 0;
			mon.boosts[stat] = event === '-setboost' ? amount : (mon.boosts[stat] || 0) + (event === '-boost' ? amount : -amount);
			continue;
		}
		if (event === '-clearallboost') {
			for (const active of state.active.values()) active.boosts = {};
			continue;
		}
		if (['-clearboost', '-clearnegativeboost', '-clearpositiveboost'].includes(event) && mon) {
			for (const stat of Object.keys(mon.boosts) as BoostID[]) {
				if (event === '-clearboost' || (event === '-clearnegativeboost' ? mon.boosts[stat]! < 0 : mon.boosts[stat]! > 0)) {
					delete mon.boosts[stat];
				}
			}
			continue;
		}
		if (event === 'move' && mon) {
			mon.activeActions++;
			mon.protectStreak = PROTECT_MOVES.has(toID(value)) ?
				(mon.lastMoveTurn === state.turn - 1 ? mon.protectStreak || 0 : 0) + 1 : 0;
			mon.lastMove = toID(value);
			mon.lastMoveTurn = state.turn;
			mon.lastTarget = publicPosition(extra);
			delete mon.chargeMove;
			mon.moves.add(mon.lastMove);
			continue;
		}
		if (event === '-prepare' && mon) { mon.chargeMove = toID(value); continue; }
		if (event === 'cant' && mon) {
			mon.activeActions++; mon.protectStreak = 0;
			if (value === 'slp') mon.sleepTurns = (mon.sleepTurns || 0) + 1;
			continue;
		}
		if (event === '-fail' && mon && PROTECT_MOVES.has(mon.lastMove || '')) { mon.protectStreak = 0; continue; }
		if ((event === '-sidestart' || event === '-sideend') && (side === 'p1' || side === 'p2')) {
			const condition = toID(value.replace(/^(move|ability): /i, ''));
			if (event === '-sidestart') state.conditions[side].add(condition);
			else state.conditions[side].delete(condition);
			continue;
		}
		if (event === '-weather') {
			state.weather = toID(target) === 'none' ? '' : toID(target);
			if (state.weather === 'sun') state.weather = 'sunnyday';
			if (state.weather === 'rain') state.weather = 'raindance';
			if (state.weather === 'snow') state.weather = 'snowscape';
			continue;
		}
		if (event === '-fieldstart') {
			const condition = toID(target.replace(/^(move|ability): /i, ''));
			if (condition.includes('terrain')) state.terrain = condition;
			if (condition === 'trickroom') state.trickRoom = true;
			if (condition === 'magicroom') state.magicRoom = true;
			continue;
		}
		if (event === '-fieldend') {
			const condition = toID(target.replace(/^(move|ability): /i, ''));
			if (condition.includes('terrain')) state.terrain = '';
			if (condition === 'trickroom') state.trickRoom = false;
			if (condition === 'magicroom') state.magicRoom = false;
		}
	}
	return state;
}

function hpStat(species: Species, level: number): number {
	return Math.floor((2 * species.baseStats.hp + 31 + 32) * level / 100) + level + 10;
}

function otherStat(base: number, level: number): number {
	return Math.floor((2 * base + 31 + 32) * level / 100) + 5;
}

function boostMultiplier(boost: number): number {
	return boost >= 0 ? (2 + Math.min(6, boost)) / 2 : 2 / (2 - Math.max(-6, boost));
}

function statValue(mon: OwnPokemon | PublicPokemon, stat: StatID, dex: ModdedDex): number {
	if ('request' in mon) return mon.request.stats[stat] * boostMultiplier(mon.boosts[stat] || 0);
	const base = dex.species.get(mon.species).baseStats[stat];
	return otherStat(base, mon.level) * boostMultiplier(mon.boosts[stat] || 0);
}

function maxHP(mon: OwnPokemon | PublicPokemon, dex: ModdedDex): number {
	return 'maxHP' in mon ? mon.maxHP : hpStat(dex.species.get(mon.species), mon.level);
}

function typing(mon: OwnPokemon | PublicPokemon): string[] {
	return mon.types;
}

function effectiveness(dex: ModdedDex, move: Move, defender: OwnPokemon | PublicPokemon): number {
	const moveType = toID(move.type);
	if (moveType === 'ground' && defender.ability === 'levitate' ||
		moveType === 'fire' && defender.ability === 'flashfire' ||
		moveType === 'water' && ['waterabsorb', 'stormdrain', 'dryskin'].includes(defender.ability || '') ||
		moveType === 'electric' && ['voltabsorb', 'lightningrod', 'motordrive'].includes(defender.ability || '') ||
		moveType === 'grass' && defender.ability === 'sapsipper') return 0;
	if (!dex.getImmunity(move.type, typing(defender))) return 0;
	return 2 ** dex.getEffectiveness(move.type, typing(defender));
}

function grounded(mon: OwnPokemon | PublicPokemon): boolean {
	const ability = mon.ability || '';
	const item = 'request' in mon ? toID(mon.request.item) : mon.item || '';
	if (mon.types.some(type => toID(type) === 'flying') || ability === 'levitate' || item === 'airballoon') return false;
	if (mon.volatiles.has('magnetrise') || mon.volatiles.has('telekinesis') || mon.volatiles.has('fly') ||
		mon.volatiles.has('bounce') || mon.volatiles.has('skydrop')) return false;
	return true;
}

function psychicTerrainBlocks(state: PublicState, move: Move, target: OwnPokemon | PublicPokemon): boolean {
	return move.priority > 0 && state.terrain === 'psychicterrain' && !('request' in target) && grounded(target);
}

function damageFraction(
	dex: ModdedDex, attacker: OwnPokemon | PublicPokemon, defender: OwnPokemon | PublicPokemon, move: Move,
	spreadScale = 1, transformed = false, weather = '',
): number {
	if (move.category === 'Status') return 0;
	const power = move.damage === 'level' ? attacker.level : typeof move.damage === 'number' ? move.damage :
		move.ohko ? 140 : move.basePower;
	if (!power) return 0;
	const attackID = move.category === 'Physical' ? 'atk' : 'spa';
	const defenseID = move.category === 'Physical' ? 'def' : 'spd';
	const attack = statValue(attacker, attackID, dex);
	const defense = Math.max(1, statValue(defender, defenseID, dex));
	const raw = (((2 * attacker.level / 5 + 2) * power * attack / defense) / 50) + 2;
	const types = typing(attacker);
	const moveType = toID(move.type);
	const sameType = types.some(type => toID(type) === moveType);
	const teraType = 'teraType' in attacker ? attacker.teraType : undefined;
	const stab = transformed && toID(teraType) === moveType ? (sameType ? 2 : 1.5) : sameType ? 1.5 : 1;
	const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
	const weatherBoost = ['sunnyday', 'desolateland'].includes(weather) ?
		(moveType === 'fire' ? 1.5 : moveType === 'water' ? 0.5 : 1) :
		['raindance', 'primordialsea'].includes(weather) ?
			(moveType === 'water' ? 1.5 : moveType === 'fire' ? 0.5 : 1) : 1;
	const hp = Math.max(1, maxHP(defender, dex));
	return Math.max(0, Math.min(1.5,
		raw * stab * effectiveness(dex, move, defender) * spreadScale * accuracy * weatherBoost / hp));
}

function ownFromRequest(request: PokemonSwitchRequestData, dex: ModdedDex): OwnPokemon {
	const details = parseDetails(request.details);
	const species = dex.species.get(details.species);
	const actualMaxHP = /^(\d+)\/(\d+)/.exec(request.condition)?.[2];
	return {
		request, species: details.species, level: details.level, hp: parseHealth(request.condition),
		status: request.condition.split(' ')[1] || '',
		maxHP: actualMaxHP ? Number(actualMaxHP) : hpStat(species, details.level), types: species.types.slice(),
		ability: toID(request.ability || request.baseAbility),
		teraType: request.terastallized || request.teraType || details.teraType,
		boosts: {}, volatiles: new Set(),
	};
}

function ownActiveSlots(request: ChoiceRequest, state: PublicState, dex: ModdedDex): OwnPokemon[] {
	// Native requests put the field slots first, including a fainted slot awaiting replacement.
	// Nicknames are not unique (and Illusion can change the public name).
	const count = 'active' in request ? request.active.length : request.forceSwitch?.length || 0;
	return request.side.pokemon.slice(0, count).map((mon, index) => {
		const profile = ownFromRequest(mon, dex);
		const seen = state.active.get(`${request.side.id}${index ? 'b' : 'a'}` as Position);
		if (seen) {
			profile.boosts = seen.boosts;
			profile.volatiles = seen.volatiles;
			profile.teraType = mon.terastallized || ('active' in request ? request.active[index]?.canTerastallize : undefined) ||
				mon.teraType || seen.teraType;
			profile.types = seen.types.slice();
		}
		profile.position = `${request.side.id}${index ? 'b' : 'a'}` as Position;
		if (mon.terastallized && mon.terastallized !== 'Stellar') profile.types = [mon.terastallized];
		return profile;
	});
}

function ownParty(request: ChoiceRequest, dex: ModdedDex): OwnPokemon[] {
	return request.side.pokemon.map(mon => ownFromRequest(mon, dex));
}

function nativeDamageModel(
	request: ChoiceRequest, own: OwnPokemon[], party: OwnPokemon[], foes: PublicPokemon[],
	state: PublicState, dex: ModdedDex,
) {
	const pokemon: DoublesMechanicsPokemon[] = party.map((reserve, index) => {
		const mon = own[index] || reserve;
		const seen = mon.position ? state.active.get(mon.position) : undefined;
		return {
			id: mon.position || `reserve-${index}`, side: request.side.id as SideID, position: mon.position,
			species: mon.species, level: mon.level, health: mon.hp, stats: { hp: mon.maxHP, ...mon.request.stats },
			ability: mon.ability, item: mon.request.item, moves: mon.request.moves.slice(),
			types: seen?.baseTypes.slice() || dex.species.get(mon.species).types.slice(),
			teraType: mon.teraType, terastallized: mon.request.terastallized || seen?.terastallized,
			status: mon.status, boosts: mon.boosts, volatiles: [...mon.volatiles],
			toxicStage: seen?.toxicStage, sleepTurns: seen?.sleepTurns,
			activeActions: seen?.activeActions || 0, lastMove: seen?.lastMove,
			protectStreak: seen?.lastMoveTurn === state.turn - 1 ? seen.protectStreak : 0,
			lastTarget: seen?.lastTarget, chargeMove: seen?.chargeMove,
		};
	});
	for (const mon of foes) pokemon.push({
		id: mon.position, side: mon.position.slice(0, 2) as SideID, position: mon.position,
		species: mon.species, level: mon.level, health: mon.hp, ability: mon.ability, item: mon.item,
		moves: [...mon.moves], types: mon.baseTypes.slice(), teraType: mon.teraType, terastallized: mon.terastallized,
		status: mon.status, boosts: mon.boosts, volatiles: [...mon.volatiles], activeActions: mon.activeActions,
		toxicStage: mon.toxicStage, sleepTurns: mon.sleepTurns,
		lastMove: mon.lastMove, lastTarget: mon.lastTarget, chargeMove: mon.chargeMove,
		protectStreak: mon.lastMoveTurn === state.turn - 1 ? mon.protectStreak : 0,
	});
	return new DoublesDamageModel({ mod: dex.currentMod, turn: state.turn, pokemon,
		weather: state.weather, terrain: state.terrain, trickRoom: state.trickRoom, magicRoom: state.magicRoom,
		conditions: { p1: [...state.conditions.p1], p2: [...state.conditions.p2] } });
}

function slotForLoc(target: number, own: OwnPokemon[], foes: PublicPokemon[]): OwnPokemon | PublicPokemon | undefined {
	if (target > 0) return foes.find(mon => positionLocation(mon.position) === target);
	if (!target) return;
	const ownLoc = Math.abs(target) - 1;
	return own[ownLoc];
}

function actionMove(request: ChoiceRequest, action: DoublesAction, dex: ModdedDex): Move | undefined {
	if (action.kind !== 'move' || !('active' in request)) return;
	const index = Number(/^move (\d+)/.exec(action.command)?.[1]) - 1;
	const requestMove = request.active[action.slot]?.moves[index];
	if (!requestMove) return;
	let id = requestMove.id;
	if (action.transform === 'zmove') {
		const zMove = request.active[action.slot].canZMove?.[index] as { move?: string } | null | undefined;
		if (zMove?.move) id = toID(zMove.move);
	} else if (action.transform === 'dynamax') {
		const maxMove = request.active[action.slot].maxMoves?.maxMoves[index];
		if (maxMove?.move) id = toID(maxMove.move);
	}
	const move = dex.moves.get(id);
	return move.exists ? move : dex.moves.get(action.move || requestMove.id);
}

function selectedTargets(
	move: Move, action: DoublesAction, actorSlot: number, own: OwnPokemon[], foes: PublicPokemon[],
): (OwnPokemon | PublicPokemon)[] {
	if (['allAdjacentFoes', 'foeSide'].includes(move.target)) return foes;
	if (move.target === 'allAdjacent') {
		return [...own, ...foes].filter((_, index) => index !== actorSlot);
	}
	if (move.target === 'self') return own[actorSlot] ? [own[actorSlot]] : [];
	if (move.target === 'allies') return own.filter((_, index) => index !== actorSlot);
	if (['all', 'allySide', 'allyTeam'].includes(move.target)) return [];
	if (action.target) {
		const target = slotForLoc(action.target, own, foes);
		return target ? [target] : [];
	}
	if (['randomNormal', 'scripted'].includes(move.target)) return foes;
	return [];
}

function estimateThreat(
	dex: ModdedDex, foe: PublicPokemon, defender: OwnPokemon, ownSlots: OwnPokemon[], foeCount: number, weather = '',
	redirectableOnly = false, model?: DoublesDamageModel,
): number {
	let estimatesByDefender = threatEstimateCache.get(foe);
	if (!estimatesByDefender) {
		estimatesByDefender = new WeakMap<OwnPokemon, number>();
		threatEstimateCache.set(foe, estimatesByDefender);
	}
	const cachedEstimate = estimatesByDefender.get(defender);
	if (!redirectableOnly && cachedEstimate !== undefined) return cachedEstimate;
	const threatForMoves = (moves: Iterable<string>, observed = false) => {
		let threat = 0;
		for (const id of moves) {
			const move = dex.moves.get(id);
			if (!move.exists || move.category === 'Status') continue;
			if (redirectableOnly && !['normal', 'any', 'adjacentFoe'].includes(move.target)) continue;
			const spread = ['allAdjacentFoes', 'allAdjacent'].includes(move.target) ? (foeCount > 1 ? 0.75 : 1) : 1;
			const native = observed && defender.position ? model?.project(foe.position, id, defender.position) : undefined;
			const damage = native && defender.position ? native.damage[defender.position] || 0 :
				damageFraction(dex, foe, defender, move, spread, false, weather);
			threat = Math.max(threat, damage);
		}
		return threat;
	};
	const observedThreat = threatForMoves(foe.moves, true);
	// Species and learnsets are public game knowledge; actual hidden sets are never read.
	const plausibleThreat = threatForMoves(plausibleAttacks(dex, foe.species));
	const estimate = Math.max(observedThreat, plausibleThreat * (foe.moves.size ? 0.25 : 0.5));
	if (!redirectableOnly) estimatesByDefender.set(defender, estimate);
	return estimate;
}

function plausibleAttacks(dex: ModdedDex, species: string): string[] {
	let moveCache = plausibleMoveCache.get(dex);
	if (!moveCache) {
		moveCache = new Map<string, string[]>();
		plausibleMoveCache.set(dex, moveCache);
	}
	const speciesID = toID(species);
	let plausibleThreatMoves = moveCache.get(speciesID);
	if (!plausibleThreatMoves) {
		const learnable = new Set<string>();
		for (const learnset of dex.species.getFullLearnset(speciesID)) {
			for (const id of Object.keys(learnset.learnset)) learnable.add(id);
		}
		const originalTypes = dex.species.get(species).types.map(toID);
		plausibleThreatMoves = [...learnable].filter(id => {
			const move = dex.moves.get(id);
			return move.exists && move.category !== 'Status' && move.basePower >= 50 &&
				(move.accuracy === true || move.accuracy >= 80) &&
				['normal', 'any', 'allAdjacentFoes', 'allAdjacent'].includes(move.target) &&
				(originalTypes.includes(toID(move.type)) || move.priority > 0);
		});
		moveCache.set(speciesID, plausibleThreatMoves);
	}
	return plausibleThreatMoves;
}

function publicItem(mon: OwnPokemon | PublicPokemon, state: PublicState): string {
	if (state.magicRoom || mon.volatiles.has('embargo') || mon.ability === 'klutz') return '';
	return 'request' in mon ? toID(mon.request.item) : mon.item || '';
}

/** Only disclosed abilities/items participate; unknown opponents are never queried. */
function publicAbility(mon: OwnPokemon | PublicPokemon, state: PublicState, dex: ModdedDex): string {
	const ability = mon.ability || '';
	if (mon.volatiles.has('gastroacid') || mon.volatiles.has('suppressability')) return '';
	if (dex.abilities.get(ability).flags.cantsuppress || publicItem(mon, state) === 'abilityshield') return ability;
	if ([...state.active.values()].some(other => other.hp > 0 && other.ability === 'neutralizinggas' &&
		!other.volatiles.has('gastroacid') && !other.volatiles.has('suppressability'))) return '';
	return ability;
}

function utilityForMove(
	dex: ModdedDex, move: Move, action: DoublesAction, actor: OwnPokemon, target: OwnPokemon | PublicPokemon | undefined,
	state: PublicState, ownSlots: OwnPokemon[], foes: PublicPokemon[], actorSlot: number,
): { utility: number, reasons: string[] } {
	const id = toID(move.id);
	const reasons: string[] = [];
	let utility = 0;
	const ally = ownSlots.find((_, index) => index !== actorSlot);
	const targeted = target;
	if (move.category === 'Status' && targeted && targeted !== actor) {
		const enemy = !('request' in targeted);
		const actorAbility = publicAbility(actor, state, dex), targetAbility = publicAbility(targeted, state, dex);
		const prankster = actorAbility === 'prankster';
		const ignoreAbility = publicItem(targeted, state) !== 'abilityshield' && (move.ignoreAbility ||
			['moldbreaker', 'teravolt', 'turboblaze', 'myceliummight'].includes(actorAbility));
		const abilityBlocks = !ignoreAbility && (targetAbility === 'goodasgold' ||
			targetAbility === 'magicbounce' && move.flags.reflectable);
		if (abilityBlocks || enemy && (prankster && targeted.types.some(type => toID(type) === 'dark') ||
			(move.priority + (prankster ? 1 : 0)) > 0 && state.terrain === 'psychicterrain' && grounded(targeted))) {
			return { utility: -32, reasons: ['status-move-blocked'] };
		}
	}
	if (move.category === 'Status' && targeted && (move.status && targeted.status ||
		move.volatileStatus && ['taunt', 'encore', 'disable', 'yawn', 'leechseed', 'torment', 'embargo', 'healblock']
			.includes(move.volatileStatus) && targeted.volatiles.has(move.volatileStatus))) {
		return { utility: -24, reasons: ['status-already-active'] };
	}
	if (PROTECT_MOVES.has(id)) {
		const risk = foes.reduce((sum, foe) => sum +
			estimateThreat(dex, foe, actor, ownSlots, foes.length, state.weather, false, state.damageModel), 0);
		utility += Math.min(44, risk * 48) * (actor.hp < 0.35 ? 1.25 : 1);
		const previous = actor.position ? state.active.get(actor.position) : undefined;
		if (previous?.lastMoveTurn === state.turn - 1 && PROTECT_MOVES.has(previous.lastMove || '')) utility -= 36;
		if (risk > 0.2) reasons.push('protect-under-threat');
	} else if (REDIRECT_MOVES.has(id)) {
		const affected = foes.filter(foe => id !== 'ragepowder' ||
			!foe.types.some(type => toID(type) === 'grass') && foe.ability !== 'overcoat' && foe.item !== 'safetygoggles');
		const allyRisk = ally ? affected.reduce((sum, foe) =>
			sum + estimateThreat(dex, foe, ally, ownSlots, foes.length, state.weather, true, state.damageModel), 0) : 0;
		utility += Math.min(36, allyRisk * 38);
		if (allyRisk > 0.3) reasons.push('redirect-protect-key-ally');
		if (!affected.length && foes.length) reasons.push('redirection-blocked');
	} else if (id === 'tailwind') {
		if (!state.conditions[requestSide(actor)].has('tailwind')) {
			const flips = ownSlots.filter(mon => mon.hp > 0).reduce((sum, mon) => sum + foes.filter(foe => {
				const friendly = effectiveSpeed(mon, state, dex), enemy = effectiveSpeed(foe, state, dex);
				return friendly <= enemy && friendly * 2 > enemy;
			}).length, 0);
			utility += state.trickRoom ? -18 : flips ? Math.min(34, 20 + flips * 7) : 0;
			if (flips && !state.trickRoom) reasons.push('speed-control-tailwind');
		}
	} else if (id === 'trickroom') {
		const friendly = ownSlots.reduce((sum, mon) => sum + mon.request.stats.spe, 0) / Math.max(1, ownSlots.length);
		const enemy = foes.reduce((sum, mon) => sum + statValue(mon, 'spe', dex), 0) / Math.max(1, foes.length);
		utility += state.trickRoom ? (friendly > enemy ? 34 : -28) : (friendly < enemy ? 30 : -8);
		if (utility > 0) reasons.push('speed-control-trick-room');
	} else if (id === 'helpinghand') {
		utility += 6;
		reasons.push('ally-support');
	} else if (id === 'fakeout') {
		const seen = actor.position ? state.active.get(actor.position) : undefined;
		if (seen && !seen.activeActions && targeted && effectiveness(dex, move, targeted) > 0 &&
			!psychicTerrainBlocks(state, move, targeted) && targeted.ability !== 'innerfocus') {
			const targetsActive = !('request' in targeted);
			utility += targetsActive ? 20 : 0;
			if (targetsActive) reasons.push('disrupt-threat');
		}
	} else if (id === 'wideguard' || id === 'quickguard') {
		const likelyBlocked = foes.some(foe => [...foe.moves].some(moveID => {
			const revealedMove = dex.moves.get(moveID);
			return id === 'wideguard' ? ['allAdjacentFoes', 'allAdjacent'].includes(revealedMove.target) :
				revealedMove.priority > 0;
		}));
		if (likelyBlocked) { utility += 24; reasons.push('teamwide-protection'); }
	}
	if (move.status && targeted && !targeted.status) {
		const immune = statusImmune(move.status, toID(move.type), targeted, state);
		if (!immune) {
			utility += move.status === 'par' || move.status === 'brn' || move.status === 'tox' ? 20 : 14;
			reasons.push('status-pressure');
		} else {
			utility -= 20;
			reasons.push('status-immunity');
		}
	}
	if (move.volatileStatus && targeted && !targeted.volatiles.has(toID(move.volatileStatus))) {
		const volatile = toID(move.volatileStatus);
		const previous = targeted.position ? state.active.get(targeted.position)?.lastMove : undefined;
		const previousMove = previous ? dex.moves.get(previous) : undefined;
		if (['encore', 'disable'].includes(volatile) && (!previousMove || previousMove.isZ ||
			previousMove.isMax || previousMove.id === 'struggle' || volatile === 'encore' && previousMove.flags.failencore)) {
			// A slower user might catch a new move this turn, but no private choice proves that it will.
			// Do not grant disruption value by inventing an unseen attack or setup.
			reasons.push('unproven-lock-target');
		} else if (volatile === 'yawn' && !targeted.status && statusImmune('slp', toID(move.type), targeted, state)) {
			utility -= 20;
			reasons.push('status-immunity');
		} else {
			utility += ['taunt', 'encore', 'disable', 'yawn'].includes(volatile) ? 18 : 10;
			reasons.push('disruption');
		}
	}
	if (move.boosts) {
		const positive = Object.entries(move.boosts).filter(([, value]) => Number(value) > 0)
			.reduce((sum, [, value]) => sum + Number(value), 0);
		const negative = Object.entries(move.boosts).filter(([, value]) => Number(value) < 0)
			.reduce((sum, [, value]) => sum + Math.abs(Number(value)), 0);
		utility += Math.min(26, positive * 10 - negative * 8) * (actor.hp > 0.45 ? 1 : 0.4);
		if (positive) reasons.push('setup');
	}
	if (move.sideCondition && id !== 'tailwind' && !state.conditions[requestSide(actor)].has(toID(move.sideCondition))) {
		utility += ['reflect', 'lightscreen', 'auroraveil'].includes(id) ? 16 : 10;
		reasons.push('team-support');
	}
	if (move.weather && state.weather !== toID(move.weather)) {
		utility += 7 + Math.min(18, fieldSynergy(toID(move.weather), ownSlots, dex) * 6);
		reasons.push('weather-support');
	}
	if (move.terrain && state.terrain !== toID(move.terrain)) {
		utility += 6 + Math.min(18, fieldSynergy(toID(move.terrain), ownSlots, dex) * 6);
		reasons.push('terrain-support');
	}
	return { utility, reasons };
}

function requestSide(mon: OwnPokemon): SideID {
	return mon.request.ident.slice(0, 2) as SideID;
}

function effectiveSpeed(mon: OwnPokemon | PublicPokemon, state: PublicState, dex: ModdedDex): number {
	const side = 'request' in mon ? requestSide(mon) : mon.position.slice(0, 2) as SideID;
	const item = publicItem(mon, state), ability = publicAbility(mon, state, dex);
	let speed = statValue(mon, 'spe', dex);
	if (state.conditions[side].has('tailwind')) speed *= 2;
	if (mon.status === 'par' && ability !== 'quickfeet') speed *= 0.5;
	if (item === 'choicescarf') speed *= 1.5;
	if (['raindance', 'primordialsea'].includes(state.weather) && ability === 'swiftswim' ||
		['sunnyday', 'desolateland'].includes(state.weather) && ability === 'chlorophyll' ||
		state.weather === 'sandstorm' && ability === 'sandrush' ||
		['snowscape', 'hail'].includes(state.weather) && ability === 'slushrush') speed *= 2;
	return speed;
}

function statusImmune(
	status: string, moveType: string, target: OwnPokemon | PublicPokemon, state: PublicState,
): boolean {
	const types = new Set<string>(target.types.map(type => toID(type)));
	const ability = target.ability || '';
	const item = 'request' in target ? toID(target.request.item) : target.item || '';
	const side: SideID = 'request' in target ? requestSide(target) : target.position.slice(0, 2) as SideID;
	if (state.conditions[side].has('safeguard')) return true;
	if (grounded(target) && state.terrain === 'mistyterrain') return true;
	if (status === 'slp' && grounded(target) && state.terrain === 'electricterrain') return true;
	if (status === 'brn' && (types.has('fire') || ['waterveil', 'thermalexchange'].includes(ability))) return true;
	if (status === 'par' && (types.has('electric') || ability === 'limber' ||
		moveType === 'electric' && types.has('ground'))) return true;
	if (status === 'frz' && (types.has('ice') || ability === 'magmarmor')) return true;
	if (['psn', 'tox'].includes(status) && (types.has('steel') || types.has('poison') || ability === 'immunity')) {
		return true;
	}
	if (status === 'slp' && ['insomnia', 'vitalspirit', 'sweetveil'].includes(ability)) return true;
	if (status === 'slp' && item === 'safetygoggles' && moveType === 'grass') return true;
	return false;
}

function fieldSynergy(field: string, own: OwnPokemon[], dex: ModdedDex): number {
	const effects: Record<string, { abilities: string[], moves: string[] }> = {
		sunnyday: {
			abilities: ['chlorophyll', 'solarpower', 'protosynthesis'], moves: ['solarbeam', 'solarblade', 'weatherball'],
		},
		raindance: { abilities: ['swiftswim', 'raindish', 'dryskin'], moves: ['thunder', 'hurricane', 'weatherball'] },
		sandstorm: { abilities: ['sandrush', 'sandforce', 'sandveil'], moves: ['weatherball'] },
		snowscape: { abilities: ['slushrush', 'icebody', 'snowcloak'], moves: ['blizzard', 'weatherball'] },
		electricterrain: { abilities: ['surgesurfer', 'quarkdrive', 'hadronengine'], moves: ['risingvoltage'] },
		psychicterrain: { abilities: ['psychicsurge'], moves: ['expandingforce'] },
		grassyterrain: { abilities: ['grassysurge'], moves: ['grassyglide', 'grassyterrain'] },
	};
	const effect = effects[field];
	if (!effect) return 0;
	return own.reduce((sum, mon) => sum + Number(effect.abilities.includes(mon.ability)) +
		Number(mon.request.moves.some(id => effect.moves.includes(id) || toID(dex.moves.get(id).type) === field)), 0);
}

function profileDamage(
	dex: ModdedDex, attacker: OwnPokemon | PublicPokemon, defender: OwnPokemon | PublicPokemon,
	moves: readonly string[], weather = '',
): number {
	return Math.max(0, ...moves.map(id => {
		const move = dex.moves.get(id);
		return move.exists ? damageFraction(dex, attacker, defender, move, 1, false, weather) : 0;
	}));
}

function switchHazardCost(dex: ModdedDex, mon: OwnPokemon, conditions: Set<string>): number {
	let damage = 0;
	if (conditions.has('stealthrock')) {
		damage += 0.125 * 2 ** dex.getEffectiveness('rock', mon.types);
	}
	const isGrounded = !mon.types.some(type => toID(type) === 'flying') &&
		mon.ability !== 'levitate' && toID(mon.request.item) !== 'airballoon';
	if (isGrounded && conditions.has('spikes')) damage += 0.125;
	if (isGrounded && conditions.has('toxicspikes') && !mon.status &&
		!mon.types.some(type => ['poison', 'steel'].includes(toID(type)))) damage += 0.06;
	if (isGrounded && conditions.has('stickyweb')) damage += 0.05;
	return damage * 72;
}

function switchUtility(
	dex: ModdedDex, reserve: OwnPokemon, current: OwnPokemon, ownSlots: OwnPokemon[], foes: PublicPokemon[],
	weather: string, hazards: Set<string>,
): number {
	if (!foes.length) return -30;
	const reserveMoves = reserve.request.moves;
	const currentMoves = current.request.moves;
	const offenseNew = foes.reduce((sum, foe) => sum + profileDamage(dex, reserve, foe, reserveMoves, weather), 0);
	const offenseOld = foes.reduce((sum, foe) => sum + profileDamage(dex, current, foe, currentMoves, weather), 0);
	const incomingNew = foes.reduce((sum, foe) =>
		sum + estimateThreat(dex, foe, reserve, ownSlots, foes.length, weather), 0);
	const incomingOld = foes.reduce((sum, foe) =>
		sum + estimateThreat(dex, foe, current, ownSlots, foes.length, weather), 0);
	return (offenseNew - offenseOld) * 40 + (incomingOld - incomingNew) * 34 - 14 +
		(current.hp < 0.25 ? 24 : 0) - (reserve.hp < 0.2 ? 18 : 0) - switchHazardCost(dex, reserve, hazards);
}

function moveValue(
	request: ChoiceRequest, action: DoublesAction, actor: OwnPokemon, own: OwnPokemon[], party: OwnPokemon[],
	foes: PublicPokemon[],
	state: PublicState, dex: ModdedDex,
): ActionValue {
	if (action.kind === 'pass') {
		return { action, damage: new Map(), utility: -80, reasons: ['unavailable-slot'], targets: [] };
	}
	if (action.kind === 'switch') {
		const reserve = request.side.pokemon[action.reserve! - 1];
		const reserveProfile = reserve && party.find(mon => mon.request === reserve);
		const utility = reserveProfile ? switchUtility(dex, reserveProfile, actor, own, foes,
			state.weather, state.conditions[requestSide(actor)]) : -50;
		return { action, damage: new Map(), utility, reasons: ['switch'], targets: [] };
	}
	const move = actionMove(request, action, dex);
	if (!move) return { action, damage: new Map(), utility: -50, reasons: ['unknown-move'], targets: [] };
	if (move.id === 'fakeout' && actor.position && state.active.get(actor.position)?.activeActions) {
		return { action, damage: new Map(), utility: -40, reasons: ['fake-out-expired'], targets: [], moveID: move.id };
	}
	let targets = selectedTargets(move, action, action.slot, own, foes);
	const damage = new Map<string, number>();
	const spread = ['allAdjacentFoes', 'allAdjacent'].includes(move.target) ? (foes.length > 1 ? 0.75 : 1) : 1;
	const directedTarget = action.target ? slotForLoc(action.target, own, foes)?.position : undefined;
	const native = move.category !== 'Status' && actor.position ?
		state.damageModel?.project(actor.position, action.move || move.id, directedTarget, action.transform) : undefined;
	if (native) {
		for (const [position, amount] of Object.entries(native.damage)) {
			if (amount <= 0) continue;
			const ally = own.findIndex(mon => mon.position === position);
			const expected = native.conditional ? amount * 0.6 : amount;
			damage.set(ally >= 0 ? `ally-${ally}` : position, ally >= 0 ? -expected : expected);
		}
		// Native ModifyMove/redirection can change both the target and the target count.
		const actualTargets = [...own, ...foes].filter(mon => mon.position && mon.position in native.damage);
		if (actualTargets.length) targets = actualTargets;
	} else for (const target of targets) {
		if (target.hp <= 0) continue;
		const amount = psychicTerrainBlocks(state, move, target) ? 0 : damageFraction(dex, actor, target, move, spread,
			action.transform === 'terastallize', state.weather);
		if (!('request' in target) && target.position) damage.set(target.position, amount);
		else if (target !== actor) damage.set(`ally-${own.indexOf(target)}`, -amount);
	}
	const target = targets[0];
	const support = utilityForMove(dex, move, action, actor, target, state, own, foes, action.slot);
	let utility = support.utility;
	const reasons = support.reasons.slice();
	if (native) {
		utility -= native.selfDamage * 45;
		reasons.push('native-damage');
		if (native.charging) reasons.push('charging-turn');
		if (native.conditional) reasons.push('conditional-attack-hypothesis');
	} else if (move.category !== 'Status' && state.damageModel) {
		reasons.push('native-damage-fallback');
	}
	if (target && psychicTerrainBlocks(state, move, target)) {
		utility -= 24;
		reasons.push('priority-blocked');
	}
	const foeTargets = targets.filter((mon): mon is PublicPokemon => !('request' in mon) && mon.hp > 0);
	if (move.category !== 'Status' && foeTargets.length &&
		!foeTargets.some(mon => mon.position && (damage.get(mon.position) || 0) > 0)) {
		utility -= 24;
		reasons.push('ineffective-target');
	}
	if (move.heal) {
		const healingTargets = move.target === 'self' ? [actor] : move.target === 'allies' ? own : target ? [target] : [];
		for (const healingTarget of healingTargets) {
			const missing = 1 - healingTarget.hp;
			utility += Math.min(32, missing * 58);
			if (missing > 0.25) reasons.push(healingTarget === actor ? 'self-recovery' : 'heal-ally');
		}
	}
	if (['mega', 'megax', 'megay', 'ultra'].includes(action.transform || '')) {
		const dealtDamage = [...damage.values()].some(amount => amount > 0);
		if (dealtDamage) {
			utility += 8;
			reasons.push('transformation');
		}
	} else if (action.transform === 'terastallize') {
		const tera = 'active' in request ? request.active[action.slot]?.canTerastallize : undefined;
		if (!native && tera && toID(move.type) === toID(tera) &&
			!actor.types.some(type => toID(type) === toID(move.type))) utility += 12;
		if (utility > 0 || damage.size) reasons.push('terastallize');
	} else if (action.transform === 'zmove' || action.transform === 'dynamax') {
		if (damage.size) reasons.push('burst-move');
	}
	return { action, damage, utility, reasons, moveID: move.id, targets: targets.map(targetMon =>
		!('request' in targetMon) ? targetMon.position : `ally-${own.indexOf(targetMon)}`) };
}

function scoreChoice(
	request: ChoiceRequest, choice: DoublesChoice, own: OwnPokemon[], party: OwnPokemon[],
	foes: PublicPokemon[], state: PublicState, dex: ModdedDex,
): DoublesScoredChoice {
	const values = choice.actions.map(action => moveValue(request, action, own[action.slot], own, party, foes, state, dex));
	for (const value of values) {
		if (value.moveID !== 'auroraveil' || ['hail', 'snowscape'].includes(state.weather)) continue;
		// Do not discard a possible same-turn allied weather combination at the single-move stage.
		// Its exact order belongs to the separately validated full-turn comparison.
		const alliedSnow = choice.actions.some(action => action.slot !== value.action.slot && action.kind === 'move' &&
			['hail', 'snowscape'].includes(actionMove(request, action, dex)?.weather || ''));
		if (!alliedSnow) {
			value.utility = -24;
			value.reasons = ['aurora-veil-weather-missing'];
		}
	}
	const damage = new Map<string, number>();
	let score = values.reduce((sum, value) => sum + value.utility, 0);
	const reasons = new Set(values.flatMap(value => value.reasons));
	for (const value of values) for (const [target, amount] of value.damage) {
		let scaled = amount;
		if (target.startsWith('ally-') && amount < 0) {
			const slot = Number(target.slice(5)), protection = values.find(entry => entry.action.slot === slot);
			const attack = actionMove(request, value.action, dex), actor = own[value.action.slot];
			if (protection && PROTECT_MOVES.has(protection.moveID || '') && attack?.flags.protect &&
				!attack.breaksProtect && !(actor.ability === 'unseenfist' && attack.flags.contact) &&
				!['slp', 'frz'].includes(own[slot].status)) {
				const previous = own[slot].position ? state.active.get(own[slot].position) : undefined;
				const repeated = previous?.lastMoveTurn === state.turn - 1 && PROTECT_MOVES.has(previous.lastMove || '');
				scaled *= repeated ? 2 / 3 : 0;
				reasons.add('protect-partner-from-spread');
			}
		}
		damage.set(target, (damage.get(target) || 0) + scaled);
	}
	for (const foe of foes) {
		const total = damage.get(foe.position) || 0;
		if (total <= 0) continue;
		const effective = Math.min(total, foe.hp);
		score += effective * 92;
		if (total >= foe.hp && foe.hp > 0) {
			score += 34;
			reasons.add('focus-fire-knockout');
		}
	}
	for (const [target, amount] of damage) {
		if (!target.startsWith('ally-') || amount >= 0) continue;
		score += amount * 96;
		reasons.add('friendly-fire-risk');
	}
	for (const value of values) {
		if (value.moveID !== 'helpinghand') continue;
		if (value.reasons.includes('status-move-blocked')) continue;
		const partner = values.find(candidate => candidate.action.slot !== value.action.slot &&
			[...candidate.damage.values()].some(amount => amount > 0));
		if (partner) {
			const amplified = [...partner.damage.values()].filter(amount => amount > 0).reduce((sum, amount) => sum + amount, 0);
			score += amplified * 40;
			reasons.add('helping-hand-synergy');
		} else {
			score -= 26;
			reasons.add('helping-hand-no-attack');
		}
	}
	return { choice: choice.choice, score, reasons: [...reasons], resourcesUsed: choice.resources.length };
}

/** A small set of public-information replies, including attacks on either friendly slot. */
function turnReplies(foes: PublicPokemon[], own: OwnPokemon[], state: PublicState, dex: ModdedDex) {
	const alternatives = foes.map(foe => {
		const known = [...foe.moves].filter(id => dex.moves.get(id).category !== 'Status');
		const ids = known.length ? known : plausibleAttacks(dex, foe.species);
		const byTarget = own.filter(mon => mon.hp > 0).map(target => {
			const shortlist = ids.map(id => ({ id, value: damageFraction(dex, foe, target, dex.moves.get(id), 1, false,
				state.weather) })).sort((a, b) => b.value - a.value).slice(0, 5);
			const ranked = shortlist.map(({ id }) => {
				const estimate = state.damageModel!.project(foe.position, id, target.position);
				const dealt = estimate ? own.reduce((sum, mon) => sum + Math.min(mon.hp,
					estimate.damage[mon.position!] || 0), 0) : 0;
				const move = dex.moves.get(id);
				return { action: { actor: foe.position, kind: 'move', move: id, target: target.position } as DoublesTurnAction,
					value: dealt * (move.self?.volatileStatus === 'mustrecharge' ? 0.65 : 1) - (estimate?.selfDamage || 0) };
			}).sort((a, b) => b.value - a.value);
			return ranked[0]?.action ||
				{ actor: foe.position, kind: 'move', move: [...foe.moves][0] || 'splash' } as DoublesTurnAction;
		});
		const protect = [...foe.moves].find(id => PROTECT_MOVES.has(id));
		if (protect) byTarget.push({ actor: foe.position, kind: 'move', move: protect });
		return byTarget.filter((action, index) => byTarget.findIndex(other =>
			other.move === action.move && other.target === action.target) === index);
	});
	let combinations: DoublesTurnAction[][] = [[]];
	for (const group of alternatives) {
		combinations = combinations.flatMap(prefix => group.map(action => [...prefix, action]));
	}
	return combinations.slice(0, 9);
}

function turnPositionValue(
	sample: DoublesTurnSample, own: OwnPokemon[], foes: PublicPokemon[], state: PublicState, dex: ModdedDex,
): number {
	let value = 0;
	const members = [...own.map(profile => [profile, true] as const), ...foes.map(profile => [profile, false] as const)];
	for (const [mon, friendly] of members) {
		const after = sample.pokemon[mon.position!];
		if (!after || mon.hp <= 0) continue;
		const sign = friendly ? -1 : 1;
		value += sign * ((mon.hp - after.health) * 92 + (after.fainted ? 40 : 0));
		if (!after.fainted) {
			if (!mon.status && after.status) value += sign * 12;
			for (const stat of ['atk', 'def', 'spa', 'spd'] as const) {
				value -= sign * ((after.boosts[stat] || 0) - (mon.boosts[stat] || 0)) * 5;
			}
		}
	}
	const nextState: PublicState = { ...state, weather: sample.weather, terrain: sample.terrain,
		trickRoom: sample.trickRoom, magicRoom: sample.magicRoom,
		conditions: { p1: new Set(sample.conditions.p1), p2: new Set(sample.conditions.p2) } };
	const order = (a: OwnPokemon | PublicPokemon, b: OwnPokemon | PublicPokemon, field: PublicState) => {
		const difference = effectiveSpeed(a, field, dex) - effectiveSpeed(b, field, dex);
		return Math.sign(difference) * (field.trickRoom ? -1 : 1);
	};
	for (const mon of own) for (const foe of foes) {
		const friendly = sample.pokemon[mon.position!], enemy = sample.pokemon[foe.position];
		if (!friendly || !enemy || friendly.fainted || enemy.fainted) continue;
		value += (order({ ...mon, boosts: friendly.boosts, status: friendly.status },
			{ ...foe, boosts: enemy.boosts, status: enemy.status }, nextState) - order(mon, foe, state)) * 6;
	}
	for (const side of ['p1', 'p2'] as const) {
		const sign = side === own[0].position?.slice(0, 2) ? 1 : -1;
		for (const condition of ['reflect', 'lightscreen', 'auroraveil']) {
			if (!state.conditions[side].has(condition) && sample.conditions[side].includes(condition)) value += sign * 10;
		}
	}
	return value;
}

/** Bounded trainer joint search; incomplete horizons retain the completed single-move ranking. */
function rankJointTurns(
	request: ChoiceRequest, choices: DoublesChoice[], scored: DoublesScoredChoice[], own: OwnPokemon[],
	foes: PublicPokemon[], state: PublicState, dex: ModdedDex,
): DoublesScoredChoice[] {
	if (!('active' in request) || !foes.length || !state.damageModel) return scored;
	if (state.damageModel.hasIncompleteTurnState()) return scored;
	const sorted = scored.slice().sort((a, b) => b.score - a.score || a.resourcesUsed - b.resourcesUsed);
	const byChoice = new Map(choices.map(choice => [choice.choice, choice]));
	const shortlist = new Map<string, DoublesScoredChoice>();
	const keys = new Set<string>();
	for (const result of sorted) {
		const candidate = byChoice.get(result.choice)!;
		const key = JSON.stringify(candidate.actions.map(action =>
			[action.kind, action.move, action.target, action.reserve]));
		if (keys.has(key)) continue;
		keys.add(key); shortlist.set(result.choice, result);
		if (shortlist.size >= 8) break;
	}
	// A support combination may look weak to a single-move score; give its best partner a chance.
	const support = new Set([
		'afteryou', 'helpinghand', 'trickroom', 'tailwind', 'followme', 'ragepowder', 'wideguard', 'fakeout',
	]);
	const roles = new Set<string>();
	for (const result of sorted) {
		for (const action of byChoice.get(result.choice)!.actions) {
			if (!support.has(action.move || '') || roles.has(`${action.slot}:${action.move}`)) continue;
			roles.add(`${action.slot}:${action.move}`);
			shortlist.set(result.choice, result);
		}
		if (shortlist.size >= 16) break;
	}
	// A shortlist containing a switch previously discarded ALL turn results after calculating them.
	// Keep that conservative fallback, but decide it before spending time on unusable hypotheses.
	const hasSwitch = [...shortlist.values()].some(result =>
		byChoice.get(result.choice)!.actions.some(action => action.kind === 'switch'));
	if (hasSwitch) {
		return scored;
	}
	const replies = turnReplies(foes, own, state, dex);
	if (!replies.length) return scored;
	const evaluated: DoublesScoredChoice[] = [];
	for (const result of shortlist.values()) {
		const candidate = byChoice.get(result.choice)!;
		const actions: DoublesTurnAction[] = candidate.actions.map(action => ({
			actor: own[action.slot]?.position || `${request.side.id}${action.slot ? 'b' : 'a'}`,
			kind: action.kind, move: action.move, transform: action.transform,
			target: action.target ? slotForLoc(action.target, own, foes)?.position : undefined,
			reserve: action.reserve ? `reserve-${action.reserve - 1}` : undefined,
		}));
		const values: number[] = [];
		for (const reply of replies) {
			const outcome = state.damageModel.projectTurn([...actions, ...reply]);
			// A pivot or missing state invalidates the entire decision. Do not calculate results
			// that would immediately be discarded, and never mix partial turns with full turns.
			if (!outcome || outcome.omittedVolatiles.length || outcome.samples.some(sample => sample.interrupted)) {
				return scored;
			}
			values.push(...outcome.samples.map(sample => turnPositionValue(sample, own, foes, state, dex)));
		}
		const average = values.reduce((sum, value) => sum + value, 0) / values.length;
		evaluated.push({ ...result, score: average * 0.8 + Math.min(...values) * 0.2,
			reasons: [...result.reasons, 'joint-turn-public-hypotheses'] });
	}
	// Never mix partial-turn values with complete outcomes. Fall back for the entire decision.
	if (!evaluated.length) return scored;
	for (const entry of evaluated) entry.jointTurn = { hypotheses: replies.length, candidates: evaluated.length, skipped: 0 };
	return evaluated;
}

/** Shared tactical scorer for Rogue doubles and the Multi adapter: own requests and public log only. */
export function rankDoublesChoices(
	observation: Observation, format: string, excluded: readonly string[] = [], allowSwitch = true,
	/** Multi adapters supply independently legal native-seat choices, with mapped party indices. */
	candidates?: DoublesChoice[],
	jointTurns = false,
	onBaseline?: (scored: DoublesScoredChoice[]) => void,
): DoublesScoredChoice[] {
	const request = observation.request;
	const doubleMove = 'active' in request && request.active.length === 2;
	const doubleSwitch = 'forceSwitch' in request && !!request.forceSwitch && request.forceSwitch.length === 2;
	if (request.wait || (!doubleMove && !doubleSwitch)) return [];
	const dex = policyDex(format);
	const state = readPublicState(observation.publicLog, dex);
	const own = ownActiveSlots(request, state, dex);
	if (!own.length || own.length > 2) return [];
	const foeSide: SideID = request.side.id === 'p1' ? 'p2' : 'p1';
	const foes = POSITION_ORDER.filter(position => position.startsWith(foeSide) && state.active.has(position))
		.map(position => state.active.get(position)!).filter(mon => mon.hp > 0);
	const options: DoublesChoiceOptions = {
		foes: foes.map(mon => positionLocation(mon.position)),
		resources: readBattleMemory(observation.publicLog, dex).sides[request.side.id as SideID].resources,
		allowSwitch,
	};
	const choices = (candidates || enumerateDoublesChoices(request, options))
		.filter(choice => !excluded.includes(choice.choice));
	const party = ownParty(request, dex);
	state.damageModel = nativeDamageModel(request, own, party, foes, state, dex);
	let scored = choices.map(choice => scoreChoice(request, choice, own, party, foes, state, dex));
	const compare = (left: DoublesScoredChoice, right: DoublesScoredChoice) =>
		right.score - left.score || left.resourcesUsed - right.resourcesUsed || left.choice.localeCompare(right.choice);
	if (jointTurns && onBaseline) {
		for (const entry of scored) entry.mechanics = state.damageModel.diagnostics;
		onBaseline([...scored].sort(compare));
	}
	if (jointTurns) scored = rankJointTurns(request, choices, scored, own, foes, state, dex);
	for (const entry of scored) entry.mechanics = state.damageModel.diagnostics;
	return scored.sort(compare);
}

/** Return the highest-ranked legal joint action when the public snapshot can be parsed. */
export function chooseDoublesAction(
	observation: Observation, format: string, excluded: readonly string[] = [], allowSwitch = true,
): DoublesPolicyResult | undefined {
	const scored = rankDoublesChoices(observation, format, excluded, allowSwitch);
	if (!scored.length) return;
	const state = readPublicState(observation.publicLog, policyDex(format));
	const request = observation.request;
	const foeSide: SideID = request.side.id === 'p1' ? 'p2' : 'p1';
	const foes = POSITION_ORDER.filter(position => position.startsWith(foeSide) && state.active.has(position) &&
		state.active.get(position)!.hp > 0).map(positionLocation);
	return { choice: scored[0].choice, scored, foes, turn: state.turn };
}
