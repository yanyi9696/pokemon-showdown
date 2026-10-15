import type { Battle } from './battle';
import type { Pokemon } from './pokemon';
import type { FormatData } from './dex-formats';
import type { RoguePokemon } from './fantasy-rogue';
import { toID } from './dex';
import { ownsBlessing, emblemType, addPsychicCharge, EEVEE_FAMILY, inBlessingFamily, type BlessingEffects } from './rogue-blessing-data';
import type { Side } from './side';
import { reportRogueStatuses } from './fantasy-rogue-status';
import { consumeRogueItem } from './fantasy-rogue-items';
import { DRAGON_KING_ABILITIES, strongestDragon, type DragonKingAbility } from './rogue-blessing-permanent';

interface MemberRuntime {
	abilities: string[]; entries: number; actions: number; inherited: string[]; inheritedSlots?: Pokemon['moveSlots'];
	sword: Partial<StatsTable>; prayer: { atk: number, spa: number };
	low?: boolean; survived?: boolean; bondUsed?: boolean; detectTurn?: number; extraZ?: boolean;
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
	return mon.side.id === 'p1' ? state?.blessings : state?.duel?.blessings;
}
export const hasBlessing = (mon: Pokemon | null | undefined, family: string) =>
	mon ? ownsBlessing(blessingEffects(mon), family) : undefined;
