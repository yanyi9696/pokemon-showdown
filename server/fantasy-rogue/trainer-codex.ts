import { RIVALS, RIVAL_SNACK_GIFTS } from './rival-data';
import {
	COMPANIONS, companionHasGift, companionGiftOptions, companionPreferenceText, type CompanionID,
} from '../../sim/rogue-companions';
import { ROGUE_BLESSINGS } from '../../sim/rogue-blessing-data';
import { COMPANION_GIFT_LINES } from './companion-dialogue';
import { TrainerBossData } from './trainer-boss-data';
import { POLICE_REGIONS, STAR_BOSSES } from './police-data';
import { TRAVELLING_TRAINERS } from './travelling-trainers';
import { TRAVELLERS } from './traveller-profiles';

export function trainerCodex() {
	const people = new Map<string, {
		id: string, name: string, portrait: string, category: string, roles: string[], unlocked: boolean, text: string,
	}>();
	const add = (id: string, name: string, role: string, text: string) => {
		const entry = people.get(id) || {
			id: `trainer:${id}`, name, portrait: id, category: 'trainer', roles: [], unlocked: true, text: '',
		};
		if (!entry.roles.includes(role)) { entry.roles.push(role); entry.text += text; }
		people.set(id, entry);
	};
	for (const [id, c] of Object.entries(COMPANIONS)) {
		const key = id as CompanionID;
		const def = ROGUE_BLESSINGS.find(b => b.family === c.family)!;
		add(id, c.name, 'companion', '事件、遭遇、奖励等区域出现选项时均可咨询。' + companionPreferenceText(key) +
		(companionHasGift(key) ? `累计 15 次${id === 'lana' ? '进入钓鱼' : id === 'olivia' ? '完成赌石事件' : '偏好选择'}，本局获得一次【同行训练家的赠礼】：` +
		companionGiftOptions(key).map(g => `【${g.name}】`).join('或') + `×1${id === 'acerola' ? '（二选一）' : ''}，对应属性招式威力 ×1.2。` +
		`「${COMPANION_GIFT_LINES[key]}」` : '提供战斗预演，没有偏好赠礼。') + `对应祝福：【${def.name}】。`);
		people.get(id)!.category = 'companion'; people.get(id)!.id = `companion:${id}`;
	}
	for (const [id, rival] of Object.entries(RIVALS)) add(id, rival.name, 'rival', `来自${rival.region}的劲敌。前 20 层初识后锁定八段奇遇，至少间隔 10 层重逢，约 100、150 层迎来进阶与最终切磋。交谈与合作提升熟悉度，每局可短期同行一次、持续 5～8 层；短期没有偏好计数，告别自动赠送【${RIVAL_SNACK_GIFTS[id as keyof typeof RIVALS].name}】×1，最终无论胜负都会提出永久同行邀请。`);
	for (const trainer of TrainerBossData) add(trainer.id, trainer.name.replace(/[（(].*$/, ''), trainer.role,
		trainer.role === 'gym' ? '以道馆馆主身份在塔中接受挑战。战胜后会认可你的实力，并恢复队伍状态。' :
		trainer.role === 'elitefour' ? '塔中四天王之一，使用自己擅长的阵容检验训练家的战术。' : '塔中的冠军挑战者，会全力回应你与伙伴的默契。');
	for (const region of Object.values(POLICE_REGIONS)) add(region.boss, region.bossName, 'antagonist',
		`与${region.name}的${region.group}相关。在治安协助的后续遭遇中可能亲自出战。`);
	for (const boss of STAR_BOSSES) add(boss.id, boss.name, 'antagonist',
		boss.id === 'penny' ? '天星队风波的最后一位挑战者。她会坦白自己的身份，并承诺解决伙伴们造成的麻烦。' :
		'天星队帮班首领。在治安协助的连续后续中，按皮拿、梅洛可、秋明、奥尔迪加、枇琶的顺序接受挑战。');
	const others: [string, string, string, string][] = [
		['carmine', '丹瑜', 'rival', '乌栗的姐姐。乌栗奇遇线中独立积累好感，可以短期同行；高好感完成最终章后可邀请永久同行。临别会赠送诅咒之符，乌栗仍是这条奇遇的主要劲敌。'],
		['jenny', '君莎', 'other', '负责旅途治安，邀请训练家协助制止各地闹事者，并在完成协助后赠送谢礼。'],
		['mewtwo', '幻想超梦', 'other', '第 200 层的特殊对手。先指挥五名伙伴，待它们全部倒下后亲自出战。'],
		['clover', '阿竹', 'antagonist', '洗翠野贼三姐妹之一，会在治安协助中出场。'],
		['coin', '阿梅', 'antagonist', '洗翠野贼三姐妹之一，会在治安协助中出场。'],
		...Object.entries({
			rocket: '火箭队', magma: '熔岩队', aqua: '海洋队', galactic: '银河队', plasma: '等离子队', flare: '闪焰队',
			skull: '骷髅队', yell: '呐喊队', teamstar: '天星队',
		})
			.map(([id, name]): [string, string, string, string] => [id, name + '队员', 'antagonist', `在治安协助遭遇中出现的${name}成员。`]),
	];
	for (const [id, name, role, text] of others) add(id, name, role, text);
	for (const trainer of TRAVELLING_TRAINERS) add(trainer.id, trainer.name, 'other', `旅途中的${trainer.name}，使用符合职业与兴趣的宝可梦队伍。「${trainer.line}」`);
	for (const person of Object.values(TRAVELLERS)) {
		const entry = people.get(person.id);
		if (!entry) throw new Error(`同行人物尚未收录图鉴：${person.id}`);
		if (!entry.roles.includes('companion')) entry.roles.push('companion');
		const area = {wild: '战斗', elite: '精英', reward: '奖励', trade: '交易', event: '事件'};
		entry.text += ` 常驻同行时偏好${person.region}相关、或${{battle: '战斗', reward: '奖励', pokemon: '宝可梦'}[person.preference]}取向的选项，喜欢${person.areas.map(id => area[id as keyof typeof area]).join('、')}区域。` +
			`普通常驻同行累计听从 15 次偏好选择，赠送${person.gifts.map(g => `【${g.name}】`).join('或')}×1。全部同行共用两个名额。`;
	}
	return [...people.values()];
}
