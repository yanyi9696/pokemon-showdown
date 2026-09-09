import { toID } from '../../sim/dex';
import type { EffectState } from '../../sim/pokemon';
import type { Combatant, HypothesisBuilder } from './hypotheses';
import type { Observation } from './information';
import type { BattleMemory, SeenPokemon, SinglesSide } from './memory';

export const HAZARDS = ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb', 'gmaxsteelsurge'] as const;
export type HazardID = typeof HAZARDS[number];
export type HazardLayers = Partial<Record<HazardID, number>>;
export interface HazardMember {
	profile: Combatant;
	active: boolean;
	probability: number;
	key?: boolean;
}
export interface HazardField {
	terrain: string;
	weather: string;
	pseudoWeather: readonly string[];
}
export interface HazardChange {
	own: HazardLayers;
	foe: HazardLayers;
	probability: number;
}

export function hazardLayers(conditions: Record<string, number | EffectState>): HazardLayers {
	const layers: HazardLayers = {};
	for (const id of HAZARDS) {
		const condition = conditions[id];
		if (condition) layers[id] = typeof condition === 'number' ? condition : condition.layers || 1;
	}
	return layers;
}

export function sameHazards(a: HazardLayers, b: HazardLayers): boolean {
	return HAZARDS.every(id => (a[id] || 0) === (b[id] || 0));
}

/** Used only for lead planning and failed-action penalties; actual effects come from the native move probe. */
export function moveHazard(move: Move): HazardID | undefined {
	if (HAZARDS.includes(move.sideCondition as HazardID)) return move.sideCondition as HazardID;
	if (move.id === 'ceaselessedge') return 'spikes';
	if (move.id === 'stoneaxe') return 'stealthrock';
	return undefined;
}

function entryTraits(mon: Combatant, dex: ModdedDex, field: HazardField) {
	// Temporary airborne/type effects end on switching. Tera, items, Gravity and Magic Room can persist.
	const types = mon.terastallized && mon.terastallized !== 'Stellar' ? [mon.terastallized] :
		dex.species.get(mon.species).types;
	const ability = toID(mon.ability);
	const item = field.pseudoWeather.includes('magicroom') || ability === 'klutz' ? '' : toID(mon.item);
	const grounded = field.pseudoWeather.includes('gravity') || item === 'ironball' ||
		(!types.includes('Flying') && !['levitate', 'eelevate'].includes(ability) && item !== 'airballoon');
	const indirectImmune = ability === 'magicguard';
	const damageImmune = indirectImmune || dex.currentMod === 'gen9fantasy' &&
		['battlearmor', 'bigpecks'].includes(ability);
	return { types, ability, item, grounded, indirectImmune, damageImmune };
}

export function entryHazards(mon: Combatant, layers: HazardLayers, dex: ModdedDex, field: HazardField) {
	const traits = entryTraits(mon, dex, field);
	const { types, ability, item, grounded, damageImmune } = traits;
	let damage = 0;
	// Poison types absorb Toxic Spikes even when wearing Heavy-Duty Boots.
	const absorbsToxicSpikes = !!layers.toxicspikes && grounded && types.includes('Poison');
	if (item !== 'heavydutyboots' && !damageImmune) {
		const hit = (fraction: number) => Math.max(1, Math.floor(mon.stats.hp * fraction)) / mon.stats.hp;
		if (layers.stealthrock && ability !== 'mountaineer') damage += hit(2 ** dex.getEffectiveness('Rock', types) / 8);
		if (layers.gmaxsteelsurge) damage += hit(2 ** dex.getEffectiveness('Steel', types) / 8);
		if (layers.spikes && grounded) damage += hit([0, 1 / 8, 1 / 6, 1 / 4][Math.min(3, layers.spikes)]);
	}
	return { ...traits, damage, absorbsToxicSpikes: absorbsToxicSpikes && damage < mon.health.upper };
}

