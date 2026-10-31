import { companionTravelGift } from './affection-gifts';
import { giveTeraShards } from './tera-shards';
import { gainAffection, AFFECTION_RULES } from './affection';
import { randomUUID } from 'crypto';
import { Dex, toID } from '../../sim/dex';
import { BLESSING_TYPES } from '../../sim/rogue-blessing-data';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { drawBlessingGift, gift, normalizeBlessings } from './blessings';
import { makeEncounterSet, randomEncounterIVs } from './encounter-sets';
import { lowerToEligibleStage } from './evolution';
import { randomSpeciesEligible } from './species-eligibility';
import { pickQualitySpecies } from './encounter-quality';
import { rebuildMember } from './progression';
import { themedEventTeam } from './event-teams';
import { giveEgg, hatchEggs, eggEventWeight } from './eggs';
import { EXPEDITION_NAMES, EXPEDITION_OPENINGS } from './expedition-text';
import { travellingRoster } from './travellers';
import { RIVALS, RIVAL_SNACK_GIFTS, RIVAL_TRAVEL_REPLIES } from './rival-data';

const dex = Dex.mod('gen9fantasy');
export interface ExpeditionEvent {
	step?: string; target?: string; answers?: string[]; types?: string[]; tera?: string;
}
export const expeditionEvent = (id: string): id is keyof typeof EXPEDITION_NAMES => id in EXPEDITION_NAMES;
const fossils: [string[], string][] = [
	[['helixfossil'], 'Omanyte'], [['domefossil'], 'Kabuto'], [['oldamber'], 'Aerodactyl'],
	[['rootfossil'], 'Lileep'], [['clawfossil'], 'Anorith'], [['skullfossil'], 'Cranidos'],
	[['armorfossil'], 'Shieldon'], [['coverfossil'], 'Tirtouga'], [['plumefossil'], 'Archen'],
	[['jawfossil'], 'Tyrunt'], [['sailfossil'], 'Amaura'], [['fossilizedbird', 'fossilizeddrake'], 'Dracozolt'],
	[['fossilizedbird', 'fossilizeddino'], 'Arctozolt'], [['fossilizedfish', 'fossilizeddrake'], 'Dracovish'],
	[['fossilizedfish', 'fossilizeddino'], 'Arctovish'],
];
export const availableFossils = (run: RogueRun) => fossils.filter(([items]) => items.every(id => run.bag[id] > 0));
export function expeditionEligible(run: RogueRun, id: string) {
	// Pure combat trials now belong to the challenge route. Existing events still settle normally.
	return id !== 'terasolo' && id !== 'starmaster' && (id !== 'fossillab' || availableFossils(run).length > 0) &&
		(id !== 'hatchhouse' || run.team.some(mon => mon.egg));
}
export const expeditionWeight = (run: RogueRun, id: string) => id === 'grassegg' ? eggEventWeight(run.floor) / 10 :
	id === 'hatchhouse' ? 4 : id === 'starmaster' ? 0.12 :
	id === 'blackjack' && run.floor >= 101 ? (run.floor >= 151 ? 2 : 1.5) : 1;
