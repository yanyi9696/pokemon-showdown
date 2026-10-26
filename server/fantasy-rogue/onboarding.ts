import type { RogueAccount } from './types';
import { BEGINNER_GUIDE_VERSION } from './beginner-guide';

/** New and veteran accounts acknowledge the current content; active adventures wait until their next start. */
export function needsOnboarding(account: RogueAccount) {
	return (!account.run || account.run.phase === 'complete' && !account.run.story && !account.pendingClear) &&
		account.onboardingVersion !== BEGINNER_GUIDE_VERSION;
}
