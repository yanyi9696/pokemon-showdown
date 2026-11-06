import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueContent, RogueItem, RogueRun } from './types';
import { collapseMedicine } from './collapse';
import { cureMember, inventoryItem } from './team';
import { ensureMemberMemory } from './progression';

export const RECOVERY_ITEM_KINDS = new Set(['heal', 'revive', 'cure', 'ether']);
function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

/** Effect only. The caller owns inventory consumption, permissions and the save transaction. */
export function applyRecoveryItem(run: RogueRun, mon: RoguePokemon, item: RogueItem, moveSlot?: number) {
	requireRule(!mon.egg && !mon.nuzlockeDead, '该伙伴不能接受恢复，道具未消耗。');
	if (item.kind === 'revive') {
		requireRule(!mon.hp, '活力碎片只能对倒下成员使用。');
		mon.hp = Math.min(mon.maxhp, Math.max(1, Math.floor(mon.maxhp * item.amount!)));
		mon.status = ''; mon.statusState = {}; delete mon.statuses;
		if (run.blessings?.owned.some(entry => entry.family === 'insight')) {
			mon.insight ||= { points: 0, gain: 1 };
			mon.insight.points = Math.min(100, mon.insight.points + mon.insight.gain);
		}
	} else if (item.kind === 'ether') {
		requireRule(mon.hp > 0 && mon.pp.some(slot => slot.pp < slot.maxpp), '该成员不需要恢复 PP。');
		const slots = item.singleMove ? [mon.pp[moveSlot!]] : mon.pp;
		requireRule(!item.singleMove || Number.isInteger(moveSlot) && slots[0] && slots[0].pp < slots[0].maxpp,
			'请选择需要恢复 PP 的招式。');
		for (const slot of slots) {
			slot.pp = Math.min(slot.maxpp, slot.pp + item.amount!);
			const memory = mon.moveMemory?.find(move => move.id === slot.id);
			if (memory) memory.pp = slot.pp;
		}
	} else if (item.kind === 'cure') {
		cureMember(mon, item);
	} else {
		requireRule(item.kind === 'heal' && mon.hp > 0 && mon.hp < mon.maxhp, '该目标不能使用治疗道具。');
		mon.hp = Math.min(mon.maxhp, mon.hp + collapseMedicine(run, Math.min(mon.maxhp, item.amount!)));
	}
}

export function restoreMember(mon: RoguePokemon) {
	if (mon.egg || mon.nuzlockeDead) return;
	ensureMemberMemory(mon);
	mon.hp = mon.maxhp;
	mon.status = ''; mon.statusState = {}; delete mon.statuses;
	for (const slot of [...mon.pp, ...mon.moveMemory!]) slot.pp = slot.maxpp;
	for (const slot of mon.blessingPP || []) slot.pp = slot.maxpp;
}

/** Preview uses a cloned target and the same effect validation, never the live party. */
export function recoveryItemOptions(run: RogueRun, content: RogueContent) {
	return Object.entries(run.bag).flatMap(([id, count]) => {
		const item = inventoryItem(content, id);
		if (count <= 0 || !item || !RECOVERY_ITEM_KINDS.has(item.kind)) return [];
		const targets = run.team.flatMap(mon => {
			const slots = item.kind === 'ether' && item.singleMove ? mon.pp.map((_, slot) => slot) : [undefined];
			return slots.flatMap(slot => {
				const preview = structuredClone(mon);
				try { applyRecoveryItem(run, preview, item, slot); } catch { return []; }
				return [{ member: mon.id, species: mon.set.species, slot, move: slot === undefined ? undefined : mon.pp[slot].id,
					hp: mon.hp, restoredHP: preview.hp - mon.hp }];
			});
		});
		return targets.length ? [{ id, name: item.name, kind: item.kind, count, targets }] : [];
	});
}
