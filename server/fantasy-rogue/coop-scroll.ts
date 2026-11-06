import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueCoopAdventure, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { kubfuScrollMembers, SCROLLS } from './journey-activities';
import { chooseEventOption, settleEventBattle } from './events';

type Scroll = keyof typeof SCROLLS;
type Entry = { userid: string, run: RogueRun, account: RogueAccount };
export interface CoopScrollTrial {
	participants: Record<string, { member: string, scroll?: Scroll }>;
}
const healthy = (run: RogueRun) => run.team.filter(mon => !mon.egg && !mon.nuzlockeDead && mon.hp > 0);
const candidates = (run: RogueRun) => kubfuScrollMembers(run).length ? kubfuScrollMembers(run) : healthy(run);
const option = (id: string, name: string, text: string, disabled = false) => ({ id, name, text, disabled });

export function coopScrollOptions(entries: { userid: string, run: RogueRun }[]) {
	const event = entries[0]?.run.node?.event;
	if (entries.length !== 2 || event?.id !== 'kubfuscroll' || entries.some(({ run }) =>
		run.node?.event?.id !== event.id || run.node.event.key !== event.key || run.node.event.stage !== 'choice' ||
		run.node.event.settled || run.node.event.activity?.step || run.floor !== entries[0].run.floor)) return [];
	return [option('accept', '一起接受卷轴试炼。',
		'双方各选一只熊徒弟与各自卷轴；只有一方修行时，另一方选一只伙伴协助。',
		!entries.some(({ run }) => kubfuScrollMembers(run).length) || entries.some(({ run }) => !healthy(run).length)),
	option('leave', '这次先不接受试炼。', '双方共同离开。')];
}

export function beginCoopScroll(entries: Entry[], content: RogueContent, random: RogueRandom, choice: string) {
	if (!coopScrollOptions(entries).some(o => o.id === choice && !o.disabled)) throw new Error('卷轴试炼条件已变化。');
	for (const { run, account } of entries) {
		if (choice === 'leave') chooseEventOption(account, run, content, random, run.node!.event!.key, choice);
		else {
			run.node!.event!.activity = { step: 'coopscroll' };
			run.node!.event!.key = randomUUID();
		}
	}
}

export function coopScrollView(run: RogueRun) {
	const event = run.node?.event, a = event?.activity;
	if (event?.id !== 'kubfuscroll') return undefined;
	if (event.stage !== 'choice' || event.settled || a?.step !== 'coopscroll') {
		return { paragraphs: event.result || [], options: [] as ReturnType<typeof option>[] };
	}
	const trainer = kubfuScrollMembers(run).length > 0, mon = candidates(run).find(p => p.id === a.member);
	const change = option('change', '重新选择自己的伙伴与卷轴', '开战前可以撤回自己的准备，不会更改队友的选择。');
	if (a.choice && mon) return {
		paragraphs: [trainer ? `已选择 ${mon.set.species} 与 ${SCROLLS[a.choice as Scroll]?.[0] || '卷轴'}，等待队友准备。` :
		`已选择 ${mon.set.species} 协助队友，等待队友准备。`], options: [change],
	};
	if (!mon) return {
		paragraphs: [trainer ? '选择自己修行的熊徒弟，再选择它的卷轴。两人可以选相同或不同卷轴。' :
		'你的队伍没有符合修行条件的熊徒弟。选择一只伙伴协助队友，它不会因此进化。'],
		options: candidates(run).map(p => option('member:' + encodeURIComponent(p.id), p.set.species, `Lv.${p.set.level}`)),
	};
	return { paragraphs: [trainer ? '选定这只熊徒弟的卷轴。两人准备好后，守护者队伍将合并为一场双打。' :
		`由 ${mon.set.species} 协助队友。本次你只能派这一只伙伴出战。`],
	options: (trainer ? Object.entries(SCROLLS).map(([key, [name]]) =>
		option('scroll:' + key, name, '对应三只 Lv.35～40 守护者；获胜后这只熊徒弟进化。')) :
	[option('assist', '确认由这只伙伴协助', '只参加对应卷轴的双打，不获得卷轴进化。')]).concat(change) };
}

