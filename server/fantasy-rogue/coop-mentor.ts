import { randomUUID } from 'crypto';
import { mentorCardProfile, type MentorCard } from '../../sim/rogue-mentor';
import type { RogueContent, RogueCoopAdventure, RogueCoopSession } from './types';

const CARDS: MentorCard[] = ['attack', 'guard', 'speed', 'balanced'];
export interface CoopMentor {
	key: string;
	floor: number;
	choices: Record<string, MentorCard | undefined>;
	card?: MentorCard;
}

export function prepareCoopMentor(adventure: RogueCoopAdventure, content: RogueContent) {
	const floor = adventure.floor + 1;
	if (!content.story || adventure.node?.kind !== 'rest' ||
		!content.floors[floor]?.some(node => node.kind === 'boss') || adventure.mentor?.floor === floor) return;
	adventure.mentor = { key: randomUUID(), floor, choices: {} };
}
export function coopMentorView(session: RogueCoopSession, userid: string) {
	const a = session.adventure, offer = a?.mentor;
	if (!a || !offer || a.phase !== 'route-interaction' || a.node?.kind !== 'rest' ||
		offer.floor !== a.floor + 1) return null;
	const partner = userid === session.hostUser ? session.guestUser : session.hostUser;
	return { key: offer.key, floor: offer.floor, card: offer.card,
		ownChoice: offer.choices[userid], partnerChoice: offer.choices[partner],
		cards: CARDS.map(id => ({ id, ...mentorCardProfile(id) })) };
}
export function chooseCoopMentor(session: RogueCoopSession, userid: string, key?: string, value?: string) {
	const view = coopMentorView(session, userid);
	if (session.status !== 'active' || !view || view.card || key !== view.key ||
		![session.hostUser, session.guestUser].includes(userid) ||
		session.delegatedTo && session.delegatedTo !== userid || value !== '' && !CARDS.includes(value as MentorCard)) {
		throw new Error('首领卡选择已变化，请刷新后与队友共同选择。');
	}
	const offer = session.adventure!.mentor!;
	for (const owner of session.delegatedTo ? [session.hostUser, session.guestUser] : [userid]) {
		if (value) offer.choices[owner] = value as MentorCard;
		else delete offer.choices[owner];
	}
	const selected = offer.choices[session.hostUser];
	if (selected && selected === offer.choices[session.guestUser]) offer.card = selected;
}
export function coopBattleMentor(adventure: RogueCoopAdventure) {
	return adventure.node?.kind === 'boss' && adventure.mentor?.floor === adventure.floor ?
		adventure.mentor.card : undefined;
}
