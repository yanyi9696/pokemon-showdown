import { affectionThemeGift, AFFECTION_ADVANCED_REWARDS } from './affection-gifts';
import { RIVALS } from './rival-data';
import {
	COMPANIONS, companionPreferenceText, type CompanionID,
} from '../../sim/rogue-companions';
import { ROGUE_BLESSINGS } from '../../sim/rogue-blessing-data';
import { COMPANION_GIFT_LINES } from './companion-dialogue';
import { TrainerBossData } from './trainer-boss-data';
import { POLICE_REGIONS, STAR_BOSSES } from './police-data';
import { TRAVELLING_TRAINERS } from './travelling-trainers';
import { TRAVELLERS } from './traveller-profiles';
import { CHALLENGE_TRAVELLERS } from './challenge-travellers';

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
		const gift = affectionThemeGift(id, 50);
		add(id, c.name, 'companion', '事件、遭遇、奖励等区域出现选项时均可咨询。' + companionPreferenceText(key) +
		`跟随爬塔、专属奇遇与偏好回应均可积累本局好感度。达到 50 时获得【${gift?.name || 'PP 全项小补剂'}】×1；` +
		`达到 100 时获得进阶礼物【${affectionThemeGift(id, 100).name}】×1，以及${AFFECTION_ADVANCED_REWARDS}。两阶段分别触发专属对话，每局各一次，新一局重新积累；50／100 后日常对话也会逐渐亲近。` +
		(COMPANION_GIFT_LINES[key] ? `「${COMPANION_GIFT_LINES[key]}」` : '') + `对应祝福：【${def.name}】。`);
		people.get(id)!.category = 'companion'; people.get(id)!.id = `companion:${id}`;
	}
	for (const [id, rival] of Object.entries(RIVALS)) add(id, rival.name, 'rival',
		`来自${rival.region}的劲敌。前 20 层初识后锁定八段奇遇，至少间隔 10 层重逢，约 100、150 层迎来进阶与最终切磋。交谈与合作提升好感度，每局可短期同行一次、持续 5～8 层；短期没有偏好计数，告别赠送一份恢复药品，专属道具留在 50 好感度赠送，最终无论胜负都会提出永久同行邀请。`);
	for (const trainer of TrainerBossData) add(trainer.id, trainer.name.replace(/[（(].*$/, ''), trainer.role,
		trainer.role === 'gym' ? '以道馆馆主身份在塔中接受挑战。战胜后会认可你的实力，并恢复队伍状态。' :
		trainer.role === 'elitefour' ? '塔中四天王之一，使用自己擅长的阵容检验训练家的战术。' : '塔中的冠军挑战者，会全力回应你与伙伴的默契。');
	for (const region of Object.values(POLICE_REGIONS)) add(region.boss, region.bossName, 'antagonist',
		`与${region.name}的${region.group}相关。在治安协助的后续遭遇中可能亲自出战。`);
	for (const boss of STAR_BOSSES) add(boss.id, boss.name, 'antagonist',
		boss.id === 'penny' ? '天星队风波的最后一位挑战者。她会坦白自己的身份，并承诺解决伙伴们造成的麻烦。' :
		'天星队帮班首领。在治安协助的连续后续中，按皮拿、梅洛可、秋明、奥尔迪加、枇琶的顺序接受挑战。');
	const others: [string, string, string, string][] = [
		['lusamine', '露莎米奈', 'other', '以太基金会代表，莉莉艾与格拉吉欧的母亲。关心孩子和需要帮助的宝可梦，也努力尊重孩子们自己的决定。两人的奇遇第 2、4、6、8 章中会出场；第 4 章起可以邀请同行。也可能在普通事件区域相遇、交谈后邀请同行，不必先完成两人的奇遇。'],
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
		if (CHALLENGE_TRAVELLERS.some(p => p.id === person.id)) add(person.id, person.name, 'challenge',
			`来自${person.region}的训练家。在挑战区域全力切磋，获胜并领取挑战奖励后可邀请同行。`);
		const entry = people.get(person.id);
		if (!entry) throw new Error(`同行人物尚未收录图鉴：${person.id}`);
		if (!entry.roles.includes('companion')) entry.roles.push('companion');
		const area = { wild: '战斗', elite: '精英', reward: '奖励', trade: '交易', event: '事件', challenge: '挑战' };
		entry.text += ` 常驻同行时偏好${person.region}相关、或${{battle: '战斗', reward: '奖励', pokemon: '宝可梦'}[person.preference]}取向的选项，喜欢${person.areas.map(id => area[id as keyof typeof area]).join('、')}区域。` +
			`好感度在本局累积；50 时赠送【${person.gifts[0].name}】×1；100 时赠送进阶礼物【${affectionThemeGift(person.id, 100).name}】×1，以及${AFFECTION_ADVANCED_REWARDS}。阶段奖励每局各领一次，新一局重新积累；邀请条件保持原有奇遇规则。全部同行共用两个名额。`;
	}
	return [...people.values()];
}
