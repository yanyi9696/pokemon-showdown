import { awakeningUpdate, awakeningLethal, spiralLethal, spiralActive, spiralPoints, gainSpiral, robeMultiplier, bloodRequest, empowerBloodMove } from './fantasy-rogue-awakening';
import { robeMember } from './rogue-awakening';
import { petSpecies, dogBoostCount } from './rogue-pets';
import { recordEvolutionMove } from './rogue-evolution-progress';
import type { Battle } from './battle';
import type { Pokemon } from './pokemon';
import type { FormatData } from './dex-formats';
import { rogueEventDamage, type RoguePokemon } from './fantasy-rogue';
import { toID } from './dex';
import { ownsBlessing, emblemType, addPsychicCharge, EEVEE_FAMILY, inBlessingFamily, blessing, type BlessingEffects } from './rogue-blessing-data';
import type { Side } from './side';
import { reportRogueStatuses } from './fantasy-rogue-status';
import { consumeRogueItem } from './fantasy-rogue-items';
import { mentorCardProfile } from './rogue-mentor';
import { companionSource } from './rogue-companions';
import { companionZRequest } from './rogue-companion-z';
import { railgunActive, rulebreakerActive } from './rogue-special-blessings';
import { DRAGON_KING_ABILITIES, assignedExtraAbilities, strongestDragon, dragonKingActive, type DragonKingAbility } from './rogue-blessing-permanent';

interface MemberRuntime {
	abilitiesPrepared?: boolean;
	abilities: string[]; entries: number; actions: number; inherited: string[]; inheritedSlots?: Pokemon['moveSlots'];
	sword: Partial<StatsTable>; prayer: { atk: number, spa: number };
	low?: boolean; survived?: boolean; bondUsed?: boolean; detectReady?: boolean; extraZ?: boolean;
	insight: { points: number, gain: number }; consumed?: string;
	bonusHP?: number;
	eeveeZUsed?: boolean;
	wineUsed?: boolean;
}
export interface SideRuntime {
	combo: number; style: number; lastMove?: string; faintedTypes: string[];
	drops: Record<string, Partial<BoostsTable>>;
	prayer?: { atk: number, spa: number }; inheritance?: Pokemon['moveSlots'];
	seeds: Record<string, { source: Pokemon, sourceSlot: PokemonSlot }>;
	strongest?: Record<string, string>;
	psychicDefeats?: string[];
	dragonKing?: { member: string, ability?: DragonKingAbility, token: number, pending: boolean };
}
export function blessingEffects(mon: Pokemon): BlessingEffects | undefined {
	const state = mon.battle.fantasyRogue;
	return mon.side.id === 'p1' ? state?.blessings : mon.side.id === 'p2' ? state?.duel?.blessings : undefined;
}
export const hasBlessing = (mon: Pokemon | null | undefined, family: string) =>
	mon ? ownsBlessing(blessingEffects(mon), family) : undefined;
