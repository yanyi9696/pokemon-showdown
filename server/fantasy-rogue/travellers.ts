import { companionTravelGift } from './affection-gifts';
import { gainAffection, affectionChat, AFFECTION_RULES } from './affection';
import { randomUUID } from 'crypto';
import { COMPANIONS } from '../../sim/rogue-companions';
import type { RogueRun, RogueCommand } from './types';
import type { CompanionOption } from './companions';
import { TRAVELLERS } from './traveller-profiles';
import { dialoguePage, queueNarrative } from './narrative';

export interface SocialCompanion {
	id: string; origin: 'event' | 'rival' | 'carmine'; away?: boolean;
	preferences: number; counted: string[]; rewarded?: boolean; giftPending?: boolean; message?: string;
}
export interface CompanionInvitation {
	key: string; id: string; origin: 'blessing' | 'event' | 'rival' | 'carmine';
	until?: number; permanent?: boolean;
}
export function travellingRoster(run: RogueRun) {
	const result: { id: string, name: string, origin: CompanionInvitation['origin'], temporary: boolean }[] = [];
	for (const c of run.blessings?.companions || []) if (!c.away) result.push({
		id: c.id, name: COMPANIONS[c.id].name, origin: 'blessing', temporary: false,
	});
	for (const c of run.socialCompanions || []) if (c.origin === 'event' && !c.away) result.push({
		id: c.id, name: TRAVELLERS[c.id].name, origin: 'event', temporary: false,
	});
	for (const [origin, state, id] of [
		['rival', run.rival, run.rival?.id], ['carmine', run.rival?.carmine, 'carmine'],
	] as const) if (state && id && !state.away && (state.permanent || state.temporaryUntil && state.temporaryUntil >= run.floor)) {
		result.push({ id, name: TRAVELLERS[id].name, origin, temporary: !state.permanent });
	}
	return result;
}
function accept(run: RogueRun, invite: CompanionInvitation) {
	if (invite.origin === 'blessing') {
		run.blessings!.companions!.find(c => c.id === invite.id)!.away = false;
	} else if (invite.origin === 'event') {
		let c = run.socialCompanions?.find(entry => entry.id === invite.id);
		if (!c) (run.socialCompanions ||= []).push(c = { id: invite.id, origin: 'event', preferences: 0, counted: [] });
		c.away = false;
	} else {
		const state = invite.origin === 'rival' ? run.rival! : run.rival!.carmine!;
		state.away = false;
		if (invite.permanent) {
			state.permanent = true; delete state.temporaryUntil;
			if (!run.socialCompanions?.some(c => c.id === invite.id)) {
				(run.socialCompanions ||= []).push({ id: invite.id, origin: invite.origin, preferences: 0, counted: [] });
			}
		} else {
			if (state.temporaryUsed && state.temporaryUntil !== invite.until) throw new Error('这位伙伴本局已经短期同行过。');
			state.temporaryUsed = true; state.temporaryUntil = invite.until;
		}
	}
	(run.notices ||= []).push(`${TRAVELLERS[invite.id]?.name || COMPANIONS[invite.id as keyof typeof COMPANIONS].name}加入同行。`);
}
export function requestCompanion(run: RogueRun, request: Omit<CompanionInvitation, 'key'>) {
	const active = travellingRoster(run);
	if (active.some(c => c.id === request.id)) {
		if (request.origin === 'blessing') {
			const existing = run.socialCompanions?.find(c => c.id === request.id && c.origin === 'event');
			if (existing) existing.away = true;
			accept(run, { ...request, key: '' });
		} else if (request.permanent) accept(run, { ...request, key: '' });
		return;
	}
	const invite = { ...request, key: randomUUID() };
	if (active.length < 2 && !run.companionInvitations?.length) accept(run, invite);
	else if (!run.companionInvitations?.some(c => c.id === invite.id)) (run.companionInvitations ||= []).push(invite);
}
export function companionInvitationView(run: RogueRun) {
	const invite = run.companionInvitations?.[0];
	if (!invite) return;
	return { ...invite, name: TRAVELLERS[invite.id]?.name || COMPANIONS[invite.id as keyof typeof COMPANIONS].name,
		roster: travellingRoster(run) };
}
function farewell(run: RogueRun, id: string) {
	const person = travellingRoster(run).find(c => c.id === id);
	if (!person) throw new Error('这位伙伴已经离队，请重新选择。');
	const profile = TRAVELLERS[id], pages = [dialoguePage(id, person.name,
		profile?.farewell || '这段同行的记录已经保存。期待下次再一起探索。', true, 'left')];
	if (person.origin === 'blessing') run.blessings!.companions!.find(c => c.id === id)!.away = true;
	else if (person.origin === 'event') run.socialCompanions!.find(c => c.id === id)!.away = true;
	else {
		const state = person.origin === 'rival' ? run.rival! : run.rival!.carmine!;
		state.away = true;
		if (!state.permanent && state.temporaryUntil) {
			delete state.temporaryUntil;
			const gift = companionTravelGift(run.floor); run.bag[gift.id] = (run.bag[gift.id] || 0) + 1;
			pages.push(dialoguePage(id, person.name, `获得【同行训练家的赠礼】：${gift.name} ×1。`, true, 'left'));
		}
	}
	// Do not replace an unplayed event/reward narrative or its continuation.
	if (run.dialogue) run.dialogue.pages.push(...pages);
	else if (run.phase !== 'battle' && run.phase !== 'story') queueNarrative(run, pages, run.phase);
}
export function chooseCompanionInvitation(run: RogueRun, key?: string, choice?: string) {
	const invite = run.companionInvitations?.[0];
	if (!invite || invite.key !== key) throw new Error('同行邀请已更新，请重新选择。');
	if (run.phase === 'battle' || run.story) throw new Error('请先结束对话或战斗。');
	if (choice !== 'decline') {
		if (travellingRoster(run).length >= 2) farewell(run, choice || '');
		else if (choice !== 'accept') throw new Error('请选择接受同行。');
		accept(run, invite);
	}
	run.companionInvitations!.shift();
}
/** One-time migration asks for a choice instead of silently retaining more than two companions. */
export function normalizeTravellers(run: RogueRun) {
	if (run.companionsVersion || ['battle', 'complete', 'postgame', 'defeated'].includes(run.phase)) return;
	run.companionsVersion = 1;
	for (const [origin, state, id] of [
		['rival', run.rival, run.rival?.id], ['carmine', run.rival?.carmine, 'carmine'],
	] as const) if (state?.permanent && id && !run.socialCompanions?.some(c => c.id === id)) {
		(run.socialCompanions ||= []).push({ id, origin, preferences: 0, counted: [] });
	}
	if (run.rival?.temporaryUntil) run.rival.temporaryUsed = true;
	if (run.rival?.carmine?.temporaryUntil) run.rival.carmine.temporaryUsed = true;
	for (const c of travellingRoster(run).slice(2)) {
		if (c.origin === 'blessing') {
			run.blessings!.companions!.find(entry => entry.id === c.id)!.away = true;
			requestCompanion(run, { id: c.id, origin: c.origin });
		} else if (c.origin === 'event') {
			run.socialCompanions!.find(entry => entry.id === c.id)!.away = true;
			requestCompanion(run, { id: c.id, origin: c.origin });
		} else {
			const state = c.origin === 'rival' ? run.rival! : run.rival!.carmine!;
			const until = state.temporaryUntil; state.away = true;
			(run.companionInvitations ||= []).push({ id: c.id, origin: c.origin, permanent: state.permanent,
				until, key: randomUUID() });
		}
	}
}
function socialActive(run: RogueRun) {
	const active = travellingRoster(run).filter(c => c.origin !== 'blessing' && !c.temporary);
	return (run.socialCompanions || []).filter(c => active.some(a => a.id === c.id));
}
export function socialRecommendation(run: RogueRun, id: string, options: CompanionOption[]) {
	const p = TRAVELLERS[id];
	const score = (o: CompanionOption) => {
		if (o.disabled || /^(leave|back|continue|finish|solo)$/.test(o.id)) return 0;
		if (o.name.includes(p.region)) return 100;
		const node = run.phase === 'choose' ? run.choices?.find(n => n.id === o.id && !n.fogged) : undefined;
		if (node && p.areas.includes(node.kind)) return 80;
		if (o.preference === p.preference) return 70;
		const pattern = p.preference === 'battle' ? /挑战|对战|战斗|切磋/ : p.preference === 'reward' ? /领取|奖励|补给|收下|宝物/ : /宝可梦|伙伴|钓鱼|捕捉|展示|领养/;
		return !/不|拒绝|离开|放弃|避开/.test(o.name) && pattern.test(o.name) ? 60 : 0;
	};
	return options.filter(o => score(o)).sort((a, b) => score(b) - score(a))[0]?.id;
}
export function socialCompanionViews(run: RogueRun, options: CompanionOption[]) {
	return socialActive(run).map(c => ({ ...c, name: TRAVELLERS[c.id].name, region: TRAVELLERS[c.id].region,
		preference: TRAVELLERS[c.id].preference, areas: TRAVELLERS[c.id].areas,
		recommended: socialRecommendation(run, c.id, options), canConsult: !!options.length,
		giftOptions: c.giftPending ? TRAVELLERS[c.id].gifts : [] }));
}
export function recordSocialPreference(run: RogueRun, options: CompanionOption[], choice: string, key: string) {
	for (const c of socialActive(run)) {
		if (c.counted.includes(key) || socialRecommendation(run, c.id, options) !== choice) continue;
		c.counted.push(key); c.preferences++;
		c.message = TRAVELLERS[c.id].thanks;
		gainAffection(run, c.id, AFFECTION_RULES.preference, 'preference:' + key);
	}
}
function claimSocialGift(run: RogueRun, c: SocialCompanion, item: string) {
	const gift = TRAVELLERS[c.id].gifts.find(g => g.id === item);
	if (!gift || !c.giftPending || c.rewarded) throw new Error('当前没有这份待领取的赠礼。');
	c.rewarded = true; delete c.giftPending; run.bag[item] = (run.bag[item] || 0) + 1;
	(run.notices ||= []).push(`【同行训练家的赠礼】${TRAVELLERS[c.id].name}：「${TRAVELLERS[c.id].thanks}」获得${gift.name} ×1。`);
}
export function socialCompanionCommand(run: RogueRun, command: RogueCommand, options: CompanionOption[]) {
	const c = socialActive(run).find(entry => entry.id === command.member);
	if (!c || run.phase === 'battle' || run.preview?.stage === 'result') throw new Error('这位训练家当前不能互动。');
	if (command.value?.startsWith('gift:')) claimSocialGift(run, c, command.value.slice(5));
	else if (command.value === 'advice') {
		const option = options.find(o => o.id === socialRecommendation(run, c.id, options));
		c.message = option ? `我想选择「${option.name}」。${TRAVELLERS[c.id].greeting}` : '先看看眼前的选项吧，你来决定。';
	} else if (command.value === 'chat') c.message = affectionChat(run, c.id, TRAVELLERS[c.id].greeting);
	else throw new Error('同行选项无效。');
}
