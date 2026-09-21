import { randomUUID } from 'crypto';
import { Battle } from '../../sim/battle';
import { Dex, toID } from '../../sim/dex';
import { ROGUE_FORMAT, ROGUE_STATS, type RoguePokemon } from '../../sim/fantasy-rogue';
import { experienceAtLevel, levelAtExperience, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import type { RogueRun } from './types';

/** RPG move/evolution data uses ordinary species, never the locked Fantasy move pool. */
const baseDex = Dex.mod('gen9');
const battleDex = Dex.mod('gen9fantasy');

export function createRoguePokemon(set: PokemonSet, boosts: StatsTable, id: string = randomUUID()): RoguePokemon {
	const battle = new Battle({ formatid: toID(ROGUE_FORMAT), deserialized: true });
	try {
		battle.setPlayer('p1', { name: 'Rogue', team: [{ ...structuredClone(set), fantasyRogueStats: { ...boosts } }] });
		const mon = battle.p1.pokemon[0];
		const normalized = structuredClone(mon.set);
		delete normalized.fantasyRogueStats;
		delete normalized.fantasyRogueId;
		const saved: RoguePokemon = {
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
		if (!mon.moveMemory.some(move => move.id === id)) mon.moveMemory.push({ id, pp: 0, maxpp: movePP(id) });
	}
	for (const slot of mon.pp) {
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

export function levelMoves(name: string) {
	const species = baseDex.species.get(name);
	const learnset = baseDex.species.getLearnsetData(species.id).learnset || {};
	const entries: { move: string, level: number, generation: number }[] = [];
	for (const [move, sources] of Object.entries(learnset)) {
		for (const source of sources) {
			const match = /^([1-9])L(\d+)$/.exec(source);
			if (match) entries.push({ move, generation: Number(match[1]), level: Number(match[2]) });
		}
	}
	const generation = Math.max(0, ...entries.map(entry => entry.generation));
	return entries.filter(entry => entry.generation === generation)
		.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
}

export function initializeExperience(mon: RoguePokemon) {
	mon.experience ??= experienceAtLevel(rogueSpeciesData(mon.set.species).growth, mon.set.level);
	mon.seenMoves ??= mon.set.moves.map(toID);
	ensureMemberMemory(mon);
}

/** Preserve damage, status, consumed items and PP. A stat rebuild cannot revive a fainted member. */
export function rebuildMember(mon: RoguePokemon, boosts: StatsTable) {
	ensureMemberMemory(mon);
	const rebuilt = createRoguePokemon(mon.set, boosts, mon.id);
	mon.hp = mon.hp > 0 ? Math.max(1, Math.min(rebuilt.maxhp, mon.hp + rebuilt.maxhp - mon.maxhp)) : 0;
	mon.maxhp = rebuilt.maxhp;
	mon.pp = rebuilt.pp.map(slot => ({
		...slot, pp: Math.min(slot.maxpp, mon.moveMemory!.find(old => old.id === slot.id)?.pp ?? slot.pp),
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
		if (mon.set.moves.length < 4) {
			mon.set.moves.push(entry.move);
			rebuildMember(mon, run.boosts);
			run.notices!.push(`${mon.set.species} 学会了 ${baseDex.moves.get(entry.move).name}。`);
		} else {
			(run.pendingMoves ||= []).push({ member: mon.id, move: entry.move });
		}
	}
}

export function evolutionOptions(mon: RoguePokemon): { species: string, item?: string }[] {
	const parent = baseDex.species.get(mon.set.species);
	return parent.evos.flatMap(name => {
		const child = baseDex.species.get(name);
		if (child.gender && mon.set.gender && child.gender !== mon.set.gender) return [];
		if (child.evoType === 'useItem') return [{ species: child.name, item: toID(child.evoItem) }];
		if (child.evoType === 'trade') return [{ species: child.name, item: 'linkingcord' }];
		if (!child.evoType && child.evoLevel && mon.set.level >= child.evoLevel) return [{ species: child.name }];
		return [];
	});
}

export function evolveMember(run: RogueRun, mon: RoguePokemon, name: string) {
	ensureMemberMemory(mon);
	const old = Dex.mod('gen9fantasy').species.get(mon.set.species);
	const next = Dex.mod('gen9fantasy').species.get(name);
	const slot = Object.entries(old.abilities).find(([, ability]) => ability === mon.set.ability)?.[0] || '0';
	mon.set.species = next.name;
	mon.set.name = next.name;
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
	const growth = rogueSpeciesData(mon.set.species).growth;
	const before = mon.experience!;
	mon.experience = Math.min(experienceAtLevel(growth, 100), before + amount);
	run.notices ||= [];
	if (mon.experience > before) run.notices.push(`${mon.set.species} 获得 ${mon.experience - before} 经验。`);
	const level = levelAtExperience(growth, mon.experience);
	const previousLevel = mon.set.level;
	if (level <= previousLevel) return;
	mon.set.level = level;
	rebuildMember(mon, run.boosts);
	run.notices.push(`${mon.set.species} 升到 Lv.${level}！`);
	offerMoves(run, mon, previousLevel + 1, level);
	for (let i = 0; i < 3; i++) {
		const automatic = evolutionOptions(mon).filter(option => !option.item);
		if (automatic.length !== 1) break;
		evolveMember(run, mon, automatic[0].species);
	}
}

export function experienceProgress(mon: RoguePokemon) {
	if (mon.experience === undefined) return null;
	const growth = rogueSpeciesData(mon.set.species).growth;
	const base = experienceAtLevel(growth, mon.set.level);
	const next = experienceAtLevel(growth, Math.min(100, mon.set.level + 1));
	return { current: mon.experience - base, needed: next - base, total: mon.experience };
}
