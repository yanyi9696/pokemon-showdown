import type { RogueRun } from './types';
import { dialoguePage, type NarrativePage } from './narrative';
import { travellingRoster } from './travellers';

/** Original dialogue grounded in the characters' game relationships, not quoted game scripts. */
const REUNIONS = [
	{
		pair: ['clay', 'lacey'], names: ['菊老大', '紫芋'],
		lines: [
			[1, '爸爸？没想到会在这里遇见你。我正在和这位训练家各自磨炼本领，可不是出来偷懒的哦。'],
			[0, '我又没说你偷懒。看你和宝可梦精神都不错，就知道这一路没白走。'],
			[1, '那也不能一见面就检查我的功课呀。我的伙伴很可爱，也很可靠；该怎么战斗，我会自己判断。'],
			[0, '哈哈，行！有自己的主意是好事。能把主意做成，就更有本事了。'],
			[1, '这还差不多。也请你认真看看这位训练家吧，我们都有值得彼此学习的地方。'],
			[0, '用不着你提醒。我会认真对待每一位有骨气的训练家。今天咱们各凭本事。'],
		],
	},
	{
		pair: ['giovanni', 'silver'], names: ['坂木', '银'],
		lines: [
			[1, '……是你。没想到会在这座塔里碰见。'],
			[0, '你的眼神变了。看来，你已经找到了自己要走的路。'],
			[1, '我的路，和你无关。我不会再把宝可梦只当成证明强大的工具。它们是和我一起战斗的伙伴。'],
			[0, '既然作出了选择，就让你的行动证明它。只靠言语，是改变不了什么的。'],
			[1, '我会证明，但不是为了得到你的认可。也别把我们眼前的训练家卷进过去的事里。'],
			[0, '……好。此刻，就各自以训练家的身份面对接下来的路吧。'],
		],
	},
	{
		pair: ['nanu', 'acerola'], names: ['默丹', '阿塞萝拉'],
		lines: [
			[1, '默丹叔叔！果然在这里。你是不是又说着嫌麻烦，结果还是把一路上的事情都照看好了？'],
			[0, '只是碰巧路过。你倒是有精神，没让幽灵宝可梦把同行的人吓跑吧。'],
			[1, '才没有呢，我们相处得很好！倒是你，别只记得给喵喵找吃的，自己也要好好吃饭哦。'],
			[0, '……知道了。你也一样，别仗着胆子大就往不认识的地方钻。'],
			[1, '嘿嘿，这才像叔叔会说的话。放心吧，我和伙伴都会照顾好自己，也会照顾好旅伴。'],
			[0, '那就好。该继续旅行也好，该对战也好，按你们自己的步调来。'],
		],
	},
] as const;

/** Pure presentation: callers queue once on entry, or use the existing saved boss-intro cursor. */
export function trainerReunionPages(run: RogueRun, visitor: string): NarrativePage[] {
	const active = new Set(travellingRoster(run).map(c => c.id));
	// A travelling trainer taking their own gym challenge is not arriving from elsewhere.
	if (active.has(visitor)) return [];
	const reunion = REUNIONS.find(({ pair }) => pair.some(id => id === visitor) &&
		pair.some(id => id !== visitor && active.has(id)));
	if (!reunion) return [];
	return reunion.lines.map(([index, text]) => ({
		...dialoguePage(reunion.pair[index], reunion.names[index], text, false,
			reunion.pair[index] === visitor ? 'right' : 'left'),
		title: '旅途中的重逢',
	}));
}
