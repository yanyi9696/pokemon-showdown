import type { RogueAccount, RogueRun } from './types';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import { blessing, type BlessingTier } from '../../sim/rogue-blessing-data';
import { blessingDisplay } from './blessing-text';
import { clearMemberDetails, type ClearMemberDetails } from './clear-details';
import { difficultyLabel } from '../../sim/rogue-difficulty';
import { rogueSpirit } from '../../sim/fantasy-rogue-spirits';
import { eggView } from './eggs';

export interface JourneyLedger {
	startedAt: number;
	blessings: { id: string, name: string, text: string, floor: number, tier?: BlessingTier }[];
	participants: Record<string, { mon: RoguePokemon, details?: ClearMemberDetails, floor: number }>;
}
export interface JourneyRecord {
	id: string; startedAt: number; endedAt: number; floor: number;
	outcome: 'complete' | 'defeated' | 'abandoned';
	snapshot: {
		team: (RoguePokemon | ReturnType<typeof eggView>)[], box: RoguePokemon[], memberDetails: Record<string, ClearMemberDetails>,
		blessings: JourneyLedger['blessings'], difficulty: RogueRun['difficulty'], difficultyLabel: string,
		spiritName?: string, collapse?: string[], boosts: StatsTable,
	};
}
/** Called before and after each transaction, so replacement and abandonment cannot erase evidence. */
export function trackJourney(run: RogueRun, account: RogueAccount) {
	const ledger = run.journey ||= { startedAt: Date.now(), blessings: [], participants: {} };
	for (const entry of run.blessings?.owned || []) {
		const def = blessing(entry.id);
		if (!def || ledger.blessings.some(b => b.id === entry.id && b.floor === entry.floor)) continue;
		const { name, text } = blessingDisplay(def, entry.floor, account.tonicSecret);
		ledger.blessings.push({ id: entry.id, name, text, floor: entry.floor, tier: def.tier });
	}
	// Snapshot each current participant once. Building details also computes baseline battle stats.
	// Boxed partners only update earlier evidence; entering the box does not count as participation.
	for (const mon of run.team) if (ledger.participants[mon.id] || run.phase === 'battle' && !mon.egg && mon.hp) {
		ledger.participants[mon.id] = { mon: structuredClone(mon), details: clearMemberDetails(mon, run), floor: run.floor };
	}
	for (const mon of run.box || []) if (ledger.participants[mon.id]) {
		ledger.participants[mon.id] = { mon: structuredClone(mon), details: clearMemberDetails(mon, run), floor: run.floor };
	}
}

/** Add display metadata to old records without changing their archived effect copy or stored data. */
export function journeyDisplay(record: JourneyRecord): JourneyRecord {
	return { ...record, snapshot: { ...record.snapshot, blessings: record.snapshot.blessings.map(entry => ({
		...entry, tier: entry.tier || blessing(entry.id)?.tier,
	})) } };
}
export function journeyRecord(run: RogueRun, outcome: JourneyRecord['outcome']): JourneyRecord {
	const ledger = run.journey!;
	const team = run.team.map(mon => mon.egg ? eggView(mon, run.floor) : structuredClone(mon));
	const departed = Object.values(ledger.participants).filter(p => !run.team.some(mon => mon.id === p.mon.id));
	return { id: run.id, startedAt: ledger.startedAt, endedAt: Date.now(), floor: run.floor, outcome,
		snapshot: { team, box: departed.map(p => p.mon),
			memberDetails: Object.fromEntries([
				...departed.filter(p => p.details).map(p => [p.mon.id, p.details!]),
				...run.team.filter(mon => !mon.egg).map(mon => [mon.id, clearMemberDetails(mon, run)]),
			]), blessings: structuredClone(ledger.blessings), difficulty: run.difficulty || 0,
			difficultyLabel: difficultyLabel(run.difficulty), spiritName: rogueSpirit(run.spirit)?.name,
			collapse: run.collapse?.slice(), boosts: { ...run.boosts },
		} };
}
