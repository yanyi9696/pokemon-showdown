import type { RogueRandom } from './biome-pools';
import type { JourneyActivity } from './journey-activities';

export interface SafariResult {
	activity: JourneyActivity;
	caught?: string;
	ended: boolean;
}

/** Native safari rules. Roll once before applying the common outcome to either player. */
export function rollSafariChoice(activity: JourneyActivity, random: RogueRandom, choice: string): SafariResult {
	const a = structuredClone(activity);
	if (!['approach', 'bait', 'next', 'ball', 'leave'].includes(choice)) throw new Error('请选择当前狩猎选项。');
	if (choice === 'approach') {
		a.wary = (a.wary || 0) + 1;
		if (random(100) < 15 + a.wary * 10) a.index = (a.index || 0) + 1;
	}
	if (choice === 'bait') {
		a.bait = Math.min(2, (a.bait || 0) + 1);
		a.wary = Math.max(0, (a.wary || 0) - 1);
	}
	if (choice === 'next') {
		a.index = (a.index || 0) + 1;
		a.wary = 0;
		a.bait = 0;
	}
	if (choice === 'ball') {
		if (!a.balls || !a.safari?.[a.index || 0]) throw new Error('这次狩猎已没有可投球的目标。');
		a.balls--;
		if (random(100) < Math.min(85, 35 + (a.wary || 0) * 15 + (a.bait || 0) * 10)) {
			return { activity: a, caught: a.safari[a.index || 0], ended: true };
		}
		a.index = (a.index || 0) + 1;
	}
	return { activity: a, ended: choice === 'leave' || (a.index || 0) >= 3 || !a.balls };
}

/** This context is created by the server, never accepted from a player command. */
export interface SharedSafariContext {
	result: SafariResult;
	receive: boolean;
}
