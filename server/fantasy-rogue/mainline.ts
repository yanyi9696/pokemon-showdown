import { randomUUID } from 'crypto';
import { ROGUE_STATS } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueContent, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { MAINLINE_SCRIPT } from './mainline-data';
import { mainlineProgress, nextMainlineScene, unlockStoryDifficulty,
	MAINLINE_CHAPTER_LENGTHS } from './mainline-progress';
import { rewardCandies, rewardExperience, rewardMoney, rewardRecovery } from './reward-scenes';
import { treasure } from './blessings';
import { fantasyTutorMoves } from './fantasy-tutor';
import { teachMove } from './event-learning';
import { characterSpeech } from './dialogue-copy';
import { natureMintSupplies } from './nature-mints';

interface ScriptPage {
	speaker?: string; text?: string; kind?: string; prompt?: string;
	options?: { label: string, reply: ScriptPage[], effect?: string, member?: string }[];
}
interface ScriptScene { id: string; title: string; pages: ScriptPage[]; tier?: number; reward?: string }
const script = MAINLINE_SCRIPT as unknown as {
	scenes: ScriptScene[], ordinary: ScriptScene[], openings: ScriptScene[], endings: ScriptScene[],
	stageLines: { after: string, text: string }[],
	topics: { after: string, label: string, pages: ScriptPage[], resolvedAfter: string, resolvedPages: ScriptPage[] }[],
	endingElderLines: { after: string, text: string }[],
};
export interface MainlineDialogue {
	id: string; key: string; title: string; pages: ScriptPage[]; index: number;
	kind: 'main' | 'ordinary' | 'opening' | 'ending';
	reward?: string; service?: string; member?: string;
}
export function elderStageLine(account: RogueAccount) {
	return [...script.stageLines].reverse().find(line => mainlineProgress(account).completed.includes(line.after))?.text;
}
function topicPage(account: RogueAccount): ScriptPage[] {
	const progress = mainlineProgress(account);
	const topics = script.topics.filter(topic => progress.completed.includes(topic.after));
	if (!topics.length) return [];
	return [{ kind: 'choice', prompt: '有些以前没能说完的话，现在可以再问一问。', options: [
		{ label: '这次先聊到这里。', reply: [] },
		...topics.map(topic => ({ label: topic.label, reply: structuredClone(progress.completed.includes(topic.resolvedAfter) ?
			topic.resolvedPages : topic.pages) })),
	] }];
}
function beginDialogue(account: RogueAccount, scene: ScriptScene, kind: MainlineDialogue['kind']) {
	account.mainlineDialogue = { id: scene.id, key: randomUUID(), title: scene.title, index: 0,
		kind, reward: scene.reward, pages: structuredClone(scene.pages) };
	if (kind !== 'main') account.mainlineDialogue.pages.push(...topicPage(account));
}
/** Existing in-progress openings retain their page numbers. New loops remember completed chapters. */
export function beginRememberedOpening(account: RogueAccount) {
	if (account.run || account.mainlineDialogue || (account.opening?.page || 0) > 0 ||
		!account.mainline?.completed.length) return;
	const progress = mainlineProgress(account);
	let index = 0;
	for (let tier = 0; tier < 6;
		tier++) if (progress.completed.includes(`s${tier}-${MAINLINE_CHAPTER_LENGTHS[tier]}`)) index = tier + 1;
	if (progress.endingSeen) index = 7;
	beginDialogue(account, script.openings[index], 'opening');
}
export function reserveMainline(account: RogueAccount, run: RogueRun, random: RogueRandom) {
	run.elderStageLine = elderStageLine(account);
	if (run.mainline || run.difficulty === 'easy' || run.difficultyTest) return;
	const tier = run.difficulty || 0, scene = nextMainlineScene(account, tier);
	if (!scene) return;
	const guaranteed = mainlineProgress(account).pity[String(tier)];
	// A single persisted roll per adventure; no reroll on reconnect or alternate route choices.
	const eligible = Array.from({ length: guaranteed ? 29 : 79 }, (_, i) => i +
		21).filter(floor => floor % 10 !== 0 && floor % 10 !== 9);
	const floor = guaranteed || random(100) < 40 ? eligible[random(eligible.length)] : undefined;
	run.mainline = { scene, floor };
}
export function offerMainline(run: RogueRun) {
	const reservation = run.mainline;
	if (!reservation?.floor || reservation.offered || run.difficulty === 'easy' || !run.choices?.length ||
		run.floor < reservation.floor || run.floor > 99) return;
	const slot = run.choices.findIndex(node => !node.challenge && !['boss', 'rest', 'adventure'].includes(node.kind));
	if (slot < 0) return;
	run.choices[slot] = { id: 'mainline', kind: 'story', name: '秘闻 · 黑袍老人的身影',
		mainlineScene: reservation.scene, encounters: [], reward: { money: 0, items: {} } };
	reservation.offered = true;
}
/** Ordinary elder meetings share the event route; they never consume main-story progress. */
export function prepareElderMeeting(account: RogueAccount, run: RogueRun, random: RogueRandom) {
	if (run.node?.kind !== 'event' || run.node.event || (run.elderVisits?.length || 0) >= 2 ||
		random(100) < 92) return false;
	const pool = script.ordinary.filter(scene => !run.elderVisits?.includes(scene.id));
	if (!pool.length) return false;
	const scene = pool[random(pool.length)];
	run.node.elderScene = scene.id;
	run.node.name = scene.title;
	run.node.reward = { money: 0, items: {} }; run.node.encounters = [];
	(run.elderVisits ||= []).push(scene.id);
	beginDialogue(account, scene, 'ordinary');
	const session = account.mainlineDialogue!;
	if (run.elderStageLine) session.pages.splice(1, 0, { speaker: '黑袍老人', text: run.elderStageLine });
	if (scene.id === 'elder-rest') {
		const choice = session.pages.find(page => page.options)!, options = choice.options!;
		options[0].effect = 'treasure'; options[1].effect = 'ev'; options[2].effect = 'fantasy';
		choice.options = options.filter(option => option.effect === 'treasure' ||
			!run.elderServices?.includes(option.effect!) && run.team.some(mon => !mon.egg &&
				(option.effect === 'ev' ? ROGUE_STATS.some(stat => mon.set.evs[stat] > 0) : fantasyTutorMoves(mon).length > 0)));
	}
	run.phase = 'story'; delete run.choices;
	return true;
}
export function beginMainline(account: RogueAccount, run: RogueRun, node: RogueNode) {
	if (!node.mainlineScene || node.mainlineScene !== run.mainline?.scene || run.mainline.completed ||
		nextMainlineScene(account, Number(run.difficulty || 0)) !== node.mainlineScene) throw new Error('这段故事当前尚未开放。');
	const scene = script.scenes.find(entry => entry.id === node.mainlineScene);
	if (!scene) throw new Error('故事内容不存在。');
	beginDialogue(account, scene, 'main');
	run.phase = 'story'; delete run.choices;
}
/** Claim the first clear after revelation now; reading the ending may resume after reconnect. */
export function reserveTrueEnding(account: RogueAccount, run: RogueRun) {
	const progress = mainlineProgress(account);
	if (!progress.endingPending || run.difficultyTest || progress.endingRun) return false;
	progress.endingRun = run.id;
	run.mainlineEnding = 'ending-true';
	return true;
}
export function beginMainlineEnding(account: RogueAccount, run: RogueRun) {
	const progress = mainlineProgress(account);
	const id = run.mainlineEnding || (progress.endingSeen ? 'ending-free' : 'ending-loop');
	const scene = script.endings.find(entry => entry.id === id)!;
	beginDialogue(account, scene, 'ending');
	if (id === 'ending-loop') {
		const line = [...script.endingElderLines].reverse().find(entry => progress.completed.includes(entry.after));
		if (line) account.mainlineDialogue!.pages.unshift({ speaker: '黑袍老人', text: line.text });
	}
	delete run.story;
}
export function mainlineView(account: RogueAccount) {
	const session = account.mainlineDialogue;
	if (!session) return null;
	const page = session.pages[session.index];
	if (!page) return null;
	return { stage: 'mainline' as const, index: session.index, total: session.pages.length, title: session.title,
		scene: session.kind === 'ending' ? (session.index > session.pages.length / 2 ? 'home' : 'summit') : 'stranger',
		speaker: page.speaker || '旁白', text: page.kind === 'choice' ? page.prompt || '' :
		page.speaker && page.speaker !== '旁白' ? characterSpeech(page.text || '') : page.text || '',
		options: page.options?.map((option, index) => ({ id: String(index), label: option.label })),
		canSkip: session.kind !== 'ending' || session.id !== 'ending-true',
		performance: session.key, key: `${session.key}:${session.index}`, battleReady: false, ending: session.kind === 'ending',
	};
}
function finishDialogue(account: RogueAccount, run: RogueRun | undefined, content: RogueContent, random: RogueRandom) {
	const session = account.mainlineDialogue!;
	if (session.kind === 'opening') {
		// Legacy opening gate remains compatible with existing clients/tests.
		account.opening = { page: 8, skip: false };
	} else if (session.kind === 'ending') {
		if (session.id === 'ending-true') {
			const progress = mainlineProgress(account);
			progress.endingSeen = true; progress.endingPending = false;
		}
	} else {
		if (!run?.node) throw new Error('故事所在的旅程已经结束。');
		const before = { money: run.money, bag: { ...run.bag } };
		if (session.kind === 'main') {
			if (run.mainline?.completed || nextMainlineScene(account, Number(run.difficulty || 0)) !== session.id) {
				throw new Error('这段故事已经领取，或前置进度尚未完成。');
			}
			const progress = mainlineProgress(account);
			progress.completed.push(session.id);
			run.mainline!.completed = true;
			progress.pity[String(run.difficulty || 0)] = false;
			if (session.id === 's5-5') { progress.identityRevealed = true; progress.endingPending = true; }
			run.elderStageLine = elderStageLine(account);
			unlockStoryDifficulty(account);
			const multiplier = session.reward === '丰厚' ? 2 : session.reward === '最低' ? 1 : 1.5;
			run.money += Math.round(rewardMoney(run.floor) * multiplier);
			const items = { ...rewardRecovery(run.floor), ...rewardCandies(run.floor,
				rewardExperience(run.floor) * (session.reward === '丰厚' ? 1.5 : session.reward === '最低' ? 0.5 : 1)) };
			for (const [id, count] of Object.entries(items)) run.bag[id] = (run.bag[id] || 0) + count;
		} else if (session.service === 'ev' || session.service === 'fantasy') {
			const mon = run.team.find(member => !member.egg && member.id === session.member);
			if (!mon || run.elderServices?.includes(session.service)) throw new Error('请重新选择能够接受指导的伙伴。');
			if (session.service === 'ev') mon.evRespec = { total: Math.min(510, ROGUE_STATS.reduce((sum,
				stat) => sum + mon.set.evs[stat], 0)) };
			else for (const move of fantasyTutorMoves(mon)) teachMove(account, run, content, mon, move);
			(run.elderServices ||= []).push(session.service);
			(run.notices ||= []).push(session.service === 'ev' ? '已开放所选伙伴的努力值重新分配；请在队伍详情中调整已有努力值。' : '所选幻想伙伴的合法幻想招式已加入可更换招式池。');
		} else if (session.service === 'treasure') treasure(run, content, random);
		else {
			const item = session.id === 'elder-card' ? 'roguemintmodest' : session.id === 'elder-miscount' ? 'pokeball' :
				run.floor < 30 ? 'potion' : run.floor < 70 ? 'superpotion' : 'hyperpotion';
			run.bag[item] = (run.bag[item] || 0) + (item === 'pokeball' ? 3 : 1);
			if (item.startsWith('roguemint')) for (const [id, count] of Object.entries(natureMintSupplies(run.floor))) {
				run.bag[id] = (run.bag[id] || 0) + count;
			}
		}
		run.lastReward = { floor: run.floor, name: '黑袍老人给你的补给', money: run.money - before.money,
			items: Object.fromEntries(Object.entries(run.bag).filter(([id, n]) => n > (before.bag[id] || 0))
				.map(([id, n]) => [id, n - (before.bag[id] || 0)])), points: 0,
			effect: session.service === 'ev' ? '已开放已有努力值重分配' : session.service === 'fantasy' ? '已学会合法幻想招式' : undefined };
		// The ordinary continue action advances the floor, without crediting the gift a second time.
		run.phase = 'reward';
	}
	delete account.mainlineDialogue;
	return session.kind;
}
export function advanceMainline(account: RogueAccount, content: RogueContent, random: RogueRandom,
	key: string | undefined, choice?: string, skip = false) {
	const session = account.mainlineDialogue, view = mainlineView(account);
	if (!session || !view || view.key !== key) throw new Error('剧情进度已更新，请刷新后继续。');
	const page = session.pages[session.index], run = account.run;
	if (choice !== undefined) {
		if (!/^(0|[1-9][0-9]?)$/.test(choice)) throw new Error('对话选项无效。');
		const option = page.options?.[Number(choice)];
		if (!option) throw new Error('请从当前对话选项中选择。');
		const reply = structuredClone(option.reply);
		if (option.effect === 'ev' || option.effect === 'fantasy') {
			if (!run || run.elderServices?.includes(option.effect)) throw new Error('本次指导已领取。');
			const eligible = run.team.filter(mon => !mon.egg &&
				(option.effect === 'ev' ? ROGUE_STATS.some(stat => mon.set.evs[stat]) : fantasyTutorMoves(mon).length));
			reply.push({ kind: 'choice', prompt: '选择一位接受指导的伙伴。', options: eligible.map(mon => ({
				label: `【${mon.set.species}】 · Lv.${mon.set.level}`, effect: `target:${option.effect}`, member: mon.id,
				reply: [{ speaker: '黑袍老人', text: '我们慢慢来。练过的东西不会白费。' }],
			})) });
		} else if (option.effect?.startsWith('target:')) {
			session.service = option.effect.slice(7); session.member = option.member;
		} else if (option.effect === 'treasure') session.service = 'treasure';
		session.pages.splice(session.index + 1, 0, ...reply);
		session.index++;
	} else {
		if (page.options) throw new Error('请先回应老人，再继续对话。');
		if (skip && !view.canSkip) throw new Error('请先阅读这段结局。');
		session.index++;
		if (skip) while (session.index < session.pages.length && !session.pages[session.index].options) session.index++;
	}
	if (session.index >= session.pages.length) return finishDialogue(account, run, content, random);
	return undefined;
}

