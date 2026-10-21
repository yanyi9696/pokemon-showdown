import { Dex } from '../../sim/dex';
import type { RogueRun, RogueContent } from './types';
import type { RogueRandom } from './biome-pools';
import { featheredSpecies, mushroomSpecies } from './nature-collections';
import { companionOwned, companionSource } from '../../sim/rogue-companions';
import { candyAtFloor, eventRewardBudget, journeyCoins } from './early-balance';
import { FOSSILS } from './economy';

export interface SkiState {
	started: number; checked: number; lane: number; ended?: number; crashed?: boolean;
	obstacles: { at: number, lane: number, kind: string }[];
}
export const SKI_DURATION = 15000;
export const collectionEvent = (id: string) => ['skiing', 'stones', 'feathers', 'mushroomcollector'].includes(id);
const option = (id: string, name: string, text = '', disabled = false) => ({ id, name, text, disabled });
export const stonePrice = (floor: number) => 350 + floor * 8;
const finish = (run: RogueRun, result: string[]) =>
	Object.assign(run.node!.event!, { stage: 'result', settled: true, result });
const give = (run: RogueRun, item: string, count: number) => { run.bag[item] = (run.bag[item] || 0) + count; };
export function collectionView(run: RogueRun, now = Date.now()) {
	const event = run.node!.event!;
	if (event.stage !== 'choice') return { options: [] };
	if (event.id === 'skiing') {
		if (!event.ski) return { options: [
			option('skistart', '穿好护具，滑向山脚！', '方向键或左右按钮换道；坚持 15 秒，撞上障碍即结束。'),
			option('leave', '先在山脚欣赏雪景。'),
		] };
		return { ski: { ...event.ski, now, duration: SKI_DURATION },
			options: [option('skileft', '向左'), option('skiright', '向右'), option('skitick', '继续滑行')] };
	}
	if (event.id === 'stones') {
		const price = stonePrice(run.floor);
		return { options: [option('stone:1', '只开一块', `${price} 金币；可能没有收获。`, run.money < price),
			option('stone:5', '连开五块', `${price * 5} 金币；每块独立开出物品或空石。`, run.money < price * 5),
			option('stonefinish', event.stonesOpened ? '收好东西，结束赌石。' : '今天先不买。')] };
	}
	if (event.id === 'feathers') return { options: [
		option('feathertrade', '用美丽之羽交换训练羽毛', '5 根【美丽之羽】换 6 根随机能力羽毛。', (run.bag.prettyfeather || 0) < 5),
		...run.team.filter(m => !m.egg && featheredSpecies(m.set.species)).map(m => option(`show:${m.id}`, `展示 ${m.set.species}`)),
		option('leave', '把这次机会留到下次。')] };
	return { options: [
		...run.team.filter(m => !m.egg && mushroomSpecies(m.set.species)).map(m => option(`show:${m.id}`, `展示 ${m.set.species}`)),
		option('collectorshop', '看看蘑菇的回收价', '所有蘑菇按普通兑换价的 125% 回收。')] };
}