export function savedBlessingMember(mon: Pokemon): RoguePokemon | undefined {
	const state = mon.battle.fantasyRogue;
	return (mon.side.id === 'p1' ? state?.team : state?.duel?.team)?.find(saved => saved.id === mon.set.fantasyRogueId);
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
/** The campaign king is immutable here; succession belongs only to this battle. */
export function battleDragonKing(player: Side) {
	const first = player.pokemon[0];
	if (!hasBlessing(first, 'dragonking')) return undefined;
	const runtime = side(first);
	if (!runtime.dragonKing) {
		const saved = blessingEffects(first)?.dragonKing;
		const available = player.pokemon.find(mon => mon.set.fantasyRogueId === saved?.member && mon.hp && !mon.fainted);
		const successor = available ? undefined : strongestDragon(player.pokemon.filter(mon => mon.hp && !mon.fainted)
			.map(savedBlessingMember).filter((mon): mon is RoguePokemon => !!mon));
		runtime.dragonKing = { member: available ? saved!.member : successor?.id || '',
			ability: available ? saved?.ability : undefined, token: 1,
			pending: !!(available || successor) && !(available && saved?.ability) };
	}
	return runtime.dragonKing;
}
export function dragonKingRequest(player: Side) {
	const king = battleDragonKing(player);
	if (!king?.member) return undefined;
	const pokemon = player.pokemon.find(mon => mon.set.fantasyRogueId === king.member)!;
	return { ...king, species: pokemon.species.name };
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
	player.battle.inputLog.push(`>${player.id} rogueking ${ability} ${king.token}`);
	king.ability = ability as DragonKingAbility; king.pending = false;
	const already = pokemon.hasAbility(ability);
	prepareBlessingMember(pokemon);
	player.battle.add('-message', `${pokemon.species.name}成为本场龙王，获得额外特性${ability === 'drizzle' ? '降雨' : '龙之呼吸'}。`);
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
	king.token++; king.pending = !!next;
	prepareBlessingMember(pokemon);
	if (next) pokemon.battle.add('-message', `${next.set.species}接任本场龙王，请选择额外特性。`);
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
	return stats.atk < 80 && stats.spa < 80;
}
export function prepareBlessingMember(mon: Pokemon) {
	if (!mon.battle.fantasyRogue) return;
	const runtime = member(mon), saved = savedBlessingMember(mon);
	const abilities = [...saved?.extraAbilities || []];
	for (const [family, ability] of [['hazards', 'yanbuzhen'], ['toxic', 'toxicdebris']]) {
		if (hasBlessing(mon, family)?.target === mon.set.fantasyRogueId) abilities.push(ability);
	}
	if (hasBlessing(mon, 'arsenal')) abilities.push('protean');
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
	for (const old of runtime.abilities) if (!abilities.includes(old)) delete mon.volatiles[`ability:${old}`];
	runtime.abilities = [...new Set(abilities)];
	for (const ability of runtime.abilities) {
		const id = `ability:${ability}`;
		if (ability !== mon.ability && !mon.volatiles[id]) mon.volatiles[id] = mon.battle.initEffectState({ id, target: mon });
	}
}
export function blessingSwitchIn(mon: Pokemon) {
	if (!mon.battle.fantasyRogue) return;
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
	if (hasBlessing(mon, 'prayer') && qualifiesPrayer(mon)) team.prayer = {
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
		defeats.push(id); gainBattlePsychic(source, 3);
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
		(progress.psychicLosses ||= []).push(lossKey); gainBattlePsychic(target, 20);
	}
	if (source.side.id === 'p1' && !progress.kos.some(ko => ko.id === id) &&
		!battle.fantasyRogue.blessingDefeated?.includes(id)) {
		progress.kos.push({ id, member: source.set.fantasyRogueId! });
	}
}
export function blessingProgress(battle: Battle) {
	const progress = battle.fantasyRogue?.blessingProgress;
	if (progress) for (const mon of battle.p1.pokemon) progress.insight[mon.set.fantasyRogueId!] = { ...member(mon).insight };
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
	player.choice.actions.push({ choice: 'move', pokemon: mon, moveid: 'rogueevoboost', targetLoc: 0 });
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
	if (!target.battle.fantasyRogue) return damage;
	if (['psn', 'tox'].includes(effect.id) && target.statusState.blessingToxic) damage *= 2;
	if (['stealthrock', 'spikes', 'gmaxsteelsurge'].includes(effect.id) && source && hasBlessing(source, 'hazards')) damage *= 2;
	const direct = effect.effectType === 'Move' || effect.id === 'confused';
	const runtime = member(target);
	if (direct && damage >= target.hp) {
		if (hasBlessing(target, 'insight') && runtime.insight.points >= 100) {
			runtime.insight.points = 0; runtime.insight.gain++;
			target.battle.heal(target.maxhp, target, target, target.battle.format);
			target.battle.add('-message', `${target.name}领悟了生死，恢复全部 HP！`); return 0;
		}
		if (hasBlessing(target, 'survive') && !runtime.survived && target.side.pokemon.some(p => p.hp && !p.isActive)) {
			runtime.survived = true; target.switchFlag = true;
			target.battle.add('-message', `${target.name}留得青山在！`); return target.hp - 1;
		}
		if ((savedBlessingMember(target)?.bond || 0) >= 100 && target.hp > 1 && !runtime.bondUsed && target.battle.randomChance(1, 10)) {
			runtime.bondUsed = true; target.battle.add('-message', `${target.name}凭借羁绊挺住了！`); return target.hp - 1;
		}
	}
	return Math.floor(damage);
}
export function blessingAfterAction(battle: Battle, source: Pokemon, move: ActiveMove) {
	if (!battle.fantasyRogue || move.rogueDelayed) return;
	const team = side(source);
	const targets = source.side.foe.pokemon.filter(target => move.rogueHitTargets?.includes(target.set.fantasyRogueId || target.getSlot()));
	if (hasBlessing(source, 'ascent') && move.flags.slicing && targets.length && source.hp && source.isActive &&
		!source.volatiles.smackdown && !source.volatiles.ingrain && !battle.field.getPseudoWeather('gravity')) {
		source.addVolatile('rogueascent', source, move);
	}
	if (hasBlessing(source, 'supercombo')) team.combo = targets.some(target => target.getMoveHitData(move).typeMod > 0) ? team.combo + 1 : 0;
	if (hasBlessing(source, 'style') && targets.length && !member(source).extraZ) {
		if (team.lastMove !== move.id) team.style = Math.min(6, team.style + 1);
		team.lastMove = move.id;
	}
	member(source).extraZ = false;
	if (hasBlessing(source, 'execute')) for (const target of targets) if (target.hp && target.hp / target.maxhp < Math.floor(source.maxhp / 100) * 0.04) {
		battle.add('-message', `${source.name}触发了处决！`); target.faint(source, move);
	}
	if (move.id === 'detect' && source.volatiles.protect) member(source).detectTurn = battle.turn + 1;
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
	const type = mon.battle.fantasyRogue && emblemType(mon.item);
	if (type) types = [...new Set([types[0], type])];
	const tonics = savedBlessingMember(mon)?.tonics;
	return tonics?.wine && tonics.cephalosporin ? [...new Set([types[0], 'Ghost'])] : types;
}
export function blessingModifyStat(stat: number, mon: Pokemon, key: Exclude<StatID, 'hp'>) {
	if (!mon.battle.fantasyRogue) return stat;
	const runtime = member(mon), team = side(mon);
	if (key === 'spe' && hasBlessing(mon, 'speedpower')) stat *= 1.5;
	stat *= runtime.sword[key] || 1;
	if (key === 'atk' || key === 'spa') {
		stat = (stat + runtime.prayer[key]) * (1 + team.combo * 0.1);
		if (hasBlessing(mon, 'kid') && mon.hasItem('eviolite') && mon.species.evos.length) stat *= 1.3;
	}
	if ((key === 'def' || key === 'spd') && hasBlessing(mon, 'style')) stat *= 1 + team.style * 0.1;
	return stat;
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
	onBeforeSwitchIn(pokemon) { prepareBlessingMember(pokemon); },
	onBeforeSwitchOut(pokemon) { blessingLeave(pokemon); },
	onModifyAtk(atk, pokemon) { return blessingModifyStat(atk, pokemon, 'atk'); },
	onModifySpA(spa, pokemon) { return blessingModifyStat(spa, pokemon, 'spa'); },
	onModifyDef(def, pokemon) { return blessingModifyStat(def, pokemon, 'def'); },
	onModifySpD(spd, pokemon) { return blessingModifyStat(spd, pokemon, 'spd'); },
	onModifySpe(spe, pokemon) { return blessingModifyStat(spe, pokemon, 'spe'); },
	onModifyPriority(priority, pokemon) { if (hasBlessing(pokemon, 'topclearmind')) return priority + 1; },
	onModifyMove(move, pokemon) {
		if (savedBlessingMember(pokemon)?.tonics?.wine && !member(pokemon).wineUsed) {
			member(pokemon).wineUsed = true;
			move.rogueWine = true;
		}
		if (move.id === 'roguepsychicburst') return;
		if (move.id === 'crushgrip' && hasBlessing(pokemon, 'regis')?.target === pokemon.set.fantasyRogueId) {
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
		if (hasBlessing(pokemon, 'detect') && member(pokemon).detectTurn === this.turn) move.critRatio = (move.critRatio || 0) + 2;
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
		if (move.rogueWine) result *= 2;
		if (move.type === 'Poison' && savedBlessingMember(pokemon)?.tonics?.poison) result *= 1.5;
		if (move.rogueLanding) result *= 1.2;
		if (hasBlessing(pokemon, 'speedpower')) result *= 1 + pokemon.getStat('spe') / 10000;
		if (move.id === 'bugbuzz' && hasBlessing(pokemon, 'bugchoir')) result += 10 * pokemon.side.pokemon.reduce((n, p) => n + p.moveSlots.filter(slot => slot.id === 'bugbuzz').length, 0);
		if (hasBlessing(pokemon, 'entrance')) result *= 1 + member(pokemon).entries * 0.05;
		if (hasBlessing(pokemon, 'hoopa') && strongest(pokemon, 'hoopa') && ['Dark', 'Ghost'].includes(move.type)) result *= 1.5;
		for (const b of blessingEffects(pokemon)?.owned || []) if (b.family === 'typelink' && b.type === move.type) result *= side(pokemon).faintedTypes.includes(b.type) ? 1.5 : 1.3;
		const evo = blessingEffects(pokemon)?.evolution;
		if (evo?.type === move.type) result *= 1 + evo.power;
		return result;
	},
	onModifyDamage(damage, source, target, move) {
		if (hasBlessing(source, 'lifepower')) damage = this.modify(damage, [5324, 4096]);
		if (hasBlessing(target, 'arsenal')) {
			const types = new Set(target.moveSlots.map(slot => this.dex.moves.get(slot.id))
				.filter(attack => attack.category !== 'Status').map(attack => attack.type));
			damage *= 1 - Math.min(1, types.size * 0.05);
		}
		if (move.rogueCoin) damage *= move.rogueCoin;
		if (hasBlessing(source, 'sound') && move.flags.sound) damage *= 1 + source.side.pokemon.reduce((n, p) => n + p.moveSlots.filter(slot => this.dex.moves.get(slot.id).flags.sound).length, 0) * 0.04;
		if (hasBlessing(target, 'weakness') && target.getMoveHitData(move).typeMod > 0) {
			let count = 0;
			for (const mon of target.side.pokemon) for (const type of this.dex.types.names()) if (this.dex.getImmunity(type, mon) && this.dex.getEffectiveness(type, mon) >= 2) count++;
			damage /= 1 + 0.1 * Math.min(10, count);
		}
		if (hasBlessing(target, 'starters') && starter(target)) damage *= 1 - 0.05 * target.side.pokemon.filter(starter).length;
		return Math.floor(damage);
	},
	onAfterMove(pokemon, target, move) { blessingAfterAction(this, pokemon, move); },
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
	if (move.id === 'crushgrip' && hasBlessing(source, 'regis')?.target === source.set.fantasyRogueId && !move.hasSheerForce) {
		target.side.addSideCondition('stealthrock', source, move); target.side.addSideCondition('gmaxsteelsurge', source, move);
	}
}
export function blessingUpdate(battle: Battle) {
	if (!battle.fantasyRogue) return;
	for (const mon of battle.getAllActive()) if (mon.hp) {
		reportRogueStatuses(mon);
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
	for (const mon of battle.getAllActive()) if (mon.hp && mon.hp < mon.maxhp / 3 && hasBlessing(mon, 'lowhp') && !member(mon).low) {
		member(mon).low = true; battle.boost({ atk: 1, spa: 1 }, mon, mon, battle.format);
	}
}
export function extendBlessingEnvironment(battle: Battle, effect: string, source: Pokemon | null, state: { duration?: number }) {
	if (source && state.duration && blessingEffects(source)?.owned.some(b => b.family === 'overtime' && b.type === effect)) state.duration += 3;
}
