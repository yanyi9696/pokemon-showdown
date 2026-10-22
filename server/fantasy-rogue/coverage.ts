import { Dex } from '../../sim/dex';
import { permanentMemberTypes } from '../../sim/rogue-blessing-permanent';
import { machineMoves, premiumMachine } from './trading';
import { rememberMove } from './progression';
import { recordStarterMoves } from './starter-traits';
import { canEditParty } from './team';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueContent, RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
/** Practical off-type attacks from this member's legal TM pool; no borrowed moves or stat rewards. */
export function coverageMoves(mon: RoguePokemon) {
	const types = permanentMemberTypes(mon);
	return machineMoves(mon).filter(id => {
		const move = dex.moves.get(id);
		return move.category !== 'Status' && !types.includes(move.type) && premiumMachine(id);
	});
}
export function grantCoverage(run: RogueRun, source: string) {
	const lessons = run.coverageLessons ||= { remaining: 0, claimed: [] };
	if (lessons.claimed.includes(source)) return false;
	lessons.claimed.push(source); lessons.remaining++;
	(run.notices ||= []).push('获得一份【补盲研习】：战斗外可让一名伙伴自选学会一个合法的非本系攻击招式，可留待后来入队的伙伴。');
	return true;
}
export function coverageView(run: RogueRun) {
	return { remaining: run.coverageLessons?.remaining || 0,
		members: run.coverageLessons?.remaining ? run.team.filter(p => !p.egg && !p.fusion)
			.map(mon => ({ member: mon.id, moves: coverageMoves(mon) })) : [] };
}
export function claimCoverage(account: RogueAccount, run: RogueRun, content: RogueContent, member?: string, move?: string) {
	const mon = run.team.find(p => !p.egg && !p.fusion && p.id === member);
	if (!canEditParty(run) || !mon || !run.coverageLessons?.remaining || !coverageMoves(mon).includes(move!)) {
		throw new Error('请在战斗外为队内伙伴选择合法、未掌握的非本系攻击招式。');
	}
	rememberMove(mon, move!); run.coverageLessons.remaining--;
	recordStarterMoves(account, content, { ...mon.set, moves: [move!] });
	(run.notices ||= []).push('补盲研习完成，可在队伍面板装备新招式。');
}
