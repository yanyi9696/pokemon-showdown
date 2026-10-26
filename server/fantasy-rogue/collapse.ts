import type { RogueBattleResult } from '../../sim/fantasy-rogue';
import { collapseEntries, collapseParameters, type CollapseHistory } from '../../sim/rogue-collapse-data';
import type { RogueAccount, RogueRun } from './types';

function history(account: RogueAccount, run: RogueRun): CollapseHistory | undefined {
	if (!run.collapse?.length) return;
	const key = `${run.difficulty}:${run.collapse.slice().sort().join(',')}:v${run.difficultyRulesVersion || 2}`;
	const entries = account.collapseHistory ||= {};
	entries[key] ||= {
		runs: 0, battles: 0, turns: 0, wins: 0, clears: 0, selections: {}, triggers: {},
	};
	return entries[key];
}
export function recordCollapseStart(account: RogueAccount, run: RogueRun) {
	const h = history(account, run);
	if (!h) return;
	h.runs++;
	for (const id of run.collapse!) h.selections[id] = (h.selections[id] || 0) + 1;
}
/** Invoked only inside the existing, token-checked battle settlement transaction. */
export function recordCollapseBattle(account: RogueAccount, run: RogueRun, result: RogueBattleResult) {
	const h = history(account, run);
	if (!h) return;
	h.battles++; h.turns += Math.max(0, result.turns || 0); h.wins += result.won ? 1 : 0;
	for (const { id } of collapseEntries(run.difficultyRulesVersion || 2)) {
		const n = result.collapseMetrics?.triggers[id] || 0;
		if (n > 0 && Number.isFinite(n)) h.triggers[id] = (h.triggers[id] || 0) + n;
	}
}

export function collapseShopPrice(run: RogueRun | undefined, price: number) {
	return run?.collapse?.includes('inflation') ? Math.ceil(price * collapseParameters(run.difficultyRulesVersion ?? 3).inflation) : price;
}
export function collapseMedicine(run: RogueRun, amount: number) {
	return run.collapse?.includes('medicine') ? Math.max(1, Math.floor(amount * collapseParameters(run.difficultyRulesVersion ?? 3).medicine)) : amount;
}
/** Count committed purchases / medicine uses separately from battle triggers. */
export function recordCollapseResource(account: RogueAccount, run: RogueRun, id: 'inflation' | 'medicine') {
	if (!run.collapse?.includes(id)) return;
	const h = history(account, run)!;
	h.triggers[id] = (h.triggers[id] || 0) + 1;
}
export function recordCollapseClear(account: RogueAccount, run: RogueRun) {
	const h = history(account, run);
	if (!h || run.collapseClearRecorded) return;
	h.clears++; run.collapseClearRecorded = true;
}
