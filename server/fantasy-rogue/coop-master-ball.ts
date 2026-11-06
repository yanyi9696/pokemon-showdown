import type { RogueAccount, RogueCoopAdventure, RogueCoopSession, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { fixedFloor } from './content';
import { addMasterBallRoute, chooseMasterBall, masterBallEventView,
	masterBallRoute, selectMasterBallRoute } from './master-ball';

type AccountChange = (userid: string, update: (account: RogueAccount) => void) => void;
const runID = (adventure: RogueCoopAdventure, owner: string) => `${adventure.id}:${owner}`;
export const isCoopMasterBallRoute = (node?: RogueNode) =>
	!!node && ['masterballgift', 'masterballreward'].includes(node.id);

/** A narrow adapter used only by the native Master Ball helpers, never by the adventure engine. */
function questRun(adventure: RogueCoopAdventure, owner: string): RogueRun {
	const member = adventure.members[owner];
	return {
		id: runID(adventure, owner), floor: adventure.floor, phase: 'event',
		node: structuredClone(adventure.node), choices: structuredClone(adventure.routeChoices),
		masterBallQuest: structuredClone(adventure.masterBallQuest),
		masterBallLedger: structuredClone(member.masterBallLedger),
		bag: { ...member.bag }, notices: [...(member.notices || [])],
		eventHistory: structuredClone(adventure.coopEventHistory || []),
	} as RogueRun;
}

export function prepareCoopMasterBallRoutes(adventure: RogueCoopAdventure, random: RogueRandom) {
	if (!adventure.routeChoices?.length || fixedFloor(adventure.floor)) return;
	const quest = adventure.masterBallQuest;
	if (quest) {
		if (quest.floor === adventure.floor && ['offer', 'reward'].includes(quest.stage)) {
			adventure.routeChoices = adventure.routeChoices.filter(node => !isCoopMasterBallRoute(node));
			adventure.routeChoices.push(masterBallRoute(quest.stage === 'reward'));
		}
		return;
	}
	if ((adventure.masterBallRollFloor || 0) >= adventure.floor) return;
	adventure.masterBallRollFloor = adventure.floor;
	const run = questRun(adventure, Object.keys(adventure.members)[0]);
	addMasterBallRoute(run, random);
	adventure.masterBallQuest = run.masterBallQuest;
	adventure.routeChoices = run.choices;
}

export function selectCoopMasterBallRoute(session: RogueCoopSession, id: string) {
	const adventure = session.adventure!, run = questRun(adventure, session.hostUser);
	if (!selectMasterBallRoute(run, id)) throw new Error('极境馈赠路线已变化，请刷新后重选。');
	adventure.node = run.node;
	adventure.coopEventChoices = { [session.hostUser]: null, [session.guestUser]: null };
	delete adventure.coopEventBranchResolved;
	for (const member of Object.values(adventure.members)) {
		delete member.coopEvent; delete member.coopEventReward;
	}
}

export function coopMasterBallView(session: RogueCoopSession, userid: string) {
	const adventure = session.adventure!;
	if (adventure.phase !== 'route-interaction' || !isCoopMasterBallRoute(adventure.node)) return;
	const run = questRun(adventure, userid), view = masterBallEventView(run);
	if (!view || adventure.masterBallQuest?.floor !== adventure.floor ||
		!['offer', 'reward'].includes(adventure.masterBallQuest.stage)) return;
	const partner = userid === session.hostUser ? session.guestUser : session.hostUser;
	return { ...view, key: `${adventure.id}:masterball:${adventure.floor}:${adventure.masterBallQuest.stage}`,
		sideRoute: true, branchResolved: false, branchOptions: view.options, options: [],
		paragraphs: [...view.paragraphs, '双方共同作出选择；领取时每人各得一颗。完成后返回本层路线，不消耗本层。'],
		ownChoice: adventure.coopEventChoices?.[userid] || null,
		partnerChoice: adventure.coopEventChoices?.[partner] || null,
	};
}

/** Called inside the same transaction as the common vote and both account writes. */
export function chooseCoopMasterBall(session: RogueCoopSession, choice: string, changeAccount: AccountChange) {
	const adventure = session.adventure!, claiming = adventure.masterBallQuest?.stage === 'reward';
	const runs = [session.hostUser, session.guestUser].map(userid => ({ userid, run: questRun(adventure, userid) }));
	for (const { userid, run } of runs) {
		const select = (account: RogueAccount) => {
			const view = masterBallEventView(run);
			if (!view || !chooseMasterBall(account, run, { id: 'coop-master-ball', revision: 0,
				action: 'event', member: view.key, value: choice })) throw new Error('极境馈赠进度无效。');
		};
		if (claiming) changeAccount(userid, select);
		else select({} as RogueAccount); // The offer only changes the run; it never reads or writes account state.
		const member = adventure.members[userid];
		member.bag = run.bag; member.notices = run.notices; member.masterBallLedger = run.masterBallLedger;
	}
	adventure.masterBallQuest = runs[0].run.masterBallQuest;
	adventure.routeChoices = runs[0].run.choices;
	adventure.coopEventHistory = runs[0].run.eventHistory;
	adventure.phase = 'area-selection'; delete adventure.node; delete adventure.lastReward;
	delete adventure.coopEventChoices; delete adventure.coopEventBranchResolved;
	session.areaSelections = { [session.hostUser]: null, [session.guestUser]: null };
}

function stock(bag: Record<string, number>) {
	const count = bag.masterball ?? 0;
	if (!Number.isSafeInteger(count) || count < 0) throw new Error('大师球库存记录无效。');
	return count;
}

/** Preserve consumption when a battle or travel snapshot restores an older bag. */
export function syncCoopMasterBalls(
	session: RogueCoopSession, previous: RogueCoopSession, accountFor: (userid: string) => RogueAccount,
	changeAccount: AccountChange
) {
	const adventure = session.adventure;
	if (!adventure) return;
	for (const [index, userid] of [session.hostUser, session.guestUser].entries()) {
		const member = adventure.members[userid];
		const prior = previous.adventure?.id === adventure.id ?
			previous.adventure.members[userid]?.masterBallLedger : undefined;
		const ledger = prior || member.masterBallLedger;
		if (!ledger) continue;
		if (![ledger.remaining, ledger.used].every(n => Number.isSafeInteger(n) && n >= 0) ||
			ledger.remaining + ledger.used !== 1) throw new Error('大师球消耗账本无效。');
		if (!prior && (adventure.masterBallQuest?.stage !== 'claimed' || ledger.remaining !== 1 || ledger.used !== 0 ||
			!accountFor(userid).masterBalls?.obtained.some(entry => entry.run === runID(adventure, userid)))) {
			throw new Error('缺少本局大师球领取凭据。');
		}
		const checkpoint = adventure.battleCheckpoint;
		const checkpointBag = checkpoint?.result[index ? 'partnerBag' : 'bag'];
		const liveCheckpoint = ['battle', 'battle-starting'].includes(adventure.phase) && checkpoint &&
			checkpoint.result.encounterId === adventure.encounterId;
		const remaining = Math.min(ledger.remaining, stock(member.bag),
			liveCheckpoint && checkpointBag ? stock(checkpointBag) : ledger.remaining);
		const spent = ledger.remaining - remaining;
		member.masterBallLedger = { remaining, used: ledger.used + spent };
		if (spent) changeAccount(userid, account => {
			if (!account.masterBalls?.obtained.some(entry => entry.run === runID(adventure, userid))) {
				throw new Error('大师球消耗缺少领取凭据。');
			}
			account.masterBalls.used += spent;
		});
		for (const bag of [member.bag, member.coopEvent?.memory?.bag, checkpointBag,
			checkpoint?.state.fantasyRogue?.[index ? 'partnerBag' : 'bag']]) {
			if (!bag) continue;
			if (remaining) bag.masterball = remaining;
			else delete bag.masterball;
		}
	}
}
