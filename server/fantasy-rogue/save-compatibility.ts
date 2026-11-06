import type { RogueAccount } from './types';
import { validUniversalBonus } from '../../sim/rogue-universal-data';

/** Data contract, not a balance/content version. Bump before introducing incompatible persisted state. */
export const ROGUE_SAVE_VERSION = 3;
export const ROGUE_SAVE_CAPABILITIES = [
	'mainline-choice-v1', 'meta-boost-percent-v2', 'challenge-v1', 'history-v1',
	'nuzlocke-v1', 'starter-crates-v1', 'starter-crates-v2',
] as const;

function object(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Read-only and deliberately conservative: an unknown writer must not be silently normalized. */
export function rogueSaveCompatibilityIssues(value: unknown): string[] {
	const account = object(value);
	if (!account) return ['invalid-account'];
	const issues: string[] = [];
	if (account.crates !== undefined && ![1, 2].includes(object(account.crates)?.version as number)) issues.push('unsupported-starter-crates');
	if (account.saveVersion !== undefined && account.saveVersion !== 1 &&
		account.saveVersion !== 2 && account.saveVersion !== ROGUE_SAVE_VERSION) {
		issues.push('unsupported-save-version');
	}
	const cards = Array.isArray(account.cards) ? account.cards : [];
	const snapshots = [account.run, ...cards.map(card => object(card)?.snapshot), object(account.pendingClear)?.snapshot];
	for (const snapshot of snapshots) {
		const saved = object(snapshot);
		for (const member of [...(Array.isArray(saved?.team) ? saved.team : []),
			...(Array.isArray(saved?.box) ? saved.box : [])]) {
			const config = object(object(member)?.universalEvolution);
			if (config && (config.version !== 1 || typeof config.item !== 'string' ||
				!validUniversalBonus(config.item, object(config.bonus) as StatsTable | undefined))) {
				issues.push('unsupported-universal-evolution');
			}
		}
		if (saved === account.run && saved?.nuzlocke !== undefined && object(saved.nuzlocke)?.version !== 1) {
			issues.push('unsupported-nuzlocke-rule');
		}
		if (saved?.boostRuleVersion !== undefined && saved.boostRuleVersion !== 2) {
			issues.push('unsupported-growth-rule');
		}
		if (saved?.eventFragmentRuleVersion !== undefined && ![1, 2].includes(saved.eventFragmentRuleVersion as number)) {
			issues.push('unsupported-fragment-rule');
		}
	}
	return [...new Set(issues)];
}

export function assertRogueSaveCompatible(account: RogueAccount) {
	if (rogueSaveCompatibilityIssues(account).length) {
		throw new Error('存档使用了当前服务端不支持的版本。已停止写入，请管理员恢复兼容版本；无需重置存档。');
	}
}