/** Read-only replay; only server-authorized local previews expose uncollected scenes. */
export function mainlineCodex(account?: RogueAccount, preview = false) {
	const completed = account?.mainline?.completed || [];
	const scenes = [...script.scenes, ...(preview ||
		account?.mainline?.endingSeen ? [script.endings.find(s => s.id === 'ending-true')!] : [])];
	return scenes.map(scene => {
		const unlocked = preview || completed.includes(scene.id) || scene.id === 'ending-true' &&
			!!account?.mainline?.endingSeen;
		if (!unlocked) return { id: scene.id, category: 'story', name: '尚未拾起的记忆', unlocked: false, text: '继续旅程，等待与老人再会。' };
		const pages: Record<string, { text: string[], options: { label: string, next: string }[] }> = {};
		const append = (list: ScriptPage[], prefix: string, after?: string) => {
			list.forEach((page, index) => {
				const id = `${prefix}${index}`, next = index + 1 < list.length ? `${prefix}${index + 1}` : after;
				const text = page.options ? page.prompt || '' : page.speaker &&
					page.speaker !== '旁白' ? characterSpeech(page.text || '') : page.text || '';
				pages[id] = { text: [text], options: page.options ? page.options.map((option, n) => {
					const child = `${id}r${n}-`; append(option.reply, child, next);
					return { label: option.label, next: option.reply.length ? `${child}0` : next || 'end' };
				}) : next ? [{ label: '继续', next }] : [] };
			});
		};
		append(scene.pages, 'p'); pages.end = { text: ['这段记忆暂时停在这里。'], options: [] };
		return { id: scene.id, category: 'story', name: scene.title, unlocked: true,
			text: preview ? '本地预览。阅读不会发放奖励或改变剧情进度。' : '已收集的故事。回顾不会发放奖励或改变进度。',
			replay: { title: scene.title, start: 'p0', pages } };
	});
}
