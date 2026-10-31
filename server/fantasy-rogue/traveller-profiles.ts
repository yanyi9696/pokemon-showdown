import { COMPANIONS, COMPANION_PREFERENCES, COMPANION_REGIONS, companionGiftOptions, type CompanionID } from '../../sim/rogue-companions';
import { RIVALS, RIVAL_SNACK_GIFTS, RIVAL_FAREWELLS, CARMINE } from './rival-data';
import { COMPANION_DIALOGUE, COMPANION_GIFT_LINES } from './companion-dialogue';
import { TrainerBossData } from './trainer-boss-data';
import { Teams } from '../../sim/teams';
import { LUSAMINE } from './lusamine-data';
import { CHALLENGE_TRAVELLERS } from './challenge-travellers';

export interface TravellerProfile {
	id: string; name: string; region: string; preference: 'battle' | 'reward' | 'pokemon';
	areas: string[]; gifts: { id: string, name: string }[]; team: string[];
	greeting: string; farewell: string; thanks: string;
	/** Optional character-specific responses within the shared, saved travel-event flow. */
	chat?: { reply: string; invite: string; join: string; win: string; loss: string };
	challengeOnly?: boolean;
}
const GYM_PROFILES: Record<string, [string, TravellerProfile['preference'], string[], string, string, string]> = {
	brock: ['关都', 'pokemon', ['reward'], 'hardstone', '硬石头', '路上有没有好好照顾伙伴？训练也好，休息也好，都不能马虎。'],
	sabrina: ['关都', 'pokemon', ['event'], 'twistedspoon', '弯曲的汤匙', '你与伙伴的心意，让前方的道路有了新的可能。'],
	flannery: ['丰缘', 'battle', ['wild'], 'charcoal', '木炭', '来得正好！伙伴们精神这么好，不活动一下可惜了。'],
	viola: ['卡洛斯', 'pokemon', ['event'], 'silverpowder', '银粉', '先别动，这个和伙伴并肩的瞬间，值得好好拍下来！'],
	nessa: ['伽勒尔', 'battle', ['wild'], 'mysticwater', '神秘水滴', '每一场对战都像潮汐，得读懂它，才能走得更远。'],
	larry: ['帕底亚', 'reward', ['trade'], 'silkscarf', '丝绸围巾', '休息也是行程的一部分。补给足够，工作……旅行才做得下去。'],
	lorelei: ['关都', 'pokemon', ['event'], 'nevermeltice', '不融冰', '冷静观察伙伴的状态，比一味向前冲更重要。'],
	lance: ['关都', 'battle', ['elite'], 'dragonfang', '龙之牙', '力量应当用来保护伙伴。让我听听你的想法。'],
	steven: ['丰缘', 'reward', ['event'], 'metalcoat', '金属膜', '这条路上有许多值得留心的矿石。宝可梦也是，值得慢慢了解。'],
	leon: ['伽勒尔', 'battle', ['wild', 'elite'], 'charcoal', '木炭', '我是丹帝！正想看看这条路上的训练家有多强……咦，出口不是这个方向吗？哈哈，既然遇见了，就让伙伴们也打个招呼吧！'],
	diantha: ['卡洛斯', 'pokemon', ['event', 'reward'], 'pixieplate', '妖精石板', '你好，我是卡露妮。难得有一段不用赶去片场的时间，我想和沙奈朵慢慢走走。你刚才呼唤伙伴时，它马上回头了；这样的默契，真让人喜欢。'],
	cynthia: ['神奥', 'pokemon', ['event', 'elite'], 'dragonfang', '龙之牙', '你好，我是竹兰。刚才在看这面石壁上的旧刻痕，不小心忘了时间。宝可梦与人共同走过的路，总会留下故事。你们这一路，有没有什么难忘的发现？'],
	ash: ['关都', 'battle', ['wild', 'elite'], 'magnet', '磁铁', '我是真新镇的小智！你也在和伙伴一起旅行啊！刚才那场配合真棒，光看着就让人热血沸腾。要不要和我们来一场宝可梦对战？'],
	jasmine: ['城都', 'pokemon', ['event', 'reward'], 'metalcoat', '金属膜', '你、你好……我是浅葱市的阿蜜。刚才我在替一只迷路的宝可梦包扎。你的伙伴看起来很安心，平时一定受到很好的照顾吧。'],
	winona: ['丰缘', 'battle', ['wild', 'elite'], 'sharpbeak', '锐利鸟嘴', '我是茵郁市的娜琪。我的伙伴刚从上空巡视回来，前面的风向变了。与飞行宝可梦同行，既要相信它们，也要留意它们传回的消息。'],
	gardenia: ['神奥', 'pokemon', ['wild', 'event'], 'miracleseed', '奇迹种子', '嗨！我是百代市的菜种。看见那边的新芽了吗？草属性宝可梦特别喜欢这样的地方。来，我们轻一点靠近，别吓到它们。'],
	candice: ['神奥', 'battle', ['wild', 'elite'], 'nevermeltice', '不融冰', '我是切锋市的小菘！这阵冷风真让人精神一振。你和伙伴也很有斗志嘛，要不要先活动一下，再继续赶路？'],
	clair: ['城都', 'battle', ['elite', 'wild'], 'dragonfang', '龙之牙', '我是烟墨市的小椿。你刚才指挥伙伴通过岔路的样子，我看见了。光有自信可不够；想让龙宝可梦认可你，得拿出相称的本领。'],
	clay: ['合众', 'reward', ['trade', 'reward'], 'softsand', '柔软沙子', '我是帆巴市的菊老大。前面那段地面松了，我刚让伙伴检查过。赶路归赶路，脚底下的情况得弄清楚，别把能避免的亏也吃了。'],
	nanu: ['阿罗拉', 'pokemon', ['event', 'reward'], 'blackglasses', '黑色眼镜', '……默丹。乌拉乌拉岛的岛屿之王，还是个警察。别紧张，我只是在看看这几只喵喵有没有吃上东西。你那边的伙伴也照顾好了吧？'],
	valerie: ['卡洛斯', 'pokemon', ['event', 'reward'], 'pixieplate', '妖精石板', '您好，我是香薰市的玛绣。方才在看伙伴追逐光点，不知不觉就走到了这里。若能听懂它们的语言，想必每一步都有许多故事吧。'],
};
export function travellerProfiles(): TravellerProfile[] {
	const profiles = new Map<string, TravellerProfile>();
	profiles.set('lusamine', { ...LUSAMINE });
	for (const profile of CHALLENGE_TRAVELLERS) profiles.set(profile.id, { ...profile });
	for (const [id, c] of Object.entries(COMPANIONS)) {
		if (['sada', 'turo'].includes(id)) continue;
		const key = id as CompanionID, p = COMPANION_PREFERENCES[key];
		const preference = p === 'battle' || p === 'reward' ? p : 'pokemon';
		profiles.set(id, { id, name: c.name, region: COMPANION_REGIONS[c.region], preference,
			areas: p === 'battle' ? ['wild', 'elite'] : p === 'reward' ? ['reward', 'trade'] : ['event'],
			gifts: companionGiftOptions(key), team: [], greeting: COMPANION_DIALOGUE[key].chat[0],
			farewell: `${COMPANION_DIALOGUE[key].praise[0]} 接下来的路，我也会期待你的好消息。下次再见！`,
			thanks: COMPANION_GIFT_LINES[key] });
	}
	for (const [id, [region, preference, areas, item, name, greeting]] of Object.entries(GYM_PROFILES)) {
		profiles.set(id, { id, name: TrainerBossData.find(t => t.id === id)!.name.replace(/[（(].*$/, ''),
			region, preference, areas, gifts: [{ id: item, name }], team: [], greeting,
			farewell: `${greeting} 那就先在这里告别，记得照顾好你们自己。`,
			thanks: '一路同行，你的选择让我看见了你对伙伴的心意。这份礼物请收下。' });
	}
	for (const [id, r] of Object.entries(RIVALS)) {
		const key = id as keyof typeof RIVALS, gift = RIVAL_SNACK_GIFTS[key];
		const preference = ['marnie', 'penny', 'bede'].includes(id) ? 'reward' :
			['korrina', 'nemona', 'blue', 'silver', 'kieran'].includes(id) ? 'battle' : 'pokemon';
		profiles.set(id, { id, name: r.name, region: r.region, preference,
			areas: preference === 'battle' ? ['wild', 'elite'] : preference === 'reward' ? ['reward', 'trade'] : ['event'],
			team: [...r.team], gifts: [{ id: gift.item, name: gift.name }], greeting: r.lines[3],
			farewell: RIVAL_FAREWELLS[key], thanks: gift.line });
	}
	for (const [id, lines] of Object.entries(CHAMPION_TRAVEL_LINES)) Object.assign(profiles.get(id)!, lines);
	profiles.set('carmine', { id: 'carmine', name: CARMINE.name, region: '北上乡', preference: 'pokemon',
		areas: ['event'], team: CARMINE.team, gifts: [{ id: CARMINE.item, name: CARMINE.giftName }],
		greeting: CARMINE.lines[3], farewell: '我得先回北上乡看看了。你们可要好好照顾自己，下次见面再聊！',
		thanks: '这个是给你的，才不是顺手捡的！遇到麻烦别总是一个人硬撑。' });
	for (const profile of profiles.values()) if (!profile.team.length) {
		const roster = TrainerBossData.find(t => t.id === profile.id);
		profile.team = roster ? Teams.import(roster.team)!.map(set => set.species) :
			({ liko: ['Floragato', 'Hattrem', 'Terapagos'], guzma: ['Golisopod', 'Ariados', 'Pinsir'],
				lana: ['Araquanid', 'Lanturn', 'Wishiwashi'], iono: ['Wattrel', 'Bellibolt', 'Luxio'],
				canari: ['Eelektrik', 'Emolga', 'Ampharos'], lysandre: ['Pyroar', 'Gyarados', 'Honchkrow'],
				olivia: ['Lycanroc', 'Nosepass', 'Boldore'], grusha: ['Frosmoth', 'Beartic', 'Cetitan'],
				rika: ['Whiscash', 'Camerupt', 'Clodsire'], poppy: ['Copperajah', 'Bronzong', 'Tinkaton'],
			} as Record<string, string[]>)[profile.id] || ['Eevee', 'Pikachu', 'Growlithe'];
	}
	return [...profiles.values()];
}
const CHAMPION_TRAVEL_LINES: Record<string, Pick<TravellerProfile, 'farewell' | 'thanks' | 'chat'>> = {
	leon: {
		farewell: '下一次见面，再让我看看你们变强的样子！……出口往那边？谢谢，喷火龙，我们走！',
		thanks: '你和伙伴每次全力以赴的样子，都让我想认真迎战。这份礼物，留给下一场精彩的对战吧！',
		chat: { reply: '对战总能让人发现伙伴新的力量。下一段路，你想挑战什么？',
			invite: '和你们一起走，肯定能遇到更多精彩的对战。让我也加入吧！',
			join: '好！带路就拜托你了，对战的时候尽管叫我！',
			win: '漂亮！刚才那一步连我都没想到。让我与你同行吧，我还想看看你和伙伴能走多远！',
			loss: '好，先休息一下！伙伴们已经恢复了。记住刚才做得好的地方，下次再全力挑战我！' },
	},
	diantha: {
		farewell: '我该回去准备下一场拍摄了。希望再见面时，还能听你说起新的旅途。',
		thanks: '这一路，你和伙伴始终互相照应。这份小礼物，就当作我珍藏这段时光的纪念吧。',
		chat: { reply: '了解伙伴的心情，和记住它的招式一样重要。你最喜欢和它们一起做什么呢？',
			invite: '听你说这些，我也想亲眼看看了。接下来的路，可以让我和沙奈朵与你同行吗？',
			join: '谢谢。接下来，就让我们一起发现旅途中那些容易错过的小事吧。',
			win: '真精彩，你们的默契不需要任何台词来解释。伙伴已经恢复，这份好伤药请收下。',
			loss: '先给伙伴一个拥抱吧。我已经帮它们恢复好了；下一次，我们还会有不同的相遇。' },
	},
	cynthia: {
		farewell: '前面的遗迹还有些线索等我确认。你们也照顾好自己；下次见面，再交换各自的发现吧。',
		thanks: '和你们同行，让我看见了不同的答案。带上这份礼物，继续写下你与伙伴自己的故事吧。',
		chat: { reply: '同样的一条路，每位训练家都会有不同的发现。接下来，你希望和伙伴了解些什么？',
			invite: '我也想多听听你们的故事。接下来的旅途，让我同行一段吧。',
			join: '那就出发吧。有值得驻足的地方，我们不妨一起看看。',
			win: '很好的判断。你和伙伴给出了属于你们的答案。伙伴已经恢复，这份好伤药留在路上用吧。',
			loss: '输赢会留下问题，也会带来新的认识。伙伴们恢复好了，带着刚才的发现继续前进吧。' },
	},
	ash: {
		farewell: '我们还要去认识更多宝可梦！下次见面，再痛痛快快打一场吧！',
		thanks: '一路上和你们一起对战、一起发现新伙伴，太开心了！这个送给你，继续向前冲吧！',
		chat: { reply: '我也想认识更多宝可梦！下一段路，你最想和伙伴一起做什么？',
			invite: '和你们旅行肯定很有趣！也让我们一起去吧！',
			join: '太好了！大家，一起出发吧！',
			win: '你们好强！我和伙伴都还想继续变强。接下来，让我们与你同行吧！',
			loss: '刚才真是场好对战！伙伴已经恢复了。下次一定还要再来一场，我们都会更强的！' },
	},
};
export const TRAVELLERS = Object.fromEntries(travellerProfiles().map(profile => [profile.id, profile]));
