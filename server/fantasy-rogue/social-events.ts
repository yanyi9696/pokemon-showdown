import { randomUUID } from 'crypto';
import { RIVALS } from './rival-data';
import { TRAVELLERS } from './traveller-profiles';
import { travellingRoster, requestCompanion } from './travellers';
import { trainerReunionPages } from './trainer-reunions';
import { dialoguePage, queueNarrative, healNarrativeParty } from './narrative';
import { lowerToEligibleStage } from './evolution';
import { randomSpeciesEligible } from './species-eligibility';
import { makeEncounterSet } from './encounter-sets';
import type { RogueRun } from './types';
import type { RogueRandom } from './biome-pools';

export interface SocialEvent { trainer: string; step: 'talk' | 'reply' | 'invite'; affinity: number }
export function socialCandidates(run: RogueRun) {
	const active = travellingRoster(run).map(c => c.id);
	return Object.values(TRAVELLERS).filter(p => !(p.id in RIVALS) && p.id !== 'carmine' &&
		!active.includes(p.id) && !run.blessings?.companions?.some(c => c.id === p.id));
}
export function beginSocialEvent(run: RogueRun, random: RogueRandom) {
	const pool = socialCandidates(run);
	if (!pool.length) return false;
	const person = pool[random(pool.length)];
	run.node!.event = { id: 'travellermeeting', key: randomUUID(), stage: 'choice',
		social: { trainer: person.id, step: 'talk', affinity: 0 } };
	run.node!.name = `旅途同行 · ${person.name}`;
	run.node!.reward = { money: 0, items: {} };
	run.node!.encounters = []; run.encounter = 0; run.phase = 'event';
	(run.eventHistory ||= []).push({ id: 'travellermeeting', floor: run.floor });
	queueNarrative(run, [
		...trainerReunionPages(run, person.id), dialoguePage(person.id, person.name, person.greeting),
	], 'event');
	return true;
}
export function socialEventView(run: RogueRun) {
	const event = run.node!.event!, social = event.social!, person = TRAVELLERS[social.trainer];
	const option = (id: string, name: string, preference?: string) => ({ id, name, preference, disabled: false, text: '' });
	const options = event.stage !== 'choice' ? [] : social.step === 'invite' ?
		[option('join', '一起走吧，接下来的旅途也请多指教。'), option('decline', '谢谢你，期待下次再同行。')] :
		social.step === 'reply' ? [
			option('battle', '让我们认真切磋，用对战回应这份心意。', 'battle'),
			option('reward', '分享一路收集的物资，让旅人都能走得更远。', 'reward'),
			option('pokemon', '我想多听听伙伴的声音，陪它们探索世界。', 'pokemon'),
		] : [
			option('battle', '想和你痛快地切磋一场。', 'battle'),
			option('reward', '沿路的收获与馈赠，让我一直想继续旅行。', 'reward'),
			option('pokemon', '每次遇见新的宝可梦，都让我很开心。', 'pokemon'),
			option('leave', '挥手打过招呼，继续自己的旅程。'),
		];
	return { paragraphs: event.result || [person.greeting, '话题渐渐转到各自的旅途。你想怎样回应？'], options,
		rivalPortrait: person.id, rivalApproval: social.affinity > 0 };
}
function result(run: RogueRun, text: string, smile = true) {
	const event = run.node!.event!, person = TRAVELLERS[event.social!.trainer];
	event.stage = 'result'; event.settled = true; event.result = [text];
	run.phase = 'event';
	queueNarrative(run, [dialoguePage(person.id, person.name, text, smile)], 'event');
}
export function chooseSocialEvent(run: RogueRun, choice: string, random: RogueRandom) {
	const event = run.node!.event!, social = event.social!, person = TRAVELLERS[social.trainer];
	event.key = randomUUID();
	if (choice === 'leave' || choice === 'decline') {
		event.trainingAidBlocked = true; result(run, person.farewell); return;
	}
	if (choice === 'join') {
		requestCompanion(run, { id: person.id, origin: 'event' });
		result(run, person.chat?.join || '那就一起走吧。名额满了的话，也请认真和原来的伙伴道别。'); return;
	}
	if (choice === person.preference) social.affinity++;
	if (social.step === 'talk' && choice !== 'battle') {
		social.step = 'reply'; event.result = [person.chat?.reply || (social.affinity ? '「我也这么想。那你希望接下来怎样旅行呢？」' : '「原来是这样。我也想听听你对伙伴和旅途的想法。」')]; return;
	}
	if (social.affinity >= 2) {
		social.step = 'invite'; event.result = [person.chat?.invite || '「一路聊下来，我很认同你的想法。接下来，让我和你一起走一段更长的路吧？」']; return;
	}
	if (choice === 'battle') {
		const level = Math.min(100, Math.max(3, Math.ceil(run.floor / 2)) + 2);
		run.node!.encounters = [{ name: person.name, catchable: false, style: 'balanced',
			trainer: { id: person.id, avatar: person.id, name: person.name, role: 'traveller', tera: false },
			team: [...new Set(person.team.map(name => lowerToEligibleStage(name, level)))]
				.filter(name => randomSpeciesEligible(name, level)).slice(0, 3)
				.map(name => makeEncounterSet(name, level, 20)),
		}];
		event.stage = 'battle'; run.phase = 'ready'; return;
	}
	const item = ['potion', 'ether', 'oranberry'][random(3)];
	run.bag[item] = (run.bag[item] || 0) + 1;
	result(run, '和你聊得很开心。这份小补给请收下，愿我们都能遇见更多美好的事。');
}
export function settleSocialEvent(run: RogueRun, won: boolean) {
	const event = run.node!.event!, social = event.social!, person = TRAVELLERS[social.trainer];
	healNarrativeParty(run); event.trainingAidBlocked = !won;
	if (won && person.preference === 'battle') {
		event.key = randomUUID(); event.stage = 'choice'; social.step = 'invite';
		run.phase = 'event';
		event.result = [person.chat?.win || '「你的指挥让我看见了你对伙伴的信任。我想继续与你同行，看看你们接下来的成长。」'];
		queueNarrative(run, [dialoguePage(person.id, person.name, event.result[0], true)], 'event');
	} else {
		if (won) run.bag.superpotion = (run.bag.superpotion || 0) + 1;
		result(run, won ? person.chat?.win || '这场切磋很精彩。先帮伙伴恢复健康，再收下这份好伤药吧！' :
			person.chat?.loss || '这次先到这里。我帮伙伴们恢复好了，下次再来检验彼此的进步吧。');
	}
}
