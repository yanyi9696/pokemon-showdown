import { createHash } from 'crypto';
import { coopPartyPokemon } from './coop-eggs';
import { healingLocked } from './team';
import { roguePartyLimit } from '../../sim/fantasy-rogue-spirits';
import type { RogueCoopSession, RogueRun } from './types';

/** Storage belongs to one player; the quote also expires when that player's party changes. */
export function coopStorageView(
	adventure: NonNullable<RogueCoopSession['adventure']>, owner: string, run: RogueRun, locked: string | null
) {
	const canMerge = run.spirit === 'zygarde';
	if (!canMerge && !run.blessings?.owned.some(b => b.family === 'sololeveling')) return null;
	if (locked === null) return null;
	const member = adventure.members[owner];
	const event = member.coopEvent || run.node?.event;
	const eventLock = event?.memory || !event?.settled && (event?.activity?.member || event?.activity?.solo || event?.coopScroll);
	const quote = createHash('sha256').update(JSON.stringify([adventure.id, owner, adventure.floor,
		adventure.phase, adventure.encounter, member.storageRevision || 0, run.team, run.box])).digest('hex');
	const describe = (mon: RogueRun['team'][number]) => ({ ...coopPartyPokemon(mon, adventure.floor),
		stars: mon.egg ? 1 : mon.stars || 1, status: mon.egg ? '' : mon.status || '',
		fusion: !!(mon.fusion || mon.formFusion), ivs: mon.egg ? {} : { ...mon.set.ivs },
		emblem: mon.egg ? '' : mon.emblem || '' });
	return { quote, canMerge, capacity: 30, partyLimit: roguePartyLimit(run.spirit, run.blessings),
		locked: locked || (adventure.phase === 'settlement' ? '请先完成战斗结算，再整理箱子或升星。' :
		eventLock ? '请先完成已指定伙伴参与的事件，再整理箱子或升星。' :
		healingLocked(run) ? '强制连续战斗期间不能整理箱子或升星。' : ''),
		team: run.team.map(describe), box: (run.box || []).map(describe) };
}
