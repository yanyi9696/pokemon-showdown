import { randomUUID } from 'crypto';
import { Dex } from '../../sim/dex';
import type { RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { makeEncounterSet, randomEncounterIVs } from './encounter-sets';
import { minimumEvolutionLevel } from './evolution';
import { eventOpening } from './event-text';

const dex = Dex.mod('gen9');
export const LEGENDARY_TRACKS_FLOOR = 51;
export interface LegendaryTracks { species: string; answer: number; tried: number[]; sites: string[] }
/** Later floors add restricted legends and raise their share without removing other rarities. */
export function legendaryTrackPool(floor: number) {
	if (floor < LEGENDARY_TRACKS_FLOOR) return [];
	const level = Math.max(3, Math.min(100, Math.ceil(floor / 2)));
	return dex.species.all().filter(s => !s.forme && !s.battleOnly && !s.evos.length &&
		(!s.isNonstandard || s.isNonstandard === 'Past') &&
		s.tags.some(tag => ['Sub-Legendary', 'Restricted Legendary', 'Mythical', 'Ultra Beast', 'Paradox'].includes(tag)) &&
		minimumEvolutionLevel(s.name) <= level && (floor >= 101 || !s.tags.includes('Restricted Legendary')))
		.map(s => ({ species: s.name, weight: s.tags.includes('Restricted Legendary') ? (floor >= 151 ? 4 : 2) :
		s.tags.includes('Mythical') ? (floor >= 101 ? 3 : 1) : 4 }));
}
export function beginLegendaryTracks(run: RogueRun, random: RogueRandom) {
	const pool = legendaryTrackPool(run.floor);
	if (!pool.length) throw new Error('当前楼层还没有传说足迹。');
	let roll = random(pool.reduce((sum, entry) => sum + entry.weight, 0));
	const selected = pool.find(entry => (roll -= entry.weight) < 0)!;
	const types = dex.species.get(selected.species).types;
	const sites = types.includes('Water') || types.includes('Ice') ? ['雾中的湖心', '结霜的石洞', '潮湿的古树', '瀑布后的岩台'] :
		types.includes('Fire') || types.includes('Ground') ? ['温热的山洞', '风化的石门', '黑沙覆盖的坡顶', '山脚的旧祭坛'] :
		types.includes('Flying') || types.includes('Dragon') ? ['云雾中的山巅', '风吹过的石柱', '崖边的树冠', '高台下的古道'] :
		['月光下的遗迹', '静寂的林间空地', '泛着微光的洞口', '被藤蔓遮住的石门'];
	run.node!.event = { id: 'legendarytracks', key: randomUUID(), stage: 'choice',
		tracks: { species: selected.species, answer: random(sites.length), sites, tried: [] } };
	run.node!.name = '追寻传说宝可梦的足迹'; run.node!.reward = { money: 0, items: {} }; run.phase = 'event';
}
export function legendaryTracksView(run: RogueRun) {
	const event = run.node!.event!, tracks = event.tracks!;
	const option = (id: string, name: string) => ({ id, name, text: '', disabled: false });
	return { title: '追寻传说宝可梦的足迹', paragraphs: event.result || eventOpening('legendarytracks'),
		options: event.stage !== 'choice' ? [] : !event.committed ?
			[option('investigate', '放轻脚步，追寻足迹。'), option('leave', '把线索留给调查员。')] :
			tracks.sites.flatMap((site, i) => tracks.tried.includes(i) ? [] : [option(`site:${i}`, `前往${site}。`)]) };
}
export function chooseLegendaryTracks(run: RogueRun, choice: string, random: RogueRandom) {
	const event = run.node!.event!, tracks = event.tracks!;
	event.key = randomUUID();
	if (choice === 'leave') {
		event.stage = 'result'; event.settled = true;
		event.result = ['你向调查员道谢，轻轻离开了这片寂静的地方。']; return;
	}
	event.committed = true;
	if (choice === 'investigate') {
		event.result = ['足迹在岔路口变得模糊。你让伙伴放轻脚步，仔细观察几个可能的去处。']; return;
	}
	const index = Number(choice.slice(5));
	if (index === tracks.answer) {
		event.stage = 'battle';
		event.result = [`走到${tracks.sites[index]}，你停住脚步。一个罕见的身影缓缓转过头，与伙伴的目光相遇。`,
			'调查员屏住了呼吸。你握紧精灵球，向它发出了挑战。'];
		const node = run.node!;
		delete node.wildLoot; delete node.spiritPrepared; delete node.blessingPrepared;
		node.encounters = [{ key: randomUUID(), name: '传说的身影', catchable: true, style: 'balanced',
			team: [makeEncounterSet(tracks.species, Math.min(100, Math.ceil(run.floor / 2)), randomEncounterIVs(random))] }];
		run.encounter = 0; run.phase = 'ready'; return;
	}
	tracks.tried.push(index);
	if (random(100) < 35) {
		event.stage = 'result'; event.settled = true;
		event.result = ['一截枯枝在脚下折断。远处传来一声鸣叫，风中最后的气息也消失了。',
			'调查员合上手册：「看来今天只能到这里了。下次，我们再轻一些。」'];
	} else {
		event.result = [`${tracks.sites[index]}只留下了旧痕迹。你悄悄退回岔路口，远处的动静还没有消失。`,
			tracks.tried.length >= 2 ? `伙伴仔细嗅了嗅，望向${tracks.sites[tracks.answer]}。` : '新的足迹，比刚才看得更清楚了一些。'];
	}
}
export function settleLegendaryTracks(run: RogueRun, won: boolean) {
	const event = run.node!.event!;
	event.stage = 'result'; event.settled = true;
	event.key = randomUUID(); run.phase = 'event';
	event.result = [won ? '相遇终于告一段落。调查员兴奋地记下这一幕，向你和伙伴道谢。' :
		'那个身影消失在远处。调查员扶你坐下：「先照顾伙伴吧。能亲眼见到它，已经是很难得的经历了。」'];
}
