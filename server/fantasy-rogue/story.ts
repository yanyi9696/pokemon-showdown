import { Dex } from '../../sim/dex';
import type { RogueAccount, RogueRun } from './types';

export type RogueStoryStage = 'opening' | 'spirit' | 'spiritEffect' | 'climb' | 'cards' | 'portal' | 'ending' | 'gymgift';
type Page = { scene: string, title: string, text: string, speaker?: string };
const page = (scene: string, title: string, text: string, speaker?: string): Page => ({ scene, title, text, speaker });
export const ROGUE_STORY: Partial<Record<RogueStoryStage, Page[]>> = {
	opening: [
		page('chamber', '醒来', '你睁开双眼，四周一片昏暗。目光所及，只有墙壁。这里像是一座建筑的内部……塔？你在塔里吗？'),
		page('chamber', '醒来', '头忽然疼了起来。你想起了来到这里的缘由。'),
		page('letter', '求救信', '不久前，你收到了一封求救信。信上写着：看到这封信时，寄信人已经被困在某处。这封托人寄出的信，是早已安排好的最后求救手段。'),
		page('letter', '求救信', '信里许诺了一大笔委托金，接下委托就能先拿到一份不菲的定金。'),
		page('letter', '求救信', '想到万事屋最近冷清的生意……还是接下吧。'),
		page('chamber', '来客', '你拍了拍额头。信里明明写着营救地址，可这里究竟是什么地方，你一点也想不起来。连自己是怎么来到这里的，都没有印象。'),
		page('stranger', '来客', '一个佝偻的黑袍人缓缓靠近。兜帽遮住了面容，声音含糊得有些难以听清。'),
		page('stranger', '来客', '训练家啊，无论你是为了何物来到此处，这里都不会有你想要的……你需要向上，只是别忘了你的宝可梦。', '黑袍人'),
	],
	spirit: [page('spirit', '一瞬的幻影', '眼前仿佛浮现出一道宝可梦的身影。你揉了揉眼睛，那道身影已经消失，只留下一股奇异的力量。')],
	climb: [
		page('stranger', '向上', '你看了看手中的精灵球，又瞥向那佝偻的黑袍人。应该是位老人吧，至少没有感到恶意。'),
		page('stairs', '向上', '既然说要向上，指的应该就是角落里的楼梯。你下定了决心。为什么要爬？因为塔就在那里。'),
		page('stranger', '一摞卡片', '真是了不起啊。容我失礼，你喜欢什么属性的宝可梦？', '黑袍人'),
	],
	portal: [
		page('stairs', '白光', '接过卡片，老人便不再说话。你走到楼梯下，看到上方悬着一个散发白光的菱形入口。无论那是什么，你都得去看看。'),
		page('portal', '仍在塔内', '触碰入口的一瞬，刺目的光让你闭上双眼。再次睁眼，已不在刚才的房间。你不知道这里是哪里，却隐约明白：自己仍在塔内。'),
	],
	ending: [
		page('summit', '塔顶', '周围的景象渐渐褪去，露出房间原本的模样。你环顾四周，已经没有通向更高处的楼梯。看来，这就是塔顶。'),
		page('summit', '塔顶', '你走到窗边，远处景色尽收眼底。趴在窗沿，身体忽然轻松起来，四周柔软得像云朵一般。舒服，惬意……'),
		page('home', '万事屋', '你缓缓睁开眼。怎么已经睡到这个时间了？！'),
		page('home', '万事屋', '你赶忙从床上跳起，今天明明还有待办事项。好在万事屋没有考勤。'),
		page('letter', '待办事项', '什么事来着……你从背包里翻出备忘录。哦，对，求救信！今天得去救人了。'),
		page('home', '床头的卡片', '整理背包时，一张陌生的卡片落入手中，上面记着一些莫名其妙的内容。总之，先放在床头吧。'),
	],
};
const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
	'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
