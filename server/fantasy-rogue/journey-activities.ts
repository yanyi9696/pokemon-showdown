import { randomUUID } from 'crypto';
import { Dex, toID } from '../../sim/dex';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueContent, RogueRun, RogueEncounter } from './types';
import type { RogueRandom } from './biome-pools';
import { ACTIVITY_NAMES, ACTIVITY_OPENINGS, type ActivityID } from './journey-activity-data';
import { minimumEvolutionLevel, evolutionChildren } from './evolution';
import { makeEncounterSet, randomEncounterIVs } from './encounter-sets';
import { drawBlessingGift, gift, giveEquipment, normalizeBlessings } from './blessings';
import { evolveMember, rememberMove } from './progression';
import { legalFormMoves } from './event-learning';
import { partyEvolutions } from './party-evolution';
import { machineMoves, premiumMachine } from './trading';
import { changeFriendship, rogueTime } from './friendship';
import { journeyCoins } from './early-balance';

const dex = Dex.mod('gen9fantasy');
export interface JourneyActivity {
	step?: string; member?: string; choice?: string; target?: string; score?: number; mistakes?: number;
	style?: string;
	pattern?: string[]; index?: number; startedAt?: number; taps?: number[]; duration?: number;
	balls?: number; wary?: number; bait?: number; safari?: string[]; solo?: string;
	lastTurns?: number; allySurvived?: boolean;
}
const SCENES: Record<string, [string, string]> = {
	stonegate: ['yamaskgalar', 'runerigus'], invertedstars: ['inkay', 'malamar'],
	sweetdance: ['milcery', 'alcremie'], peatmoon: ['ursaring', 'ursaluna'],
	unioncircle: ['finizen', 'palafin'],
};
export const SCROLLS = {
	dark: ['恶之卷轴', 'Dark', 'Urshifu'], water: ['水之卷轴', 'Water', 'Urshifu-Rapid-Strike'],
	electric: ['电之卷轴', 'Electric', 'Urshifu-Fantasy'], poison: ['酒之卷轴', 'Poison', 'Urshifu-Rapid-Strike-Fantasy'],
	rock: ['岩之卷轴', 'Rock', 'Urshifu-2-Fantasy'], psychic: ['超之卷轴', 'Psychic', 'Urshifu-Rapid-Strike-2-Fantasy'],
} as const;
const TRAINING_MOVES: Record<string, string> = { primeape: 'ragefist', stantler: 'psyshieldbash', qwilfishhisui: 'barbbarrage', farfetchdgalar: 'leafblade' };
const trainingMove = (mon: RoguePokemon) => TRAINING_MOVES[toID(mon.set.species)] || toID(evolutionChildren(mon.set.species).find(s => s.evoMove)?.evoMove);
const sceneMembers = (run: RogueRun, id: string) => run.team.filter(p => !p.egg && !p.fusion && p.set.level > 30 &&
	toID(p.set.species) === SCENES[id]?.[0] && !p.evolutionProgress?.scenes?.includes(SCENES[id][1]));
