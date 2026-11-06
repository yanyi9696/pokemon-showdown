import { toID } from '../../sim/dex';
import { experienceAtLevel } from '../../sim/fantasy-rogue-rules';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueRun } from './types';

const CANDIES = [['expcandyxl', 30000], ['expcandyl', 10000], ['expcandym', 3000],
	['expcandys', 800], ['expcandyxs', 100]] as const;
const growths = [1, 2, 3, 4, 5, 6];
const budget = (level: number) => Math.floor(Math.min(...growths.map(growth =>
	experienceAtLevel(growth, level) - experienceAtLevel(growth, Math.max(1, level - 20)))) / 400) * 100;
// The erratic curve can dip near 100. A lower envelope preserves both the cap and nondecreasing payouts.
const budgets = Array.from({ length: 121 }, (_, level) => level ? budget(level) : 0);
for (let level = 119; level > 0; level--) budgets[level] = Math.min(budgets[level], budgets[level + 1]);

export function releaseReward(mon: RoguePokemon) {
	const level = Math.max(1, Math.min(9999, Math.floor(mon.set.level || 1)));
	const experience = mon.egg ? 0 : level <= 120 ? budgets[level] : budget(level);
	let remaining = experience;
	const items: Record<string, number> = {};
	for (const [id, amount] of CANDIES) {
		const count = Math.floor(remaining / amount);
		if (count) { items[id] = count; remaining -= count * amount; }
	}
	return { experience, items };
}

/** The caller also validates the enclosing encounter/reward and any co-op reservation. */
export function releaseReason(run: RogueRun, mon: RoguePokemon, incoming?: RoguePokemon) {
	if (!run.team.includes(mon)) return '这位伙伴已经不在队伍中。';
	if (!['choose', 'ready', 'rest', 'reward', 'event', 'intro', 'blessing', 'settlement'].includes(run.phase) ||
		run.battle || run.retryHealing || run.preview?.stage === 'result') return '请先结束当前战斗或确认步骤。';
	if (mon.fusion || mon.formFusion) return '请先解除融合，再放生这位伙伴。';
	const event = run.node?.event;
	if (event?.memory || !event?.settled && (event?.activity?.solo || event?.activity?.member === mon.id)) {
		return '请先完成这位伙伴正在参与的事件。';
	}
	if (!incoming && run.pendingMoves?.length) return '请先处理待学习招式。';
	if (!mon.egg && !mon.nuzlockeDead && !run.team.some(p => p !== mon && !p.egg && !p.nuzlockeDead) &&
		(!incoming || incoming.egg || incoming.nuzlockeDead)) return '队伍至少需要保留一只已孵化、未永久死亡的伙伴。';
	return '';
}

export function releaseView(run: RogueRun, mon: RoguePokemon, incoming?: RoguePokemon) {
	return { ...releaseReward(mon), reason: releaseReason(run, mon, incoming) };
}

/** Release and optional admission are one save transaction; never silently overwrite an existing member. */
export function releasePartyMember(run: RogueRun, member: string, confirmed: boolean, incoming?: RoguePokemon) {
	if (!confirmed) throw new Error('请先确认放生及糖果返还。');
	const mon = run.team.find(p => p.id === member);
	if (!mon) throw new Error('这位伙伴已经不在队伍中。');
	const reason = releaseReason(run, mon, incoming);
	if (reason) throw new Error(reason);
	const reward = releaseReward(mon);
	for (const [id, count] of Object.entries(reward.items)) run.bag[id] = (run.bag[id] || 0) + count;
	for (const id of [toID(mon.set.item), mon.emblem]) {
		if (id) run.bag[id] = (run.bag[id] || 0) + 1;
	}
	const index = run.team.indexOf(mon);
	run.team.splice(index, 1, ...(incoming ? [incoming] : []));
	run.pendingMoves = run.pendingMoves?.filter(move => move.member !== member);
	(run.notices ||= []).push(`已放生 ${mon.egg ? '宝可梦蛋' : mon.set.species}；` + (reward.experience ?
		`返还经验糖果，共 ${reward.experience} 经验。` : '未达到最小经验糖果门槛，不返还糖果。') +
		(mon.set.item || mon.emblem ? '携带道具与属性转已放回背包。' : ''));
	return reward;
}
