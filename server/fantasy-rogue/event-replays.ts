import { EVENT_NAMES, EVENT_TEXT as text, eventOpening, type EventID } from './event-text';
import { SERVICE_TEXT as service, POSTCARDS } from './event-service-text';
import { HONEYMOON_REGIONS } from './honeymoon';

interface ReplayPage { text: string[]; options: { label: string, next: string }[]; battleSkipped?: boolean }
export const EVENT_OVERVIEWS: Record<EventID, string> = {
	honeymoon: '第 80 层起，为一对新婚夫妇推荐旅行地区，收下一份小谢礼，永久解锁后续归程事件。',
	honeymoonreturn: '完成旅行建议后，至少再前进 8 层才可能重逢。归来的夫妇带来地区特产；若展开友谊对战，胜负均为全队恢复状态。',
	skiing: '左右换道躲避障碍，在 30 秒雪道挑战中坚持越久，收获越好。',
	stones: '逐块或连续开启原石，可能开出进化石、道具、化石、宝石和珍贵战利品，也可能没有收获。',
	feathers: '交换美丽之羽，或展示拥有羽毛的伙伴，获得一份观察谢礼。',
	mushroomcollector: '高价收购蘑菇，也乐意给带着蘑菇伙伴的旅人一份小礼物。',
	legendarytracks: '51 层起追寻罕见宝可梦。选错地点可能惊走目标；越深入高塔，越可能遇到传说中的强大身影。',
	fantasytutor: '第 81 层起，消耗少量幻想碎片，请研究员教会幻想伙伴一个合法的幻想招式。',
	exclusiveclue: '追寻专属道具的线索。排除错误地点后，藏匿的宝可梦也会露出身影。',
	exclusivechallenge: '专属道具的持有者想亲自检验你与伙伴的实力。',
	auction: '看清对手的预算，在一声声加价中争取心仪的拍品。',
	bandits: '半边脸布满伤疤的山贼，想用一枚硬币决定你的去留。',
	dice: '热闹集市上的骰盅摊，大奖似乎就在下一把。',
	fishing: '湖边的钓鱼佬借你一根鱼竿，邀你试试今天的手气。',
	mysteryball: '草丛里的一颗宝可梦球，可能装着一位新伙伴，也可能藏着麻烦。',
	forest: '两队宝可梦为果实争吵。声援一方，还是上前调解？',
	mushrooms: '大树后的陌生人兜售魔法蘑菇。交换、验货，或者转身离开。',
	room: '一间打不开门的房间，一个催促战斗的声音。也许还可以再睡一会儿。',
	travel: '旅游摊位的一张明信片，带来一段从未发生过的旅行记忆。',
	martial: '山崖边的武学家问你：技巧和力量，哪个更重要？',
	tutor: '一位自称学会所有招式的旅行少女，正用教学换取路费。',
};

