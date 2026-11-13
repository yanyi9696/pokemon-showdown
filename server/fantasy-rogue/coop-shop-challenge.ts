import { createHash } from 'crypto';
import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { beginShopChallenge, grantShopChallengeReward } from './shop-challenge';
import { shopStock } from './trading';
import { clearBattleSelections } from './coop-battle-selection';
import { withSharedRewardRolls } from './shared-reward-rolls';
import type { RogueContent, RogueCoopSession, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';

function commonStock(runs: RogueRun[], content: RogueContent) {
	const stocks = runs.map(run => shopStock(content, run)
		.filter(item => item.remaining === undefined || item.remaining > 0));
	return stocks[0].filter(item => stocks.every(stock => stock.some(other => other.id === item.id)));
}

export function coopShopChallengeView(
	session: RogueCoopSession, runs: RogueRun[], content: RogueContent, userid: string
) {
	const a = session.adventure, node = a?.node;
	if (session.status !== 'active' || !a || !node || a.phase !== 'route-interaction' ||
		node.mainlineScene || !['rest', 'trade'].includes(node.kind) ||
		['growth', 'buyback'].includes(node.trade?.kind || '') ||
		node.shopChallenge || node.rocket && !node.rocket.cleared ||
		!runs.every(run => ownsBlessing(run.blessings, 'shopraid'))) return null;
	const stock = commonStock(runs, content);
	const key = createHash('sha256').update(JSON.stringify([a.id, a.floor, node.id, session.delegatedTo,
		stock.map(item => [item.id, item.remaining])])).digest('hex');
	const locked = a.tradeProposal ? '请先完成或撤回队伍交换。' :
		node.event && (!a.coopEventBranchResolved || !Object.values(a.members).every(member => member.coopEvent?.settled)) ?
			'请先完成双方的商店事件选项。' :
			a.mentor?.floor === a.floor + 1 && !a.mentor.card ? '请先共同选择首领卡。' :
			Object.values(a.members).some(member => member.pendingCaptures?.length || member.pendingMoves?.length ||
				member.companionInvitations?.length || member.blessings?.pending?.length) ? '请先处理双方的伙伴、招式与祝福奖励。' :
			!runs.every(run => run.team.some(mon => !mon.egg && !mon.nuzlockeDead && mon.hp > 0)) ?
				'双方都需要至少一只可出战的伙伴。' : !stock.length ? '本店没有双方均可获得的在售商品。' : '';
	const votes = a.shopChallengeChoice?.key === key ? a.shopChallengeChoice.selections : {};
	return { key, locked, count: Math.min(3, stock.length), ownChoice: !!votes[userid],
		partnerChoice: !!votes[userid === session.hostUser ? session.guestUser : session.hostUser] };
}

export function chooseCoopShopChallenge(
	session: RogueCoopSession, runs: RogueRun[], content: RogueContent, random: RogueRandom,
	userid: string, key?: string, confirm?: boolean
) {
	const view = coopShopChallengeView(session, runs, content, userid);
	if (!view || view.key !== key || ![session.hostUser, session.guestUser].includes(userid) ||
		session.delegatedTo && session.delegatedTo !== userid) throw new Error('商店挑战已变化，请刷新后重新确认。');
	if (confirm && view.locked) throw new Error(view.locked);
	const a = session.adventure!;
	if (a.shopChallengeChoice?.key !== key) a.shopChallengeChoice = { key: view.key, selections: {} };
	for (const owner of session.delegatedTo ? [session.hostUser, session.guestUser] : [userid]) {
		if (confirm) a.shopChallengeChoice.selections[owner] = true;
		else delete a.shopChallengeChoice.selections[owner];
	}
	a.routeExitSelections = {};
	if (![session.hostUser, session.guestUser].every(owner => a.shopChallengeChoice!.selections[owner])) return;
	const run = runs[0], stock = commonStock(runs, content);
	run.node = structuredClone(a.node!);
	run.node.encounters = []; // A completed Persian raid or shop event is not fought again.
	delete run.node.wildLoot; delete run.node.wildCandyTraining;
	run.phase = 'rest';
	beginShopChallenge(run, content, random, stock);
	a.node = run.node; a.encounter = run.encounter; a.phase = 'battle-selection';
	delete a.battleResult; delete a.battleToken; delete a.encounterId;
	delete a.battleCheckpoint; delete a.battleGrowth; delete a.battleRecoverySelections;
	delete a.shopChallengeChoice;
	a.continueSelections = {}; a.retrySelections = {};
	clearBattleSelections(session); session.roomid = undefined;
}

export function settleCoopShopChallenge(
	session: RogueCoopSession, runs: RogueRun[], content: RogueContent, random: RogueRandom,
	won: boolean, retreated: boolean
) {
	const a = session.adventure!, challenge = a.node?.shopChallenge;
	if (!challenge || challenge.closed || retreated) return null;
	const rolls = new Map<string, unknown>();
	const receipts = runs.map(run => ({ floor: a.floor, name: won ? '零元购 · 挑战成功' : '零元购 · 商店关闭',
		money: 0, points: 0, items: won ? withSharedRewardRolls(run, rolls,
			() => grantShopChallengeReward(run, content, random)) : {} }));
	challenge.closed = true;
	a.node!.reward = { money: 0, items: {} };
	return receipts;
}
