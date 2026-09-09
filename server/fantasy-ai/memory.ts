import { toID } from '../../sim/dex';
import { gemType, type FantasyState } from './fantasy-state';
import { DELAYED_HEALING } from './mechanics';

export type SinglesSide = 'p1' | 'p2';
export interface HealthRange { lower: number; upper: number }
export interface SeenPokemon {
	appearance: string;
	side: SinglesSide;
	ident: string;
	species: string;
	level: number;
	health: HealthRange;
	status: string;
	moves: string[];
	moveUses: Record<string, number>;
	boosts: SparseBoostsTable;
	volatiles: string[];
	item?: string;
	ability?: string;
	types?: string[];
	teraType?: string;
	transformed: boolean;
	ambiguousIdentity: boolean;
	enteredTurn?: number;
	lastMove?: string;
	lastMoveTurn?: number;
	activeMoveActions?: number;
	statusTurn?: number;
	statusActivations?: number;
	statusActions?: number;
	statusTicks?: number;
	statusSource?: SinglesSide;
	effects?: Record<string, { turn: number, source?: SinglesSide, value?: string }>;
	persistentEffects?: string[];
	fantasy?: FantasyState;
}
export interface MoveEvidence {
	turn: number;
	user: string;
	target?: string;
	move: string;
	health: number;
	targetHealth: number;
	endHealth?: number;
	targetEndHealth?: number;
	damage: number;
	healing: number;
	critical: boolean;
	immune?: boolean;
	immunityContext?: string;
	failed?: boolean;
	missed?: boolean;
	/** Public state signature: damage observations are not reused across boosts, burns or type changes. */
	context: string;
	environment?: string;
}
export interface SeenSide {
	preview: { species: string, level: number }[];
	appearances: SeenPokemon[];
	active?: SeenPokemon;
	conditions: Record<string, number>;
	conditionTurns?: Record<string, number>;
	slotConditions?: Record<string, {
		id: string, turn: number, source: string, sourceIdent: string, sourceSpecies: string, sourceLevel: number,
	}>;
	resources: { mega: boolean, zmove: boolean, tera: boolean, aura: boolean };
}
export interface BattleMemory {
	turn: number;
	sides: Record<SinglesSide, SeenSide>;
	weather: string;
	terrain: string;
	pseudoWeather: string[];
	fieldTurns?: Record<string, number>;
	fieldDurations?: Record<string, number>;
	switches: {
		side: SinglesSide, turn: number, ident: string,
		kind?: 'initial' | 'voluntary' | 'pivot' | 'forced', from?: string, opponent?: string,
		ownHealth?: number, foeHealth?: number, foeBoosts?: number,
		ownConditions?: Record<string, number>, foeConditions?: Record<string, number>,
	}[];
	/** Observed order at equal base priority; ties and priority modifiers remain possible. */
	speedEvidence: {
		first: string, second: string, turn: number, trickRoom: boolean, firstState?: string, secondState?: string,
	}[];
	moveEvidence?: MoveEvidence[];
}

export function damageContext(source: SeenPokemon, target: SeenPokemon): string {
	return JSON.stringify([source.species, target.species, source.boosts, target.boosts,
		source.status, target.status, source.teraType, target.teraType, source.item, target.item,
		source.ability, target.ability, source.types, target.types, source.fantasy, target.fantasy,
		source.volatiles.slice().sort(), target.volatiles.slice().sort()]);
}

/** Locate a disclosed team member without accessing an internal team index. */
export function ownSeen(
	memory: BattleMemory, side: SinglesSide, ident: string, active: boolean,
): SeenPokemon | undefined {
	if (active) return memory.sides[side].active;
	const name = toID(ident.split(': ').slice(1).join(': '));
	return memory.sides[side].appearances.slice().reverse().find(mon =>
		!mon.ambiguousIdentity && toID(mon.ident.split(': ').slice(1).join(': ')) === name);
}

/** Rounded public team HP; unknown identities cannot support a claimed losing cycle. */
export function publicTeamHealth(side: SeenSide): number | undefined {
	const latest = new Map<string, SeenPokemon>();
	for (const mon of side.appearances) {
		if (mon.ambiguousIdentity) return;
		latest.set(mon.ident, mon);
	}
	return Math.max(0, side.preview.length - latest.size) +
		[...latest.values()].reduce((sum, mon) => sum + mon.health.upper, 0);
}

