import { Battle } from '../../sim/battle';
import { Dex, toID } from '../../sim/dex';
import { Format } from '../../sim/dex-formats';
import type { Pokemon } from '../../sim/pokemon';

export interface CalcPokemon {
	species: string;
	level?: number;
	ability?: string;
	item?: string;
	nature?: string;
	ivs?: Partial<StatsTable>;
	evs?: Partial<StatsTable>;
	boosts?: Partial<BoostsTable>;
	stats?: Partial<StatsTable>;
	hp?: number;
	status?: string;
	teraType?: string;
	types?: string[];
	volatiles?: string[];
	dynamax?: boolean;
	gender?: string;
	faintedAllies?: number;
	boostedStat?: string;
}
export interface CalcInput {
	attacker: CalcPokemon;
	defender: CalcPokemon;
	attackerAlly?: CalcPokemon;
	defenderAlly?: CalcPokemon;
	move: string;
	gameType?: 'singles' | 'doubles';
	weather?: string;
	terrain?: string;
	pseudoWeather?: string[];
	attackerSide?: string[];
	defenderSide?: string[];
	critical?: boolean;
	hits?: number;
	useZ?: boolean;
	useMax?: boolean;
	moveOverrides?: { basePower?: number, type?: string, category?: string };
}
export interface CalcResult {
	damage: number[];
	maxhp: number;
	hp: number;
	type: string;
	effectiveness: number | null;
	statusMove: boolean;
	warnings: string[];
}

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const BOOSTS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const;
const dex = Dex.mod('gen9fantasy');
const int = (n: unknown, fallback: number, min: number, max: number) =>
	typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
const name = (s: unknown) => typeof s === 'string' ? s.slice(0, 100) : '';
const ids = (value: unknown): ID[] => Array.isArray(value) ? value.slice(0, 20).map(toID).filter(Boolean) : [];

/** Accept descriptions chosen by the calculator, never a room ID or a live Battle. */
export function normalizeInput(input: CalcInput): CalcInput {
	if (!input || typeof input !== 'object') throw new Error('无效的计算参数');
	const pokemon = (value: CalcPokemon): CalcPokemon => {
		if (!value || typeof value !== 'object') throw new Error('缺少宝可梦配置');
		const species = dex.species.get(name(value.species));
		if (!species.exists) throw new Error('宝可梦数据不存在，请刷新客户端数据');
		const ability = dex.abilities.get(name(value.ability));
		const item = dex.items.get(name(value.item));
		const nature = dex.natures.get(name(value.nature));
		const result: CalcPokemon = {
			species: species.name, level: int(value.level, 100, 1, 999),
			ability: ability.exists ? ability.name : 'No Ability', item: item.exists ? item.name : '',
			nature: nature.exists ? nature.name : 'Serious',
			ivs: {}, evs: {}, boosts: {}, hp: typeof value.hp === 'number' && Number.isFinite(value.hp) ?
				Math.max(0, Math.min(1, value.hp)) : 1,
			status: ['brn', 'par', 'psn', 'tox', 'slp', 'frz', 'fst'].includes(value.status || '') ? value.status : '',
			teraType: dex.types.isName(name(value.teraType)) ? name(value.teraType) : '',
			types: Array.isArray(value.types) ?
				value.types.slice(0, 3).filter(t => typeof t === 'string' && dex.types.isName(t)) : [],
			volatiles: ids(value.volatiles), dynamax: !!value.dynamax,
			gender: ['M', 'F', 'N'].includes(value.gender || '') ? value.gender : '',
			faintedAllies: int(value.faintedAllies, 0, 0, 100),
			boostedStat: BOOSTS.slice(0, 5).includes(value.boostedStat as 'atk') ? value.boostedStat : '',
		};
		for (const stat of STATS) {
			result.ivs![stat] = int(value.ivs?.[stat], 31, 0, 31);
			result.evs![stat] = int(value.evs?.[stat], 0, 0, 252);
		}
		for (const stat of BOOSTS) result.boosts![stat] = int(value.boosts?.[stat], 0, -6, 6);
		if (value.stats && typeof value.stats === 'object') {
			result.stats = {};
			for (const stat of STATS) {
				if (typeof value.stats[stat] === 'number') result.stats[stat] = int(value.stats[stat], 1, 1, 20000);
			}
		}
		return result;
	};
	const move = dex.moves.get(name(input.move));
	if (!move.exists) throw new Error('招式数据不存在，请刷新客户端数据');
	return {
		attacker: pokemon(input.attacker), defender: pokemon(input.defender),
		attackerAlly: input.attackerAlly ? pokemon(input.attackerAlly) : undefined,
		defenderAlly: input.defenderAlly ? pokemon(input.defenderAlly) : undefined,
		move: move.id, gameType: input.gameType === 'doubles' ? 'doubles' : 'singles',
		weather: toID(name(input.weather)), terrain: toID(name(input.terrain)),
		pseudoWeather: ids(input.pseudoWeather), attackerSide: ids(input.attackerSide), defenderSide: ids(input.defenderSide),
		critical: !!input.critical, hits: int(input.hits, Array.isArray(move.multihit) ? 3 : 1, 1, 10),
		useZ: !!input.useZ, useMax: !!input.useMax,
		moveOverrides: {
			basePower: typeof input.moveOverrides?.basePower === 'number' ?
				int(input.moveOverrides.basePower, 0, 0, 1000) : undefined,
			type: dex.types.isName(name(input.moveOverrides?.type)) ? input.moveOverrides!.type : undefined,
			category: ['Physical', 'Special', 'Status'].includes(input.moveOverrides?.category || '') ?
				input.moveOverrides!.category : undefined,
		},
	};
}

