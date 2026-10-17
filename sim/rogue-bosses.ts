import { Pokemon } from './pokemon';
import type { Battle } from './battle';

export interface RogueBossState {
	kind: 'summit' | 'arceus';
	mewtwoY?: PokemonSet;
	arceusMoves?: Partial<Record<string, string>>;
	/** Persistent simulator state; ordinary faints and revivals must not reset it. */
	phase?: number;
	defeatedTypes?: string[];
}
export const ARCEUS_LIFE_TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting',
	'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];

export function isRogueBoss(pokemon: Pokemon) {
	return pokemon.side.id === 'p2' && !!pokemon.battle.fantasyRogue?.boss;
}

export function waitingRogueCommander(pokemon: Pokemon) {
	return pokemon.side.id === 'p2' && pokemon.battle.fantasyRogue?.boss?.kind === 'summit' &&
		pokemon.baseSpecies.name.includes('Mewtwo') && pokemon.side.pokemon.some(mon =>
			mon !== pokemon && !mon.baseSpecies.name.includes('Mewtwo') && mon.hp > 0 && !mon.fainted);
}

/** Wild packs enter in their generated order, including native fallback requests. */
export function rogueBossChoice(request: import('./side').ChoiceRequest): string | undefined {
	if ('teamPreview' in request && request.teamPreview) return 'team ' + request.side.pokemon.map((_, i) => i + 1).join('');
	if ('forceSwitch' in request) {
		const next = request.side.pokemon.findIndex(mon => !mon.active && !mon.condition.endsWith(' fnt'));
		return next >= 0 ? `switch ${next + 1}` : undefined;
	}
	return undefined;
}

export function megaRogueBoss(pokemon: Pokemon) {
	if (!isRogueBoss(pokemon) || pokemon.battle.fantasyRogue?.boss?.kind !== 'summit' ||
		!pokemon.hp || pokemon.species.id !== 'mewtwofantasy') return;
	pokemon.battle.add('-message', '五位守卫已全部倒下。幻想超梦离开指挥的位置，亲自走进了战场。');
	pokemon.canMegaEvo = 'Mewtwo-Mega-X-Fantasy';
	pokemon.battle.actions.runMegaEvo(pokemon);
}

/** Replace the spread and moves on the same active object, preserving its queued action identity. */
function replaceBossSet(pokemon: Pokemon, set: PokemonSet, retainPP: boolean) {
	const battle = pokemon.battle;
	const fresh = new Pokemon({ ...structuredClone(set), level: pokemon.level,
		fantasyRogueId: pokemon.set.fantasyRogueId }, pokemon.side);
	const pp = new Map(pokemon.moveSlots.map(slot => [slot.id, slot.pp]));
	Object.assign(pokemon.set, fresh.set);
	pokemon.baseSpecies = fresh.baseSpecies;
	pokemon.baseAbility = fresh.baseAbility;
	pokemon.ability = fresh.ability;
	pokemon.abilityState = battle.initEffectState({ id: pokemon.ability, target: pokemon });
	pokemon.item = fresh.item;
	pokemon.itemState = battle.initEffectState({ id: pokemon.item, target: pokemon });
	pokemon.baseMoveSlots.splice(0, pokemon.baseMoveSlots.length, ...fresh.baseMoveSlots.map(slot => ({ ...slot,
		pp: retainPP ? pp.get(slot.id) ?? slot.pp : slot.pp })));
	pokemon.moveSlots = pokemon.baseMoveSlots.map(slot => ({ ...slot }));
	pokemon.baseMaxhp = fresh.baseMaxhp;
	pokemon.maxhp = fresh.maxhp;
	pokemon.hp = pokemon.maxhp;
	pokemon.faintQueued = false;
	pokemon.fainted = false;
	pokemon.switchFlag = false;
	pokemon.forceSwitchFlag = false;
	pokemon.terastallized = '';
	pokemon.canTerastallize = null;
	pokemon.formeChange(fresh.species, null, true);
	pokemon.regressionForme = false;
}

function clearBossStatus(pokemon: Pokemon) {
	const battle = pokemon.battle;
	if (pokemon.status) battle.add('-curestatus', pokemon, pokemon.status);
	pokemon.status = '';
	pokemon.statusState = battle.initEffectState({ id: '', target: pokemon });
	delete pokemon.m.rogueStatusStack;
}

/** Choose only from the public active matchup, never from the player's unrevealed reserve moves. */
export function nextArceusType(battle: Battle, defeated: string[], target?: Pokemon) {
	const remaining = ARCEUS_LIFE_TYPES.filter(type => !defeated.includes(type));
	if (!remaining.length) return 'Legend';
	if (!target) return battle.sample(remaining);
	const score = (type: string) => {
		const attack = battle.dex.getImmunity(type, target) ? battle.dex.getEffectiveness(type, target) : -8;
		const defense = target.getTypes().reduce((sum, foeType) => sum +
			(battle.dex.getImmunity(foeType, type) ? -battle.dex.getEffectiveness(foeType, type) : 3), 0);
		return attack * 100 + defense;
	};
	const best = Math.max(...remaining.map(score));
	return battle.sample(remaining.filter(type => score(type) === best));
}

