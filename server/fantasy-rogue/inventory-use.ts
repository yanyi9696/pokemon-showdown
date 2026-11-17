import { Dex, toID } from '../../sim/dex';
import { ROGUE_STATS } from '../../sim/fantasy-rogue';
import { EASY_IV_LIMIT } from '../../sim/rogue-quality';
import { experienceAtLevel, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { TONIC_SECRET } from '../../sim/rogue-blessing-permanent';
import { recordCollapseResource } from './collapse';
import { useTonic } from './blessing-consumables';
import { gainEffort, gainExperience, initializeExperience, rebuildMember, rememberMove } from './progression';
import { machineMoves } from './trading';
import { abilityItemTarget, healingLocked, inventoryItem } from './team';
import { applyRecoveryItem } from './recovery-items';
import { recordStarterMoves } from './starter-traits';
import type { RogueAccount, RogueCommand, RogueContent, RogueItem, RogueRun } from './types';

function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

export const TRAINING_ITEM_KINDS = new Set([
	'crown', 'tonic', 'mint', 'machine', 'effort', 'rarecandy', 'candy', 'ability',
]);

/** Cheap availability preview; the effect function always validates again before consumption. */
export function trainingItemTargets(run: RogueRun, content: RogueContent, item: RogueItem) {
	if (!TRAINING_ITEM_KINDS.has(item.kind)) return [];
	return run.team.filter(mon => !mon.egg && !mon.nuzlockeDead).flatMap(mon => {
		let available = false;
		let slots: number[] | undefined;
		if (item.kind === 'crown') {
			const ceiling = run.difficulty === 'easy' ? ((run.difficultyRulesVersion || 1) >= 4 ? EASY_IV_LIMIT : 10) : 31;
			slots = ROGUE_STATS.flatMap((stat, index) => mon.set.ivs[stat] < ceiling ? [index] : []);
			available = slots.length > 0;
			if (item.id === 'goldbottlecap') slots = undefined;
		} else if (item.kind === 'tonic') {
			available = item.id === 'roguewine' ? !mon.tonics?.wine :
				item.id === 'roguecephalosporin' && !mon.tonics?.cephalosporin;
		} else if (item.kind === 'mint') {
			available = mon.mintNature !== item.nature;
		} else if (item.kind === 'machine') {
			available = machineMoves(mon).includes(item.move!);
		} else if (item.kind === 'effort') {
			available = mon.set.evs[item.stat!] < 252 && ROGUE_STATS.reduce((sum, stat) => sum + mon.set.evs[stat], 0) < 510;
		} else if (item.kind === 'ability') {
			available = !!abilityItemTarget(mon, item.id);
		} else {
			available = !!content.progression && mon.hp > 0 && !mon.fixedLevel && mon.set.level < (mon.uncappedLevel ? 9999 : 100);
		}
		return available ? [{ member: mon.id, ...(slots ? { slots } : {}), ...(item.kind === 'effort' ? {
			maxCount: Math.min(run.bag[item.id] || 0, Math.ceil(Math.min(252 - mon.set.evs[item.stat!],
				510 - ROGUE_STATS.reduce((sum, stat) => sum + mon.set.evs[stat], 0)) / item.amount!)),
		} : {}) }] : [];
	});
}

/** Shared supply effects. The caller owns authorization, account/session atomicity and duplicate receipts. */
export function useInventoryItem(account: RogueAccount, run: RogueRun, content: RogueContent,
	command: Pick<RogueCommand, 'value' | 'member' | 'slot' | 'count'>) {
	requireRule(['rest', 'ready', 'choose', 'reward', 'event'].includes(run.phase), '请在战斗间隙使用补给。');
	requireRule(!healingLocked(run), '本层要求连续战斗，途中不能使用治疗和补给道具。');
	const item = inventoryItem(content, command.value || '');
	const mon = run.team.find(entry => entry.id === command.member);
	requireRule(item && mon && !mon.egg && run.bag[item.id] > 0, '道具、数量或目标无效。');
	let count = command.count ?? 1;
	requireRule(Number.isSafeInteger(count) && count > 0 && count <= run.bag[item.id], '道具使用数量无效或库存不足。');
	requireRule(item.kind === 'candy' || item.kind === 'effort' || count === 1, '仅经验糖果与基础点数增强道具支持批量使用。');
	if (item.kind === 'crown') {
		const stats = item.id === 'goldbottlecap' ? ROGUE_STATS : [ROGUE_STATS[command.slot!]];
		requireRule(stats.every(stat => !!stat) && (item.id === 'goldbottlecap' || Number.isInteger(command.slot)),
			'请选择要提升的个体值。');
		const ceiling = run.difficulty === 'easy' ? ((run.difficultyRulesVersion || 1) >= 4 ? EASY_IV_LIMIT : 10) : 31;
		requireRule(stats.some(stat => mon.set.ivs[stat] < ceiling), '个体值已经达到本档上限，道具未消耗。');
		for (const stat of stats) mon.set.ivs[stat] = ceiling;
		rebuildMember(mon, run.boosts);
		run.notices = [`已使用【${item.name}】，伙伴的个体值得到了提升。`];
	} else if (item.kind === 'tonic') {
		useTonic(account, mon, item);
		run.notices = [`已为伙伴使用${item.name}。` + (mon.tonics?.wine && mon.tonics.cephalosporin ? TONIC_SECRET : '')];
	} else if (item.kind === 'mint') {
		requireRule(mon.mintNature !== item.nature, '已具有该薄荷效果，道具未消耗。');
		mon.mintNature = item.nature;
		mon.statModifiers = { ...mon.statModifiers, nature: item.nature };
		rebuildMember(mon, run.boosts);
	} else if (item.kind === 'machine') {
		requireRule(machineMoves(mon).includes(item.move!), '该伙伴不能通过学习机学习此招式，或已经掌握；道具未消耗。');
		rememberMove(mon, item.move!);
		recordStarterMoves(account, content, { ...mon.set, moves: [item.move!] }, run);
		run.notices = ['已加入伙伴的招式池，可在队伍面板中更换招式。'];
		if (run.difficulty === 'easy') {
			run.notices.push('护符庇佑：本局学会的招式不会解锁为下一局的初始招式。');
		}
	} else if (item.kind === 'revive') {
		applyRecoveryItem(run, mon, item);
	} else if (item.kind === 'effort') {
		const stat = item.stat!;
		requireRule(mon.set.evs[stat] < 252 && ROGUE_STATS.reduce((sum, key) => sum + mon.set.evs[key], 0) < 510,
			'该项基础点数或总基础点数已达上限，道具未消耗。');
		run.notices = [];
		const remaining = Math.min(252 - mon.set.evs[stat], 510 - ROGUE_STATS.reduce((sum, key) => sum + mon.set.evs[key], 0));
		count = Math.min(count, Math.ceil(remaining / item.amount!));
		gainEffort(run, mon, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, [stat]: item.amount! * count });
		run.notices.push(`已使用 ${item.name} ×${count}，达到上限后不再消耗。`);
	} else if (item.kind === 'rarecandy') {
		requireRule(content.progression && mon.hp > 0 && !mon.fixedLevel &&
			mon.set.level < (mon.uncappedLevel ? 9999 : 100), '该伙伴不能再升级，神奇糖果未消耗。');
		initializeExperience(mon);
		const growth = rogueSpeciesData(mon.fusion?.first.set.species || mon.set.species).growth;
		const needed = experienceAtLevel(growth, mon.set.level + 1) - mon.experience!;
		requireRule(needed > 0, '伙伴的经验记录需要刷新，神奇糖果未消耗。');
		run.notices = [];
		gainExperience(run, mon, needed);
		run.notices.push('已使用神奇糖果 ×1，伙伴直接提升了 1 级。');
	} else if (item.kind === 'candy') {
		requireRule(content.progression && mon.hp > 0 && (mon.uncappedLevel || mon.set.level < 100) && !mon.fixedLevel,
			'该成员不能再获得经验。');
		initializeExperience(mon);
		const remaining = experienceAtLevel(rogueSpeciesData(mon.fusion?.first.set.species || mon.set.species).growth,
			mon.uncappedLevel ? 9999 : 100) - mon.experience!;
		count = Math.min(count, Math.ceil(remaining / item.amount!));
		requireRule(count > 0, '该成员不能再获得经验。');
		run.notices = [];
		gainExperience(run, mon, item.amount! * count);
		run.notices.push(`已使用 ${item.name} ×${count}。`);
	} else if (item.kind === 'ether') {
		applyRecoveryItem(run, mon, item, command.slot);
	} else if (item.kind === 'ability') {
		const ability = abilityItemTarget(mon, item.id);
		requireRule(ability, '该伙伴无法使用此特性道具，道具未消耗。');
		mon.set.ability = ability;
		mon.abilityPool = [{ id: toID(ability),
			hidden: toID(Dex.mod('gen9fantasy').species.get(mon.set.species).abilities.H) === toID(ability) }];
	} else if (item.kind === 'cure') {
		applyRecoveryItem(run, mon, item);
	} else {
		applyRecoveryItem(run, mon, item);
		recordCollapseResource(account, run, 'medicine');
	}
	run.bag[item.id] -= count;
}
