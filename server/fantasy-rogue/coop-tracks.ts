import type { RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { beginLegendaryTracks, chooseLegendaryTracks, legendaryTracksView } from './legendary-tracks';

export function beginCoopTracks(run: RogueRun, random: RogueRandom) {
	run.node = structuredClone(run.node);
	beginLegendaryTracks(run, random);
	return run.node!.event!;
}

export function coopTracksOptions(runs: RogueRun[]) {
	const event = runs[0]?.node?.event;
	if (runs.length !== 2 || event?.id !== 'legendarytracks' || !event.tracks || runs.some(run =>
		run.floor !== runs[0].floor || run.node?.event?.id !== event.id || run.node.event.key !== event.key ||
		run.node.event.stage !== 'choice' || run.node.event.settled ||
		JSON.stringify(run.node.event.tracks) !== JSON.stringify(event.tracks))) return [];
	return legendaryTracksView(runs[0]).options;
}

/** One search, one flight roll, and one persisted encounter for both players. */
export function chooseCoopTracks(runs: RogueRun[], random: RogueRandom, choice: string) {
	if (!coopTracksOptions(runs).some(option => option.id === choice && !option.disabled)) {
		throw new Error('共同追踪进度已变化，请刷新后重选。');
	}
	chooseLegendaryTracks(runs[0], choice, random);
	runs[1].node = structuredClone(runs[0].node);
	runs[1].phase = runs[0].phase;
	runs[1].encounter = runs[0].encounter;
}
