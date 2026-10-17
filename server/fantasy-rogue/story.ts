import { Dex } from '../../sim/dex';
import type { RogueAccount, RogueRun } from './types';
import { GYM_GIFT_LINES, TRAINER_DIALOGUE, GYM_LEAGUE_LINES } from './trainer-dialogue';
import { ELITE_FOUR_FLOORS } from './trainer-bosses';
import { ELITE_BOSS_FLOORS } from './content';

export type RogueStoryStage = 'opening' | 'spirit' | 'spiritEffect' | 'climb' | 'cards' | 'portal' |
	'ending' | 'gymgift' | 'godinvite' | 'bossintro' | 'restguide' | 'leaguebriefing';
type Page = { scene: string, title: string, text: string, speaker?: string, avatar?: string, pokemon?: string,
	roster?: { name: string, avatar?: string, pokemon: string[] } };
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
	godinvite: [
		page('portal', '白光之中', '塔顶的战斗结束了。白光从四周升起，将你和伙伴轻轻包裹。疲惫渐渐消失，一道声音在光中响起。'),
		page('portal', '神之挑战', '走到这里，已经证明了你们的实力。但你对自己足够自信吗……自信到，足以向神发起挑战？', '光中的声音'),
		page('portal', '由你决定', '你看向已经恢复精神的伙伴。这次冒险的成果已留在卡片中。接下来的挑战，无论成败，都不会改变这段旅途的结局。'),
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
	text: `区域野生遭遇和随机赠送伙伴中，${NAMES[i]}属性出现权重 ×1.25；不改变区域及奖励范围。`,
})).concat([{ id: 'all', type: '', name: '所有属性的宝可梦',
	text: '野生与随机赠送宝可梦的闪光率 +0.1 个百分点（普通 0.3%，凤王塔灵 2.1%）。' }]);
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
	if (!enabled && !['gymgift', 'godinvite'].includes(account.run?.story?.stage || '')) return null;
	const run = account.run;
	const stage = run?.story?.stage || (!run ? 'opening' : undefined);
	if (!stage) return null;
	const index = stage === 'opening' ? account.opening?.page || 0 : run!.story!.page;
	const pages = stage === 'gymgift' ? gymGiftPages(run!) :
		stage === 'bossintro' ? bossIntroPages(run!) : stage === 'restguide' ? mentorPages(run!) :
		stage === 'leaguebriefing' ? leaguePages(run!) : ROGUE_STORY[stage];
	if (!pages || index >= pages.length) return stage === 'cards' ? { stage, index, cards: ROGUE_START_CARDS } : null;
	return { stage, index, total: pages.length, ...pages[index],
		canSkip: local || (stage === 'opening' ? !!account.adventures : !!run?.story?.canSkip) || stage === 'ending',
		battleReady: stage === 'bossintro' && index === pages.length - 1,
		encounter: ['bossintro', 'gymgift'].includes(stage) ? bossDialogueKey(run!) : undefined,
		key: `${run?.id || 'opening'}:${stage}:${stage === 'restguide' ? `${run!.floor}:` : ''}${['bossintro', 'gymgift'].includes(stage) ? bossDialogueKey(run!) + ':' : ''}${index}` };
}

