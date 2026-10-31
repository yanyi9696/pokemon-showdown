/** Mark speech explicitly; presentation can distinguish it from narration without guessing keywords. */
export function characterSpeech(text: string) {
	if (!text) return '';
	if (/[⌈「]/.test(text)) return text.replace(/「([^」]*)」/g, '⌈$1⌋');
	return `⌈${text}⌋`;
}
const QUIET_GESTURES: Record<string, string> = {
	marnie: '玛俐把莫鲁贝可抱稳了些，等你走到身旁才开口。',
	iono: '奇树暂时收起直播设备，朝你轻轻招了招手。',
	bea: '彩豆结束热身，把并排的两只坐垫摆正。',
	lana: '水莲收好钓线，给你留出靠水的一侧。',
	lillie: '莉莉艾整理了一下帽檐，从包里取出仔细收好的礼物。',
	gladion: '格拉吉欧倚在栏杆旁，见你走近，便收起了精灵球。',
	kieran: '乌栗将手中的礼物换了一只手拿，终于鼓起勇气看向你。',
	carmine: '丹瑜把准备好的东西递过来，目光却先落在你的伙伴身上。',
	lusamine: '露莎米奈放下旅途笔记，微笑着替你拂去肩上的一点落叶。',
	sada: '奥琳合上记录本。此刻，她的目光没有停在研究数据上。',
	turo: '弗图关掉了投影。安静下来后，你才听见伙伴们在一旁休息的声音。',
	nessa: '露璃娜将一缕头发拨到耳后，给你让出身边的位置。',
	olivia: '丽姿把挑好的石头放到掌心，笑着等你走近。',
	giovanni: '坂木将精灵球收回腰间，示意你在对面坐下。',
};
export function affectionNarration(id: string, name: string, stage: number) {
	return (QUIET_GESTURES[id] || `${name}停下脚步，等你和伙伴来到身边。`) +
		(stage === 100 ? '这一次，谁也没有急着提起下一场对战。' : '一路相处的点滴，似乎都藏在这份心意里。');
}