/** Replay elapsed crossings before changing lanes: delayed packets cannot dodge past obstacles. */
export function advanceSki(ski: SkiState, now: number) {
	if (ski.ended !== undefined) return;
	const elapsed = Math.max(ski.checked, Math.min(SKI_DURATION, now - ski.started));
	const hit = ski.obstacles.find(o => o.at > ski.checked && o.at <= elapsed && o.lane === ski.lane);
	if (hit) {
		ski.ended = hit.at; ski.crashed = true;
	} else if (elapsed >= SKI_DURATION) {
		ski.ended = SKI_DURATION;
	}
	ski.checked = elapsed;
}
export function chooseCollection(
	run: RogueRun, content: RogueContent, random: RogueRandom, choice: string, now = Date.now()
) {
	const event = run.node!.event!;
	if (event.settled || event.stage !== 'choice') throw new Error('本次事件已经结束。');
	if (!collectionView(run, now).options.some(o => o.id === choice && !o.disabled)) throw new Error('当前无法选择这个选项。');
	if (choice === 'leave') { finish(run, ['你向对方挥手道别，继续旅程。']); return; }
	if (event.id === 'skiing') {
		if (choice === 'skistart') {
			if (event.ski) throw new Error('这次滑行已经开始。');
			const obstacles: SkiState['obstacles'] = [];
			for (let at = 1800; at < SKI_DURATION; at += Math.round(850 - 350 * at / SKI_DURATION)) {
				obstacles.push({ at, lane: random(3), kind: random(2) ? 'tree' : 'rock' });
			}
			event.ski = { started: now, checked: 0, lane: 1, obstacles };
			return;
		}
		const ski = event.ski!;
		advanceSki(ski, now);
		if (ski.ended === undefined) {
			if (choice === 'skileft') ski.lane = Math.max(0, ski.lane - 1);
			if (choice === 'skiright') ski.lane = Math.min(2, ski.lane + 1);
			return;
		}
		const tier = Math.min(5, Math.floor(ski.ended / (SKI_DURATION / 5)) + (companionOwned(run.blessings, 'grusha') ? 1 : 0));
		const coins = Math.round(eventRewardBudget(run.floor) * (0.1 + tier * 0.16));
		run.money += coins;
		const candies = Math.max(tier ? 1 : 0, tier - (run.floor < 60 && tier >= 3 ? 1 : 0));
		if (candies) give(run, candyAtFloor(run.floor), candies);
		if (tier >= 4) give(run, 'revive', 1);
		finish(run, [ski.crashed ? '雪板撞上障碍，身后的雪浪扑了上来。巡山员把你从松软的雪里拉出，拍掉你帽子上的积雪。' : '你越过终点，身后的雪浪停在防护坡外。巡山员朝你挥起了旗子。',
			`本次坚持 ${(ski.ended / 1000).toFixed(1)} 秒，收获 ${coins} 金币${tier ? `与经验糖果 ×${candies}` : ''}${tier >= 4 ? '、活力碎片 ×1' : ''}。`,
			...(companionOwned(run.blessings, 'grusha') ? [`${companionSource('grusha')}奖励品质提高一档。`] : [])]);
		return;
	}
	if (event.id === 'stones') {
		if (choice === 'stonefinish') { finish(run, ['「下次再来啊！」摊主还想说些什么，你已经收好行囊，走出了集市。']); return; }
		const count = Number(choice.split(':')[1]), price = stonePrice(run.floor) * count;
		if (![1, 5].includes(count) || run.money < price) throw new Error('开石数量或金币不足。');
		run.money -= price; event.stonesOpened = (event.stonesOpened || 0) + count;
		const prizes: Record<string, number> = {};
		const pool = content.items.filter(i => i.id !== 'linkingcord' && (i.kind === 'evolution' ||
			i.kind === 'treasure' && (/pearl|nugget|star|comet/.test(i.id) || FOSSILS.some(f => f.id === i.id)) ||
			i.kind === 'held' && !i.id.startsWith('fantasy')));
		for (let i = 0; i < count; i++) {
			const roll = random(100), boosted = !!companionOwned(run.blessings, 'olivia');
			if (roll < 50) continue;
			const high = roll >= (boosted ? 90 : 95);
			const options = pool.filter(p => high ?
				!!Dex.mod('gen9fantasy').items.get(p.id).megaStone || (p.sellPrice || p.price) >= 2000 :
				!Dex.mod('gen9fantasy').items.get(p.id).megaStone && (p.sellPrice || p.price) <= 1800);
			if (!options.length) continue;
			const item = options[random(options.length)]; give(run, item.id, 1); prizes[item.name] = (prizes[item.name] || 0) + 1;
		}
		const prizeText = Object.keys(prizes).length ?
			'开出了：' + Object.entries(prizes).map(([name, n]) => `【${name}】×${n}`).join('、') : '这次都是空石';
		event.result = [`石锤敲落最后一片碎屑。支付 ${price} 金币，${prizeText}。`,
			'「再看看这一块？纹路可漂亮了！」摊主又将几块原石推到面前。你摸了摸钱袋，决定是否继续。'];
		return;
	}
	if (event.id === 'feathers') {
		if (choice === 'feathertrade') {
			if ((run.bag.prettyfeather || 0) < 5) throw new Error('美丽之羽不足。');
			run.bag.prettyfeather -= 5;
			const pool = ['healthfeather', 'musclefeather', 'resistfeather', 'geniusfeather', 'cleverfeather', 'swiftfeather'];
			for (let i = 0; i < 6; i++) give(run, pool[random(6)], 1);
			finish(run, ['「这些纹路太漂亮了！」爱好者小心地将羽毛夹进册子，把 6 根能力羽毛交给了你。']);
		} else {
			if (!run.team.some(m => m.id === choice.slice(5) && featheredSpecies(m.set.species))) throw new Error('这位伙伴不符合羽毛观察条件。');
			const coins = journeyCoins(run.floor, 150 + run.floor * 3); run.money += coins; give(run, 'prettyfeather', 3);
			finish(run, ['爱好者认真画下羽毛的形状，连声道谢：「原来近看是这样的纹路！」', `获得 ${coins} 金币与【美丽之羽】×3。`]);
		}
		return;
	}
	if (choice.startsWith('show:')) {
		if (!run.team.some(m => m.id === choice.slice(5) && mushroomSpecies(m.set.species))) throw new Error('请展示蘑菇宝可梦。');
		give(run, 'tinymushroom', 3); run.money += journeyCoins(run.floor, 100 + run.floor * 2);
		(run.notices ||= []).push('收藏家赞叹着伙伴的菌伞，赠送【小蘑菇】×3 和一小笔观察谢礼。');
	}
	event.settled = true; run.phase = 'rest';
}
