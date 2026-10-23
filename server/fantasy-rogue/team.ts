import { tradeItem } from './trading';
import { applyHeldForme } from './held-formes';
import { formItem } from './form-item-data';
import { tonicItems } from './blessing-consumables';
import { Dex, toID } from '../../sim/dex';
import { ROGUE_STATS, type RoguePokemon } from '../../sim/fantasy-rogue';
import { emblemType, BLESSING_TYPES } from '../../sim/rogue-blessing-data';
import { ensureMemberMemory, rebuildMember } from './progression';
import type { RogueCommand, RogueContent, RogueItem, RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
export const TEAM_ACTIONS = ['order', 'setmove', 'moves', 'equip', 'equipemblem', 'ability', 'evs'];
export const canEditParty = (run: RogueRun) => ['choose', 'ready', 'rest', 'reward', 'event'].includes(run.phase) &&
	!run.pendingCapture && !run.pendingMoves?.length;
export const healingLocked = (run: RogueRun) => !!run.node?.noHealing &&
	run.recovery !== 'retreat' &&
	(run.encounter > 0 || !!run.battle || !!run.recovery || run.phase === 'failed');
function requireRule(ok: unknown, message: string): asserts ok {
	if (!ok) throw new Error(message);
}
export function inventoryItem(content: RogueContent, id: string): RogueItem | undefined {
	if (formItem(id)) return formItem(id);
	if (id === 'greninjaashz') return { id, name: '智蛙 Z', kind: 'held', price: 0, shopFloor: false,
		icon: 'greninjaashz', description: '幻想甲贺忍蛙携带，在肉鸽对战中登场时切换为小智版形态；解锁 Z 招式后，可将飞水手里剑变为黄金羁绊手里剑。' };
	if (id === 'abilitycapsule' || id === 'abilitypatch') return { id, name: id === 'abilitycapsule' ? '特性胶囊' : '特性膏药',
		kind: 'ability', price: id === 'abilitycapsule' ? 8000 : 12000, shopFloor: false,
		description: id === 'abilitycapsule' ? '切换另一项普通特性；使用前可查看目标特性。' : '切换隐藏特性与第一项普通特性；使用前可查看目标特性。' };
	const type = emblemType(id);
	if (type) return {id, name: `${BLESSING_TYPES[type]}属性转`, kind: 'emblem', price: 0,
		shopFloor: false, icon: toID(type + 'gem')};
	const configured = content.items.find(item => item.id === id);
	if (configured) return configured;
	const special = tradeItem(id) || tonicItems().find(item => item.id === id);
	if (special) return special;
	const item = dex.items.get(id);
	return item.exists ? { id: item.id, name: item.name, kind: 'held', price: 0, icon: item.id } : undefined;
}
export function abilityItemTarget(mon: RoguePokemon, item: string): string | undefined {
	if (mon.compound || mon.fusion) return;
	const species = dex.species.get(mon.set.species), current = toID(mon.set.ability);
	if (item === 'abilitypatch') return species.abilities.H ?
		(toID(species.abilities.H) === current ? species.abilities[0] : species.abilities.H) : undefined;
	const normal = [species.abilities[0], species.abilities[1]].filter(Boolean) as string[];
	return item === 'abilitycapsule' && normal.some(a => toID(a) === current) ? normal.find(a => toID(a) !== current) : undefined;
}
export function cureMember(mon: RoguePokemon, item: RogueItem) {
	const statuses = { ...mon.statuses };
	if (mon.status) statuses[mon.status] = statuses[mon.status] || { ...mon.statusState };
	const cured = Object.keys(statuses).filter(status => !item.cureStatuses || item.cureStatuses.includes(status));
	requireRule(mon.hp > 0 && cured.length, '该道具无法解除此成员当前的异常状态，道具未消耗。');
	for (const status of cured) delete statuses[status];
	mon.status = statuses[mon.status] ? mon.status : Object.keys(statuses)[0] || '';
	mon.statusState = statuses[mon.status] || {};
	if (Object.keys(statuses).length) mon.statuses = statuses;
	else delete mon.statuses;
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
	requireRule(mon && !mon.egg, '蛋尚未孵化，不能调整战斗配置。');
	ensureMemberMemory(mon);
	switch (command.action) {
	case 'equipemblem': {
		const id = command.value || '', old = mon.emblem || '';
		if (old === id) return;
		if (id) {
			requireRule(emblemType(id) && run.bag[id] > 0, '背包中没有可用的属性转。');
			run.bag[id]--;
		}
		if (old) run.bag[old] = (run.bag[old] || 0) + 1;
		mon.emblem = id;
		break;
	}
	case 'equip': {
		const id = command.value || '';
		const old = toID(mon.set.item);
		if (old === id) return;
		requireRule(!(old === 'eviolite' && run.blessings?.owned.some(entry => entry.family === 'kid')), '小鬼当家：进化奇石不可取下。');
		if (id) {
			requireRule(inventoryItem(content, id)?.kind === 'held' && run.bag[id] > 0, '背包中没有可用的携带道具。');
			run.bag[id]--;
		}
		if (old) run.bag[old] = (run.bag[old] || 0) + 1;
		mon.set.item = id;
		if (!mon.fusion) applyHeldForme(mon.set);
		break;
	}
	case 'moves':
		requireRule(permutation(command.order, mon.set.moves.map(toID)), '招式顺序无效。');
		mon.set.moves = [...command.order];
		break;
	case 'setmove': {
		const slot = command.slot!;
		const move = command.value || '';
		const limit = run.blessings?.owned.some(entry => entry.family === 'learnall') ? 5 : 4;
		requireRule(Number.isInteger(slot) && slot >= 0 && slot < limit && slot <= mon.set.moves.length, '招式位置无效。');
		requireRule(mon.moveMemory!.some(entry => entry.id === move) || mon.blessingMoves?.includes(move), '该成员尚未学会这个招式。');
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
		requireRule(!mon.compound || command.value === 'powerofalchemy', '五号化合物的主特性固定为化学之力。');
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
