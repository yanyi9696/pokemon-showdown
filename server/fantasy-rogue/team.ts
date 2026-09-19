import { Dex, toID } from '../../sim/dex';
import { ROGUE_STATS } from '../../sim/fantasy-rogue';
import { ensureMemberMemory, rebuildMember } from './progression';
import type { RogueCommand, RogueContent, RogueItem, RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
export const TEAM_ACTIONS = ['order', 'setmove', 'moves', 'equip', 'ability', 'evs'];
export const canEditParty = (run: RogueRun) => ['choose', 'ready', 'rest', 'reward'].includes(run.phase) &&
	!run.pendingCapture && !run.pendingMoves?.length;
function requireRule(ok: unknown, message: string): asserts ok {
	if (!ok) throw new Error(message);
}
export function inventoryItem(content: RogueContent, id: string): RogueItem | undefined {
	const configured = content.items.find(item => item.id === id);
	if (configured) return configured;
	const item = dex.items.get(id);
	return item.exists ? { id: item.id, name: item.name, kind: 'held', price: 0, icon: item.id } : undefined;
}
function permutation(order: string[] | undefined, current: string[]): order is string[] {
	return Array.isArray(order) && order.length === current.length && new Set(order).size === current.length &&
		order.every(id => current.includes(id));
}
export function editParty(run: RogueRun, command: RogueCommand, content: RogueContent) {
	requireRule(canEditParty(run), '请在战斗外并处理完本次结算后调整队伍。');
	if (command.action === 'order') {
		requireRule(permutation(command.order, run.team.map(mon => mon.id)), '队伍顺序无效。');
		run.team = command.order.map(id => run.team.find(mon => mon.id === id)!);
		return;
	}
	const mon = run.team.find(member => member.id === command.member);
	requireRule(mon, '队伍成员无效。');
	ensureMemberMemory(mon);
	switch (command.action) {
	case 'equip': {
		const id = command.value || '';
		const old = toID(mon.set.item);
		if (old === id) return;
		if (id) {
			requireRule(inventoryItem(content, id)?.kind === 'held' && run.bag[id] > 0, '背包中没有可用的携带道具。');
			run.bag[id]--;
		}
		if (old) run.bag[old] = (run.bag[old] || 0) + 1;
		mon.set.item = id;
		break;
	}
	case 'moves':
		requireRule(permutation(command.order, mon.set.moves.map(toID)), '招式顺序无效。');
		mon.set.moves = [...command.order];
		break;
	case 'setmove': {
		const slot = command.slot!;
		const move = command.value || '';
		requireRule(Number.isInteger(slot) && slot >= 0 && slot < 4 && slot <= mon.set.moves.length, '招式位置无效。');
		requireRule(mon.moveMemory!.some(entry => entry.id === move), '该成员尚未学会这个招式。');
		const current = mon.set.moves.findIndex(name => toID(name) === move);
		if (current >= 0) {
			requireRule(slot < mon.set.moves.length, '这个招式已经在使用中。');
			[mon.set.moves[current], mon.set.moves[slot]] = [mon.set.moves[slot], mon.set.moves[current]];
		} else {
			mon.set.moves[slot] = move;
		}
		break;
	}
	case 'ability':
		requireRule(mon.abilityPool!.some(entry => entry.id === command.value), '该特性尚未通过事件解锁。');
		mon.set.ability = dex.abilities.get(command.value).name;
		break;
	case 'evs': {
		requireRule(mon.evRespec, '只有特殊事件允许重新分配努力值。');
		const evs = command.evs;
		requireRule(evs && Object.keys(evs).length === 6 && ROGUE_STATS.every(stat =>
			Number.isInteger(evs[stat]) && evs[stat] >= 0 && evs[stat] <= 252), '每项努力值必须为 0～252 的整数。');
		const total = ROGUE_STATS.reduce((sum, stat) => sum + evs[stat], 0);
		requireRule(total === mon.evRespec.total && total <= 510, `请恰好分配已有的 ${mon.evRespec.total} 点努力值。`);
		mon.set.evs = { ...evs };
		delete mon.evRespec;
		break;
	}
	default: throw new Error('未知的队伍操作。');
	}
	rebuildMember(mon, run.boosts);
}