export function speedContext(mon: SeenPokemon, memory: BattleMemory): string {
	return JSON.stringify([mon.species, mon.boosts.spe || 0, mon.status, mon.item, mon.ability,
		mon.volatiles.slice().sort(), memory.weather, memory.terrain, memory.pseudoWeather.slice().sort(),
		memory.sides[mon.side].conditions.tailwind || 0]);
}

export function fieldContext(memory: BattleMemory): string {
	return JSON.stringify([memory.weather, memory.terrain, memory.pseudoWeather.slice().sort(),
		memory.sides.p1.conditions, memory.sides.p2.conditions]);
}

export function parseDetails(details: string): { species: string, level: number } {
	const parts = details.split(', ');
	return { species: parts[0], level: Number(parts.find(part => /^L\d+$/.test(part))?.slice(1)) || 100 };
}

/** Public HP is rounded up. Keep its interval rather than inventing exact HP. */
export function parseHealth(condition: string, exact = false): HealthRange {
	if (condition === '0' || condition.endsWith(' fnt')) return { lower: 0, upper: 0 };
	const match = /^(\d+)\/(\d+)/.exec(condition);
	if (!match || !Number(match[2])) return { lower: 0, upper: 1 };
	const hp = Number(match[1]);
	const maxhp = Number(match[2]);
	return { lower: Math.max(0, (hp - (exact ? 0 : 1)) / maxhp), upper: Math.min(1, hp / maxhp) };
}

export function conditionID(text: string): string {
	const id = toID(text.replace(/^(move|ability|item): /, ''));
	return id === 'gemboostdefense' ? 'gemdefensepermanentboost' : gemType(id) ? 'gempermanentboost' : id;
}

function newSide(): SeenSide {
	return {
		preview: [], appearances: [], conditions: {}, conditionTurns: {}, slotConditions: {},
		resources: { mega: false, zmove: false, tera: false, aura: false },
	};
}

