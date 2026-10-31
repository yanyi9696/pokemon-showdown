import { randomUUID } from 'crypto';
import { Dex } from '../../sim/dex';
import { experienceAtLevel, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import type { RogueRandom } from './biome-pools';
import type { RogueRun, RogueNode } from './types';
import { OPTIONAL_CHALLENGES, type ChallengeRole } from './challenge-data';
import { makeEncounterSet, regionalEncounterLevel } from './encounter-sets';
import { fixedFloor } from './content';
import { encounterCoins, routeCandyReward } from './early-balance';
import { catchupPlan } from './late-support';
import { gainExperience, initializeExperience, rebuildMember } from './progression';
import { machineMoves, premiumMachine } from './trading';
import { requestCompanion } from './travellers';
import { gainAffection, AFFECTION_RULES } from './affection';
import { TRAVELLERS } from './traveller-profiles';
import { GROWTH_LIMITS, syncGrowthParty, growthPercent } from './growth';
import { natureMintSupplies } from './nature-mints';

export const CHALLENGE_GROWTH = 100;
export const CHALLENGE_GROWTH_TEXT = '获胜并领取奖励后，全队本局双攻、双防各永久提升 1%；后来加入的伙伴同样生效。';

export interface ChallengePrize {
	id: string; name: string; money: number; items: Record<string, number>;
	training?: { member: string, level: number, experience: number }[];
	star?: { member: string, from: number, to: number };
}
export interface OptionalChallenge {
	id: string; key: string; stage: 'offer' | 'battle' | 'paused' | 'won' | 'closed' | 'claimed';
	prizes?: ChallengePrize[]; outcome?: 'won' | 'retreated' | 'lost' | 'skipped';
}
export interface ChallengeRecord {
	id: string; floor: number; accepted?: boolean; outcome?: OptionalChallenge['outcome']; turns?: number; prize?: string;
}
const dex = Dex.mod('gen9fantasy');
export const challengeGrace = (floor: number) =>
	floor <= 10 ? 1 : [50, 100, 150].find(start => floor > start && floor <= start + 10);
export const challengeChance = (floor: number) => challengeGrace(floor) ? 16 : 8;

function trainedSet(
	[species, ability, item, moves, authoredRole]: typeof OPTIONAL_CHALLENGES[number]['team'][number], level: number
) {
	const set = { ...makeEncounterSet(species, level, 31), ability, item, moves: [...moves] };
	const base = dex.species.get(species).baseStats;
	const support: Record<string, ChallengeRole> = { Electrode: 'screens', Weezing: 'wall', Muk: 'bulkyphysical',
		Milotic: 'wall', Rhyperior: 'bulkyphysical', Pelipper: 'wall', Tangrowth: 'wall', Vaporeon: 'wall',
		Arcanine: 'bulkyphysical', Hippowdon: 'wall', Cradily: 'specialwall' };
	const role = authoredRole || support[species] || (base.atk >= base.spa ? 'physical' : 'special');
	const spreads: Record<ChallengeRole, [string, StatIDExceptHP | 'hp', StatIDExceptHP | 'hp']> = {
		physical: ['Jolly', 'atk', 'spe'], special: ['Timid', 'spa', 'spe'],
		bulkyphysical: ['Adamant', 'hp', 'atk'], bulkyspecial: ['Modest', 'hp', 'spa'],
		wall: ['Bold', 'hp', 'def'], specialwall: ['Calm', 'hp', 'spd'], screens: ['Timid', 'hp', 'spe'],
		slowphysical: ['Brave', 'hp', 'atk'], slowspecial: ['Quiet', 'hp', 'spa'],
	};
	const [nature, first, second] = spreads[role];
	set.nature = nature;
	// Early rosters are trained progressively, rather than granting six fully trained stats.
	const effort = Math.min(252, level * 4);
	set.evs[first] = effort; set.evs[second] = effort;
	if (role.startsWith('slow')) set.ivs.spe = 0;
	if (!moves.some(id => dex.moves.get(id).category === 'Physical')) set.ivs.atk = 0;
	return set;
}
export function challengeNode(id: string, floor: number, spirit?: string): RogueNode {
	const def = OPTIONAL_CHALLENGES.find(entry => entry.id === id);
	if (!def) throw new Error('挑战不存在。');
	const team = def.team.map(entry => trainedSet(entry, regionalEncounterLevel(floor, true, spirit)));
	return { id: `challenge:${id}`, name: def.name, kind: 'challenge', challenge: { id, key: randomUUID(), stage: 'offer' },
		// These rewards have their own one-time ledger; normal route loot must not be generated again.
		economyPrepared: true, spiritPrepared: true, reward: { money: 0, items: {} },
		encounters: [{ key: randomUUID(), name: def.opponent || def.speaker, catchable: false, style: 'balanced', team,
			trainer: { id: `challenge${id}`, name: def.opponent || def.speaker,
				avatar: def.avatar, role: 'traveller', tera: false } }] };
}
/** Replace an ordinary combat slot. Never displace a story, elite pity, trade or catch-up offer. */
export function offerOptionalChallenge(run: RogueRun, random: RogueRandom) {
	if (run.floor < 5 || run.floor >= 200 || fixedFloor(run.floor) || run.postgame ||
		!run.choices?.length || run.choices.some(n => n.challenge)) return;
	const history = run.challengeHistory || [];
	const grace = challengeGrace(run.floor);
	if (history.some(h => run.floor - h.floor < 8) || grace && history.some(h => challengeGrace(h.floor) === grace)) return;
	const protectedKind = run.blessings?.owned.some(b => b.family === 'battletask');
	const replaceable = (n: RogueNode) => (n.kind === 'trainer' || n.kind === 'wild' && !protectedKind) &&
		n.id !== 'rival' && !n.event && !n.trade && !n.rewardScene && !n.rocket;
	const index = run.choices.findIndex(n => n.kind === 'trainer' && replaceable(n)) >= 0 ?
		run.choices.findIndex(n => n.kind === 'trainer' && replaceable(n)) : run.choices.findIndex(replaceable);
	if (index < 0) return;
	const available = OPTIONAL_CHALLENGES.filter(def => run.floor >= def.from && run.floor <= def.through &&
		!history.some(h => h.id === def.id));
	if (!available.length || random(100) >= challengeChance(run.floor)) return;
	let roll = random(available.reduce((sum, d) => sum + (d.weight ?? 100), 0));
	const def = available.find(d => { roll -= d.weight ?? 100; return roll < 0; })!;
	run.choices[index] = challengeNode(def.id, run.floor, run.spirit);
	(run.challengeHistory ||= []).push({ id: def.id, floor: run.floor });
}
export function prepareChallengePrizes(run: RogueRun, random: RogueRandom) {
	const challenge = run.node?.challenge;
	if (!challenge || challenge.prizes) return;
	const coins = encounterCoins(run.floor);
	const prizes: ChallengePrize[] = [];
	const bundle = routeCandyReward(run.floor, 'elite', 1.6);
	const purse = Math.round(coins * 1.8 / 50) * 50;
	const moves = [...new Set(run.team.filter(mon => !mon.egg).flatMap(machineMoves))].filter(premiumMachine);
	for (let i = 0; i < 2 && moves.length; i++) {
		const move = moves.splice(random(moves.length), 1)[0];
		prizes.push({ id: `move${i}`, name: '战术研习箱', money: purse,
			items: { ...bundle, [`roguetm${move}`]: 1 } });
	}
	const natures = dex.natures.all().filter(n => n.plus && n.minus);
	const nature = natures[random(natures.length)];
	prizes.push({ id: 'mint', name: '精修培育箱', money: purse,
		items: { ...bundle, [`roguemint${nature.id}`]: 1, ...natureMintSupplies(run.floor) } });
	prizes.push({ id: 'supplies', name: '挑战者藏宝箱', money: Math.round(coins * 2.8 / 50) * 50,
		items: { ...bundle, [run.floor < 100 ? 'superpotion' : 'hyperpotion']: 2 } });
	const xp: Record<string, number> = {
		expcandyxs: 100, expcandys: 800, expcandym: 3000, expcandyl: 10000, expcandyxl: 30000,
	};
	let budget = Math.floor(Object.entries(routeCandyReward(run.floor, 'elite'))
		.reduce((sum, [id, count]) => sum + xp[id] * count, 0) * 3);
	const plan = catchupPlan(run);
	const training = plan.map((entry, index) => {
		const mon = run.team.find(member => member.id === entry.member)!;
		initializeExperience(mon);
		const growth = rogueSpeciesData(mon.fusion?.first.set.species || mon.set.species).growth;
		const target = experienceAtLevel(growth, entry.level);
		const experience = Math.max(0, Math.min(target - mon.experience!, Math.floor(budget / (plan.length - index))));
		budget -= experience;
		return { member: mon.id, level: entry.level, experience };
	}).filter(entry => entry.experience > 0);
	if (training.length) prizes.push({ id: 'training', name: '全队复盘特训', money: purse, items: {}, training });
	if (OPTIONAL_CHALLENGES.find(d => d.id === challenge.id)?.starLesson) {
		for (const mon of run.team.filter(m => !m.egg && !m.fusion && (m.stars || 1) < 5)) {
			prizes.push({ id: `star:${mon.id}`, name: '摘星授业', money: 0, items: {},
				star: { member: mon.id, from: mon.stars || 1, to: (mon.stars || 1) + 1 } });
		}
	}
	challenge.prizes = prizes;
}
export function challengeRecord(run: RogueRun) {
	return run.challengeHistory?.find(entry => entry.id === run.node?.challenge?.id && entry.floor === run.floor);
}
export function chooseChallengePrize(run: RogueRun, id: string) {
	const challenge = run.node?.challenge;
	if (run.phase !== 'event' || challenge?.stage !== 'won') throw new Error('请在挑战胜利后选择一份奖励。');
	const prize = challenge.prizes?.find(entry => entry.id === id);
	if (!prize) throw new Error('请选择本次挑战提供的奖励。');
	const starMember = prize.star && run.team.find(m => m.id === prize.star!.member);
	if (prize.star && (!starMember || starMember.egg || starMember.fusion || (starMember.stars || 1) !== prize.star.from)) {
		throw new Error('这名伙伴的星级或状态已改变，请选择其他奖励。');
	}
	challenge.stage = 'claimed';
	// Challenge victories grant this small bonus even before ordinary training opens on floor 40.
	// The claimed stage is saved with the rewards and prevents retry/reconnect duplication.
	const growth = run.growth ||= { offense: 0, defense: 0, experience: 0 };
	const gains = (['offense', 'defense'] as const).map(kind => {
		const amount = Math.max(0, Math.min(CHALLENGE_GROWTH, GROWTH_LIMITS[kind] - growth[kind]));
		growth[kind] += amount;
		return `${kind === 'offense' ? '双攻' : '双防'} +${growthPercent(amount)}`;
	});
	syncGrowthParty(run);
	const growthText = `挑战历练：全队本局永久${gains.join('、')}。`;
	const record = challengeRecord(run);
	if (record) record.prize = id;
	run.money += prize.money;
	for (const [item, count] of Object.entries(prize.items)) run.bag[item] = (run.bag[item] || 0) + count;
	if (prize.star && starMember) { starMember.stars = prize.star.to; rebuildMember(starMember, run.boosts); }
	for (const entry of prize.training || []) {
		const mon = run.team.find(member => member.id === entry.member);
		if (mon && !mon.egg && !mon.fixedLevel) {
			initializeExperience(mon);
			const growthRate = rogueSpeciesData(mon.fusion?.first.set.species || mon.set.species).growth;
			const target = experienceAtLevel(growthRate, entry.level);
			gainExperience(run, mon, Math.max(0, Math.min(entry.experience, target - mon.experience!)));
		}
	}
	run.lastReward = { floor: run.floor, name: `${run.node!.name} · ${prize.name}`,
		money: prize.money, items: { ...prize.items }, points: 0,
		effect: (prize.star ? `【${starMember!.set.species}】提升至 ${prize.star.to} 星。` : '') + growthText };
	(run.notices ||= []).push(growthText);
	for (const companionID of OPTIONAL_CHALLENGES.find(d => d.id === challenge.id)?.companions || []) {
		gainAffection(run, companionID, AFFECTION_RULES.duel, `challenge:${challenge.key}`);
		// A current rival keeps their story identity; other trainers use the usual event invitation.
		requestCompanion(run, run.rival?.id === companionID ?
			{ id: companionID, origin: 'rival', permanent: true } : { id: companionID, origin: 'event' });
	}
}
export function optionalChallengeView(run: RogueRun) {
	const challenge = run.node?.challenge;
	const def = OPTIONAL_CHALLENGES.find(entry => entry.id === challenge?.id);
	if (!challenge || !def) return;
	return { ...challenge, name: def.name, speaker: def.speaker, avatar: def.avatar, hint: def.hint,
		growthText: CHALLENGE_GROWTH_TEXT,
		portraits: def.portraits || [], serious: !!def.serious,
		companions: (def.companions || []).map(id => ({ id, name: TRAVELLERS[id].name })),
		paragraphs: challenge.stage === 'offer' || challenge.stage === 'battle' ? def.opening :
		[challenge.outcome === 'won' ? def.victory : def.retreat],
		team: run.node!.encounters[0].team.map(set => ({ species: set.species, level: set.level,
			ability: set.ability, item: set.item, moves: set.moves })),
		prizes: challenge.prizes?.map(prize => ({ ...prize,
			star: prize.star && { ...prize.star,
				species: run.team.find(mon => mon.id === prize.star!.member)?.set.species || '伙伴' },
			training: prize.training?.map(entry => ({ ...entry,
				species: run.team.find(mon => mon.id === entry.member)?.set.species || '伙伴' })) })),
	};
}
