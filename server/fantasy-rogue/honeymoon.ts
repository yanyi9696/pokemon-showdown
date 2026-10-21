import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { makeEncounterSet } from './encounter-sets';
import { lowerToEligibleStage } from './evolution';
import { ensureMemberMemory } from './progression';
import { eventOpening } from './event-text';
import { journeyCoins } from './early-balance';

export interface HoneymoonTrip { region: string; run: string; floor: number; returned?: boolean }
export const HONEYMOON_FLOOR = 80;
export const HONEYMOON_REGIONS = {
	kanto: { name: '关都', place: '华蓝海角与玉虹市', gift: 'nugget',
		team: ['Ninetales', 'Lapras', 'Vileplume', 'Dodrio', 'Poliwrath', 'Raichu'] },
	johto: { name: '城都', place: '缘朱市的古塔与桧皮镇', gift: 'bigpearl',
		team: ['Ampharos', 'Azumarill', 'Heracross', 'Noctowl', 'Bellossom', 'Miltank'] },
	hoenn: { name: '丰缘', place: '凯那海边与茵郁市的树屋', gift: 'pearlstring',
		team: ['Pelipper', 'Ludicolo', 'Altaria', 'Tropius', 'Milotic', 'Flygon'] },
	sinnoh: { name: '神奥', place: '百代森林与立志湖畔', gift: 'starpiece',
		team: ['Roserade', 'Gastrodon', 'Drifblim', 'Lopunny', 'Luxray', 'Floatzel'] },
	unova: { name: '合众', place: '飞云市与帆巴吊桥', gift: 'balmmushroom',
		team: ['Sawsbuck', 'Cinccino', 'Swanna', 'Galvantula', 'Scolipede', 'Stoutland'] },
	kalos: { name: '卡洛斯', place: '密阿雷市与香薰市', gift: 'bigpearl',
		team: ['Florges', 'Furfrou', 'Aromatisse', 'Meowstic', 'Talonflame', 'Heliolisk'] },
	alola: { name: '阿罗拉', place: '好奥乐海滩与马利埃庭园', gift: 'pearlstring',
		team: ['Ribombee', 'Tsareena', 'Oricorio', 'Lurantis', 'Mudsdale', 'Komala'] },
	galar: { name: '伽勒尔', place: '水舟镇与舞姿镇', gift: 'balmmushroom',
		team: ['Alcremie', 'Eldegoss', 'Corviknight', 'Centiskorch', 'Boltund', 'Cramorant'] },
	hisui: { name: '洗翠', place: '群青海岸与红莲湿地', gift: 'starpiece',
		team: ['Arcanine-Hisui', 'Lilligant-Hisui', 'Goodra-Hisui', 'Braviary-Hisui', 'Wyrdeer', 'Kleavor'] },
	paldea: { name: '帕底亚', place: '玻瓶市与南第六区的花田', gift: 'nugget',
		team: ['Dachsbun', 'Arboliva', 'Kilowattrel', 'Farigiraf', 'Cetitan', 'Bellibolt'] },
};
export function honeymoonEligible(run: RogueRun, id: string) {
	if (!['honeymoon', 'honeymoonreturn'].includes(id)) return true;
	if (run.floor < HONEYMOON_FLOOR) return false;
	const trip = run.honeymoon;
	if (id === 'honeymoon') return !trip || !!trip.returned;
	return !!trip && !trip.returned && (trip.run !== run.id || run.floor - trip.floor >= 8);
}
const regionOf = (run: RogueRun) => HONEYMOON_REGIONS[run.honeymoon?.region as keyof typeof HONEYMOON_REGIONS];
export function prepareHoneymoon(run: RogueRun, random: RogueRandom) {
	if (run.node?.event?.id === 'honeymoonreturn') run.node.event.honeymoonHappy = random(100) < 65;
}
export function honeymoonView(run: RogueRun) {
	const event = run.node!.event!;
	if (event.stage !== 'choice') return { paragraphs: event.result || ['新结识的伙伴们跃到路旁，夫妇二人向你摆出了对战的架势。'], options: [] };
	if (event.id === 'honeymoon') return {
		paragraphs: eventOpening('honeymoon'),
		options: Object.entries(HONEYMOON_REGIONS).map(([id, region]) => ({
			id: `region:${id}`, name: `推荐${region.name}地区`, text: region.place, region: id, disabled: false,
		})),
	};
	const region = regionOf(run);
	return { paragraphs: [`熟悉的挂饰在行李边晃了晃。那对夫妇认出了你，笑着挥手：「我们从${region.name}回来了！」`,
		event.honeymoonHappy ? `「${region.place}比想象中还美！旅途中也结识了新伙伴，要不要看看我们的默契？」` :
		'「这趟没有遇到什么特别的事，不过，两个人慢慢走走也很开心。还给你留了一份特产呢。」'],
	options: [{ id: event.honeymoonHappy ? 'honeymoonbattle' : 'honeymoongift',
		name: event.honeymoonHappy ? '就用一场对战欢迎你们回来吧！' : '听起来是段不错的旅行。',
		text: '', region: run.honeymoon?.region, disabled: false }],
	};
}
function souvenirs(run: RogueRun, content: RogueContent) {
	const region = regionOf(run), id = region?.gift || 'bigpearl';
	if (content.items.some(item => item.id === id)) run.bag[id] = (run.bag[id] || 0) + 1;
	run.money += journeyCoins(run.floor, 200 + run.floor * 3);
}
function finishTrip(account: RogueAccount, run: RogueRun) {
	run.honeymoon!.returned = true;
	account.honeymoon = { ...run.honeymoon! };
	Object.assign(run.node!.event!, { stage: 'result', settled: true });
	run.phase = 'event';
}
export function chooseHoneymoon(
	account: RogueAccount, run: RogueRun, content: RogueContent, random: RogueRandom, choice: string
) {
	const event = run.node!.event!;
	if (event.id === 'honeymoon') {
		const region = choice.slice(7) as keyof typeof HONEYMOON_REGIONS;
		if (!choice.startsWith('region:') || !HONEYMOON_REGIONS[region]) throw new Error('请选择一个旅行地区。');
		run.honeymoon = { region, run: run.id, floor: run.floor };
		account.honeymoon = { ...run.honeymoon };
		run.money += journeyCoins(run.floor, 150 + run.floor * 2 + random(4) * 50);
		if (content.items.some(item => item.id === 'superpotion')) run.bag.superpotion = (run.bag.superpotion || 0) + 1;
		Object.assign(event, { stage: 'result', settled: true, result: [
			`「那就去${HONEYMOON_REGIONS[region].name}吧！」他们把地图折好，将一份小小的谢礼放进你的手里。`,
			'「多谢你的建议。如果之后还能遇见，一定把旅行的故事讲给你听！」二人牵起手，向远处走去。'] });
		return;
	}
	if (choice === 'honeymoongift') {
		souvenirs(run, content); finishTrip(account, run);
		event.result = ['两人从行李里取出一份包得整整齐齐的礼物。', '「这是带给你的特产。」告别后，你又踏上了旅程。'];
		return;
	}
	if (choice !== 'honeymoonbattle' || !event.honeymoonHappy) throw new Error('当前无法开始这场对战。');
	const pool = [...regionOf(run).team];
	const team: PokemonSet[] = [], level = Math.min(100, Math.ceil(run.floor / 2));
	while (team.length < 3) {
		team.push(makeEncounterSet(lowerToEligibleStage(pool.splice(random(pool.length), 1)[0], level), level, 25));
	}
	run.node!.encounters = [{ key: event.key, name: '蜜月归来的夫妇', team, catchable: false, style: 'balanced',
		trainer: { id: 'honeymooncouple', name: '蜜月归来的夫妇', avatar: 'youngcouple', role: 'traveller', tera: false } }];
	run.encounter = 0; event.stage = 'battle'; run.phase = 'ready';
}
export function settleHoneymoon(account: RogueAccount, run: RogueRun, content: RogueContent, won: boolean) {
	const event = run.node!.event!;
	if (event.id !== 'honeymoonreturn' || event.settled || event.stage !== 'battle') return;
	for (const mon of run.team) {
		ensureMemberMemory(mon);
		mon.hp = mon.maxhp; mon.status = '';
		mon.statusState = {}; delete mon.statuses;
		for (const move of [...mon.pp, ...(mon.moveMemory || []), ...(mon.blessingPP || [])]) move.pp = move.maxpp;
	}
	souvenirs(run, content); finishTrip(account, run);
	event.result = [won ? '「真厉害！看来我们还要和伙伴多旅行几次才行。」' : '「谢谢你陪我们对战！这一路，大家真的成长了不少呢。」',
		'夫妇俩取出旅行用的护理用品，细心地让你的全队恢复了全部状态。',
		'「这是带给你的特产。」他们把礼物递给你，又开始商量下一次旅行。'];
}
