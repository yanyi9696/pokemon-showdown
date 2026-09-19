import { randomUUID } from 'crypto';
import { Battle } from '../../sim/battle';
import { Dex, toID } from '../../sim/dex';
import { ROGUE_FORMAT, type RoguePokemon } from '../../sim/fantasy-rogue';
import { experienceAtLevel, levelAtExperience, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import type { RogueRun } from './types';

/** RPG move/evolution data uses ordinary species, never the locked Fantasy move pool. */
const baseDex = Dex.mod('gen9');

export function createRoguePokemon(set: PokemonSet, boosts: StatsTable, id: string = randomUUID()): RoguePokemon {
	const battle = new Battle({ formatid: toID(ROGUE_FORMAT), deserialized: true });
	try {
		battle.setPlayer('p1', { name: 'Rogue', team: [{ ...structuredClone(set), fantasyRogueStats: { ...boosts } }] });
		const mon = battle.p1.pokemon[0];
		const normalized = structuredClone(mon.set);
		delete normalized.fantasyRogueStats;
		delete normalized.fantasyRogueId;
		return {
			id, set: normalized, hp: mon.maxhp, maxhp: mon.maxhp, status: '', statusState: {},
			pp: mon.moveSlots.map(slot => ({ id: slot.id, pp: slot.pp, maxpp: slot.maxpp })),
		};
	} finally { battle.destroy(); }
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
}

/** Preserve damage, status, consumed items and PP. A stat rebuild cannot revive a fainted member. */
export function rebuildMember(mon: RoguePokemon, boosts: StatsTable) {
	const rebuilt = createRoguePokemon(mon.set, boosts, mon.id);
	mon.hp = mon.hp > 0 ? Math.max(1, Math.min(rebuilt.maxhp, mon.hp + rebuilt.maxhp - mon.maxhp)) : 0;
	mon.maxhp = rebuilt.maxhp;
	mon.pp = rebuilt.pp.map(slot => ({
		...slot, pp: Math.min(slot.maxpp, mon.pp.find(old => old.id === slot.id)?.pp ?? slot.pp),
	}));
}

function offerMoves(run: RogueRun, mon: RoguePokemon, from: number, to: number) {
	for (const entry of levelMoves(mon.set.species)) {
		if (entry.level < from || entry.level > to || mon.seenMoves!.includes(entry.move)) continue;
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
	const old = Dex.mod('gen9fantasy').species.get(mon.set.species);
	const next = Dex.mod('gen9fantasy').species.get(name);
	const slot = Object.entries(old.abilities).find(([, ability]) => ability === mon.set.ability)?.[0] || '0';
	mon.set.species = next.name;
	mon.set.name = next.name;
	mon.set.ability = next.abilities[slot as '0'] || next.abilities[0];
	run.notices ||= [];
	run.notices.push(`${old.name} 进化为 ${next.name}！`);
	rebuildMember(mon, run.boosts);
	// Include evolution moves and the new species' level-up moves through the current level.
	offerMoves(run, mon, 0, mon.set.level);
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