function makeBattle(input: CalcInput) {
	const set = (mon: CalcPokemon): PokemonSet => ({
		name: '', species: mon.species, level: mon.level!, ability: 'No Ability', item: '',
		nature: mon.nature!, evs: mon.evs as StatsTable, ivs: mon.ivs as StatsTable,
		moves: [input.move], gender: mon.gender as GenderName,
	});
	const filler: CalcPokemon = { species: 'Mew', ability: 'No Ability', level: 100 };
	const profiles = [
		[input.attacker, ...(input.gameType === 'doubles' ? [input.attackerAlly || filler] : [])],
		[input.defender, ...(input.gameType === 'doubles' ? [input.defenderAlly || filler] : [])],
	];
	const battle = new Battle({
		formatid: toID('gen9fantasycalc'),
		format: new Format({ name: 'Fantasy damage calculation', effectType: 'Format', mod: 'gen9fantasy',
			gameType: input.gameType, ruleset: [] }),
		seed: 'gen5,1,2,3,4', p1: { team: profiles[0].map(set) }, p2: { team: profiles[1].map(set) },
	});
	// A calculation starts from an existing position; do not replay switch-in effects.
	for (let side = 0; side < 2; side++) {
		for (let slot = 0; slot < profiles[side].length; slot++) {
			const mon = battle.sides[side].active[slot];
			const profile = profiles[side][slot];
			if (profile === filler) {
				mon.hp = 0;
				mon.fainted = true;
				mon.isActive = false;
				continue;
			}
			mon.ability = toID(profile.ability);
			mon.baseAbility = mon.ability;
			mon.abilityState = battle.initEffectState({ id: mon.ability, target: mon });
			mon.item = toID(profile.item);
			mon.itemState = battle.initEffectState({ id: mon.item, target: mon });
			// The panel's unboosted stats also cover Transform and manual base-stat edits.
			for (const stat of STATS) {
				const value = profile.stats?.[stat];
				if (!value) continue;
				if (stat === 'hp') {
					mon.baseMaxhp = mon.maxhp = value;
				} else {
					mon.storedStats[stat] = value;
				}
			}
			Object.assign(mon.boosts, profile.boosts);
			mon.status = toID(profile.status);
			mon.statusState = battle.initEffectState({ id: mon.status, target: mon });
			if (profile.types?.length) mon.setType(profile.types, true);
			if (profile.teraType) mon.terastallized = profile.teraType;
			if (profile.dynamax) mon.addVolatile('dynamax');
			mon.hp = Math.max(1, Math.floor(mon.maxhp * (profile.hp ?? 1)));
			mon.side.totalFainted = profile.faintedAllies || 0;
			for (const id of profile.volatiles || []) {
				if (id === 'gemboostdefense') {
					mon.m.hasFantasyDefenseGem = true;
					mon.addVolatile('gemdefensepermanentboost');
					continue;
				}
				if (id.startsWith('gemboost')) {
					const type = battle.dex.types.all().find(t => toID(t.name) === id.slice(8))?.name;
					if (type) {
						if (!mon.m.gemBoosts) mon.m.gemBoosts = [];
						mon.m.gemBoosts.push(type);
						mon.addVolatile('gempermanentboost');
					}
					continue;
				}
				if (!battle.dex.conditions.get(id).exists || ['dynamax', 'transform'].includes(id)) continue;
				mon.volatiles[id] = battle.initEffectState({ id, target: mon, source: mon, sourceSlot: mon.getSlot() });
				if (id === 'flashfire') mon.volatiles[id].started = true;
				if (id === 'substitute') mon.volatiles[id].hp = Math.max(1, Math.floor(mon.maxhp / 4));
				if (['protosynthesis', 'quarkdrive'].includes(id)) {
					mon.volatiles[id].bestStat = profile.boostedStat || 'atk';
				}
			}
		}
	}
	const attacker = battle.p1.active[0];
	if (input.weather && battle.dex.conditions.get(input.weather).exists) battle.field.setWeather(input.weather, attacker);
	if (input.terrain && battle.dex.conditions.get(input.terrain).exists) battle.field.setTerrain(input.terrain, attacker);
	for (const id of input.pseudoWeather || []) {
		if (battle.dex.conditions.get(id).exists) battle.field.addPseudoWeather(id, attacker);
	}
	for (const [index, conditions] of [input.attackerSide, input.defenderSide].entries()) {
		for (const id of conditions || []) {
			if (battle.dex.conditions.get(id).exists) battle.sides[index].addSideCondition(id, battle.sides[index].active[0]);
		}
	}
	return battle;
}

