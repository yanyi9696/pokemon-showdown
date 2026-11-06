import { createHash } from 'crypto';
import { affectionScene } from './affection';
import type { RogueCoopSession, RogueRun } from './types';

/** Milestones belong to one member, but their dialogue branch requires shared consent. */
export function sharedAffectionScene(session: RogueCoopSession, runs: { userid: string, run: RogueRun }[]) {
	const adventure = session.adventure;
	if (session.status !== 'active' || !adventure ||
		['battle', 'battle-starting', 'complete'].includes(adventure.phase) ||
		Object.values(adventure.members).some(member => member.pendingMoves?.length || member.pendingCaptures?.length ||
			member.blessings?.pending.length || member.blessings?.stage)) return null;
	for (const { userid, run } of runs) {
		const scene = affectionScene(run);
		if (!scene) continue;
		const visit = createHash('sha256').update(JSON.stringify([
			adventure.id, userid, scene.id, scene.stage,
		])).digest('hex').slice(0, 24);
		return { ...scene, visit, owner: userid,
			ownerName: userid === session.hostUser ? session.hostName : session.guestName };
	}
	return null;
}
