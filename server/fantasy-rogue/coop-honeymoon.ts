import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { chooseEventOption, settleEventBattle, type EventID, type RogueEvent } from './events';
import { closeUpdatedHoneymoon, honeymoonEligible, honeymoonView, prepareHoneymoon,
	sameHoneymoonTrip } from './honeymoon';

export const COOP_HONEYMOON_EVENTS = new Set<EventID>(['honeymoon', 'honeymoonreturn']);
type Party = { userid: string, run: RogueRun };
type Owner = Party & { changeAccount: (update: (account: RogueAccount) => void) => void };

export function beginCoopHoneymoon(parties: Party[], event: RogueEvent, random: RogueRandom) {
	if (event.id !== 'honeymoonreturn') return;
	const candidates = parties.filter(({ run }) => honeymoonEligible(run, event.id));
	if (!candidates.length) throw new Error('当前没有可以重逢的蜜月旅行。');
	const chosen = candidates[random(candidates.length)], trip = chosen.run.honeymoon!;
	const suffix = `:${chosen.userid}`;
	const sharedRun = trip.run.endsWith(suffix) ? trip.run.slice(0, -suffix.length) : undefined;
	const owners = candidates.filter(entry => entry === chosen ||
		sharedRun && entry.run.honeymoon!.run === `${sharedRun}:${entry.userid}` &&
		entry.run.honeymoon!.floor === trip.floor && entry.run.honeymoon!.region === trip.region);
	event.coopHoneymoon = { trip: { ...trip }, owners: Object.fromEntries(owners.map(entry =>
		[entry.userid, { ...entry.run.honeymoon! }])) };
	prepareHoneymoon({ ...chosen.run, node: { ...chosen.run.node!, event } }, random);
}

function unchangedTrips(parties: Party[]) {
	const event = parties[0].run.node!.event!;
	if (event.id === 'honeymoon') return parties.every(({ run }) => !run.honeymoon || run.honeymoon.returned);
	const owners = event.coopHoneymoon?.owners;
	return !!owners && !!Object.keys(owners).length && Object.entries(owners).every(([userid, trip]) => {
		const current = parties.find(entry => entry.userid === userid)?.run.honeymoon;
		return current && !current.returned && sameHoneymoonTrip(current, trip);
	});
}

export function coopHoneymoonView(run: RogueRun) {
	return honeymoonView({ ...run, honeymoon: run.node!.event!.coopHoneymoon?.trip || run.honeymoon });
}

export function coopHoneymoonOptions(parties: Party[]) {
	const event = parties[0]?.run.node?.event;
	if (parties.length !== 2 || !event || !COOP_HONEYMOON_EVENTS.has(event.id) || event.stage !== 'choice' ||
		event.settled || parties.some(({ run }) => run.floor !== parties[0].run.floor ||
			JSON.stringify(run.node?.event) !== JSON.stringify(event))) return [];
	if (!unchangedTrips(parties)) return [{ id: 'honeymoonclose', name: '确认最新旅行记录，继续旅程',
		text: '旅行记录已更新，本次不重复领奖；其他未完成的旅行保留。', disabled: false }];
	return coopHoneymoonView(parties[0].run).options.map(option => ({ ...option,
		text: event.id === 'honeymoon' ? `${option.text}；共同推荐，双方各获一份谢礼。` :
		'共同欢迎夫妇归来，双方各获一份特产；队友其他尚未结束的旅行保留。' }));
}

/** Use the shared couple only for this encounter; never overwrite the partner's unrelated trip. */
function withSharedTrip(entry: Owner, apply: (account: RogueAccount) => void) {
	const { run, userid } = entry, context = run.node!.event!.coopHoneymoon!;
	const original = run.honeymoon;
	entry.changeAccount(account => {
		const temporary = { ...account, honeymoon: { ...context.trip } };
		run.honeymoon = { ...context.trip };
		try {
			apply(temporary);
			if (context.owners[userid] && temporary.honeymoon.returned) {
				account.honeymoon = { ...context.owners[userid], returned: true };
			}
		} finally {
			run.honeymoon = original;
		}
	});
}

function validateRewards(run: RogueRun) {
	if (!Number.isSafeInteger(run.money) || run.money < 0 ||
		Object.values(run.bag).some(value => !Number.isSafeInteger(value) || value < 0)) {
		throw new Error('蜜月旅行奖励超出可保存范围。');
	}
}

export function chooseCoopHoneymoon(entries: Owner[], content: RogueContent, random: RogueRandom, choice: string) {
	if (!coopHoneymoonOptions(entries).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同旅行记录已变化，请刷新后重选。');
	}
	const event = entries[0].run.node!.event!, tip = event.id === 'honeymoon' ? random(4) : undefined;
	for (const entry of entries) {
		const { run } = entry;
		if (choice === 'honeymoonclose') {
			closeUpdatedHoneymoon(run);
		} else if (run !== entries[0].run && entries[0].run.node!.event!.stage === 'battle') {
			run.node = structuredClone(entries[0].run.node);
			run.encounter = 0; run.phase = 'ready';
		} else {
			const apply = (account: RogueAccount) => chooseEventOption(account, run, content, random,
				run.node!.event!.key, choice, undefined, undefined, undefined, { honeymoonTip: tip });
			if (event.id === 'honeymoon') entry.changeAccount(apply);
			else withSharedTrip(entry, apply);
		}
		validateRewards(run);
	}
	const key = randomUUID();
	for (const { run } of entries) run.node!.event!.key = key;
}

export function settleCoopHoneymoon(entries: Owner[], content: RogueContent, random: RogueRandom, won: boolean) {
	const unchanged = unchangedTrips(entries);
	for (const entry of entries) {
		if (!unchanged) closeUpdatedHoneymoon(entry.run);
		else withSharedTrip(entry, account => settleEventBattle(entry.run, content, random, won, false, account));
		validateRewards(entry.run);
	}
}
