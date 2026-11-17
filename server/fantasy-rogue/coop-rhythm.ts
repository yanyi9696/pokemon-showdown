import { randomUUID } from 'crypto';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { activityEligible, journeyActivityView } from './journey-activities';
import { ACTIVITY_OPENINGS } from './journey-activity-data';
import { chooseEventOption, type EventID } from './events';

export const COOP_RHYTHM_EVENTS = new Set<EventID>(['poffinworkshop', 'minicontest', 'sweetdance']);
type Entry = { run: RogueRun, account: RogueAccount };
const option = (id: string, name: string, text = '', disabled = false) => ({ id, name, text, disabled });
const leave = () => option('leave', '今天先到这里。', '双方共同离开。');
const available = (run: RogueRun) => run.team.filter(mon => !mon.egg && !mon.nuzlockeDead && mon.hp > 0);

export function coopRhythmView(run: RogueRun) {
	const event = run.node!.event!, a = event.activity || {};
	const native = journeyActivityView(run);
	if (!native.options.some(entry => entry.id === 'finish')) native.activity = undefined;
	if (event.id !== 'minicontest' || event.stage !== 'choice') return native;
	if (!a.style) return { ...native, paragraphs: ACTIVITY_OPENINGS.minicontest };
	if (a.step === 'ready') return { ...native, options: [option('rechoose', '重新选择表演伙伴。')],
		paragraphs: ['表演伙伴和招式已准备好。等双方准备完成，再共同开始节奏表演。'] };
	if (a.step === 'prepare') return { ...native, options: native.options.filter(entry => entry.id !== 'leave') };
	return native;
}

export function coopRhythmOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (runs.length !== 2 || !event || !COOP_RHYTHM_EVENTS.has(event.id) || runs.some(run =>
		run.node?.event?.id !== event.id || run.node.event.key !== event.key || run.node.event.stage !== 'choice' ||
		run.node.event.settled || run.floor !== runs[0].floor)) return [];
	if (event.id === 'sweetdance') return [option('participate', '一起参与糖饰舞步。',
		'各自选择小仙奶，消耗自己的糖饰或金币；分别完成三拍即可满足进化条件。没有合适伙伴可以跳过。',
		runs.every(run => !activityEligible(run, event.id))), leave()];
	const activities = runs.map(run => run.node!.event!.activity || {});
	if (event.id === 'minicontest' && activities.every(a => !a.style)) {
		const disabled = runs.some(run => !available(run).length);
		return [option('style:cool', '帅气的出场', '物理或先制招式更合适。', disabled),
			option('style:cute', '轻快的互动', '变化或妖精招式更合适。', disabled),
			option('style:clever', '巧妙的演绎', '特殊或声音招式更合适。', disabled), leave()];
	}
	if (event.id === 'minicontest' && activities.every(a => a.step === 'ready' && a.style === activities[0].style)) {
		return [option('start', '一起开始表演。', '共用十二秒轨道，任一方可打拍；每拍最多计一次。任一方招式契合即获原有的两分起始奖励。',
			runs.some((run, i) => !available(run).some(mon => mon.id === activities[i].member &&
				mon.set.moves.includes(activities[i].choice!)))), option('prepare', '重新准备双方的表演。'), leave()];
	}
	if (activities.some(a => a.startedAt !== activities[0].startedAt || a.score !== activities[0].score ||
		a.step !== activities[0].step || JSON.stringify(a.taps) !== JSON.stringify(activities[0].taps))) return [];
	const views = runs.map(run => journeyActivityView(run));
	return views[0].options.flatMap(entry => {
		const other = views[1].options.find(candidate => candidate.id === entry.id);
		if (!other) return [];
		return [{ ...entry, disabled: entry.disabled || other.disabled,
			text: entry.id === 'tap' ? '任一方点击即可，每拍只计一次；结束与领奖仍需双方确认。' : entry.text }];
	});
}

function validateResources(run: RogueRun) {
	if (!Number.isSafeInteger(run.money) || run.money < 0 ||
		Object.values(run.bag).some(count => !Number.isSafeInteger(count) || count < 0)) {
		throw new Error('节奏活动奖励或消耗超出可保存范围。');
	}
}

/** Shared branches and prizes use consensus. Taps use one server clock and the native per-beat limit. */
export function chooseCoopRhythm(entries: Entry[], content: RogueContent, random: RogueRandom,
	choice: string, rhythmAt?: number) {
	const runs = entries.map(entry => entry.run);
	if (!coopRhythmOptions(runs).some(entry => entry.id === choice && !entry.disabled)) {
		throw new Error('共同节奏活动已变化，请刷新后重选。');
	}
	const event = runs[0].node!.event!, now = Date.now(), oldKey = event.key;
	const privateStep = event.id === 'sweetdance' && choice === 'participate' ||
		event.id === 'minicontest' && (choice.startsWith('style:') || choice === 'prepare');
	const bonus = Math.max(...runs.map(run => run.node!.event!.activity?.score || 0));
	if (choice === 'tap' && (!event.activity?.startedAt || now < event.activity.startedAt ||
		now - event.activity.startedAt >= 12000 && (rhythmAt === undefined ||
			rhythmAt >= 12000 || now - event.activity.startedAt - rhythmAt > 1500))) {
		throw new Error('本轮节奏已结束，请双方确认查看成果。');
	}
	const key = choice === 'tap' ? oldKey : randomUUID();
	for (const { run, account } of entries) {
		const ownEvent = run.node!.event!;
		if (privateStep) {
			ownEvent.activity = event.id === 'sweetdance' ? {} : {
				style: choice.startsWith('style:') ? choice.slice(6) : ownEvent.activity!.style, step: 'prepare',
			};
		} else if (event.id === 'minicontest' && choice === 'start') {
			const a = ownEvent.activity!;
			delete a.step;
			a.startedAt = now; a.duration = 12000;
			a.taps = []; a.score = bonus;
			delete a.tapResult;
		} else {
			chooseEventOption(account, run, content, random, ownEvent.key, choice,
				undefined, undefined, undefined, { now, rhythmAt });
		}
		validateResources(run);
		ownEvent.key = privateStep ? randomUUID() : key;
	}
	return privateStep;
}

export function chooseCoopRhythmPersonal(entry: Entry, content: RogueContent, random: RogueRandom,
	choice: string, rhythmAt?: number) {
	const { run, account } = entry, event = run.node!.event!, oldKey = event.key;
	if (!coopRhythmView(run).options.some(entryOption => entryOption.id === choice && !entryOption.disabled)) {
		throw new Error('个人节奏活动步骤已变化，请刷新后重选。');
	}
	if (event.id === 'minicontest' && choice === 'rechoose') {
		event.activity = { style: event.activity!.style, step: 'prepare' };
		event.key = randomUUID();
	} else {
		chooseEventOption(account, run, content, random, event.key, choice, undefined, undefined, undefined, { rhythmAt });
		if (event.id === 'minicontest' && choice.startsWith('perform:')) {
			delete event.activity!.startedAt;
			delete event.activity!.taps;
			event.activity!.step = 'ready';
		} else if (choice === 'tap' && event.activity?.startedAt) {
			event.key = oldKey;
		}
	}
	validateResources(run);
}

/** Return to common confirmation once both private preparations are ready. */
export function readyCoopRhythm(runs: RogueRun[]) {
	if (!runs.every(run => run.node?.event?.id === 'minicontest' && run.node.event.stage === 'choice' &&
		run.node.event.activity?.step === 'ready')) return false;
	const key = randomUUID();
	for (const run of runs) run.node!.event!.key = key;
	return true;
}
