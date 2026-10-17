import { Dex, toID } from '../../sim/dex';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueContent, RogueRun, RogueTrainer } from './types';
import type { RogueRandom } from './biome-pools';
import { drawGiftSpecies } from './gifts';
import { makeEncounterSet, randomEncounterIVs } from './encounter-sets';
import { themedEventTeam } from './event-teams';
import { gift } from './blessings';
import { eventCost } from './early-balance';
import { SERVICE_TEXT as text, POSTCARDS } from './event-service-text';
import {
	teachingMoves, hasFantasyMove, teachMove, FREE_TUTOR_MOVES, effortTotal, allocateEffort,
} from './event-learning';
import {
	conversionChoices, conversionPreview, convertRegional, regionalPool, regionalGift, type Postcard,
} from './event-travel';

const dex = Dex.mod('gen9fantasy');
export interface ServiceEvent {
	step?: string;
	region?: Postcard;
	member?: string;
	target?: string;
	partner?: RoguePokemon;
	grants?: { member: string, amount?: number }[];
}
export interface ServiceOption { id: string; name: string; text: string; disabled: boolean }
export interface ServiceView {
	paragraphs?: string[];
	options: ServiceOption[];
	picker?: { label: string, options: ServiceOption[] };
	evAllocation?: { member: string, species: string, total: number, current: StatsTable, minimum: StatsTable };
	preview?: ReturnType<typeof conversionPreview>;
}
const option = (id: string, name: string, detail = '', disabled = false): ServiceOption =>
	({ id, name, text: detail, disabled });
const leaving = () => option('leave', '今天先到这里。', '结束本次互动。');
const level = (run: RogueRun) => Math.max(3, Math.min(100, Math.ceil(run.floor / 2)));
export const trainingEvent = (id: string) => ['travel', 'martial', 'tutor'].includes(id);
export const trainingFloor = (id: string) => id === 'travel' ? 11 : id === 'martial' ? 20 : id === 'tutor' ? 25 : 1;
const effortReward = (run: RogueRun) => 8 + 4 * Math.min(4, Math.floor((run.floor - 1) / 40));
const tuition = (run: RogueRun) => eventCost(run.floor, 0.75);
export const demonstrationCost = (run: RogueRun) =>
	eventCost(run.floor, 0.25) * run.team.filter(mon => teachingMoves(mon).length).length;