const blessingSource = (mon: Pokemon, family: string) => blessing(hasBlessing(mon, family)!.id)!.name;
export function savedBlessingMember(mon: Pokemon): RoguePokemon | undefined {
	const state = mon.battle.fantasyRogue;
	if (!mon.set.fantasyRogueId) return undefined;
	return (mon.side.id === 'p1' ? state?.team : mon.side.id === 'p2' ? state?.duel?.team : undefined)?.find(saved => saved.id === mon.set.fantasyRogueId);
}
/** The engine and private tooltips share this list; reading it never rolls RNG or spends an effect. */
export function roguePowerModifiers(pokemon: Pokemon, move: Move | ActiveMove, preview = false) {
	const modifiers: { source: string, factor?: number, add?: number }[] = [];
	const add = (source: string, factor: number) => modifiers.push({ source, factor });
	if (move.category === 'Status') return modifiers;
	if (move.id === 'zapcannon' && railgunActive(pokemon)) add('某科学的超电磁炮', 2);
	const activeMove = move as ActiveMove;
	if (activeMove.rogueWine || preview && savedBlessingMember(pokemon)?.tonics?.wine && !member(pokemon).wineUsed) add('酒', 2);
	if (move.type === 'Poison' && savedBlessingMember(pokemon)?.tonics?.poison) add('酒与头孢', 1.5);
	if (activeMove.rogueLanding || preview && pokemon.volatiles.rogueascent &&
		pokemon.battle.turn > pokemon.volatiles.rogueascent.turn) add('登龙', 1.3);
	if (hasBlessing(pokemon, 'speedpower')) add('天下武功，唯快不破', 1 + pokemon.getStat('spe') / 2000);
	if (move.id === 'bugbuzz' && hasBlessing(pokemon, 'bugchoir')) modifiers.push({ source: blessingSource(pokemon, 'bugchoir'),
		add: 10 * pokemon.side.pokemon.reduce((n, p) => n + p.moveSlots.filter(slot => slot.id === 'bugbuzz').length, 0) });
	if (hasBlessing(pokemon, 'entrance')) add(blessing(hasBlessing(pokemon, 'entrance')!.id)!.name, 1 + member(pokemon).entries * 0.05);
	if (hasBlessing(pokemon, 'hoopa') && strongest(pokemon, 'hoopa') && ['Dark', 'Ghost'].includes(move.type)) add(blessingSource(pokemon, 'hoopa'), 1.5);
	for (const b of blessingEffects(pokemon)?.owned || []) if (b.family === 'typelink' && b.type === move.type) {
		add(blessing(b.id)!.name, 1.5 + side(pokemon).faintedTypes.filter(type => type === b.type).length * 0.05);
	}
	const evo = blessingEffects(pokemon)?.evolution;
	if (evo?.type === move.type && evo.power) add('宝可梦属性进化', 1 + evo.power);
	return modifiers;
}
export function rogueDamageSources(mon: Pokemon, move: Move) {
	if (move.category === 'Status' || move.ohko || move.damage || move.damageCallback) return [];
	const sources: string[] = [], state = mon.battle.fantasyRogue!;
	if (rulebreakerActive(mon)) sources.push('【规则，就是用来打破的】无视防御强化、减伤防护与属性免疫');
	const blood = bloodRequest(mon);
	if (blood) sources.push(`【神衣鲜血】可选消耗 ${blood.cost} HP，使本次伤害 +${Math.round((blood.factor - 1) * 100)}%`);
	const ordinary = hasBlessing(mon, 'ordinary');
	if (ordinary && mon.side.pokemon.every(p => mon.battle.dex.species.get(savedBlessingMember(p)?.set.species || p.baseSpecies.name).bst <= 500)) {
		sources.push(`【愤怒的普通宝可梦】伤害 +${10 + Math.max(1, Math.floor(ordinary.floor / 50)) * 5}%`);
	}
	if (hasBlessing(mon, 'lifepower')) sources.push('【氪命】伤害 ×1.3');
	if (hasBlessing(mon, 'explosionart') && ['selfdestruct', 'explosion'].includes(move.id)) sources.push('【艺术就是爆炸】最终伤害 +50%');
	if (hasBlessing(mon, 'coin')) sources.push(hasBlessing(mon, 'dice') ? '【命运决定一切】伤害 ×1.5' : '【命运决定一切】伤害随机 ×0.5 或 ×1.5');
	if (hasBlessing(mon, 'sound') && move.flags.sound) sources.push(`【${blessingSource(mon, 'sound')}】伤害 +${mon.side.pokemon.reduce((n, p) =>
		n + p.moveSlots.filter(slot => mon.battle.dex.moves.get(slot.id).flags.sound).length, 0) * 5}%`);
	if (mon.side.id === 'p1' && state.mentorCard && !move.ohko) {
		const card = mentorCardProfile(state.mentorCard, state.mentorTier);
		sources.push(`【首领卡 · ${card.name}】伤害 +${card.damage}%`);
	}
	if ((mon.side.id === 'p1' ? state.eventBuff : state.duel?.eventBuff) && !move.ohko) sources.push('【蘑菇的活力】伤害 +20%');
	return sources;
}
/** Neutral context excludes move-specific multipliers such as Overgrow, which belong in move tooltips. */
export function rogueStatSnapshot(mon: Pokemon) {
	const context = mon.battle.dex.getActiveMove('splash');
	context.type = '???';
	const opponent = mon.side.foe?.active.find(p => p && !p.fainted) || mon.side.foe?.pokemon[0] || mon;
	const events = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
	return Object.fromEntries((Object.keys(events) as StatIDExceptHP[]).map(stat => [stat,
		mon.battle.runEvent('Modify' + events[stat], mon, opponent, context, mon.getStat(stat, false, true)),
	]));
}
/** Private tooltip data. Do not evaluate damage callbacks without a move/target. */
export function rogueAbilityInfo(mon: Pokemon) {
	if (!mon.battle.fantasyRogue) return undefined;
	const saved = savedBlessingMember(mon);
	if (!saved) return undefined;
	const team = mon.side.id === 'p1' ? mon.battle.fantasyRogue.team : mon.battle.fantasyRogue.duel?.team || [];
	const ids: string[] = mon.m.rogueBlessing?.abilitiesPrepared ? mon.m.rogueBlessing.abilities :
		assignedExtraAbilities(saved, team, blessingEffects(mon));
	const abilities = [...new Set(ids)].filter(id => id !== mon.ability);
	const active = !mon.isActive || !mon.ignoringAbility();
	const state = mon.battle.fantasyRogue;
	const card = mon.side.id === 'p1' && state.mentorCard;
	const stats = rogueStatSnapshot(mon);
	const statSources: string[] = [];
	if (spiralActive(mon)) statSources.push(`【螺旋力】${spiralPoints(mon).toFixed(1)} / 1000，攻击 +${(spiralPoints(mon) / 10).toFixed(1)}%（保命阈值 250）`);
	if (robeMultiplier(mon) > 1) statSources.push(`【神衣耐久】当前双防 ×${robeMultiplier(mon).toFixed(3)}，已计入能力值`);
	if (saved.mushroomTraining) statSources.push(`【合成大蘑菇】双攻 +${Number((saved.mushroomTraining.offense / 100).toFixed(2))}%，双防 +${Number((saved.mushroomTraining.defense / 100).toFixed(2))}%（已计入能力值）`);
	if (rulebreakerActive(mon)) statSources.push('【规则，就是用来打破的】无视自身能力下降与天气减益');
	if (railgunActive(mon)) statSources.push('【某科学的超电磁炮】永久电磁漂浮');
	const effects = blessingEffects(mon), modifiers = mon.set.fantasyRogueModifiers;
	if (Object.values(mon.set.fantasyRogueStats || {}).some(Boolean)) statSources.push('局外六维加成已计入基础能力');
	if ((mon.set.fantasyRogueScale || 1) !== 1) statSources.push(`星级：六维 ×${mon.set.fantasyRogueScale}`);
	if (modifiers?.hp) statSources.push(`越打命越硬：HP +${modifiers.hp}`);
	if (modifiers?.stats && Object.values(modifiers.stats).some(Boolean)) statSources.push('属性进化的六维增幅已计入基础能力');
	if (modifiers?.smallFinal) statSources.push('【谁说我到头了】六项种族值提升 50%');
	if (modifiers?.compound) statSources.push(mon.species.bst > 500 ?
		'【五号化合物】当前形态原始种族值总和超过 500，新增点数停用；主特性仍锁定为【化学之力】' :
		'【五号化合物】分配的新增种族值已计入基础能力，主特性锁定为【化学之力】');
	if (modifiers?.swap) statSources.push('六维数值已经交换');
	for (const family of ['speedpower', 'swords', 'prayer', 'supercombo', 'kid', 'style']) {
		const owned = ownsBlessing(effects, family);
		if (owned) statSources.push(`【${blessing(owned.id)!.name}】已计入当前能力`);
	}
	const previewMoves = mon.moveSlots.map(slot => mon.battle.dex.moves.get(slot.id));
	const companionZ = companionZRequest(mon);
	if (companionZ) previewMoves.push(mon.battle.dex.moves.get(companionZ.move));
	const zMoves = mon.battle.actions.canZMove(mon);
	const maxMoves = mon.getDynamaxRequest(!!mon.volatiles.dynamax)?.maxMoves;
	for (const variant of [...zMoves || [], ...maxMoves || []]) {
		if (!variant) continue;
		const move = mon.battle.dex.moves.get(variant.move);
		if (move.exists && !previewMoves.some(known => known.id === move.id)) previewMoves.push(move);
	}
	const moves = Object.fromEntries(previewMoves.map(move => {
		const typed = !!saved.tonics?.poison || !!effects?.evolution?.power ||
			!!effects?.owned.some(b => ['typelink', 'hoopa'].includes(b.family));
		return [move.id, { power: roguePowerModifiers(mon, move, true), damage: rogueDamageSources(mon, move),
			...(move.id === companionZ?.move ? { name: companionZ.name, source: companionZ.source } : {}),
			...(move.id === 'zapcannon' && railgunActive(mon) ? { name: '超电磁炮', accuracyFactor: 2, accuracySource: '某科学的超电磁炮' } : {}),
			...(typed ? { types: Object.fromEntries(mon.battle.dex.types.names().map(type =>
				[type, roguePowerModifiers(mon, { ...move, type }, true)])) } : {}) }];
	}));
	const abilitySources = Object.fromEntries((blessingEffects(mon)?.companions || [])
		.filter(c => !c.away && c.member === saved.id && c.ability).map(c => [c.ability!, companionSource(c.id)]));
	for (const [family, extra, source] of [['godrobe', ['sharpness', 'jiqususheng'], '神衣鲜血'],
		['puregodrobe', ['stalwart', 'sheerforce'], '神衣纯洁']] as const) {
		if (robeMember(team, effects, family)?.id === saved.id) for (const id of extra) abilitySources[id] = source;
	}
	if (ownsBlessing(effects, 'speedpower')?.target === saved.id) abilitySources.speedboost = '天下武功，唯快不破';
	const king = battleDragonKing(mon.side);
	if (king?.member === saved.id && king.ability) abilitySources[king.ability] = companionSource('iris');
	return { abilities, active, abilitySources, stats, maxhp: mon.maxhp, statSources, moves, rulebreaker: rulebreakerActive(mon),
		training: saved.statModifiers?.training,
		mentor: card ? mentorCardProfile(card, state.mentorTier) : undefined };
}
export function reportRogueAbilities(battle: Battle) {
	if (!battle.fantasyRogue) return;
	for (const player of battle.sides) for (const mon of player?.active || []) {
		if (!mon) continue;
		const info = rogueAbilityInfo(mon);
		if (!info) continue;
		const json = JSON.stringify(info);
		if (json === mon.m.rogueInfoJSON) continue;
		mon.m.rogueInfoJSON = json;
		battle.addSplit(player.id, ['-rogueinfo', mon, json]);
	}
}
function member(mon: Pokemon): MemberRuntime {
	mon.m.rogueBlessing ||= { abilities: [], entries: 0, actions: 0, inherited: [], sword: {},
		prayer: { atk: 0, spa: 0 }, insight: { ...savedBlessingMember(mon)?.insight || { points: 0, gain: 1 } } };
	return mon.m.rogueBlessing;
}
function side(mon: Pokemon): SideRuntime {
	const state = mon.battle.fantasyRogue!;
	state.blessingRuntime ||= {};
	state.blessingRuntime[mon.side.id] ||= { combo: 0, style: 0, faintedTypes: [], drops: {}, seeds: {} };
	return state.blessingRuntime[mon.side.id];
}
function battleKingOptions(mon: Pokemon) {
	const state = mon.battle.fantasyRogue!;
	const team = mon.side.id === 'p1' ? state.team : state.duel!.team;
	const saved = savedBlessingMember(mon);
	const extra = saved ? assignedExtraAbilities(saved, team, blessingEffects(mon), false) : [];
	return DRAGON_KING_ABILITIES.filter(ability => mon.ability !== ability && !extra.includes(toID(ability)));
}
/** The campaign king is immutable here; succession belongs only to this battle. */
export function battleDragonKing(player: Side) {
	const first = player.pokemon[0];
	if (!dragonKingActive(blessingEffects(first))) return undefined;
	const runtime = side(first);
	if (!runtime.dragonKing) {
		const saved = blessingEffects(first)?.dragonKing;
		const available = player.pokemon.find(mon => mon.set.fantasyRogueId === saved?.member && mon.hp && !mon.fainted);
		const successor = available ? undefined : strongestDragon(player.pokemon.filter(mon => mon.hp && !mon.fainted)
			.map(savedBlessingMember).filter((mon): mon is RoguePokemon => !!mon));
		runtime.dragonKing = { member: available ? saved!.member : successor?.id || '',
			ability: available ? saved?.ability : undefined, token: 1,
			pending: !!(available || successor) && !(available && saved?.ability) };
		const king = player.pokemon.find(mon => mon.set.fantasyRogueId === runtime.dragonKing!.member);
		if (king && !battleKingOptions(king).length) runtime.dragonKing.pending = false;
	}
	return runtime.dragonKing;
}
export function dragonKingRequest(player: Side) {
	const king = battleDragonKing(player);
	if (!king?.member) return undefined;
	const pokemon = player.pokemon.find(mon => mon.set.fantasyRogueId === king.member)!;
	return { ...king, species: pokemon.species.name, options: battleKingOptions(pokemon) };
}
export function chooseDragonKing(player: Side, input: string) {
	const [ability, token] = input.trim().split(' ');
	const king = battleDragonKing(player);
	if (player.battle.ended || !king?.pending || String(king.token) !== token ||
		!DRAGON_KING_ABILITIES.includes(ability as DragonKingAbility)) {
		return player.emitChoiceError('龙王特性选项已经失效，请按当前提示选择。');
	}
	const pokemon = player.pokemon.find(mon => mon.set.fantasyRogueId === king.member);
	if (!pokemon?.hp || pokemon.fainted) return player.emitChoiceError('该龙王已经倒下。');
	if (!battleKingOptions(pokemon).includes(ability as DragonKingAbility)) {
		return player.emitChoiceError('该龙王已经拥有这个特性，不能重复赋予。');
	}
	player.battle.inputLog.push(`>${player.id} rogueking ${ability} ${king.token}`);
	king.ability = ability as DragonKingAbility; king.pending = false;
	const already = pokemon.hasAbility(ability);
	prepareBlessingMember(pokemon);
	player.battle.add('-message', `${companionSource('iris')}${pokemon.species.name}成为本场龙王，获得额外特性${ability === 'drizzle' ? '降雨' : '龙之呼吸'}。`);
	if (pokemon.isActive && !already && !pokemon.ignoringAbility()) {
		player.battle.singleEvent('Start', player.battle.dex.abilities.get(ability), pokemon.volatiles[`ability:${ability}`], pokemon);
	}
	if (player.activeRequest) player.emitRequest(player.activeRequest);
	return true;
}
function succeedDragonKing(pokemon: Pokemon) {
	const king = battleDragonKing(pokemon.side);
	if (!king || king.member !== pokemon.set.fantasyRogueId) return;
	const next = strongestDragon(pokemon.side.pokemon.filter(mon => mon !== pokemon && mon.hp && !mon.fainted)
		.map(savedBlessingMember).filter((mon): mon is RoguePokemon => !!mon));
	king.member = next?.id || ''; delete king.ability;
	const successor = pokemon.side.pokemon.find(mon => mon.set.fantasyRogueId === next?.id);
	king.token++; king.pending = !!successor && !!battleKingOptions(successor).length;
	prepareBlessingMember(pokemon);
	if (next) pokemon.battle.add('-message', `${next.set.species}接任本场龙王，${king.pending ? '请选择额外特性' : '已具备两种特性，无需重复赋予'}。`);
}
function strongest(mon: Pokemon, species: string) {
	if (!mon.battle.fantasyRogue) return false;
	const selected = side(mon).strongest ||= {};
	if (selected[species] !== undefined) return selected[species] === mon.set.fantasyRogueId;
	const members = mon.side.pokemon.filter(p => species.split('|').includes(toID(p.baseSpecies.baseSpecies).replace(/fantasy$/, '')));
	const sum = (stats: Partial<StatsTable>) => Object.values(stats).reduce((a, b) => a + (b || 0), 0);
	members.sort((a, b) => b.level - a.level || sum(b.set.evs) - sum(a.set.evs) || sum(b.set.ivs) - sum(a.set.ivs) ||
		(b.set.happiness || 0) - (a.set.happiness || 0) || (savedBlessingMember(a)?.joinOrder || 0) - (savedBlessingMember(b)?.joinOrder || 0));
	selected[species] = members[0]?.set.fantasyRogueId || '';
	return members[0] === mon;
}
const starterBases = new Set(['bulbasaur', 'charmander', 'squirtle', 'chikorita', 'cyndaquil', 'totodile', 'treecko',
	'torchic', 'mudkip', 'turtwig', 'chimchar', 'piplup', 'snivy', 'tepig', 'oshawott', 'chespin', 'fennekin', 'froakie',
	'rowlet', 'litten', 'popplio', 'grookey', 'scorbunny', 'sobble', 'sprigatito', 'fuecoco', 'quaxly']);
