import { randomUUID } from 'crypto';
import { Dex } from '../../sim/dex';
import type { RogueAccount, RogueContent, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { makeEncounterSet, randomEncounterIVs } from './encounter-sets';
import { lowerToEligibleStage } from './evolution';
import {
	drawBlessingGift, gift, giveEquipment, normalizeBlessings, recordNegativeBlessingEvent, toolbox,
} from './blessings';
import { LOOT_STAGES, TREASURES } from './economy';
import { simulateForestBattle } from './event-battle';
import {
	trainingEvent, trainingFloor, serviceEventView, chooseServiceOption, settleServiceBattle,
} from './event-services';

import { EVENT_NAMES, EVENT_TEXT, eventOpening, type EventID } from './event-text';
export { EVENT_NAMES, type EventID } from './event-text';
export interface RogueEvent {
	service?: import('./event-services').ServiceEvent;
	memory?: import('./event-travel').TravelMemory;
	exchange?: { before: string, after: string, member: string };
	id: EventID;
	key: string;
	stage: 'choice' | 'watch' | 'battle' | 'result';
	ball?: string;
	teams?: PokemonSet[][];
	support?: number;
	replay?: { log: string[], winner: number | null };
	result?: string[];
	battleReward?: number | 'room';
	/** Persisted before returning to the client. All payouts are inside the account transaction. */
	settled?: boolean;
	/** Only authored dialogue may explicitly allow leaving an ongoing battle. */
	allowRetreat?: boolean;
}
export function canRetreatRogue(run: RogueRun) {
	return !run.node?.event || run.node.event.allowRetreat === true;
}
const dex = Dex.mod('gen9fantasy');
const ordinaryLevel = (floor: number) => Math.max(3, Math.min(100, Math.ceil(floor / 2)));
export function eventBudget(floor: number, multiplier = 1) {
	const base = (floor < 30 ? 750 : floor < 80 ? 1250 : floor < 140 ? 2450 : 5650) + 8 * floor;
	return Math.round(base * multiplier / 50) * 50;
}
export function expectedWildLoot(floor: number) {
	const stage = LOOT_STAGES[Math.min(4, Math.floor((floor - 1) / 40))];
	const value = stage.weights.reduce((sum, weight, i) => sum + weight * TREASURES[i].sellPrice!, 0);
	return (stage.min + stage.max) / 2 * value / stage.weights.reduce((a, b) => a + b, 0);
}

/** Preserve fixed floors and the third route. Ordinary battle slots can become authored events. */
export function eventRouteTemplates(templates: RogueNode[], random: RogueRandom) {
	return templates.map((node, i) => node.kind === 'wild' && random(100) >= 70 ? {
		id: `event${i}`, name: '路途见闻', kind: 'event' as const,
		encounters: [], reward: { money: 0, items: {} },
	} : node);
}

export function chooseEvent(run: RogueRun, random: RogueRandom): EventID {
	const history = run.eventHistory || [], last = history[history.length - 1]?.id;
	const candidates = (Object.keys(EVENT_NAMES) as EventID[]).filter(id => id !== last && run.floor >= trainingFloor(id));
	const unseen = candidates.filter(id => !history.some(entry => entry.id === id));
	if (unseen.length) return unseen[random(unseen.length)];
	const cooled = candidates.filter(id => {
		const index = history.map(entry => entry.id).lastIndexOf(id), old = history[index];
		const limited = id === 'room' || id === 'mushrooms';
		return !old || run.floor - old.floor >= (limited ? 25 : 8) && history.length - index - 1 >= (limited ? 4 : 2);
	});
	const pool = cooled.length ? cooled : candidates;
	// Prefer the least recent when all eligible events are on cooldown, without repeating the last event.
	const weights = pool.map(id => 1 + history.length - history.map(entry => entry.id).lastIndexOf(id));
	let roll = random(weights.reduce((a, b) => a + b, 0));
	return pool[weights.findIndex(weight => { roll -= weight; return roll < 0; })];
}

function forestTeams(level: number, random: RogueRandom) {
	// Mirror the roster, stats and lead order. Merely rotating one trio produces near-certain
	// type-counter sweeps, so vary both sides together until more balanced templates are available.
	const themes = [
		['Venusaur', 'Charizard', 'Blastoise'], ['Sceptile', 'Blaziken', 'Swampert'],
		['Meganium', 'Typhlosion', 'Feraligatr'], ['Torterra', 'Infernape', 'Empoleon'],
	];
	const names = themes[random(themes.length)];
	const team = names.map(name => makeEncounterSet(lowerToEligibleStage(name, level), level, randomEncounterIVs(random)));
	for (const set of team) { set.nature = 'Hardy'; set.gender = dex.species.get(set.species).gender || 'M'; }
	const offset = random(3);
	const ordered = [...team.slice(offset), ...team.slice(0, offset)];
	return [structuredClone(ordered), structuredClone(ordered)];
}

export function beginEvent(run: RogueRun, random: RogueRandom) {
	const id = chooseEvent(run, random);
	const event: RogueEvent = { id, key: randomUUID(), stage: 'choice' };
	if (id === 'mysteryball') {
		const roll = random(100), weights = run.floor <= 40 ? [85, 99] : run.floor <= 100 ? [60, 90] : [40, 75];
		event.ball = roll < weights[0] ? 'pokeball' : roll < weights[1] ? 'greatball' : 'ultraball';
	}
	if (id === 'forest') event.teams = forestTeams(ordinaryLevel(run.floor), random);
	(run.eventHistory ||= []).push({ id, floor: run.floor });
	run.node!.event = event;
	run.node!.name = EVENT_NAMES[id];
	run.node!.reward = { money: 0, items: {} };
	run.phase = 'event';
}

function supplies(run: RogueRun, content: RogueContent, random: RogueRandom, budget: number, fruit = false) {
	if (budget <= 0) return;
	const candy = run.floor < 30 ? 'expcandyxs' :
		run.floor < 80 ? 'expcandys' : run.floor < 140 ? 'expcandym' : 'expcandyl';
	const pool = content.items.filter(item => fruit ?
		['oranberry', 'sitrusberry', candy].includes(item.id) || item.kind === 'effort' && item.amount === 1 :
		['ball', 'heal', 'revive', 'cure', 'ether', 'treasure'].includes(item.kind))
		.map(item => ({ id: item.id, value: item.sellPrice || item.price }))
		.filter(item => item.value > 0);
	let left = Math.round(budget * (0.8 + random(401) / 1000));
	for (let i = 0; i < 5 && left > 0; i++) {
		const available = pool.filter(item => item.value <= left);
		if (!available.length) break;
		const item = available[random(available.length)];
		const count = Math.max(1, Math.floor(left / (3 - Math.min(i, 2)) / item.value));
		giveEquipment(run, content, random, item.id, count);
		left -= count * item.value;
	}
	if (left > 0) run.money += left;
}

function outcome(run: RogueRun, text: string[]) {
	const event = run.node!.event!;
	event.stage = 'result'; event.result = text; event.settled = true;
	run.phase = 'event';
}
function loseMoney(run: RogueRun) {
	const cost = Math.min(run.money, eventBudget(run.floor, 0.5));
	run.money -= cost;
	if (cost) recordNegativeBlessingEvent(run, 'outcome');
	return cost;
}
function prepareBattle(run: RogueRun, team: PokemonSet[], reward: number | 'room', text: string, punitive = false) {
	const node = run.node!, event = node.event!;
	event.stage = 'battle'; event.battleReward = reward; event.result = [text];
	delete node.spiritPrepared; delete node.blessingPrepared;
	node.encounters = [{ name: '野生宝可梦', style: 'balanced', team: structuredClone(team), catchable: true }];
	run.encounter = 0; run.phase = 'ready';
	if (punitive) recordNegativeBlessingEvent(run, 'outcome');
}
function rewardReceipt(run: RogueRun, before: { money: number, bag: Record<string, number> }) {
	const items: Record<string, number> = {};
	for (const [id, count] of Object.entries(run.bag)) {
		const gained = count - (before.bag[id] || 0);
		if (gained > 0) items[id] = gained;
	}
	const old = run.lastReward?.floor === run.floor ? run.lastReward : undefined;
	for (const [id, count] of Object.entries(old?.items || {})) items[id] = (items[id] || 0) + count;
	run.lastReward = { floor: run.floor, name: run.node!.name, items,
		money: (old?.money || 0) + run.money - before.money, points: 0 };
}

export function chooseEventOption(account: RogueAccount, run: RogueRun, content: RogueContent, random: RogueRandom,
	key: string | undefined, choice: string | undefined, evs?: StatsTable) {
	const event = run.node?.event;
	const view = eventView(run), service = serviceEventView(run);
	if (run.phase !== 'event' || !event || event.key !== key || event.settled ||
		![...(view?.options || []), ...(service?.picker?.options || [])]
			.some(option => option.id === choice && !option.disabled)) {
		throw new Error('事件选项已更新或无法选择。');
	}
	normalizeBlessings(run);
	const before = { money: run.money, bag: { ...run.bag } };
	if (trainingEvent(event.id)) {
		chooseServiceOption(account, run, content, random, choice!, evs);
		rewardReceipt(run, before);
		return;
	}
	const level = Math.min(100, ordinaryLevel(run.floor) + 3);
	if (event.stage === 'watch' && choice === 'watched') {
		const winner = event.replay!.winner;
		if (winner === null) {
			supplies(run, content, random, eventBudget(run.floor, 0.5), true);
			outcome(run, [EVENT_TEXT.tie]);
		} else if (winner === event.support) {
			supplies(run, content, random, eventBudget(run.floor, 1.4), true);
			outcome(run, [EVENT_TEXT.cheerWin]);
		} else prepareBattle(run, event.teams![winner], 2,
			EVENT_TEXT.cheerLose, true);
	} else if (event.id === 'mysteryball') {
		const roll = random(100);
		if (choice === 'leave') {
			if (roll < 30) supplies(run, content, random, eventBudget(run.floor, 0.4));
			outcome(run, [roll < 30 ? EVENT_TEXT.leaveBallGift : EVENT_TEXT.leaveBall]);
		} else if (roll < 40) {
			const mon = drawBlessingGift(run, content, random, {
				level: Math.max(3, ordinaryLevel(run.floor) - 3), eligibleStage: true,
			});
			gift(account, run, content, mon, EVENT_NAMES[event.id]);
			outcome(run, [EVENT_TEXT.ballFriend]);
		} else if (roll < 60) {
			giveEquipment(run, content, random, event.ball!);
			outcome(run, [EVENT_TEXT.ballEmpty]);
		} else if (roll < 70) {
			outcome(run, [EVENT_TEXT.ballGrumpy]);
		} else {
			const mon = drawBlessingGift(run, content, random, { level, eligibleStage: true });
			// Wild shiny probability is rolled once by prepareSpiritNode, not again as a gift.
			mon.set.shiny = false;
			prepareBattle(run, [mon.set], 3, EVENT_TEXT.ballFight, true);
		}
	} else if (event.id === 'forest') {
		if (choice === 'left' || choice === 'right') {
			event.support = choice === 'left' ? 0 : 1;
			event.replay = simulateForestBattle(event.teams!, random);
			event.stage = 'watch';
		} else {
			const roll = random(100);
			if (roll < 75) {
				supplies(run, content, random, eventBudget(run.floor, roll < 30 ? 0.5 : 1.4), true);
				outcome(run, [roll < 30 ? EVENT_TEXT.mediateLeave : EVENT_TEXT.mediateGift]);
			} else prepareBattle(run, event.teams!.flat(), 3, EVENT_TEXT.mediateFight, true);
		}
	} else if (event.id === 'mushrooms') {
		if (choice === 'trade') {
			const cost = eventBudget(run.floor, 0.4);
			run.money -= cost;
			if (random(100) < 75) {
				const unit = TREASURES.find(item => item.id === 'tinymushroom')!.sellPrice!;
				let value = Math.round((cost + eventBudget(run.floor, 1.15)) / unit) * unit;
				for (const id of ['balmmushroom', 'bigmushroom', 'tinymushroom']) {
					const price = TREASURES.find(item => item.id === id)!.sellPrice!;
					const count = Math.floor(value / price);
					if (count) giveEquipment(run, content, random, id, count);
					value %= price;
				}
				outcome(run, [EVENT_TEXT.tradeMushrooms]);
			} else {
				supplies(run, content, random, cost + eventBudget(run.floor, 1.15));
				outcome(run, [EVENT_TEXT.tradeOther]);
			}
		} else if (choice === 'taste') {
			const intro = EVENT_TEXT.taste;
			if (random(100) < 65) {
				run.eventBuff = { battles: Math.max(run.eventBuff?.battles || 0, 3) };
				outcome(run, [intro, EVENT_TEXT.vitality,
					EVENT_TEXT.vitalityEffect]);
			} else {
				const lost = loseMoney(run);
				outcome(run, [intro, EVENT_TEXT.tasteLost(lost)]);
			}
		} else outcome(run, [EVENT_TEXT.leaveMushrooms]);
	} else if (event.id === 'room') {
		if (choice === 'fight') {
			const team = forestTeams(level, random)[0];
			for (const set of team) set.ivs = randomEncounterIVs(random);
			prepareBattle(run, team, 'room', EVENT_TEXT.roomFight);
		} else {
			const roll = random(100), text = [EVENT_TEXT.sleep];
			if (roll < 50) {
				supplies(run, content, random, eventBudget(run.floor, 2.6));
				text.push(EVENT_TEXT.sleepGift);
			} else if (roll < 80) {
				text.push(EVENT_TEXT.sleepNothing);
			} else {
				text.push(EVENT_TEXT.sleepLost(loseMoney(run)));
			}
			outcome(run, text);
		}
	}
	rewardReceipt(run, before);
}

export function settleEventBattle(
	run: RogueRun, content: RogueContent, random: RogueRandom, won: boolean, retreated = false
) {
	const event = run.node?.event;
	if (!event || event.stage !== 'battle' || event.settled) return;
	if (trainingEvent(event.id)) { settleServiceBattle(run, won, retreated); return; }
	const before = { money: run.money, bag: { ...run.bag } };
	if (won) {
		if (event.battleReward === 'room') {
			toolbox(run, random);
			run.blessings!.shards += 2 + Math.min(4, Math.floor((run.floor - 1) / 40));
			outcome(run, [EVENT_TEXT.roomWin,
				`获得工具箱 ×1（四件选一件）、幻想碎片 ×${2 + Math.min(4, Math.floor((run.floor - 1) / 40))}。`]);
		} else {
			const extra = eventBudget(run.floor, event.battleReward) - expectedWildLoot(run.floor);
			supplies(run, content, random, Math.max(0, extra));
			outcome(run, [EVENT_TEXT.fightWin]);
		}
	} else outcome(run, [retreated ? EVENT_TEXT.fightRetreat : EVENT_TEXT.fightLose,
		EVENT_TEXT.fightLossRule]);
	rewardReceipt(run, before);
}

export function eventView(run: RogueRun) {
	const event = run.node?.event;
	if (!event) return undefined;
	if (trainingEvent(event.id)) return {
		id: event.id, key: event.key, stage: event.stage, title: EVENT_NAMES[event.id],
		paragraphs: event.result || eventOpening(event.id), options: [],
		exchange: event.exchange, memoryBattle: event.id === 'travel' && event.stage === 'battle',
		...serviceEventView(run),
	};
	const option = (id: string, name: string, text: string, disabled = false) => ({ id, name, text, disabled });
	const ballNames: Record<string, string> = { pokeball: '精灵球', greatball: '超级球', ultraball: '高级球' };
	const paragraphs = eventOpening(event.id, ballNames[event.ball || 'pokeball']);
	const options = event.stage === 'watch' ? [option('watched', '观战结束，查看结果', '')] : event.stage !== 'choice' ? [] : ({
		mysteryball: [option('open', '或许我该打开看看。', '可能获得伙伴、空球，也可能遭遇一场可捕捉的战斗。'),
			option('leave', '不明来路的东西最好不要碰。', '安全离开，30% 概率沿路捡到少量补给。')],
		forest: [option('left', '声援左边的队伍。', '观看真实对战；支持方胜利获得补给，落败则与胜者交战。'),
			option('right', '声援右边的队伍。', '观看真实对战；支持方胜利获得补给，落败则与胜者交战。'),
			option('mediate', '站出来调解它们的矛盾。', '75% 概率获得补给，25% 概率面对双方共六只宝可梦。')],
		mushrooms: [option('trade', '好吧，我和你交换。',
			`支付 ${eventBudget(run.floor, 0.4)} 金币，获得一包普通蘑菇或相近价值的物资；蘑菇需到商店兑换。`,
			run.money < eventBudget(run.floor, 0.4)),
		option('taste', '等等，我要先验货。',
			`65% 概率获得全队三场增伤 20%、减伤 10%；35% 概率损失最多 ${eventBudget(run.floor, 0.5)} 金币。`),
		option('leave', '不了，你有点奇怪。', '直接离开，不获得奖励。')],
		room: [option('fight', '不战斗就无法生存！', '挑战三只野生宝可梦；获胜得到工具箱（四选一）、幻想碎片与正常掉落。'),
			option('sleep', '那种事情不要啊！', `50% 概率获得丰厚物资，30% 无事发生，20% 损失最多 ${eventBudget(run.floor, 0.5)} 金币；不恢复队伍。`)],
	})[event.id as 'mysteryball' | 'forest' | 'mushrooms' | 'room'];
	return { id: event.id, key: event.key, stage: event.stage, title: EVENT_NAMES[event.id],
		paragraphs: event.stage === 'choice' ? paragraphs : event.result || ['两队宝可梦的战斗开始了。'],
		options, teams: event.teams?.map(team => team.map(set => ({ species: set.species, level: set.level }))),
		replay: event.stage === 'watch' ? event.replay?.log : undefined };
}
