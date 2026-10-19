import { randomUUID } from 'crypto';
import { Dex } from '../../sim/dex';
import { teachingMoves, teachMove } from './event-learning';
import { eventOpening } from './event-text';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueContent, RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
export const FANTASY_TUTOR_FLOOR = 81, FANTASY_TUTOR_COST = 10;
export function fantasyTutorMoves(mon: RoguePokemon) {
	if (!mon.set.species.includes('Fantasy')) return [];
	return teachingMoves(mon).filter(id => !Dex.mod('gen9').moves.get(id).exists && !id.startsWith('rogue'));
}
export function fantasyTutorView(run: RogueRun) {
	const event = run.node!.event!, mon = run.team.find(p => p.id === event.service?.member);
	const option = (id: string, name: string, text = '', disabled = false) => ({ id, name, text, disabled });
	if (event.stage !== 'choice') return { paragraphs: event.result || [], options: [] };
	if (!event.committed) return { paragraphs: eventOpening('fantasytutor'),
		options: [option('lesson', '请指导我们的伙伴。', `每招 ${FANTASY_TUTOR_COST} 幻想碎片。`,
			(run.blessings?.shards || 0) < FANTASY_TUTOR_COST || !run.team.some(p => fantasyTutorMoves(p).length)),
		option('leave', '这次先向你请教理论。')] };
	if (mon) return { paragraphs: [`「让【${mon.set.species}】想象招式完成的样子，再让力量追上想象。」`],
		options: [option('back', '换一位伙伴。')], picker: { label: '选择幻想招式', options: fantasyTutorMoves(mon).map(id =>
			option(`fantasymove:${id}`, dex.moves.get(id).name, `${FANTASY_TUTOR_COST} 幻想碎片`, (run.blessings?.shards || 0) < FANTASY_TUTOR_COST)) } };
	const options = run.team.filter(p => !p.egg).map(p => option(`member:${encodeURIComponent(p.id)}`,
		p.set.species, `Lv.${p.set.level}`, !fantasyTutorMoves(p).length));
	if (!options.some(p => !p.disabled)) options.push(option('unavailable', '记住研究员的指导。'));
	return { paragraphs: ['「挑一位幻想伙伴吧。我只能教它本来就能够掌握的招式。」'], options };
}
export function chooseFantasyTutor(account: RogueAccount, run: RogueRun, content: RogueContent, choice: string) {
	const event = run.node!.event!;
	event.key = randomUUID();
	if (choice === 'leave' || choice === 'unavailable') {
		event.stage = 'result'; event.settled = true;
		event.result = ['研究员在笔记上画下几个要点，你向他道谢，继续前行。']; return;
	}
	event.committed = true;
	if (choice === 'lesson') return;
	if (choice === 'back') { delete event.service; return; }
	if (choice.startsWith('member:')) { event.service = { member: decodeURIComponent(choice.slice(7)) }; return; }
	const mon = run.team.find(p => p.id === event.service?.member), move = choice.slice(12);
	if (!mon || !fantasyTutorMoves(mon).includes(move) || (run.blessings?.shards || 0) < FANTASY_TUTOR_COST) {
		throw new Error('伙伴、招式或幻想碎片数量已变化。');
	}
	teachMove(account, run, content, mon, move);
	run.blessings!.shards -= FANTASY_TUTOR_COST;
	event.stage = 'result'; event.settled = true;
	event.result = [`碎片化成细碎的光。【${mon.set.species}】学会了【${dex.moves.get(move).name}】！`, '「记住这种感觉。下次，我们再试试新的可能。」'];
}