export function chooseCoopScroll(entry: Entry, content: RogueContent, random: RogueRandom, choice: string) {
	if (!coopScrollView(entry.run)?.options.some(o => o.id === choice && !o.disabled)) {
		throw new Error('伙伴或卷轴选择已变化，请刷新后重选。');
	}
	const event = entry.run.node!.event!, a = event.activity!;
	if (choice === 'change') {
		event.activity = { step: 'coopscroll' };
	} else if (choice.startsWith('member:')) {
		delete a.choice;
		if (kubfuScrollMembers(entry.run).length) {
			chooseEventOption(entry.account, entry.run, content, random, event.key, choice);
		} else {
			a.member = decodeURIComponent(choice.slice(7));
		}
	} else {
		a.choice = choice === 'assist' ? 'assist' : choice.slice(7);
	}
	event.key = randomUUID();
}

/** Only after both private choices are final, generate each native set of three guardians once. */
export function readyCoopScroll(entries: Entry[], content: RogueContent, random: RogueRandom) {
	if (entries.length !== 2 || entries.some(({ run }) => run.node?.event?.id !== 'kubfuscroll' ||
		run.node.event.stage !== 'choice' || run.node.event.settled ||
		run.node.event.activity?.step !== 'coopscroll')) return false;
	if (entries.some(({ run }) => !run.node!.event!.activity!.choice)) return false;
	const participants: CoopScrollTrial['participants'] = {};
	for (const { userid, run } of entries) {
		const a = run.node!.event!.activity!, training = kubfuScrollMembers(run).length > 0;
		if (!candidates(run).some(mon => mon.id === a.member) ||
			(training ? !(a.choice! in SCROLLS) : a.choice !== 'assist')) throw new Error('修行队伍已变化，请重新选择。');
		participants[userid] = { member: a.member!, ...(training ? { scroll: a.choice as Scroll } : {}) };
	}
	const trainees = entries.filter(entry => participants[entry.userid].scroll);
	if (!trainees.length) throw new Error('至少需要一只符合条件的熊徒弟参加卷轴修行。');
	for (const { userid, run, account } of trainees) {
		chooseEventOption(account, run, content, random, run.node!.event!.key, 'scroll:' + participants[userid].scroll!);
	}
	const node = structuredClone(trainees[0].run.node!);
	node.encounters[0].team = trainees.flatMap(({ run }) => structuredClone(run.node!.encounters[0].team));
	const title = trainees.map(({ userid }) => SCROLLS[participants[userid].scroll!][0]).join(' ＋ ') + '守护者';
	node.encounters[0].name = title;
	node.encounters[0].trainer!.name = title;
	node.event!.coopScroll = { participants };
	for (const { run } of entries) {
		const personal = structuredClone(run.node!.event!.activity);
		run.node = structuredClone(node);
		run.node.event!.activity = personal;
		run.encounter = 0; run.phase = 'ready';
	}
	return true;
}

export function coopScrollBattler(adventure: RogueCoopAdventure, userid: string) {
	const event = adventure.node?.event;
	if (event?.id !== 'kubfuscroll' || event.stage !== 'battle') return undefined;
	const trial = event.coopScroll, owners = Object.keys(adventure.members);
	if (!trial || Object.keys(trial.participants).length !== 2 || owners.some(owner =>
		!trial.participants[owner] || !adventure.members[owner].team.some(mon =>
			mon.id === trial.participants[owner].member))) {
		throw new Error('共同卷轴修行记录不完整，请保留进度并检查存档。');
	}
	return adventure.members[userid].team.find(mon => mon.id === trial.participants[userid].member)!;
}

export function settleCoopScroll(entry: Entry, content: RogueContent, random: RogueRandom, won: boolean) {
	const event = entry.run.node!.event!, participant = event.coopScroll?.participants[entry.userid];
	if (!participant || event.id !== 'kubfuscroll' || event.stage !== 'battle' || event.settled) {
		throw new Error('卷轴试炼结算记录不完整。');
	}
	if (participant.scroll) {
		const a = event.activity;
		if (a?.solo !== participant.member || a.target !== SCROLLS[participant.scroll][2]) {
			throw new Error('熊徒弟的卷轴与进化目标不一致。');
		}
		settleEventBattle(entry.run, content, random, won, false, entry.account);
	} else {
		event.stage = 'result'; event.settled = true;
		event.trainingAidBlocked = true; event.journeyBattleWon = won;
		event.result = [won ? '你与伙伴协助队友通过了卷轴试炼。你的伙伴保留原形态，实战经验与消耗照常记录。' :
			'这次试炼未能通过。请先照顾好伙伴；实战经验与消耗照常保留。'];
		delete entry.run.node!.noHealing; entry.run.phase = 'event';
	}
}