const level = (run: RogueRun) => Math.min(100, Math.max(3, Math.ceil(run.floor / 2)));
const fee = (run: RogueRun) => 80 + run.floor * 3;
function finish(run: RogueRun, ...lines: string[]) {
	const event = run.node!.event!;
	event.key = randomUUID(); event.stage = 'result'; event.result = lines; event.settled = true;
	run.phase = 'event';
}
function give(run: RogueRun, item: string, count = 1) { run.bag[item] = (run.bag[item] || 0) + count; }
export function beginExpedition(run: RogueRun) {
	if (expeditionEvent(run.node!.event!.id)) run.node!.event!.expedition = {};
}
export function beginTeraSolo(run: RogueRun, random: RogueRandom) {
	if (random(100) >= 12) return false;
	const lv = Math.min(100, level(run) + 5);
	const pool = dex.species.all().filter(s => s.exists && !s.battleOnly && !s.isNonstandard &&
		lowerToEligibleStage(s.name, lv) === s.name && randomSpeciesEligible(s.name, lv));
	const species = dex.species.get(pickQualitySpecies(pool.map(s => s.name), random, run));
	const tera = Object.keys(BLESSING_TYPES)[random(18)], set = makeEncounterSet(species.name, lv, randomEncounterIVs(random, true));
	set.teraType = tera;
	run.node!.name = EXPEDITION_NAMES.terasolo;
	run.node!.event = { id: 'terasolo', key: randomUUID(), stage: 'battle', committed: true,
		expedition: { tera }, result: EXPEDITION_OPENINGS.terasolo };
	run.node!.encounters = [{ name: '太晶宝可梦', catchable: true, style: 'balanced', team: [set], stars: [2], forcedTera: true }];
	run.node!.reward = { money: 0, items: {} }; delete run.node!.wildLoot;
	(run.eventHistory ||= []).push({ id: 'terasolo', floor: run.floor });
	run.encounter = 0; run.phase = 'ready'; return true;
}
function startBattle(run: RogueRun, team: PokemonSet[], stars = 1) {
	const event = run.node!.event!;
	event.stage = 'battle'; event.key = randomUUID();
	run.node!.encounters = [{ name: event.id === 'starmaster' ? '摘星大师' : '问答摊主', team, stars: team.map(() => stars),
		catchable: false, style: 'balanced', trainer: { id: event.id, name: event.id === 'starmaster' ? '摘星大师' : '问答摊主',
			avatar: event.id === 'starmaster' ? 'blackbelt' : 'lass', role: 'traveller', tera: run.floor >= 100 } }];
	delete run.node!.spiritPrepared; delete run.node!.blessingPrepared; delete run.node!.wildLoot;
	run.encounter = 0; run.phase = 'ready';
}
export function expeditionView(run: RogueRun) {
	const event = run.node!.event!, state = event.expedition || {}, id = event.id as keyof typeof EXPEDITION_NAMES;
	const option = (key: string, name: string, disabled = false) => ({ id: key, name, disabled, text: '' });
	let options: ReturnType<typeof option>[] = [], silhouette: string | undefined;
	if (event.stage === 'choice') {
		if (id === 'identityquiz') {
			if (!state.step) options = [option('enter', `交 ${fee(run)} 金币，抽一题。`, run.money < fee(run)), option('leave', '笑笑，继续赶路。')];
			else if (state.step === 'name') { silhouette = state.target; options = state.answers!.map((s, i) => option(`answer:${i}`, s)); }
			else if (state.step === 'type') options = Object.entries(BLESSING_TYPES).map(([type, name]) => option(`type:${type}`, `选择${name}属性`, (state.types?.length || 0) >= 2 || state.types?.includes(type)))
				.concat(state.types?.length ? [option('confirmtypes', `确定${state.types.length === 1 ? '单属性' : '双属性'}答案`)] : []);
			else options = [option('fight', '⌈别再偷偷换答案了，来对战吧！⌋'), option('leave', '笑着揭穿她的小把戏，继续赶路。')];
		} else if (id === 'fossillab') options = [option('restore', '交付一套完整化石，进行复活。', !availableFossils(run).length)];
		else if (id === 'snacks') {
			options = run.team.filter(m => !m.egg).map(m => option(`snackmon:${m.id}`, `送给【${m.set.species}】一份点心 · ${fee(run)} 金币`, run.money < fee(run)));
			for (const c of travellingRoster(run)) options.push(option(c.origin === 'rival' ? 'snackrival' : `snacktrainer:${c.id}`, `请${c.name}吃点心 · ${fee(run)} 金币`, run.money < fee(run)));
			options.push(option('leave', '先把香味记在心里。'));
		} else if (id === 'starmaster') options = [option('challenge', '接受摘星试炼。'), option('leave', '下次准备得更充分再来。')];
		else if (id === 'blackjack') options = state.step ? [
			option('doctor:revive', '夸奖他：医死的人越多，医术越高明。'), option('doctor:capsule', '认可他：要为患者带来笑容。'),
			option('doctor:patch', '也说说自己作为训练家的烦恼。'),
		] : [option('talk', '坐近一些，和他搭话。'), option('leave', '安静地喝完手里的茶。')];
		else if (id === 'grassegg') options = [option('egg', '小心收好这颗蛋。')];
		else if (id === 'hatchhouse') options = [option('hatch', '把蛋交给店长照看。')];
	}
	return { paragraphs: event.result || EXPEDITION_OPENINGS[id], options, silhouette };
}
export function chooseExpedition(account: RogueAccount, run: RogueRun, content: RogueContent, random: RogueRandom, choice: string) {
	const event = run.node!.event!, state = event.expedition!;
	event.key = randomUUID();
	if (choice === 'leave') { finish(run, '你向对方点点头，继续赶路。'); return; }
	if (choice === 'enter') {
		run.money -= fee(run);
		const eligible = dex.species.all().filter(s => s.exists && !s.battleOnly && lowerToEligibleStage(s.name, level(run)) === s.name && randomSpeciesEligible(s.name, level(run)));
		const changed = eligible.filter(s => /Fantasy/.test(s.name) && dex.species.get(s.baseSpecies).exists &&
			s.types.join('/') !== dex.species.get(s.baseSpecies).types.join('/'));
		const pool = changed.length && random(100) < 65 ? changed : eligible.filter(s => !s.isNonstandard);
		const target = pool[random(pool.length)]; state.target = target.name;
		const answer = dex.species.get(target.baseSpecies).name;
		const others = [...new Set(eligible.map(s => dex.species.get(s.baseSpecies).name))].filter(s => s !== answer);
		state.answers = [answer]; while (state.answers.length < 4 && others.length) state.answers.push(others.splice(random(others.length), 1)[0]);
		for (let i = state.answers.length - 1; i > 0; i--) { const j = random(i + 1); [state.answers[i], state.answers[j]] = [state.answers[j], state.answers[i]]; }
		state.step = 'name'; event.result = ['「不许偷看后面的答案哦！剪影里的宝可梦是谁？」'];
	} else if (choice.startsWith('answer:')) {
		const target = dex.species.get(state.target!), answer = state.answers![Number(choice.slice(7))];
		if (answer !== dex.species.get(target.baseSpecies).name) { finish(run, '「哎呀，真的没认出来？下次先翻翻图鉴吧！」摊主把题板收了起来。'); return; }
		if (/Fantasy/.test(target.name) && target.types.join('/') !== dex.species.get(target.baseSpecies).types.join('/')) {
			state.step = 'type'; state.types = []; event.result = ['「第一题算你对。接下来，告诉我它的属性！单属性就只选一个哦。」'];
		} else { give(run, 'superpotion', 2); run.money += fee(run) * 2; finish(run, '「哼，还算有点本事。奖品拿去！」你收下双倍报名费和好伤药 ×2。'); }
	} else if (choice.startsWith('type:')) {
		if ((state.types?.length || 0) >= 2) throw new Error('最多选择两种属性，请先确认答案。');
		(state.types ||= []).push(choice.slice(5));
		event.result = [`已选择：${state.types.map(t => BLESSING_TYPES[t]).join('、')}。可以确认，也可继续选择第二属性。`];
	} else if (choice === 'confirmtypes') {
		const target = dex.species.get(state.target!), same = target.types.length === state.types!.length && target.types.every(t => state.types!.includes(t));
		const claimed = same ? dex.species.get(target.baseSpecies) : target;
		state.step = 'fight'; event.result = [`少女迅速翻过另一张题板：「错啦！答案是${claimed.types.map(t => BLESSING_TYPES[t]).join('、')}，我问的可是【${claimed.name}】！」`,
			'你瞥见她桌下藏着两份不同的答案。她还在故作无辜地眨眼，你已经握住了精灵球。'];
	} else if (choice === 'fight' || choice === 'challenge') {
		startBattle(run, themedEventTeam(choice === 'challenge' ? 'martial' : 'tutor', Math.min(100,
			level(run) + (choice === 'challenge' ? 8 : 1)), choice === 'challenge' ? 4 : 2, random),
		choice === 'challenge' ? 2 + Math.floor(run.floor / 75) : 1);
	} else if (choice === 'restore') {
		const [items, species] = availableFossils(run)[0]; for (const item of items) run.bag[item]--;
		gift(account, run, content, drawBlessingGift(run, content, random, { eliteIVs: false, species, level: level(run) }), '化石复活');
		finish(run, '培养舱的光芒渐渐平息。研究员抱来苏醒的伙伴：「它记得远古的力量，也准备好与你踏上新的旅途了。」');
	} else if (choice.startsWith('snack')) {
		run.money -= fee(run);
		if (choice.startsWith('snackmon:')) {
			const mon = run.team.find(m => m.id === choice.slice(9))!;
			mon.set.happiness = Math.min(255, (mon.set.happiness ?? 70) + 45);
			if (mon.hp) mon.hp = Math.min(mon.maxhp, mon.hp + Math.max(1, Math.floor(mon.maxhp * 0.15)));
			finish(run, `【${mon.set.species}】开心地吃完了点心，亲密度大幅提升，存活时恢复 15% 最大生命值。`);
		} else if (choice === 'snackrival') {
			const r = run.rival!, token = companionTravelGift(run.floor);

			gainAffection(run, r.id, AFFECTION_RULES.response, 'snack:' + run.node!.event!.key);
			give(run, token.id);
			finish(run, `【同行劲敌 - ${RIVALS[r.id].name}】接过点心，露出了愉快的神情。`, `「${RIVAL_TRAVEL_REPLIES[r.id] || RIVAL_SNACK_GIFTS[r.id].line}」你收到了一份${token.name}回礼。`);
		} else {
			const id = choice.slice(13), person = travellingRoster(run).find(c => c.id === id)!;
			const c = run.blessings?.companions?.find(m => m.id === id && !m.away);
			const message = '这份心意我收到了。下次也一起分享吧。';
			if (c) { c.smile = 'approval'; c.messageAt = Date.now(); c.message = message; }

			const token = companionTravelGift(run.floor);
			gainAffection(run, id, AFFECTION_RULES.response, 'snack:' + run.node!.event!.key);
			// A snack return is separate from the once-per-run affection gifts.
			give(run, token ? toID((dex.items.get(token.id).name)) : 'sitrusberry');
			finish(run, `【同行训练家 - ${person.name}】接过点心，露出了愉快的神情。`, `「${message}」你也收到了一份${token?.name || '文柚果'}回礼。`);
		}
	} else if (choice === 'talk') {
		state.step = 'reply'; event.result = ['聊起旅途见闻，你意外发现他总是在意那些被旁人忽略的病患。', '「有时救回一个生命，比得到谁的认可都难。」他看着炉火，声音低了下来。你决定……'];
	} else if (choice.startsWith('doctor:')) {
		const key = choice.slice(7), item = key === 'revive' ? 'revive' : key === 'capsule' ? 'abilitycapsule' : 'abilitypatch';
		give(run, item, key === 'revive' ? 2 : 1);
		finish(run, key === 'revive' ? '他沉默片刻：「还是不要医死人比较好。」随后递给你两枚活力碎片。' : key === 'capsule' ?
			'「说来也怪，听完这话，我总觉得这些胶囊和你很有缘。」他将一枚特性胶囊放到你手里。' : '「希望这能解决你的烦恼。」他送给你一份特性膏药，转身去查看那只受伤的宝可梦。');
	} else if (choice === 'egg') { giveEgg(run, content, random, '草丛里的宝可梦蛋'); finish(run, '你把蛋安放在柔软的垫子上。往后的旅程又多了一份期待。'); }
	else if (choice === 'hatch') { const n = hatchEggs(account, run, content, true); finish(run, `培育箱轻轻响起提示音，${n} 颗蛋孵化了！店长祝你和新伙伴一路顺利。`); }
}
export function settleExpedition(run: RogueRun, won: boolean) {
	const id = run.node!.event!.id;
	if (!won) { finish(run, '这次挑战没有获胜。先照顾好伙伴，再继续前进吧。'); return; }
	if (id === 'starmaster') {
		for (const mon of run.team) if (!mon.egg) { mon.stars = Math.min(5, (mon.stars || 1) + 1); rebuildMember(mon, run.boosts); }
		finish(run, '大师收回伙伴，郑重行礼：「你们配得上更高的星光。」全队星级提升一级，最高五星。');
	} else if (id === 'terasolo') {
		const type = run.node!.event!.expedition!.tera!, count = 15 + Math.floor(run.floor / 4);
		giveTeraShards(run, type, count);
		finish(run, `晶光散去，你收集到${BLESSING_TYPES[type]}属性太晶碎片 ×${count}。`);
	} else { run.money += fee(run) * 3; give(run, 'ether', 2); finish(run, '「好了好了，算你厉害！」摊主悻悻地交出奖品。你拿回三倍报名费和 PP 单项小补剂 ×2，临走前提醒她要守规则。'); }
}
