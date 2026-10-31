import { BLESSING_STAGES, BLESSING_TYPES, EMBLEM_HELP, STAGED_BLESSING_FAMILIES, blessingTitle, blessingStage,
	blessingCoins, medicRecovery, lateBlessingReward, emblemDescription, taskRewardTier, type BlessingDefinition } from '../../sim/rogue-blessing-data';
import { COMPANIONS, companionFamily, companionFamilyTypes, companionPreferenceText, type CompanionID } from '../../sim/rogue-companions';
import { tonicDescription } from '../../sim/rogue-blessing-permanent';
import { bracketMoveCategories } from './move-categories';

/** Supplies without a standard held-item Dex entry still use their Rogue rules in reference help. */
export const BLESSING_SUPPLY_HELP = [
	{ id: 'rogueemblemhelp', name: '属性转', description: EMBLEM_HELP },
	...Object.entries(BLESSING_TYPES).map(([type, name]) => ({ id: 'rogueemblem' + type.toLowerCase(), name: name + '属性转', description: emblemDescription(type) })),
	{ id: 'roguefantasyshard', name: '幻想碎片', description: '每集齐 100 片，可让一名符合条件的伙伴幻想化。碎片可继续积攒，本局使用。' },
	{ id: 'rogueexpcandy', name: '经验糖果', description: '为选定伙伴增加经验；具体经验量由 XS、S、M、L、XL 规格决定。' },
	{ id: 'rogueterashard', name: '太晶碎片', description: '按属性存入背包。同一属性集齐 50 片，可在战斗外将一名伙伴的太晶属性改为该属性；不会直接解锁太晶化系统。' },
	{ id: 'roguetoolbox', name: '工具箱', description: '打开后展示四件随机装备，从中选择一件。' },
	{ id: 'rogueadvancedtoolbox', name: '高级工具箱', description: '从四件随机装备中选择一件；比普通工具箱提供更多常用对战装备候选。' },
	{ id: 'roguetreasurebag', name: '藏宝袋', description: '随机获得 3～6 组旅途物资，奖励随所在层数提升。' },
];

/** Player copy shared by selection cards, the codex, owned blessings and new clear cards. */
export function blessingDisplay(def: BlessingDefinition, floor?: number, tonicSecret = false, lockedType?: string) {
	let text = def.text;
	if (def.family === 'money' || def.family === 'bigmoney') text = `立即获得 ${blessingCoins(def.family, floor || 1)} 金币。`;
	if (def.family === 'medic') text = `每次战斗获胜后，存活伙伴恢复 ${medicRecovery(floor || 1)}% 最大 HP，并解除异常状态。与【进球休息】互斥。`;
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
		const coins = { silver: 800, gold: 1800, prismatic: 3600 }[def.tier];
		text = `获得 1 个随机${{ silver: '白银', gold: '黄金', prismatic: '棱彩' }[def.tier]}阶祝福，` + (floor ?
			`额外获得 ${coins * Math.max(1, blessingStage(floor))} 金币。` :
			`额外金币：第 1／50 层 ${coins}，第 100 层 ${coins * 2}，第 150 层 ${coins * 3}。`);
	}
	if (['wine', 'cephalosporin'].includes(def.family)) text = `获得 1 份【${def.name}】，使用后消耗。` + tonicDescription(def.family, tonicSecret);
	if (def.emblem && def.type) {
		text = `获得【${BLESSING_TYPES[def.type]}属性转】×1。` + (def.family === 'typexp' ?
			`${BLESSING_TYPES[def.type]}属性伙伴的对战经验提升 50%。` :
			`全队${BLESSING_TYPES[def.type]}属性招式威力提升 50%；本场每有同属性伙伴倒下一次，再增加 5 个百分点，复活后再次倒下同样计数。`);
	}
	if (def.family === 'typeevolution' && def.type === 'Fighting') text = text.replace('第 50／100／150 层可重选方向并立即强化', '第 50／100／150 层先按原方向强化，再重选方向并立即额外强化一次');
	if (def.family === 'regis') text = text.replace(/(?<!【)属性转/g, '【属性转】');
	const reward = lateBlessingReward(def.family, floor || 1);
	if (reward.treasure) text += '立即获得【藏宝袋】×1，随机开出 3～6 组物资，层数越高越丰厚。';
	if (reward.toolboxes) text += `立即获得【${reward.advanced ? '高级工具箱' : '工具箱'}】×${reward.toolboxes}，每个可从四件随机装备中选一件。`;
	if (companionFamily(def.family)) {
		text = text.replace(/累计[^。]*【同行训练家的赠礼】。/g, '');
		text = text.replace(/，偏好[^。]*。/g, '。');
		const people = (Object.keys(COMPANIONS) as CompanionID[]).filter(id => COMPANIONS[id].family === def.family);
		text += '\n路线或遭遇出现选项时，可咨询同行训练家的意见。' + people.map(companionPreferenceText).join('');
		text += '\n同行、专属奇遇与偏好回应提升本局好感度。达到 50／100 点，各触发一次专属赠礼与对话；新一局重新积累。旅途中还可能获赠少量补给。';
	}
	if (text.includes('最强')) {
		text += '\n' + (['dragonking', 'veteransniper'].includes(def.family) ?
			'“最强”按符合条件的在队伙伴的六项常驻能力值总和判定，不计战斗中的临时能力变化；相同时取较早入队者。' :
			'“最强”在符合条件的在队伙伴中，依次比较等级、努力值总和、个体值总和与亲密度；均相同时取较早入队者。');
	}
	// These are explicit supply names, not an unrestricted word matcher (e.g. ordinary “免疫”).
	text = text.split(/(【[^】]+】)/g).map(part => part.startsWith('【') ? part :
		part.replace(/幻想碎片|太晶碎片|经验糖果|小蘑菇|大蘑菇|芳香蘑菇|土地云/g, name => `【${name}】`)).join('');
	if (def.family === 'unity' && lockedType) text = `锁定属性：${BLESSING_TYPES[lockedType] || lockedType}。\n${text}`;
	return { ...def, name: floor ? blessingTitle({ id: def.id, floor }) : def.name, text: bracketMoveCategories(text) };
}

