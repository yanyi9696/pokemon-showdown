import { Dex, toID } from '../../sim/dex';
import { ROGUE_STATS, type RoguePokemon } from '../../sim/fantasy-rogue';
import { blessingLearnChoices } from './blessings';
import { ensureMemberMemory, rememberMove, rebuildMember } from './progression';
import { recordStarterMoves } from './starter-traits';
import type { RogueAccount, RogueContent, RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
export const FREE_TUTOR_MOVES = new Set(['grasspledge', 'firepledge', 'waterpledge', 'steelbeam', 'dracometeor',
	'blastburn', 'frenzyplant', 'hydrocannon', 'secretsword', 'dragonascent']);
const tutorCache = new Map<string, Set<string>>();
export function teachingMoves(mon: RoguePokemon, tutorOnly = false) {
	const legal = blessingLearnChoices(mon);
	if (!tutorOnly) return legal;
	const species = dex.species.get(mon.set.species);
	if (!tutorCache.has(species.id)) {
		const ids = new Set(FREE_TUTOR_MOVES);
		for (const data of dex.species.getFullLearnset(species.id)) {
			for (const [id, sources] of Object.entries(data.learnset)) {
				if (sources.some(source => /^[1-9]T/.test(source))) ids.add(id);
			}
		}
		tutorCache.set(species.id, ids);
	}
	return legal.filter(id => tutorCache.get(species.id)!.has(id));
}
export function hasFantasyMove(run: RogueRun) {
	return run.team.some(mon => [...mon.set.moves, ...mon.moveMemory?.map(slot => slot.id) || []].some(id => {
		const move = dex.moves.get(id);
		return move.exists && !move.isZ && !move.isMax && !move.id.startsWith('rogue') && !Dex.mod('gen9').moves.get(id).exists;
	}));
}
export function teachMove(
	account: RogueAccount, run: RogueRun, content: RogueContent, mon: RoguePokemon, move: string
) {
	if (!teachingMoves(mon).includes(move)) {
		throw new Error('这位伙伴不能学习该招式，或已经掌握。');
	}
	rememberMove(mon, move);
	(mon.seenMoves ||= []).push(move);
	recordStarterMoves(account, content, { ...mon.set, moves: [move] });
	(run.notices ||= []).push(`${mon.set.species} 学会了 ${dex.moves.get(move).name}。`);
}
export const effortTotal = (mon: RoguePokemon) => ROGUE_STATS.reduce((sum, stat) => sum + mon.set.evs[stat], 0);
export function allocateEffort(run: RogueRun, mon: RoguePokemon, evs: StatsTable | undefined, extra = 0) {
	if (!evs || Object.keys(evs).length !== 6 || !ROGUE_STATS.every(stat => Number.isInteger(evs[stat]) &&
		evs[stat] >= (extra ? mon.set.evs[stat] : 0) && evs[stat] <= 252) ||
		ROGUE_STATS.reduce((sum, stat) => sum + evs[stat], 0) !== Math.min(510, effortTotal(mon) + extra)) {
		throw new Error('请分配全部可用努力值；单项最多 252，总计最多 510，新增奖励不能减少已有点数。');
	}
	const ratio = mon.hp / mon.maxhp;
	mon.set.evs = { ...evs };
	if (mon.evRespec) mon.evRespec.total = effortTotal(mon);
	rebuildMember(mon, run.boosts);
	mon.hp = ratio ? Math.max(1, Math.floor(mon.maxhp * ratio)) : 0;
}

/** Full legal set for form conversion, including already known moves. */
export function legalFormMoves(species: string) {
	return blessingLearnChoices({ set: { species, moves: [] }, moveMemory: [] } as unknown as RoguePokemon);
}
export function clearIllegalMoves(mon: RoguePokemon, legal: Set<string>) {
	ensureMemberMemory(mon);
	mon.set.moves = mon.set.moves.filter(id => legal.has(toID(id)));
	mon.pp = mon.pp.filter(slot => legal.has(slot.id));
	mon.moveMemory = mon.moveMemory!.filter(slot => legal.has(slot.id));
	mon.seenMoves = mon.seenMoves?.filter(id => legal.has(toID(id)));
}
