import type { RogueAccount } from './types';

/** Existing adventures must not be interrupted by a new-account tutorial after an update. */
export function needsOnboarding(account: RogueAccount) {
	return !account.onboardingSeen && !account.run && !account.adventures && !account.opening?.page &&
		!account.cards?.length && !account.pendingClear && !Object.keys(account.captures).length;
}