function starter(mon: Pokemon) {
	let species = mon.battle.dex.species.get(mon.set.species);
	const seen = new Set<string>();
	while (species.prevo && !seen.has(species.id)) { seen.add(species.id); species = mon.battle.dex.species.get(species.prevo); }
	return starterBases.has(species.id);
}
function qualifiesPrayer(mon: Pokemon) {
	const stats = mon.battle.dex.species.get(mon.set.species).baseStats;
	return stats.atk <= 80 && stats.spa <= 80;
}
export function prepareBlessingMember(mon: Pokemon) {
	if (!mon.battle.fantasyRogue) return;
	const runtime = member(mon), saved = savedBlessingMember(mon);
	const state = mon.battle.fantasyRogue;
	const abilities: string[] = saved ? assignedExtraAbilities(saved, mon.side.id === 'p1' ? state.team : state.duel?.team || [], blessingEffects(mon), false) : [];
	for (const companion of blessingEffects(mon)?.companions || []) {
		if (!companion.away && companion.member === mon.set.fantasyRogueId && companion.ability) abilities.push(companion.ability);
	}
	for (const [family, ability] of [['hazards', 'yanbuzhen'], ['toxic', 'merciless']]) {
		if (saved && hasBlessing(mon, family)?.target === saved.id) abilities.push(ability);
	}
	if (hasBlessing(mon, 'arsenal')) abilities.push('bianhuanziyou');
	if (hasBlessing(mon, 'restinball')) abilities.push('regenerator', 'naturalcure');
	const king = battleDragonKing(mon.side);
	if (king && king.member === mon.set.fantasyRogueId && king.ability) abilities.push(king.ability);
	if (hasBlessing(mon, 'duck') && strongest(mon, 'psyduck|golduck')) abilities.push('neuroforce');
	if (strongest(mon, 'meloetta')) {
		if (hasBlessing(mon, 'singer')) abilities.push('tianlaizhiyin', 'jizhineng');
		if (hasBlessing(mon, 'dancer')) {
			abilities.push('dancer');
			mon.formeChange('Meloetta-Pirouette', mon.battle.format, false, '[silent]');
		}
	}
	const unique = [...new Set(abilities.map(toID))].filter(ability => ability !== mon.ability);
	for (const old of runtime.abilities) if (!unique.includes(toID(old))) delete mon.volatiles[`ability:${old}`];
	runtime.abilities = unique;
	runtime.abilitiesPrepared = true;
	for (const ability of runtime.abilities) {
		const id = `ability:${ability}`;
		if (ability !== mon.ability && !mon.volatiles[id]) mon.volatiles[id] = mon.battle.initEffectState({ id, target: mon });
	}
}
export function blessingSwitchIn(mon: Pokemon) {
	if (spiralActive(mon) && !mon.m.rogueSpiralParticipated) { mon.m.rogueSpiralParticipated = true; gainSpiral(mon, 12); }
	if (!mon.battle.fantasyRogue) return;
	if (hasBlessing(mon, 'dogs') && petSpecies(savedBlessingMember(mon)?.set.species || mon.baseSpecies.name, 'dogs')) {
		const state = mon.battle.fantasyRogue;
		const team = mon.side.id === 'p1' ? state.team : state.duel?.team || [];
		const count = dogBoostCount(team), stats: BoostID[] = ['atk', 'def', 'spa', 'spd', 'spe'];
		const boosts: SparseBoostsTable = {};
		for (let i = 0; i < count; i++) boosts[stats.splice(mon.battle.random(stats.length), 1)[0]] = 1;
		if (count) mon.battle.boost(boosts, mon, mon, mon.battle.format);
	}
	if (railgunActive(mon)) {
		mon.addVolatile('magnetrise', mon, mon.battle.format);
		if (mon.volatiles.magnetrise) mon.volatiles.magnetrise.duration = 0;
		mon.battle.add('-message', '【某科学的超电磁炮】永久电磁漂浮；【电磁炮】升级为【超电磁炮】，威力与命中率翻倍。');
	}
	if (rulebreakerActive(mon)) mon.battle.add('-message', '【规则，就是用来打破的】破格伙伴无视能力下降、天气减益与对手的防护和属性免疫。');
	for (const companion of blessingEffects(mon)?.companions || []) if (!companion.away && companion.member === mon.set.fantasyRogueId && companion.ability) {
		mon.battle.add('-message', `${companionSource(companion.id)}${mon.name}获得额外特性【${mon.battle.dex.abilities.get(companion.ability).name}】。`);
	}
	if (mon.m.rogueCaptureRage) {
		mon.battle.boost(mon.m.rogueCaptureRage, mon, mon);
		delete mon.m.rogueCaptureRage;
	}
	const runtime = member(mon), team = side(mon);
	runtime.entries++; runtime.actions = 0;
	if (savedBlessingMember(mon)?.tonics?.wine) mon.addVolatile('confusion', mon, mon.battle.format);
	for (const move of runtime.inheritedSlots || []) if (!mon.moveSlots.some(slot => slot.id === move.id)) {
		mon.moveSlots.push({ ...move, disabled: false });
	}
	const slot = mon.getSlot();
	if (team.drops[slot]) { mon.battle.boost(team.drops[slot], mon); delete team.drops[slot]; }
	if (team.prayer && qualifiesPrayer(mon)) {
		runtime.prayer.atk += team.prayer.atk; runtime.prayer.spa += team.prayer.spa; delete team.prayer;
	}
	if (team.inheritance) {
		for (const move of team.inheritance) if (!mon.moveSlots.some(moveSlot => moveSlot.id === move.id)) {
			mon.moveSlots.push({ ...move, disabled: false, used: false }); runtime.inherited.push(move.id);
		}
		delete team.inheritance;
	}
	const seed = team.seeds[slot];
	if (seed && mon.addVolatile('leechseed', seed.source)) {
		Object.assign(mon.volatiles.leechseed, seed); delete team.seeds[slot];
	}
}
/** Queue the same normal stage boost for reserves until they next enter battle. */
export function failedTrainerCapture(battle: Battle) {
	if (!battle.fantasyRogue?.npcCapture || !hasBlessing(battle.p1.active[0], 'rocketcatch')) return;
	battle.add('-message', '捕捉失败让对手十分生气！对方全队各随机提升一项能力 2 级，后备成员登场时生效。');
	for (const mon of battle.p2.pokemon) {
		if (!mon.hp || mon.fainted) continue;
		const stat = battle.sample(['atk', 'def', 'spa', 'spd', 'spe'] as const);
		if (mon.isActive) battle.boost({ [stat]: 2 }, mon, mon);
		else {
			const boosts: Partial<BoostsTable> = mon.m.rogueCaptureRage ||= {};
			boosts[stat] = Math.min(6, (boosts[stat] || 0) + 2);
		}
	}
}
export function blessingLeave(mon: Pokemon, fainted = false) {
	if (!mon.battle.fantasyRogue) return;
	delete mon.m.rogueStatusLabels;
	const team = side(mon);
	member(mon).inheritedSlots = mon.moveSlots.filter(slot => member(mon).inherited.includes(slot.id)).map(slot => ({ ...slot }));
	if (mon.foes(true).some(foe => hasBlessing(foe, 'passdrops'))) {
		const drops: Partial<BoostsTable> = {};
		for (const key of Object.keys(mon.boosts) as BoostID[]) if (mon.boosts[key] < 0) drops[key] = mon.boosts[key];
		team.drops[mon.getSlot()] = drops;
	}
	const seed = mon.volatiles.leechseed;
	if (seed && hasBlessing(seed.source, 'seeds')) team.seeds[mon.getSlot()] = { source: seed.source, sourceSlot: seed.sourceSlot };
	if (!fainted) return;
	succeedDragonKing(mon);
	team.faintedTypes.push(...mon.getTypes());
	if (hasBlessing(mon, 'prayer') && qualifiesPrayer(mon) && !mon.species.isMega) team.prayer = {
		atk: Math.floor(mon.getStat('atk', true) / 3), spa: Math.floor(mon.getStat('spa', true) / 3),
	};
	if (hasBlessing(mon, 'inheritmoves')) {
		const ids = new Set([mon.baseMoveSlots[0]?.id, ...member(mon).inherited]);
		team.inheritance = mon.moveSlots.filter(slot => ids.has(slot.id)).map(slot => ({ ...slot }));
	}
}
export function blessingKO(battle: Battle, target: Pokemon, source?: Pokemon | null) {
	if (!battle.fantasyRogue) return;
	blessingLeave(target, true);
	if (!source || source.side === target.side) return;
	const progress = battle.fantasyRogue.blessingProgress ||= { kos: [], swords: 0, insight: {} };
	const id = target.set.fantasyRogueId!;
	const lossKey = `${battle.fantasyRogue.encounterId}:${target.set.fantasyRogueId}`;
	const defeats = side(source).psychicDefeats ||= [];
	if (!defeats.includes(id) && !battle.fantasyRogue.blessingDefeated?.includes(id)) {
		defeats.push(id); gainBattlePsychic(source, 4); gainSpiral(source, 9);
		if (hasBlessing(source, 'hpgrowth')) {
			member(source).bonusHP = (member(source).bonusHP || 0) + 2;
			source.baseMaxhp += 2; source.baseStoredStats.hp += 2;
			const gain = source.volatiles.dynamax ? 4 : 2;
			source.maxhp += gain;
			if (source.hp) source.hp += gain;
			(source.set.fantasyRogueModifiers ||= {}).hp = (source.set.fantasyRogueModifiers?.hp || 0) + 2;
			battle.add('-heal', source, source.getHealth, '[silent]');
		}
		if (hasBlessing(source, 'insight')) {
			const insight = member(source).insight; insight.points = Math.min(100, insight.points + insight.gain);
		}
	}
	if (hasBlessing(target, 'psychic') && !battle.fantasyRogue.blessingPsychicLosses?.includes(lossKey) &&
		!progress.psychicLosses?.includes(lossKey)) {
		(progress.psychicLosses ||= []).push(lossKey); gainBattlePsychic(target, 25);
	}
	if (source.side.id === 'p1' && !progress.kos.some(ko => ko.id === id) &&
		!battle.fantasyRogue.blessingDefeated?.includes(id)) {
		progress.kos.push({ id, member: source.set.fantasyRogueId! });
	}
}
export function blessingProgress(battle: Battle) {
	const progress = battle.fantasyRogue && (battle.fantasyRogue.blessingProgress ||= { kos: [], swords: 0, insight: {} });
	if (progress) for (const mon of battle.p1.pokemon) {
		if (spiralActive(mon)) (progress.spiral ||= {})[mon.set.fantasyRogueId!] = spiralPoints(mon);
		if (hasBlessing(mon, 'insight')) progress.insight[mon.set.fantasyRogueId!] = { ...member(mon).insight };
	}
	if (progress) progress.psychic = battle.fantasyRogue?.blessings?.psychic;
	return progress;
}
function gainBattlePsychic(mon: Pokemon, amount: number) {
	if (!hasBlessing(mon, 'psychic')) return;
	const effects = blessingEffects(mon)!;
	effects.psychic = addPsychicCharge(effects.psychic || 0, amount);
}
export function psychicCharge(mon: Pokemon | null) { return mon && hasBlessing(mon, 'psychic') ? blessingEffects(mon)?.psychic || 0 : undefined; }
export function eeveeZAvailable(mon: Pokemon | null | undefined) {
	return !!mon?.hp && !!hasBlessing(mon, 'eeveefamily') && mon.side.pokemon.length === 6 &&
		mon.side.pokemon.every(p => inBlessingFamily(p.baseSpecies.name, EEVEE_FAMILY)) && !member(mon).eeveeZUsed;
}
export function chooseRogueEeveeZ(player: Side) {
	const mon = player.active[player.choice.actions.length];
	if (player.requestState !== 'move' || !eeveeZAvailable(mon)) return player.emitChoiceError('当前不能使用家族的额外伊布 Z 招式。');
	return true;
}
export function spendRogueEeveeZ(mon: Pokemon) {
	if (!eeveeZAvailable(mon)) return false;
	member(mon).eeveeZUsed = true;
	return true;
}
export function chooseRoguePsychic(player: Side, target = '1') {
	const mon = player.active[player.choice.actions.length], loc = Number(target);
	if (player.requestState !== 'move' || !mon?.hp || (psychicCharge(mon) || 0) < 100 ||
		!Number.isInteger(loc) || loc < 1 || loc > player.foe.active.length || !player.foe.active[loc - 1]?.hp ||
		player.choice.actions.some(action => action.moveid === 'roguepsychicburst')) return player.emitChoiceError('灵能不足或目标不在场上。');
	player.choice.actions.push({ choice: 'move', pokemon: mon, moveid: 'roguepsychicburst', targetLoc: loc });
	return true;
}
export function spendRoguePsychic(mon: Pokemon) {
	if ((psychicCharge(mon) || 0) < 100) return false;
	blessingEffects(mon)!.psychic = 0;
	return true;
}
export function blessingDamage(damage: number, target: Pokemon, source: Pokemon | null, effect: Effect) {
	if (rulebreakerActive(target) && (effect?.effectType === 'Weather' ||
		['solarpower', 'dryskin'].includes(effect?.id) && target.battle.field.effectiveWeather())) return 0;
	if (!target.battle.fantasyRogue) return damage;
	if (['psn', 'tox'].includes(effect.id) && target.statusState.blessingToxic) damage *= 2;
	if (['stealthrock', 'spikes', 'gmaxsteelsurge'].includes(effect.id) && source && hasBlessing(source, 'hazards')) damage *= 2;
	const direct = effect.effectType === 'Move' || effect.id === 'confused';
	const runtime = member(target);
	const robeSave = awakeningLethal(damage, target, effect), spiralSave = robeSave === undefined ? spiralLethal(damage, target) : undefined;
	if (robeSave !== undefined) return robeSave;
	if (spiralSave !== undefined) return spiralSave;
	if (direct && damage >= target.hp) {
		if (hasBlessing(target, 'insight') && runtime.insight.points >= 100) {
			runtime.insight.points = 0; runtime.insight.gain++;
			target.battle.heal(target.maxhp, target, target, target.battle.format);
			target.battle.add('-message', `${target.name}领悟了生死，恢复全部 HP！`); return 0;
		}
		if ((savedBlessingMember(target)?.bond || 0) >= 100 && target.hp > 1 && !runtime.bondUsed && target.battle.randomChance(1, 10)) {
			runtime.bondUsed = true; target.battle.add('-message', '因为怕你担心，它挺住了这次攻击'); return target.hp - 1;
		}
		if (hasBlessing(target, 'survive') && !runtime.survived && target.side.pokemon.some(p => p.hp && !p.isActive)) {
			runtime.survived = true; target.switchFlag = true;
			target.battle.add('-message', `${target.name}留得青山在！`); return target.hp - 1;
		}
	}
	return Math.floor(damage);
}
export function blessingAfterAction(battle: Battle, source: Pokemon, move: ActiveMove) {
	if (!battle.fantasyRogue || move.rogueDelayed) return;
	const team = side(source);
	const targets = source.side.foe.pokemon.filter(target => move.rogueHitTargets?.includes(target.set.fantasyRogueId || target.getSlot()));
	if (hasBlessing(source, 'ascent') && !move.rogueLanding && battle.turn >= (source.m.rogueAscentReadyTurn || 0) &&
		move.flags.slicing && targets.length && source.hp && source.isActive &&
		!source.volatiles.smackdown && !source.volatiles.ingrain && !battle.field.getPseudoWeather('gravity')) {
		source.addVolatile('rogueascent', source, move);
	}
	if (hasBlessing(source, 'supercombo')) team.combo = targets.some(target => target.getMoveHitData(move).typeMod > 0) ? team.combo + 1 : 0;
	if (hasBlessing(source, 'style') && targets.length && !member(source).extraZ) {
		if (team.lastMove !== move.id) team.style = Math.min(6, team.style + 1);
		team.lastMove = move.id;
	}
	member(source).extraZ = false;
	if (hasBlessing(source, 'execute')) for (const target of targets) if (target.hp && target.hp / target.maxhp < Math.floor(source.maxhp / 100) * 0.05) {
		battle.add('-message', `${source.name}触发了处决！`); target.faint(source, move);
	}
	if (move.id === 'detect' && source.volatiles.protect && hasBlessing(source, 'detect')) member(source).detectReady = true;
	if (move.id === 'sacredsword' && hasBlessing(source, 'swords') && ['cobalion', 'terrakion', 'virizion'].includes(toID(source.baseSpecies.baseSpecies))) {
		const stat = battle.sample(['atk', 'def', 'spa', 'spd', 'spe'] as const);
		member(source).sword[stat] = (member(source).sword[stat] || 1) * 1.1;
		(battle.fantasyRogue.blessingProgress ||= { kos: [], swords: 0, insight: {} }).swords++;
	}
	const evo = blessingEffects(source)?.evolution;
	if (move.category !== 'Status' && evo?.type === move.type && targets.length) for (const extra of evo.extras) {
		if (['brn', 'par', 'frostbite'].includes(extra) && battle.randomChance(1, 2)) {
			for (const target of targets) if (target.hp) target.trySetStatus(extra === 'frostbite' ? 'fst' : extra, source, move);
		} else if (['atk', 'spa', 'spe'].includes(extra) && battle.randomChance(1, 2)) battle.boost({ [extra]: 1 }, source, source, move);
	}
	if (source.hp && hasBlessing(source, 'hoopa') && strongest(source, 'hoopa') && ['hyperspacehole', 'hyperspacefury'].includes(move.id) && !source.m.rogueHoopaCalling) {
		const banned = new Set(['assist', 'metronome', 'copycat', 'mirrormove', 'mefirst', 'sleeptalk', 'instruct', 'sketch', 'struggle', 'transform']);
		const pool = [...new Set(source.side.pokemon.flatMap(p => p.moveSlots.map(slot => slot.id)))].map(id => battle.dex.moves.get(id))
			.filter(m => m.exists && !banned.has(m.id) && !m.isZ && !m.isMax && !['hyperspacehole', 'hyperspacefury', 'roguepsychicburst'].includes(m.id));
		if (pool.length) {
			source.m.rogueHoopaCalling = true;
			try { battle.actions.useMove(battle.sample(pool), source); } finally { delete source.m.rogueHoopaCalling; }
		}
	}
}
export function blessingActionUsed(mon: Pokemon) { if (mon.battle.fantasyRogue) member(mon).actions++; }
export function blessingFirstChoice(mon: Pokemon) { return !!hasBlessing(mon, 'secondchoice') && member(mon).actions < 2; }
export function blessingExtraZ(mon: Pokemon) { return !!hasBlessing(mon, 'style') && side(mon).style >= 6; }
export function spendBlessingZ(mon: Pokemon) { side(mon).style = 0; member(mon).extraZ = true; }
export function blessingTypes(mon: Pokemon, types: string[]) {
	if (mon.battle.fantasyRogue && mon.set.fantasyRogueModifiers?.extraType && !mon.transformed) {
		types = [...new Set([types[0], mon.set.fantasyRogueModifiers.extraType])];
	}
	const type = mon.battle.fantasyRogue && emblemType(savedBlessingMember(mon)?.emblem || mon.item);
	if (type) types = [...new Set([types[0], type])];
	const tonics = savedBlessingMember(mon)?.tonics;
	return tonics?.wine && tonics.cephalosporin ? [...new Set([types[0], 'Ghost'])] : types;
}
export function blessingModifyStat(stat: number, mon: Pokemon, key: Exclude<StatID, 'hp'>) {
	if (!mon.battle.fantasyRogue) return stat;
	const card = mon.side.id === 'p1' && mon.battle.fantasyRogue.mentorCard;
	if (card) {
		const profile = mentorCardProfile(card, mon.battle.fantasyRogue.mentorTier);
		if (key === 'def' || key === 'spd') stat = mon.battle.modify(stat, 1 + profile.defense / 100);
		if (key === 'spe') stat = mon.battle.modify(stat, 1 + profile.speed / 100);
	}
	const runtime = member(mon), team = side(mon);
	if (key === 'atk' && spiralActive(mon)) stat *= 1 + spiralPoints(mon) / 1000;
	if (key === 'def' || key === 'spd') stat *= robeMultiplier(mon);
	if (key === 'spe' && hasBlessing(mon, 'speedpower')) stat *= 1.5;
	stat *= runtime.sword[key] || 1;
	if (key === 'atk' || key === 'spa') {
		stat = (stat + runtime.prayer[key]) * (1 + team.combo * 0.1);
		if (hasBlessing(mon, 'kid') && mon.hasItem('eviolite') && mon.species.evos.length) stat *= 1.3;
	}
	if ((key === 'def' || key === 'spd') && hasBlessing(mon, 'style')) stat *= 1 + team.style * 0.1;
	// runEvent applies its chained ability/item modifier only to integer relay values.
	return Math.floor(stat + 1e-9);
}
export function blessingEffectiveness(typeMod: number, target: Pokemon | null, type: string, move: ActiveMove) {
	if (!target) return typeMod;
	const source = target.battle.activePokemon;
	const attack = source && blessingEffects(source)?.evolution, defense = blessingEffects(target)?.evolution;
	if (attack?.type === move.type && attack.offense[type]) {
		// The first immunity upgrade makes that matchup neutral, not super effective.
		const immunity = target.battle.fantasyRogue?.spirit?.id !== 'malamar' && !target.battle.dex.getImmunity(move.type, type);
		typeMod += attack.offense[type] - (immunity ? 1 : 0);
	}
	if (defense?.type === type) typeMod += defense.defense[move.type] || 0;
	if (source && hasBlessing(source, 'meltan') && strongest(source, 'melmetal') && move.type === 'Steel') typeMod = Math.max(0, typeMod);
	return typeMod;
}
export const ROGUE_BLESSING_EVENTS: Partial<FormatData> = {
	onModifyBoost(boosts, pokemon) {
		if (rulebreakerActive(pokemon)) for (const stat of Object.keys(boosts) as BoostID[]) boosts[stat] = Math.max(0, boosts[stat] || 0);
	},
	onTryBoost(boosts, pokemon) {
		if (rulebreakerActive(pokemon)) for (const stat of Object.keys(boosts) as BoostID[]) if (boosts[stat]! < 0) delete boosts[stat];
	},
	onBeforeSwitchIn(pokemon) {
		if (pokemon.battle.fantasyRogue && pokemon.species.id === 'greninjafantasy' &&
			pokemon.hasItem('greninjaashz') && !pokemon.transformed) {
			pokemon.formeChange('Greninja-Ash-Fantasy', pokemon.battle.dex.items.get('greninjaashz'), true);
		}
		prepareBlessingMember(pokemon);
	},
	onBeforeSwitchOut(pokemon) { blessingLeave(pokemon); },
	onModifyAtk(atk, pokemon) { return blessingModifyStat(atk, pokemon, 'atk'); },
	onModifySpA(spa, pokemon) { return blessingModifyStat(spa, pokemon, 'spa'); },
	onModifyDef(def, pokemon) { return blessingModifyStat(def, pokemon, 'def'); },
	onModifySpD(spd, pokemon) { return blessingModifyStat(spd, pokemon, 'spd'); },
	onModifySpe(spe, pokemon) { return blessingModifyStat(spe, pokemon, 'spe'); },
	onModifyMove(move, pokemon) {
		if (pokemon.side.id === 'p2' && this.fantasyRogue?.escortCount) delete move.selfSwitch;
		empowerBloodMove(pokemon, move);
		if (move.id === 'zapcannon' && railgunActive(pokemon)) {
			Object.assign(move, { name: '超电磁炮' });
			if (typeof move.accuracy === 'number') move.accuracy *= 2;
		}
		if (rulebreakerActive(pokemon)) {
			move.ignoreNegativeOffensive = true;
			move.ignorePositiveDefensive = true;
			move.ignoreImmunity = true;
			move.ignoreAbility = true;
			move.infiltrates = true;
			delete move.flags.protect;
			const weather = this.field.effectiveWeather();
			if (['sunnyday', 'desolateland'].includes(weather) && ['thunder', 'hurricane'].includes(move.id)) {
				move.accuracy = this.dex.moves.get(move.id).accuracy;
			}
			if (['solarbeam', 'solarblade'].includes(move.id)) delete move.onBasePower;
			if (['synthesis', 'morningsun', 'moonlight'].includes(move.id) &&
				weather && !['sunnyday', 'desolateland', 'deltastream'].includes(weather)) {
				move.onHit = function (target) { if (!this.heal(target.baseMaxhp / 2)) return false; };
			}
		}
		if (pokemon.side.id === 'p2' && this.fantasyRogue?.wild) delete move.selfSwitch;
		if (hasBlessing(pokemon, 'topclearmind')) move.rogueTopClearMind = true;
		if (savedBlessingMember(pokemon)?.tonics?.wine && !member(pokemon).wineUsed) {
			member(pokemon).wineUsed = true;
			move.rogueWine = true;
		}
		if (move.category !== 'Status' && member(pokemon).detectReady) {
			move.willCrit = true;
			member(pokemon).detectReady = false;
		}
		if (move.id === 'roguepsychicburst') return;
		if (move.id === 'crushgrip' && pokemon.set.fantasyRogueId && hasBlessing(pokemon, 'regis')?.target === pokemon.set.fantasyRogueId) {
			move.secondaries ||= [];
			for (const status of ['fst', 'par']) if (!move.secondaries.some(s => s.status === status)) move.secondaries.push({ chance: 50, status });
			move.drain = [1, 2]; move.flags.heal = 1;
		}
		if (hasBlessing(pokemon, 'pivot') && move.category !== 'Status') move.selfSwitch = true;
		if (hasBlessing(pokemon, 'multihit') && move.multihit) move.multihit = typeof move.multihit === 'number' ? move.multihit * 2 : [move.multihit[0] * 2, move.multihit[1] * 2];
		if (hasBlessing(pokemon, 'coin') && move.category !== 'Status') {
			move.rogueCoin = hasBlessing(pokemon, 'dice') || this.randomChance(1, 2) ? 1.5 : 0.5;
			this.add('-message', `命运决定一切：${move.rogueCoin === 1.5 ? '正面，伤害 ×1.5' : '反面，伤害 ×0.5'}。`);
		}
		const evo = blessingEffects(pokemon)?.evolution;
		if (move.category !== 'Status' && evo?.type === move.type) {
			if (evo.extras.includes('accuracy') && !move.ohko) move.accuracy = true;
			if (evo.extras.includes('crit')) move.critRatio = (move.critRatio || 0) + 2;
			if (Object.keys(evo.offense).some(type => !this.dex.getImmunity(move.type, type) && evo.offense[type])) move.ignoreImmunity = true;
		}
		if (hasBlessing(pokemon, 'meltan') && strongest(pokemon, 'melmetal') && move.type === 'Electric' && pokemon.set.species.includes('Fantasy')) move.ignoreImmunity = true;
	},
	onBasePower(basePower, pokemon, target, move) {
		let result = basePower;
		for (const modifier of roguePowerModifiers(pokemon, move)) result = result * (modifier.factor || 1) + (modifier.add || 0);
		return Math.floor(result + 1e-9);
	},
	onModifyDamage(damage, source, target, move) {
		// Apply boosts before the lethal-damage hooks (Focus Sash / Sturdy). Fixed damage bypasses this event.
		damage = rogueEventDamage(damage, target, source, move);
		if (hasBlessing(source, 'explosionart') && ['selfdestruct', 'explosion'].includes(move.id)) damage *= 1.5;
		if (move.rogueBloodFactor) damage *= move.rogueBloodFactor;
		const ordinary = hasBlessing(source, 'ordinary');
		if (ordinary && source.side.pokemon.every(p => this.dex.species.get(savedBlessingMember(p)?.set.species || p.baseSpecies.name).bst <= 500)) {
			damage = damage * (110 + Math.max(1, Math.floor(ordinary.floor / 50)) * 5) / 100;
		}
		if (hasBlessing(source, 'lifepower')) damage = this.modify(damage, [5324, 4096]);
		if (hasBlessing(target, 'arsenal')) {
			const types = new Set(target.moveSlots.map(slot => this.dex.moves.get(slot.id))
				.filter(attack => attack.category !== 'Status').map(attack => attack.type));
			damage *= 1 - Math.min(1, types.size * 0.05);
		}
		if (move.rogueCoin) damage *= move.rogueCoin;
		if (hasBlessing(source, 'sound') && move.flags.sound) damage *= 1 + source.side.pokemon.reduce((n, p) => n + p.moveSlots.filter(slot => this.dex.moves.get(slot.id).flags.sound).length, 0) * 0.05;
		if (hasBlessing(target, 'weakness') && target.getMoveHitData(move).typeMod > 0) {
			let count = 0;
			for (const mon of target.side.pokemon) for (const type of this.dex.types.names()) if (this.dex.getImmunity(type, mon) && this.dex.getEffectiveness(type, mon) >= 2) count++;
			damage /= 1 + 0.1 * Math.min(10, count);
		}
		if (hasBlessing(target, 'starters') && starter(target)) damage *= 1 - 0.05 * target.side.pokemon.filter(starter).length;
		return Math.floor(damage);
	},
	onAfterMove(pokemon, target, move) { recordEvolutionMove(pokemon, move); blessingAfterAction(this, pokemon, move); },
	onAfterMoveSecondarySelf(source, target, move) {
		if (hasBlessing(source, 'lifepower') && source !== target && move.category !== 'Status' && !source.forceSwitchFlag) {
			this.damage(source.baseMaxhp / 10, source, source, this.dex.items.get('lifeorb'));
		}
	},
	onTakeItem(item, pokemon) { if (hasBlessing(pokemon, 'kid') && item.id === 'eviolite') return false; },
	onTryAddVolatile(status, pokemon) { if (status.id === 'choicelock' && blessingFirstChoice(pokemon)) return false; },
	onSetStatus(status, target) {
		if (savedBlessingMember(target)?.tonics?.cephalosporin && ['psn', 'tox', 'brn', 'par', 'slp', 'frz', 'fst'].includes(status.id)) return false;
	},
	onAfterSetStatus(status, target, source) { if (hasBlessing(source, 'toxic') && ['psn', 'tox'].includes(status.id)) target.statusState.blessingToxic = true; },
	onAfterUseItem(item, pokemon) {
		if (pokemon.battle.fantasyRogue && toID(savedBlessingMember(pokemon)?.set.item) === item.id) member(pokemon).consumed = item.id;
		if (item.id === 'airballoon' && consumeRogueItem(pokemon, item)) {
			pokemon.item = item.id;
			pokemon.itemState = this.initEffectState({ id: item.id, target: pokemon });
		}
	},
};
export function blessingHit(damage: number, target: Pokemon, source: Pokemon, move: ActiveMove) {
	if (!source.battle.fantasyRogue || !move || !Object.isExtensible(move) || damage <= 0 || target.side === source.side) return;
	const targets = move.rogueHitTargets ||= [], id = target.set.fantasyRogueId || target.getSlot();
	if (!targets.includes(id)) targets.push(id);
	if (move.id === 'crushgrip' && source.set.fantasyRogueId && hasBlessing(source, 'regis')?.target === source.set.fantasyRogueId && !move.hasSheerForce) {
		target.side.addSideCondition('stealthrock', source, move); target.side.addSideCondition('gmaxsteelsurge', source, move);
	}
}
export function blessingUpdate(battle: Battle) {
	if (!battle.fantasyRogue) return;
	for (const mon of battle.getAllActive()) if (mon.hp) {
		reportRogueStatuses(mon);
		awakeningUpdate(mon);
		const modifiers = mon.set.fantasyRogueModifiers;
		if (!modifiers?.statsType || mon.transformed) continue;
		const eligible = mon.getTypes().includes(modifiers.statsType);
		const key = `${mon.species.id}:${eligible}:${mon.item}`;
		if (mon.m.rogueTypeStats === key) continue;
		mon.m.rogueTypeStats = key;
		const stats = battle.spreadModify(mon.species.baseStats, { ...mon.set, species: mon.species.name,
			fantasyRogueModifiers: { ...modifiers, statsType: undefined, stats: eligible ? modifiers.stats : {} } });
		if (mon.species.maxHP) stats.hp = Math.floor((mon.species.maxHP + (mon.set.fantasyRogueStats?.hp || 0)) *
			(mon.set.fantasyRogueScale || 1) * (1 + (eligible ? modifiers.stats?.hp || 0 : 0))) + (modifiers.hp || 0);
		const change = (stats.hp - mon.baseMaxhp) * (mon.volatiles.dynamax ? 2 : 1);
		mon.baseMaxhp = stats.hp; mon.maxhp += change;
		mon.hp = Math.max(1, Math.min(mon.maxhp, mon.hp + change));
		mon.baseStoredStats = stats;
		for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) mon.storedStats[stat] = stats[stat];
		if (change) battle.add('-heal', mon, mon.getHealth, '[silent]');
	}
	for (const mon of battle.getAllActive()) if (mon.hp && hasBlessing(mon, 'lowhp')) {
		if (mon.hp >= mon.maxhp / 3) member(mon).low = false;
		else if (!member(mon).low) {
			member(mon).low = true; battle.boost({ atk: 1, spa: 1 }, mon, mon, battle.format);
		}
	}
}
export function extendBlessingEnvironment(battle: Battle, effect: string, source: Pokemon | null, state: { duration?: number }) {
	if (source && state.duration && blessingEffects(source)?.owned.some(b => b.family === 'overtime' && b.type === effect)) state.duration += 3;
}
