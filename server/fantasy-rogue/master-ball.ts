import type { RogueAccount, RogueRun, RogueNode, RogueCommand } from './types';
import type { RogueRandom } from './biome-pools';
import { eventOpening } from './event-text';

export const MASTER_BALL_EVENT = { chance: 5, denominator: 10000 };
export interface MasterBallQuest { floor: number; stage: 'offer' | 'reward' | 'claimed' | 'declined' }
export interface MasterBallCollection {
	obtained: { run: string, floor: number, at: number }[]; used: number;
}
const route = (reward: boolean): RogueNode => ({ id: reward ? 'masterballreward' : 'masterballgift',
	kind: reward ? 'reward' : 'event', name: reward ? '极境宝库 · 大师球' : '无垠极境的终极馈赠',
	encounters: [], reward: { money: 0, items: {} } });
export function addMasterBallRoute(run: RogueRun, random: RogueRandom) {
	if (!run.choices || run.masterBallQuest) return;
	if (random(MASTER_BALL_EVENT.denominator) >= MASTER_BALL_EVENT.chance) return;
	run.masterBallQuest = { floor: run.floor, stage: 'offer' };
	run.choices.push(route(false));
}
export function selectMasterBallRoute(run: RogueRun, id: string) {
	const q = run.masterBallQuest;
	if (!q || q.floor !== run.floor || !run.choices?.some(n => n.id === id) ||
		id !== (q.stage === 'offer' ? 'masterballgift' : q.stage === 'reward' ? 'masterballreward' : '')) return false;
	run.node = route(q.stage === 'reward'); run.phase = 'event'; return true;
}
export function masterBallEventView(run: RogueRun) {
	const q = run.masterBallQuest;
	if (!q || run.phase !== 'event' || !['masterballgift', 'masterballreward'].includes(run.node?.id || '')) return;
	return { id: 'masterballgift', key: run.id + ':masterball:' + q.stage, stage: 'choice', title: run.node!.name,
		paragraphs: q.stage === 'offer' ? eventOpening('masterballgift') : ['箱盖缓缓打开，紫白相间的大师球躺在衬垫中。', '「去遇见你想同行的伙伴吧。」大师球 ×1，领取后存入本局背包。'],
		options: q.stage === 'offer' ? [
			{ id: 'promise', disabled: false, name: '留给愿意一起走下去的伙伴。', text: '向研究员许下约定，开启本层的极境宝库。' },
			{ id: 'discovery', disabled: false, name: '留给尚未见过的宝可梦。', text: '与研究员分享期待，开启本层的极境宝库。' },
		] : [{ id: 'claim', disabled: false, name: '收下大师球', text: '大师球 ×1，存入本局背包。' }],
	};
}
export function chooseMasterBall(account: RogueAccount, run: RogueRun, command: RogueCommand) {
	const view = masterBallEventView(run);
	if (!view) return false;
	if (command.member !== view.key || !view.options.some(o => o.id === command.value)) throw new Error('馈赠选项已经更新。');
	const q = run.masterBallQuest!;
	if (q.stage === 'offer') {
		q.stage = 'reward';
		run.choices = (run.choices || []).filter(n => n.id !== 'masterballgift').concat(route(true));
		(run.eventHistory ||= []).push({ id: 'masterballgift', floor: run.floor });
	} else {
		const collection = account.masterBalls ||= { obtained: [], used: 0 };
		if (collection.obtained.some(e => e.run === run.id)) throw new Error('本局已领取大师球。');
		collection.obtained.push({ run: run.id, floor: run.floor, at: Date.now() });
		q.stage = 'claimed'; run.masterBallLedger = { remaining: 1, used: 0 }; run.bag.masterball = 1;
		run.choices = (run.choices || []).filter(n => n.id !== 'masterballreward');
		(run.notices ||= []).push('大师球 ×1 已放入本局背包。本局仅能获得一次，开启下一局时不会保留。');
	}
	delete run.node; run.phase = 'choose'; return true;
}
/** Keep this run's consumption outside rollback inventories; no stock is inherited by new runs. */
export function syncMasterBalls(account: RogueAccount, previous?: { id: string, count: number }) {
	const run = account.run;
	if (!run?.masterBallLedger) return;
	const ledger = run.masterBallLedger;
	if (previous?.id === run.id) {
		const spent = Math.max(0, previous.count - (run.bag.masterball || 0));
		ledger.remaining = Math.max(0, ledger.remaining - spent); ledger.used += spent;
		if (account.masterBalls) account.masterBalls.used += spent;
	}
	for (const bag of [run.bag, run.checkpoint?.bag, run.postgame?.before.bag]) if (bag) {
		if (ledger.remaining) bag.masterball = ledger.remaining;
		else delete bag.masterball;
	}
}
