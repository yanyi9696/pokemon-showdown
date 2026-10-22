import { randomUUID } from 'crypto';
import { experienceAtLevel, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { gainExperience, initializeExperience } from './progression';
import { emergencyCost } from './early-balance';
import { healingLocked } from './team';
import type { RogueContent, RogueRun } from './types';

export interface ComebackState {
	accepted?: boolean;
	declines?: number;
	pending?: { key: string; floor: number; page: number; answer?: 'yes' | 'no' };
	floor?: number;
	expires?: number;
	battleFloors?: number[];
	completed?: number[];
}
/** Called once by defeat settlement, never by view/normalization or page refresh. */
export function offerComeback(run: RogueRun, content: RogueContent) {
	if (run.comeback?.accepted || run.comeback?.pending || run.postgame || healingLocked(run) ||
		!run.team.some(p => !p.egg) || run.team.some(p => !p.egg && p.hp > 0)) return false;
	if (!content.items.some(i => i.kind === 'revive' && run.bag[i.id] > 0) && run.money < emergencyCost(run.floor)) return false;
	run.comeback ||= {};
	run.comeback.pending = { key: randomUUID(), floor: run.floor, page: run.comeback.declines ? 1 : 0 };
	return true;
}
export function comebackActive(run: RogueRun) {
	return !!run.comeback?.accepted && run.floor >= run.comeback.floor! && run.floor <= run.comeback.expires!;
}
export function comebackExperience(run: RogueRun) { return comebackActive(run) ? 2 : 1; }
export function completeComebackFloor(run: RogueRun) {
	if (!comebackActive(run) || run.comeback!.completed?.includes(run.floor)) return;
	const card = run.comeback!;
	(card.completed ||= []).push(run.floor);
	if (card.battleFloors?.includes(run.floor)) return;
	// Noncombat progress also matters: a quarter of each member's next-level interval.
	for (const mon of run.team.filter(p => !p.egg && !p.fixedLevel)) {
		initializeExperience(mon);
		const growth = rogueSpeciesData(mon.set.species).growth;
		const exp = Math.max(1, Math.floor((experienceAtLevel(growth, mon.set.level + 1) - experienceAtLevel(growth, mon.set.level)) / 4));
		gainExperience(run, mon, exp);
	}
	(run.notices ||= []).push('【再启程】这层没有战斗经验，旅行见闻化为伙伴们的历练经验（各自一级所需经验的 25%）。');
}
export function comebackView(run: RogueRun) {
	const pending = run.comeback?.pending;
	if (pending) {
		const pages = ['你靠着墙慢慢坐下。最后一颗精灵球也安静了，掌心仍在微微发抖。',
			'一道黑色的影子停在你眼前。老人俯下身，声音一如初见时平稳：「走了这么远……你已经到达自己的极限了吗？」'];
		return { ...pending, title: '再启程', text: pending.answer === 'no' ?
			'「还有这股骨气，就别急着为旅途写下结局。」老人握住你的手，将你拉起。等你站稳，想要道谢时，走廊里已经没有了他的身影。' :
			pending.answer === 'yes' ? '老人接过你出发时的卡片，轻轻翻转。「承认疲惫，不代表放弃。再试一次吧，和你的伙伴一起。」卡片泛起新的光芒。等你抬头，他已经走远。' : run.comeback?.declines ?
			'熟悉的黑袍在你面前停下。「又见面了。这一次，你觉得自己已经到达极限了吗？」' : pages[pending.page],
			choosing: pending.page === 1 && !pending.answer };
	}
	return comebackActive(run) ? { active: true, remaining: run.comeback!.expires! - run.floor + 1,
		floorBuff: run.comeback!.floor === run.floor } : undefined;
}
export function chooseComeback(run: RogueRun, key?: string, value?: string) {
	const pending = run.comeback?.pending;
	if (!pending || pending.key !== key) throw new Error('老人的对话已更新，请刷新后继续。');
	if (pending.answer) {
		if (value !== 'continue') throw new Error('请继续读完告别。');
		delete run.comeback!.pending; return true;
	}
	if (pending.page === 0 && value === 'next') { pending.page = 1; return false; }
	if (pending.page !== 1 || !['yes', 'no'].includes(value!)) throw new Error('请选择你的回答。');
	pending.answer = value as 'yes' | 'no';
	if (value === 'no') run.comeback!.declines = (run.comeback!.declines || 0) + 1;
	if (value === 'yes') {
		Object.assign(run.comeback!, { accepted: true, floor: run.floor, expires: run.floor + 9, completed: [], battleFloors: [] });
		delete run.startCard;
		(run.notices ||= []).push('获得【再启程】：本层伤害、双防 +25%；含本层在内的 10 层战斗经验 ×2，没有战斗经验的楼层另获历练经验。仍需使用复活道具或支付急救费。');
	}
	return false;
}
