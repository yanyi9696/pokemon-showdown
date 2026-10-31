import { randomUUID } from 'crypto';
import { difficultyRewardScale } from '../../sim/rogue-difficulty';
import { dueCatchup, catchupLevels, catchupPlan } from './late-support';
import { personalRewardGrowth } from './growth';
import { giveEgg, eggEventWeight } from './eggs';
import { normalizeBlessings } from './blessings';
import { Dex, toID } from '../../sim/dex';
import { BLESSING_TYPES } from '../../sim/rogue-blessing-data';
import { permanentMemberTypes } from '../../sim/rogue-blessing-permanent';
import type { RogueRandom } from './biome-pools';
import type { RogueContent, RogueRun } from './types';
import {
	CANDY_SHOP, routeCandyReward, earlyCoinMultiplier, journeyIncomeMultiplier, journeyCoins,
} from './early-balance';
import { coinSupplyMultiplier } from './resource-pacing';
import { convertSpiritItem } from './spirits';
import { machineMoves, premiumMachine, tradeItem } from './trading';
import { natureMintSupplies } from './nature-mints';
import { gainExperience, ensureMemberMemory } from './progression';
import { experienceAtLevel, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { availableGrowth, grantGrowth, grantPersonalGrowth, growthPercent, PERSONAL_GROWTH_LIMIT, JOURNEY_GROWTH_START } from './growth';

const dex = Dex.mod('gen9fantasy');
const CANDIES = [['expcandyxl', 30000], ['expcandyl', 10000], ['expcandym', 3000], ['expcandys', 800], ['expcandyxs', 100]] as const;
export const REWARD_SCENES = {
	pprest: { name: '招式补给站', avatar: 'scientist', preference: '' },
	catchup: { name: '每一位伙伴都跟得上', avatar: 'breeder', preference: '' },
	breederegg: { name: '这颗蛋与你有缘', avatar: 'breeder', preference: '' },
	chest: { name: '留给后来的人', avatar: '', preference: '' },
	sketch: { name: '画册还差一页', avatar: 'artist', preference: 'pokemon' },
	research: { name: '招式观察笔记', avatar: 'scientist', preference: 'move' },
	picnic: { name: '多准备的一份', avatar: 'breeder', preference: 'pokemon' },
	coach: { name: '退休教练的课堂', avatar: 'veteran', preference: 'move' },
} as const;
export interface RewardScene {
	id: keyof typeof REWARD_SCENES; key: string; type?: string; demonstrated?: string;
	claimed?: boolean; result?: string; catchupCheckpoint?: number;
	/** Rolled once on entry; replaces repeat stat training with a permanent move or mint item. */
	trainingAlternatives?: string[];
}

export function prepareRewardScene(run: RogueRun, random: RogueRandom) {
	if (run.node?.kind !== 'reward' || run.node.rewardScene) return;
	const last = run.rewardHistory?.[run.rewardHistory.length - 1];
	const candidates: RewardScene['id'][] = ['chest', 'chest', 'sketch', 'research', 'picnic', 'coach', 'catchup'];
	if (run.floor >= 45 && run.floor <= 59) candidates.push('catchup', 'catchup', 'catchup');
	else if (run.floor >= 41 && run.floor <= 80) candidates.push('catchup');
	if (run.floor >= 81) candidates.push('pprest', 'pprest');
	const pool = candidates.filter(id => id !== last &&
		(id !== 'catchup' || catchupPlan(run).length > 0));
	const checkpoint = dueCatchup(run);
	const id: RewardScene['id'] = checkpoint && catchupPlan(run).length ? 'catchup' :
		last !== 'breederegg' && random(100) < eggEventWeight(run.floor) ? 'breederegg' : pool[random(pool.length)];
	run.node.rewardScene = { id, key: randomUUID(),
		...(checkpoint ? { catchupCheckpoint: checkpoint } : {}),
		...(REWARD_SCENES[id].preference ? { type: Object.keys(BLESSING_TYPES)[random(18)] } : {}) };
	if (run.floor >= 61 && !['catchup', 'pprest', 'breederegg'].includes(id) &&
		run.team.some(mon => (mon.training?.offense || 0) + (mon.training?.defense || 0) > 0) && random(100) < 15) {
		const moves = [...new Set(run.team.filter(mon => !mon.egg).flatMap(machineMoves))].filter(premiumMachine);
		const natures = dex.natures.all().filter(nature => nature.plus && nature.minus);
		run.node.rewardScene.trainingAlternatives = [
			...(moves.length ? [`roguetm${moves[random(moves.length)]}`] : []),
			`roguemint${natures[random(natures.length)].id}`,
		];
	}
	run.node.name = REWARD_SCENES[id].name;
	// Reward scenes never inherit an encounter or pay the old supply bundle as well.
	run.node.encounters = [];
	run.node.reward = { money: 0, items: {} };
	run.rewardHistory = [...(run.rewardHistory || []).slice(-4), id];
}

export function rewardExperience(floor: number, enhanced = false) {
	const base = Object.entries(routeCandyReward(floor, 'reward')).reduce((sum, [id, count]) =>
		sum + count * CANDIES.find(([candy]) => candy === id)![1], 0);
	// Preserve the opening budget. Increase the late budget smoothly without advancing candy unlocks.
	const scale = 1 + Math.min(0.75, Math.max(0, floor - 50) / 100);
	return Math.max(100, Math.round(base * scale * (enhanced ? 1.5 : 1) / 100) * 100);
}
export function rewardCandies(floor: number, experience: number) {
	const items: Record<string, number> = {};
	for (const [id, value] of CANDIES) {
		if (CANDY_SHOP[id].floor > floor) continue;
		const count = Math.floor(experience / value);
		if (count) { items[id] = count; experience -= value * count; }
	}
	return items;
}

const moneyBudgets = new Map<string, number>();
function baseRewardMoney(floor: number, enhanced: boolean): number {
	const f = Math.max(1, Math.min(200, Math.floor(floor))), key = `${f}:${enhanced}`;
	const cached = moneyBudgets.get(key);
	if (cached !== undefined) return cached;
	const items = rewardCandies(f, rewardExperience(f, enhanced));
	const value = Object.entries(items).reduce((sum, [id, count]) => sum + count * CANDY_SHOP[id].price, 0);
	// A cheaper newly unlocked candy grade must not make the coin alternative regress.
	// Apply late income after smoothing, so an earlier payout plateau cannot absorb the bonus.
	const multiplier = earlyCoinMultiplier(f) / journeyIncomeMultiplier(f) * coinSupplyMultiplier(f);
	const coins = Math.max(100, Math.round(value * 0.8 * multiplier / 50) * 50,
		f > 1 ? baseRewardMoney(f - 1, enhanced) : 0);
	moneyBudgets.set(key, coins);
	return coins;
}
export function rewardMoney(floor: number, enhanced = false): number {
	return Math.round(journeyCoins(floor, baseRewardMoney(floor, enhanced)) / coinSupplyMultiplier(floor) / 50) * 50;
}

function demonstration(run: RogueRun) {
	const scene = run.node?.rewardScene;
	if (!scene?.type || scene.demonstrated || scene.claimed) return [];
	const preference = REWARD_SCENES[scene.id].preference;
	return run.team.flatMap(mon => {
		if (mon.egg) return [];
		if (preference === 'pokemon') return permanentMemberTypes(mon).includes(scene.type!) ? [{ member: mon.id, move: '' }] : [];
		const move = [...new Set([...mon.set.moves.map(toID), ...(mon.moveMemory || []).map(entry => entry.id),
			...(mon.blessingMoves || [])])].find(id => dex.moves.get(id).exists && dex.moves.get(id).type === scene.type);
		return move ? [{ member: mon.id, move: dex.moves.get(move).name }] : [];
	});
}

export function rewardRecovery(floor: number, enhanced = false): Record<string, number> {
	return { [floor < 29 ? 'potion' : floor < 69 ? 'superpotion' : 'hyperpotion']: (enhanced ? 3 : 2) - (floor < 20 ? 1 : 0),
		...(floor >= 20 || enhanced ? { revive: 1 } : {}), ...(floor > 80 ? { ether: 1 } : {}), ...(floor > 140 ? { elixir: 1 } : {}) };
}
const baseCoins = (floor: number) => Math.round((100 + 8 * floor) * earlyCoinMultiplier(floor));

export function rewardChoices(run: RogueRun) {
	const scene = run.node?.rewardScene;
	if (!scene || scene.claimed) return [];
	if (scene.id === 'pprest') return [{ id: 'pprest', name: '为伙伴补足招式 PP',
		text: '恢复全队所有已掌握招式的 PP，另赠 PP 单项小补剂 ×3 与基础补给。', items: { ether: 3 } }];
	if (scene.id === 'catchup') return [{ id: 'catchup', name: '让落后的伙伴参加特训',
		text: `为落后伙伴补课，每只最多提升 ${catchupLevels(run.floor)} 级，不超过本层训练目标；四只及以上伙伴整体落后时，扩大辅导人数。` +
			catchupPlan(run).map(entry => `【${run.team.find(p => p.id === entry.member)!.set.species}】升至 ${entry.level} 级`).join('，') + '。另有基础补给。' }];
	if (scene.id === 'breederegg') return [{ id: 'egg', name: '接过培育家赠送的蛋', text: '获得一颗随机宝可梦蛋，附带少量金币与回复物资。经过 5～8 层自动孵化。', items: { ether: 1 } }];
	const scale = difficultyRewardScale(run.difficulty, run.floor);
	const enhanced = !!scene.demonstrated, experience = Math.round(rewardExperience(run.floor, enhanced) * scale / 100) * 100;
	const items = rewardCandies(run.floor, experience);
	const money = Math.round(rewardMoney(run.floor, enhanced) * scale);
	const choices: { id: string, name: string, text: string, items?: Record<string, number>, money?: number,
		amount?: number, targets?: { member: string, amount: number }[], disabled?: boolean, }[] = [
		{ id: 'recovery', name: '多备一份药品', text: `额外领取一份回复药${run.floor >= 20 || enhanced ? '、活力碎片' : ''}和 PP 单项小补剂。`,
			items: { ...rewardRecovery(run.floor, enhanced), ether: enhanced ? 2 : 1 } },
		{ id: 'experience', name: '经验糖果', text: `获得共 ${experience} 点经验的糖果，可自由分给伙伴。`, items },
		{ id: 'money', name: '路费', text: `获得 ${money} 金币。`, money },
	];
	for (const kind of run.floor >= JOURNEY_GROWTH_START && !scene.trainingAlternatives ?
		['offense', 'defense'] as const : []) {
		const label = kind === 'offense' ? '攻击、特攻' : '防御、特防';
		const name = kind === 'offense' ? '输出训练' : '耐久训练';
		{
			const base = personalRewardGrowth(run.floor);
			const nominal = base + (enhanced ? 200 : 0);
			const targets = run.team.map(mon => ({ member: mon.id,
				amount: Math.max(0, Math.min(nominal, PERSONAL_GROWTH_LIMIT - (mon.training?.[kind] || 0))) })).filter(entry => entry.amount > 0);
			choices.push({ id: kind, name, targets, disabled: !targets.length,
				text: `选一位伙伴，本局${label}最高 +${growthPercent(nominal)}，升级、进化后仍然有效。` });
		}
	}
	for (const id of scene.trainingAlternatives || []) {
		const item = tradeItem(id);
		if (item) choices.push({ id, name: item.name,
			text: `获得【${item.name}】×1，存入背包后可选择伙伴使用。` +
				(item.kind === 'mint' ? run.floor < 69 ? '另赠好伤药 ×1、PP 单项小补剂 ×2。' : '另赠厉害伤药 ×1。' : ''),
			items: { [id]: 1, ...(item.kind === 'mint' ? natureMintSupplies(run.floor) : {}) } });
	}
	if (run.floor >= 51) {
		const amount = availableGrowth(run, 'experience', enhanced ? 750 : 500);
		choices.push({ id: 'efficiency', name: '经验心得', amount, disabled: !amount,
			text: `全队本局战斗经验 +${growthPercent(amount)}，不影响经验糖果。` });
	}
	const shardFloor = run.floor;
	if (shardFloor >= 80) {
		const amount = 12 + Math.floor((shardFloor - 80) / 10);
		choices.push({ id: 'shards', name: '幻想碎片', amount, text: `获得幻想碎片 ×${amount}，为伙伴积攒幻想的力量。` });
	}
	return choices;
}

export function rewardSceneView(run: RogueRun) {
	const scene = run.node?.rewardScene;
	if (!scene) return;
	const info = REWARD_SCENES[scene.id], type = `【${BLESSING_TYPES[scene.type!] || ''}】`;
	const paragraphs: Record<RewardScene['id'], string[]> = {
		pprest: ['补给站的研究员检查着伙伴们的招式记录。', '「长途战斗最怕关键时刻使不出招式。先把 PP 补足，再带几份补剂走吧！」'],
		catchup: ['培育家铺开训练垫，没有先看你的王牌，而是蹲到队伍后方两位伙伴身边。',
			'「不是谁更差，只是前面的伙伴走得快了些。把它们交给我一会儿吧，下一段路，要一起跟上。」'],
		breederegg: ['培育家将手心贴近蛋壳，仔细听了听，随后笑着望向你。', '「它一见到你就开始晃动。看来你们很有缘！带上这些培育物资，往后的旅程就拜托你照顾它了。」'],
		chest: ['路边放着一个补给箱，上面贴着纸条：「带上需要的那份，路还长着呢。」'],
		sketch: ['画家翻了翻画册，朝你招手。', `「还差一位${type}属性的模特。能让我看看你的伙伴吗？画完再多给你一份谢礼。」`],
		research: ['研究员正整理一叠招式笔记。', `「我想看看${type}属性招式的样子。你的伙伴会的话，给我演示一下吧。谢礼已经备好了。」`],
		picnic: ['野餐桌上多放了几个饭盒。', `「刚好多准备了一份。我最喜欢${type}属性的宝可梦，要是能见上一只，这份礼物还能再加点料。」`],
		coach: ['退休教练收起计时器，示意你过来休息。', `「会不会${type}属性的招式？给我看看，我再教你们一点旅行的窍门。」`],
	};
	return { ...scene, name: info.name, avatar: info.avatar,
		paragraphs: scene.claimed ? [scene.result!] : scene.demonstrated ? ['「就是这个！谢谢啦，谢礼给你换成更好的。挑一份喜欢的吧。」'] : paragraphs[scene.id],
		quality: scene.demonstrated ? '丰厚谢礼' : run.floor < 51 ? '旅途补给' : run.floor < 100 ? '进阶补给' : run.floor < 150 ? '高级补给' : '登顶补给',
		demonstrations: demonstration(run), choices: rewardChoices(run),
		baseText: `每份谢礼均附回复药 ×${(scene.demonstrated ? 3 : 2) - (run.floor < 20 ? 1 : 0)}` +
			(run.floor >= 20 || scene.demonstrated ? '、活力碎片 ×1' : '') + (run.floor > 80 ? '、PP 单项小补剂 ×1' : '') +
			(run.floor > 140 ? '、PP 多项小补剂 ×1' : '') + `，以及 ${baseCoins(run.floor)} 金币。` };
}

export function chooseReward(run: RogueRun, content: RogueContent, random: RogueRandom, value: string, member?: string) {
	const scene = run.node?.rewardScene;
	if (run.phase !== 'reward' || run.node?.kind !== 'reward' || !scene || scene.claimed) throw new Error('当前没有待领取的奖励。');
	if (value === 'show') {
		if (!demonstration(run).some(entry => entry.member === member)) throw new Error('这位伙伴不符合展示要求，或已经展示过了。');
		scene.demonstrated = member;
		return;
	}
	const choice = rewardChoices(run).find(entry => entry.id === value);
	if (!choice || choice.disabled) throw new Error('当前不能领取这项奖励。');
	let effect = choice.text;
	if (value === 'pprest') for (const mon of run.team.filter(p => !p.egg)) {
		ensureMemberMemory(mon);
		for (const slot of [...mon.pp, ...mon.moveMemory || [], ...mon.blessingPP || []]) slot.pp = slot.maxpp;
	}
	if (value === 'catchup') {
		const partners = catchupPlan(run);
		const trained: string[] = [];
		for (const { member: memberId, level } of partners) {
			const p = run.team.find(mon => mon.id === memberId)!;
			const total = experienceAtLevel(rogueSpeciesData(p.set.species).growth, level);
			gainExperience(run, p, Math.max(0, total - (p.experience ?? experienceAtLevel(rogueSpeciesData(p.set.species).growth, p.set.level))));
			trained.push(`${p.set.species} → Lv.${p.set.level}`);
		}
		effect = `特训结束：${trained.join('；')}。`;
	} else if (value === 'offense' || value === 'defense') {
		{
			const target = choice.targets?.find(entry => entry.member === member);
			const mon = run.team.find(entry => entry.id === member);
			if (!target || !mon) throw new Error('请先选择本次训练的伙伴。');
			grantPersonalGrowth(run, mon, value, target.amount);
			effect = `【${mon.set.species}】本局${value === 'offense' ? '攻击、特攻' : '防御、特防'} +${growthPercent(target.amount)}。`;
		}
	} else if (value === 'efficiency') grantGrowth(run, 'experience', choice.amount!);
	else if (value === 'egg') giveEgg(run, content, random, '培育家结缘赠蛋');
	else if (value === 'shards') normalizeBlessings(run).shards += choice.amount!;
	const supplies = rewardRecovery(run.floor, !!scene.demonstrated);
	for (const [id, count] of Object.entries(choice.items || {})) supplies[id] = (supplies[id] || 0) + count;
	const items: Record<string, number> = {};
	for (const [id, count] of Object.entries(supplies)) {
		if (!content.items.some(item => item.id === id) && !tradeItem(id)) continue;
		for (let n = 0; n < count; n++) {
			const received = convertSpiritItem(run, content, id, `reward:${scene.key}:${id}:${n}`, random);
			items[received] = (items[received] || 0) + 1;
		}
	}
	run.node.reward = { money: Math.round(baseCoins(run.floor) * difficultyRewardScale(run.difficulty, run.floor)) + (choice.money || 0), items };
	scene.claimed = true;
	if (scene.catchupCheckpoint) run.catchupCheckpoint = scene.catchupCheckpoint;
	scene.result = effect;
	(run.notices ||= []).push(effect);
}
