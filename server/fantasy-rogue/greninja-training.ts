import { toID } from '../../sim/dex';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import { roguePartyLimit } from '../../sim/fantasy-rogue-spirits';
import { experienceAtLevel, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { gainExperience, initializeExperience } from './progression';
import { eventOpening } from './event-text';
import type { RogueRun } from './types';

export interface GreninjaTraining { member?: RoguePokemon; floor: number; returned?: boolean }
export const greninjaEvent = (id: string) => ['greninjatraining', 'greninjareturn'].includes(id);
export function greninjaCandidates(run: RogueRun) {
	return run.team.filter(mon => !mon.egg && toID(mon.set.species) === 'greninjafantasy' &&
		run.team.some(other => other.id !== mon.id && !other.egg && other.hp > 0));
}
export function greninjaEventEligible(run: RogueRun, id: string) {
	if (id === 'greninjatraining') return !run.greninjaTraining && greninjaCandidates(run).length > 0;
	if (id === 'greninjareturn') return !!run.greninjaTraining?.member && !run.greninjaTraining.returned &&
		run.floor >= run.greninjaTraining.floor + 5;
	return true;
}
export function greninjaEventView(run: RogueRun) {
	const event = run.node!.event!;
	const options = event.stage !== 'choice' ? [] : event.id === 'greninjatraining' ? [
		...greninjaCandidates(run).map(mon => ({ id: `train:${mon.id}`, name: `让 ${mon.set.name || '幻想甲贺忍蛙'}（Lv.${mon.set.level}）参加修行`,
			text: '暂时离队；至少再走 5 层后，在事件区域寻找它们。请保留另一位能出战的伙伴。', disabled: false })),
		{ id: 'leave', name: '先保持现在的队伍，下次再来。', text: '', disabled: false },
	] : [{ id: 'welcome', name: '欢迎回来，辛苦你们了！', text: '伙伴归队，领取智蛙 Z，并解锁 Z 招式。队伍满员时可先选择安置。', disabled: false }];
	return { id: event.id, key: event.key, stage: event.stage, title: '甲贺忍蛙护林员' +
		(event.id === 'greninjareturn' ? '·修行归来' : ''),
	paragraphs: event.result || eventOpening(event.id), options, pokemon: 'Greninja-Ash' };
}
export function chooseGreninjaEvent(run: RogueRun, choice: string) {
	const event = run.node!.event!;
	if (event.settled || !greninjaEventView(run).options.some(option => option.id === choice && !option.disabled)) {
		throw new Error('请选择当前护林员事件提供的选项。');
	}
	if (choice === 'leave') {
		event.trainingAidBlocked = true;
		event.result = ['你向黑影中的甲贺忍蛙点头示意，决定先和伙伴继续旅行。它隐入树梢，像是在等待下一次相遇。'];
	} else if (event.id === 'greninjatraining') {
		const member = greninjaCandidates(run).find(mon => mon.id === choice.slice(6))!;
		run.greninjaTraining = { member, floor: run.floor };
		run.team = run.team.filter(mon => mon.id !== member.id);
		event.result = ['小智版甲贺忍蛙在树干上留下护林的记号，向你的伙伴伸出手。两道身影踏过溪水，消失在森林深处。',
			'幻想甲贺忍蛙暂时离队。再前进至少 5 层后，多探索事件区域，便有机会迎接它完成修行归来。'];
	} else {
		const trip = run.greninjaTraining;
		if (!trip?.member || trip.returned || run.floor < trip.floor + 5) throw new Error('修行伙伴尚未归来。');
		const mon = trip.member, levels = run.floor - trip.floor;
		initializeExperience(mon);
		const target = Math.min(100, mon.set.level + levels);
		const experience = experienceAtLevel(rogueSpeciesData(mon.set.species).growth, target);
		gainExperience(run, mon, Math.max(0, experience - (mon.experience || 0)));
		if (run.team.length < roguePartyLimit(run.spirit)) run.team.push(mon);
		else {
			run.pendingCapture = mon;
			run.captureResume = 'event'; run.phase = 'settlement';
			// New level moves remain learned in memory; the player can equip them after placement.
			run.pendingMoves = run.pendingMoves?.filter(move => move.member !== mon.id);
		}
		trip.returned = true; delete trip.member;
		run.bag.greninjaashz = (run.bag.greninjaashz || 0) + 1;
		run.zUnlocked = true;
		event.result = [`两道水影从树梢跃下。你的伙伴完成了 ${levels} 层旅途间的修行，等级提升至 Lv.${mon.set.level}（最高 100 级），带着原本的养成与招式回来了。`,
			'小智版甲贺忍蛙将【智蛙 Z】交到你手中。Z 招式系统已解锁；幻想甲贺忍蛙携带它后，登场时即可切换为小智版形态，并以【飞水手里剑】发动专属 Z 招式。'];
	}
	Object.assign(event, { stage: 'result', settled: true });
}