function end(run: RogueRun, paragraphs: string[]) {
	Object.assign(run.node!.event!, { stage: 'result', result: [...paragraphs], settled: true });
	run.phase = 'event';
}
function fight(run: RogueRun, team: PokemonSet[], paragraphs: string[], trainer?: RogueTrainer) {
	const node = run.node!;
	node.event!.stage = 'battle'; node.event!.result = [...paragraphs];
	delete node.spiritPrepared; delete node.blessingPrepared; delete node.wildLoot;
	node.reward = { money: 0, items: {} };
	node.encounters = [{ name: trainer?.name || '地区形态精英', team, trainer, catchable: !trainer, style: 'balanced' }];
	run.encounter = 0; run.phase = 'ready';
}
function trainerBattle(run: RogueRun, tutor: boolean, random: RogueRandom) {
	const lv = Math.min(100, level(run) + 2);
	const team = themedEventTeam(tutor ? 'tutor' : 'martial', lv, 3, random);
	const trainer: RogueTrainer = { id: tutor ? 'travellingtutor' : 'cliffmaster',
		name: tutor ? '旅行中的武学少女' : '山崖边的武学家', avatar: tutor ? 'backpackerf' : 'sage', role: 'traveller', tera: false };
	fight(run, team, tutor ? text.fantasy : text.power, trainer);
}
function state(run: RogueRun) {
	run.node!.event!.service ||= {};
	return run.node!.event!.service;
}
function partnerOptions(run: RogueRun, predicate: (mon: RoguePokemon) => boolean) {
	return run.team.map(mon => option(`member:${encodeURIComponent(mon.id)}`, mon.set.species,
		`Lv.${mon.set.level}`, !predicate(mon)));
}
export function serviceEventView(run: RogueRun): ServiceView | undefined {
	const event = run.node?.event;
	if (!event || !trainingEvent(event.id) || event.stage !== 'choice') return;
	const s = event.service || {}, step = s.step || '', mon = run.team.find(p => p.id === s.member);
	const canLearn = (partner: RoguePokemon) => teachingMoves(partner).some(move =>
		FREE_TUTOR_MOVES.has(move) || run.money >= tuition(run));
	const result = (paragraphs: string[], options: ServiceOption[]): ServiceView => {
		options = options.filter(o => o.id !== 'leave' || event.id !== 'travel' && !event.committed && !step);
		// If the party changes or a lesson becomes unaffordable, conclude without a reward or a dead end.
		if (!options.some(o => !o.disabled)) {
			paragraphs = [...paragraphs, '现在没有能继续接受这次教学或帮助的伙伴，这次交流到这里结束。'];
			options.push(option('unavailable', '听完对方的话。'));
		}
		return { paragraphs, options: options.map(o => ({ ...o,
			text: o.id === 'demo' ? '本次共 ' + demonstrationCost(run) + ' 金币，教学后付款。' :
				o.id === 'ask' ? '收费招式 ' + tuition(run) + ' 金币，部分招式免费。' :
				o.id.startsWith('member:') || o.id.startsWith('swap:') || o.id.startsWith('postcard:') ? o.text : '',
		})) };
	};
	if (event.id === 'travel') {
		if (!step) return result(text.travel, [...Object.entries(POSTCARDS).map(([id, card]) =>
			option(`postcard:${id}`, `${card.name}明信片`, card.text)), leaving()]);
		const card = POSTCARDS[s.region!];
		if (step === 'postcard') return result([card.name, card.text, '你把手指放在明信片上，画面仿佛慢慢动了起来。'],
			[option('enter', '触碰明信片，出发。'), option('back', '换一张明信片。'), leaving()]);
		if (step === 'paths') return result([card.scene], [option('road', '走大路。', '挑战可捕捉的地区形态精英；恢复战前消耗，保留捕捉与战斗经验。'),
			option('path', '走小路。', '看看草丛里传来的声音。')]);
		if (step === 'professor') {
			const choices = conversionChoices(run, s.region!);
			return result([...text.professor, '「咦，我还没见过这种样子！你愿意和我交换吗？先看看我这里的伙伴吧。」'],
				[...choices.map(c => option(`swap:${encodeURIComponent(c.member)}:${toID(c.target)}`,
					run.team.find(p => p.id === c.member)!.set.species,
					`预览 ${c.target}；保留原伙伴培养记录。`)), leaving()]);
		}
		if (step === 'swap') {
			const valid = conversionChoices(run, s.region!).some(c => c.member === s.member && c.target === s.target);
			return { ...result(['博士放出对应的伙伴，等着你的回答。', '形态改变后保留等级、星级、个体值、努力值、亲密度与永久增益；血量保持比例，已有合法招式 PP 保留。'],
				[option('confirm', '同意交换。', '播放虚拟交换动画；原伙伴保留，仅改变形态和招式池。', !valid),
					option('back', '再看看其他伙伴。'), leaving()]),
			preview: valid ? conversionPreview(run, s.member!, s.target!) : undefined };
		}
		if (step === 'adopt') return result([...text.professor, ...text.adopt,
			`博士展示了 ${s.partner!.set.species}，Lv.${s.partner!.set.level}，已经恢复健康。`],
		[option('adopt', '我来照顾吧。', '免费领取这位伙伴。'), leaving()]);
	} else if (event.id === 'martial') {
		if (!step) return result(text.martial, [option('skill', '技巧更重要。',
			run.team.some(p => effortTotal(p) > 0) ? '为一只已有努力值的伙伴免费重配一次。' : '暂时没有可重配努力值的伙伴。',
			!run.team.some(p => effortTotal(p) > 0)),
		option('power', '力量更重要。', run.team.some(p => effortTotal(p) < 510) ?
			`挑战老人；获胜后全队每只新增 ${effortReward(run)} 点努力值，已满成员不再增加。` :
			'挑战老人；全队努力值已满，本次无法再获得额外努力值。'), leaving()]);
		if (step === 'skill') return result(text.skill, [...partnerOptions(run, p => effortTotal(p) > 0), leaving()]);
		if (step === 'rewards') return result(text.powerWin,
			[...partnerOptions(run, p => !!s.grants?.some(g => g.member === p.id)),
				option('leave', '结束教学，放弃剩余点数。')]);
		if (step === 'evs' && mon) {
			const extra = s.grants?.find(g => g.member === mon.id)?.amount || 0;
			return { ...result([extra ? `为 ${mon.set.species} 分配新增努力值；已有点数保留。` : `重新分配 ${mon.set.species} 已有的努力值，总量不变。`],
				[option('allocate', '确认分配。'), option('back', '返回伙伴选择。')]),
			evAllocation: { member: mon.id, species: mon.set.species, total: Math.min(510, effortTotal(mon) + extra),
				current: { ...mon.set.evs }, minimum: extra ? { ...mon.set.evs } :
				{ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } } };
		}
	} else {
		if (!step) return result(text.tutor, [option('demo', '先露两手看看。',
			`全队每只随机学会一个合法新招式，不限来源；本次共 ${demonstrationCost(run)} 金币，教学后统一付款。`,
			!run.team.some(p => teachingMoves(p).length) || run.money < demonstrationCost(run)),
		option('ask', '求求你，教教我们吧。', `为一只伙伴自选一个合法招式，${tuition(run)} 金币；指定十招免费。`, !run.team.some(canLearn)),
		option('fantasy', '这个招式，你也会吗？', '展示已掌握的幻想招式并挑战；获胜后全队每只自选一个合法新招式，不限来源。', !hasFantasyMove(run)), leaving()]);
		if (step === 'ask' || step === 'rewards') return result(step === 'ask' ? text.beg : text.tutorWin,
			[...partnerOptions(run, p => step === 'ask' ? canLearn(p) : !!s.grants?.some(g => g.member === p.id) &&
				teachingMoves(p).length > 0),
			option('leave', step === 'ask' ? '暂时不学，告辞。' : '结束教学，放弃剩余机会。')]);
		if (step === 'moves' && mon) {
			const reward = !!s.grants;
			return { ...result([`为 ${mon.set.species} 选择一个尚未掌握的合法招式。`,
				'学习后加入招式池，不替换当前招式，不恢复已有 PP。'], [option('back', '返回伙伴选择。')]),
				picker: { label: '选择招式', options: teachingMoves(mon).map(id => {
				const move = dex.moves.get(id), cost = reward || FREE_TUTOR_MOVES.has(id) ? 0 : tuition(run);
				return option(`move:${id}`, move.name,
					`${cost ? `${cost} 金币` : '免费'} · ${move.type} · ${move.category} · 威力 ${move.basePower || '—'}`, run.money < cost);
			}) } };
		}
	}
	return result(['队伍状态已经变化，请返回重新选择。'], [option('back', '返回选择。'), leaving()]);
}

