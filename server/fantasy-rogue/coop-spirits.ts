import { randomUUID } from 'crypto';
import { activeRogueSpirits, rogueSpirit } from '../../sim/fantasy-rogue-spirits';
import { canSelectSpirit, difficultySpiritUnlocked, migrateSpiritProgress, SPIRIT_SELECTION_RULE } from './difficulty';
import type { RogueAccount, RogueCoopSession } from './types';
import type { RogueRandom } from './biome-pools';

export interface CoopSpiritChoice {
	key: string;
	selections: Record<string, string | null>;
	confirmed: Record<string, boolean>;
}
function permissions(session: RogueCoopSession, accounts: RogueAccount[]) {
	for (const account of accounts) migrateSpiritProgress(account);
	const enabled = accounts.length === 2 && accounts.every(account => difficultySpiritUnlocked(account));
	return { enabled, selectable: enabled ? activeRogueSpirits().filter(spirit =>
		accounts.every(account => canSelectSpirit(account, spirit.id, session.difficulty))) : [] };
}
export function prepareCoopSpirit(session: RogueCoopSession, accounts: RogueAccount[]) {
	if (!permissions(session, accounts).enabled) return;
	session.spiritChoice = { key: randomUUID(), selections: {}, confirmed: {} };
}
export function coopSpiritChoiceView(session: RogueCoopSession, userid: string, accounts: RogueAccount[]) {
	const choice = session.spiritChoice;
	if (session.status !== 'lobby' || !choice) return;
	const partner = userid === session.hostUser ? session.guestUser : session.hostUser;
	const permission = permissions(session, accounts);
	return { key: choice.key, own: choice.selections[userid] || null, partner: choice.selections[partner] || null,
		confirmed: !!choice.confirmed[userid], partnerConfirmed: !!choice.confirmed[partner],
		randomAvailable: permission.enabled, selectable: permission.selectable, rule: SPIRIT_SELECTION_RULE };
}
export function chooseCoopSpirit(session: RogueCoopSession, userid: string, key: string, value: string,
	confirmed: boolean, accounts: RogueAccount[], random: RogueRandom
) {
	const choice = session.spiritChoice;
	if (session.status !== 'lobby' || key !== choice?.key ||
		![session.hostUser, session.guestUser].includes(userid)) throw new Error('塔灵选择页面已更新，请刷新。');
	const permission = permissions(session, accounts);
	if (value !== 'none' && (!permission.enabled || value !== 'random' &&
		!permission.selectable.some(spirit => spirit.id === value))) {
		throw new Error('双方都需解锁塔灵；指定塔灵还需双方都使用它通关本档或更高档。');
	}
	const owners = session.delegatedTo === userid ? [session.hostUser, session.guestUser] : [userid];
	for (const owner of owners) { choice.selections[owner] = value; choice.confirmed[owner] = confirmed; }
	if (![session.hostUser, session.guestUser].every(owner => choice.confirmed[owner]) ||
		choice.selections[session.hostUser] !== choice.selections[session.guestUser]) return false;
	const pool = activeRogueSpirits();
	session.spirit = value === 'random' ? pool[random(pool.length)].id :
		value === 'none' ? undefined : rogueSpirit(value)!.id;
	delete session.spiritChoice;
	return true;
}