export function blessingCodexFloors(def: BlessingDefinition): (number | undefined)[] {
	return STAGED_BLESSING_FAMILIES.includes(def.family) ? [...BLESSING_STAGES] : [undefined];
}

/** Acquisition conditions belong beside the title, never inside effect copy. */
export function blessingAvailabilityNotes(def: BlessingDefinition): string[] {
	const notes: string[] = [];
	if (companionFamily(def.family)) {
		const types = companionFamilyTypes(def.family);
		if (types.length) notes.push(`队伍需有${types.map(t => BLESSING_TYPES[t] + '系').join('或')}伙伴`);
		notes.push('与其他同行训练家祝福互斥');
		if (types.length === 1) notes.push(`队内有至少两只${BLESSING_TYPES[types[0]]}系伙伴时更容易出现`);
		if (types.length === 2) notes.push(`队内分别有${types.map(t => BLESSING_TYPES[t] + '系').join('与')}伙伴时更容易出现`);
	}
	const conditions: Record<string, string[]> = {
		monkeyking: ['队伍需有【烈焰猴】，幻想形态同样符合'],
		unity: ['队伍需有至少两名非蛋伙伴，且所有非蛋伙伴拥有共通属性；多个共通属性可自选其一'],
		galarlegend: ['队伍需有【无极汰那】'], originaldragon: ['队伍需有【酋雷姆】'],
		reorganizer: ['队伍需有至少一位可参与重组、尚未满星的伙伴'],
		ghidorah: ['队伍需有【三首恶龙】，幻想形态同样符合'],
		latebloom: ['队伍需有大器晚成谱系伙伴，幼年、地区与幻想形态同样符合；蛋不计入'],
		killlagirl: ['第 150 层及以后', '需同时拥有【神衣鲜血】和【神衣纯洁】；出现彩色选项时保证包含本祝福'],
		speedpower: ['队伍需有尚未拥有【加速】的伙伴'],
		veteransniper: ['队伍需有尚未拥有【狙击手】的伙伴', '要害射击击倒进度按伙伴分别保存；逃跑不累计'],
		medic: ['与【进球休息】互斥'], restinball: ['与【自带医疗队】互斥'],
		compound: ['队伍需有完整进化链、最终进化型种族值总和不超过 500 的伙伴', '已最终进化的伙伴也可选择；每名伙伴限用一次'],
		singer: ['队伍需有【美洛耶塔】', '与【舞！舞！舞！】互斥'],
		dancer: ['队伍需有【美洛耶塔】', '与【宝可世界的歌姬】互斥'],
		swords: ['队伍需有【勾帕路翁】、【代拉基翁】或【毕力吉翁】'],
		topclearmind: ['需已获得【聚集的祈愿】，且此后未在战斗外更换队员'],
		railgun: ['队伍需有可合法学习【电磁炮】的伙伴'],
		rulebreaker: ['队伍需有主特性或额外特性为【破格】的伙伴'],
		hazards: ['队伍需有尚未拥有【岩布阵】的伙伴'],
		toxic: ['队伍需有尚未拥有【不仁不义】的伙伴'],
		powerchoice: ['队伍需有可新增【大力士】或【大法师】的伙伴'],
		pandorasilver: ['与黄金阶【潘多拉的装备】互斥'],
		pandoragold: ['与白银阶【潘多拉的装备】互斥'],
		coin: ['塔灵为【阿尔宙斯的秩序】时不出现'],
	};
	notes.push(...conditions[def.family] || []);
	if (def.family === 'friend') notes.push('当前等级需有本局尚未获得的合法赠送伙伴');
	if (def.family === 'typeevolution') notes.push(`当前等级需有可获得的${BLESSING_TYPES[def.type!]}系伙伴`);
	if (def.family === 'overtime') notes.push('当前等级需有符合该天气、场地或招式要求的合法伙伴');
	if (def.emblem && def.family !== 'regis') notes.push('与其他赋予属性转的祝福互斥，【传说的巨人们】除外');
	return notes;
}

const nameCollator = new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity: 'base', ignorePunctuation: true, numeric: true });
export function compareBlessingNames(a: { name: string, variantFloor?: number }, b: { name: string, variantFloor?: number }) {
	return nameCollator.compare(a.name.replace(/\++$/, ''), b.name.replace(/\++$/, '')) || (a.variantFloor || 0) - (b.variantFloor || 0);
}
