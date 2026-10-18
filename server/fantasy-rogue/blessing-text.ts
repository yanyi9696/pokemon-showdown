import { BLESSING_STAGES, BLESSING_TYPES, STAGED_BLESSING_FAMILIES, blessingTitle, blessingStage,
	blessingCoins, medicRecovery, lateBlessingReward, emblemDescription, taskRewardTier, type BlessingDefinition } from '../../sim/rogue-blessing-data';
import { tonicDescription } from '../../sim/rogue-blessing-permanent';

/** Player copy shared by selection cards, the codex, owned blessings and new clear cards. */
export function blessingDisplay(def: BlessingDefinition, floor?: number, tonicSecret = false) {
	let text = def.text;
	if (def.family === 'money' || def.family === 'bigmoney') text = `立即获得 ${blessingCoins(def.family, floor || 1)} 金币。`;
	if (def.family === 'medic') text = `每场获胜或捕捉成功后，存活伙伴恢复 ${medicRecovery(floor || 1)}% 最大 HP，并解除异常状态。`;
	if (['battletask', 'eventtask'].includes(def.family)) {
		const reward = taskRewardTier(floor || 1), grade = reward.candy.slice(8).toUpperCase();
		const candy = `【经验糖果 ${grade}】×${reward.candyCount}`;
		const equipment = ['【工具箱】×1', '【工具箱】×1', '【高级工具箱】×1', '【工具箱】×2'][reward.stage];
		const bonus = reward.itemCoins ? `及 ${reward.itemCoins} 金币` : '';
		const kind = def.family === 'battletask' ? '战斗' : '事件';
		text = `路线选项必有${kind}。累计完成 5 个${kind}区域获得 ${reward.coins} 金币，10 个获得【经验糖果 ${grade}】×${reward.milestoneCandy}，` +
			`15 个随机获得以下一项：${candy}、【藏宝袋】×1、${equipment}、随机幻想通用道具×1${bonus}、幻想碎片×${reward.shards}，或 1 只随机伙伴。各阶段奖励限领一次。`;
	}
	if (['reservation', 'reservemega', 'reservegmega', 'reservetera', 'reservez'].includes(def.family)) text = '立即获得 500 金币。' + text;
	if (def.family === 'reservation') text += '若提前花碎片完成该伙伴的幻想化，通关第 100 层时返还这 100 碎片。';
	if (def.family.startsWith('fate')) {
		const coins = { silver: 800, gold: 1000, prismatic: 1200 }[def.tier];
		text = `获得 1 个随机${{ silver: '白银', gold: '黄金', prismatic: '棱彩' }[def.tier]}阶祝福，` + (floor ?
			`额外获得 ${coins * Math.max(1, blessingStage(floor))} 金币。` :
			`额外金币：第 1／50 层 ${coins}，第 100 层 ${coins * 2}，第 150 层 ${coins * 3}。`);
	}
	if (['wine', 'cephalosporin'].includes(def.family)) text = `获得 1 份【${def.name}】，使用后消耗。` + tonicDescription(def.family, tonicSecret);
	if (def.emblem && def.type) {
		text = '获得 1 个' + emblemDescription(def.type) + (def.family === 'typexp' ?
			`${BLESSING_TYPES[def.type]}属性伙伴的对战经验提升 30%。` :
			`全队${BLESSING_TYPES[def.type]}属性招式威力提升 30%；本场有同属性伙伴倒下后提升至 50%。`);
	}
	if (def.family === 'typeevolution' && def.type === 'Fighting') text = text.replace('第 50／100／150 层可重选方向并立即强化', '第 50／100／150 层先按原方向强化，再重选方向并立即额外强化一次');
	if (def.family === 'regis') text += '属性转不占道具位、可取下；赋予后改变副属性，并开放五个对应招式。';
	const reward = lateBlessingReward(def.family, floor || 1);
	if (reward.treasure) text += '立即获得【藏宝袋】×1，随机开出 3～6 组物资，层数越高越丰厚。';
	if (reward.toolboxes) text += `立即获得【${reward.advanced ? '高级工具箱' : '工具箱'}】×${reward.toolboxes}，每个可从四件随机装备中选一件。`;
	return { ...def, name: floor ? blessingTitle({ id: def.id, floor }) : def.name, text };
}

export function blessingCodexFloors(def: BlessingDefinition): (number | undefined)[] {
	return STAGED_BLESSING_FAMILIES.includes(def.family) ? [...BLESSING_STAGES] : [undefined];
}

const nameCollator = new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity: 'base', ignorePunctuation: true, numeric: true });
export function compareBlessingNames(a: {name: string, variantFloor?: number}, b: {name: string, variantFloor?: number}) {
	return nameCollator.compare(a.name.replace(/\++$/, ''), b.name.replace(/\++$/, '')) || (a.variantFloor || 0) - (b.variantFloor || 0);
}
