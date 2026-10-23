import { randomUUID } from 'crypto';
import { Battle } from '../../sim/battle';
import { Dex, toID } from '../../sim/dex';
import { ROGUE_FORMAT, ROGUE_STATS, type RoguePokemon } from '../../sim/fantasy-rogue';
import { experienceAtLevel, levelAtExperience, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import type { RogueRun } from './types';
import { GHOLDENGO_EVOLUTION_COINS, partyEvolutions } from './party-evolution';
import { compoundEvolutionAllowed } from '../../sim/rogue-compound';
import { rogueStarScale } from '../../sim/fantasy-rogue-spirits';
import { roguePartyLimit } from '../../sim/fantasy-rogue-spirits';

/** RPG move/evolution data uses ordinary species, never the locked Fantasy move pool. */
const baseDex = Dex.mod('gen9');
const battleDex = Dex.mod('gen9fantasy');

export function createRoguePokemon(set: PokemonSet, boosts: StatsTable, id: string = randomUUID(), stars = 1,
	modifiers?: RoguePokemon['statModifiers']): RoguePokemon {
	const battle = new Battle({ formatid: toID(ROGUE_FORMAT), deserialized: true });
	try {
		battle.setPlayer('p1', { name: 'Rogue', team: [{ ...structuredClone(set), fantasyRogueStats: { ...boosts },
			fantasyRogueScale: rogueStarScale(stars), fantasyRogueModifiers: modifiers }] });
		const mon = battle.p1.pokemon[0];
		const normalized = structuredClone(mon.set);
		delete normalized.fantasyRogueStats;
		delete normalized.fantasyRogueScale;
		delete normalized.fantasyRogueId;
		delete normalized.fantasyRogueModifiers;
		const saved: RoguePokemon = {
			...(stars > 1 ? { stars } : {}),
			id, set: normalized, hp: mon.maxhp, maxhp: mon.maxhp, status: '', statusState: {},
			pp: mon.moveSlots.map(slot => ({ id: slot.id, pp: slot.pp, maxpp: slot.maxpp })),
			stats: { ...mon.baseStoredStats, hp: mon.maxhp },
		};
		ensureMemberMemory(saved);
		return saved;
	} finally { battle.destroy(); }
}

function movePP(id: string) {
	return battleDex.moves.get(id).pp;
}

/** Remove legacy PP Ups without refunding uses already spent. Safe to apply repeatedly. */
function normalizePP(slot: RoguePokemon['pp'][number]) {
	const maxpp = movePP(slot.id);
	slot.pp = Math.max(0, Math.min(maxpp, slot.pp - Math.max(0, slot.maxpp - maxpp)));
	slot.maxpp = maxpp;
}

/** Older saves remember seen moves; unknown historical PP starts at zero until healing. */
export function ensureMemberMemory(mon: RoguePokemon) {
	mon.moveMemory ||= [];
	for (const slot of [...mon.pp, ...mon.moveMemory]) normalizePP(slot);
	for (const id of [...new Set([...(mon.seenMoves || []), ...mon.set.moves].map(toID))]) {
		if ((mon.blessingMoves?.includes(id) || mon.blessingPP?.some(move => move.id === id)) &&
			!mon.moveMemory.some(move => move.id === id)) continue;
		if (!mon.moveMemory.some(move => move.id === id)) mon.moveMemory.push({ id, pp: 0, maxpp: movePP(id) });
	}
	for (const slot of mon.pp) {
		if ((mon.blessingMoves?.includes(slot.id) || mon.blessingPP?.some(move => move.id === slot.id)) &&
			!mon.moveMemory.some(move => move.id === slot.id)) {
			mon.blessingPP ||= [];
			const borrowed = mon.blessingPP.find(move => move.id === slot.id);
			if (borrowed) Object.assign(borrowed, slot);
			else mon.blessingPP.push({ ...slot });
			continue;
		}
		const saved = mon.moveMemory.find(move => move.id === slot.id);
		if (saved) Object.assign(saved, slot);
		else mon.moveMemory.push({ ...slot });
	}
	mon.abilityPool ||= [];
	const ability = toID(mon.set.ability);
	if (!mon.abilityPool.some(entry => entry.id === ability)) {
		mon.abilityPool.push({ id: ability, hidden: toID(battleDex.species.get(mon.set.species).abilities.H) === ability });
	}
}

export function rememberMove(mon: RoguePokemon, id: string) {
	ensureMemberMemory(mon);
	id = toID(id);
	if (!mon.moveMemory!.some(move => move.id === id)) {
		mon.moveMemory!.push({ id, pp: movePP(id), maxpp: movePP(id) });
	}
}

export function levelMoves(name: string): { move: string, level: number, generation: number }[] {
	if (toID(name) === 'kyuremoriginal') return ['Kyurem', 'Reshiram', 'Zekrom'].flatMap(levelMoves)
		.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
	const species = baseDex.species.get(name);
	if (!species.exists) {
		const fantasy = battleDex.species.get(name);
		if (!fantasy.exists || !fantasy.name.endsWith('-Fantasy')) return [];
		// Preserve regional forms. Custom/TM moves still require their own teaching route.
		const ordinary = [fantasy.name.replace(/-Fantasy$/, ''), fantasy.changesFrom, fantasy.baseSpecies]
			.find(candidate => candidate && baseDex.species.get(candidate).exists);
		if (!ordinary) return [];
		const legal = new Set(battleDex.species.getFullLearnset(fantasy.id)
			.flatMap(data => Object.keys(data.learnset || {})));
		return levelMoves(ordinary).filter(entry => legal.has(entry.move));
	}
	const learnsetData = baseDex.species.getLearnsetData(species.id);
	let learnset = learnsetData.learnset;
	if (!learnset && species.baseSpecies !== species.name) {
		return levelMoves(species.changesFrom || species.baseSpecies);
	}
	learnset ||= {};
	const entries: { move: string, level: number, generation: number }[] = [];
	for (const [move, sources] of Object.entries(learnset)) {
		for (const source of sources) {
			const match = /^([1-9])L(\d+)$/.exec(source);
			if (match) entries.push({ move, generation: Number(match[1]), level: Number(match[2]) });
		}
	}
	// Some stable forms only list additional event sources here and inherit all
	// ordinary level-up moves from their base form (for example Super Pumpkaboo).
	if (!entries.length && !learnsetData.eventOnly && species.baseSpecies !== species.name) {
		return levelMoves(species.changesFrom || species.baseSpecies);
	}
	if (species.changesFrom && species.changesFrom !== species.name) {
		entries.push(...levelMoves(species.changesFrom));
	}
	const generation = Math.max(0, ...entries.map(entry => entry.generation));
	return entries.filter(entry => entry.generation === generation)
		.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
}

export function initializeExperience(mon: RoguePokemon) {
	mon.experience ??= experienceAtLevel(rogueSpeciesData(mon.fusion?.first.set.species || mon.set.species).growth, mon.set.level);
	mon.seenMoves ??= mon.set.moves.map(toID);
	rememberPastLevelMoves(mon);
}

/** Seed acquired partners and repair old saves, without equipping moves or refunding spent PP. */
export function rememberPastLevelMoves(mon: RoguePokemon) {
	ensureMemberMemory(mon);
	if (mon.egg || mon.fusion) return;
	const legal = new Set(battleDex.species.getFullLearnset(toID(mon.set.species))
		.flatMap(data => Object.keys(data.learnset || {})));
	const seen = new Set((mon.seenMoves || mon.set.moves).map(toID));
	for (const { move, level } of levelMoves(mon.set.species)) {
		if (level > mon.set.level || !legal.has(move)) continue;
		if (!mon.moveMemory!.some(slot => slot.id === move)) {
			// A temporarily unavailable form move or borrowed move may already have spent PP.
			const previous = mon.formMoveMemory?.find(slot => slot.id === move) ||
				mon.blessingPP?.find(slot => slot.id === move) || mon.pp.find(slot => slot.id === move);
			const slot = previous ? { ...previous } : { id: move, pp: movePP(move), maxpp: movePP(move) };
			normalizePP(slot);
			mon.moveMemory!.push(slot);
		}
		seen.add(toID(move));
	}
	mon.seenMoves = [...seen];
}

/** The campaign party remains the battle-start snapshot until settlement. Escape commits resources only. */
export function escapedMember(original: RoguePokemon, current: RoguePokemon): RoguePokemon {
	const restored = structuredClone(original);
	// Remove HP gained with a temporary stack as well as its max HP; keep the actual damage taken.
	restored.hp = current.hp > 0 ? Math.max(1, Math.min(original.maxhp,
		original.maxhp - (current.maxhp - current.hp))) : 0;
	restored.set.item = current.set.item;
	restored.pp = original.pp.map(slot => ({ ...slot,
		pp: Math.min(slot.maxpp, current.pp.find(move => move.id === slot.id)?.pp ?? slot.pp),
	}));
	restored.status = current.status;
	restored.evolutionProgress = structuredClone(current.evolutionProgress || original.evolutionProgress);
	restored.statusState = structuredClone(current.statusState);
	restored.statuses = current.statuses && structuredClone(current.statuses);
	ensureMemberMemory(restored);
	return restored;
}

/** Preserve damage, status, consumed items and PP. A stat rebuild cannot revive a fainted member. */
export function rebuildMember(mon: RoguePokemon, boosts: StatsTable) {
	if (mon.compound) {
		mon.set.ability = 'Power of Alchemy';
		mon.abilityPool = [{ id: 'powerofalchemy', hidden: false }];
	}
	ensureMemberMemory(mon);
	const rebuilt = createRoguePokemon(mon.set, boosts, mon.id, mon.stars, mon.statModifiers);
	mon.hp = mon.hp > 0 ? Math.max(1, Math.min(rebuilt.maxhp, mon.hp + rebuilt.maxhp - mon.maxhp)) : 0;
	mon.maxhp = rebuilt.maxhp;
	mon.pp = rebuilt.pp.map(slot => ({
		...slot, pp: Math.min(slot.maxpp, mon.moveMemory!.find(old => old.id === slot.id)?.pp ??
			mon.blessingPP?.find(old => old.id === slot.id)?.pp ?? slot.pp),
	}));
	mon.stats = rebuilt.stats;
	ensureMemberMemory(mon);
}

function offerMoves(run: RogueRun, mon: RoguePokemon, from: number, to: number) {
	for (const entry of levelMoves(mon.set.species)) {
		if (entry.level < from || entry.level > to || mon.seenMoves!.includes(entry.move)) continue;
		rememberMove(mon, entry.move);
		mon.seenMoves!.push(entry.move);
		if (mon.set.moves.some(move => toID(move) === entry.move)) continue;
		if (mon.set.moves.length < (run.blessings?.owned.some(entry => entry.family === 'learnall') ? 5 : 4)) {
			mon.set.moves.push(entry.move);
			rebuildMember(mon, run.boosts);
			run.notices!.push(`${mon.set.species} 学会了 ${baseDex.moves.get(entry.move).name}。`);
		} else {
			(run.pendingMoves ||= []).push({ member: mon.id, move: entry.move });
		}
	}
}

export function evolutionOptions(
	mon: RoguePokemon, run?: Pick<RogueRun, 'floor' | 'bag'>
): { species: string, item?: string }[] {
	return partyEvolutions(mon, run)
		.filter(entry => entry.requirements.every(condition => condition.met || condition.resource))
		.map(({ species, item }) => ({ species, ...(item ? { item } : {}) }));
}

export function evolveMember(run: RogueRun, mon: RoguePokemon, name: string) {
	if (mon.fusion) throw new Error('请先解除融合，再进行进化。');
	if (!compoundEvolutionAllowed(mon, name)) throw new Error('五号化合物已锁定其他进化方向。');
	if (toID(mon.set.species) === 'meltan' && toID(name) === 'melmetal') {
		if ((run.blessings?.candy || 0) < 400) throw new Error('需要 400 颗美录坦糖果。');
		run.blessings!.candy -= 400;
	}
	if (toID(name) === 'gholdengo' && ['gimmighoul', 'gimmighoulroaming'].includes(toID(mon.set.species))) {
		if (mon.set.level < 20 || run.money < GHOLDENGO_EVOLUTION_COINS) throw new Error(`进化需要等级 20 与 ${GHOLDENGO_EVOLUTION_COINS} 金币。`);
		run.money -= GHOLDENGO_EVOLUTION_COINS;
	}
	delete mon.evolutionNotice;
	initializeExperience(mon);
	const heldItem = partyEvolutions(mon, run).find(option => toID(option.species) === toID(name))?.heldItem;
	if (heldItem && toID(mon.set.item) === heldItem) mon.set.item = '';
	const old = Dex.mod('gen9fantasy').species.get(mon.set.species);
	const shedinja = old.id === 'nincada' && toID(name) === 'ninjask' &&
		run.team.length < roguePartyLimit(run.spirit, run.blessings) && (run.bag.pokeball || 0) > 0 ? structuredClone(mon) : undefined;
	const next = Dex.mod('gen9fantasy').species.get(name);
	const slot = Object.entries(old.abilities).find(([, ability]) => toID(ability) === toID(mon.set.ability))?.[0] || '0';
	mon.set.species = next.name;
	mon.set.name = next.name;
	if (next.gender) mon.set.gender = next.gender;
	mon.set.ability = next.abilities[slot as '0'] || next.abilities[0];
	mon.abilityPool = mon.abilityPool!.map(entry => {
		const oldSlot = Object.entries(old.abilities).find(([, ability]) => toID(ability) === entry.id)?.[0];
		const evolved = oldSlot && next.abilities[oldSlot as '0'];
		return evolved ? { id: toID(evolved), hidden: oldSlot === 'H' } : entry;
	}).filter((entry, index, entries) => entries.findIndex(other => other.id === entry.id) === index);
	run.notices ||= [];
	run.notices.push(`${old.name} 进化为 ${next.name}！`);
	rebuildMember(mon, run.boosts);
	// Include evolution moves and the new species' level-up moves through the current level.
	offerMoves(run, mon, 0, mon.set.level);
	if (shedinja) {
		run.bag.pokeball--;
		const moves = levelMoves('Shedinja').filter(entry => entry.level <= mon.set.level).slice(-4).map(entry => entry.move);
		const extra = createRoguePokemon({ ...shedinja.set, species: 'Shedinja', name: 'Shedinja',
			ability: 'Wonder Guard', gender: 'N', item: '', moves }, run.boosts, randomUUID(), shedinja.stars || 1, shedinja.statModifiers);
		extra.set.happiness = shedinja.set.happiness; extra.training = shedinja.training;
		run.team.push(extra); run.notices.push('蜕下的外壳悄悄进入了精灵球……额外获得脱壳忍者！');
	}
}

export function gainEffort(run: RogueRun, mon: RoguePokemon, yieldStats: StatsTable) {
	const evs = mon.set.evs;
	let total = ROGUE_STATS.reduce((sum, stat) => sum + evs[stat], 0);
	const gains: string[] = [];
	const labels = { hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' };
	for (const stat of ROGUE_STATS) {
		const amount = Math.max(0, Math.min(yieldStats[stat], 252 - evs[stat], 510 - total));
		if (!amount) continue;
		evs[stat] += amount; total += amount;
		gains.push(`${labels[stat]} +${amount}`);
	}
	if (gains.length) {
		if (mon.evRespec) mon.evRespec.total = total;
		rebuildMember(mon, run.boosts);
		(run.notices ||= []).push(`${mon.set.species} 获得努力值：${gains.join('、')}。`);
	}
}

export function gainExperience(run: RogueRun, mon: RoguePokemon, amount: number) {
	initializeExperience(mon);
	if (mon.fixedLevel) return;
	const growth = rogueSpeciesData(mon.fusion?.first.set.species || mon.set.species).growth;
	const before = mon.experience!;
	mon.experience = Math.min(experienceAtLevel(growth, mon.uncappedLevel ? 9999 : 100), before + amount);
	run.notices ||= [];
	if (mon.experience > before) run.notices.push(`${mon.set.species} 获得 ${mon.experience - before} 经验。`);
	const level = levelAtExperience(growth, mon.experience, mon.uncappedLevel ? 9999 : 100);
	const previousLevel = mon.set.level;
	if (level <= previousLevel) return;
	mon.set.level = level;
	rebuildMember(mon, run.boosts);
	run.notices.push(`${mon.set.species} 升到 Lv.${level}！`);
	offerMoves(run, mon, previousLevel + 1, level);
	if (partyEvolutions(mon, run).some(evo => evo.ready && !evo.item)) mon.evolutionNotice = true;
	// Evolution is always a separate, confirmed action outside battle, including chained evolutions.
}

export function experienceProgress(mon: RoguePokemon) {
	if (mon.experience === undefined) return null;
	const growth = rogueSpeciesData(mon.fusion?.first.set.species || mon.set.species).growth;
	const base = experienceAtLevel(growth, mon.set.level);
	const next = experienceAtLevel(growth, Math.min(mon.uncappedLevel ? 9999 : 100, mon.set.level + 1));
	return { current: mon.experience - base, needed: next - base, total: mon.experience,
		// Server-authored thresholds let the client preview every growth group without duplicating formulas.
		levels: Array.from({ length: mon.uncappedLevel ? Math.min(9999, mon.set.level + 100) : 100 }, (_, index) => experienceAtLevel(growth, index + 1)),
	};
}
