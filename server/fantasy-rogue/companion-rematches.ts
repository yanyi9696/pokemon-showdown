import { awardRoguePoints } from './difficulty';
import { randomUUID } from 'crypto';
import { travellingRoster } from './travellers';
import { TRAVELLERS } from './traveller-profiles';
import type { RogueAccount, RogueEncounter, RogueRun, RogueTrainer } from './types';
import { dialoguePage, healNarrativeParty, queueNarrative } from './narrative';
import { grantExclusiveItem } from './exclusive-items';

export interface CompanionRematch {
	id: string; companion: string; floor: number; nextFloor: number;
	encounter: RogueEncounter; reward: { money: number, items: Record<string, number>, points: number };
	exclusiveItem?: string; claimed?: boolean;
}
const companionName = (run: RogueRun, id: string) =>
	travellingRoster(run).find(c => c.id === id)?.name || TRAVELLERS[id]?.name || id;
export function opposingCompanion(run: RogueRun, trainer?: RogueTrainer): string | undefined {
	if (!trainer) return undefined;
	const name = trainer.name?.split(' · ').pop()?.replace(/萝/g, '罗');
	return travellingRoster(run).find(c => trainer.id === c.id || trainer.avatar === c.id || name === c.name)?.id;
}
export function eligibleRematches(run: RogueRun) {
	return (run.rematches || []).filter(entry => !entry.claimed && run.floor >= entry.nextFloor &&
		travellingRoster(run).some(c => c.id === entry.companion));
}
export function deferCompanionChallenge(run: RogueRun, companion: string) {
	const node = run.node!, encounter = node.encounters[run.encounter];
	const id = `${run.floor}:${node.id}:${run.encounter}:${companion}`;
	run.rematches ||= [];
	if (!run.rematches.some(entry => entry.id === id)) run.rematches.push({ id, companion, floor: run.floor,
		nextFloor: run.floor + 5, encounter: structuredClone(encounter),
		reward: { ...structuredClone(node.reward), points: node.kind === 'boss' ? 1 : 0 },
		exclusiveItem: node.event?.id === 'exclusivechallenge' ? node.event.exclusive?.item : undefined });
	node.companionLoss = true;
	node.reward = { money: 0, items: {} };
	if (node.event) {
		node.event.stage = 'result'; node.event.settled = true; node.event.trainingAidBlocked = true;
		node.event.result = ['这次切磋还没能取胜。伙伴已恢复健康，奖励留待下次获胜后领取。'];
	}
	healNarrativeParty(run);
	run.encounter = node.encounters.length;
	run.notices = ['同行训练家照顾好了全队，本次挑战未通过；可以继续爬塔，之后在事件区域再次切磋。'];
	queueNarrative(run, [dialoguePage(companion, companionName(run, companion),
		'先别急着低头，你们刚才的配合我都看到了。把伙伴交给我，休息一下。', true),
	dialoguePage(companion, companionName(run, companion),
		'今天这场算我赢。奖励先替你留着，等路上你准备好了，我们再认真较量一次。往前走吧，我还陪着你呢。', true)], 'settlement');
}
export function prepareRematch(run: RogueRun) {
	const debt = eligibleRematches(run)[0];
	if (!debt) throw new Error('当前没有可再次切磋的同行训练家。');
	run.node!.event!.rematch = debt.id;
	queueNarrative(run, [dialoguePage(debt.companion, companionName(run, debt.companion),
		`还记得第 ${debt.floor} 层那场对战吗？这一路，你和伙伴又进步了不少。现在想再试试吗？没准备好也没关系。`, true, 'left')], 'event');
}
export function rematchView(run: RogueRun) {
	const event = run.node!.event!, debt = run.rematches!.find(entry => entry.id === event.rematch)!;
	return { paragraphs: event.result || [
		`${companionName(run, debt.companion)}向你发出切磋邀请。对手沿用上次的队伍与等级；获胜后补领第 ${debt.floor} 层的奖励。`,
	],
	options: event.stage !== 'choice' ? [] : [
		{ id: 'accept', name: '准备好了，再来一场！', text: '', disabled: false },
		{ id: 'decline', name: '再让我和伙伴准备一阵吧。', text: '', disabled: false },
	] };
}
export function chooseRematch(run: RogueRun, choice: string) {
	const node = run.node!, event = node.event!, debt = run.rematches!.find(entry => entry.id === event.rematch)!;
	if (choice === 'decline') {
		debt.nextFloor = run.floor + 5;
		event.stage = 'result'; event.settled = true;
		event.result = ['「好，我们再往前走一段。准备好了随时叫我。」']; return;
	}
	event.stage = 'battle'; event.committed = true; event.key = randomUUID();
	node.encounters = [structuredClone(debt.encounter)]; node.encounters[0].key = randomUUID();
	// The saved encounter already includes the original blessing level surcharge.
	node.blessingPrepared = true; node.spiritPrepared = true;
	node.reward = { money: 0, items: {} }; delete node.wildLoot;
	run.encounter = 0; run.phase = 'ready';
}
export function settleRematch(account: RogueAccount, run: RogueRun, won: boolean) {
	const event = run.node!.event!, debt = run.rematches!.find(entry => entry.id === event.rematch)!;
	healNarrativeParty(run);
	event.stage = 'result'; event.settled = true; event.trainingAidBlocked = true;
	if (won && !debt.claimed) {
		debt.claimed = true;
		run.money += debt.reward.money;
		const points = awardRoguePoints(account, run, debt.reward.points);
		for (const [item, count] of Object.entries(debt.reward.items)) run.bag[item] = (run.bag[item] || 0) + count;
		if (debt.exclusiveItem) grantExclusiveItem(run, debt.exclusiveItem);
		run.lastReward = { floor: run.floor, name: `第 ${debt.floor} 层 · 切磋补领奖励`, ...structuredClone(debt.reward), points };
	} else debt.nextFloor = run.floor + 5;
	const line = won ? '这次是你赢了！说好的奖励现在交给你。把这份默契带到下一场对战吧。' :
		'我已经替伙伴们恢复好了。刚才那一步比上次更果断了，我很期待你们下一次的表现。';
	event.result = [line, '全队 HP、PP 与异常状态已恢复。'];
	queueNarrative(run, [dialoguePage(debt.companion, companionName(run, debt.companion), line, true, 'left')], 'settlement');
}
