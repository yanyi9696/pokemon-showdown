import { randomUUID } from 'crypto';
import type { RogueRun } from './types';
import { ensureMemberMemory } from './progression';

export interface NarrativePage {
	scene: string;
	title: string;
	text: string;
	speaker?: string;
	avatar?: string;
	pokemon?: string;
	portrait?: string;
	expression?: 'neutral' | 'approval';
	side?: 'left' | 'right';
	/** Actual, already committed affinity. Only the first answer page carries the delta. */
	affection?: number;
	affectionGain?: number;
}
/** Presentation only: rewards and healing must already be committed before this queue is shown. */
export function queueNarrative(run: RogueRun, pages: NarrativePage[], resume: NonNullable<RogueRun['dialogue']>['resume']) {
	run.dialogue = { key: randomUUID(), pages: pages.map(page => {
		const affection = page.portrait ? run.trainerBonds?.[page.portrait]?.score : undefined;
		return affection === undefined ? page : { ...page, affection };
	}), resume };
}
export function healNarrativeParty(run: RogueRun) {
	for (const mon of run.team) {
		if (mon.egg) continue;
		ensureMemberMemory(mon);
		mon.hp = mon.maxhp; mon.status = ''; mon.statusState = {};
		delete mon.statuses;
		for (const slot of [...mon.pp, ...(mon.moveMemory || []), ...(mon.blessingPP || [])]) slot.pp = slot.maxpp;
	}
}
export function dialoguePage(
	id: string, name: string, text: string, approval = false, side: 'left' | 'right' = 'right'
): NarrativePage {
	return { scene: 'arena', title: name, speaker: name, text, avatar: id, portrait: id,
		expression: approval ? 'approval' : 'neutral', side };
}