/** A dialogue graph only: no RNG, account access, combat calls, or reward commands. */
export function eventReplay(id: EventID) {
	const pages: Record<string, ReplayPage> = {};
	const page = (key: string, paragraphs: string[], options: [string, string][] = [], battleSkipped = false) => {
		pages[key] = { text: paragraphs, options: options.map(([label, next]) => ({ label, next })), battleSkipped };
	};
	const possibilities = (key: string, options: [string, string][]) => page(key, ['选择想回顾的后续发展。'], options);
	const battle = (key: string, intro: string, room = false) => {
		page(key, [intro], [['战斗获胜', room ? 'roomwin' : 'win'], ['战败', 'lose']], true);
	};
	page('win', [text.fightWin]);
	page('roomwin', [text.roomWin, '获得工具箱 ×1（四件选一件）和幻想碎片，碎片数量随楼层增加。']);
	page('lose', [text.fightLose, text.fightLossRule]);
	if (id === 'honeymoon' || id === 'honeymoonreturn') {
		page('start', eventOpening(id), id === 'honeymoon' ? Object.entries(HONEYMOON_REGIONS).map(([key, region]) =>
			[`推荐${region.name}地区`, `recommend:${key}`]) : [['听听旅行故事', 'return']]);
		for (const [key, region] of Object.entries(HONEYMOON_REGIONS)) {
			page(`recommend:${key}`, [`夫妇将${region.name}圈在地图上，送给你小额金币与恢复用品，约定以后再分享旅途故事。`]);
		}
		page('return', ['夫妇从你推荐的地区归来，带来当地特产。'], [['旅途特别愉快，展示新伙伴', 'friendlybattle'], ['平静而开心的旅程', 'souvenir']]);
		page('friendlybattle', ['与推荐地区的伙伴进行一场友谊对战。'], [['获胜', 'souvenirwin'], ['落败', 'souvenirlose']], true);
		page('souvenirwin', ['「真厉害！」夫妇让你的全队恢复全部状态，再递来礼物：「这是带给你的特产。」']);
		page('souvenirlose', ['「谢谢你陪我们对战！」夫妇让你的全队恢复全部状态，再递来礼物：「这是带给你的特产。」']);
		page('souvenir', ['夫妇递来礼物：「这是带给你的特产。」']);
	} else if (id === 'skiing') {
		page('start', eventOpening(id), [['穿好护具，滑向山脚！', 'slide'], ['先在山脚欣赏雪景。', 'leave']]);
		page('slide', ['树木与岩石从雪道两旁掠过。你调整重心，在三个方向之间换道。'], [['撞到障碍', 'crash'], ['坚持到山脚', 'finish']]);
		page('crash', ['巡山员把你从松软的雪里拉出，按坚持的时间送上一份鼓励。']);
		page('finish', ['终点的旗子迎风展开。你收到了金币、经验糖果与活力碎片。']);
		page('leave', ['你在安全的山脚欣赏雪景，挥手向巡山员道别。']);
	} else if (id === 'stones') {
		page('start', eventOpening(id), [['只开一块', 'openstone'], ['连开五块', 'openstone'], ['今天先不买。', 'leave']]);
		page('openstone', ['付过费用，摊主举起石锤。石屑纷纷落下……'], [['获得物品', 'prize'], ['没有收获', 'empty']]);
		page('prize', ['原石里藏着进化道具、宝石、化石或其他珍品。摊主又推过几块石头，邀请你继续。']);
		page('empty', ['这次没有开出东西。摊主仍怂恿你再试一次，你可以决定继续或收手。']);
		page('leave', ['你收好钱袋，离开了原石摊位。']);
	} else if (id === 'feathers') {
		page('start', eventOpening(id), [['用美丽之羽交换训练羽毛', 'trade'], ['展示带羽毛的伙伴', 'show'], ['把这次机会留到下次。', 'leave']]);
		page('trade', ['爱好者把 5 根美丽之羽夹进册子，送给你 6 根随机能力羽毛。']);
		page('show', ['爱好者认真画下伙伴羽毛的纹路，送给你美丽之羽和一份观察谢礼。']);
		page('leave', ['你与爱好者约好，下次再带伙伴过来。']);
	} else if (id === 'mushroomcollector') {
		page('start', eventOpening(id), [['展示蘑菇伙伴', 'show'], ['看看蘑菇的回收价', 'shop']]);
		page('show', ['收藏家赞叹着伙伴的菌伞，送出小蘑菇与观察谢礼。'], [['查看回收价', 'shop']]);
		page('shop', ['收藏家以普通商店 125% 的价格回收蘑菇。你可以按种类和数量出售，再继续旅程。']);
	} else if (id === 'legendarytracks') {
		page('start', eventOpening(id), [['放轻脚步，追寻足迹。', 'sites'], ['把线索留给调查员。', 'leave']]);
		page('sites', ['足迹在几条岔路间变得模糊。你决定前往一处地点。'], [['找到目标', 'found'], ['选错地点但目标未离开', 'clue'], ['目标被惊走', 'gone']]);
		page('clue', ['只找到旧痕迹，但远处的动静还没有消失。'], [['继续追踪', 'sites']]);
		page('found', ['一个罕见的身影与伙伴的目光相遇。你握紧精灵球，向它发出了挑战。'], [['对战结束', 'end']], true);
		page('gone', ['枯枝折断，远处的身影消失了。调查员提醒你，下次再轻一些。']);
		page('end', ['调查员记下这次珍贵的相遇，与你道别。']);
		page('leave', ['你将线索留给调查员，继续前行。']);
	} else if (id === 'fantasytutor') {
		page('start', eventOpening(id), [['请指导我们的伙伴。', 'partner'], ['这次先向你请教理论。', 'leave']]);
		page('partner', ['「挑一位幻想伙伴吧。我只能教它本来就能够掌握的招式。」'], [['选定伙伴与招式', 'learn'], ['没有尚未掌握的招式', 'known']]);
		page('learn', ['你交出 10 枚幻想碎片。碎片化成细碎的光，伙伴学会了新的幻想招式。', '「记住这种感觉。下次，我们再试试新的可能。」']);
		page('known', ['研究员翻遍笔记，笑着摇摇头：「这些你们已经学会了。真是了不起的伙伴！」']);
		page('leave', ['研究员在笔记上画下几个要点，你向他道谢，继续前行。']);
	} else if (id === 'exclusiveclue') {
		page('start', eventOpening(id), [['跟着伙伴寻找线索。', 'sites'], ['记下这里，继续赶路。', 'leave']]);
		page('sites', ['一张发黄的纸片提到伙伴的专属道具。你端详地上的痕迹，四处地方都有些可疑。'], [['猜中了藏匿处', 'found'], ['惊动野生宝可梦', 'attack'], ['第三次仍选错了', 'elite']]);
		page('attack', ['袭击者从暗处跃出。先应付眼前的袭击，再仔细看清那些痕迹。'], [['战斗后继续寻找', 'clearer']], true);
		page('elite', ['一个格外强壮的身影挡在眼前。它似乎一直守着最后的线索。'], [['战斗后继续寻找', 'clearer']], true);
		page('clearer', ['散落的纸片露出更清晰的痕迹。你排除错误地点，终于找到属于伙伴的道具。']);
		page('found', ['伙伴兴奋地叫了起来。你第一次就找对了地方，把专属道具收进背包。']);
		page('leave', ['你记下那张纸片，继续走向塔的深处。']);
	} else if (id === 'exclusivechallenge') {
		page('start', eventOpening(id), [['迎战', 'fight']]);
		page('fight', ['「让我亲眼看看，你们能不能承担它的力量！」精灵球划过半空。'], [['胜利', 'gift'], ['落败', 'later'], ['逃跑后重新准备', 'prepare']], true);
		page('gift', ['训练家认真地点了点头：「我看到了。交给你们，我很放心。」你接过了专属道具。']);
		page('later', ['「还差一点。先照顾好伙伴，过一段路，我会再来测试你们的实力。」']);
		page('prepare', ['你带着伙伴退到一旁。体力和道具消耗仍然保留，这场考验还在等你。']);
	} else if (id === 'auction') {
		page('start', eventOpening(id), [['坐下参加竞拍。', 'bids'], ['看过拍品，继续赶路。', 'leave']]);
		page('bids', ['你看清了竞拍者的预算。行商怕吃亏，收藏家受不得激将，训练家只肯为合用的东西加价。'], [['施压后继续加价', 'won'], ['激将对手，再放弃竞拍', 'rival']]);
		page('won', ['对手迟疑着放下牌子。小槌落下，你支付报价，收好拍得的物品。']);
		page('rival', ['收藏家举高牌子。你退了下来，看着他付出金币，等待下一件拍品。']);
		page('leave', ['你向摊主点点头，继续赶路。']);
	} else if (id === 'bandits') {
		page('start', eventOpening(id), [['拼运气的时候到了！', 'coin'], ['给这个走错片场的家伙一点教训。', 'fight'], ['好汉有话好好说。', 'plead']]);
		possibilities('coin', [['正面', 'free'], ['反面', 'robbed']]);
		page('free', ['硬币正面朝上。男人挥了挥手，这伙人居然真的放你走了。']);
		page('robbed', ['硬币反面朝上，山贼搜走了一些金币。']);
		page('plead', ['你话还没说完，就被人从背后击晕。醒来后，身上的金币少了一些。']);
		page('fight', ['你挣开束缚，抛出精灵球。'], [['胜利', 'victory'], ['战败', 'failure']], true);
		page('victory', ['山贼横七竖八地倒了一地。你索性搜出财物，装进背包。']);
		page('failure', ['你被攻击击晕。醒来后，更多金币被搜走了。']);
	} else if (id === 'dice') {
		page('start', eventOpening(id), [['是时候展现真正的技术了。', 'roll'], ['我对大奖是什么更加好奇。', 'buy'], ['这种骗局只有小孩会中招。', 'leave']]);
		page('roll', ['你付了入场费，摇响骰盅。'], [['6 点', 'grand'], ['1 点', 'small'], ['2～5 点', 'nothing']]);
		page('grand', ['摊主的笑容僵了一下，还是递来了大奖。']);
		page('small', ['「最小点数也有奖！」摊主递来一份小些的奖品。']);
		page('nothing', ['这次没有奖品。你摆摆手，离开了摊位。']);
		page('buy', ['摊主说大奖也能直接购买。你付了钱，拿到一个包裹。']);
		page('leave', ['你摇摇头，离开了摊位。']);
	} else if (id === 'fishing') {
		page('start', eventOpening(id), [['借我试试！', 'fish'], ['今天就看你钓吧。', 'leave']]);
		page('fish', ['你看着浮标，试着控制收线的时机。'], [['钓到伙伴', 'friend'], ['钓到精英', 'elite'], ['钓到藏宝袋', 'bag'], ['没有钓到', 'empty']]);
		page('friend', ['一只宝可梦跃上岸。钓鱼佬竖起拇指：「看来它很喜欢你！」']);
		page('elite', ['被拉上岸的精英摆出战斗姿势。'], [['获胜', 'won'], ['战败', 'lost']], true);
		page('won', ['湖面恢复安静。「这可真是条大家伙！」钓鱼佬送来额外的金币，庆祝你捕捉或击败了精英。']);
		page('lost', ['宝可梦跃回水中。「这条太凶了，下次换个地方！」']);
		page('bag', ['你和钓鱼佬拆开湿漉漉的藏宝袋，把里面的物资收进背包。']);
		page('empty', ['鱼线轻飘飘地收了回来。钓鱼佬拍拍你的肩膀，送来一点零钱：「就当今天的收获！」']);
		page('leave', ['你在岸边看了一会儿，挥手道别。']);
	} else if (id === 'mysteryball') {
		page('start', eventOpening(id), [['或许我该打开看看。', 'open'], ['不明来路的东西最好不要碰。', 'leave']]);
		possibilities('open', [['新伙伴', 'friend'], ['一颗空球', 'empty'], ['不愿被打扰', 'grumpy'], ['突然袭击', 'battle']]);
		page('friend', [text.ballFriend]); page('empty', [text.ballEmpty]); page('grumpy', [text.ballGrumpy]);
		battle('battle', text.ballFight);
		possibilities('leave', [['平安离开', 'safe'], ['沿路发现补给', 'supplies']]);
		page('safe', [text.leaveBall]); page('supplies', [text.leaveBallGift]);
	} else if (id === 'forest') {
		page('start', eventOpening(id), [['声援左边的队伍。', 'watch'], ['声援右边的队伍。', 'watch'], ['站出来调解它们的矛盾。', 'mediate']]);
		page('watch', ['两队宝可梦的战斗开始了。'], [['支持方获胜', 'cheerwin'], ['支持方落败', 'battle'], ['双方平手', 'tie']], true);
		page('cheerwin', [text.cheerWin]); page('tie', [text.tie]); battle('battle', text.cheerLose);
		possibilities('mediate', [['双方散去', 'scatter'], ['接受调解', 'gift'], ['双方都生气了', 'angry']]);
		page('scatter', [text.mediateLeave]); page('gift', [text.mediateGift]); battle('angry', text.mediateFight);
	} else if (id === 'mushrooms') {
		page('start', eventOpening(id), [['好吧，我和你交换。', 'trade'], ['等等，我要先验货。', 'taste'], ['不了，你有点奇怪。', 'leave']]);
		possibilities('trade', [['拿到蘑菇', 'mushrooms'], ['改换物资', 'other']]);
		page('mushrooms', [text.tradeMushrooms]); page('other', [text.tradeOther]);
		page('taste', [text.taste], [['醒来后充满活力', 'vitality'], ['醒来后丢失金币', 'lost']]);
		page('vitality', [text.vitality, text.vitalityEffect]); page('lost', [text.tasteLost('一些')]);
		page('leave', [text.leaveMushrooms]);
	} else if (id === 'room') {
		page('start', eventOpening(id), [['不战斗就无法生存！', 'battle'], ['那种事情不要啊！', 'sleep']]);
		battle('battle', text.roomFight, true);
		page('sleep', [text.sleep], [['床边的礼物', 'gift'], ['无事发生', 'nothing'], ['背包变轻了', 'lost']]);
		page('gift', [text.sleepGift]); page('nothing', [text.sleepNothing]); page('lost', [text.sleepLost('一些')]);
	} else if (id === 'travel') {
		page('start', service.travel, Object.entries(POSTCARDS).map(([key, card]): [string, string] => [card.name + '明信片', key]));
		for (const [key, card] of Object.entries(POSTCARDS)) {
			page(key, [card.text], [['触碰明信片', key + 'paths']]);
			page(key + 'paths', [card.scene], [['走大路', 'road'], ['走小路', 'professor']]);
		}
		page('road', ['一只当地的地区形态精英挡住去路。幻境结束后恢复战前消耗，仅保留捕捉与实际经验。'],
			[['捕捉成功', 'caught'], ['击倒精英', 'defeated'], ['战败', 'memoryloss']], true);
		page('caught', service.travelCatch); page('defeated', service.travelWin); page('memoryloss', service.travelLose);
		page('professor', service.professor, [['队伍中有可转换的伙伴', 'swap'], ['没有可转换的伙伴', 'adopt']]);
		page('swap', ['「咦，我还没见过这个样子！你愿意和我交换吗？」', '博士展示对应地区形态。这里只改变原伙伴的形态与招式池，培养记录保留。'],
			[['同意交换', 'swapped'], ['拒绝交换', 'declined']]);
		page('swapped', service.travelSwap); page('declined', service.travelLeave);
		page('adopt', service.adopt, [['我来照顾吧', 'adopted'], ['暂时照顾不过来', 'declined']]);
		page('adopted', service.travelGift);
	} else if (id === 'martial') {
		page('start', service.martial, [['技巧更重要。', 'skill'], ['力量更重要。', 'power'], ['今天先到这里。', 'left']]);
		page('skill', [...service.skill, '选择一只已有努力值的伙伴，免费重配全部已有努力值一次，总量不变。'], [['完成教学', 'trained']]);
		page('trained', service.skillDone); page('left', service.powerLeave);
		page('power', service.power, [['挑战获胜', 'victory'], ['挑战战败', 'failure']], true);
		page('victory', [...service.powerWin, '全队每只获得随楼层递增的 8～24 点努力值，自选分配新增点数。', ...service.powerDone]);
		page('failure', service.powerLose);
	} else if (id === 'tutor') {
		page('start', service.tutor, [['先露两手看看。', 'demo'], ['求求你，教教我们吧。', 'ask'], ['这个招式，你也会吗？', 'fantasy'], ['今天先到这里。', 'left']]);
		page('demo', [...service.demo, '全队每只随机学习一个合法且尚未掌握的招式，不限传授来源；按提前显示的总价付款。']);
		page('ask', service.beg, [['选择收费传授招式', 'paid'], ['选择指定免费招式', 'free']]);
		page('paid', service.paid); page('free', [...service.free,
			'免费清单：草之誓约、火之誓约、水之誓约、铁蹄光线、流星群、爆炸烈焰、疯狂植物、加农水炮、神秘之剑、画龙点睛；仍需合法且尚未掌握。']);
		page('fantasy', service.fantasy, [['挑战获胜', 'victory'], ['战败', 'failure']], true);
		page('victory', [...service.tutorWin, '全队每只可自选一个合法且尚未掌握的招式，不限来源。'], [['完成教学', 'done']]);
		page('done', service.tutorDone); page('failure', service.tutorLose); page('left', service.tutorLeave);
	}
	const shardBranches = id === 'forest' ? ['cheerwin', 'gift'] : id === 'room' ? ['roomwin'] : id === 'bandits' ? ['victory'] : [];
	for (const branch of shardBranches) {
		pages[branch].options.push({label: '回顾中期的碎片选择', next: 'fragments'});
	}
	if (shardBranches.length) {
		page('fragments', ['第 51 层起，部分成功结局可以在幻想碎片与原有物资之间选择一份。'],
			[['带走幻想碎片', 'fragmentreward'], ['带走原有物资', 'originalreward']]);
		page('fragmentreward', ['你收好了发光的碎片，继续上路。']);
		page('originalreward', ['你收下了物资，继续上路。']);
	}
	// Ship only pages reachable from this event, so the archive cannot reveal unrelated events.
	const reachable: Record<string, ReplayPage> = {};
	const visit = (key: string) => {
		if (reachable[key]) return;
		reachable[key] = pages[key];
		for (const option of pages[key].options) visit(option.next);
	};
	visit('start');
	return { title: EVENT_NAMES[id], start: 'start', pages: reachable };
}
