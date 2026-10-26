import type { RogueItem, RogueRun } from './types';

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
		['fastball', '速度球', 1250, '速度种族值达到 100 的目标，捕捉倍率为 4；其他目标为 1。', { condition: 'fast' }],
		['levelball', '等级球', 1250, '我方出场伙伴等级高于目标时倍率为 2；达到目标的 2 倍时为 4，4 倍时为 8；否则为 1。', { condition: 'level' }],
		['lureball', '诱饵球', 1250, '钓鱼遭遇的捕捉倍率为 4；其他场合为 1。', { condition: 'fishing' }],
		['heavyball', '沉重球', 1250, '按目标体重修正基础捕获率：低于 100 千克 −20；100～199.9 千克不变；200～299.9 千克 +20；300 千克起 +30。', { condition: 'heavy' }],
		['loveball', '甜蜜球', 1250, '目标与我方出场伙伴同种且异性时，捕捉倍率为 8；其他目标为 1。', { condition: 'love' }],
		['moonball', '月亮球', 1250, '使用月之石进化的家族，捕捉倍率为 4；其他目标为 1。', { condition: 'moon' }],
		['friendball', '友友球', 1250, '捕捉倍率为 1；捕获伙伴的初始亲密度为 150。'],
		['luxuryball', '豪华球', 1500, '捕捉倍率为 1；捕获伙伴之后获得的亲密度翻倍。'],
		['safariball', '狩猎球', 1250, '捕捉倍率为 1，与精灵球相同。'],
		['sportball', '竞赛球', 1250, '捕捉倍率为 1，与精灵球相同。'],
	];
	return [{ id: 'masterball', name: '大师球', kind: 'ball', price: 0, shopFloor: false, multiplier: 1, icon: 'masterball', description: '必定捕获当前可捕捉的野生宝可梦。仅由稀有的极境馈赠获得，每局最多一个；仅在本局使用，不会带入下一局。' } as RogueItem, ...definitions.map(([id, name, price, description, ballRule]) => ({
		id, name, price, description, ballRule, multiplier: 1, kind: 'ball' as const, icon: id, shopFloor: false as const,
	}))];
}

/** Retired prototype balls become official Ultra Balls, including rollback inventories. */
export function migrateRetiredBalls(run: RogueRun) {
	const convert = (bag?: Record<string, number>) => {
		if (!bag) return 0;
		let count = 0;
		for (const id of Object.keys(bag)) if (id.startsWith('roguetypeball')) {
			count += Math.max(0, bag[id]); delete bag[id];
		}
		if (count) bag.ultraball = (bag.ultraball || 0) + count;
		return count;
	};
	const count = convert(run.bag);
	convert(run.checkpoint?.bag); convert(run.postgame?.before.bag); convert(run.preview?.result?.bag);
	convert(run.lastReward?.items);
	for (const node of [run.node, ...run.choices || []]) if (node?.trade) {
		node.trade.stock = node.trade.stock.filter(item => !item.id.startsWith('roguetypeball'));
	}
	if (count) (run.notices ||= []).push(`已将停用的自制属性球 ×${count} 换为等量【高级球】。`);
}
