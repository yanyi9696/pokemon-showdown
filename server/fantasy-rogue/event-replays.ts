import { EVENT_NAMES, EVENT_TEXT as text, eventOpening, type EventID } from './event-text';

interface ReplayPage { text: string[]; options: { label: string, next: string }[]; battleSkipped?: boolean }
export const EVENT_OVERVIEWS: Record<EventID, string> = {
	mysteryball: '草丛里的一颗宝可梦球，可能装着一位新伙伴，也可能藏着麻烦。',
	forest: '两队宝可梦为果实争吵。声援一方，还是上前调解？',
	mushrooms: '大树后的陌生人兜售魔法蘑菇。交换、验货，或者转身离开。',
	room: '一间打不开门的房间，一个催促战斗的声音。也许还可以再睡一会儿。',
};

/** A dialogue graph only: no RNG, account access, combat calls, or reward commands. */
export function eventReplay(id: EventID) {
	const pages: Record<string, ReplayPage> = {};
	const page = (key: string, paragraphs: string[], options: [string, string][] = [], battleSkipped = false) => {
		pages[key] = { text: paragraphs, options: options.map(([label, next]) => ({ label, next })), battleSkipped };
	};
	const possibilities = (key: string, options: [string, string][]) => page(key, ['选择想回顾的后续发展。'], options);
	const battle = (key: string, intro: string, room = false) => {
		page(key, [intro], [['战斗获胜', room ? 'roomwin' : 'win'], ['战败', 'lose'], ['退出战斗', 'retreat']], true);
	};
	page('win', [text.fightWin]);
	page('roomwin', [text.roomWin, '获得工具箱 ×1（四件选一件）和幻想碎片，碎片数量随楼层增加。']);
	page('lose', [text.fightLose, text.fightLossRule]);
	page('retreat', [text.fightRetreat, text.fightLossRule]);
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
	} else {
		page('start', eventOpening(id), [['不战斗就无法生存！', 'battle'], ['那种事情不要啊！', 'sleep']]);
		battle('battle', text.roomFight, true);
		page('sleep', [text.sleep], [['床边的礼物', 'gift'], ['无事发生', 'nothing'], ['背包变轻了', 'lost']]);
		page('gift', [text.sleepGift]); page('nothing', [text.sleepNothing]); page('lost', [text.sleepLost('一些')]);
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
