import { randomUUID } from 'crypto';
import { travellingRoster } from './travellers';
import type { RogueRun, RogueEncounter } from './types';
import type { RogueRandom } from './biome-pools';
import { makeEncounterSet, randomEncounterIVs } from './encounter-sets';
import { lowerToEligibleStage } from './evolution';
import { encounterCoins, routeCandyReward, journeyCoins } from './early-balance';
import { dialoguePage, queueNarrative, healNarrativeParty } from './narrative';
import { POLICE_REGIONS, STAR_BOSSES, type PoliceRegion } from './police-data';

export interface PoliceProgress {
 nextFloor: number;
 regions: Partial<Record<PoliceRegion, { floor: number, revengeAfter: number, status: 'pending' | 'cleared' | 'averted', round?: number, fans?: boolean }>>;
}
export interface PoliceEvent { choices?: PoliceRegion[]; region?: PoliceRegion; revenge?: boolean; round?: number; friendly?: boolean; fans?: boolean }
const avatars: Record<string, string> = {rocket: 'rocketgrunt', magma: 'magmagrunt-rse', aqua: 'aquagrunt', archie: 'archie-gen6', galactic: 'galacticgrunt', plasma: 'plasmagrunt-gen5bw', flare: 'flaregrunt', skull: 'skullgrunt', yell: 'yellgrunt', teamstar: 'stargrunt-s'};
const accompanying = (run: RogueRun, id: string) => travellingRoster(run).some(c => c.id === id);
const pennyAware = (run: RogueRun) => run.rival?.id === 'penny' || accompanying(run, 'penny');
function leader(region: PoliceRegion, round: number) {
 const data = POLICE_REGIONS[region];
 return region === 'paldea' ? STAR_BOSSES[Math.max(0, Math.min(5, round - 3))] : {id: data.boss, name: data.bossName, team: data.team, line: data.challenge};
}
function encounter(run: RogueRun, region: PoliceRegion, index: number, round: number, random: RogueRandom): RogueEncounter {
 const data = POLICE_REGIONS[region], boss = round >= 3, chief = leader(region, round);
 const id = boss ? chief.id : region === 'hisui' ? index % 2 ? 'coin' : 'clover' : data.grunt;
 const name = boss ? chief.name : region === 'hisui' ? index % 2 ? '阿梅' : '阿竹' : `${data.group}队员 ${index + 1}`;
 const level = Math.max(3, Math.min(100, Math.ceil(run.floor / 2) + (boss ? 5 + Math.max(0, round - 3) : round * 2)));
 const team = (boss ? chief.team : data.grunts[index % data.grunts.length]).map(species => {
  const set = makeEncounterSet(lowerToEligibleStage(species, level), level, randomEncounterIVs(random, boss));
  if (boss) set.evs = {hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252};
  return set;
 });
 return {key: randomUUID(), name, team, style: boss ? 'aggressive' : 'balanced', catchable: false,
  trainer: {id, name, avatar: avatars[id] || id, role: 'rocket', tera: false}};
}
function mark(run: RogueRun, police: PoliceEvent) {
 const node = run.node!, id = police.revenge ? 'policerevenge' : 'policeassist';
 node.event = {id, key: randomUUID(), stage: police.revenge ? 'battle' : 'choice', committed: true, police};
 node.name = police.revenge ? '未散的风波' : '君莎的治安协助';
 node.reward = {money: 0, items: {}}; delete node.wildLoot; delete node.blessingPrepared; delete node.spiritPrepared;
 run.encounter = 0; run.phase = police.revenge ? 'ready' : 'event';
 (run.eventHistory ||= []).push({id, floor: run.floor});
}
function progress(run: RogueRun, region: PoliceRegion, status: 'pending' | 'cleared' | 'averted', round: number, fans = false) {
 run.police ||= {nextFloor: 1, regions: {}};
 run.police.nextFloor = run.floor + 8;
 run.police.regions[region] = {floor: run.floor, revengeAfter: run.floor + 8, status, round, fans};
}
function pennyAside(run: RogueRun) {
 return pennyAware(run) ? [dialoguePage('penny', '牡丹', accompanying(run, 'penny') ? '……（她攥紧了背包肩带，没有接上队员的话。）' : '……（你瞥见远处熟悉的身影，她停下脚步，似乎有什么话始终没能说出口。）', false, 'left')] : [];
}
function pay(run: RogueRun, revenge: boolean, apology = false) {
 const potion = run.floor < 30 ? 'potion' : run.floor < 100 ? 'superpotion' : 'hyperpotion';
 const items = {...routeCandyReward(run.floor, 'trainer'), [potion]: 2, revive: 1};
 const money = Math.round(encounterCoins(run.floor) * (revenge ? 1.5 : 1.25) / 50) * 50 + (apology ? journeyCoins(run.floor, 100 + run.floor * 2) : 0);
 if (apology) items.superpotion = (items.superpotion || 0) + 1;
 run.money += money;
 for (const [id, count] of Object.entries(items)) run.bag[id] = (run.bag[id] || 0) + count;
 run.lastReward = {floor: run.floor, name: revenge ? '切磋的认可' : apology ? '君莎的谢礼与同行伙伴的歉礼' : '君莎的谢礼', money, items, points: 0};
}
function giovanniIntervention(run: RogueRun, random: RogueRandom) {
 const node = run.node!, event = node.event!, police = event.police!;
 police.friendly = true; police.round = 3; node.encounters = [encounter(run, 'johto', 0, 3, random)];
 event.stage = 'battle'; run.phase = 'ready';
 queueNarrative(run, [dialoguePage('giovanni', '坂木', '你们两个，收起宝可梦，把道路清理干净。阿波罗，过来。和我的旅伴切磋一场，看看什么叫真正的实力。', false, 'left'),
  dialoguePage('rocket', '火箭队队员', '是、是！我们马上去整理！'), dialoguePage('archer', '阿波罗', '遵命。这是一场切磋，我会负责赛后恢复，请尽管展示你的本领。')], 'ready');
}
/** A saved round advances only on victory, never on opening or reconnecting. */
export function beginPoliceEncounter(run: RogueRun, random: RogueRandom) {
 if (run.floor < (run.police?.nextFloor || 1)) return false;
 const regions = run.police?.regions || {};
 const pending = (Object.keys(regions) as PoliceRegion[]).filter(id => regions[id]!.status === 'pending' && run.floor >= regions[id]!.revengeAfter);
 if (pending.length && random(100) < 25) {
  const region = pending[random(pending.length)], data = POLICE_REGIONS[region], saved = regions[region]!;
  const round = (saved.round ?? 0) + 1, fans = !!saved.fans || region === 'galar' && accompanying(run, 'marnie');
  if (region === 'johto' && accompanying(run, 'giovanni')) {
   mark(run, {region, revenge: true, round}); giovanniIntervention(run, random); return true;
  }
  if (!['galar', 'paldea', 'johto'].includes(region) && accompanying(run, data.boss)) {
   mark(run, {region, revenge: true, round}); run.node!.encounters = [];
   progress(run, region, 'averted', round);
   run.bag.superpotion = (run.bag.superpotion || 0) + 1;
   const event = run.node!.event!; event.stage = 'result'; event.settled = true;
   event.result = ['同行伙伴制止了部下，交给你一份歉礼：好伤药 ×1。这段风波到此结束。']; run.phase = 'event';
   queueNarrative(run, [dialoguePage(data.boss, data.bossName, '还没闹够吗？让开路，把惹出的麻烦收拾好。', false, 'left'),
    dialoguePage(data.grunt, data.group + '队员', '老、老大？知道了，我们这就去！'),
    dialoguePage(data.boss, data.bossName, '又给你添麻烦了。收下这份补给吧，我会处理好他们。', true, 'left')], 'event');
   return true;
  }
  mark(run, {region, revenge: true, round, fans});
  const chief = leader(region, round), boss = round >= 3;
  run.node!.encounters = Array.from({length: boss ? 1 : 2 + round}, (_, i) => encounter(run, region, i, round, random));
  const pages = [dialoguePage(boss ? chief.id : data.grunt, boss ? chief.name : `${data.group}队员`, boss ? chief.line : fans ?
   `这次又多来了一位支持者！我们也想看看你和玛俐的默契，请再跟我们打一场吧！` : `上次是我们准备不足！这回来了 ${2 + round} 个人，队伍也练得更强了！`)];
  if (region === 'paldea' && round < 8) pages.push(...pennyAside(run));
  if (region === 'paldea' && round === 8) pages.unshift(dialoguePage('penny', '牡丹', '……一直没能告诉你，天星队的幕后首领就是我。谢谢你一路认真对待大家。最后，也请和我打一场，让我亲自承担这件事。', false, accompanying(run, 'penny') ? 'left' : 'right'));
  if (region === 'galar' && fans) pages.push(dialoguePage('marnie', '玛俐', boss ? '哥，我是自己决定和他一起旅行的。不过你想确认的话，我们就认真打给你看吧。' : '大家的心意我收到了，不过别再堵路了。切磋完就让旅人先走，好吗？', false, 'left'));
  if (region === 'galar' && fans && boss) pages.unshift(dialoguePage('piers', '聂梓', '他们一路唱着你们的事。我得亲眼确认，玛俐跟着你旅行能不能安心。来一场认真的对战吧。'));
  queueNarrative(run, pages, 'ready'); return true;
 }
 const available = (Object.keys(POLICE_REGIONS) as PoliceRegion[]).filter(id => !regions[id]);
 if (!available.length || random(100) >= 12) return false;
 // Keep three destinations without making the last unseen regions unreachable.
 const revisits = (Object.keys(POLICE_REGIONS) as PoliceRegion[]).filter(id => regions[id]?.status !== 'pending' && !available.includes(id));
 while (available.length < 3 && revisits.length) available.push(revisits.splice(random(revisits.length), 1)[0]);
 const choices = Array.from({length: Math.min(3, available.length)}, () => available.splice(random(available.length), 1)[0]);
 mark(run, {choices, round: 0}); run.node!.encounters = [];
 queueNarrative(run, [dialoguePage('jenny', '君莎', '你好，能请你帮忙照看附近的道路吗？几处地方有人拦住旅人，宝可梦们也受了惊。我会负责疏散和后续处理。'),
  dialoguePage('jenny', '君莎', '我把三个地点标在地图上了。你与伙伴的默契很好，能请你先去其中一处，让他们停止闹事吗？')], 'event'); return true;
}
export function policeView(run: RogueRun) {
 const event = run.node!.event!, police = event.police!;
 return {paragraphs: event.result || [police.revenge ? '熟悉的徽记从岔路出现，过去的风波似乎还有新的发展。' : '君莎递来地图，请选择一个地区前往协助。'],
  options: event.stage !== 'choice' ? [] : (police.choices || []).map(id => ({id: `police:${id}`, region: id === 'hoennaqua' ? 'hoenn' : id,
   name: `前往${POLICE_REGIONS[id].name} · ${POLICE_REGIONS[id].group}`, text: '道路旁出现了骚动。', disabled: false}))};
}
export function choosePoliceRegion(run: RogueRun, choice: string, random: RogueRandom) {
 const node = run.node!, event = node.event!, police = event.police!, region = choice.slice(7) as PoliceRegion;
 if (!choice.startsWith('police:') || !police.choices?.includes(region)) throw new Error('请选择地图上标出的地区。');
 police.region = region; delete police.choices; event.key = randomUUID();
 const data = POLICE_REGIONS[region];
 if (region === 'johto' && accompanying(run, 'giovanni')) {
  giovanniIntervention(run, random); return;
 }
 police.fans = region === 'galar' && accompanying(run, 'marnie');
 if (!['galar', 'paldea'].includes(region) && accompanying(run, data.boss)) {
  progress(run, region, 'averted', 0); pay(run, false, true); event.stage = 'result'; event.settled = true;
  event.result = ['同行伙伴制止了闹事者。君莎送来谢礼，伙伴也递来一份歉礼；这次风波不会再有后续。'];
  queueNarrative(run, [dialoguePage(data.boss, data.bossName, data.boss === 'guzma' ? '喂，你们两个！把路让开！别给我丢脸，赶紧去把弄乱的东西收拾好！' : '到此为止。把道路恢复原样，向受到影响的人道歉。', false, 'left'),
   dialoguePage(data.grunt, `${data.group}队员`, '老、老大？我们这就让开！'), dialoguePage(data.boss, data.bossName, '让你看笑话了。这点东西拿着，就当替他们赔个不是。', true, 'left'),
   dialoguePage('jenny', '君莎', '谢谢你们。道路恢复通行了，这是约好的谢礼。', true)], 'event'); return;
 }
 node.encounters = [encounter(run, region, 0, 0, random), encounter(run, region, 1, 0, random)]; event.stage = 'battle'; run.phase = 'ready';
 const pages = [dialoguePage(data.grunt, `${data.group}队员`, police.fans ? '玛俐！我们只是想替你加油。既然和你同行，也让我们看看这位训练家的本事吧！' : '你也想从这里过去？要插手，就先和我的宝可梦过两招！')];
 if (region === 'paldea') pages.push(...pennyAside(run));
 if (police.fans) pages.push(dialoguePage('marnie', '玛俐', '不要给别人添麻烦。真想切磋，就好好按规则来，结束后向大家道歉。', false, 'left'));
 queueNarrative(run, pages, 'ready');
}
export function settlePoliceBattle(run: RogueRun, won: boolean) {
 const node = run.node!, event = node.event!, police = event.police!, region = police.region!, data = POLICE_REGIONS[region];
 if (event.settled) return;
 const round = police.round ?? (police.revenge ? 3 : 0);
 if (police.friendly) {
  healNarrativeParty(run); progress(run, region, 'averted', round); if (won) pay(run, false, true);
  event.settled = true; event.stage = 'result'; event.result = [won ? '坂木点头认可了你的实力，队伍状态已恢复。' : '坂木肯定了你的尝试，阿波罗帮助全队恢复健康。这次切磋不会阻止旅途。'];
  run.encounter = node.encounters.length;
  queueNarrative(run, [dialoguePage('giovanni', '坂木', won ? '配合得不错。阿波罗，你也该从中学到些什么。走吧，我们还有自己的旅途。' : '胜负不是切磋的全部。先恢复伙伴，回头再想想刚才的应对。', true, 'left')], 'settlement'); return;
 }
 if (!won && region === 'paldea' && round === 8 && accompanying(run, 'penny')) {
  healNarrativeParty(run); progress(run, region, 'pending', 7);
  event.settled = true; event.stage = 'result'; run.encounter = node.encounters.length;
  event.result = ['牡丹帮全队恢复健康。这次切磋未获胜，奖励暂未领取；之后仍有机会再次较量。'];
  queueNarrative(run, [dialoguePage('penny', '牡丹', '别勉强，先照顾好伙伴。我们还会再试的……这一路上，你已经帮了大家很多。', true, 'left')], 'settlement'); return;
 }
 if (!won) return;
 if (run.encounter + 1 < node.encounters.length) {
  const next = node.encounters[run.encounter + 1];
  queueNarrative(run, [dialoguePage(next.trainer!.id, next.name, police.fans ? '换我来为你们加油！请指教！' : '还没完，接下来轮到我！')], 'settlement'); return;
 }
 const final = round >= (region === 'paldea' ? 8 : 3);
 progress(run, region, final ? 'cleared' : 'pending', round, police.fans);
 pay(run, round > 0); event.settled = true; event.stage = 'result';
 const chief = leader(region, round);
 const line = region === 'paldea' && final ? '谢谢你愿意认真面对我。我会亲自和大家说明白，解决这次天星队造成的麻烦。往后……也请多指教。' :
  police.fans && final ? '嗯，我放心了。玛俐有自己的判断，你也值得信赖。这些补给拿着，好好照顾彼此。' : final ? data.approval :
  police.fans ? '今天真的看到了很棒的对战！下次还会带更多同伴来支持你们！' : round >= 3 ? '这一战我服了。不过其他帮班也想认识你，下次旅途中再见吧。' : '我们会再回来！下一次，可不会只有这几个人了！';
 event.result = [line];
 const pages = [dialoguePage(round >= 3 ? chief.id : data.grunt, round >= 3 ? chief.name : `${data.group}队员`, line, true)];
 if (!round) pages.push(dialoguePage('jenny', '君莎', '谢谢你和伙伴，道路恢复通行了。路费和补给请收下，后面的善后交给我。', true));
 if (region === 'paldea' && !final) pages.push(...pennyAside(run));
 if (police.fans && final) pages.push(dialoguePage('marnie', '玛俐', '谢谢，哥。我们会好好走下去，下次再来听你的演出。', true, 'left'));
 queueNarrative(run, pages, 'settlement');
}
