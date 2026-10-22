import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { experienceAtLevel, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { gainExperience, initializeExperience } from './progression';
import type { RogueRun } from './types';

export const SHOPPING_THRESHOLD = 3000;
export function nextShopGrade(run: RogueRun, thresholds: number[]) {
	if (!ownsBlessing(run.blessings, 'shoppingupgrade')) return run.floor;
	return [...thresholds].sort((a, b) => a - b).find(f => f > run.floor) || run.floor;
}
/** Called after a successful paid transaction; command IDs are deduplicated by the account store. */
export function recordShoppingSpend(run: RogueRun, amount: number) {
	if (!ownsBlessing(run.blessings, 'shoppingupgrade') || !Number.isSafeInteger(amount) || amount <= 0) return;
	const ledger = run.shoppingSpend ||= { total: 0, rewards: 0 };
	ledger.total += amount;
	const count = Math.floor(ledger.total / SHOPPING_THRESHOLD) - ledger.rewards;
	if (!count) return;
	ledger.rewards += count;
	for (let i = 0; i < count; i++) for (const mon of run.team.filter(p => !p.egg && !p.fixedLevel && p.set.level < (p.uncappedLevel ? 9999 : 100))) {
		initializeExperience(mon);
		const growth = rogueSpeciesData(mon.set.species).growth;
		gainExperience(run, mon, Math.max(1, Math.floor((experienceAtLevel(growth, mon.set.level + 1) - experienceAtLevel(growth, mon.set.level)) / 4)));
	}
	(run.notices ||= []).push(`【消费升级】累计消费 ${ledger.total} 金币，返还 ${count} 次全队经验；每次为各自当前一级所需经验的 25%。`);
}
