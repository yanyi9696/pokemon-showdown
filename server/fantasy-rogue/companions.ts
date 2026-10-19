import { Dex } from '../../sim/dex';
import { COMPANIONS, companionSource, companionOwned, strongestTypedMember, companionAbilityOptions,
	syncCompanions, companionHasGift, companionGiftOptions, COMPANION_PREFERENCES, COMPANION_REGIONS, type CompanionID, type RogueCompanion } from '../../sim/rogue-companions';
import { permanentMemberTypes, memberStatTotal } from '../../sim/rogue-blessing-permanent';
import type { RogueRun, RogueCommand } from './types';
import type { RoguePokemon, RogueDefeat } from '../../sim/fantasy-rogue';
import type { RogueRandom } from './biome-pools';
import { COMPANION_DIALOGUE, COMPANION_GIFT_LINES } from './companion-dialogue';
import { candyAtFloor } from './early-balance';
import { companionZCandidates, companionZDefinition } from '../../sim/rogue-companion-z';
import { rewardChoices } from './reward-scenes';

export function grantCompanion(run: RogueRun, id: CompanionID) {
	if (run.rival?.id === id) throw new Error('这位训练家已经是本局劲敌，不能重复成为祝福同行。');
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
export type CompanionOption = { id: string, name: string, disabled?: boolean, region?: string, preference?: string };
export function companionOptions(run: RogueRun, options: CompanionOption[] = []): CompanionOption[] {
	if (run.phase === 'choose') return (run.choices || []).filter(n => !n.fogged).map(n => ({ id: n.id, name: n.name,
		preference: ['wild', 'elite', 'trainer', 'boss'].includes(n.kind) ? 'battle' : n.kind === 'reward' ? 'reward' : 'explore' }));
	if (run.phase === 'reward') return rewardChoices(run).map(o => ({ ...o, preference: 'reward' }));
	return options;
}
function consultationKey(run: RogueRun) {
	return run.phase === 'choose' ? 'routes:' + run.floor : run.phase === 'reward' ? run.node?.rewardScene?.key : run.node?.event?.key;
}
export function companionRecommendation(run: RogueRun, c: RogueCompanion, options: CompanionOption[]) {
	if (!['event', 'reward', 'choose'].includes(run.phase)) return;
	const event = run.node?.event, preference = COMPANION_PREFERENCES[c.id];
	const available = companionOptions(run, options).filter(o => !o.disabled &&
		!['leave', 'back', 'unavailable', 'fishtap', 'fishfinish', 'continue', 'finish'].includes(o.id));
	const score = (o: CompanionOption) => {
		if (o.id === 'postcard:' + COMPANIONS[c.id].region || o.region === COMPANIONS[c.id].region ||
			o.name.includes(COMPANION_REGIONS[COMPANIONS[c.id].region])) return 100;
		if (c.id === 'grusha' && o.id === 'skistart') return 100;
		if (o.preference === preference) return 80;
		if (preference === 'battle') return /^(fight|power|road|fantasy|honeymoonbattle|battle|acceptbattle)$/.test(o.id) ||
			!/不|拒绝|离开|放弃|避开/.test(o.name) && /挑战|对战|战斗|迎战|切磋|交手/.test(o.name) ? 80 : 0;
		if (preference === 'pokemon') return event?.id === 'legendarytracks' && (o.id === 'investigate' || o.id.startsWith('site:')) ||
			['open', 'adopt', 'path', 'mediate', 'left', 'right', 'confirm', 'fishstart'].includes(o.id) || o.id.startsWith('swap:') ||
			/领养|捕捉|遇见|展示.*宝可梦/.test(o.name) ? 70 : 0;
		if (preference === 'fish') return o.id === 'fishstart' ? 100 : 0;
		if (preference === 'stone') return o.id.startsWith('stone:') ? 100 : 0;
		if (preference === 'reward') return ['open', 'reward', 'treasure', 'fragments', 'supplies', 'gift', 'accept', 'search', 'trade'].includes(o.id) ||
			/领取|宝物|谢礼|奖励|补给|收下/.test(o.name) ? 80 : 0;
		return ['open', 'enter', 'ask', 'skill', 'fragments'].includes(o.id) ? 50 : 0;
	};
	return available.filter(o => score(o) > 0).sort((a, b) => score(b) - score(a))[0]?.id;
}
export function companionView(run: RogueRun, options: CompanionOption[] = []) {
	const event = run.node?.event;
	const key = event?.companionKey || consultationKey(run);
	return (run.blessings?.companions || []).map(c => {
		const approvedHere = c.eventKey === key || c.eventKey === 'routes:' + run.floor;
		const member = run.team.find(mon => mon.id === c.member);
		const pendingType = COMPANIONS[c.id].types.length > 1;
		return { ...c, name: COMPANIONS[c.id].name, source: companionSource(c.id),
			smileUntil: c.smile === 'chat' ? (c.messageAt || 0) + 6000 : undefined,
			smile: c.smile === 'approval' ? approvedHere :
			c.smile === 'chat' && Date.now() - (c.messageAt || 0) < 6000,
			message: c.smile === 'approval' && !approvedHere ? undefined : c.message,
			giftCounter: companionHasGift(c.id),
			giftOptions: c.giftPending && !c.rewarded ? companionGiftOptions(c.id) : [],
			zMove: companionZDefinition(c.id), zGrant: run.blessings?.companionZ,
			zCandidates: companionZCandidates(run.blessings!, run.team, c.id).map(mon => ({ id: mon.id, species: mon.set.species })),
			canConsult: ['event', 'choose', 'reward'].includes(run.phase) && companionOptions(run, options).some(o => !o.disabled),
			recommended: c.consulted === consultationKey(run) ? companionRecommendation(run, c, options) : undefined,
			member: member && { id: member.id, species: member.set.species, total: memberStatTotal(member) },
			typeOptions: pendingType ? COMPANIONS[c.id].types.map(type => ({ id: type,
				member: strongestTypedMember(run.team, type)?.set.species })) : [],
			abilityOptions: companionAbilityOptions(c, member, run.team, run.blessings!),
		};
	});
}
export function companionCommand(run: RogueRun, command: RogueCommand, random: RogueRandom, options: CompanionOption[]) {
	if (run.phase === 'battle') throw new Error('请在战斗外与同行训练家交流。');
	const choiceFamilies: Record<string, string> = { choosewinter: 'companionwinter', choosestreamer: 'companionstreamer', chooseai: 'companionai', chooseband: 'companionband' };
	const family = choiceFamilies[command.value || ''];
	if (family) {
		const candidates = (Object.keys(COMPANIONS) as CompanionID[]).filter(id => COMPANIONS[id].family === family && id !== run.rival?.id);
		if (!run.blessings?.owned.some(b => b.family === family) || run.blessings.companions?.some(c => candidates.includes(c.id)) ||
			!candidates.includes(command.member as CompanionID)) throw new Error('请从当前同行祝福的训练家中选择一位。');
		grantCompanion(run, command.member as CompanionID); return;
	}
	const c = run.blessings?.companions?.find(entry => entry.id === command.member);
	if (!c) throw new Error('这位训练家尚未同行。');
	if (command.value === 'chat') { speak(c, 'chat', random); return; }
	if (command.value === 'advice') {
		if (!['event', 'choose', 'reward'].includes(run.phase) || !companionOptions(run, options).length) throw new Error('当前没有可以咨询的选项。');
		c.consulted = consultationKey(run);
		const recommended = companionOptions(run, options).find(o => o.id === companionRecommendation(run, c, options));
		const reason = c.id === 'bea' ? '实战也是修行。' : c.id === 'acerola' ? '去看看会遇到什么伙伴吧。' :
			c.id === 'lana' ? '静下心来，看看这次能钓到什么。' : ['iono', 'canari'].includes(c.id) ? '来一场精彩的对战吧！' :
			c.id === 'iris' ? '我想听听宝可梦们的声音！' : c.id === 'poppy' ? '把这些宝物好好收起来吧！' :
			c.id === 'guzma' ? '别缩着，痛快地打一场！' : '最终的决定由你来做。';
		c.message = recommended ? `我想选择「${recommended.name}」。${reason}` : '先仔细看看眼前的情况吧。';
		c.messageAt = Date.now(); delete c.smile; return;
	}
	const [action, value] = (command.value || '').split(':');
	if (action === 'gift') { giveCompanionGift(run, c, value); return; }
	if (action === 'z') {
		const candidate = companionZCandidates(run.blessings!, run.team, c.id).find(mon => mon.id === value);
		if (!candidate) throw new Error('请选择掌握对应招式的伙伴；额外 Z 的使用伙伴只能指定一次。');
		run.blessings!.companionZ = { companion: c.id as 'marnie' | 'roxie' | 'lacey', member: candidate.id };
		(run.notices ||= []).push(companionSource(c.id) + '已为这位伙伴解锁额外 Z 招式，普通招式仍可正常使用。'); return;
	}
	if (action === 'type' && (COMPANIONS[c.id].types as readonly string[]).includes(value)) {
		if (c.type !== value) delete c.ability;
		c.type = value; syncCompanions(run.blessings!, run.team); return;
	}
	syncCompanions(run.blessings!, run.team);
	const member = run.team.find(mon => mon.id === c.member);
	if (action !== 'ability' ||
		!companionAbilityOptions(c, member, run.team, run.blessings!).includes(value)) {
		throw new Error('最强伙伴或额外特性选项已经变化。');
	}
	c.ability = value;
	const abilityName = Dex.mod('gen9fantasy').abilities.get(value).name;
	(run.notices ||= []).push(`${companionSource(c.id)}${member ? member.set.species + ' 获得' : '已预选，等待对应属性伙伴加入：'}额外特性 ${abilityName}；战斗外可随时更换。`);
}
export function recordCompanionPreference(run: RogueRun, options: CompanionOption[], choice: string, random: RogueRandom) {
	const event = run.node?.event;
	const key = run.phase === 'event' && event ? event.companionKey ||= event.key : consultationKey(run);
	if (!key) return;
	for (const c of run.blessings?.companions || []) {
		const stoneFinished = c.id === 'olivia' && event?.id === 'stones' && choice === 'stonefinish' && !!event.stonesOpened;
		const recommended = companionRecommendation(run, c, options) === choice;
		if (c.counted?.includes(key) || !stoneFinished && !recommended) continue;
		c.eventKey = key; speak(c, 'praise', random);
		// Olivia approves opening a stone immediately, but one completed visit counts only once.
		if (c.id === 'olivia' && event?.id === 'stones' && !stoneFinished) continue;
		(c.counted ||= []).push(key);
		if (['iono', 'canari'].includes(c.id) && run.node?.kind === 'event') event!.streamerBonus = c.id;
		if (!companionHasGift(c.id)) continue;
		if (c.id === 'lana' && !(event?.id === 'fishing' && choice === 'fishstart')) continue;
		if (c.id === 'olivia' && choice !== 'stonefinish') continue;
		c.preferences++;
		if (c.preferences >= 15 && !c.rewarded && !c.giftPending) {
			c.giftPending = true;
			const gifts = companionGiftOptions(c.id);
			if (gifts.length === 1) giveCompanionGift(run, c, gifts[0].id);
			else (run.notices ||= []).push(companionSource(c.id) + '同行训练家的赠礼准备好了，请在同行面板中挑选一件。');
		}
	}
}
export function giveCompanionGift(run: RogueRun, c: RogueCompanion, item: string) {
	const gift = companionGiftOptions(c.id).find(g => g.id === item);
	if (!gift || !c.giftPending || c.rewarded) throw new Error('当前没有可领取的同行训练家赠礼。');
	c.rewarded = true; delete c.giftPending;
	run.bag[gift.id] = (run.bag[gift.id] || 0) + 1;
	const line = COMPANION_GIFT_LINES[c.id];
	(run.notices ||= []).push(companionSource(c.id) + '同行训练家的赠礼：「' + line + '」获得【' + gift.name + '】×1，对应属性招式威力 ×1.2。');
}

export function companionExperience(run: RogueRun, mon: RoguePokemon, defeated: RogueDefeat) {
	let factor = 1;
	if (companionOwned(run.blessings, 'kahili') && permanentMemberTypes(mon).includes('Flying')) factor *= 1.3;
	if (companionOwned(run.blessings, 'giovanni') && defeated.killer === mon.id && !defeated.captured && permanentMemberTypes(mon).includes('Psychic')) factor *= 1.2;
	if (companionOwned(run.blessings, 'bea') && permanentMemberTypes(mon).includes('Fighting')) factor *= 1.3;
	if (companionOwned(run.blessings, 'lana') &&
		Dex.mod('gen9fantasy').species.get(defeated.species).types.includes('Water')) factor *= 1.2;
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
		const total = (carries[key] || 0) + gained * 2.5;
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
	const id = encounterId.startsWith('floor:') ? companionOwned(run.blessings, 'liko') ? 'liko' : 'acerola' : 'rika';
	if (!companionOwned(run.blessings, id) || run.companionPickups?.settled.includes(encounterId)) return;
	const pickups = run.companionPickups ||= { settled: [], items: {} };
	pickups.settled.push(encounterId);
	for (const mon of run.team) if (
		permanentMemberTypes(mon).some(type => (id === 'acerola' ? ['Ghost', 'Normal'] : id === 'liko' ? ['Grass'] : ['Ground']).includes(type)) && random(100) < 30
	) {
		const pool = id === 'liko' ? ['tinymushroom', 'pearl', 'stardust', 'prettyfeather'] : ['potion', 'ether', candyAtFloor(run.floor), run.floor >= 50 ? 'bigmushroom' : 'tinymushroom'];
		const item = pool[random(pool.length)]; pickups.items[item] = (pickups.items[item] || 0) + 1;
	}
}
export function deliverCompanionPickup(run: RogueRun, random?: RogueRandom) {
	if (random) companionPickup(run, `floor:${run.floor}`, random);
	const items = run.companionPickups?.items;
	if (!items || !Object.keys(items).length) return;
	for (const [id, count] of Object.entries(items)) run.bag[id] = (run.bag[id] || 0) + count;
	(run.notices ||= []).push(`${companionSource(companionOwned(run.blessings, 'rika') ? 'rika' : companionOwned(run.blessings, 'liko') ? 'liko' : 'acerola')}伙伴们带回了旅途物资，已放入背包。`);
	run.companionPickups!.items = {};
}

/** Called once when a reward region is completed, never on its preview or a retry. */
export function poppyRewardPickup(run: RogueRun, random: RogueRandom) {
	const c = companionOwned(run.blessings, 'poppy');
	if (!c || run.node?.kind !== 'reward') return;
	const key = `reward:${run.floor}`;
	if (c.counted?.includes(key)) return;
	(c.counted ||= []).push(key);
	const count = run.team.filter(mon => permanentMemberTypes(mon).includes('Steel') && random(100) < 40).length;
	if (!count) return;
	const candy = candyAtFloor(run.floor);
	run.bag[candy] = (run.bag[candy] || 0) + count;
	if (run.lastReward?.floor === run.floor) run.lastReward.items[candy] = (run.lastReward.items[candy] || 0) + count;
	(run.notices ||= []).push(`${companionSource('poppy')}钢系伙伴带来了经验糖果 ×${count}，已放入背包。`);
}
