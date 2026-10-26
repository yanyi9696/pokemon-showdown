import type { RogueAccount, RogueRun, RogueCommand } from './types';
import type { RogueRandom } from './biome-pools';
import { TRAVELLERS } from './traveller-profiles';
import { COMPANIONS, type CompanionID } from '../../sim/rogue-companions';
import { travellingRoster } from './travellers';
import { AFFECTION_GIFT_LINES, AFFECTION_LINES, AFFECTION_CHAT_LINES } from './affection-dialogue';
import { affectionThemeGift, AFFECTION_FANTASY_CHOICES, AFFECTION_ADVANCED_REWARDS } from './affection-gifts';
import { normalizeBlessings } from './blessings';
import { randomUUID } from 'crypto';

export interface TrainerBond { score: number; gifts: number[]; pending: number[]; responses?: Record<number, string>; chats?: number }
export const AFFECTION_RULES = { stages: [50, 100], floor: 1, preference: 2, meeting: 2, response: 3, duel: 4, giftChance: 5 };
const person = (id: string) => TRAVELLERS[id] || COMPANIONS[id as CompanionID];
export function bond(run: RogueRun, id: string): TrainerBond {
	return (run.trainerBonds ||= {})[id] ||= { score: 0, gifts: [], pending: [] };
}
export function gainAffection(run: RogueRun, id: string, amount: number, receipt: string) {
	if (!person(id) || amount <= 0) return 0;
	const key = id + ':' + receipt, claims = run.affectionClaims ||= [];
	if (claims.includes(key)) return 0;
	claims.push(key);
	const b = bond(run, id), before = b.score; b.score = Math.min(100, b.score + amount);
	for (const stage of AFFECTION_RULES.stages) if (b.score >= stage && !b.gifts.includes(stage)) {
		b.gifts.push(stage); b.pending.push(stage);
		const gift = affectionThemeGift(id, stage);
		if (gift) run.bag[gift.id] = (run.bag[gift.id] || 0) + 1;
		if (stage === 100) {
			run.bag.rarecandy = (run.bag.rarecandy || 0) + 2;
			run.bag.goldbottlecap = (run.bag.goldbottlecap || 0) + 1;
			normalizeBlessings(run).pending.push({ id: randomUUID(), kind: 'item',
				title: `${person(id).name}的心意 · 自选一件幻想道具`, options: [...AFFECTION_FANTASY_CHOICES] });
		}
		(run.notices ||= []).push(`【${person(id).name}】好感度达到 ${stage}。获得${gift.name} ×1${stage === 100 ? '、' + AFFECTION_ADVANCED_REWARDS + '（待选择）' : ''}，有一段话想对你说。`);
	}
	return b.score - before;
}
/** Migrate the current journey only. Each new run starts fresh; story invitation rules stay unchanged. */
export function syncAffection(account: RogueAccount) {
	const run = account.run;
	if (!run) return;
	run.trainerBonds ||= {};
	if (!run.affectionVersion) {
		run.affectionVersion = 1;
		for (const c of [...run.blessings?.companions || [], ...run.socialCompanions || []]) {
			// Preserve progress toward the former 15-choice gift when importing an older journey.
			const b = bond(run, c.id); b.score = Math.max(b.score, Math.min(100, Math.floor(c.preferences * 50 / 15)));
			if (c.rewarded) { b.score = Math.max(b.score, 50); if (!b.gifts.includes(50)) b.gifts.push(50); }
			delete c.giftPending;
		}
		for (const [id, state] of [[run.rival?.id, run.rival], ['carmine', run.rival?.carmine]] as const) {
			if (!id || !state) continue;
			const b = bond(run, id);
			b.score = Math.max(b.score, Math.min(100, state.affection * 2));
		}
	}
}
export function affectionFloor(run: RogueRun, random: RogueRandom) {
	for (const c of travellingRoster(run)) {
		const key = c.id + ':floor:' + run.floor;
		if (run.affectionClaims?.includes(key)) continue;
		gainAffection(run, c.id, AFFECTION_RULES.floor, 'floor:' + run.floor);
		if (random(100) >= AFFECTION_RULES.giftChance) continue;
		const rewards = ['expcandyxs', 'potion', 'revive', 'shards'];
		const item = rewards[random(rewards.length)];
		if (item === 'shards' && run.blessings) run.blessings.shards += 3;
		else { const id = item === 'shards' ? 'potion' : item; run.bag[id] = (run.bag[id] || 0) + 1; }
		(run.notices ||= []).push(`${c.name}将一份小补给交给你：${{ expcandyxs: '经验糖果 XS ×1', potion: '伤药 ×1', revive: '活力碎片 ×1', shards: run.blessings ? '幻想碎片 ×3' : '伤药 ×1' }[item]}。`);
	}
}
/** New lines join ordinary conversation; repeatedly chatting never awards affection. */
export function affectionChat(run: RogueRun, id: string, ordinary: string) {
	const b = bond(run, id), lines = AFFECTION_CHAT_LINES[id];
	if (!lines || b.score < 50) return ordinary;
	const pool = b.score >= 100 ? [lines[1], ordinary, lines[0]] : [lines[0], ordinary];
	const line = pool[(b.chats || 0) % pool.length]; b.chats = (b.chats || 0) + 1;
	return line;
}
export function affectionGreeting(run: RogueRun, id: string, ordinary: string) {
	const score = run.trainerBonds?.[id]?.score || 0, lines = AFFECTION_CHAT_LINES[id];
	return score >= 50 && lines ? lines[score >= 100 ? 1 : 0] : ordinary;
}
export function affectionView(run: RogueRun) {
	const active = new Set(travellingRoster(run).map(c => c.id));
	return Object.entries(run.trainerBonds || {}).filter(([id]) => person(id)).map(([id, b]) => ({
		id, name: person(id).name, ...b, active: active.has(id),
	}));
}
export function affectionScene(run: RogueRun) {
	if (run.phase === 'battle' || run.story || run.dialogue || run.pendingMoves?.length) return;
	const entry = Object.entries(run.trainerBonds || {}).find(([, b]) => b.pending.length);
	if (!entry) return;
	const [id, b] = entry, stage = b.pending[0];
	return { id, stage, name: person(id).name, title: stage === 50 ? '一路同行的心意' : '想亲口告诉你的话',
		text: stage === 50 ? AFFECTION_GIFT_LINES[id] || (TRAVELLERS[id]?.thanks || '和你一起探索未知，是这段旅程里珍贵的收获。这份礼物请收下。') + '之后的路，我们也互相照应。' : AFFECTION_LINES[id],
		options: stage === 100 && ['nessa', 'olivia'].includes(id) ? [
			{ id: 'accept', name: '我也希望，以后的路有你。' }, { id: 'friends', name: '谢谢你。我更想珍惜我们作为朋友的同行。' },
		] : [{ id: 'thanks', name: stage === 50 ? '收下这份心意，约好继续同行。' : '认真回应这份心意。' }],
	};
}
export function affectionCommand(run: RogueRun, command: RogueCommand) {
	if (run.phase === 'battle') throw new Error('请在战斗外与训练家交流。');
	const scene = affectionScene(run);
	if (!scene || scene.id !== command.member || !scene.options.some(o => o.id === command.value)) throw new Error('这段对话已更新。');
	const b = bond(run, scene.id); b.pending.shift(); (b.responses ||= {})[scene.stage] = command.value!;
	(run.notices ||= []).push(command.value === 'friends' ? `${scene.name}微笑着点头：「谢谢你认真告诉我。我们仍是很好的同行伙伴。」` : `${scene.name}珍重地收下了你的回应。`);
}