function entrySpeed(mon: Combatant, dex: ModdedDex, field: HazardField): number {
	const { item, ability } = entryTraits(mon, dex, field);
	return mon.stats.spe * (item === 'choicescarf' ? 1.5 : 1) *
		(mon.status && ability === 'quickfeet' ? 1.5 : mon.status === 'par' ? 0.5 : 1);
}

function webCost(mon: Combatant, foes: readonly HazardMember[], dex: ModdedDex, field: HazardField): number {
	const speed = entrySpeed(mon, dex, field);
	const alive = foes.filter(member => member.profile.health.upper > 0);
	const total = alive.reduce((sum, member) => sum + member.probability, 0);
	if (!total) return 0;
	const flipped = alive.reduce((sum, member) => {
		const other = entrySpeed(member.profile, dex, field);
		return sum + (speed >= other && speed * 2 / 3 < other ? member.probability : 0);
	}, 0) / total;
	let cost = 2 + flipped * 16;
	if (field.pseudoWeather.includes('trickroom') || mon.moves.includes('trickroom')) cost *= -0.5;
	if (mon.ability === 'contrary') return -cost;
	if (mon.moves.some(id => dex.moves.get(id).category ===
		(mon.ability === 'defiant' ? 'Physical' : mon.ability === 'competitive' ? 'Special' : ''))) cost -= 16;
	return cost;
}

/**
 * 钉子策略的共同评分入口，规则候选和整回合推演都使用这里：
 * 1. 只评估仍存活、以后有机会入场的成员；最后一只已在场时不再奖励撒钉。
 * 2. 伤害按属性、层数、道具和特性计算，再按剩余对手、换人记录和轮转配招估计使用次数。
 * 3. 候补会被钉死或入场后濒死时提高清钉价值，keyMembers 配置的关键成员权重更高。
 * 4. 毒菱考虑吸收、免疫、已有异常与毒疗；黏黏网考虑速度线、能力下降免疫和反向获益。
 * 这是有限视野的启发式收益，不是未来伤害保证。普通档的对手资料始终来自公开信息和假设。
 * 调整时一起检查规则评分与推演尺度，避免单纯增加固定分数导致盲目撒钉或清掉更有价值的己方钉子。
 */
