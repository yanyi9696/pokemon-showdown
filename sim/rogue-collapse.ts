import type { Battle } from './battle';
import type { Pokemon } from './pokemon';
import type { HitEffect } from './dex-moves';
import { collapseEntries, LEGACY_COLLAPSE_ENTRIES, COLLAPSE_PARAMETERS as P, collapseParameters, type CollapseID } from './rogue-collapse-data';

const parameters = (pokemon: Pokemon) => collapseParameters(pokemon.battle.fantasyRogue?.difficulty?.version ?? 3);
const periodicCleanse = (pokemon: Pokemon) => hasCollapse(pokemon, 'cleanse') &&
	(pokemon.battle.fantasyRogue?.difficulty?.version ?? 3) >= 4;

export interface CollapsePokemonState {
	adaptation: Record<string, number>;
	shieldUsed: boolean;
	emergencyUsed: boolean;
	steadfastUsed?: boolean;
	activeTurns: number;
	lastCountedTurn?: number;
	vigilance: boolean;
}
export function collapseEnemy(pokemon?: Pokemon | null): boolean {
	const rules = pokemon?.battle.fantasyRogue;
	return !!rules?.collapse?.length && !rules.duel && (pokemon!.side.id === 'p2' || pokemon!.side.id === 'p4');
}
function player(pokemon?: Pokemon | null) {
	return !!pokemon && (pokemon.side.id === 'p1' || pokemon.side.id === 'p3');
}
export function hasCollapse(pokemon: Pokemon | null | undefined, id: CollapseID) {
	return collapseEnemy(pokemon) && pokemon!.battle.fantasyRogue!.collapse!.includes(id);
}
export function collapseState(pokemon: Pokemon): CollapsePokemonState {
	// m is retained by switch/Transform/formeChange, but never copied into campaign Pokemon snapshots.
	pokemon.m.rogueCollapse ||= {
		adaptation: {}, shieldUsed: false, emergencyUsed: false, activeTurns: 0, vigilance: false,
	};
	return pokemon.m.rogueCollapse;
}
function count(pokemon: Pokemon, id: CollapseID) {
	const metrics = pokemon.battle.fantasyRogue!.collapseMetrics ||= { triggers: {} };
	metrics.triggers[id] = (metrics.triggers[id] || 0) + 1;
}
function announce(pokemon: Pokemon, id: CollapseID, text: string) {
	const entry = collapseEntry(pokemon, id);
	pokemon.battle.add('-message', `${pokemon.name} · ${entry.name}：${text}`);
}
function collapseEntry(pokemon: Pokemon, id: CollapseID) {
	return collapseEntries(pokemon.battle.fantasyRogue?.difficulty?.version ?? 3).find(entry => entry.id === id) ||
		LEGACY_COLLAPSE_ENTRIES.find(entry => entry.id === id) || { name: id };
}
const escapeHTML = (text: string) => text.replace(/[&<>"']/g, ch => (
	{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!
));
/** Native battle log UI survives reconnect and needs no client-supplied battle permission. */
export function showCollapse(battle: Battle) {
	if (!battle.fantasyRogue?.collapse?.length || battle.fantasyRogue.duel) return;
	const entries = collapseEntries(battle.fantasyRogue.difficulty?.version ?? 3)
		.filter(entry => battle.fantasyRogue!.collapse!.includes(entry.id));
	const rows = battle.getAllActive().filter(collapseEnemy).filter(mon => mon.hp).map(mon => {
		const s = collapseState(mon);
		const labels: string[] = [];
		if (hasCollapse(mon, 'statbloat')) labels.push('六项能力 +10%');
		if (hasCollapse(mon, 'abilitygas')) labels.push(collapseGasActive(battle) ?
			`气体压制还需 ${P.gasTurns - (battle.fantasyRogue?.collapseGasElapsed || 0)} 回合` : '气体已消散');
		if (hasCollapse(mon, 'adaptation')) labels.push('属性适应：' + (Object.entries(s.adaptation).map(([type, n]) =>
			`${TYPE_NAMES[type] || type} ${n}/3`).join('、') || '暂无层数'));
		if (hasCollapse(mon, 'statusshield') || hasCollapse(mon, 'cleanse') && !periodicCleanse(mon)) labels.push(`屏障${s.shieldUsed ? '已消耗' : '可用'}`);
		if (periodicCleanse(mon)) labels.push(`净化还需 ${P.cleanseTurns - s.activeTurns % P.cleanseTurns} 回合`);
		if (hasCollapse(mon, 'emergency') || hasCollapse(mon, 'vitality')) labels.push(`恢复${s.emergencyUsed ? '已消耗' : '可用'}`);
		if (hasCollapse(mon, 'steadfast')) labels.push(`坚守${s.steadfastUsed ? '已消耗' : '可用'}`);
		if (hasCollapse(mon, 'readiness')) labels.push(`整备还需 ${P.readinessTurns - s.activeTurns % P.readinessTurns} 回合`);
		if (hasCollapse(mon, 'vigilance')) labels.push(s.vigilance ? '警戒中' : '未警戒');
		return `<p><strong>${escapeHTML(mon.name)}</strong> · ${labels.join(' · ')}</p>`;
	});
	battle.add('uhtml', 'rogue-collapse', `<div class="infobox"><details><summary><strong>幻想崩坏 · ${entries.length}` +
	' 点</strong>（点击查看本局词条）</summary>' + entries.map(entry =>
		`<details><summary>${entry.name} · ${entry.text}</summary><p>${entry.detail}</p></details>`).join('') +
		'</details>' + rows.join('') + '</div>');
}
const TYPE_NAMES: Record<string, string> = { Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰',
	Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能力', Bug: '虫', Rock: '岩石',
	Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精' };

export function ordinaryCollapseMove(move?: Move | null): move is ActiveMove {
	return !!move && move.effectType === 'Move' && move.category !== 'Status' && !move.ohko &&
		!move.damage && !move.damageCallback;
}
const EXTERNAL_DAMAGE = new Set(['psn', 'tox', 'brn', 'fst', 'sandstorm', 'hail', 'spikes', 'stealthrock',
	'steelsurge', 'saltcure', 'leechseed', 'curse', 'partiallytrapped', 'roughskin', 'ironbarbs', 'rockyhelmet',
	'gmaxvinelash', 'gmaxwildfire', 'gmaxcannonade', 'gmaxvolcalith']);
const SELF_DAMAGE = new Set([
	'recoil', 'strugglerecoil', 'lifeorb', 'confused', 'confusion', 'substitute', 'bellydrum',
]);
const HP_PAYMENTS = new Set(['substitute', 'bellydrum', 'shedtail', 'filletaway', 'clangoroussoul', 'curse']);
/** Damage() is not a classification: moves may deal fixed damage; HP payments bypass it entirely. */
export function collapseDamageKind(effect: Effect, target: Pokemon, source?: Pokemon | null) {
	if (SELF_DAMAGE.has(effect.id)) return 'self';
	if (effect.effectType === 'Move') return ordinaryCollapseMove(effect as Move) ? 'ordinary' : 'fixed';
	if (EXTERNAL_DAMAGE.has(effect.id)) {
		if (['psn', 'tox', 'brn', 'fst'].includes(effect.id) && target.statusState.source === target) return 'self';
		if (['roughskin', 'ironbarbs', 'rockyhelmet'].includes(effect.id) && !player(source)) return 'other';
		return 'external';
	}
	// Other externally inflicted indirect effects (for example Jaboca Berry) remain external,
	// but self items/abilities and unclassified source-less costs are never discounted.
	if (source && source !== target && player(source) && ['Item', 'Ability'].includes(effect.effectType)) {
		return 'external';
	}
	return 'other';
}
export function collapseIndirectDamage(damage: number, target: Pokemon, source: Pokemon | null, effect: Effect) {
	const merged = hasCollapse(target, 'cleanse') && (target.battle.fantasyRogue?.difficulty?.version || 0) >= 5;
	if (!(damage > 0) || !(hasCollapse(target, 'erosion') || merged) ||
		collapseDamageKind(effect, target, source) !== 'external') return damage;
	count(target, merged ? 'cleanse' : 'erosion');
	return target.battle.modify(damage, parameters(target).erosion);
}

interface MoveScope {
	damaged: Set<Pokemon>; adapted: Map<Pokemon, Set<string>>; vigilance: Set<Pokemon>; vigilantAtStart: Set<Pokemon>;
}
// Only synchronous move execution uses these queues; all persistent state is serializable in Pokemon.m.
const scopes = new WeakMap<Battle, MoveScope[]>();
export function beginCollapseMove(battle: Battle) {
	if (!battle.fantasyRogue?.collapse?.length || battle.fantasyRogue.duel) return;
	const stack = scopes.get(battle) || [];
	stack.push({ damaged: new Set(), adapted: new Map(), vigilance: new Set(),
		vigilantAtStart: new Set(battle.getAllActive().filter(mon =>
			hasCollapse(mon, 'vigilance') && collapseState(mon).vigilance)) });
	scopes.set(battle, stack);
}
function scope(battle: Battle) { return scopes.get(battle)?.slice(-1)[0]; }
function vigilant(mon?: Pokemon | null) {
	return hasCollapse(mon, 'vigilance') &&
		(scope(mon!.battle)?.vigilantAtStart.has(mon!) ?? collapseState(mon!).vigilance);
}
export function endCollapseMove(battle: Battle) {
	const current = scopes.get(battle)?.pop();
	if (!current) return;
	for (const [mon, types] of current.adapted) {
		const state = collapseState(mon);
		for (const type of types) {
			if ((state.adaptation[type] || 0) >= P.adaptationCap) continue;
			state.adaptation[type] = Math.min(P.adaptationCap, (state.adaptation[type] || 0) + 1);
			count(mon, 'adaptation');
		}
	}
	for (const mon of current.vigilance) { collapseState(mon).vigilance = false; count(mon, 'vigilance'); }
	for (const mon of current.damaged) emergency(mon);
	showCollapse(battle);
}
export function recordCollapseDamage(
	target: Pokemon, source: Pokemon | null, effect: Effect, damage: number, substitute = false
) {
	if (!(damage > 0) || !target.battle.fantasyRogue?.collapse?.length) return;
	if (effect.effectType === 'Move' && HP_PAYMENTS.has(effect.id)) return;
	if (player(target) && hasCollapse(source, 'power') && ordinaryCollapseMove(effect as Move)) count(source!, 'power');
	const current = scope(target.battle);
	if (!substitute && collapseEnemy(target)) {
		if (current) current.damaged.add(target);
		else emergency(target);
		if (hasCollapse(target, 'adaptation') && ordinaryCollapseMove(effect as Move)) {
			// A standalone delayed attack has one hit; ordinary multi-hit attacks are enclosed by useMove.
			if (current) {
				const types = current.adapted.get(target) || new Set<string>();
				types.add((effect as Move).type); current.adapted.set(target, types);
			} else {
				const state = collapseState(target);
				const type = (effect as Move).type;
				if ((state.adaptation[type] || 0) < P.adaptationCap) {
					state.adaptation[type] = (state.adaptation[type] || 0) + 1;
					count(target, 'adaptation');
				}
			}
		}
	}
	if (player(target) && vigilant(source) && ordinaryCollapseMove(effect as Move)) {
		if (current) current.vigilance.add(source!);
		else { collapseState(source!).vigilance = false; count(source!, 'vigilance'); }
	}
}
export function collapseDirectDamage(damage: number, source: Pokemon, target: Pokemon, move: ActiveMove) {
	if (!ordinaryCollapseMove(move)) return damage;
	if (hasCollapse(target, 'coverage') && player(source) && !collapseSTAB(source, move)) {
		damage = source.battle.modify(damage, parameters(target).coverage);
		count(target, 'coverage');
	}
	if (player(target) && hasCollapse(source, 'power')) {
		damage = source.battle.modify(damage, parameters(source).power);
	}
	if (hasCollapse(target, 'adaptation') &&
		(!target.volatiles['substitute'] || move.infiltrates || move.flags['bypasssub'])) {
		damage = source.battle.modify(damage, 1 - parameters(target).adaptationStep * (collapseState(target).adaptation[move.type] || 0));
	}
	if (player(target) && vigilant(source)) {
		damage = source.battle.modify(damage, parameters(source).vigilance);
	}
	return damage;
}
export function collapseCriticalMultiplier(target: Pokemon, multiplier: number) {
	if (!hasCollapse(target, 'critical')) return multiplier;
	count(target, 'critical');
	return 1 + (multiplier - 1) * P.criticalBonus;
}
export function collapseOHKO(target: Pokemon, move: ActiveMove) {
	if (!move.ohko || !hasCollapse(target, 'critical')) return false;
	count(target, 'critical'); target.battle.add('-immune', target, '[from] 幻想崩坏：要害防护'); return true;
}

const SHIELDED = new Set(['psn', 'tox', 'brn', 'par', 'slp', 'frz', 'confusion', 'yawn']);
const ATTACHMENTS = new Set(['saltcure', 'leechseed', 'curse', 'partiallytrapped']);
function spendShield(target: Pokemon) {
	const id = hasCollapse(target, 'cleanse') ? 'cleanse' : 'statusshield';
	collapseState(target).shieldUsed = true;
	count(target, id); announce(target, id, '屏障已消耗。'); showCollapse(target.battle);
}
/** After ChangeBoost/TryBoost, so Contrary, Clear Body and capped stages have already resolved. */
export function collapseBlockBoost(target: Pokemon, source: Pokemon | null, boosts: SparseBoostsTable) {
	if (!boosts || !hasCollapse(target, 'cleanse') || periodicCleanse(target) || !player(source) || collapseState(target).shieldUsed) return;
	const drops = (Object.keys(boosts) as BoostID[]).filter(key => (boosts[key] || 0) < 0 && target.boosts[key] > -6);
	if (!drops.length) return;
	spendShield(target);
	for (const key of drops) delete boosts[key];
}
/** Runs after native Damage immunity and Sash/Sturdy events, immediately before body HP loss. */
export function collapseSteadfast(damage: number, target: Pokemon, effect: Effect) {
	const modern = (target.battle.fantasyRogue?.difficulty?.version || 0) >= 5;
	if (!hasCollapse(target, 'steadfast') || collapseState(target).steadfastUsed || effect.effectType !== 'Move' ||
		HP_PAYMENTS.has(effect.id) || SELF_DAMAGE.has(effect.id) || target.hp <= 0 ||
		!modern && (target.hp <= 1 || target.hp !== target.maxhp) || damage < target.hp) return damage;
	collapseState(target).steadfastUsed = true; count(target, 'steadfast');
	announce(target, 'steadfast', '保留了 1 点生命值。');
	return target.hp - 1;
}
/** Called only AFTER the engine's natural/ability/terrain immunity events have succeeded. */
export function collapseBlockStatus(target: Pokemon, source: Pokemon | null | undefined, status: string) {
	if (ATTACHMENTS.has(status) && hasCollapse(target, 'attachment')) {
		count(target, 'attachment'); announce(target, 'attachment', '阻挡了附着效果。'); return true;
	}
	if (!SHIELDED.has(status) || !player(source) || !(hasCollapse(target, 'statusshield') || hasCollapse(target, 'cleanse') && !periodicCleanse(target)) ||
		collapseState(target).shieldUsed) return false;
	if (status === 'yawn' && (target.status || !target.runStatusImmunity('slp'))) return false;
	spendShield(target);
	return true;
}
function emergency(mon: Pokemon) {
	const vitality = hasCollapse(mon, 'vitality');
	if (!(hasCollapse(mon, 'emergency') || vitality) || collapseState(mon).emergencyUsed ||
		mon.hp <= 0 || mon.hp >= mon.maxhp * P.emergencyThreshold) return;
	collapseState(mon).emergencyUsed = true;
	const id = vitality ? 'vitality' : 'emergency';
	count(mon, id); announce(mon, id, '本场恢复机会已使用。');
	mon.battle.heal(mon.maxhp * (vitality ? parameters(mon).vitalityHeal : P.emergencyHeal), mon, mon,
		mon.battle.dex.conditions.get('rogueemergency'));
}

export function collapseMaxHP(pokemon: Pokemon, hp: number) {
	if (hasCollapse(pokemon, 'statbloat') && !pokemon.m.rogueCollapseStatsCounted) {
		pokemon.m.rogueCollapseStatsCounted = true; count(pokemon, 'statbloat');
	}
	if (!pokemon.maxhp && (hasCollapse(pokemon, 'vitality') || hasCollapse(pokemon, 'statbloat'))) pokemon.m.rogueCollapseBaseHP = hp;
	hp = collapseStat(pokemon, hp);
	return hasCollapse(pokemon, 'vitality') ? Math.max(1, Math.floor(hp * parameters(pokemon).vitalityHP)) : hp;
}
/** Kept outside storedStats so Transform/Power Split cannot copy faction permissions. */
export function collapseStat(pokemon: Pokemon, stat: number) {
	return hasCollapse(pokemon, 'statbloat') ? Math.max(1, Math.floor(stat * parameters(pokemon).stats)) : stat;
}
export function collapseSTAB(source: Pokemon, move: ActiveMove) {
	return move.type !== '???' && !!(move.forceSTAB || source.hasType(move.type) || source.getTypes(false, true).includes(move.type));
}
export function collapseGasActive(battle: Battle) {
	return !!battle.fantasyRogue?.collapse?.includes('abilitygas') && !battle.fantasyRogue.duel &&
		!battle.fantasyRogue.collapseGasEnded && battle.turn <= P.gasTurns;
}
/** Called after the engine's normal unsuppressible ability / Ability Shield exceptions. */
export function collapseGasSuppresses(pokemon: Pokemon) {
	return player(pokemon) && collapseGasActive(pokemon.battle) &&
		!pokemon.volatiles['commanding'] && !pokemon.volatiles['parasite'];
}
// Explicit negative attachments: never erase Substitute, positive boosts or move-use costs.
export const CLEANSE_VOLATILES = ['confusion', 'yawn', 'saltcure', 'leechseed', 'curse', 'partiallytrapped',
	'nightmare', 'taunt', 'encore', 'disable', 'torment', 'healblock', 'embargo', 'attract', 'perishsong',
	'gastroacid', 'octolock', 'syrupbomb', 'powder', 'tarshot', 'telekinesis', 'foresight', 'miracleeye',
	'smackdown', 'trapped', 'flinch'];
export function collapseResidual(battle: Battle) {
	if (collapseGasActive(battle)) battle.fantasyRogue!.collapseGasElapsed = battle.turn;
	if (collapseGasActive(battle) && battle.getAllActive().some(mon => player(mon) && mon.hp &&
		!mon.volatiles.gastroacid && !mon.hasItem('abilityshield') &&
		[mon.ability, ...Object.keys(mon.volatiles).filter(id => id.startsWith('ability:')).map(id => id.slice(8))]
			.some(id => !battle.dex.abilities.get(id).flags.cantsuppress && id !== 'neutralizinggas' &&
				mon.ignoringAbility(battle.dex.abilities.get(id).id)))) {
		for (const mon of battle.getAllActive()) if (mon.hp && hasCollapse(mon, 'abilitygas')) count(mon, 'abilitygas');
	}
	if (collapseGasActive(battle) && battle.turn === P.gasTurns) {
		const suppressed = battle.getAllActive().filter(mon => player(mon) && mon.hp &&
			collapseGasSuppresses(mon) && !mon.hasItem('abilityshield'));
		battle.speedSort(suppressed);
		const restarting = suppressed.flatMap(mon => [{ ability: mon.getAbility(), state: mon.abilityState },
			...Object.entries(mon.volatiles).filter(([id]) => id.startsWith('ability:')).map(([id, state]) =>
				({ ability: battle.dex.abilities.get(id.slice(8)), state }))]
			.filter(({ ability }) => !ability.flags['cantsuppress'] && ability.id !== 'neutralizinggas' && mon.ignoringAbility(ability.id))
			.map(entry => ({ mon, ...entry })));
		battle.fantasyRogue!.collapseGasEnded = true;
		battle.add('-message', '特性超模：气体已消散，我方特性恢复正常。');
		for (const { mon, ability, state } of restarting) {
			if (!mon.ignoringAbility(ability.id)) battle.singleEvent('Start', ability, state, mon);
		}
	}
	for (const mon of battle.getAllActive()) {
		const cleanse = periodicCleanse(mon);
		if (!mon.hp || !(cleanse || hasCollapse(mon, 'readiness'))) continue;
		const state = collapseState(mon);
		if (!battle.turn || state.lastCountedTurn === battle.turn) continue;
		state.lastCountedTurn = battle.turn;
		state.activeTurns++;
		const dueCleanse = cleanse && state.activeTurns % P.cleanseTurns === 0;
		const dueReadiness = hasCollapse(mon, 'readiness') && state.activeTurns % P.readinessTurns === 0;
		if (!dueCleanse && !dueReadiness) continue;
		const id = dueCleanse ? 'cleanse' : 'readiness';
		if (dueCleanse) {
			mon.cureStatus();
			for (const volatile of CLEANSE_VOLATILES) mon.removeVolatile(volatile);
			count(mon, id); announce(mon, id, '已清除异常、负面附着和能力下降。');
		}
		if (Object.values(mon.boosts).some(value => value < 0)) {
			if (!dueCleanse) count(mon, id);
			for (const key of Object.keys(mon.boosts) as BoostID[]) if (mon.boosts[key] < 0) mon.boosts[key] = 0;
			battle.add('-clearnegativeboost', mon, '[from] 幻想崩坏：' + collapseEntry(mon, id).name);
		}
	}
	showCollapse(battle);
}
export function collapseBoost(target: Pokemon, before: SparseBoostsTable) {
	if (!player(target) || !target.isActive || !target.hp ||
		!target.battle.fantasyRogue?.collapse?.includes('vigilance')) return;
	if (!(Object.keys(target.boosts) as BoostID[]).some(key =>
		Math.max(0, target.boosts[key]) > Math.max(0, before[key] || 0))) return;
	for (const enemy of target.battle.getAllActive()) {
		if (!enemy.hp || !hasCollapse(enemy, 'vigilance')) continue;
		if (!collapseState(enemy).vigilance) announce(enemy, 'vigilance', '下一次有效攻击强化。');
		collapseState(enemy).vigilance = true;
	}
	showCollapse(target.battle);
}
export function clearCollapseVigilance(mon: Pokemon) {
	if (mon.m.rogueCollapse) mon.m.rogueCollapse.vigilance = false;
}

// These native callbacks choose one status using a single shared probability roll.
const SECONDARY_STATUS_CALLBACKS = new Set(['triattack', 'direclaw', 'yaojingzhiya']);
type CollapseSecondary = HitEffect & { rogueCollapseSecondary?: boolean };
export function collapseSecondaries(move: ActiveMove, source: Pokemon) {
	if (!move || !hasCollapse(source, 'secondary')) return;
	let changed = false;
	for (const secondary of move.secondaries || []) {
		const favorable = secondary.status || secondary.volatileStatus ||
			(secondary.onHit && SECONDARY_STATUS_CALLBACKS.has(move.id)) ||
			Object.values(secondary.boosts || {}).some(n => n < 0) ||
			Object.values(secondary.self?.boosts || {}).some(n => n > 0);
		const harmful = secondary.self?.status || secondary.self?.volatileStatus ||
			Object.values(secondary.self?.boosts || {}).some(n => n < 0) || Object.values(secondary.boosts || {}).some(n => n > 0);
		if (favorable && !harmful && secondary.chance && secondary.chance < 100) {
			secondary.chance = Math.min(100, secondary.chance + P.secondaryPoints); changed = true;
			(secondary as CollapseSecondary).rogueCollapseSecondary = true;
		}
	}
	if (move.self?.chance && move.self.chance < 100 && Object.values(move.self.boosts || {}).some(n => n > 0) &&
		!Object.values(move.self.boosts || {}).some(n => n < 0) && !move.self.status && !move.self.volatileStatus) {
		move.self.chance = Math.min(100, move.self.chance + P.secondaryPoints); changed = true;
		(move.self as CollapseSecondary).rogueCollapseSecondary = true;
	}
	if (changed) (move as any).rogueCollapseSecondary = true;
}
export function finishCollapseSecondaries(move: ActiveMove) {
	if (!move || !(move as any).rogueCollapseSecondary) return;
	for (const secondary of [...(move.secondaries || []), ...(move.self ? [move.self] : [])]) {
		if (secondary.chance !== undefined) secondary.chance = Math.min(100, secondary.chance);
	}
}
/** Count effects that actually change a Pokemon, not merely a move carrying an increased chance. */
export function collapseSecondaryEffect(
	target: Pokemon | null, source: Pokemon, effect: HitEffect, apply: () => unknown
) {
	if (!(effect as CollapseSecondary).rogueCollapseSecondary || !hasCollapse(source, 'secondary')) { apply(); return; }
	const snapshot = () => JSON.stringify([source, target].map(mon => mon &&
		[mon.status, mon.boosts, Object.keys(mon.volatiles)]));
	const before = snapshot();
	apply();
	if (snapshot() !== before) count(source, 'secondary');
}
/** Transform ONLY the weather/terrain handler's own multiplier, before composition/rounding. */
export function collapseEnvironment(battle: Battle, multiplier: number) {
	const event = battle.event;
	if (!event || !['BasePower', 'WeatherModifyDamage', 'ModifyDamage'].includes(event.id) || !(multiplier > 0)) {
		return multiplier;
	}
	if (battle.effect.effectType !== 'Weather' && battle.effect.id !== battle.field.terrain) return multiplier;
	const attacker = event.target as Pokemon, defender = event.source as Pokemon;
	if (!attacker?.side || !defender?.side || !ordinaryCollapseMove(event.effect as ActiveMove)) return multiplier;
	const enemy = hasCollapse(defender, 'environment') && player(attacker) && multiplier > 1 ? defender :
		hasCollapse(attacker, 'environment') && player(defender) && multiplier < 1 ? attacker : null;
	if (!enemy) return multiplier;
	count(enemy, 'environment');
	return 1 + (multiplier - 1) * parameters(enemy).environmentBonus;
}