function renewQueuedMove(pokemon: Pokemon) {
	const battle = pokemon.battle;
	const action = battle.queue.list.find(entry => entry.choice === 'move' && entry.pokemon === pokemon);
	if (!action || action.choice !== 'move') return;
	const target = pokemon.foes().find(mon => mon.hp > 0);
	const moves = pokemon.moveSlots.filter(slot => slot.pp > 0).map(slot => battle.dex.moves.get(slot.id));
	const score = (move: Move) => {
		if (move.category === 'Status') return -1;
		if (move.id === 'suckerpunch' && (!target || target.moveThisTurn || !battle.queue.willMove(target))) return -1;
		if (target && !battle.dex.getImmunity(move.type, target)) return 0;
		const effect = target ? 2 ** battle.dex.getEffectiveness(move.type, target) : 1;
		return (move.basePower || 60) * effect * (pokemon.getTypes().includes(move.type) ? 1.5 : 1) *
			(move.accuracy === true ? 1 : move.accuracy / 100);
	};
	moves.sort((a, b) => score(b) - score(a));
	const move = moves[0] || battle.dex.moves.get('struggle');
	const activeMove = battle.dex.getActiveMove(move.id);
	activeMove.priority = action.priority;
	action.move = activeMove;
	action.rogueBossContinuation = true;
	action.moveid = move.id;
	action.targetLoc = move.target === 'self' ? 0 : 1;
	delete action.zmove;
	delete action.maxMove;
	// Do not resort: the pending action remains exactly where X's action was queued.
}

/** Consumes a health bar before the native faint path can end the battle or remove its pending action. */
export function advanceRogueBoss(pokemon: Pokemon) {
	const battle = pokemon.battle;
	const state = battle.fantasyRogue?.boss;
	if (!isRogueBoss(pokemon) || !state || pokemon.hp || pokemon.fainted) return false;
	if (state.kind === 'summit') {
		if (battle.dex.species.get(pokemon.set.species).id !== 'mewtwofantasy' || state.phase || !state.mewtwoY) return false;
		state.phase = 1;
		battle.add('-message', '幻想超梦倒下了……白光却再次亮起。尚未耗尽的力量，正在化作另一种姿态！');
		const moved = pokemon.moveThisTurn;
		pokemon.clearVolatile();
		pokemon.moveThisTurn = moved;
		clearBossStatus(pokemon);
		replaceBossSet(pokemon, state.mewtwoY, false);
		battle.add('-heal', pokemon, pokemon.getHealth, '[from] 第二阶段');
		pokemon.canMegaEvo = 'Mewtwo-Mega-Y-Fantasy';
		battle.actions.runMegaEvo(pokemon);
		renewQueuedMove(pokemon);
		return true;
	}
	const phase = state.phase || 0;
	if (phase >= 18) return false;
	const defeated = state.defeatedTypes ||= [];
	defeated.push(phase === 0 ? 'Normal' : pokemon.species.types[0]);
	state.phase = phase + 1;
	const type = nextArceusType(battle, defeated, pokemon.foes().find(mon => mon.hp > 0));
	const species = type === 'Legend' ? 'Arceus-Legend-Fantasy' : type === 'Normal' ? 'Arceus' : `Arceus-${type}`;
	const plate = type === 'Legend' ? 'Legend Plate' : battle.dex.items.all().find(item => item.onPlate === type)?.name || '';
	const fourth = state.arceusMoves?.[type];
	if (!fourth) throw new Error(`Missing Arceus boss move: ${type}`);
	const set = { ...pokemon.set, species, item: plate, ability: type === 'Legend' ? 'Chuan Shuo Zhi Li' : 'Multitype',
		moves: ['Judgment', 'Recover', (phase + 1) % 2 ? 'Work Up' : 'Cosmic Power', fourth] };
	// Volatile removal uses the normal living-Pokémon guard; this bar is already renewed.
	pokemon.hp = pokemon.maxhp;
	for (const stat of Object.keys(pokemon.boosts) as BoostID[]) {
		if (pokemon.boosts[stat] < 0) {
			battle.add('-restoreboost', pokemon, '[silent]');
			pokemon.boosts[stat] = 0;
		}
	}
	const positive = new Set(['substitute', 'focusenergy', 'aquaring', 'ingrain', 'magnetrise', 'charge',
		'laserfocus', 'defensecurl', 'stockpile', 'autotomize', 'helpinghand', 'protect', 'endure']);
	for (const id of Object.keys(pokemon.volatiles)) if (!positive.has(id)) pokemon.removeVolatile(id);
	clearBossStatus(pokemon);
	replaceBossSet(pokemon, set, true);
	battle.add('-message', type === 'Legend' ? '十八种属性的光芒汇为一体。阿尔宙斯显露了传说的姿态！' :
		`阿尔宙斯切换属性，再次恢复了全部力量。（第 ${phase + 2} / 19 条生命）`);
	battle.add('-heal', pokemon, pokemon.getHealth, '[from] 神之挑战');
	renewQueuedMove(pokemon);
	if (type === 'Legend') {
		// Entry bonus: run the native move without consuming the already queued normal action.
		battle.actions.useMove('noretreat', pokemon, { target: pokemon });
	}
	return true;
}