export function chooseServiceOption(account: RogueAccount, run: RogueRun, content: RogueContent, random: RogueRandom,
	choice: string, evs?: StatsTable) {
	const event = run.node!.event!, s = state(run), [action, encodedMember, target] = choice.split(':');
	const member = encodedMember && decodeURIComponent(encodedMember);
	if (choice === 'unavailable') {
		event.trainingAidBlocked = true;
		end(run, event.id === 'martial' ? text.powerLeave : event.id === 'tutor' ? text.tutorLeave : text.travelLeave);
		return;
	}
	if (choice === 'leave') {
		end(run, event.id === 'martial' ? text.powerLeave : event.id === 'tutor' ? text.tutorLeave :
			s.region && s.step !== 'postcard' ? text.travelLeave : ['你收好明信片，向摊主道别。']);
		return;
	}
	if (event.id === 'travel') {
		if (action === 'postcard') {
			s.region = member as Postcard; s.step = 'postcard';
		} else if (choice === 'enter') s.step = 'paths';
		else if (choice === 'back') s.step = s.step === 'postcard' ? '' : 'professor';
		else if (choice === 'road') {
			const lv = Math.min(100, level(run) + 3), pool = regionalPool(s.region!, lv, content);
			const name = drawGiftSpecies(pool, run.startCard, random);
			fight(run, [makeEncounterSet(name, lv, randomEncounterIVs(random, true))], [`沿着大路走了一段，一只 ${name} 挡在前面，看起来可不好惹。`,
				'这场幻境战斗可捕捉；胜利或战败后恢复原队伍与背包的战前状态，仅保留捕捉与实际经验。主动逃跑仍保留本次损耗，重新准备后可再战。']);
		} else if (choice === 'path') {
			if (conversionChoices(run, s.region!).length) s.step = 'professor';
			else { s.step = 'adopt'; s.partner ||= regionalGift(run, content, s.region!, random); }
		} else if (action === 'swap') {
			const c = conversionChoices(run, s.region!).find(entry => entry.member === member && toID(entry.target) === target)!;
			s.member = c.member; s.target = c.target; s.step = 'swap';
		} else if (choice === 'confirm') {
			const before = run.team.find(p => p.id === s.member)!.set.species;
			convertRegional(run, s.member!, s.target!);
			event.exchange = { before, after: s.target!, member: s.member! };
			end(run, text.travelSwap);
		} else if (choice === 'adopt') {
			gift(account, run, content, s.partner!, '旅行的回忆'); end(run, text.travelGift);
		}
	} else if (event.id === 'martial') {
		if (choice === 'skill') s.step = 'skill';
		else if (choice === 'power') trainerBattle(run, false, random);
		else if (action === 'member') {
			s.member = member; s.step = 'evs';
		} else if (choice === 'back') s.step = s.grants ? 'rewards' : 'skill';
		else if (choice === 'allocate') {
			const mon = run.team.find(p => p.id === s.member)!;
			allocateEffort(run, mon, evs, s.grants?.find(g => g.member === mon.id)?.amount || 0);
			if (!s.grants) end(run, text.skillDone);
			else {
				s.grants = s.grants.filter(g => g.member !== mon.id); s.step = 'rewards';
				if (!s.grants.some(g => run.team.some(p => p.id === g.member))) end(run, text.powerDone);
			}
		}
	} else if (event.id === 'tutor') {
		if (choice === 'demo') {
			const cost = demonstrationCost(run), learned: string[] = [];
			for (const mon of run.team) {
				const pool = teachingMoves(mon); if (!pool.length) continue;
				const move = pool[random(pool.length)]; teachMove(account, run, content, mon, move);
				learned.push(`${mon.set.species} 学会了 ${dex.moves.get(move).name}。`);
			}
			run.money -= cost;
			end(run, [...text.demo, ...learned, `已支付 ${cost} 金币。`]);
		} else if (choice === 'ask') s.step = 'ask';
		else if (choice === 'fantasy') trainerBattle(run, true, random);
		else if (action === 'member') {
			s.member = member; s.step = 'moves';
		} else if (choice === 'back') s.step = s.grants ? 'rewards' : 'ask';
		else if (action === 'move') {
			const mon = run.team.find(p => p.id === s.member)!, reward = !!s.grants;
			teachMove(account, run, content, mon, member);
			const cost = reward || FREE_TUTOR_MOVES.has(member) ? 0 : tuition(run);
			run.money -= cost;
			if (!reward) end(run, [...(cost ? text.paid : text.free),
				`${mon.set.species} 学会了 ${dex.moves.get(member).name}。`, `已支付 ${cost} 金币。`]);
			else {
				s.grants = s.grants!.filter(g => g.member !== mon.id); s.step = 'rewards';
				if (!s.grants.some(g => run.team.some(p => p.id === g.member && teachingMoves(p).length))) end(run, text.tutorDone);
			}
		}
	}
}
export function settleServiceBattle(run: RogueRun, won: boolean, retreated = false, captured = false) {
	const event = run.node!.event!, s = state(run);
	if (!won || retreated || event.id === 'travel') event.trainingAidBlocked = true;
	else event.trainingAidBattleWin = true;
	if (event.id === 'travel') end(run, captured ? text.travelCatch : won ? text.travelWin : text.travelLose);
	else if (!won) end(run, event.id === 'martial' ? retreated ? text.powerLeave : text.powerLose : text.tutorLose);
	else {
		s.grants = run.team.filter(mon => event.id === 'martial' ? effortTotal(mon) < 510 : teachingMoves(mon).length > 0)
			.map(mon => ({ member: mon.id,
				...(event.id === 'martial' ? { amount: Math.min(effortReward(run), 510 - effortTotal(mon)) } : {}) }));
		if (!s.grants.length) end(run, event.id === 'martial' ?
			[...text.powerWin, ...text.powerDone] : [...text.tutorWin, ...text.tutorDone]);
		else { s.step = 'rewards'; event.stage = 'choice'; run.phase = 'event'; }
	}
}