/** Native move execution on independent hypothetical battles, one for each damage roll. */
export function calculateFantasyDamage(raw: CalcInput): CalcResult {
	const input = normalizeInput(raw);
	const baseMove = dex.moves.get(input.move);
	const result: CalcResult = {
		damage: [], maxhp: 0, hp: 0, type: baseMove.type, effectiveness: null,
		statusMove: baseMove.category === 'Status', warnings: [],
	};
	const stateful = ['substitute', 'bide', 'stockpile', 'rage', 'flashfire', 'slowstart'];
	if ([input.attacker, input.defender].some(mon => mon.volatiles?.some(id => stateful.includes(id)))) {
		result.warnings.push('部分持续效果的隐藏计数未知，请核对计算假设');
	}
	if (baseMove.multihit) result.warnings.push('多段攻击显示所选命中次数的伤害边界，不提供击倒概率');
	if (['beatup', 'lastrespects', 'ragefist', 'retaliate', 'pursuit', 'suckerpunch', 'upperhand',
		'counter', 'mirrorcoat', 'metalburst', 'bide'].includes(baseMove.id)) {
		result.warnings.push('此招式依赖队伍或回合历史，当前结果仅按面板假设计算');
	}
	for (let roll = 85; roll <= 100; roll++) {
		const battle = makeBattle(input);
		try {
			const attacker = battle.p1.active[0];
			const defender = battle.p2.active[0];
			if (input.useMax && !attacker.volatiles['dynamax']) attacker.addVolatile('dynamax');
			result.maxhp = defender.maxhp;
			result.hp = defender.hp;
			if (result.statusMove) return result;
			battle.randomizer = damage => Math.floor(damage * roll / 100);
			let move = battle.dex.getActiveMove(input.move);
			if (input.useMax && move.category !== 'Status') {
				battle.singleEvent('ModifyType', move, null, attacker, defender, move, move);
				battle.runEvent('ModifyType', attacker, defender, move, move);
				move = battle.actions.getActiveMaxMove(move, attacker);
			} else if (input.useZ) {
				move = battle.actions.getActiveZMove(move, attacker);
			}
			if (input.moveOverrides?.basePower !== undefined) move.basePower = input.moveOverrides.basePower;
			if (input.moveOverrides?.type) move.type = input.moveOverrides.type;
			if (input.moveOverrides?.category) move.category = input.moveOverrides.category as ActiveMove['category'];
			// Report damage conditional on hitting; random critical hits are an explicit UI assumption.
			move.accuracy = true;
			move.willCrit = input.critical || move.willCrit || false;
			move.secondaries = null;
			if (Array.isArray(move.multihit)) move.multihit = input.hits;
			if (move.flags.charge) {
				attacker.volatiles[move.id] = battle.initEffectState({ id: move.id, target: attacker });
			}
			let damage = 0;
			battle.onEvent('Damage', battle.format, { priority: -1000 }, (amount: number, target: Pokemon, source: Pokemon, effect: ActiveMove) => {
				if (target === defender && source === attacker && effect.effectType === 'Move') {
					damage += amount;
					result.type = effect.type;
					result.effectiveness = 2 ** target.getMoveHitData(effect).typeMod;
				}
			});
			battle.actions.useMove(move, attacker, { target: defender });
			if (battle.log.some(line => line.startsWith('|-immune|p2a:'))) result.effectiveness = 0;
			result.damage.push(damage);
		} finally {
			battle.destroy();
		}
	}
	return result;
}
