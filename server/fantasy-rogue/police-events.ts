import { randomUUID } from 'crypto';
import { COMPANIONS, companionOwned, type CompanionID } from '../../sim/rogue-companions';
import type { RogueRun, RogueEncounter } from './types';
import type { RogueRandom } from './biome-pools';
import { makeEncounterSet, randomEncounterIVs } from './encounter-sets';
import { encounterCoins, routeCandyReward } from './early-balance';
import { dialoguePage, queueNarrative } from './narrative';
import { POLICE_REGIONS, type PoliceRegion } from './police-data';

export interface PoliceProgress {
	nextFloor: number;
	regions: Partial<Record<PoliceRegion, {
		floor: number, revengeAfter: number, status: 'pending' | 'cleared' | 'averted',
	}>>;
}
export interface PoliceEvent { choices?: PoliceRegion[]; region?: PoliceRegion; revenge?: boolean }
const GRUNT_AVATARS: Record<string, string> = {
	rocket: 'rocketgrunt', magma: 'magmagrunt-rse', galactic: 'galacticgrunt', plasma: 'plasmagrunt-gen5bw',
	flare: 'flaregrunt', skull: 'skullgrunt', yell: 'yellgrunt', teamstar: 'stargrunt-s',
};
const bossCompanion = (run: RogueRun, region: PoliceRegion): CompanionID | undefined => {
	const id = POLICE_REGIONS[region].boss as CompanionID;
	return COMPANIONS[id] && companionOwned(run.blessings, id) ? id : undefined;
};
function encounter(
	run: RogueRun, region: PoliceRegion, index: number, revenge: boolean, random: RogueRandom
): RogueEncounter {
	const data = POLICE_REGIONS[region];
	const id = revenge ? data.boss : region === 'hisui' ? index ? 'coin' : 'clover' : data.grunt;
	const name = revenge ? data.bossName : region === 'hisui' ? index ? '阿梅' : '阿竹' : `${data.group}队员 ${index + 1}`;
	const level = Math.max(3, Math.min(100, Math.ceil(run.floor / 2) + (revenge ? 5 : 0)));
	const team = (revenge ? data.team : data.grunts[index])
		.map(species => makeEncounterSet(species, level, randomEncounterIVs(random, revenge)));
	return { key: randomUUID(), name, team, style: 'balanced', catchable: false,
		trainer: { id, name, avatar: GRUNT_AVATARS[id] || id, role: 'rocket', tera: false } };
}
function markEvent(run: RogueRun, revenge: boolean, police: PoliceEvent) {
	const node = run.node!, id = revenge ? 'policerevenge' : 'policeassist';
	node.event = { id, key: randomUUID(), stage: revenge ? 'battle' : 'choice', committed: true, police };
	node.name = revenge ? '未散的风波' : '君莎的治安协助';
	node.reward = { money: 0, items: {} }; delete node.wildLoot;
	delete node.blessingPrepared; delete node.spiritPrepared;
	run.encounter = 0; run.phase = revenge ? 'ready' : 'event';
	(run.eventHistory ||= []).push({ id, floor: run.floor });
}
/** Roll only after committing to an encounter route. Nothing is rerolled on escape/reload. */
export function beginPoliceEncounter(run: RogueRun, random: RogueRandom) {
	if (run.floor < (run.police?.nextFloor || 1)) return false;
	const regions = run.police?.regions || {};
	const pending = (Object.keys(regions) as PoliceRegion[]).filter(id => regions[id]!.status === 'pending' &&
		run.floor >= regions[id]!.revengeAfter);
	if (pending.length && random(100) < 25) {
		const region = pending[random(pending.length)], data = POLICE_REGIONS[region];
		// Recruiting their leader later also prevents a revenge fight with their own companion.
		if (bossCompanion(run, region)) { regions[region]!.status = 'averted'; return false; }
		markEvent(run, true, { region, revenge: true });
		run.node!.encounters = [encounter(run, region, 0, true, random)];
		queueNarrative(run, [dialoguePage(data.boss, data.bossName, data.challenge)], 'ready');
		return true;
	}
	const available = (Object.keys(POLICE_REGIONS) as PoliceRegion[]).filter(id => !regions[id] ||
		regions[id].status !== 'pending' && run.floor >= regions[id].floor + 40);
	if (available.length < 3 || random(100) >= 12) return false;
	const choices = Array.from({ length: 3 }, () => available.splice(random(available.length), 1)[0]);
	markEvent(run, false, { choices }); run.node!.encounters = [];
	queueNarrative(run, [dialoguePage('jenny', '君莎', '你好，能请你帮忙照看一下附近的道路吗？几处地方有人拦住旅人，宝可梦们也受了惊。'),
		dialoguePage('jenny', '君莎', '我会负责疏散和后续处理。你与伙伴的默契很好，能请你先去其中一处，让他们停止闹事吗？我把目前的三个地点标在地图上了。')], 'event');
	return true;
}
export function policeView(run: RogueRun) {
	const event = run.node!.event!, police = event.police!;
	return { paragraphs: event.result || [police.revenge ? '熟悉的徽记从岔路尽头出现。这次，站在你面前的是他们的领头人。' :
		'君莎把地图递给你，自己转身安抚受惊的旅人。请选择一个地区前往协助。'],
	options: event.stage !== 'choice' ? [] : (police.choices || []).map(id => ({ id: `police:${id}`, region: id,
		name: `前往${POLICE_REGIONS[id].name}`, text: `${POLICE_REGIONS[id].group}在道路旁引发了骚动。`, disabled: false })) };
}
function pay(run: RogueRun, revenge: boolean, apology = false) {
	const potion = run.floor < 30 ? 'potion' : run.floor < 100 ? 'superpotion' : 'hyperpotion';
	const items = { ...routeCandyReward(run.floor, 'trainer'), [potion]: 2, revive: 1 };
	const money = Math.round(encounterCoins(run.floor) * (revenge ? 1.5 : 1.25) / 50) * 50 +
		(apology ? 100 + run.floor * 2 : 0);
	if (apology) items.superpotion = (items.superpotion || 0) + 1;
	run.money += money;
	for (const [id, count] of Object.entries(items)) run.bag[id] = (run.bag[id] || 0) + count;
	run.lastReward = { floor: run.floor,
		name: revenge ? '领头人的认可' : apology ? '君莎的谢礼与同行伙伴的歉礼' : '君莎的谢礼', money, items, points: 0 };
}
function progress(run: RogueRun, region: PoliceRegion, status: 'pending' | 'cleared' | 'averted') {
	run.police ||= { nextFloor: 1, regions: {} };
	run.police.nextFloor = run.floor + 8;
	run.police.regions[region] = { floor: run.floor, revengeAfter: run.floor + 8, status };
}
export function choosePoliceRegion(run: RogueRun, choice: string, random: RogueRandom) {
	const node = run.node!, event = node.event!, police = event.police!, region = choice.slice(7) as PoliceRegion;
	if (!choice.startsWith('police:') || !police.choices?.includes(region)) throw new Error('请选择地图上标出的地区。');
	police.region = region; delete police.choices; event.key = randomUUID();
	const data = POLICE_REGIONS[region], companion = bossCompanion(run, region);
	if (companion) {
		progress(run, region, 'averted'); pay(run, false, true);
		event.stage = 'result'; event.settled = true;
		event.result = ['同行伙伴制止了闹事的队员，之后不会触发这次风波的报复。君莎向你们送来谢礼，伙伴也递来一份小小的歉礼。'];
		queueNarrative(run, [dialoguePage(companion, data.bossName, companion === 'guzma' ?
			'喂，你们两个！把路让开！逞威风逞到旅人头上，真给我丢脸。赶紧去把弄乱的东西收拾好！' :
			'到此为止。阻拦旅人、惊扰宝可梦，这不是值得骄傲的事。请把道路恢复原样，向受到影响的人道歉。', false, 'left'),
		dialoguePage(data.grunt, `${data.group}队员`, '老、老大？我们这就让开！刚才是我们不对……', true),
		dialoguePage(companion, data.bossName, companion === 'guzma' ? '让你看笑话了。这点东西拿着，就当我替那两个笨蛋赔个不是。走吧。' :
		'让你遇到了这样的事，抱歉。这份小礼物请收下。谢谢你愿意和我一起让事情变得更好。', true, 'left'),
		dialoguePage('jenny', '君莎', '谢谢你们，道路已经恢复通行了。这是约好的谢礼，请带上补给，再继续旅行吧。', true)], 'event');
		return;
	}
	node.encounters = [encounter(run, region, 0, false, random), encounter(run, region, 1, false, random)];
	event.stage = 'battle'; run.phase = 'ready';
	queueNarrative(run, [dialoguePage(node.encounters[0].trainer!.id, node.encounters[0].name,
		'怎么，你也想从这里过去？要插手我们的事，就先和我的宝可梦过两招！')], 'ready');
}
export function settlePoliceBattle(run: RogueRun, won: boolean) {
	const node = run.node!, event = node.event!, police = event.police!, region = police.region!;
	const data = POLICE_REGIONS[region];
	if (!won || event.settled) return;
	if (!police.revenge && run.encounter === 0) {
		queueNarrative(run, [dialoguePage(node.encounters[1].trainer!.id, node.encounters[1].name,
			'别以为赢了他就算完！我的伙伴还在这里呢。')], 'settlement'); return;
	}
	progress(run, region, police.revenge ? 'cleared' : 'pending');
	pay(run, !!police.revenge); event.settled = true; event.stage = 'result';
	event.result = [police.revenge ? data.approval : '两名队员让出了道路，边跑边喊着要去找领头人。君莎确认旅人安全后，郑重向你道谢。'];
	queueNarrative(run, police.revenge ? [dialoguePage(data.boss, data.bossName, data.approval, true)] : [
		dialoguePage(data.grunt, `${data.group}队员`, '你等着！这件事我们要去告诉老大！', true),
		dialoguePage('jenny', '君莎', '辛苦你和伙伴了，大家已经可以安心赶路。这些路费和补给请收下，后面的善后交给我。', true),
	], 'settlement');
}
