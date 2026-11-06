import { Dex, toID } from '../../sim/dex';
import { evolveMember, evolutionOptions } from './progression';
import { healingLocked } from './team';
import type { RogueContent, RogueRun } from './types';

function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

/** Confirm a normal evolution using the same gate and resource rules in either adventure mode. */
export function confirmPartyEvolution(run: RogueRun, content: RogueContent, member?: string, target?: string) {
	requireRule(content.progression &&
		(['choose', 'ready', 'rest', 'reward', 'event'].includes(run.phase) || run.battle?.growthPaused), '当前不能进化。');
	requireRule(!healingLocked(run) || run.battle?.growthPaused, '本层要求连续战斗，途中不能通过进化调整状态。');
	const mon = run.team.find(entry => entry.id === member);
	const option = mon && evolutionOptions(mon, run).find(entry => toID(entry.species) === target);
	requireRule(mon?.hp && option, '没有满足条件的进化。');
	if (run.phase === 'battle') requireRule(mon.evolutionNotice && !option.item, '只能确认本次升级触发的进化。');
	requireRule(!(run.blessings?.owned.some(entry => entry.family === 'kid') && toID(mon.set.item) === 'eviolite' &&
		!Dex.mod('gen9fantasy').species.get(option.species).evos.length), '小鬼当家：携带进化奇石时不能进化为最终形态。');
	if (option.item) {
		requireRule(run.bag[option.item] > 0, '缺少进化道具。');
		run.bag[option.item]--;
	}
	evolveMember(run, mon, option.species);
}
