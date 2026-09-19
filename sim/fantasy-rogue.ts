/** Private campaign state. Never send this object to an opponent or a spectator. */
import type { Battle } from './battle';
import type { Side } from './side';
import type { Pokemon } from './pokemon';
import { toID } from './dex';

export const ROGUE_FORMAT = 'gen9fantasyrogue';
export const ROGUE_STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export const emptyRogueStats = (): StatsTable => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });

export interface RoguePokemon {
	id: string;
	set: PokemonSet;
	hp: number;
	maxhp: number;
	pp: { id: string, pp: number, maxpp: number }[];
	status: string;
	statusState: { time?: number, startTime?: number, stage?: number };
}

export interface RogueBattleState {
	encounterId: string;
	team: RoguePokemon[];
	boosts: StatsTable;
	bag: Record<string, number>;
	/** Explicit per-ball probabilities supplied by the content configuration (0..1). */
	balls: { id: string, name: string, chance: number }[];
	catchable: boolean;
	captured?: RoguePokemon;
}

export interface RogueBattleResult {
	encounterId: string;
	won: boolean;
	team: RoguePokemon[];
	bag: Record<string, number>;
	captured?: RoguePokemon;
}

export function snapshotRoguePokemon(mon: Pokemon, original: RoguePokemon): RoguePokemon {
	// Temporary battle forms, Transform, Dynamax and volatile effects do not become save data.
	const hp = mon.hp ? Math.max(1, original.maxhp - (mon.baseMaxhp - mon.getUndynamaxedHP())) : 0;
	return {
		id: original.id,
		set: { ...structuredClone(original.set), item: mon.item },
		hp: Math.min(original.maxhp, hp), maxhp: original.maxhp,
		pp: original.pp.map(slot => ({ ...slot, pp: mon.baseMoveSlots.find(move => move.id === slot.id)?.pp ?? slot.pp })),
		status: mon.status,
		statusState: { time: mon.statusState.time, startTime: mon.statusState.startTime, stage: mon.statusState.stage },
	};
}

export function initializeRogueBattle(battle: Battle) {
	// AI hypothetical worlds are restored separately from public observations.
	if (battle.deserialized) return;
	const state = battle.fantasyRogue;
	if (!state) throw new Error('幻想杯肉鸽必须从冒险存档进入。');
	for (const mon of battle.p1.pokemon) {
		const saved = state.team.find(entry => entry.id === mon.set.fantasyRogueId);
		if (!saved) throw new Error('Missing rogue party member');
		mon.hp = Math.min(mon.maxhp, saved.hp);
		mon.fainted = !mon.hp;
		mon.status = toID(saved.status);
		mon.statusState = battle.initEffectState({ id: mon.status, target: mon, ...saved.statusState });
		for (const slot of mon.moveSlots) {
			const pp = saved.pp.find(entry => entry.id === slot.id);
			if (pp) slot.pp = Math.min(slot.maxpp, pp.pp);
		}
	}
	battle.p1.pokemonLeft = battle.p1.pokemon.filter(mon => mon.hp > 0).length;
	if (!battle.p1.pokemonLeft) throw new Error('没有可出战的宝可梦。');
}

export function chooseRogueBall(side: Side, id: string) {
	const state = side.battle.fantasyRogue;
	if (!state || side.id !== 'p1' || side.requestState !== 'move' || !state.catchable ||
		state.team.length >= 6 || !state.balls.some(ball => ball.id === id) || !(state.bag[id] > 0) ||
		!side.active[0]?.hp || !side.foe.active[0]?.hp || side.foe.pokemon.length !== 1) {
		return side.emitChoiceError('当前不能使用这个精灵球。');
	}
	side.choice.actions.push({ choice: 'rogueball', pokemon: side.active[0], moveid: id });
	return true;
}

export function throwRogueBall(battle: Battle, id: string) {
	const state = battle.fantasyRogue!;
	const ball = state.balls.find(entry => entry.id === id)!;
	const target = battle.p2.active[0];
	if (!state.catchable || !target?.hp || !(state.bag[id] > 0)) return;
	state.bag[id]--;
	battle.add('-message', `投出了${ball.name}！`);
	if (!battle.randomChance(Math.round(ball.chance * 1000000), 1000000)) {
		battle.add('-message', '宝可梦挣脱了精灵球！');
		return;
	}
	const original: RoguePokemon = {
		id: state.encounterId, set: structuredClone(target.set), hp: target.hp, maxhp: target.baseMaxhp,
		pp: target.baseMoveSlots.map(slot => ({ id: slot.id, pp: slot.pp, maxpp: slot.maxpp })),
		status: target.status, statusState: {},
	};
	delete original.set.fantasyRogueStats;
	delete original.set.fantasyRogueId;
	state.captured = snapshotRoguePokemon(target, original);
	battle.add('-message', `成功捕捉了${target.species.name}！`);
	// A private message commits the account-level catch immediately, before the end packet.
	battle.send('fantasyroguecapture', JSON.stringify(state.captured));
	battle.win(battle.p1);
}

export function rogueBattleResult(battle: Battle): RogueBattleResult {
	const state = battle.fantasyRogue!;
	return {
		encounterId: state.encounterId, won: battle.winner === battle.p1.name,
		team: state.team.map(saved => {
			const mon = battle.p1.pokemon.find(entry => entry.set.fantasyRogueId === saved.id)!;
			return snapshotRoguePokemon(mon, saved);
		}),
		bag: { ...state.bag }, captured: state.captured && structuredClone(state.captured),
	};
}
