import { randomUUID } from 'crypto';
import { arceusEncounter } from './final-bosses';
import { restoreMember } from './recovery-items';
import { awardRoguePoints } from './difficulty';
import { awardGodEcho } from './echo';
import { coopRunRules } from './coop-collapse';
import type { RogueAccount, RogueCoopMemberState, RogueCoopSession, RogueNode, RogueRun } from './types';

type Inventory = Pick<RogueCoopMemberState, 'team' | 'box' | 'bag' | 'money' | 'growth' | 'systems' | 'pendingMoves'>;
export interface CoopPostgame {
	key: string;
	stage: 'offer' | 'battle' | 'won' | 'lost' | 'declined';
	choices: Record<string, string | null>;
	before: Record<string, Inventory>;
	node: RogueNode;
	encounter: number;
	rewards?: Record<string, number>;
	echoRewards?: Record<string, number>;
}
function inventory(member: RogueCoopMemberState): Inventory {
	const { team, box, bag, money, growth, systems, pendingMoves } = member;
	return structuredClone({ team, box, bag, money, growth, systems, pendingMoves });
}
export function offerCoopPostgame(session: RogueCoopSession) {
	const adventure = session.adventure!;
	if (adventure.postgame) throw new Error('神之挑战已经开启，不能重复领取通关成果。');
	const before: Record<string, Inventory> = {};
	for (const userid of [session.hostUser, session.guestUser]) {
		const member = adventure.members[userid];
		for (const mon of member.team) restoreMember(mon);
		before[userid] = inventory(member);
	}
	adventure.postgame = { key: randomUUID(), stage: 'offer', choices: {}, before,
		node: structuredClone(adventure.node!), encounter: adventure.encounter };
	adventure.phase = 'postgame';
	delete session.roomid;
}
export function coopPostgameView(session: RogueCoopSession, userid: string) {
	const adventure = session.adventure, postgame = adventure?.postgame;
	if (!postgame || adventure?.phase !== 'postgame') return;
	const partner = userid === session.hostUser ? session.guestUser : session.hostUser;
	return { key: postgame.key, stage: postgame.stage, cleared: !!adventure.campaignCleared,
		ownChoice: postgame.choices[userid] || null, partnerChoice: postgame.choices[partner] || null,
		points: postgame.rewards?.[userid] || 0, partnerPoints: postgame.rewards?.[partner] || 0,
		echoPoints: postgame.echoRewards?.[userid] || 0, partnerEchoPoints: postgame.echoRewards?.[partner] || 0 };
}
function restore(session: RogueCoopSession) {
	const adventure = session.adventure!, postgame = adventure.postgame!;
	for (const userid of [session.hostUser, session.guestUser]) {
		Object.assign(adventure.members[userid], structuredClone(postgame.before[userid]));
	}
}
/** Runs inside the session transaction. The store has already recorded the tower clear before this can be chosen. */
export function chooseCoopPostgame(
	session: RogueCoopSession, userid: string, key: string, value: string, moves?: Record<string, string>
) {
	const adventure = session.adventure!, postgame = adventure.postgame;
	if (session.status !== 'active' || adventure.phase !== 'postgame' || !adventure.campaignCleared ||
		key !== postgame?.key) throw new Error('神之挑战页面已更新，请刷新后重选。');
	const allowed = postgame.stage === 'offer' ? ['accept', 'decline', 'cancel'] : ['finish', 'cancel'];
	if (!allowed.includes(value)) throw new Error('请选择当前神之挑战的有效选项。');
	const owners = session.delegatedTo === userid ? [session.hostUser, session.guestUser] : [userid];
	for (const owner of owners) postgame.choices[owner] = value === 'cancel' ? null : value;
	if (!value || value === 'cancel' || ![session.hostUser, session.guestUser]
		.every(owner => postgame.choices[owner] === value)) return;
	postgame.choices = {}; postgame.key = randomUUID();
	if (value !== 'accept') {
		if (value === 'decline') postgame.stage = 'declined';
		adventure.phase = 'complete'; session.status = 'complete';
		delete session.roomid; delete session.delegatedTo;
		return;
	}
	if (!moves) throw new Error('神之挑战资料尚未就绪。');
	restore(session);
	postgame.stage = 'battle';
	adventure.node = { id: 'godchallenge', name: '神之挑战 · 阿尔宙斯', kind: 'boss',
		encounters: [arceusEncounter(100, moves)], reward: { money: 0, items: {} } };
	adventure.encounter = 0; adventure.phase = 'battle-selection';
	delete adventure.battleResult; delete adventure.battleToken; delete adventure.encounterId;
	delete adventure.battleCheckpoint; delete adventure.battleGrowth; delete adventure.battleLease;
	delete adventure.battleRecoverySelections; delete adventure.lastReward;
	adventure.continueSelections = {}; adventure.retrySelections = {};
	for (const member of Object.values(adventure.members)) delete member.coopLootReward;
}
/** No ordinary loot, blessing drops, XP unlocks or floor advance is awarded by this optional battle. */
export function settleCoopPostgame(session: RogueCoopSession, won: boolean,
	changeAccount: (userid: string, update: (account: RogueAccount) => void) => void
) {
	const adventure = session.adventure!, postgame = adventure.postgame!;
	if (postgame.stage !== 'battle') throw new Error('神之挑战已经结算。');
	restore(session);
	adventure.node = structuredClone(postgame.node); adventure.encounter = postgame.encounter;
	postgame.stage = won ? 'won' : 'lost'; postgame.key = randomUUID(); postgame.choices = {};
	postgame.rewards = {};
	postgame.echoRewards = {};
	for (const userid of [session.hostUser, session.guestUser]) {
		if (won) changeAccount(userid, account => {
			postgame.rewards![userid] = awardRoguePoints(account, { difficulty: adventure.difficulty } as RogueRun, 20);
			const run = { floor: adventure.floor, difficulty: adventure.difficulty, ...coopRunRules(adventure),
				postgame: { stage: 'won' } } as RogueRun;
			postgame.echoRewards![userid] = awardGodEcho(account, run);
		});
		adventure.members[userid].notices = [won ?
			`神之挑战成功，额外获得 ${postgame.rewards[userid]} 点局外成长点。200 层通关成果保持不变。` :
			'神之挑战结束，200 层通关成果已保留。双方队伍和背包恢复至挑战前。'];
	}
	adventure.phase = 'postgame';
	delete adventure.captureProposal; delete adventure.battleCheckpoint; delete adventure.battleGrowth;
	delete adventure.battleRecoverySelections; delete session.exitProposal;
}
