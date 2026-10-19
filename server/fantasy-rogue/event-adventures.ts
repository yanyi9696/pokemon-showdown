import { randomEncounterAbility } from './encounter-sets';
import { Dex, toID } from '../../sim/dex';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { drawBlessingGift, gift, giveEquipment, recordNegativeBlessingEvent } from './blessings';
import { themedEventTeam } from './event-teams';
import { eventRewardBudget, eventCost } from './early-balance';
import { rebuildMember } from './progression';
import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { offerEventFragments } from './event-fragments';

const dex = Dex.mod('gen9fantasy');
export const adventureEvent = (id: string) => ['bandits', 'dice', 'fishing'].includes(id);
export interface FishingState {
	started: number; anchor: number; travel: number; hits: number; misses: number;
	lastTap: number; center: number; feedback?: string;
}
export const fishingWidth = (hits: number) => Math.max(0.16, 0.32 - hits * 0.035);
export const fishingPeriod = (hits: number) => 2400 / (1 + hits * 0.08);
export function fishingFrame(fish: FishingState, now: number) {
	const phase = (fish.travel + Math.max(0, now - fish.anchor) * 2 / fishingPeriod(fish.hits)) % 2;
	return { cursor: phase <= 1 ? phase : 2 - phase,
		progress: Math.max(0, (now - fish.started) / 14000 - fish.hits * 0.04 + fish.misses * 0.035) };
}
const budget = (floor: number) => Math.round(eventRewardBudget(floor) / 50) * 50;
const finish = (run: RogueRun, text: string[]) => {
	Object.assign(run.node!.event!, { stage: 'result', settled: true, result: text });
	run.phase = 'event';
};
function lose(run: RogueRun, multiplier: number) {
	const cost = Math.min(run.money, Math.round(eventCost(run.floor) * multiplier));
	run.money -= cost;
	run.node!.event!.trainingAidBlocked = true;
	if (cost) recordNegativeBlessingEvent(run, 'outcome');
	return cost;
}
function loot(run: RogueRun, content: RogueContent, random: RogueRandom, value: number) {
	const treasures = content.items.filter(i => i.kind === 'treasure' && i.sellPrice).sort((a, b) => b.sellPrice! - a.sellPrice!);
	let left = value;
	for (const item of treasures) {
		const count = Math.floor(left / item.sellPrice!);
		if (count) { giveEquipment(run, content, random, item.id, count); left -= count * item.sellPrice!; }
	}
	run.money += left;
}
export function adventureView(run: RogueRun, now = Date.now()) {
	const event = run.node!.event!;
	const option = (id: string, name: string, text = '', disabled = false) => ({ id, name, text, disabled });
	if (event.stage !== 'choice') return { options: [] };
	if (event.id === 'bandits') return { options: [option('coin', '拼运气的时候到了！'),
		option('fight', '给这个走错片场的家伙一点教训。'), option('plead', '好汉有话好好说。')] };
	if (event.id === 'dice') {
		const fee = Math.round(eventCost(run.floor) * 0.3), price = eventCost(run.floor);
		return { options: [option('roll', '是时候展现真正的技术了。', `入场费 ${fee} 金币；只掷一次。`, run.money < fee),
			option('buy', '我对大奖是什么更加好奇。', `购买费用 ${price} 金币。`, run.money < price),
			option('leave', '这种骗局只有小孩会中招。')] };
	}
	if (!event.fishing) return { options: [option('fishstart', '借我试试！'), option('leave', '今天就看你钓吧。')] };
	return { fishing: { ...event.fishing, now, width: fishingWidth(event.fishing.hits) },
		options: [option('fishtap', '收线'), option('fishfinish', '查看收获')] };
}
function beginFight(run: RogueRun, team: PokemonSet[], text: string, bandits = false) {
	const node = run.node!;
	Object.assign(node.event!, { stage: 'battle', result: [text] });
	delete node.spiritPrepared; delete node.blessingPrepared; delete node.wildLoot;
	node.encounters = [{ name: bandits ? '盗猎集团的头儿' : '被钓起的精英', team, style: 'aggressive', catchable: !bandits,
		...(bandits ? { trainer: { id: 'twofacebandit', name: '盗猎集团的头儿', avatar: 'burglar', role: 'traveller' as const, tera: false } } : {}) }];
	run.encounter = 0; run.phase = 'ready';
}
function fishingReward(account: RogueAccount, run: RogueRun, content: RogueContent, random: RogueRandom) {
	const event = run.node!.event!, landed = event.fishing!.hits;
	const companion = run.blessings?.companions?.some(c => c.id === 'lana');
	const hits = landed ? Math.min(7, landed + (companion ? 1 : 0)) : 0;
	if (landed && companion) (run.notices ||= []).push('【同行训练家 - 水莲】这次钓鱼的收获提高了一档。');
	// The minigame supplies its own payout, including the zero-hit consolation.
	event.trainingAidBlocked = true;
	if (!hits) {
		const coins = 100 + 2 * run.floor;
		run.money += coins;
		finish(run, ['鱼线轻飘飘地收了回来。钓鱼佬拍拍你的肩膀：「第一次嘛，正常！这个拿着，就当今天的收获。」', `获得 ${coins} 金币。`]);
		return;
	}
	if (random(100) < 30) {
		loot(run, content, random, Math.round(budget(run.floor) * (0.5 + hits * 0.3)));
		finish(run, ['鱼钩上挂着一个湿漉漉的藏宝袋。你和钓鱼佬一起拆开，把里面的东西收进背包。']);
		return;
	}
	const level = Math.max(5, Math.min(100, Math.ceil(run.floor / 2)));
	const common = ['Magikarp', 'Goldeen', 'Poliwag', 'Tentacool', 'Finneon', 'Remoraid', 'Barboach', 'Carvanha',
		'Feebas', 'Basculin', 'Krabby', 'Corphish', 'Buizel', 'Chinchou', 'Horsea', 'Shellder', 'Staryu', 'Skrelp',
		'Clauncher', 'Qwilfish', 'Frillish', 'Tympole', 'Arrokuda', 'Chewtle', 'Wooper', 'Alomomola'];
	const rare = ['Dratini', 'Lapras', 'Relicanth', 'Dondozo', 'Tatsugiri', 'Wishiwashi', 'Wailmer', 'Lanturn',
		'Mantine', 'Bruxish', 'Corsola', 'Sharpedo', 'Kingdra', 'Dragalge', 'Clawitzer', 'Milotic', 'Gyarados',
		'Gorebyss', 'Huntail', 'Barraskewda', 'Drednaw', 'Jellicent', 'Veluza', 'Golisopod'];
	const special = ['Suicune', 'Keldeo', 'Manaphy', 'Walking Wake'];
	const roll = random(1000), pool = hits >= 4 && roll < (hits - 3) * 5 ? special : roll < hits * 70 ? rare : common;
	const mon = drawBlessingGift(run, content, random, { pool: pool.filter(s => content.unlocks[toID(s)]), level, eligibleStage: true, legendaryReward: pool === special });
	for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) mon.set.ivs[stat] = Math.max(mon.set.ivs[stat], 20 + hits);
	if (random(10000) < hits * 5) mon.set.shiny = true;
	const elite = random(100) < 8 + 3 * hits;
	mon.set.ability = randomEncounterAbility(mon.set.species, random, elite);
	mon.abilityPool = [{ id: toID(mon.set.ability), hidden: dex.species.get(mon.set.species).abilities.H === mon.set.ability }];
	rebuildMember(mon, run.boosts); mon.hp = mon.maxhp;
	if (elite) {
		// Fishing quality already raises the IV floor; an elite is not automatically perfect.
		beginFight(run, [mon.set], '鱼竿猛地一沉！被拉上岸的精英甩了甩尾巴，摆出战斗姿势。钓鱼佬退到一旁：「拿下这条大家伙，我再送你一份好东西！」');
		// Its saved shiny roll and IVs belong to this catch, not a second wild roll.
		run.node!.spiritPrepared = true;
	} else {
		gift(account, run, content, mon, '永不空军！');
		finish(run, ['浮标一下沉入水中。你收起鱼竿，一只宝可梦跟着跃上了岸。', '钓鱼佬笑着竖起拇指：「不错！看来它很喜欢你。」']);
	}
}
export function chooseAdventure(account: RogueAccount, run: RogueRun, content: RogueContent, random: RogueRandom,
	choice: string, now = Date.now()) {
	const event = run.node!.event!;
	if (event.id === 'bandits') {
		if (choice === 'fight') {
			const level = Math.min(100, Math.max(5, Math.ceil(run.floor / 2) + 3));
			beginFight(run, themedEventTeam('bandits', level, 3, random),
				'你挣开束缚，抛出了精灵球。「看来你想选第三种结果。」男人收起硬币，招呼手下一起动手。', true);
		} else if (choice === 'coin' && (ownsBlessing(run.blessings, 'dice') || random(2) === 0)) {
			event.trainingAidBlocked = true;
			finish(run, ['「叮！」硬币稳稳落在手背上，正面朝上。男人挥了挥手，这伙人居然真的放你走了。']);
		} else {
			const lost = lose(run, 0.6);
			finish(run, [choice === 'coin' ? '硬币反面朝上。这伙人立即开始搜刮你的背包。' :
				'你还没说完，后脑就挨了一下。等你醒来，马车和山贼都已不见。', `损失 ${lost} 金币。`]);
		}
	} else if (event.id === 'dice') {
		event.trainingAidBlocked = true;
		if (choice === 'leave') { finish(run, ['你摇摇头，离开了摊位。']); return; }
		if (choice === 'buy') {
			run.money -= eventCost(run.floor);
			loot(run, content, random, Math.round(budget(run.floor) * 1.15));
			finish(run, ['摊主凑到你耳边：「大奖也能直接买，算你便宜点。」你还没反应过来，手里已经多了一个包裹。']);
			return;
		}
		const fee = Math.round(eventCost(run.floor) * 0.3), face = ownsBlessing(run.blessings, 'dice') ? 6 : random(6) + 1;
		run.money -= fee;
		if (face === 6 || face === 1) loot(run, content, random, fee * (face === 6 ? 4 : 2));
		else recordNegativeBlessingEvent(run, 'outcome');
		finish(run, [`你交了 ${fee} 金币，摇响骰盅。打开后，是 ${face} 点。`,
			face === 6 ? '摊主的笑容僵了一下，还是把大奖递了过来。' : face === 1 ?
				'「最小点数也有奖！」摊主递来一份小些的奖品。' : '「差一点，再来……」你摆摆手。今天就到这里了。']);
	} else if (choice === 'leave') {
		event.trainingAidBlocked = true; finish(run, ['你在岸边看了一会儿，向钓鱼佬挥手道别。']);
	} else if (choice === 'fishstart') {
		event.fishing = { started: now, anchor: now, travel: 0, hits: 0, misses: 0, lastTap: 0, center: 0.35 + random(301) / 1000 };
	} else {
		const fish = event.fishing!;
		const frame = fishingFrame(fish, now);
		if (frame.progress >= 1 || fish.hits >= 6) { fishingReward(account, run, content, random); return; }
		if (choice === 'fishfinish') throw new Error('鱼线还没收完。');
		if (now - fish.lastTap < 1000) return;
		fish.lastTap = now;
		if (Math.abs(frame.cursor - fish.center) <= fishingWidth(fish.hits) / 2) {
			fish.travel += Math.max(0, now - fish.anchor) * 2 / fishingPeriod(fish.hits);
			fish.anchor = now; fish.hits++;
			fish.center = 0.2 + random(601) / 1000;
			fish.feedback = '收得漂亮！';
			if (fish.hits === 6) fishingReward(account, run, content, random);
		} else { fish.misses++; fish.feedback = '再看准一点。'; }
	}
}
export function settleAdventure(run: RogueRun, content: RogueContent, random: RogueRandom, won: boolean) {
	if (run.node!.event!.settled) return;
	if (run.node!.event!.id === 'bandits') {
		if (won) {
			if (offerEventFragments(run, 'bandits', random)) return;
			banditLoot(run, content, random);
			finish(run, ['山贼们横七竖八地倒了一地。你觉得光教训一顿还不够，索性把搜出的财物装进了背包。']);
		} else finish(run, ['猛烈的攻击让你失去了意识。再次醒来，四下只剩风声。', `损失 ${lose(run, 1)} 金币。`]);
	} else {
		const reward = Math.round(budget(run.floor) * 0.4 / 50) * 50;
		if (won) run.money += reward;
		finish(run, won ? ['湖面重新安静下来。钓鱼佬抹了把汗：「这可真是条大家伙！说好了，这份奖励归你。」', `额外获得 ${reward} 金币。`] :
			['宝可梦跃回水中。钓鱼佬连忙把你拉远：「这条太凶了，下次换个地方！」']);
	}
}
export function banditLoot(run: RogueRun, content: RogueContent, random: RogueRandom) {
	loot(run, content, random, budget(run.floor) * 3);
}