export function hazardCost(
	layers: HazardLayers, members: readonly HazardMember[], foes: readonly HazardMember[],
	dex: ModdedDex, field: HazardField, recentSwitches = 0,
): number {
	if (!HAZARDS.some(id => layers[id])) return 0;
	const alive = members.filter(member => member.profile.health.upper > 0);
	const count = alive.reduce((sum, member) => sum + member.probability, 0);
	const foeCount = foes.reduce((sum, member) => sum + (member.profile.health.upper > 0 ? member.probability : 0), 0);
	const foeHealth = foes.reduce((sum, member) => sum + member.profile.health.upper * member.probability, 0);
	if (!foeCount) return 0;
	const absorption = Math.min(0.85, alive.reduce((sum, member) => {
		if (member.active && count <= 1 + 1e-6) return sum;
		return sum + (entryHazards(member.profile, layers, dex, field).absorbsToxicSpikes ?
			member.probability * (member.active ? 0.4 : 0.8) : 0);
	}, 0));
	return alive.reduce((sum, member) => {
		const { profile: mon, active, probability, key } = member;
		if (active && count <= 1 + 1e-6) return sum;
		const entry = entryHazards(mon, layers, dex, field);
		const pivot = mon.ability === 'regenerator' || mon.moves.some(id =>
			['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'chillyreception', 'shedtail'].includes(id));
		const cycles = Math.min(0.8, Math.max(0, count - 1) * 0.08 + recentSwitches * 0.08 + (pivot ? 0.25 : 0));
		const horizon = Math.min(1, 0.45 + Math.max(0, foeCount - 1) * 0.11) * Math.min(1, foeHealth / 2.5);
		const entries = (active ? 0.4 + (pivot ? 0.2 : 0) : 1) * horizon +
			cycles * Math.max(0, mon.health.upper - entry.damage) * horizon;
		let cost = Math.min(entry.damage, mon.health.upper) * 65 * entries;
		if (entry.damage && mon.health.upper === 1 && (entry.item === 'focussash' || entry.ability === 'sturdy')) {
			cost += 8 * Math.min(1, entries);
		}
		// A benched member already locked out by hazards needs rescue before the next switch.
		if (!active && entry.damage >= mon.health.upper) cost += 65;
		else if (!active && entry.damage > 0 && mon.health.upper - entry.damage <= 0.15) cost += 18;
		if (entry.damage < mon.health.upper && entry.item !== 'heavydutyboots' && entry.grounded) {
			if (layers.toxicspikes && !mon.status && !entry.types.some(type => type === 'Poison' || type === 'Steel') &&
				!['immunity', 'pastelveil', 'comatose', 'purifyingsalt'].includes(entry.ability) &&
				!(entry.ability === 'leafguard' && ['sunnyday', 'desolateland'].includes(field.weather)) &&
				field.terrain !== 'mistyterrain') {
				const durable = mon.moves.some(id => dex.moves.get(id).heal || id === 'wish') || mon.ability === 'regenerator';
				const turns = durable ? 4 : 2;
				let poison = (layers.toxicspikes >= 2 ? turns * (turns + 1) / 32 : turns / 8) * 55;
				if (entry.indirectImmune) poison = 0;
				if (entry.ability === 'poisonheal') poison = -12;
				if (['naturalcure', 'shedskin'].includes(entry.ability) ||
					entry.ability === 'hydration' && ['raindance', 'primordialsea'].includes(field.weather)) poison *= 0.4;
				if (['guts', 'quickfeet', 'toxicboost'].includes(entry.ability)) poison -= 8;
				cost += poison * (1 - absorption) * Math.min(1, entries);
			}
			if (layers.stickyweb && entry.item !== 'clearamulet' &&
				!['clearbody', 'whitesmoke', 'fullmetalbody', 'mirrorarmor'].includes(entry.ability)) {
				cost += webCost(mon, foes, dex, field) * Math.min(1.3, entries);
			}
		}
		return sum + cost * probability * (key ? 1.35 : 1);
	}, 0);
}

/** No real opponent objects or private slot indices enter the roster used for hazard planning. */
export function observedHazardTeams(
	builder: HypothesisBuilder, observation: Observation, memory: BattleMemory,
	own: Combatant[], isKey: (index: number) => boolean,
): Record<SinglesSide, HazardMember[]> {
	const side = observation.ownSide;
	const foe = side === 'p1' ? 'p2' : 'p1';
	const seenSide = memory.sides[foe];
	const initial = observation.difficulty === 'hard' ? observation.initialOpponent || [] : [];
	const roster = initial.length ? initial : seenSide.preview.length ? seenSide.preview :
		seenSide.active ? [seenSide.active] : [];
	const family = (species: string) => builder.dex.species.get(species).baseSpecies;
	let activeMatched = false;
	const opponents = roster.flatMap(member => {
		const base = family(member.species);
		const active = !activeMatched && !!seenSide.active && family(seenSide.active.species) === base;
		if (active) activeMatched = true;
		const unique = roster.filter(other => family(other.species) === base).length === 1;
		const seen = active ? seenSide.active : unique ? seenSide.appearances.slice().reverse().find(mon =>
			!mon.ambiguousIdentity && !mon.transformed && family(mon.species) === base) : undefined;
		const shell: SeenPokemon = seen ? { ...seen, boosts: {}, volatiles: [], types: undefined } : {
			appearance: '', side: foe, ident: '', species: member.species, level: member.level,
			health: { lower: 1, upper: 1 }, status: '', moves: [], moveUses: {}, boosts: {}, volatiles: [],
			transformed: false, ambiguousIdentity: false,
		};
		return builder.build(shell, observation, memory).map(profile => ({
			profile, active, probability: profile.probability,
		}));
	});
	return {
		[side]: own.map((profile, index) => ({
			profile, active: observation.request.side.pokemon[index].active, probability: 1, key: isKey(index),
		})),
		[foe]: opponents,
	} as Record<SinglesSide, HazardMember[]>;
}