export const isJourneyActivity = (id: string): id is ActivityID => id in ACTIVITY_NAMES;
export function activityEligible(run: RogueRun, id: string) {
	if (!isJourneyActivity(id)) return true;
	if (id === 'battlemetro') return false; // Moved to challenges; keep handlers for saved events.
	if (SCENES[id]) return sceneMembers(run, id).length > 0 && (id !== 'peatmoon' || rogueTime(run.floor) === 'night');
	if (id === 'kubfuscroll') return run.team.some(p => !p.egg && !p.fusion && toID(p.set.species) === 'kubfu' && p.set.level >= 35 && p.hp > 0);
	if (id === 'kubfumaster') return run.floor >= 51 && !run.activityClaims?.includes(id);
	if (id === 'duskbreeder') return !run.activityClaims?.includes(id);
	if (id === 'evolutiondojo') return run.team.some(p => !p.egg && !!trainingMove(p));
	if (id === 'pokeflute') return run.floor >= 60;
	if (['lostescort', 'repelwave'].includes(id)) return run.floor >= 20;
	return run.team.some(p => !p.egg && p.hp > 0);
}
export function activityWeight(id: string) { return SCENES[id] || ['kubfuscroll', 'evolutiondojo'].includes(id) ? 3 : 1; }
const lv = (run: RogueRun) => Math.max(3, Math.min(100, Math.ceil(run.floor / 2)));
const option = (id: string, name: string, text = '', disabled = false) => ({ id, name, text, disabled });
const leave = () => option('leave', '今天先到这里。', '保留已经发生的消耗，结束互动。');
function activity(run: RogueRun) {
	run.node!.event!.activity ||= {};
	return run.node!.event!.activity;
}
function finish(run: RogueRun, paragraphs: string[], rewarded = false) {
	const event = run.node!.event!;
	event.stage = 'result'; event.result = paragraphs; event.settled = true;
	if (!rewarded) event.trainingAidBlocked = true;
	delete run.node!.noHealing; run.phase = 'event';
}
function supplies(run: RogueRun, content: RogueContent, random: RogueRandom, score = 1, rareSource?: string) {
	normalizeBlessings(run);
	const rare = !!rareSource && !run.rareCandyEvents?.includes(rareSource) && content.items.some(item => item.id === 'rarecandy');
	if (rare) {
		(run.rareCandyEvents ||= []).push(rareSource!);
		run.bag.rarecandy = (run.bag.rarecandy || 0) + 1;
	} else giveEquipment(run, content, random, 'ether', 1);
	giveEquipment(run, content, random, 'oranberry', Math.max(1, score));
	run.money += journeyCoins(run.floor, 100 + 5 * run.floor);
	return rare;
}
function markScene(run: RogueRun, mon: RoguePokemon, child: string) {
	const progress = mon.evolutionProgress ||= {};
	progress.scenes = [...new Set([...(progress.scenes || []), child])];
	mon.evolutionNotice = true;
}
function typedTeam(type: string, level: number, count: number, random: RogueRandom) {
	const pool = dex.species.all().filter(s => s.exists && s.num > 0 && !s.battleOnly && !s.isMega && !s.forme.includes('Fantasy') &&
		s.types.includes(type) && s.bst >= 250 && s.bst <= 550 && !s.tags.some(tag => tag.includes('Legendary') || tag.includes('Mythical')) && minimumEvolutionLevel(s.name) <= level);
	if (!pool.length) throw new Error('修行守护者没有合法候选。');
	return Array.from({ length: count }, () => makeEncounterSet(pool[random(pool.length)].name, level, randomEncounterIVs(random)));
}
function fight(run: RogueRun, encounters: RogueEncounter[]) {
	const node = run.node!, event = node.event!;
	event.stage = 'battle'; node.encounters = encounters;
	delete node.spiritPrepared; delete node.blessingPrepared; delete node.wildLoot;
	node.reward = { money: 0, items: {} }; run.encounter = 0; run.phase = 'ready';
}
const trainer = (id: string, name: string, avatar = 'sage') => ({ id, name, avatar, role: 'traveller' as const, tera: false });
function encounter(team: PokemonSet[], person?: ReturnType<typeof trainer>): RogueEncounter {
	return { name: person?.name || '守护者', team, trainer: person, style: 'balanced', catchable: !person };
}
export function beginJourneyActivity(run: RogueRun, random: RogueRandom) {
	const event = run.node!.event!;
	if (!isJourneyActivity(event.id)) return;
	const a = event.activity ||= {};
	if (event.id === 'safaripark') {
		const pool = dex.species.all().filter(s => s.num > 0 && !s.battleOnly && !s.forme && !s.tags.some(t => t.includes('Legendary') || t.includes('Mythical')) &&
			minimumEvolutionLevel(s.name) <= lv(run));
		a.safari = Array.from({ length: 3 }, () => pool[random(pool.length)].name); a.balls = 3; a.index = 0;
	}
	if (event.id === 'pokeflute') a.pattern = Array.from({ length: 3 }, () => ['低音', '中音', '高音'][random(3)]);
	if (event.id === 'dittoshow') a.index = random(3);
}
export function journeyActivityView(run: RogueRun) {
	const event = run.node!.event!, id = event.id as ActivityID, a = event.activity || {}, mon = run.team.find(p => p.id === a.member);
	const result = (paragraphs: string[], options: ReturnType<typeof option>[]) => ({ paragraphs, options,
		activity: a.startedAt ? { kind: 'rhythm', startedAt: a.startedAt, now: Date.now(), duration: a.duration || 12000, period: 800, score: a.score || 0 } : undefined });
	if (event.stage === 'result') return result(event.result || [], []);
	if (event.stage === 'battle') return result(['考验已经开始。按约定完成对战，再来领取结果。'], []);
	if (a.startedAt) return result(['亮点经过中央的绿色区域时，点击一下节拍按钮。每拍最多计一次；也可以提前结束。', `当前${id === 'minicontest' ? '表现积分' : '成功节拍'}：${a.score || 0}`],
		[option('tap', '跟上节拍'), option('finish', '收尾，看看成果。')]);
	if (SCENES[id] && !a.member) return result(ACTIVITY_OPENINGS[id], [...sceneMembers(run, id).map(p => option('member:' + encodeURIComponent(p.id), p.set.species, `Lv.${p.set.level}`)), leave()]);
	if (id === 'stonegate') return result(['考古员示意你看向伙伴。只要它仍能站稳，这一次就由你陪它走过石门。'],
		[option('cross', '陪它走过石门。', '若尚未累计承受 49 HP，将承受石门试炼的 49 HP；不会允许濒死。', !mon || !((mon.evolutionProgress?.lostHP || 0) >= 49 || mon.hp > 49)), leave()]);
	if (id === 'unioncircle') return result(['伙伴们围成一个圈，你和训练家一起为波普海豚加油。它学着在水中护住游得慢的同伴，渐渐找到了自己的勇气。'],
		[option('circle', '加入大家的集友圈。', '完成集友圈条件；还需达到 Lv.38 才能进化。'), leave()]);
	if (id === 'invertedstars') return result(['星图上，海浪在上、星星在下。好啦鱿望着你，等待你转动投影。'],
		[option('turn', '把星图倒转过来。'), option('steady', '保持现在的方向。'), leave()]);
	if (id === 'sweetdance' || id === 'peatmoon') {
		const item = id === 'sweetdance' ? 'strawberrysweet' : 'peatblock', label = id === 'sweetdance' ? '草莓糖饰' : '泥炭块';
		return result([`需要一枚${label}。工作人员可以按 1600 金币提供，已有道具则直接使用。`],
			[option('ceremony', '开始仪式。', `消耗 ${label} ×1；没有道具时支付 1600 金币。`, !mon || !(run.bag[item] > 0 || run.money >= 1600)), leave()]);
	}
	if (id === 'poffinworkshop') return result(a.choice ? ['第一种树果已放好，再挑一种不同口味。'] : ACTIVITY_OPENINGS[id],
		['莓莓果', '樱子果', '零余果'].map((name, i) => option('berry:' + i, name, '厨房提供本次练习材料。', a.choice === String(i))).concat(leave()));
	if (id === 'minicontest') {
		if (!a.member) return result(ACTIVITY_OPENINGS[id], run.team.filter(p => !p.egg && p.hp > 0).map(p => option('member:' + encodeURIComponent(p.id), p.set.species)).concat(leave()));
		if (a.step === 'prize') return result([`主持人举起记分牌：「${a.score || 0} 分！选一份适合伙伴的培育小礼物吧。」`],
			[['musclefeather', '肌力之羽'], ['geniusfeather', '智力之羽'], ['swiftfeather', '瞬发之羽']].map(([item, name]) => option('prize:' + item, name, '领取两片；另有亲密度、回复与正常补给。')));
		if (!a.style) return result(['主持人请你先定下今天的舞台风格。伙伴熟悉的招式与风格相合时，表演起始分 +2。'],
			[option('style:cool', '帅气的出场', '物理招式或先制招式更合适。'), option('style:cute', '轻快的互动', '变化招式或妖精招式更合适。'),
				option('style:clever', '巧妙的演绎', '特殊招式或声音招式更合适。'), leave()]);
		return result([`${mon?.set.species || '伙伴'}站到舞台中央。主持人把麦克风递过来：「让大家看看你们最拿手的一面吧！」`],
			(mon?.set.moves || []).map(move => option('perform:' + move, dex.moves.get(move).name, `${dex.moves.get(move).category === 'Status' ? '用巧妙的动作' : '用招式的气势'}衔接音乐。`)).concat(leave()));
	}
	if (id === 'safaripark') {
		const name = a.safari?.[a.index || 0];
		return result([`草丛边出现了 ${name}。剩余狩猎用球 ${a.balls} 颗。`,
			`它${(a.wary || 0) > 0 ? '正紧张地盯着你' : (a.bait || 0) > 0 ? '正在认真吃着食物' : '还没有跑远'}。靠近能提高成功率，也会增加惊跑风险。`],
		[option('approach', '轻轻靠近。'), option('bait', '放下一份诱饵。'), option('ball', '投出狩猎用球。'), option('next', '看看另一边。'), leave()]);
	}
	if (id === 'relicpuzzle') {
		const index = a.index || 0, clues = ['火盆只剩下一点余温，壁画上却画着熊熊火焰。', '水渠的闸门已经打开，底部干得发白。', '石板被落叶和灰尘盖住，需要一阵风。'];
		return result([clues[index], `第 ${index + 1} 道机关。选择队伍已经掌握的招式属性。`],
			['Fire', 'Water', 'Flying', 'Electric', 'Grass'].map(type => option('type:' + type, ({ Fire: '火', Water: '水', Flying: '飞行', Electric: '电', Grass: '草' } as Record<string, string>)[type], '',
				!run.team.some(p => !p.egg && p.set.moves.some(m => dex.moves.get(m).type === type)))).concat(option('help', '请洛托姆搭把手。', '可以继续，但这道机关不计入独立完成评价。'), leave()));
	}
	if (id === 'pokeflute') {
		if (!a.step) return result([...ACTIVITY_OPENINGS[id], `邮差示范：${a.pattern?.join(' · ')}。`], [option('listen', '记住了，试着吹一遍。'), leave()]);
		if (a.step === 'awake') return result(['卡比兽睁开眼，慢慢挪到树荫下。邮差终于松了口气。', '卡比兽没有敌意，却好奇地看着你的精灵球。'],
			[option('challenge', '和它活动活动。', '进行可捕捉的友好对战。'), option('thanks', '让它继续休息，收下邮差谢礼。')]);
		return result([`该吹第 ${(a.index || 0) + 1} 个音符了。`], ['低音', '中音', '高音'].map((name, i) => option('note:' + i, name)).concat(leave()));
	}
	if (id === 'dittoshow') {
		const names = ['皮卡丘', '杰尼龟', '小火龙'], correct = a.index || 0;
		return result([...ACTIVITY_OPENINGS[id], ...names.map((name, i) => `${name}展示了${i === correct ? ['水枪', '电击', '藤鞭'][i] : ['电击', '水枪', '火花'][i]}，随后${i === correct ? '悄悄瞄了一眼同伴的动作' : '很自然地整理好姿势'}。`)],
			names.map((name, i) => option('identify:' + i, `观察${name}。`)).concat(leave()));
	}
	if (id === 'evolutiondojo') {
		if (!a.member) return result(ACTIVITY_OPENINGS[id], run.team.filter(p => !p.egg && trainingMove(p)).map(p => option('member:' + encodeURIComponent(p.id), p.set.species,
			partyEvolutions(p, run).flatMap(e => e.requirements.filter(r => !r.met).map(r => r.text)).join('；'))).concat(leave()));
		const move = mon && trainingMove(mon);
		return result([`教练指了指记录板：「先把 ${dex.moves.get(move || '').name} 的动作练熟。真正使用的次数、击中要害会照常记录，不会只看一次演示就算完成。」`],
			[option('lesson', '请教这个招式。', '只有伙伴原本能学会时才可教学。', !mon || !move || !legalFormMoves(mon.set.species).includes(move)),
				option('practice', '开始实战练习。', '真实对战会记录招式使用与单场要害次数。'), leave()]);
	}
	if (id === 'kubfuscroll') {
		if (!a.member) return result(ACTIVITY_OPENINGS[id], run.team.filter(p => !p.egg && !p.fusion && toID(p.set.species) === 'kubfu' && p.set.level >= 35 && p.hp).map(p => option('member:' + encodeURIComponent(p.id), p.set.species, `Lv.${p.set.level}`)).concat(leave()));
		return result(['守护者请你选定一幅卷轴。选择后，只有这只熊徒弟能进入道场。'],
			Object.entries(SCROLLS).map(([key, [name]]) => option('scroll:' + key, name, '三只对应属性的守护伙伴，Lv.35～40；通过后直接进化。')).concat(leave()));
	}
	return result(ACTIVITY_OPENINGS[id], [option('accept', '接受邀请，准备好后开始。'), leave()]);
}
export function chooseJourneyActivity(account: RogueAccount, run: RogueRun, content: RogueContent, random: RogueRandom, choice: string) {
	const event = run.node!.event!, id = event.id as ActivityID, a = activity(run);
	event.key = randomUUID();
	if (choice === 'leave') { finish(run, ['你向对方道别，把这次相遇记在旅途中。']); return; }
	if (choice.startsWith('member:')) { a.member = decodeURIComponent(choice.slice(7)); return; }
	const mon = run.team.find(p => p.id === a.member);
	if (id === 'minicontest' && a.step === 'prize' && choice.startsWith('prize:') && mon) {
		giveEquipment(run, content, random, choice.slice(6), 2); supplies(run, content, random, 1 + Math.floor((a.score || 0) / 4));
		changeFriendship(mon, 12 + (a.score || 0) * 2, run); if (mon.hp) mon.hp = Math.min(mon.maxhp, mon.hp + Math.ceil(mon.maxhp * 0.12));
		finish(run, ['伙伴在掌声中认真鞠躬。你收好选择的羽毛与旅途谢礼，彼此的亲密度也提升了。'], true); return;
	}
	if (choice.startsWith('style:')) { a.style = choice.slice(6); return; }
	if (id === 'unioncircle' && mon && choice === 'circle') {
		markScene(run, mon, 'palafin'); finish(run, ['大家击掌约定，下次再一起出游。波普海豚认真地点了点头，达到 Lv.38 后就能迈向新的姿态。'], true); return;
	}
	if (a.startedAt) {
		const elapsed = Date.now() - a.startedAt, beat = Math.floor(elapsed / 800), phase = elapsed % 800;
		if (choice === 'tap' && elapsed >= 0 && elapsed < (a.duration || 12000)) {
			if (!(a.taps ||= []).includes(beat)) { a.taps.push(beat); if (phase >= 250 && phase <= 550) a.score = (a.score || 0) + 1; }
			return;
		}
		const score = a.score || 0; delete a.startedAt;
		if (id === 'sweetdance') {
			if (score >= 3 && mon) {
				markScene(run, mon, 'alcremie');
				finish(run, ['最后一个转身恰好落在节拍上。小仙奶的奶油泛出柔和的光，进化条件已经满足。'], true);
			} else finish(run, ['伙伴停下来晃了晃脑袋。点心师笑着说：「不急，下次跟着拍子再试一次。」']);
		} else if (id === 'minicontest') {
			a.step = 'prize';
		} else {
			const targets = run.team.filter(p => !p.egg);
			for (const p of targets) { changeFriendship(p, 12 + score * 2, run); if (p.hp) p.hp = Math.min(p.maxhp, p.hp + Math.ceil(p.maxhp * 0.12)); }
			supplies(run, content, random, 1 + Math.floor(score / 4));
			finish(run, [score >= 6 ? '流畅的节拍换来一阵掌声。伙伴骄傲地靠在你身边。' : '虽然有些手忙脚乱，伙伴还是认真品尝、认真完成了表演。', `收下谢礼，亲密度也提升了。本次成功 ${score} 拍。`], true);
		}
		return;
	}
	const rhythm = (bonus = 0) => {
		a.startedAt = Date.now(); a.duration = 12000;
		a.score = bonus; a.taps = [];
	};
	if (choice.startsWith('berry:')) {
		if (a.choice === undefined) a.choice = choice.slice(6); else rhythm();
		return;
	}
	if (choice.startsWith('perform:')) {
		a.choice = choice.slice(8); const move = dex.moves.get(a.choice);
		const matched = a.style === 'cool' ? move.category === 'Physical' || move.priority > 0 :
			a.style === 'cute' ? move.category === 'Status' || move.type === 'Fairy' : move.category === 'Special' || !!move.flags.sound;
		rhythm(matched ? 2 : 0); return;
	}
	if (id === 'stonegate' && mon && choice === 'cross') {
		const progress = mon.evolutionProgress ||= {};
		if ((progress.lostHP || 0) < 49) {
			if (mon.hp <= 49) throw new Error('伙伴需要保留超过 49 HP 才能接受试炼。');
			mon.hp -= 49; progress.lostHP = 49;
		}
		markScene(run, mon, 'runerigus'); finish(run, ['你陪着伙伴穿过石门，石板上的纹样一寸寸亮起来。死神板的进化条件已满足。'], true); return;
	}
	if (id === 'invertedstars' && mon) {
		if (choice === 'turn') {
			markScene(run, mon, 'malamar');
			finish(run, ['星光在倒置中连成完整图案，好啦鱿也倒转了身体。乌贼王的进化条件已满足。'], true);
		} else finish(run, ['好啦鱿歪了歪脑袋。也许下次换个方向，就能发现不同的星空。']);
		return;
	}
	if (['sweetdance', 'peatmoon'].includes(id) && mon && choice === 'ceremony') {
		const item = id === 'sweetdance' ? 'strawberrysweet' : 'peatblock';
		if (run.bag[item] > 0) run.bag[item]--; else { if (run.money < 1600) throw new Error('缺少仪式道具与费用。'); run.money -= 1600; }
		if (id === 'sweetdance') rhythm();
		else {
			markScene(run, mon, 'ursaluna');
			finish(run, ['圈圈熊深深闻了闻月光下的泥炭，古老的力量逐渐苏醒。月月熊的进化条件已满足。'], true);
		}
		return;
	}
	if (id === 'safaripark') {
		if (choice === 'approach') { a.wary = (a.wary || 0) + 1; if (random(100) < 15 + a.wary * 10) a.index = (a.index || 0) + 1; }
		if (choice === 'bait') { a.bait = Math.min(2, (a.bait || 0) + 1); a.wary = Math.max(0, (a.wary || 0) - 1); }
		if (choice === 'next') {
			a.index = (a.index || 0) + 1; a.wary = 0; a.bait = 0;
		}
		if (choice === 'ball') {
			if (!a.balls || !a.safari?.[a.index || 0]) throw new Error('这次狩猎已没有可投球的目标。');
			a.balls--;
			const success = random(100) < Math.min(85, 35 + (a.wary || 0) * 15 + (a.bait || 0) * 10);
			if (success) {
				const name = a.safari[a.index || 0];
				finish(run, [`狩猎用球轻轻晃了三下，${name}愿意跟你一起旅行。`], true);
				gift(account, run, content, drawBlessingGift(run, content, random, { eliteIVs: false, species: name, level: lv(run) }), '狩猎地带的相遇'); return;
			}
			a.index = (a.index || 0) + 1;
		}
		if ((a.index || 0) >= 3 || !a.balls) finish(run, ['管理员吹响集合哨。这次没有带回新伙伴，但你更熟悉了它们的习性。']);
		return;
	}
	if (id === 'relicpuzzle') {
		const correct = ['Fire', 'Water', 'Flying'][a.index || 0];
		if (choice === 'type:' + correct) a.score = (a.score || 0) + 1; else a.mistakes = (a.mistakes || 0) + 1;
		a.index = (a.index || 0) + 1;
		if (a.index >= 3) {
			const rare = supplies(run, content, random, a.score || 1, a.score === 3 ? id : undefined);
			finish(run, [`洛托姆替你把最后一点卡住的机关拨正。你解开了 ${a.score || 0} 道机关，收下研究队的谢礼。`,
				...(rare ? ['「全部解开了！这颗神奇糖果，一定要交给信赖的伙伴哦。」神奇糖果 ×1 已放入背包。'] : [])], true);
		}
		return;
	}
	if (id === 'pokeflute') {
		if (choice === 'listen') {
			a.step = 'notes'; a.index = 0;
			return;
		}
		if (choice.startsWith('note:')) {
			const note = ['低音', '中音', '高音'][Number(choice.slice(5))];
			if (note !== a.pattern?.[a.index || 0]) { finish(run, ['卡比兽翻了个身，继续呼呼大睡。邮差摇了摇头：「旋律再温柔一些，下次再试吧。」']); return; }
			a.index = (a.index || 0) + 1;
			if (a.index === 3) a.step = 'awake';
			return;
		}
		if (choice === 'thanks') {
			supplies(run, content, random, 2);
			finish(run, ['邮差终于送出了信，把一份随身补给留给你。卡比兽向你挥了挥爪子。'], true);
			return;
		}
		if (choice === 'challenge') { fight(run, [encounter([makeEncounterSet('Snorlax', Math.max(30, lv(run)))])]); return; }
	}
	if (id === 'dittoshow' && choice.startsWith('identify:')) {
		if (Number(choice.slice(9)) === a.index) {
			supplies(run, content, random, 2);
			finish(run, ['“模特”笑着恢复百变怪的样子。研究员把观察记录递给你：「看动作比只看外貌可靠多了。」'], true);
		} else finish(run, ['真正的百变怪扑哧一笑，恢复了原样。研究员邀请你下次再来观察。']);
		return;
	}
	if (id === 'evolutiondojo' && mon) {
		if (choice === 'lesson') {
			const move = trainingMove(mon);
			if (!move || !legalFormMoves(mon.set.species).includes(move)) throw new Error('伙伴原本不能学会这个招式。');
			rememberMove(mon, move); (run.pendingMoves ||= []).push({ member: mon.id, move });
			finish(run, [`教练把 ${dex.moves.get(move).name} 的要领示范给伙伴。确认装备后，可以在真实对战中继续练习。`], true); return;
		}
		if (choice === 'practice') { fight(run, [encounter(typedTeam('Normal', lv(run), 3, random), trainer('evolutioncoach', '进化修行教练', 'veteran'))]); return; }
	}
	if (id === 'kubfuscroll' && mon && choice.startsWith('scroll:')) {
		const key = choice.slice(7) as keyof typeof SCROLLS, scroll = SCROLLS[key];
		if (!scroll || toID(mon.set.species) !== 'kubfu' || mon.set.level < 35) throw new Error('卷轴修行条件不符。');
		a.solo = mon.id; a.target = scroll[2]; a.choice = key;
		const team = Array.from({ length: 3 }, () => typedTeam(scroll[1], 35 + random(6), 1, random)[0]);
		const guard = encounter(team, trainer('scrollguardian', scroll[0] + '守护者', 'blackbelt')); guard.fixedLevels = true;
		run.node!.noHealing = true; fight(run, [guard]); return;
	}
	if (choice === 'accept') {
		if (id === 'battlemetro') {
			run.node!.noHealing = true;
			fight(run, ['Steel', 'Electric', 'Fighting'].map((type, i) => encounter(typedTeam(type, Math.min(100, lv(run) + i), 2, random),
				trainer('subway' + i, ['对战地铁检票员', '北尚', '南厦'][i], 'subwaybossingo')))); return;
		}
		if (id === 'lostescort') {
			const foe = encounter([...typedTeam('Dark', lv(run), 1, random), ...typedTeam('Poison', lv(run), 1, random)], trainer('escortroad', '拦路的野外训练家', 'roughneck'));
			foe.cooperative = { id: 'escort', name: '护林员与拉鲁拉丝', team: [makeEncounterSet('Ralts', lv(run))] };
			fight(run, [foe]); return;
		}
		const type = id === 'duskbreeder' ? 'Rock' : id === 'kubfumaster' ? 'Fighting' : 'Normal';
		fight(run, [encounter(typedTeam(type, Math.min(100, lv(run) + 2), id === 'repelwave' ? 2 : 3, random),
			trainer(id, id === 'duskbreeder' ? '神秘的老培育家' : id === 'kubfumaster' ? '神秘的老武术家' : '山口的守护考验'))]);
	}
}
export function settleJourneyActivity(account: RogueAccount, run: RogueRun, content: RogueContent, random: RogueRandom, won: boolean, retreated: boolean) {
	const event = run.node!.event!, id = event.id as ActivityID, a = activity(run);
	if (retreated) return; // Keep spent resources; the normal retry route remains available.
	if (!won) { finish(run, ['对方收起了伙伴，示意你先照顾好自己的队伍。这次考验到此为止；实际消耗与战斗经验照常保留。']); return; }
	if (run.encounter + 1 < run.node!.encounters.length) return;
	if (id === 'repelwave' && (a.lastTurns || 0) > 8 || id === 'lostescort' && !a.allySurvived) {
		finish(run, [id === 'repelwave' ? '虽然赢下了战斗，旅人已先绕路离开。下次试试更快地完成目标吧。' : '护林员带着倒下的拉鲁拉丝先去治疗了。这次没有完成护送目标。']); return;
	}
	if (id === 'duskbreeder' || id === 'kubfumaster') {
		(run.activityClaims ||= []).push(id);
		const name = id === 'duskbreeder' ? 'Rockruff-Dusk' : 'Kubfu';
		finish(run, ['老人认真地行了一礼。「看得出来，你会把同伴放在心上。它就拜托你了。」'], true);
		gift(account, run, content, drawBlessingGift(run, content, random, { eliteIVs: false, species: name, level: lv(run) }), ACTIVITY_NAMES[id]); return;
	}
	if (id === 'kubfuscroll') {
		const mon = run.team.find(p => p.id === a.solo);
		if (!mon || toID(mon.set.species) !== 'kubfu' || !a.target) throw new Error('修行中的熊徒弟记录不完整。');
		evolveMember(run, mon, a.target);
		finish(run, ['熊徒弟向三位守护者行礼，随后展开卷轴。一路练习过的动作融为新的力量，它已成为对应流派的武道熊师！'], true); return;
	}
	const rare = supplies(run, content, random, id === 'battlemetro' ? 3 : 2, id === 'lostescort' ? id : undefined);
	if (id === 'battlemetro') {
		const legal = [...new Set(run.team.filter(p => !p.egg).flatMap(machineMoves))];
		const premium = legal.filter(premiumMachine), pool = premium.length ? premium : legal;
		giveEquipment(run, content, random, 'roguetm' + (pool.length ? pool[random(pool.length)] : 'protect'));
	}
	finish(run, ['你完成了约定。对方把备好的谢礼交给你，伙伴们也为这一次配合感到高兴。',
		...(rare ? ['拉鲁拉丝依偎在护林员身旁，向你挥了挥手。「谢谢你守护它。这颗神奇糖果，请留给你的伙伴。」神奇糖果 ×1 已放入背包。'] : [])], true);
}
