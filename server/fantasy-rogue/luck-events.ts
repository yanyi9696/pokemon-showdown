import type { RogueRun, RogueContent } from './types';
import type { RogueRandom } from './biome-pools';
import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { eventRewardBudget, routeCandyReward } from './early-balance';
import { giveEquipment } from './blessings';
import { isLuckEvent, LUCK_EVENT_TEXT, luckEventOptions, luckOutcomeText, type LuckEventID } from './luck-event-data';

export interface LuckEventResult { kind: 'coin' | 'die'; face: number; loaded: boolean }
export const luckEventEligible = (floor: number, id: string) => id !== 'clefairydice' || floor >= 51;
const DIE_PORTIONS = [1, 1, 2, 2, 3, 4];
const MOON_SHARDS = [3, 4, 5, 6, 8, 15];

/** Only the shown coin/die is overridden. Item-conversion and other RNG keep their normal rules. */
function rollLuck(run: RogueRun, id: LuckEventID, random: RogueRandom): LuckEventResult {
	const kind = LUCK_EVENT_TEXT[id].kind, loaded = !!ownsBlessing(run.blessings, 'dice');
	return { kind, loaded, face: loaded ? kind === 'coin' ? 1 : 6 : random(kind === 'coin' ? 2 : 6) + 1 };
}
export function luckEventView(run: RogueRun) {
	const event = run.node!.event!;
	if (!isLuckEvent(event.id) || event.stage !== 'choice' || event.settled) return { options: [] };
	return { options: luckEventOptions(event.id) };
}
export function chooseLuckEvent(run: RogueRun, content: RogueContent, random: RogueRandom, choice: string) {
	const event = run.node!.event!;
	if (!isLuckEvent(event.id) || event.stage !== 'choice' || event.settled ||
		!luckEventEligible(run.floor, event.id) || !luckEventOptions(event.id).some(option => option.id === choice)) {
		throw new Error('事件选项已更新或无法选择。');
	}
	if (choice === 'leave') {
		Object.assign(event, { stage: 'result', settled: true, result: [LUCK_EVENT_TEXT[event.id].farewell] });
		return;
	}
	const result = rollLuck(run, event.id, random), face = result.face;
	const items: Record<string, number> = {};
	let money = 0, shards = 0;
	if (event.id === 'meowthcoin') {
		const base = Math.max(50, Math.round(eventRewardBudget(run.floor) / 3 / 50) * 50);
		money = base * (face === 1 ? 3 : 1);
	} else if (event.id === 'chanseycoin') {
		items[run.floor < 29 ? 'potion' : run.floor < 69 ? 'superpotion' : 'hyperpotion'] = face === 1 ? 3 : 1;
		items.ether = face === 1 ? 2 : 1;
		if (face === 1) items.revive = 1;
	} else if (event.id === 'shuckledice') {
		items[run.floor < 29 ? 'oranberry' : 'sitrusberry'] = DIE_PORTIONS[face - 1];
		if (face === 6) { items.leppaberry = 1; items.lumberry = 1; }
	} else if (event.id === 'delibirddice') {
		for (const [id, count] of Object.entries(routeCandyReward(run.floor, 'reward'))) {
			items[id] = count * DIE_PORTIONS[face - 1];
		}
		if (face === 6) items.ether = 1;
	} else {
		shards = MOON_SHARDS[face - 1];
		if (face === 6) items.moonstone = 1;
	}
	const before = { ...run.bag };
	for (const [id, count] of Object.entries(items)) giveEquipment(run, content, random, id, count);
	run.money += money;
	run.blessings!.shards += shards;
	const rewards = Object.entries(run.bag).filter(([id, count]) => count > (before[id] || 0))
		.map(([id, count]) => `【${content.items.find(item => item.id === id)?.name || id}】×${count - (before[id] || 0)}`);
	if (money) rewards.unshift(`${money} 金币`);
	if (shards) rewards.unshift(`幻想碎片 ×${shards}`);
	Object.assign(event, { stage: 'result', settled: true, luck: result, result: [
		...luckOutcomeText(event.id, face),
		...(result.loaded ? [`【灌铅骰子】生效：${result.kind === 'coin' ? '硬币必为正面' : '骰子必为 6 点'}。`] : []),
		`获得${rewards.join('、')}。`,
	] });
}
