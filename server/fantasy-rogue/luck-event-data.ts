/** Shared copy for playable chance events and their read-only codex branches. */
export const LUCK_EVENT_NAMES = {
	meowthcoin: '喵喵的两份谢礼',
	chanseycoin: '吉利蛋的出发礼',
	shuckledice: '壶壶的树果小摊',
	delibirddice: '信使鸟的六格礼盒',
	clefairydice: '皮皮的月亮游戏',
};
export type LuckEventID = keyof typeof LUCK_EVENT_NAMES;
interface LuckEventText {
	kind: 'coin' | 'die';
	opening: string[];
	participate: string;
	leave: string;
	farewell: string;
	ordinary: string;
	best: string;
	overview: string;
}
export const LUCK_EVENT_TEXT: Record<LuckEventID, LuckEventText> = {
	meowthcoin: {
		kind: 'coin',
		opening: ['行商的货车陷进了浅沟。一只喵喵绕着车轮直打转，见你走近，赶紧叼来一截绳子。',
			'「搭把手吧，谢礼已经备好了！」行商摸出一枚印着精灵球的硬币，「搬完货再抛一下。正面的话，喵喵替我保管的那份奖金也归你。」喵喵按住钱袋，犹豫片刻，还是点了点头。'],
		participate: '和伙伴搭把手，再抛一次硬币。', leave: '指给他平坦的小路，继续赶路。',
		farewell: '行商沿着你指的方向铺好木板。喵喵向你摆摆爪子，你们约好下次路上再见。',
		ordinary: '喵喵认真数出约好的谢礼，推到你手边。行商拍拍已经脱困的车轮：「多亏你们，今晚能赶到宝可梦中心了！」',
		best: '喵喵瞪大眼睛，随后故作大方地解开钱袋，又添上一大把金币。行商笑出了声：「说话算话，这份好运就带着上路吧！」',
		overview: '帮行商与喵喵搬好货物，免费抛一次硬币，获得随楼层增长的金币谢礼；正面的金币为反面的三倍。',
	},
	chanseycoin: {
		kind: 'coin',
		opening: ['临时休息站外，吉利蛋正把补给装进小纸袋。护士向你招招手，递来一枚画着吉利蛋笑脸的纪念硬币。',
			'「给继续旅行的训练家准备了一点心意，来试试手气吧。笑脸是正面，抛到了，就让吉利蛋替你多装一些。」吉利蛋抱起一只鼓鼓的袋子，期待地看着你。'],
		participate: '接过纪念硬币，轻轻向上一抛。', leave: '谢谢你们，先留给更需要的人吧。',
		farewell: '吉利蛋把小纸袋摆回桌上，挥着手送你离开。护士叮嘱你，路上也要记得让伙伴休息。',
		ordinary: '吉利蛋把一份伤药和 PP 补给递给你，还仔细替你扎紧袋口。「慢慢来，平安到达下一站最要紧。」',
		best: '硬币上的笑脸和吉利蛋的笑脸凑到了一起。它高兴地多装了伤药与 PP 补给，又悄悄塞进一枚【活力碎片】。',
		overview: '免费抛一次纪念硬币。反面获得伤药与 PP 单项小补剂各 1 份；正面获得伤药 3 份、PP 单项小补剂 2 份和活力碎片 1 份。伤药种类随楼层提升。',
	},
	shuckledice: {
		kind: 'die',
		opening: ['树荫下摆着一张小桌，壶壶把刚洗好的树果一颗颗码进篮子。果农拿出一颗刻着圆点的木骰子，放到你掌心。',
			'「今年收成不错，路过的伙伴也分一点。掷一次，点数越大就装得越满。六点的话，那两颗特别留着的树果也送你！」壶壶探出脑袋，护住了篮边的小布包。'],
		participate: '借壶壶的小木盘掷一次骰子。', leave: '把树果留给下一位旅人吧。',
		farewell: '壶壶慢吞吞地收起木盘。你向果农道谢，带着清甜的果香继续赶路。',
		ordinary: '果农照着点数挑好树果，壶壶用叶片替你包起来。它碰了碰你伙伴的鼻尖，像是在叮嘱它别一口吃完。',
		best: '壶壶伸长脖子，确认木骰上确实是六个圆点，才把小布包推过来。里面除了满满的树果，还有一颗【苹野果】和一颗【木子果】。',
		overview: '免费掷一次六面骰。1～6 点分别获得 1／1／2／2／3／4 颗回复树果；6 点再获苹野果与木子果各 1 颗。第 29 层起，回复树果由橙橙果换为文柚果。',
	},
	delibirddice: {
		kind: 'die',
		opening: ['信使鸟背着鼓鼓的行囊，落在路旁的邮筒上。邮递员打开一只分成六格的礼盒，每一格都系着不同长度的彩带。',
			'「这是给旅途中的宝可梦准备的糖果。掷一次骰子吧，点数越大，能带走的份数越多。六点那格，信使鸟还替你准备了一份赶路的补给。」'],
		participate: '请信使鸟接住骰盅，掷一次骰子。', leave: '今天先替下一位收件人保留礼物。',
		farewell: '信使鸟把礼盒收回行囊，朝你敬了一个歪歪斜斜的礼。邮递员祝你和伙伴一路顺风。',
		ordinary: '信使鸟找到了对应的格子，把糖果递给你的伙伴。邮递员替你收好余下的份数：「留着慢慢吃，练习的时候也用得上。」',
		best: '最长的彩带被一口气拉开，信使鸟抱着四份糖果钻了出来。邮递员又放进一份 PP 补给：「六点大礼，签收啦！」',
		overview: '免费掷一次六面骰。1～6 点分别获得 1／1／2／2／3／4 份经验糖果；每份糖果按当前楼层的奖励份量发放，不提前开放高阶糖果。6 点另获 PP 单项小补剂 1 份。',
	},
	clefairydice: {
		kind: 'die',
		opening: ['几只皮皮围着一块【月之石】拍手转圈，石旁散落着星星般的幻想碎片。一只小皮皮把六面石骰滚到你脚边，示意你也来玩。',
			'照看它们的研究员笑着解释：「这是它们分礼物的小游戏。点数越大，分到的星光越多。要是六点，旁边那块小小的月之石也归你。」'],
		participate: '跟着皮皮拍两下手，掷出石骰。', leave: '轻轻挥手，不打扰它们的游戏。',
		farewell: '皮皮们又围成一圈。你走出几步，身后仍传来整齐的拍手声。',
		ordinary: '皮皮们围过来，按点数数好发光的碎片。一只小皮皮还回头检查了一遍，生怕少算了给你的那颗星星。',
		best: '六个圆点朝上，皮皮们一起欢呼起来。它们凑出一大捧幻想碎片，又把那块小小的【月之石】郑重放进你的手心。',
		overview: '第 51 层起可遇见。免费掷一次六面骰，1～6 点分别获得 3／4／5／6／8／15 片幻想碎片；6 点另获月之石 1 块。',
	},
};
export function isLuckEvent(id: string): id is LuckEventID {
	return Object.prototype.hasOwnProperty.call(LUCK_EVENT_NAMES, id);
}
export function luckEventOptions(id: LuckEventID) {
	const entry = LUCK_EVENT_TEXT[id];
	return [
		{ id: entry.kind === 'coin' ? 'coin' : 'roll', name: entry.participate, text: '免费参与，每次相遇只能尝试一次。', disabled: false },
		{ id: 'leave', name: entry.leave, text: '', disabled: false },
	];
}
export function luckOutcomeText(id: LuckEventID, face: number) {
	const entry = LUCK_EVENT_TEXT[id], best = face === (entry.kind === 'coin' ? 1 : 6);
	return [entry.kind === 'coin' ? `硬币${best ? '正' : '反'}面朝上。` : `骰子停在 ${face} 点。`, best ? entry.best : entry.ordinary];
}
