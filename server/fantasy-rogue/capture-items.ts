import { BLESSING_TYPES } from '../../sim/rogue-blessing-data';
import type { RogueItem } from './types';

/** Tower equivalents of ordinary balls; descriptions state the actual tower conditions. */
export function captureItems(): RogueItem[] {
	const definitions: [string, string, number, string, RogueItem['ballRule']?][] = [
		['netball', '捕网球', 1250, '水系或虫系目标的捕捉倍率为 3.5，其他目标为 1。', { types: ['Water', 'Bug'], bonus: 3.5 }],
		['diveball', '潜水球', 1250, '水域及钓鱼遭遇中捕捉倍率为 3.5，其他场合为 1。', { condition: 'water' }],
		['duskball', '黑暗球', 1250, '夜晚或洞窟中捕捉倍率为 3，其他场合为 1。', { condition: 'dark' }],
		['quickball', '先机球', 1500, '本场第一回合捕捉倍率为 5，此后为 1。', { condition: 'quick' }],
		['timerball', '计时球', 1250, '捕捉倍率从 1 开始，每经过一回合增加 0.3，最高为 4。', { condition: 'timer' }],
		['repeatball', '重复球', 1250, '曾经捕捉过的物种，捕捉倍率为 3.5，其他物种为 1。', { condition: 'repeat' }],
		['nestball', '巢穴球', 1250, '目标等级越低越容易捕捉：倍率为（41－等级）÷10，最低为 1。', { condition: 'nest' }],
		['dreamball', '梦境球', 1500, '睡眠中的目标捕捉倍率为 4，其他目标为 1。', { condition: 'sleep' }],
		['beastball', '究极球', 1750, '究极异兽的捕捉倍率为 5，其他宝可梦仅为 0.1。', { condition: 'ultra' }],
		['healball', '治愈球', 500, '捕捉倍率为 1；捕捉成功后，恢复该伙伴的 HP、PP 并解除异常状态。'],
		['premierball', '纪念球', 250, '捕捉倍率为 1，与精灵球相同。'],
	];
	return [...definitions.map(([id, name, price, description, ballRule]) => ({
		id, name, price, description, ballRule, multiplier: 1, kind: 'ball' as const, icon: id, shopFloor: false as const,
	})), ...Object.entries(BLESSING_TYPES).map(([type, label]) => ({
		id: `roguetypeball${type.toLowerCase()}`, name: `${label}属性球`, kind: 'ball' as const, price: 1250,
		multiplier: 1, ballRule: { types: [type], bonus: 3 }, icon: 'pokeball', shopFloor: false as const,
		category: '幻想属性球', description: `对${label}系目标，捕捉倍率为 3；其他目标为 1。`,
	}))];
}
