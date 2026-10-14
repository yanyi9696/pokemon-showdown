import type { RogueAccount } from './types';
import { blessing } from '../../sim/rogue-blessing-data';

/** Merge only evidence retained by the account; never infer unseen content from floor progress. */
export function rogueDiscoveries(account: RogueAccount) {
	const cards = [...(account.cards || []), ...(account.pendingClear ? [account.pendingClear] : [])];
	const blessings = new Set([
		...(account.discoveries?.blessings || []), ...(account.previousBlessings || []),
		...(account.run?.blessings?.owned || []).map(entry => entry.id),
		...cards.flatMap(card => card.snapshot.blessings.map(entry => entry.id)),
	].map(id => blessing(id)?.id).filter((id): id is string => !!id));
	const events = new Set([
		...(account.discoveries?.events || []), ...(account.run?.eventHistory || []).map(entry => entry.id),
		...(account.run?.node?.event ? [account.run.node.event.id] : []),
	]);
	return { blessings: [...blessings].sort(), events: [...events].sort() };
}

export function recordRogueDiscoveries(account: RogueAccount) {
	const discovered = rogueDiscoveries(account);
	if (discovered.blessings.length || discovered.events.length || account.discoveries) account.discoveries = discovered;
}
