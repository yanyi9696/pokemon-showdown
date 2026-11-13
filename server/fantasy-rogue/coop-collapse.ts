import { randomUUID } from 'crypto';
import { COLLAPSE_ENTRIES, collapseCount, collapseEntries, validCollapseSelection,
	type CollapseID } from '../../sim/rogue-collapse-data';
import { ROGUE_DIFFICULTY_VERSION } from '../../sim/rogue-difficulty';
import type { RogueCoopAdventure, RogueCoopSession } from './types';

export interface CoopCollapseChoice {
	key: string;
	selections: Record<string, CollapseID[]>;
	confirmed: Record<string, boolean>;
}
/** Missing versions are old adventures. Never silently replace their numeric difficulty rules mid-run. */
export function coopRunRules(adventure: RogueCoopAdventure) {
	return { difficultyRulesVersion: adventure.difficultyRulesVersion || 1,
		collapse: adventure.collapse && [...adventure.collapse], spirit: adventure.spirit,
		spiritVersion: adventure.spiritVersion };
}
export function coopCollapseRules(adventure: RogueCoopAdventure) {
	return collapseEntries(adventure.difficultyRulesVersion || 1).filter(entry => adventure.collapse?.includes(entry.id));
}
export function prepareCoopCollapse(adventure: RogueCoopAdventure) {
	adventure.difficultyRulesVersion = ROGUE_DIFFICULTY_VERSION;
	if (!collapseCount(adventure.difficulty)) { adventure.collapse = []; return; }
	adventure.phase = 'collapse-selection';
	adventure.collapseChoice = { key: randomUUID(), selections: {}, confirmed: {} };
}
export function coopCollapseView(session: RogueCoopSession, userid: string) {
	const adventure = session.adventure!, choice = adventure.collapseChoice;
	if (adventure.phase !== 'collapse-selection' || !choice) return;
	const partner = userid === session.hostUser ? session.guestUser : session.hostUser;
	return { key: choice.key, count: collapseCount(adventure.difficulty), entries: COLLAPSE_ENTRIES,
		own: choice.selections[userid] || [], partner: choice.selections[partner] || [],
		confirmed: !!choice.confirmed[userid], partnerConfirmed: !!choice.confirmed[partner] };
}
export function chooseCoopCollapse(
	session: RogueCoopSession, userid: string, key: string, selected: unknown, confirm: boolean
) {
	const adventure = session.adventure!, choice = adventure.collapseChoice;
	if (session.status !== 'active' || adventure.phase !== 'collapse-selection' || key !== choice?.key) {
		throw new Error('崩坏选择页面已更新，请刷新后重选。');
	}
	if (!Array.isArray(selected) || selected.length > collapseCount(adventure.difficulty) ||
		new Set(selected).size !== selected.length || !selected.every(id => COLLAPSE_ENTRIES.some(entry => entry.id === id))) {
		throw new Error('请选择本档数量以内、不重复的有效崩坏词条。');
	}
	if (confirm && !validCollapseSelection(adventure.difficulty, selected)) {
		throw new Error(`本档必须共同确认 ${collapseCount(adventure.difficulty)} 条不同的崩坏词条。`);
	}
	const canonical = COLLAPSE_ENTRIES.filter(entry => selected.includes(entry.id)).map(entry => entry.id);
	const owners = session.delegatedTo === userid ? [session.hostUser, session.guestUser] : [userid];
	for (const owner of owners) {
		choice.selections[owner] = [...canonical]; choice.confirmed[owner] = confirm;
	}
	if (![session.hostUser, session.guestUser].every(owner => choice.confirmed[owner]) ||
		JSON.stringify(choice.selections[session.hostUser]) !== JSON.stringify(choice.selections[session.guestUser])) {
		return false;
	}
	adventure.collapse = [...canonical]; delete adventure.collapseChoice;
	adventure.phase = 'area-selection';
	return true;
}