/** Parse only the already-filtered public log. Never infer an internal team index. */
export function readBattleMemory(log: readonly string[], dex: ModdedDex): BattleMemory {
	const memory: BattleMemory = {
		turn: 0, sides: { p1: newSide(), p2: newSide() }, weather: '', terrain: '',
		pseudoWeather: [], fieldTurns: {}, switches: [], speedEvidence: [], moveEvidence: [],
	};
	let turnMoves: { mon: SeenPokemon, priority: number, state: string }[] = [];
	let lastAction: MoveEvidence | undefined;
	let pendingGuiYing: SeenPokemon | undefined;
	const forcedSwitches = new Set<string>();
	const recordImmunity = (target: SeenPokemon | undefined) => {
		if (!lastAction || lastAction.target !== target?.appearance) return;
		lastAction.immune = true;
		const source = Object.values(memory.sides).flatMap(team => team.appearances)
			.find(member => member.appearance === lastAction!.user);
		// The immunity event can itself reveal an ability/item or activate Flash Fire.
		// Capture that disclosed state now, never after later moves change the matchup.
		if (source && target) lastAction.immunityContext = damageContext(source, target);
	};
	const finishMove = () => {
		if (!lastAction || !DELAYED_HEALING[lastAction.move] ||
			lastAction.failed || lastAction.immune || lastAction.missed) return;
		const source = Object.values(memory.sides).flatMap(team => team.appearances)
			.find(member => member.appearance === lastAction!.user);
		if (!source) return;
		const slots = memory.sides[source.side].slotConditions!;
		if (slots[lastAction.move]) return;
		slots[lastAction.move] = {
			id: lastAction.move, turn: lastAction.turn, source: source.appearance, sourceIdent: source.ident,
			sourceSpecies: source.species, sourceLevel: source.level,
		};
	};
	const finishTurn = () => {
		for (const action of memory.moveEvidence!.filter(entry => entry.turn === memory.turn)) {
			const find = (appearance?: string) => Object.values(memory.sides).flatMap(team => team.appearances)
				.find(member => member.appearance === appearance);
			action.endHealth = find(action.user)?.health.upper;
			action.targetEndHealth = find(action.target)?.health.upper;
		}
	};
	const lookup = (ident: string): SeenPokemon | undefined => {
		const side = ident.slice(0, 2) as SinglesSide;
		const active = memory.sides[side]?.active;
		return active && active.ident.slice(0, 3) === ident.slice(0, 3) ? active : undefined;
	};
	for (const line of log) {
		const [, event, target = '', value = '', extra = '', ...tags] = line.split('|');
		const sideID = target.slice(0, 2) as SinglesSide;
		const side = memory.sides[sideID];
		const mon = lookup(target);
		// Some protocol events (e.g. -immune) put [from] directly in the value field.
		const markers = [value, extra, ...tags].filter(part => part.startsWith('['));
		const holder = markers.find(tag => tag.startsWith('[of] '));
		const revealedHolder = holder ? lookup(holder.slice(5)) : mon;
		if (mon && ['-activate', '-enditem', '-ability'].includes(event) &&
			['ejectbutton', 'ejectpack', 'emergencyexit', 'wimpout'].includes(conditionID(value))) {
			forcedSwitches.add(mon.appearance);
		}
		for (const marker of markers) {
			if (revealedHolder && marker.startsWith('[from] item: ') &&
				revealedHolder.item !== '') revealedHolder.item = toID(marker.slice(13));
			if (revealedHolder && marker.startsWith('[from] ability: ')) revealedHolder.ability = toID(marker.slice(16));
		}
		switch (event) {
		case 'turn':
			finishMove();
			finishTurn();
			memory.turn = Number(target);
			for (const team of Object.values(memory.sides)) {
				for (const [id, effect] of Object.entries(team.slotConditions!)) {
					if (memory.turn > effect.turn + 1) delete team.slotConditions![id];
				}
			}
			turnMoves = [];
			lastAction = undefined;
			break;
		case 'upkeep':
			finishMove();
			finishTurn();
			lastAction = undefined;
			break;
		case 'clearpoke':
			memory.sides.p1.preview = [];
			memory.sides.p2.preview = [];
			break;
		case 'poke':
			side?.preview.push(parseDetails(value));
			break;
		case 'switch': case 'drag': {
			if (!side) break;
			const outgoing = side.active;
			const opponentSide = memory.sides[sideID === 'p1' ? 'p2' : 'p1'];
			const opponent = opponentSide.active;
			const kind = !outgoing || !memory.turn ? 'initial' :
				event === 'drag' || !outgoing.health.upper || forcedSwitches.has(outgoing.appearance) ? 'forced' :
				lastAction?.user === outgoing.appearance && lastAction.turn === memory.turn && !lastAction.failed &&
				dex.moves.get(lastAction.move).selfSwitch ? 'pivot' : 'voluntary';
			memory.switches.push({
				side: sideID, turn: memory.turn, ident: target, from: outgoing?.ident, kind,
				opponent: opponent?.appearance, ownHealth: publicTeamHealth(side), foeHealth: opponent?.health.upper,
				foeBoosts: Object.values(opponent?.boosts || {}).reduce((sum, boost) => sum + Math.max(0, boost || 0), 0),
				ownConditions: { ...side.conditions }, foeConditions: { ...opponentSide.conditions },
			});
			const details = parseDetails(value);
			const illusionPossible = side.preview.some(member => Object.values(dex.species.get(member.species).abilities)
				.some(ability => toID(ability) === 'illusion'));
			const family = dex.species.get(details.species).baseSpecies;
			const unique = side.preview.filter(member => dex.species.get(member.species).baseSpecies === family).length === 1;
			const previous = !illusionPossible && unique ? side.appearances.slice().reverse().find(member =>
				member.ident === target && dex.species.get(member.species).baseSpecies === family && !member.transformed) : undefined;
			const seen: SeenPokemon = {
				appearance: `${sideID}:${side.appearances.length + 1}`, side: sideID, ident: target, ...details,
				health: parseHealth(extra), status: extra.split(' ')[1] || '',
				moves: previous?.moves.slice() || [], moveUses: { ...previous?.moveUses },
				boosts: {}, volatiles: [], item: previous?.item,
				teraType: value.split(', ').find(part => part.startsWith('tera:'))?.slice(5) || previous?.teraType,
				enteredTurn: memory.turn, effects: {},
				activeMoveActions: 0,
				statusTurn: previous?.statusTurn, statusActivations: previous?.statusActivations || 0,
				statusActions: previous?.statusActions || 0,
				statusTicks: 0, statusSource: previous?.statusSource,
				persistentEffects: previous?.persistentEffects?.slice(),
				fantasy: previous?.fantasy && structuredClone(previous.fantasy),
				// Temporary ability/type changes can end on switching: leave ability unknown.
				transformed: false, ambiguousIdentity: illusionPossible || !unique,
			};
			side.appearances.push(seen);
			side.active = seen;
			break;
		}
		case 'replace':
			if (mon) {
				Object.assign(mon, parseDetails(value));
				mon.ident = target;
				mon.ambiguousIdentity = false;
				if (extra) mon.health = parseHealth(extra);
				// Any types attributed to the disguise no longer describe this Pokemon.
				mon.types = undefined;
			}
			break;
		case 'detailschange': case '-formechange':
			if (mon) {
				mon.species = parseDetails(value).species;
				if (/, L\d+/.test(value)) mon.level = parseDetails(value).level;
				mon.types = undefined;
			}
			break;
		case 'move':
			finishMove();
			if (mon) {
				const move = dex.moves.get(value);
				const defender = memory.sides[mon.side === 'p1' ? 'p2' : 'p1'].active;
				lastAction = {
					turn: memory.turn, user: mon.appearance, target: defender?.appearance, move: move.id,
					health: mon.health.upper, targetHealth: defender?.health.upper ?? 1,
					damage: 0, healing: 0, critical: false, context: defender ? damageContext(mon, defender) : '',
					environment: fieldContext(memory),
				};
				memory.moveEvidence!.push(lastAction);
				// Destiny Bond lasts until its user's next attempted move, not just until the next turn.
				mon.volatiles = mon.volatiles.filter(id => id !== 'destinybond');
				// Metronome, Sleep Talk, etc. do not reveal another selectable move or spend its PP.
				if (!markers.some(tag => tag.startsWith('[from]'))) {
					if (mon.status === 'slp') mon.statusActions = (mon.statusActions || 0) + 1;
					if (move.exists && !move.isZ && !['struggle', 'recharge'].includes(move.id)) {
						if (!mon.moves.includes(move.id)) mon.moves.push(move.id);
						mon.moveUses[move.id] = (mon.moveUses[move.id] || 0) + 1;
					}
					mon.lastMove = move.id;
					mon.lastMoveTurn = memory.turn;
					mon.activeMoveActions = (mon.activeMoveActions || 0) + 1;
					const first = turnMoves[0];
					if (first && first.mon.side !== mon.side && first.priority === move.priority) {
						memory.speedEvidence.push({
							first: first.mon.appearance, second: mon.appearance, turn: memory.turn,
							trickRoom: memory.pseudoWeather.includes('trickroom'),
							firstState: first.state, secondState: speedContext(mon, memory),
						});
					}
					turnMoves.push({ mon, priority: move.priority, state: speedContext(mon, memory) });
				}
			}
			break;
		case '-damage': case '-heal': case '-sethp':
			if (mon && event === '-damage' && markers.includes('[from] item: Shadow Bottle')) {
				const before = mon.health;
				const after = parseHealth(value);
				const counter = (mon.fantasy ||= {}).shadowBottle ||= { lower: 0, upper: 0, ticks: 0 };
				counter.lower += Math.max(0, before.lower - after.upper);
				counter.upper += Math.max(0, before.upper - after.lower);
				counter.ticks++;
			}
			if (mon && lastAction && !markers.some(marker => marker.startsWith('[from]'))) {
				if (event === '-damage' && mon.appearance === lastAction.target) {
					lastAction.damage += Math.max(0, mon.health.upper - parseHealth(value).upper);
				}
				if (event === '-heal' && mon.appearance === lastAction.user) {
					lastAction.healing += Math.max(0, parseHealth(value).upper - mon.health.upper);
				}
			}
			if (mon) { mon.health = parseHealth(value); mon.status = value.split(' ')[1] || ''; }
			if (mon?.status === 'tox' && event === '-damage' && markers.includes('[from] psn')) {
				mon.statusTicks = (mon.statusTicks || 0) + 1;
			}
			if (event === '-sethp' && extra) {
				const second = lookup(extra);
				if (second) second.health = parseHealth(tags[0] || '');
			}
			break;
		case '-crit':
			if (lastAction) lastAction.critical = true;
			break;
		case '-immune':
			recordImmunity(mon);
			break;
		case '-miss':
			if (lastAction) lastAction.missed = true;
			break;
		case '-fail':
			if (lastAction) lastAction.failed = true;
			break;
		case '-singlemove':
			if (mon && conditionID(value) === 'destinybond' && !mon.volatiles.includes('destinybond')) {
				mon.volatiles.push('destinybond');
			}
			break;
		case 'faint':
			if (mon) { mon.health = { lower: 0, upper: 0 }; mon.status = 'fnt'; }
			break;
		case 'cant':
			if (mon) mon.activeMoveActions = (mon.activeMoveActions || 0) + 1;
			if (mon && value === 'slp') mon.statusActivations = (mon.statusActivations || 0) + 1;
			break;
		case '-status':
			if (mon) {
				mon.status = value;
				mon.statusTurn = memory.turn;
				mon.statusActivations = 0;
				mon.statusActions = 0;
				mon.statusTicks = 0;
				mon.statusSource = holder ? holder.slice(5, 7) as SinglesSide :
					markers.some(tag => tag === '[from] move: Rest' || tag.startsWith('[from] item: ')) ? mon.side :
					turnMoves[turnMoves.length - 1]?.mon.side;
			}
			break;
		case '-curestatus': if (mon) mon.status = ''; break;
		case '-item':
			if (mon) {
				if (mon.item !== toID(value) && mon.fantasy) delete mon.fantasy.shadowBottle;
				mon.item = toID(value);
			}
			break;
		case '-enditem':
			if (mon) { mon.item = ''; if (mon.fantasy) delete mon.fantasy.shadowBottle; }
			break;
		case '-ability':
			if (mon) {
				mon.ability = toID(value);
				pendingGuiYing = mon.ability === 'guiying' ? mon : undefined;
				if (mon.ability === 'beastboost') mon.volatiles = mon.volatiles.filter(id => id !== 'suppressability');
			}
			break;
		case '-message':
			if (pendingGuiYing && target.endsWith(' 化作鬼影，保留了最后1点HP！')) {
				(pendingGuiYing.fantasy ||= {}).guiYingUsed = true;
			}
			pendingGuiYing = undefined;
			break;
		case '-endability':
			if (mon) {
				if (toID(value) === 'beastboost' && markers.includes('[from] item: Fantasy Ultra Energy')) {
					mon.ability = 'beastboost';
					if (!mon.volatiles.includes('suppressability')) mon.volatiles.push('suppressability');
				} else {
					mon.ability = toID(value);
				}
			}
			break;
		case '-activate':
			if (mon && value.startsWith('ability: ')) mon.ability = conditionID(value);
			if (mon && value.startsWith('item: ') && mon.item !== '') mon.item = conditionID(value);
			break;
		case '-boost': case '-unboost': case '-setboost':
			if (mon && ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'].includes(value)) {
				const stat = value as BoostID;
				mon.boosts[stat] = Math.max(-6, Math.min(6, event === '-setboost' ? Number(extra) :
					(mon.boosts[stat] || 0) + Number(extra) * (event === '-unboost' ? -1 : 1)));
			}
			break;
		case '-clearboost': if (mon) mon.boosts = {}; break;
		case '-copyboost': case '-swapboost': {
			const other = lookup(value);
			if (!mon || !other) break;
			const stats = (extra ? extra.split(', ') : ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']) as BoostID[];
			for (const stat of stats) {
				const before = mon.boosts[stat] || 0;
				mon.boosts[stat] = other.boosts[stat] || 0;
				if (event === '-swapboost') other.boosts[stat] = before;
			}
			break;
		}
		case '-clearallboost':
			for (const team of Object.values(memory.sides)) if (team.active) team.active.boosts = {};
			break;
		case '-clearpositiveboost': case '-clearnegativeboost': case '-invertboost':
			if (mon) {
				for (const stat of Object.keys(mon.boosts) as BoostID[]) {
					const boost = mon.boosts[stat] || 0;
					mon.boosts[stat] = event === '-invertboost' ? -boost :
						(event === '-clearpositiveboost' ? Math.min(0, boost) : Math.max(0, boost));
				}
			}
			break;
		case '-start': case '-end':
			if (mon) {
				const effect = conditionID(value);
				if (event === '-start' && value.startsWith('ability: ')) mon.ability = effect;
				if (effect === 'typechange') { mon.types = event === '-start' ? extra.split('/') : undefined; break; }
				if (effect === 'fantasystats') break;
				const type = gemType(value);
				if (event === '-start' && type) {
					const state = mon.fantasy ||= {};
					state.gemTypes = [...new Set([...(state.gemTypes || []), type])];
				}
				if (event === '-start' && !mon.volatiles.includes(effect)) mon.volatiles.push(effect);
				if (event === '-start' && effect === 'gemdefensepermanentboost') {
					mon.persistentEffects = [...new Set([...(mon.persistentEffects || []), effect])];
				}
				if (event === '-end') mon.volatiles = mon.volatiles.filter(id => id !== effect);
				mon.effects ||= {};
				if (event === '-start') {
					mon.effects[effect] = { turn: memory.turn, source: holder?.slice(5, 7) as SinglesSide, value: extra };
				} else {
					delete mon.effects[effect];
				}
				if (effect.startsWith('auraburst')) { side.resources.aura = true; side.resources.zmove = true; }
				if (event === '-start' && effect === 'flashfire') recordImmunity(mon);
			}
			break;
		case '-transform':
			if (mon) {
				const transformed = lookup(value);
				if (transformed) { mon.species = transformed.species; mon.types = transformed.types?.slice(); }
				mon.transformed = true;
				mon.moves = [];
			}
			break;
		case '-mega': if (side) side.resources.mega = true; break;
		case '-zpower': if (side) side.resources.zmove = true; break;
		case '-terastallize':
			if (side) side.resources.tera = true;
			if (mon) mon.teraType = value;
			break;
		case '-sidestart': case '-sideend':
			if (side) {
				const effect = conditionID(value);
				if (event === '-sideend') delete side.conditions[effect];
				else {
					side.conditions[effect] = (side.conditions[effect] || 0) + 1;
					(side.conditionTurns ||= {})[effect] = memory.turn;
				}
			}
			break;
		case '-swapsideconditions':
			for (const id of [
				'mist', 'lightscreen', 'reflect', 'spikes', 'safeguard', 'tailwind', 'toxicspikes', 'stealthrock',
				'waterpledge', 'firepledge', 'grasspledge', 'stickyweb', 'auroraveil', 'luckychant', 'gmaxsteelsurge',
				'gmaxcannonade', 'gmaxvinelash', 'gmaxwildfire', 'gmaxvolcalith',
			]) {
				const first = memory.sides.p1;
				const second = memory.sides.p2;
				const layers = first.conditions[id];
				const started = first.conditionTurns?.[id];
				if (second.conditions[id]) first.conditions[id] = second.conditions[id];
				else delete first.conditions[id];
				if (layers) second.conditions[id] = layers;
				else delete second.conditions[id];
				(first.conditionTurns ||= {})[id] = second.conditionTurns?.[id] ?? memory.turn;
				(second.conditionTurns ||= {})[id] = started ?? memory.turn;
			}
			break;
		case '-weather':
			memory.weather = target === 'none' ? '' : toID(target);
			if (value !== '[upkeep]') (memory.fieldTurns ||= {})[memory.weather] = memory.turn;
			break;
		case '-fieldstart': case '-fieldend': {
			const effect = conditionID(target);
			if (event === '-fieldstart') (memory.fieldTurns ||= {})[effect] = memory.turn;
			if (effect === 'trickroom' && event === '-fieldstart') {
				(memory.fieldDurations ||= {})[effect] = 5 + (markers.includes('[persistent]') ? 2 : 0);
			}
			if (effect.endsWith('terrain')) memory.terrain = event === '-fieldstart' ? effect : '';
			else if (event === '-fieldstart') memory.pseudoWeather.push(effect);
			else memory.pseudoWeather = memory.pseudoWeather.filter(id => id !== effect);
			break;
		}
		}
	}
	return memory;
}
