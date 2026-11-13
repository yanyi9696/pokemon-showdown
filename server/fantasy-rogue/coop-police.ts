import type { AffectionRewards } from './affection';
import { randomUUID } from 'crypto';
import type { RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { recordCompanionPreference } from './companions';
import { beginPoliceEncounter, choosePoliceRegion, policeView, settlePoliceBattle } from './police-events';

function sameProgress(runs: RogueRun[]) {
	return runs.length === 2 && runs[0].floor === runs[1].floor &&
		JSON.stringify(runs[0].police) === JSON.stringify(runs[1].police);
}

/** The world roll is shared; native rewards still run separately against each member's perks. */
function together(runs: RogueRun[], random: RogueRandom, apply: (run: RogueRun, shared: RogueRandom) => boolean) {
	if (!sameProgress(runs)) throw new Error('共同治安事件进度不一致。');
	for (const run of runs) {
		run.node = structuredClone(run.node!);
		run.police = structuredClone(run.police);
		run.eventHistory = [...(run.eventHistory || [])];
		delete run.dialogue;
	}
	const rolls: { max: number, value: number }[] = [], results: boolean[] = [];
	for (const run of runs) {
		let cursor = 0;
		const before = { money: run.money, bag: { ...run.bag }, reward: run.lastReward };
		results.push(apply(run, max => {
			const roll = rolls[cursor] ||= { max, value: random(max) };
			cursor++;
			if (roll.max !== max) throw new Error('共同治安事件的随机步骤不一致。');
			return roll.value;
		}));
		if (!Number.isSafeInteger(run.money) || run.money < 0 ||
			Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
			throw new Error('共同治安奖励超出可保存范围。');
		}
		const items = Object.fromEntries(Object.entries(run.bag).flatMap(([id, count]) =>
			count > (before.bag[id] || 0) ? [[id, count - (before.bag[id] || 0)]] : []));
		if (run.lastReward === before.reward && (run.money !== before.money || Object.keys(items).length)) {
			run.lastReward = { floor: run.floor, name: run.node!.name, money: run.money - before.money, items, points: 0 };
		}
		const pages = (run.dialogue?.pages || []).map(page => `${page.speaker || page.title}：${page.text}`);
		if (run.node!.event?.police && pages.length) {
			run.node!.event.result = [...new Set([...(run.node!.event.result || []), ...pages])];
		}
	}
	if (results[0] !== results[1] || !sameProgress(runs)) throw new Error('共同治安事件结算不一致。');
	if (runs[0].node!.event?.police) {
		const key = randomUUID();
		for (const run of runs) { run.node!.kind = 'event'; run.node!.event!.key = key; }
		// Random UUIDs are not enemy identity: both parties battle the one persisted sequence.
		runs[1].node!.encounters = structuredClone(runs[0].node!.encounters);
	}
	return results[0];
}

export function beginCoopPolice(runs: RogueRun[], random: RogueRandom) {
	return together(runs, random, (run, shared) => beginPoliceEncounter(run, shared, runs.filter(party => party !== run)));
}

export function coopPoliceOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (!sameProgress(runs) || !event?.police || runs.some(run =>
		run.node?.event?.key !== event.key || run.node.event.id !== event.id || run.node.event.stage !== 'choice' ||
		run.node.event.settled || JSON.stringify(run.node.event.police) !== JSON.stringify(event.police))) return [];
	return policeView(runs[0]).options;
}

export function chooseCoopPolice(
	runs: RogueRun[], random: RogueRandom, choice: string, rewards: AffectionRewards | undefined
) {
	if (!coopPoliceOptions(runs).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同治安选项已变化，请刷新后重选。');
	}
	// Personal praise can draw a different dialogue; it must not shift the shared enemy rolls.
	for (const run of runs) recordCompanionPreference(run, policeView(run).options, choice, random, rewards);
	together(runs, random, (run, shared) => {
		choosePoliceRegion(run, choice, shared, runs.filter(party => party !== run)); return true;
	});
}

/** False leaves an ordinary defeat retryable, or continues a saved multi-battle sequence. */
export function settleCoopPolice(runs: RogueRun[], won: boolean) {
	const event = runs[0]?.node?.event;
	if (!sameProgress(runs) || !event?.police || runs.some(run => run.node?.event?.key !== event.key ||
		run.node.event.stage !== 'battle' || run.node.event.settled || run.encounter !== runs[0].encounter ||
		JSON.stringify(run.node.event.police) !== JSON.stringify(event.police))) {
		throw new Error('共同治安战斗记录不一致。');
	}
	return together(runs, () => { throw new Error('治安战斗结算不应重新抽取随机结果。'); }, run => {
		settlePoliceBattle(run, won, runs.filter(party => party !== run)); return !!run.node!.event!.settled;
	});
}
