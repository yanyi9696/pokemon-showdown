import {
	COMPANIONS, companionHasGift, companionGiftOptions, companionPreferenceText, type CompanionID,
} from '../../sim/rogue-companions';
import { ROGUE_BLESSINGS } from '../../sim/rogue-blessing-data';
import { COMPANION_GIFT_LINES } from './companion-dialogue';
import { TrainerBossData } from './trainer-boss-data';
import { POLICE_REGIONS } from './police-data';

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
	for (const trainer of TrainerBossData) add(trainer.id, trainer.name.replace(/[（(].*$/, ''), trainer.role,
		trainer.role === 'gym' ? '以道馆馆主身份在塔中接受挑战。战胜后会认可你的实力，并恢复队伍状态。' :
		trainer.role === 'elitefour' ? '塔中四天王之一，使用自己擅长的阵容检验训练家的战术。' : '塔中的冠军挑战者，会全力回应你与伙伴的默契。');
	for (const region of Object.values(POLICE_REGIONS)) add(region.boss, region.bossName, 'antagonist',
		`与${region.name}的${region.group}相关。在治安协助的后续遭遇中可能亲自出战。`);
	const others: [string, string, string, string][] = [
		['jenny', '君莎', 'other', '负责旅途治安，邀请训练家协助制止各地闹事者，并在完成协助后赠送谢礼。'],
		['mewtwo', '幻想超梦', 'other', '第 200 层的特殊对手。先指挥五名伙伴，待它们全部倒下后亲自出战。'],
		['clover', '阿竹', 'antagonist', '洗翠野贼三姐妹之一，会在治安协助中出场。'],
		['coin', '阿梅', 'antagonist', '洗翠野贼三姐妹之一，会在治安协助中出场。'],
		...Object.entries({
			rocket: '火箭队', magma: '熔岩队', galactic: '银河队', plasma: '等离子队', flare: '闪焰队',
			skull: '骷髅队', yell: '呐喊队', teamstar: '天星队',
		})
			.map(([id, name]): [string, string, string, string] => [id, name + '队员', 'antagonist', `在治安协助遭遇中出现的${name}成员。`]),
	];
	for (const [id, name, role, text] of others) add(id, name, role, text);
	return [...people.values()];
}
