import type { AffectionRewards } from './affection';
import { randomUUID } from 'crypto';
import { restoreCoopChallengeGrowth } from './coop-growth';
import type { RogueCoopAdventure, RogueCoopSession, RogueRun } from './types';
import type { RogueBattleResult } from '../../sim/fantasy-rogue';
import type { RogueRandom } from './biome-pools';
import { offerOptionalChallenge, prepareChallengePrizes, chooseChallengePrize, optionalChallengeView,
	type ChallengePrize } from './optional-challenges';
import { escapedMember } from './progression';

type Entry = { userid: string, run: RogueRun };
export interface CoopChallenge {
	key: string;
	votes: Record<string, string | null>;
	prizes: ChallengePrize[];
	personal: Record<string, ChallengePrize[]>;
	selected?: 'star';
	targets: Record<string, string>;
}

export function offerCoopChallenge(adventure: RogueCoopAdventure, entries: Entry[], random: RogueRandom) {
	const run = { ...entries[0].run, doubleBattle: true, choices: adventure.routeChoices,
		challengeHistory: adventure.challengeHistory, team: entries.flatMap(entry => entry.run.team),
		blessings: { ...entries[0].run.blessings!, owned: entries.flatMap(entry => entry.run.blessings?.owned || []) },
	};
	offerOptionalChallenge(run, random);
	adventure.routeChoices = run.choices; adventure.challengeHistory = run.challengeHistory;
}

/** Resource prizes are rolled once against both parties; member-specific lessons keep their own targets. */
export function beginCoopChallenge(adventure: RogueCoopAdventure, entries: Entry[], random: RogueRandom) {
	const common = { ...entries[0].run, node: structuredClone(adventure.node),
		team: structuredClone(entries.flatMap(entry => entry.run.team)) };
	delete common.node!.challenge!.prizes;
	prepareChallengePrizes(common, random);
	const prizes = common.node!.challenge!.prizes!.filter(prize => !prize.training && !prize.star);
	const personal: CoopChallenge['personal'] = {};
	for (const { userid, run } of entries) {
		const copy = { ...run, node: structuredClone(adventure.node), team: structuredClone(run.team) };
		delete copy.node!.challenge!.prizes;
		prepareChallengePrizes(copy, random);
		personal[userid] = copy.node!.challenge!.prizes!.filter(prize => prize.training || prize.star);
	}
	const training = Object.values(personal).flat().find(prize => prize.training);
	if (training) prizes.push({ ...training, training: undefined });
	if (entries.every(entry => personal[entry.userid].some(prize => prize.star))) {
		prizes.push({ id: 'star', name: '摘星授业', money: 0, items: {} });
	}
	adventure.coopChallenge = { key: randomUUID(), votes: {}, prizes, personal, targets: {} };
	adventure.node!.challenge!.prizes = structuredClone(prizes);
	adventure.phase = 'route-interaction';
}

function starTargets(state: CoopChallenge, { userid, run }: Entry) {
	return (state.personal[userid] || []).filter(prize => {
		const mon = prize.star && run.team.find(member => member.id === prize.star!.member);
		return mon && !mon.egg && !mon.fusion && (mon.stars || 1) === prize.star!.from;
	}).map(prize => ({ member: prize.star!.member, from: prize.star!.from, to: prize.star!.to,
		species: run.team.find(mon => mon.id === prize.star!.member)!.set.species }));
}

export function coopChallengeView(adventure: RogueCoopAdventure, entries: Entry[], userid: string) {
	const state = adventure.coopChallenge, challenge = adventure.node?.challenge;
	if (!state || !challenge) return;
	const own = entries.find(entry => entry.userid === userid)!, partner = entries.find(entry => entry.userid !== userid)!;
	const view = optionalChallengeView({ ...own.run, node: structuredClone(adventure.node) });
	if (!view) return;
	const choices = challenge.stage === 'offer' ? [['accept', '共同接受挑战'], ['skip', '这次先不挑战']] :
		challenge.stage === 'paused' ? [['retry', '重新挑战'], ['leave', '逃离这一层（无奖励）']] :
		['closed', 'claimed'].includes(challenge.stage) ? [['leave', '共同继续前进']] :
		challenge.stage === 'won' && state.selected ? [['back', '重新选择奖励']] : [];
	return { ...view, key: state.key, selected: state.selected,
		choices: choices.map(([id, label]) => ({ id, label })),
		ownChoice: state.votes[userid], partnerChoice: state.votes[partner.userid],
		prizes: view.prizes?.map(prize => ({ ...prize,
			disabled: prize.id === 'star' && entries.some(entry => !starTargets(state, entry).length),
			training: prize.id === 'training' ? state.personal[userid].find(p => p.training)?.training?.map(entry => ({ ...entry,
				species: own.run.team.find(mon => mon.id === entry.member)?.set.species || '已离队伙伴' })) : undefined,
		})),
		ownTargets: starTargets(state, own), partnerTargets: starTargets(state, partner),
		ownTarget: state.targets[userid], partnerTarget: state.targets[partner.userid],
	};
}

function freshVote(state: CoopChallenge) {
	state.votes = {}; state.key = randomUUID();
}

