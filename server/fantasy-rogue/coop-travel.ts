import { randomUUID } from 'crypto';
import { normalizeBlessings } from './blessings';
import { conversionChoices, regionalGift, restoreTravelBattle } from './event-travel';
import { createRoguePokemon, initializeExperience } from './progression';
import type { RogueRandom } from './biome-pools';
import type { RogueBattleResult, RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueContent, RogueRun } from './types';
import type { RogueEvent } from './events';

/** Region, postcard confirmation and route are common decisions; individual targets follow the small path. */
export function sharedTravelStep(event: RogueEvent) {
	return event.id === 'travel' && event.stage === 'choice' &&
		['', 'postcard', 'paths'].includes(event.service?.step || '');
}

/** Draw one offer for all owners without a convertible partner, without advancing either real join counter. */
export function sharedTravelGift(runs: RogueRun[], content: RogueContent, random: RogueRandom) {
	const recipient = runs.find(run => !conversionChoices(run, run.node!.event!.service!.region!).length);
	if (!recipient) return undefined;
	return regionalGift(structuredClone(recipient), content, recipient.node!.event!.service!.region!, random);
}

export function prepareTravelGift(run: RogueRun, template: RoguePokemon) {
	const event = run.node!.event!, region = event.service!.region!;
	if (conversionChoices(run, region).length) return;
	const mon = createRoguePokemon(structuredClone(template.set), run.boosts, randomUUID(), template.stars);
	mon.joinOrder = normalizeBlessings(run).nextJoin++;
	initializeExperience(mon);
	event.service!.partner = mon;
}

/** Only actual experience and already committed captures survive a completed memory encounter. */
export function restoreCoopTravel(run: RogueRun, result: RogueBattleResult, partner: boolean) {
	const memory = run.node!.event!.memory;
	if (!memory) throw new Error('旅行战斗缺少本人的战前恢复记录。');
	const originalIds = new Set(memory.team.map(mon => mon.id));
	// Capture callbacks can save newcomers before the final result packet. Do not discard or duplicate them.
	const newcomers = run.team.filter(mon => !originalIds.has(mon.id));
	restoreTravelBattle(run, partner ? { ...result, defeated: result.defeated?.map(defeated => ({
		...defeated, dragonKing: defeated.partnerDragonKing,
	})) } : result);
	run.team.push(...newcomers);
}
