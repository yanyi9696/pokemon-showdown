import { createHash } from 'crypto';
import type { RogueCoopSession } from './types';

/** Preview never means ready. Legacy sessions expose the last explicit confirmation as their preview. */
export function battlePreview(session: RogueCoopSession, owner: string): string[] {
	return session.battlePreviews?.[owner] || session.battleSelections[owner] || [];
}

/** Reject delayed UI actions after another encounter, party edit, pause or control transfer. */
export function battleSelectionKey(session: RogueCoopSession): string {
	const adventure = session.adventure;
	return createHash('sha256').update(JSON.stringify([session.id, adventure?.id, adventure?.floor,
		adventure?.node?.id, adventure?.encounter, session.status, session.delegatedTo,
		session.battleSelectionVersion || 0])).digest('hex').slice(0, 24);
}

export function clearBattleSelections(session: RogueCoopSession, owner?: string, keepPreview = false) {
	for (const userid of owner ? [owner] : [session.hostUser, session.guestUser]) {
		if (keepPreview) (session.battlePreviews ||= {})[userid] = [...battlePreview(session, userid)];
		else delete session.battlePreviews?.[userid];
		session.battleSelections[userid] = [];
	}
	session.battleSelectionVersion = (session.battleSelectionVersion || 0) + 1;
}