function mentorPages(run: RogueRun): Page[] {
	const elite = ELITE_BOSS_FLOORS.has(run.floor + 1);
	const levels = run.blessings?.bossLevels ?? run.blessings?.levels ?? 0;
	const roster = bossRoster(run, run.floor + 1);
	return [
		page('stranger', '楼梯前的提醒', `黑袍老人坐在休整处，见你走来，抬手指了指楼梯。「下一层${elite ? '是幻想精英' : '有强敌在等你'}，可比路上的对手难对付。先把伙伴照顾好，招式和道具也别忘了检查。」${levels ? `目前祝福使固定首领额外提高 ${levels} 级，请留意队伍等级。` : ''}`),
		...(roster ? [{ ...page('arena', `第 ${run.floor + 1} 层 · 对手预告`,
			`「下一层等着你的是${roster.avatar ? roster.name : '这些宝可梦'}。记住这些面孔，想好用哪些伙伴应对，再去挑战。」`, '黑袍老人'), roster }] : []),
		page('stranger', '准备好了再出发', '「从这三张里选一张吧。它会帮你应付下一层的首领，战胜对手后就会消散。」老人把卡片摆开。「先照顾好伙伴，准备好了再上楼。」', '黑袍老人'),
	];
}
function bossRoster(run: RogueRun, floor: number) {
	const node = run.bossPreviews?.[floor];
	if (!node) return undefined;
	const trainer = node.encounters[0]?.trainer;
	return { name: trainer?.name || node.name, avatar: trainer?.avatar,
		pokemon: node.encounters.flatMap(encounter => encounter.team.map(set => set.species)) };
}
export function leaguePages(run: RogueRun): Page[] {
	const trainer = run.node?.encounters[0]?.trainer;
	const intro = GYM_LEAGUE_LINES[trainer?.id || ''] || '八位馆主都已挑战完毕。接下来是四天王和冠军，我把对手和队伍介绍给你。';
	return [{ ...page('arena', '接下来的挑战', intro, trainer?.name), avatar: trainer?.avatar },
		...[...ELITE_FOUR_FLOORS, 190].flatMap(floor => {
			const roster = bossRoster(run, floor);
			return roster ? [{ ...page('arena', `第 ${floor} 层 · ${roster.name}`,
				`第 ${floor} 层是${roster.name}。这就是届时会与你对战的队伍。记好成员，提前准备吧。`, trainer?.name), roster }] : [];
		})];
}

/** Stable across retries, distinct across floors and trainer identities. */
export function bossDialogueKey(run: RogueRun) {
	const trainer = run.node?.encounters[run.encounter]?.trainer;
	return `${run.floor}:${run.node?.id}:${run.encounter}:${trainer?.role || 'summit'}:${trainer?.id || 'mewtwo'}`;
}
export function rememberBossDialogue(run: RogueRun) {
	const key = bossDialogueKey(run);
	if (!run.seenBossDialogues?.includes(key)) (run.seenBossDialogues ||= []).push(key);
}
export function bossIntroPages(run: RogueRun): Page[] {
	if (run.postgame) return [];
	if (run.floor === 200 && run.node?.kind === 'boss') {
		return [
			page('summit', '幻想的顶点', '走上最后一段楼梯，超梦正等在房间中央。你还没开口，一道声音已经在脑海中响起。'),
			page('summit', '幻想的顶点', '你已经到了塔之尽头。这里，就是幻想的顶点。', '超梦'),
			page('summit', '最初的来意', '你一路追逐胜利，走到了这里。可你还记得，自己为何而来吗？', '超梦'),
		].map(entry => ({ ...entry, pokemon: 'Mewtwo-Fantasy' }));
	}
	const trainer = run.node?.encounters[run.encounter]?.trainer;
	if (!trainer || !['gym', 'elitefour', 'champion'].includes(trainer.role)) return [];
	const lines = TRAINER_DIALOGUE[trainer.id]?.[trainer.role as 'gym' | 'elitefour' | 'champion'];
	return (lines || ['欢迎，你和伙伴已经走了很远。', '准备好了，就让我们开始这场对战吧。']).map(text => ({
		...page('arena', `第 ${run.floor} 层 · 战前`, text, trainer.name), avatar: trainer.avatar,
	}));
}
function gymGiftPages(run: RogueRun): Page[] {
	const trainer = run.node?.encounters[0]?.trainer;
	if (run.megaUnlocked && run.gmegaUnlocked && run.zUnlocked && run.teraUnlocked) {
		return bossIntroPages(run).concat([{ ...page('arena', '准备好再开始',
			'四种系统都已解锁。你可以先调整队伍，准备好了再开始对战。'), avatar: trainer?.avatar }]);
	}
	return [page('arena', '第一百层 · 馆主的赠礼',
		GYM_GIFT_LINES[trainer?.id || ''] || '能来到第一百层，已经证明了你们的实力。开战之前，选一种新的力量吧。', trainer?.name),
	page('arena', '选择新的力量', '你可以解锁一种尚未解锁的系统：超进化、超巨进化、Z 招式或太晶化，并领取配套的自选超级进化石、超巨进化许愿星、自选 Z 纯晶或 50 片自选属性太晶碎片。领完后先调整队伍，准备好了再来挑战。')]
		.map(entry => ({ ...entry, avatar: trainer?.avatar }));
}

export function afterSpirit(run: RogueRun) {
	if (!run.story) return false;
	run.phase = 'story';
	run.story.stage = run.story.skip ? 'cards' : 'climb';
	run.story.page = 0;
	return true;
}