const NAMES = ['一般', '火', '水', '电', '草', '冰', '格斗', '毒', '地面', '飞行', '超能力', '虫', '岩石', '幽灵', '龙', '恶', '钢', '妖精'];
export const ROGUE_START_CARDS = TYPES.map((type, i) => ({
	id: type.toLowerCase(), type, name: `${NAMES[i]}属性的宝可梦`,
	text: `进入生态区域后，${NAMES[i]}属性野生宝可梦的出现权重 ×1.25。` +
		'不会改变区域种类，池内没有该属性时不生效。',
})).concat([{ id: 'all', type: '', name: '所有属性的宝可梦',
	text: '野生宝可梦闪光概率增加 0.1 个百分点：普通 0.2% → 0.3%；凤王塔灵 2% → 2.1%。' }]);
export const startCard = (id?: string) => ROGUE_START_CARDS.find(card => card.id === id);

/** Reweight the original nested draw by actual evolved type without flattening its slot/group weights. */
export function cardBiasedSpecies(
	draw: () => string, card: string | undefined, random: (max: number) => number
): string {
	const type = startCard(card)?.type;
	if (!type) return draw();
	for (let attempts = 0; ; attempts++) {
		const name = draw();
		if (Dex.mod('gen9fantasy').species.get(name).types.includes(type) || random(5) < 4 || attempts >= 100) return name;
	}
}

export function storyView(account: RogueAccount, enabled: boolean, local: boolean) {
	if (!enabled && account.run?.story?.stage !== 'gymgift') return null;
	const run = account.run;
	const stage = run?.story?.stage || (!run ? 'opening' : undefined);
	if (!stage) return null;
	const index = stage === 'opening' ? account.opening?.page || 0 : run!.story!.page;
	const pages = stage === 'gymgift' ? gymGiftPages(run!) : ROGUE_STORY[stage];
	if (!pages || index >= pages.length) return stage === 'cards' ? { stage, index, cards: ROGUE_START_CARDS } : null;
	return { stage, index, total: pages.length, ...pages[index],
		canSkip: local || (stage === 'opening' ? !!account.adventures : !!run?.story?.canSkip) || stage === 'ending',
		key: `${run?.id || 'opening'}:${stage}:${index}` };
}

const GYM_GIFT_LINES: Record<string, string> = {
	brock: '能走到这里，说明你与宝可梦之间的信赖已经足够坚实。接下来的路会更难，就让我再帮你们打好一点基础吧。',
	sabrina: '我看见了你们尚未显露的可能性。力量已经在这里，只差你亲手推开那扇门。',
	flannery: '一百层！你们的斗志真够火热啊！来，在开打之前，让我帮你们点燃一种新的力量！',
	roxie: '爬了这么久，还能听见你们响亮的心跳！好，给这支队伍加一点新的声音，再来打一场痛快的！',
	viola: '你和伙伴一路走来的样子，真是一幅好画面。来，试着换一个角度，发现伙伴不一样的光彩吧。',
	acerola: '嘻嘻，居然真的走到这里啦！别担心，今天送你的不是吓人的东西。选一种力量，给接下来的冒险壮壮胆吧！',
	nessa: '一路走到这里，你们配合得越来越流畅了。接住这份力量，下一次浪头来临时，要站稳哦。',
	bea: '能坚持到这里，值得敬意。不过修行还没有结束。选择一种新的力量，让我看看你与伙伴如何驾驭它。',
	iono: '到达一百层的挑战者登场——！奇树特别福利时间！选一种新力量，让接下来的对战成为最闪亮的节目吧！',
	larry: '已经一百层了啊，辛苦了。这算是阶段性的支援物资。选一种用得上的，办完手续，我们再开始对战。',
};
function gymGiftPages(run: RogueRun): Page[] {
	const trainer = run.node?.encounters[0]?.trainer;
	return [page('chamber', '第一百层 · 馆主的赠礼',
		GYM_GIFT_LINES[trainer?.id || ''] || '能来到第一百层，已经证明了你们的实力。开战之前，选一种新的力量吧。', trainer?.name),
	page('chamber', '选择新的力量', '你可以解锁一种尚未解锁的系统：超进化、超巨进化、Z 招式或太晶化，并领取配套的自选超级进化石、超巨进化许愿星、自选 Z 纯晶或 50 片自选属性太晶碎片。领完后先调整队伍，准备好了再来挑战。', trainer?.name)];
}

export function afterSpirit(run: RogueRun) {
	if (!run.story) return false;
	run.phase = 'story';
	run.story.stage = run.story.skip ? 'cards' : 'climb';
	run.story.page = 0;
	return true;
}
