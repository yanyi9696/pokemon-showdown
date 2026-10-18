import { Dex } from '../../sim/dex';
import { COMPANIONS, companionSource, companionOwned, strongestTypedMember, companionAbilityOptions,
	syncCompanions, type CompanionID, type RogueCompanion } from '../../sim/rogue-companions';
import { permanentMemberTypes, memberStatTotal } from '../../sim/rogue-blessing-permanent';
import type { RogueRun, RogueCommand } from './types';
import type { RoguePokemon, RogueDefeat } from '../../sim/fantasy-rogue';
import type { RogueRandom } from './biome-pools';
import { COMPANION_DIALOGUE } from './companion-dialogue';
import { candyAtFloor } from './early-balance';

export function grantCompanion(run: RogueRun, id: CompanionID) {
	const list = run.blessings!.companions ||= [];
	if (list.some(c => c.id === id)) return;
	list.push({ id, preferences: 0, ...(COMPANIONS[id].types.length === 1 ? { type: COMPANIONS[id].types[0] } : {}) });
	syncCompanions(run.blessings!, run.team);
	(run.notices ||= []).push(`${companionSource(id)}加入了旅途。`);
}
function speak(c: RogueCompanion, kind: 'chat' | 'praise', random: RogueRandom) {
	const pool = COMPANION_DIALOGUE[c.id][kind], key = kind === 'chat' ? 'chatSeen' : 'praiseSeen';
	if ((c[key]?.length || 0) >= pool.length) c[key] = [];
	const seen = c[key] ||= [], candidates = pool.map((_, i) => i).filter(i => !seen.includes(i));
	const index = candidates[random(candidates.length)]; seen.push(index);
	c.message = pool[index]; c.messageAt = Date.now(); c.smile = kind === 'chat' ? 'chat' : 'approval';
}
type Option = { id: string, name: string, disabled?: boolean };
export function companionRecommendation(run: RogueRun, c: RogueCompanion, options: Option[]) {
	const event = run.node?.event;
	if (!event || event.stage !== 'choice' || ['iono', 'canari'].includes(c.id) && run.node?.kind !== 'event') return;
	const available = options.filter(o => !o.disabled &&
		!['leave', 'back', 'unavailable', 'fishtap', 'fishfinish'].includes(o.id));
	const score = (o: Option) => {
		if (o.id === `postcard:${COMPANIONS[c.id].region}`) return 100;
		if (['iono', 'canari'].includes(c.id)) return ['investigate', 'ask', 'skill', 'sleep', 'taste', 'fragments', 'fishstart'].includes(o.id) ? 90 :
			['fight', 'power', 'road', 'fantasy', 'leave'].includes(o.id) ? 0 : 40;
		if (c.id === 'bea') return ['fight', 'power', 'road', 'fantasy'].includes(o.id) ? 80 : 0;
		if (c.id === 'acerola') return (
			['open', 'adopt', 'path', 'mediate', 'left', 'right', 'confirm', 'fishstart'].includes(o.id) ||
			o.id.startsWith('swap:')
		) ? 70 : 0;
		if (c.id === 'lana') return o.id === 'fishstart' ? 100 : ['open', 'adopt', 'path'].includes(o.id) ? 50 : 0;
		return ['open', 'enter', 'ask', 'skill', 'fragments'].includes(o.id) ? 50 : 0;
	};
	return available.sort((a, b) => score(b) - score(a))[0]?.id;
}
export function companionView(run: RogueRun, options: Option[] = []) {
	const event = run.node?.event;
	return (run.blessings?.companions || []).map(c => {
		const member = run.team.find(mon => mon.id === c.member);
		const pendingType = !c.type && COMPANIONS[c.id].types.length;
		return { ...c, name: COMPANIONS[c.id].name, source: companionSource(c.id),
			smileUntil: c.smile === 'chat' ? (c.messageAt || 0) + 6000 : undefined,
			smile: c.smile === 'approval' ? c.eventKey === (event?.companionKey || event?.key) :
			c.smile === 'chat' && Date.now() - (c.messageAt || 0) < 6000,
			message: c.smile === 'approval' && c.eventKey !== (event?.companionKey || event?.key) ? undefined : c.message,
			canConsult: run.phase === 'event' && event?.stage === 'choice' && !!companionRecommendation(run, c, options),
			recommended: c.consulted === event?.key ? companionRecommendation(run, c, options) : undefined,
			member: member && { id: member.id, species: member.set.species, total: memberStatTotal(member) },
			typeOptions: pendingType ? COMPANIONS[c.id].types.map(type => ({ id: type,
				member: strongestTypedMember(run.team, type)?.set.species })) : [],
			abilityOptions: member && !c.ability ? companionAbilityOptions(c, member, run.team, run.blessings!) : [],
		};
	});
}
export function companionCommand(run: RogueRun, command: RogueCommand, random: RogueRandom, options: Option[]) {
	if (run.phase === 'battle') throw new Error('请在战斗外与同行训练家交流。');
	if (command.value === 'choosestreamer') {
		if (!run.blessings?.owned.some(b => b.family === 'companionstreamer') ||
			run.blessings.companions?.some(c => ['iono', 'canari'].includes(c.id)) ||
			!['iono', 'canari'].includes(command.member || '')) throw new Error('请在奇树与卡娜莉中选择一位。');
		grantCompanion(run, command.member as CompanionID); return;
	}
	if (command.value === 'chooseai') {
		if (!run.blessings?.owned.some(b => b.family === 'companionai') ||
			run.blessings.companions?.some(c => ['sada', 'turo'].includes(c.id)) ||
			!['sada', 'turo'].includes(command.member || '')) {
			throw new Error('请在奥琳 AI 与弗图 AI 中选择一位。');
		}
		grantCompanion(run, command.member as CompanionID); return;
	}
	const c = run.blessings?.companions?.find(entry => entry.id === command.member);
	if (!c) throw new Error('这位训练家尚未同行。');
	if (command.value === 'chat') { speak(c, 'chat', random); return; }
	if (command.value === 'advice') {
		if (run.phase !== 'event' || run.node?.event?.stage !== 'choice') throw new Error('当前没有可以咨询的事件选项。');
		c.consulted = run.node.event.key;
		const recommended = options.find(o => o.id === companionRecommendation(run, c, options));
		const reason = c.id === 'bea' ? '实战也是修行。' : c.id === 'acerola' ? '去看看会遇到什么伙伴吧。' :
			c.id === 'lana' ? '也许会有不错的收获。' : ['iono', 'canari'].includes(c.id) ? '这里的故事一定很有意思！' : '最终的决定由你来做。';
		c.message = recommended ? `我想选择「${recommended.name}」。${reason}` : '先仔细看看眼前的情况吧。';
		c.messageAt = Date.now(); delete c.smile; return;
	}
	const [action, value] = (command.value || '').split(':');
	if (action === 'type' && !c.type && (COMPANIONS[c.id].types as readonly string[]).includes(value)) {
		if (!strongestTypedMember(run.team, value)) throw new Error('队伍里还没有对应属性的伙伴。');
		c.type = value; syncCompanions(run.blessings!, run.team); return;
	}
	syncCompanions(run.blessings!, run.team);
	const member = run.team.find(mon => mon.id === c.member);
	if (action !== 'ability' || !member || c.ability ||
		!companionAbilityOptions(c, member, run.team, run.blessings!).includes(value)) {
		throw new Error('最强伙伴或额外特性选项已经变化。');
	}
	c.ability = value;
	const abilityName = Dex.mod('gen9fantasy').abilities.get(value).name;
	(run.notices ||= []).push(`${companionSource(c.id)}${member.set.species} 获得额外特性 ${abilityName}。`);
}
export function recordCompanionPreference(run: RogueRun, options: Option[], choice: string, random: RogueRandom) {
	const event = run.node!.event!;
	const key = event.companionKey ||= event.key;
	for (const c of run.blessings?.companions || []) {
		if (companionRecommendation(run, c, options) !== choice || c.counted?.includes(key)) continue;
		(c.counted ||= []).push(key);
		if (['iono', 'canari'].includes(c.id) && run.node?.kind === 'event') event.streamerBonus = c.id;
		c.eventKey = key; speak(c, 'praise', random);
		if (!['bea', 'acerola', 'iono', 'canari'].includes(c.id)) continue;
		c.preferences++;
		if (c.preferences >= 15 && !c.rewarded) {
			c.rewarded = true;
			const money = 300 + 8 * run.floor, candy = candyAtFloor(run.floor);
			run.money += money; run.bag[candy] = (run.bag[candy] || 0) + 2; run.bag.ether = (run.bag.ether || 0) + 1;
			(run.notices ||= []).push(`${companionSource(c.id)}同行心意：金币 +${money}，经验糖果 ×2，PP 单项小补剂 ×1。`);
		}
	}
}
export function companionExperience(run: RogueRun, mon: RoguePokemon, defeated: RogueDefeat) {
	let factor = 1;
	if (companionOwned(run.blessings, 'bea') && permanentMemberTypes(mon).includes('Fighting')) factor *= 1.3;
	if (companionOwned(run.blessings, 'lana') &&
		Dex.mod('gen9fantasy').species.get(defeated.species).types.includes('Water')) factor *= 1.25;
	return factor;
}
/** Tenths are saved across events: small rewards are not rounded into a 100% bonus. */
export function boostCompanionEventRewards(run: RogueRun, before: { money: number, bag: Record<string, number>, shards?: number }) {
	const event = run.node?.event;
	if (run.node?.kind !== 'event' || !event?.streamerBonus || run.money < before.money) return;
	const c = companionOwned(run.blessings, event.streamerBonus);
	if (!c || !['iono', 'canari'].includes(c.id)) return;
	const carries = c.rewardRemainder ||= {};
	const extra = (key: string, gained: number) => {
		if (gained <= 0) return 0;
		const total = (carries[key] || 0) + gained;
		carries[key] = total % 10;
		return Math.floor(total / 10);
	};
	let increased = 0;
	const coins = extra('money', run.money - before.money); run.money += coins; increased += coins;
	// Exclusive items, form items and purchased rewards are not duplicated.
	const supplies = /^(expcandy|potion$|superpotion$|hyperpotion$|revive$|maxrevive$|ether$|elixir$|fullheal$|antidote$|burnheal$|iceheal$|awakening$|paralyzeheal$|pokeball$|greatball$|ultraball$|oranberry$|sitrusberry$|healthfeather$|musclefeather$|resistfeather$|geniusfeather$|cleverfeather$|swiftfeather$|prettyfeather$|.*mushroom$|.*pearl$|.*nugget$|stardust$|starpiece$|cometshard$|pearlstring$)/;
	for (const [id, count] of Object.entries(run.bag)) {
		if (!supplies.test(id)) continue;
		const amount = extra(id, count - (before.bag[id] || 0)); run.bag[id] += amount; increased += amount;
	}
	if (run.blessings && before.shards !== undefined) {
		const amount = extra('shards', run.blessings.shards - before.shards);
		run.blessings.shards += amount; increased += amount;
	}
	if (increased) (run.notices ||= []).push(`${companionSource(c.id)}这次事件的收获增加了，已一并收好。`);
}
export function companionPickup(run: RogueRun, encounterId: string, random: RogueRandom) {
	if (!companionOwned(run.blessings, 'acerola') || run.companionPickups?.settled.includes(encounterId)) return;
	const pickups = run.companionPickups ||= { settled: [], items: {} };
	pickups.settled.push(encounterId);
	for (const mon of run.team) if (
		permanentMemberTypes(mon).some(type => ['Ghost', 'Normal'].includes(type)) && random(100) < 20
	) {
		const pool = ['potion', 'ether', candyAtFloor(run.floor), run.floor >= 50 ? 'bigmushroom' : 'tinymushroom'];
		const id = pool[random(pool.length)]; pickups.items[id] = (pickups.items[id] || 0) + 1;
	}
}
export function deliverCompanionPickup(run: RogueRun) {
	const items = run.companionPickups?.items;
	if (!items || !Object.keys(items).length) return;
	for (const [id, count] of Object.entries(items)) run.bag[id] = (run.bag[id] || 0) + count;
	(run.notices ||= []).push(`${companionSource('acerola')}伙伴们带回了旅途物资，已放入背包。`);
	run.companionPickups!.items = {};
}
