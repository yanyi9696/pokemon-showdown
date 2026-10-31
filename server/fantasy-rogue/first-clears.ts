import { Dex, toID } from '../../sim/dex';
import type { RogueAccount, RogueRun } from './types';

/** National species, not evolution families. Regional identities survive Fantasy/battle-form folding. */
export function firstClearSpeciesKey(name: string): string | undefined {
	const dex = Dex.mod('gen9fantasy'), base = Dex.mod('gen9');
	const original = dex.species.get(name);
	if (!original.exists) return;
	const regional = /(?:^|-)(Alola|Galar|Hisui|Paldea)(?:-|$)/i.exec(original.name)?.[1];
	const candidates = [original.name.replace(/-Fantasy\b/g, ''), original.changesFrom?.replace(/-Fantasy\b/g, ''),
		original.baseSpecies.replace(/-Fantasy\b/g, '')].filter(Boolean) as string[];
	const ordinary = candidates.map(candidate => base.species.get(candidate))
		.find(species => species.exists && species.num > 0 && species.num <= 1025);
	if (!ordinary) return;
	const region = regional || /(?:^|-)(Alola|Galar|Hisui|Paldea)(?:-|$)/i.exec(ordinary.name)?.[1];
	return `${ordinary.num}${region ? `:${toID(region)}` : ''}`;
}
export function initializeFirstClears(account: RogueAccount) {
	if (account.firstClearSpecies) return;
	// Retained old clear cards are evidence, never a reason to grant retrospective duplicate points.
	account.firstClearSpecies = [...new Set([...account.cards || [],
		...(account.pendingClear ? [account.pendingClear] : [])]
		.filter(card => card.snapshot.difficulty !== 'easy' && !card.snapshot.difficultyTest)
		.flatMap(card => card.snapshot.team.filter(mon => !mon.egg).map(mon => firstClearSpeciesKey(mon.set.species)))
		.filter((id): id is string => !!id))];
}
export function awardFirstClears(account: RogueAccount, run: RogueRun) {
	initializeFirstClears(account);
	if (run.firstClearRewardsRecorded || run.boostRuleVersion !== 2 || run.floor !== 200 ||
		run.phase !== 'complete') return 0;
	run.firstClearRewardsRecorded = true;
	if (run.difficulty === 'easy' || run.difficultyTest) return 0;
	const keys = [...new Set(run.team.filter(mon => !mon.egg).map(mon => firstClearSpeciesKey(mon.set.species))
		.filter((id): id is string => !!id))].filter(id => !account.firstClearSpecies!.includes(id));
	account.firstClearSpecies!.push(...keys);
	const points = keys.length * 5;
	account.points += points;
	if (points) (run.notices ||= []).push(`${keys.length} 种伙伴首次随队通关，额外获得 ${points} 点局外成长点。`);
	return points;
}
