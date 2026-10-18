import { Dex } from '../../sim/dex';
import { COMPANIONS, companionSource, companionOwned, strongestTypedMember, companionAbilityOptions,
	syncCompanions, companionHasGift, type CompanionID, type RogueCompanion } from '../../sim/rogue-companions';
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
	if (!event || !['choice', 'fragments'].includes(event.stage) || ['iono', 'canari'].includes(c.id) && run.node?.kind !== 'event') return;
	const available = options.filter(o => !o.disabled &&
		!['leave', 'back', 'unavailable', 'fishtap', 'fishfinish'].includes(o.id));
	const score = (o: Option) => {
		if (o.id === `postcard:${COMPANIONS[c.id].region}`) return 100;
		if (c.id === 'grusha' && o.id === 'skistart') return 100;
		if (['acerola', 'iris', 'grusha', 'rika'].includes(c.id) && event.id === 'legendarytracks' &&
			(o.id === 'investigate' || o.id.startsWith('site:'))) return 80;
		if (['bea', 'iono', 'canari', 'guzma', 'lysandre'].includes(c.id)) return ['fight', 'power', 'road', 'fantasy'].includes(o.id) ? 80 : 0;
		if (['acerola', 'iris', 'grusha', 'rika'].includes(c.id)) return (
			['open', 'adopt', 'path', 'mediate', 'left', 'right', 'confirm', 'fishstart'].includes(o.id) ||
			o.id.startsWith('swap:')
		) ? 70 : 0;
		if (c.id === 'lana') return o.id === 'fishstart' ? 100 : 0;
		if (c.id === 'olivia') return o.id.startsWith('stone:') ? 100 : 0;
		if (c.id === 'poppy') return ['open', 'reward', 'treasure', 'fragments', 'supplies', 'gift', 'accept', 'search', 'buy', 'trade'].includes(o.id) ? 80 : 0;
		return ['open', 'enter', 'ask', 'skill', 'fragments'].includes(o.id) ? 50 : 0;
	};
	return available.filter(o => score(o) > 0).sort((a, b) => score(b) - score(a))[0]?.id;
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
			giftCounter: companionHasGift(c.id),
			canConsult: run.phase === 'event' && !!companionRecommendation(run, c, options),
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
	if (command.value === 'choosewinter') {
		if (!run.blessings?.owned.some(b => b.family === 'companionwinter') ||
			run.blessings.companions?.some(c => ['grusha', 'rika'].includes(c.id)) ||
			!['grusha', 'rika'].includes(command.member || '')) throw new Error('请在古鲁夏与辛俐中选择一位。');
		grantCompanion(run, command.member as CompanionID); return;
	}
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
		if (run.phase !== 'event' || !run.node?.event || !['choice', 'fragments'].includes(run.node.event.stage)) throw new Error('当前没有可以咨询的事件选项。');
		c.consulted = run.node.event.key;
		const recommended = options.find(o => o.id === companionRecommendation(run, c, options));
		const reason = c.id === 'bea' ? '实战也是修行。' : c.id === 'acerola' ? '去看看会遇到什么伙伴吧。' :
			c.id === 'lana' ? '静下心来，看看这次能钓到什么。' : ['iono', 'canari'].includes(c.id) ? '来一场精彩的对战吧！' :
			c.id === 'iris' ? '我想听听宝可梦们的声音！' : c.id === 'poppy' ? '把这些宝物好好收起来吧！' :
			c.id === 'guzma' ? '别缩着，痛快地打一场！' : '最终的决定由你来做。';
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
		const stoneFinished = c.id === 'olivia' && event.id === 'stones' && choice === 'stonefinish' && !!event.stonesOpened;
		const recommended = companionRecommendation(run, c, options) === choice;
		if (c.counted?.includes(key) || !stoneFinished && !recommended) continue;
		c.eventKey = key; speak(c, 'praise', random);
		// Olivia approves opening a stone immediately, but one completed visit counts only once.
		if (c.id === 'olivia' && event.id === 'stones' && !stoneFinished) continue;
		(c.counted ||= []).push(key);
		if (['iono', 'canari'].includes(c.id) && run.node?.kind === 'event') event.streamerBonus = c.id;
		if (!companionHasGift(c.id)) continue;
		if (c.id === 'lana' && !(event.id === 'fishing' && choice === 'fishstart')) continue;
		if (c.id === 'olivia' && choice !== 'stonefinish') continue;
		c.preferences++;
		if (c.preferences >= 15 && !c.rewarded) {
			c.rewarded = true;
			const candy = candyAtFloor(run.floor), money = 100 + 3 * run.floor;
			const gifts: Record<string, { item: string, line: string }> = {
				poppy: { item: 'prettyfeather', line: '闪闪亮亮的羽毛！波琵想把它送给你！' },
				guzma: { item: 'superpotion', line: '拿着！养好精神，下次再狠狠干上一场！' },
				lysandre: { item: 'hyperpotion', line: '让这些生命继续走下去吧。这是我的心意。' },
				olivia: { item: 'pearl', line: '这颗珠子很适合你，可别拿去乱花哦。' },
				grusha: { item: 'iceheal', line: '别冻着。下一个弯道，也要稳稳地过去。' },
				rika: { item: 'superpotion', line: '表现不错嘛。这份小礼物，就当小小的合格奖啦。' },
				bea: { item: candy, line: '训练后补充一点甜食。下一场也请全力以赴。' },
				acerola: { item: 'ether', line: '嘿嘿，这是伙伴们藏起来的小礼物。收好哦！' },
				iono: { item: 'greatball', line: '十五次默契配合！这是本期节目给你的特别小奖品！' },
				canari: { item: 'greatball', line: '这是来电的纪念。希望下次也能遇见喜欢的伙伴。' },
				iris: { item: candy, line: '大家的声音都很开心呢！这份点心要和伙伴一起分享哦！' },
				lana: { item: 'lureball', line: '耐心也是钓鱼的本领。这颗球，留给下一次大收获吧。' },
			};
			const gift = gifts[c.id] || { item: 'potion', line: '这是我为伙伴准备的一点补给，收下吧。' };
			run.money += money; run.bag[gift.item] = (run.bag[gift.item] || 0) + 1;
			const itemName = gift.item.startsWith('expcandy') ? `经验糖果 ${gift.item.slice(8).toUpperCase()}` :
				({ ether: 'PP 单项小补剂', greatball: '超级球', lureball: '诱饵球', prettyfeather: '美丽之羽', superpotion: '好伤药', hyperpotion: '厉害伤药', iceheal: '解冻药', pearl: '珍珠', potion: '伤药' } as Record<string, string>)[gift.item];
			(run.notices ||= []).push(`${companionSource(c.id)}同行训练家的赠礼：「${gift.line}」金币 +${money}，【${itemName}】×1（已放入背包）。`);
		}
	}
}
export function companionExperience(run: RogueRun, mon: RoguePokemon, defeated: RogueDefeat) {
	let factor = 1;
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
	const id = encounterId.startsWith('floor:') ? 'acerola' : 'rika';
	if (!companionOwned(run.blessings, id) || run.companionPickups?.settled.includes(encounterId)) return;
	const pickups = run.companionPickups ||= { settled: [], items: {} };
	pickups.settled.push(encounterId);
	for (const mon of run.team) if (
		permanentMemberTypes(mon).some(type => (id === 'acerola' ? ['Ghost', 'Normal'] : ['Ground']).includes(type)) && random(100) < 30
	) {
		const pool = ['potion', 'ether', candyAtFloor(run.floor), run.floor >= 50 ? 'bigmushroom' : 'tinymushroom'];
		const id = pool[random(pool.length)]; pickups.items[id] = (pickups.items[id] || 0) + 1;
	}
}
export function deliverCompanionPickup(run: RogueRun, random?: RogueRandom) {
	if (random) companionPickup(run, `floor:${run.floor}`, random);
	const items = run.companionPickups?.items;
	if (!items || !Object.keys(items).length) return;
	for (const [id, count] of Object.entries(items)) run.bag[id] = (run.bag[id] || 0) + count;
	(run.notices ||= []).push(`${companionSource(companionOwned(run.blessings, 'rika') ? 'rika' : 'acerola')}伙伴们带回了旅途物资，已放入背包。`);
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
