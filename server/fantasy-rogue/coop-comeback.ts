import { chooseComeback, comebackView } from './comeback';
import type { RogueCoopAdventure, RogueCoopSession, RogueRun } from './types';

export function coopComebackView(session: RogueCoopSession, userid: string) {
	const adventure = session.adventure;
	if (!adventure) return null;
	const owners = [session.hostUser, session.guestUser];
	const owner = owners.find(id => adventure.members[id].comeback?.pending);
	if (!owner) return null;
	const state = adventure.members[owner].comeback!;
	const pending = state.pending!;
	const visit = `${pending.key}:${pending.page}:${pending.answer || ''}`;
	const view = comebackView({ floor: adventure.floor, comeback: state } as RogueRun)!;
	const votes = adventure.comebackChoices?.visit === visit ? adventure.comebackChoices.choices : {};
	return { ...view, visit, owner, ownChoice: votes[userid],
		partnerChoice: votes[owners.find(id => id !== userid)!],
		// Co-op does not have the solo opening preference card.
		text: pending.answer === 'yes' ? '老人轻轻点头。「承认疲惫，不代表放弃。再试一次吧，和你的伙伴一起。」温暖的光落在你和伙伴身上。等你抬头，他已经走远。' :
		'text' in view ? view.text : '' };
}

export function chooseCoopComeback(session: RogueCoopSession, userid: string, run: RogueRun,
	visit?: string, value?: string) {
	const view = coopComebackView(session, userid);
	if (session.status !== 'active' || !view || visit !== view.visit ||
		!['settlement', 'blessing-reward'].includes(session.adventure!.phase) ||
		![session.hostUser, session.guestUser].includes(userid) ||
		session.delegatedTo && session.delegatedTo !== userid ||
		run.comeback?.pending?.key !== session.adventure!.members[view.owner].comeback?.pending?.key) {
		throw new Error('再启程对话已变化，请刷新后与队友共同选择。');
	}
	const pending = run.comeback!.pending!;
	const allowed = pending.answer ? ['continue'] : pending.page === 0 ? ['next'] : ['yes', 'no'];
	if (value !== '' && !allowed.includes(value!)) throw new Error('请选择当前再启程对话中的回答。');
	const adventure = session.adventure!;
	if (adventure.comebackChoices?.visit !== visit) adventure.comebackChoices = { visit, choices: {} };
	const choices = adventure.comebackChoices.choices;
	for (const owner of session.delegatedTo ? [session.hostUser, session.guestUser] : [userid]) {
		if (value) choices[owner] = value;
		else delete choices[owner];
	}
	const agreed = choices[session.hostUser];
	if (agreed && agreed === choices[session.guestUser]) {
		chooseComeback(run, pending.key, agreed);
		delete adventure.comebackChoices;
	}
}

export function coopComebackCard(adventure: RogueCoopAdventure, userid: string) {
	const comeback = adventure.members[userid].comeback;
	return !!comeback?.accepted && comeback.floor === adventure.floor;
}
