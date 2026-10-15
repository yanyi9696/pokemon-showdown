import { EVENT_NAMES, EVENT_TEXT as text, eventOpening, type EventID } from './event-text';
import { SERVICE_TEXT as service, POSTCARDS } from './event-service-text';

interface ReplayPage { text: string[]; options: { label: string, next: string }[]; battleSkipped?: boolean }
export const EVENT_OVERVIEWS: Record<EventID, string> = {
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
	if (id === 'mysteryball') {
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
		page('start', service.travel, [...Object.entries(POSTCARDS).map(([key, card]): [string, string] => [card.name + '明信片', key]),
			['今天先到这里。', 'left']]);
		page('left', ['你收好明信片，向摊主道别。']);
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
