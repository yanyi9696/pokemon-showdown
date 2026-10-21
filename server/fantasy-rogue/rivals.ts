import { randomUUID } from 'crypto';
import { RIVALS, RIVAL_SNACK_GIFTS, RIVAL_FAREWELLS, CARMINE, type RivalID } from './rival-data';
import type { RogueContent, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { makeEncounterSet } from './encounter-sets';
import { lowerToEligibleStage } from './evolution';
import { themedEventTeam } from './event-teams';
import { normalizeBlessings, grantSystem } from './blessings';
import { rewardCandies, rewardExperience } from './reward-scenes';
import { healNarrativeParty, queueNarrative, dialoguePage } from './narrative';
import { COMPANIONS } from '../../sim/rogue-companions';
import { requestCompanion, travellingRoster } from './travellers';
import { rivalOpeningPages, rivalConversationOptions, rivalAnswerPages, rivalChatPages, rivalChatOptions } from './rival-dialogue';
import { rivalAffectionGain } from './rival-responses';
import { journeyCoins } from './early-balance';

export interface RivalState {
	id: RivalID; completed: number; lastFloor: number; affection: number;
	temporaryUntil?: number; permanent?: boolean; away?: boolean; temporaryUsed?: boolean;
	carmine?: { affection: number, temporaryUntil?: number, permanent?: boolean, away?: boolean, temporaryUsed?: boolean };
}
export interface RivalEvent { chapter: number; step?: 'conversation' | 'talk' | 'search' | 'reward' | 'invite' | 'carmine' | 'carminefinal'; conversationTurn?: number; turn?: number; task?: 'search' | 'battle'; found?: number[]; answer?: number }
const accompanying = (state: { permanent?: boolean, temporaryUntil?: number, away?: boolean } | undefined, floor: number) =>
	!state?.away && !!(state?.permanent || state?.temporaryUntil && floor <= state.temporaryUntil);
const canInvite = (state: RivalState | RivalState['carmine']) =>
	!!state && state.affection >= 4 && !state.permanent && !state.temporaryUsed && !state.temporaryUntil;
export const rivalSceneName = (id: RivalID, chapter: number) => `与${RIVALS[id].name}的相遇·其${'一二三四五六七八'[chapter - 1]}`;
export function activeRivalTraveller(run: RogueRun) {
	if (accompanying(run.rival, run.floor)) return { id: run.rival!.id, ...RIVALS[run.rival!.id] };
	if (accompanying(run.rival?.carmine, run.floor)) return { id: 'carmine', ...CARMINE };
}
export const rivalActive = (run: RogueRun) => !!activeRivalTraveller(run);
/** Stretch early meetings; catch up missed chapters before the two major challenges. */
export function nextRivalFloor(rival: RivalState) {
	const next = rival.completed + 1;
	if (next > 8) return Infinity;
	const target = [1, 31, 48, 65, 81, 99, 119, 139][next - 1];
	const milestone = next <= 6 ? 6 : 8, deadline = milestone === 6 ? 102 : 149;
	const remaining = milestone - rival.completed;
	const preferred = Math.max(rival.lastFloor + 10, target);
	if (preferred + (remaining - 1) * 10 <= deadline) return preferred;
	return rival.lastFloor + Math.max(2, Math.min(10, Math.floor((deadline - rival.lastFloor) / remaining)));
}
export function rivalRoutes(run: RogueRun, nodes: RogueNode[], random: RogueRandom) {
	const rival = run.rival;
	if (rival?.completed === 8 || !rival && run.floor > 20) return nodes;
	const due = rival ? nextRivalFloor(rival) : 1;
	if (run.floor < due) return nodes;
	const catchingUp = rival && due - rival.lastFloor < 10;
	const chance = rival ? Math.min(98, (catchingUp ? 80 : 45) + (run.floor - due) * 9) : run.floor <= 10 ? 85 : 60;
	if (random(100) >= chance || !nodes.length) return nodes;
	const result = [...nodes];
	result[result.length - 1] = { id: 'rival', kind: 'adventure', name: rival ? rivalSceneName(rival.id, rival.completed + 1) : '旅途中的相遇', encounters: [], reward: { money: 0, items: {} } };
	return result;
}
export function rivalTeam(run: RogueRun, lv: number, count = 3, travelling = false) {
	return [...new Set((travelling && activeRivalTraveller(run)?.team || RIVALS[run.rival!.id].team).map(name => lowerToEligibleStage(name === 'Alolan Vulpix' ? 'Vulpix-Alola' : name, lv)))].slice(0, count)
		.map(name => makeEncounterSet(name, lv, run.floor < 60 ? 18 : 24));
}
function setFight(run: RogueRun, random: RogueRandom) {
	const event = run.node!.event!, chapter = event.rival!.chapter, r = run.rival!, person = RIVALS[r.id];
	const lv = Math.min(110, Math.max(3, Math.ceil(run.floor / 2)) + (chapter >= 6 ? 8 : 2));
	const cooperative = [2, 3, 5, 7].includes(chapter);
	const trainer = { id: r.id, name: person.name, avatar: r.id, role: 'traveller' as const, tera: chapter >= 6 };
	const allies = rivalTeam(run, Math.min(100, lv), chapter === 8 ? 6 : chapter >= 6 ? 5 : 3);
	const count = chapter === 2 ? 2 : chapter === 7 ? 3 : 1;
	run.node!.encounters = Array.from({ length: count }, (_, index) => ({ name: cooperative ? chapter === 3 ? '暴走的高阶精英' : `拦路的训练家 · ${index + 1}` : person.name,
		team: cooperative ? themedEventTeam(chapter === 3 ? 'forest' : 'bandits', chapter === 3 ? Math.min(120, lv + 13) : lv, chapter === 3 ? 2 : 4, random, chapter === 3 ? 28 : 20) : allies,
		style: 'balanced' as const, catchable: false,
		...(cooperative ? { cooperative: { id: r.id, name: person.name, team: allies },
			trainer: chapter === 3 ? undefined : { id: 'rivalbandit', name: '拦路的训练家', avatar: 'roughneck', role: 'traveller' as const, tera: false },
			stars: chapter === 3 ? [2, 2] : undefined } : { trainer }),
	}));
	event.stage = 'battle'; event.result = [person.lines[chapter - 1]];
	delete run.node!.spiritPrepared; delete run.node!.blessingPrepared; delete run.node!.wildLoot;
	run.encounter = 0; run.phase = 'ready';
}
export function beginRival(run: RogueRun, random: RogueRandom) {
	if (!run.rival) {
		const candidates = (Object.keys(RIVALS) as RivalID[]).filter(id => !travellingRoster(run).some(c => c.id === id) &&
			!run.blessings?.companions?.some(c => c.id === id));
		const pool = candidates.flatMap(id => Array.from({ length: id === run.previousRival ? 1 : 4 }, () => id));
		run.rival = { id: pool[random(pool.length)], completed: 0, lastFloor: 0, affection: 0 };
	}
	const r = run.rival, chapter = r.completed + 1;
	run.node!.name = rivalSceneName(r.id, chapter);
	run.node!.event = { id: 'rivalstory', key: randomUUID(), stage: 'choice', rival: { chapter, step: 'conversation', conversationTurn: 0 },
		result: [RIVALS[r.id].lines[chapter - 1]] };
	(run.eventHistory ||= []).push({ id: `rival:${r.id}:${chapter}`, floor: run.floor });
	run.phase = 'event';
	if (r.id === 'kieran') r.carmine ||= { affection: 0 };
	queueNarrative(run, rivalOpeningPages(r.id, chapter, r.affection), 'event');
}
function prepareChapter(run: RogueRun, random: RogueRandom) {
	const state = run.node!.event!.rival!, chapter = state.chapter;
	delete state.step;
	if (chapter === 1) setFight(run, random);
	else if (chapter === 4) {
		state.step = 'talk'; state.turn = 0;
	} else if (chapter === 5) {
		state.task = random(2) ? 'search' : 'battle'; state.answer = random(3); state.found = [];
	}
}
function finish(run: RogueRun, random: RogueRandom, won: boolean) {
	const r = run.rival!, event = run.node!.event!, chapter = event.rival!.chapter;
	r.lastFloor = run.floor;
	const advanced = won || [1, 6, 8].includes(chapter);
	if (advanced) r.completed = Math.max(r.completed, chapter);
	if (chapter !== 1 && won && chapter !== 4) r.affection += 2;
	if ([1, 6, 8].includes(chapter)) healNarrativeParty(run);
	const scale = !won ? 0.35 : [4, 6, 8].includes(chapter) ? 1.8 : 1.15;
	const quality = chapter === 4 ? r.affection >= 6 ? 1.4 : r.affection >= 3 ? 1 : 0.7 : 1;
	const money = journeyCoins(run.floor, (180 + run.floor * 14) * scale * quality);
	run.money += money;
	const items: Record<string, number> = { [chapter >= 6 ? 'hyperpotion' : 'superpotion']: won ? 2 : 1 };
	if (won) Object.assign(items, rewardCandies(run.floor, rewardExperience(run.floor) * scale * quality));
	if (won && chapter === 2) { items.expertbelt = 1; items.roguetmprotect = 1; }
	if (won && chapter === 3) { items.ultraball = 3; items.bottlecap = 1; }
	if (won && chapter === 5) { items.abilitycapsule = 1; items.sitrusberry = 3; }
	if (won && chapter >= 7) { items.goldbottlecap = 1; items.abilitypatch = 1; }
	for (const [id, count] of Object.entries(items)) run.bag[id] = (run.bag[id] || 0) + count;
	if (won && chapter === 8) normalizeBlessings(run).shards += 150;
	event.trainingAidBlocked = !won;
	event.stage = 'result'; event.settled = true;
	event.result = [won ? '这一路的默契，成为了眼前实实在在的收获。' : advanced ? '切磋未能获胜，但对方认真肯定了你的进步，并帮全队恢复健康。你收到一份基础物资。' : '这次合作没能完成。先照顾好伙伴，下一次相遇再共同挑战。'];
	if (chapter === 1) event.result.push('「以后在旅途中遇见，记得来找我。一起经历更多奇遇，我们会变得更强，也会收获更丰厚的旅途礼物。」');
	if (chapter === 8) {
		requestCompanion(run, { id: r.id, origin: 'rival', permanent: true });
		event.result.push(`【${RIVALS[r.id].name}】发出永久同行的邀请。同行名额已满时，可以选择和哪位伙伴告别。`);
		if (r.carmine && r.carmine.affection >= 6) {
			event.stage = 'choice'; event.settled = false; event.rival!.step = 'carminefinal';
			event.result.push(CARMINE.lines[7]);
		}
	} else if (advanced && chapter > 1 && (canInvite(r) || canInvite(r.carmine)) && random(100) < (chapter === 7 ? 100 : 65)) {
		event.stage = 'choice'; event.settled = false; event.rival!.step = 'invite';
		event.result.push(`「接下来这一段，和我结伴走吧？」${canInvite(r) ? RIVALS[r.id].name : '丹瑜'}向你发出邀请。`);
	}
	run.phase = 'event'; event.key = randomUUID();
}
export function rivalView(run: RogueRun) {
	const event = run.node!.event!, state = event.rival!, r = run.rival!, c = RIVALS[r.id];
	const option = (id: string, name: string) => ({ id, name, text: '', disabled: false });
	let options: ReturnType<typeof option>[] = [];
	if (event.stage === 'choice') {
		if (state.step === 'conversation') options = rivalConversationOptions(state.chapter, state.conversationTurn);
		else if (state.step === 'carmine') options = [option('carmine:listen', '欢迎丹瑜一起商量，也主动介绍自己的打算。'), option('carmine:trust', '温和地请她说说想法，认真听完。'), option('carmine:dismiss', '先说明当前情况，再请她一起确认计划。')];
		else if (state.step === 'carminefinal') options = [option('carmine:stay', '当然，我们三个人一起走。'), option('carmine:later', '期待下一次再与你相遇。')];
		else if (state.step === 'reward') options = [option('system:tera', '解锁太晶化并领取配套碎片'), option('system:mega', '解锁超进化并领取进化石'), option('system:z', '解锁 Z 招式并领取纯晶'), option('shards', '领取幻想碎片 ×100')];
		else if (state.step === 'invite') options = [
			...(canInvite(r) ? [option('join', '好，一起走这一段。')] : []),
			...(canInvite(r.carmine) ? [
				...(canInvite(r) ? [option('joinboth', '邀请丹瑜也一起结伴走这一段。')] : []),
				option('joincarmine', '与丹瑜同行，让乌栗先去独自训练。')] : []), option('solo', '这次想独自走走，下次再见。')];
		else if (state.step === 'talk') options = rivalChatOptions(state.turn);
		else if (state.chapter === 5 && state.task === 'search') options = ['溪流边', '旧营地', '石桥下'].flatMap((site, i) => state.found!.includes(i) ? [] : [option(`search:${i}`, `与${c.name}一起搜寻${site}`)]);
		else options = [option('start', '准备好了，开始吧。')];
	}
	return { paragraphs: event.result || [c.lines[state.chapter - 1]], options,
		rivalPortrait: state.step?.startsWith('carmine') ? 'carmine' : r.id,
		affection: state.step?.startsWith('carmine') ? r.carmine?.affection || 0 : r.affection,
		rivalApproval: state.step?.startsWith('carmine') ? (r.carmine?.affection || 0) >= 4 : r.affection >= 4 };
}
export function chooseRival(run: RogueRun, content: RogueContent, random: RogueRandom, choice: string) {
	const event = run.node!.event!, state = event.rival!, r = run.rival!;
	if (!rivalView(run).options.some(option => option.id === choice)) throw new Error('请选择当前奇遇提供的选项。');
	event.key = randomUUID();
	if (state.step === 'conversation') {
		const turn = state.conversationTurn || 0;
		const gain = rivalAffectionGain(r.id, choice, state.chapter);
		r.affection += gain;
		const pages = rivalAnswerPages(r.id, state.chapter, turn, choice, r.affection);
		pages[0].affectionGain = gain;
		state.conversationTurn = turn + 1;
		if (state.conversationTurn >= 2) {
			if (r.id === 'kieran' && state.chapter > 1) {
				state.step = 'carmine'; event.result = [CARMINE.lines[state.chapter - 1]];
				pages.push(dialoguePage('carmine', '丹瑜', CARMINE.lines[state.chapter - 1], (r.carmine?.affection || 0) >= 4, 'left'));
			} else prepareChapter(run, random);
		}
		event.result = pages.map(page => page.text);
		queueNarrative(run, pages, run.phase === 'ready' ? 'ready' : 'event');
	} else if (state.step === 'carmine') {
		const gain = rivalAffectionGain('carmine', ({ 'carmine:listen': 'warm', 'carmine:trust': 'honest', 'carmine:dismiss': 'cold' } as Record<string, string>)[choice], state.chapter);
		r.carmine!.affection += gain;
		event.result = [choice === 'carmine:listen' ? '丹瑜扬起嘴角：「这就对了！先说好，遇到麻烦可别把我晾在一边。」' :
			choice === 'carmine:trust' ? '「嗯，我是有些想法。」丹瑜放缓语气，认真补上了你们没注意到的细节。' :
			'「倒是考虑得挺清楚嘛。」丹瑜指了指地图，「这里再留个后手，我来照看这一侧。」'];
		prepareChapter(run, random);
		queueNarrative(run, [{ ...dialoguePage('carmine', '丹瑜', event.result[0], true, 'left'), affectionGain: gain }], 'event');
	} else if (state.step === 'carminefinal') {
		if (choice === 'carmine:stay') requestCompanion(run, { id: 'carmine', origin: 'carmine', permanent: true });
		event.stage = 'result'; event.settled = true;
		event.result = [choice === 'carmine:stay' ? '丹瑜也发出了永久同行的邀请。乌栗认真约好下一次切磋。名额不足时，请先选择告别的伙伴。' : '丹瑜笑着挥手：「照顾好你们自己。我也会走出自己的路，下次再见！」'];
		queueNarrative(run, [dialoguePage('carmine', '丹瑜', event.result[0], true, 'left')], 'event');
	} else if (choice === 'start') setFight(run, random);
	else if (['warm', 'honest', 'cold'].includes(choice)) {
		const gain = rivalAffectionGain(r.id, choice, state.chapter);
		r.affection += gain; state.turn = (state.turn || 0) + 1;
		const pages = rivalChatPages(r.id, state.turn - 1, choice, r.affection);
		pages[0].affectionGain = gain;
		event.result = pages.map(page => page.text);
		if (state.turn >= 3) finish(run, random, true);
		queueNarrative(run, pages, 'event');
	} else if (choice.startsWith('search:')) {
		const index = Number(choice.slice(7)); state.found!.push(index);
		if (index === state.answer) {
			r.affection++; finish(run, random, true);
		} else event.result = ['这里没有委托物资，但发现了新的足迹。你们一起排除了这个方向。'];
	} else if (choice === 'shards' || choice.startsWith('system:')) {
		if (choice === 'shards') normalizeBlessings(run).shards += 100;
		else grantSystem(run, choice.slice(7), '劲敌的认可 · 选择配套道具');
		finish(run, random, true);
	} else if (['join', 'solo', 'joinboth', 'joincarmine'].includes(choice)) {
		const until = run.floor + (state.chapter === 7 ? 8 : 5 + random(4));
		if (choice === 'join' || choice === 'joinboth') requestCompanion(run, { id: r.id, origin: 'rival', until });
		if (choice === 'joinboth' || choice === 'joincarmine') requestCompanion(run, { id: 'carmine', origin: 'carmine', until });
		event.stage = 'result'; event.settled = true;
		event.result = [choice !== 'solo' ? `与${choice === 'joincarmine' ? '丹瑜' : RIVALS[r.id].name + (choice === 'joinboth' ? '、丹瑜' : '')}约好结伴同行至第 ${until} 层。名额已满时，请先决定是否替换同行伙伴。同行期间，普通战斗有机会并肩出战，战利品略微增加。` : '你们挥手道别，约好下一次再见。'];
	}
}
export function settleRival(run: RogueRun, random: RogueRandom, won: boolean) {
	const event = run.node!.event!, chapter = event.rival!.chapter;
	if (won && run.encounter + 1 < run.node!.encounters.length) return;
	if (won && chapter === 6) {
		healNarrativeParty(run); event.stage = 'choice';
		event.rival!.step = 'reward'; event.key = randomUUID();
		event.result = ['「这次是你赢了。我准备了几份礼物，选一份能帮你继续前进的吧。」']; run.phase = 'event'; return;
	}
	finish(run, random, won);
}
export function expireRival(run: RogueRun, nextFloor = run.floor) {
	const r = run.rival, pages = [];
	if (!r) return false;
	for (const id of [r.id, ...(r.carmine ? ['carmine' as const] : [])]) {
		const state = id === 'carmine' ? r.carmine! : r;
		if (state.permanent || state.away || !state.temporaryUntil || nextFloor <= state.temporaryUntil) continue;
		state.temporaryUsed = true;
		delete state.temporaryUntil; // Transactional receipt: no second gift on reload.
		const gift = id === 'carmine' ? { item: CARMINE.item, name: CARMINE.giftName } : RIVAL_SNACK_GIFTS[id];
		const name = id === 'carmine' ? '丹瑜' : RIVALS[id].name;
		run.bag[gift.item] = (run.bag[gift.item] || 0) + 1;
		pages.push(dialoguePage(id, name, id === 'carmine' ? '我得先回北上乡看看。这个是给你的，才不是顺手捡的！照顾好伙伴，下次见面再跟我讲讲旅途吧。' : RIVAL_FAREWELLS[id], true, 'left'));
		pages.push(dialoguePage(id, name, `获得【同行训练家的赠礼】：${gift.name} ×1。${name}暂时告别，累积的好感与奇遇进度保留。`, true, 'left'));
	}
	if (pages.length) queueNarrative(run, pages, 'advance');
	return !!pages.length;
}
export function rivalCompanionView(run: RogueRun) {
	if (!run.rival || !accompanying(run.rival, run.floor)) return;
	return { ...run.rival, name: RIVALS[run.rival.id].name, text: run.rival.permanent ? '永久同行' : `结伴至第 ${run.rival.temporaryUntil} 层`,
		message: run.rival.affection >= 6 ? '一路走到这里，我们已经很有默契了。' : '下一段旅途，也一起加油吧。' };
}
export function rivalCompanionViews(run: RogueRun) {
	const result = [];
	if (run.rival && accompanying(run.rival, run.floor)) result.push(rivalCompanionView(run)!);
	const c = run.rival?.carmine;
	if (accompanying(c, run.floor)) result.push({ ...c!, id: 'carmine', name: '丹瑜', text: c!.permanent ? '永久同行' : `结伴至第 ${c!.temporaryUntil} 层`, message: '行啦，这段路一起走。要帮忙就说，不用一个人硬撑。' });
	return result;
}
export function rivalBlessingAllowed(run: RogueRun, family: string) {
	const people = Object.entries(COMPANIONS).filter(([, c]) => c.family === family);
	return !people.length || people.some(([id]) => id !== run.rival?.id);
}