export function chooseCoopChallenge(
	session: RogueCoopSession, entries: Entry[], owner: string, value: string, member?: string, rewards?: AffectionRewards
): 'none' | 'ready' | 'leave' | 'claimed' {
	const adventure = session.adventure!, state = adventure.coopChallenge!, challenge = adventure.node!.challenge!;
	const view = coopChallengeView(adventure, entries, owner)!;
	let chosen: string;
	if (value === 'target') {
		if (challenge.stage !== 'won' || state.selected !== 'star' || !view.ownTargets.some(t => t.member === member)) {
			throw new Error('请为自己选择仍符合摘星条件的伙伴。');
		}
		state.targets[owner] = member!;
		if (!entries.every(entry => starTargets(state, entry).some(t => t.member === state.targets[entry.userid]))) {
			return 'none';
		}
		chosen = 'prize:star';
	} else {
		const prize = value.startsWith('prize:') && challenge.stage === 'won' && !state.selected ?
			view.prizes?.find(p => p.id === value.slice(6) && !p.disabled) : undefined;
		if (value !== 'cancel' && !prize && !view.choices.some(option => option.id === value)) {
			throw new Error('挑战选项已变化，请刷新后重选。');
		}
		const owners = session.delegatedTo ? [session.hostUser, session.guestUser] : [owner];
		for (const id of owners) state.votes[id] = value === 'cancel' ? null : value;
		if (!state.votes[session.hostUser] || state.votes[session.hostUser] !== state.votes[session.guestUser]) return 'none';
		chosen = state.votes[session.hostUser]!;
		if (chosen === 'prize:star') {
			state.selected = 'star'; state.targets = {}; freshVote(state);
			return 'none';
		}
	}
	const record = adventure.challengeHistory?.find(entry => entry.id === challenge.id && entry.floor === adventure.floor);
	freshVote(state);
	if (chosen === 'accept' || chosen === 'retry') {
		challenge.stage = 'battle'; delete challenge.outcome;
		if (record) record.accepted = true;
		return 'ready';
	}
	if (chosen === 'skip') {
		challenge.stage = 'closed'; challenge.outcome = 'skipped';
		if (record) record.outcome = 'skipped';
		return 'none';
	}
	if (chosen === 'back') {
		delete state.selected; state.targets = {}; return 'none';
	}
	if (chosen === 'leave') {
		if (challenge.stage === 'paused') {
			challenge.stage = 'closed'; challenge.outcome = 'skipped';
			if (record) record.outcome = 'skipped';
		}
		return 'leave';
	}
	const id = chosen.slice(6), common = state.prizes.find(prize => prize.id === id)!;
	for (const { userid, run } of entries) {
		const personal = state.personal[userid];
		const prize = id === 'star' ? personal.find(p => p.star?.member === state.targets[userid])! :
			id === 'training' ? personal.find(p => p.training) || common : common;
		run.node = structuredClone(adventure.node); run.phase = 'event';
		run.node!.challenge!.prizes = [structuredClone(prize)];
		chooseChallengePrize(run, prize.id, rewards);
	}
	challenge.stage = 'claimed'; if (record) record.prize = id;
	delete state.selected; state.targets = {};
	return 'claimed';
}

/** A failed challenge cannot bank stolen items or provisional growth, but damage and costs remain. */
export function failedCoopChallengeResult(session: RogueCoopSession, result: RogueBattleResult) {
	const adventure = session.adventure!;
	if (!adventure.node?.challenge || result.won && !result.coopExit) return result;
	restoreCoopChallengeGrowth(session);
	const restore = (userid: string, team: RogueBattleResult['team'], bag: Record<string, number>) => {
		const member = adventure.members[userid];
		return {
			team: team.map(mon => {
				const original = member.team.find(old => old.id === mon.id);
				if (!original) throw new Error('挑战队伍快照与原队伍不一致。');
				const restored = escapedMember(original, mon);
				if (toID(restored.set.item) !== toID(original.set.item)) restored.set.item = '';
				restored.evolutionProgress = structuredClone(original.evolutionProgress);
				return restored;
			}),
			bag: Object.fromEntries(Object.entries(member.bag).map(([id, count]) => [id, Math.min(count, bag[id] || 0)])),
		};
	};
	if (!result.partnerTeam || !result.partnerBag) throw new Error('挑战结算缺少队友快照。');
	const own = restore(session.hostUser, result.team, result.bag);
	const partner = restore(session.guestUser, result.partnerTeam, result.partnerBag);
	return { ...result, won: false, team: own.team, bag: own.bag, partnerTeam: partner.team, partnerBag: partner.bag };
}

export function settleCoopChallenge(adventure: RogueCoopAdventure, result: RogueBattleResult) {
	const challenge = adventure.node?.challenge;
	if (!challenge) return false;
	if (challenge.stage !== 'battle' || !adventure.coopChallenge) throw new Error('挑战进度不完整，不能结算。');
	challenge.outcome = result.coopExit ? 'retreated' : result.won ? 'won' : 'lost';
	challenge.stage = result.won && !result.coopExit ? 'won' : 'paused';
	const record = adventure.challengeHistory?.find(entry => entry.id === challenge.id && entry.floor === adventure.floor);
	if (record) { record.outcome = challenge.outcome; record.turns = result.turns; }
	freshVote(adventure.coopChallenge);
	return true;
}
