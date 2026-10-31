import { formItem } from './form-item-data';
import { randomUUID } from 'crypto';
import { Dex } from '../../sim/dex';
import type { RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import {
	exclusiveCatalog, neededExclusiveItems, exclusiveEncounterChance, grantExclusiveItem, suitableExclusiveItems,
} from './exclusive-items';
import { makeEncounterSet, randomEncounterIVs, regionalEncounterLevel } from './encounter-sets';
import { lowerToEligibleStage } from './evolution';
import { applyHeldForme } from './held-formes';

const dex = Dex.mod('gen9fantasy');
export interface ExclusiveEvent { item: string; answer?: number; tried: number[]; clue?: number; battleElite?: boolean }
export function beginExclusiveEncounter(run: RogueRun, random: RogueRandom) {
	const needs = neededExclusiveItems(run).filter(item => exclusiveEncounterChance(run, item.id) > 0);
	if (!needs.length) return false;
	// One chance per entered encounter area; many masks/stones never multiply that chance.
	needs.sort((a, b) => exclusiveEncounterChance(run, b.id) - exclusiveEncounterChance(run, a.id));
	const best = needs.filter(item =>
		exclusiveEncounterChance(run, item.id) === exclusiveEncounterChance(run, needs[0].id));
	const item = best[random(best.length)], success = random(100) < exclusiveEncounterChance(run, item.id);
	for (const entry of needs) run.exclusiveItems![entry.id].misses++;
	if (!success) return false;
	const owner = run.team.find(mon => suitableExclusiveItems(mon.set.species).some(entry => entry.id === item.id))!;
	// A surprise item encounter remains a modest test, below the separate challenge route.
	const lv = Math.min(100, regionalEncounterLevel(run.floor, false) + 2);
	const pool = [...item.guards];
	const species = [lowerToEligibleStage(owner.set.species, lv)];
	while (species.length < (run.floor >= 100 ? 4 : 3) && pool.length) {
		const name = lowerToEligibleStage(pool.splice(random(pool.length), 1)[0], lv);
		if (!species.includes(name)) species.push(name);
	}
	const team = species.map(name => makeEncounterSet(name, lv, 27));
	if (!formItem(item.id)) team[0].item = dex.items.get(item.id).name;
	applyHeldForme(team[0]);
	for (const set of team) {
		const s = dex.species.get(set.species);
		const effort = Math.min(128, lv * 3);
		set.evs = { hp: effort, atk: s.baseStats.atk >= s.baseStats.spa ? effort : 0, def: 0,
			spa: s.baseStats.atk < s.baseStats.spa ? effort : 0, spd: 0, spe: 0 };
	}
	const node = run.node!;
	node.name = `${item.trainer}的考验`;
	(run.eventHistory ||= []).push({ id: 'exclusivechallenge', floor: run.floor });
	node.event = { id: 'exclusivechallenge', key: randomUUID(), stage: 'battle', committed: true, trainingAidBlocked: true,
		exclusive: { item: item.id, tried: [] }, result: [
			`走过${item.place}，${item.trainer}拦住了你的去路，目光停在【${owner.set.species}】身上。`,
			`对方举起【${formItem(item.id)?.name || dex.items.get(item.id).name}】：「它在等一个合适的伙伴。让我亲眼看看，你们能不能承担它的力量！」`,
			'精灵球已经划过半空。你握紧自己的精灵球，迎上对方的目光。',
		] };
	node.encounters = [{ name: item.trainer, team, catchable: false, style: 'balanced',
		trainer: { id: `exclusive-${item.id}`, name: item.trainer, avatar: item.avatar,
			role: 'traveller', tera: run.floor >= 100 } }];
	delete node.wildLoot; delete node.spiritPrepared; delete node.blessingPrepared;
	run.encounter = 0;
	return true;
}
export function beginExclusiveClue(run: RogueRun, random: RogueRandom) {
	const items = neededExclusiveItems(run);
	if (!items.length) return false;
	const item = items[random(items.length)];
	run.node!.event = { id: 'exclusiveclue', key: randomUUID(), stage: 'choice',
		exclusive: { item: item.id, answer: random(4), tried: [] } };
	run.node!.name = '遗落的共鸣';
	run.phase = 'event';
	return true;
}
export function exclusiveEventView(run: RogueRun) {
	const event = run.node!.event!, state = event.exclusive!;
	const item = exclusiveCatalog().find(i => i.id === state.item)!;
	const option = (id: string, name: string) => ({ id, name, text: '', disabled: false });
	const intro = [`你走进${item.place}。队伍中的伙伴忽然停下脚步，朝一个方向轻轻叫了一声。`,
		`一张发黄的纸片提到【${formItem(item.id)?.name || dex.items.get(item.id).name}】，却只留下了「${item.clue}」这点模糊线索。`];
	return { title: event.id === 'exclusivechallenge' ? `${item.trainer}的考验` : '遗落的共鸣',
		paragraphs: event.result || intro,
		options: event.stage !== 'choice' ? [] : !event.committed ?
			[option('investigate', '跟着伙伴寻找线索。'), option('leave', '记下这里，继续赶路。')] :
			item.sites.flatMap((site, i) => state.tried.includes(i) ? [] : [option(`site:${i}`, `查看${site}。`)]),
	};
}
export function chooseExclusiveEvent(run: RogueRun, choice: string, random: RogueRandom) {
	const event = run.node!.event!, state = event.exclusive!, item = exclusiveCatalog().find(i => i.id === state.item)!;
	if (choice === 'leave') {
		event.stage = 'result'; event.settled = true;
		event.result = ['你记下那张纸片，继续走向塔的深处。']; return;
	}
	event.committed = true; event.key = randomUUID();
	if (choice === 'investigate') { event.result = ['你蹲下来端详地上的痕迹，伙伴也凑过来闻了闻。四处地方都有些可疑。']; return; }
	const index = Number(choice.slice(5));
	if (index === state.answer) {
		const granted = grantExclusiveItem(run, state.item);
		event.stage = 'result'; event.settled = true;
		event.result = [granted ? `伙伴兴奋地叫了起来。你在${item.sites[index]}找到了【${formItem(state.item)?.name || dex.items.get(state.item).name}】！` : '这里的物品已经由你收好。'];
		return;
	}
	state.tried.push(index); state.battleElite = state.tried.length === 3;
	const lv = Math.min(100, Math.max(3, Math.ceil(run.floor / 2)) + (state.battleElite ? 5 : 0));
	const species = lowerToEligibleStage(item.guards[random(item.guards.length)], lv);
	event.stage = 'battle';
	event.result = [`${item.sites[index]}没有你要找的东西，却惊动了藏在这里的宝可梦！`,
		state.battleElite ? '一个格外强壮的身影挡在眼前。它似乎一直守着最后的线索。' : '先应付眼前的袭击，再仔细看清那些痕迹。'];
	const node = run.node!;
	delete node.wildLoot; delete node.spiritPrepared; delete node.blessingPrepared;
	node.reward = { money: 0, items: {} };
	node.encounters = [{ key: randomUUID(), name: state.battleElite ? '遗迹守卫 · 精英' : '遗迹中的野生宝可梦',
		team: [makeEncounterSet(species, lv, randomEncounterIVs(random, state.battleElite))],
		catchable: true, style: 'balanced' }];
	run.encounter = 0; run.phase = 'ready';
}
export function settleExclusiveEvent(run: RogueRun, won: boolean) {
	const event = run.node!.event!, state = event.exclusive!, item = exclusiveCatalog().find(i => i.id === state.item)!;
	event.key = randomUUID();
	if (event.id === 'exclusivechallenge') {
		event.stage = 'result'; event.settled = true;
		if (won) {
			const reward = run.node!.reward;
			run.money += reward.money;
			for (const [id, count] of Object.entries(reward.items)) run.bag[id] = (run.bag[id] || 0) + count;
			grantExclusiveItem(run, state.item);
			event.result = [`${item.trainer}收回精灵球，认真地点了点头。`, `「我看到了。交给你们，我很放心。」你接过了【${formItem(state.item)?.name || dex.items.get(state.item).name}】。`];
		} else {
			run.exclusiveItems![state.item].cooldown = run.floor + 8;
			event.result = [`${item.trainer}扶稳你，摇了摇头：「还差一点。先照顾好伙伴，过一段路，我会再来测试你们的实力。」`];
		}
		// The event can be left after either outcome; only victory earns the encounter prize.
		run.node!.reward = { money: 0, items: {} };
	} else {
		event.stage = 'choice';
		event.result = [won ? '袭击者退去了。你捡起散落的纸片，线索又清楚了一些。' : '你退到安全的地方，发现对方追赶时反而露出了隐藏的痕迹。先照顾伙伴，再继续寻找。',
			`已经排除：${state.tried.map(i => item.sites[i]).join('、')}。`,
			state.tried.length >= 2 ? `你终于辨认出：「沿着${item.clue}，去${item.sites[state.answer!]}。」` :
			`纸片上的${item.clue}更加清晰了，其余地点还需要继续辨认。`];
	}
	run.phase = 'event';
}
