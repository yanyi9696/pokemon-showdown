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
		...(account.run?.challengeHistory || []).filter(entry => entry.accepted || entry.outcome).map(entry => `challenge:${entry.id}`),
		...(account.discoveries?.events || []), ...(account.run?.eventHistory || []).map(entry => entry.id),
		...(account.run?.node?.event ? [account.run.node.event.id] : []),
		...(account.run?.node?.trade ? [`trade:${account.run.node.trade.kind}`] : []),
		...(account.run?.node?.rewardScene ? [`reward:${account.run.node.rewardScene.id}`] : []),
		...(account.run?.node?.kind === 'trainer' ? ['encounter:trainer'] : []),
		...(account.run?.node?.rocket ? ['encounter:rocket'] : []),
	]);
	const run = account.run;
	if (run?.rival) {
		events.add('rivalstory');
		for (let chapter = 1; chapter <= run.rival.completed; chapter++) events.add(`rival:${run.rival.id}:${chapter}`);
	}
	for (const card of cards) {
		const rival = card.snapshot.rival;
		if (!rival) continue;
		for (let chapter = 1; chapter <= rival.completed; chapter++) events.add(`rival:${rival.id}:${chapter}`);
	}
	const trainers = new Set([
		...(account.discoveries?.trainers || []), ...(run?.rival ? [run.rival.id] : []),
		...cards.flatMap(card => card.snapshot.rival ? [card.snapshot.rival.id] : []),
		...cards.flatMap(card => card.snapshot.rival?.carmine?.permanent ? ['carmine'] : []),
		...(run?.blessings?.companions || []).map(c => c.id),
		...(run?.socialCompanions || []).map(c => c.id),
		...(run?.node?.event?.social ? [run.node.event.social.trainer] : []),
		...cards.flatMap(card => (card.snapshot.blessingEffects?.companions || []).map(c => c.id)),
		...(run?.seenBossDialogues || []).map(key => key.split(':').pop()!).filter(Boolean),
	]);
	// Only the opponent the player has reached counts. Route candidates, the elder's
	// previews, future dialogue pages and unchosen companion options are not meetings.
	if (run && (['ready', 'battle', 'settlement', 'failed', 'defeated'].includes(run.phase) ||
		run.phase === 'story' && ['bossintro', 'gymgift', 'leaguebriefing'].includes(run.story?.stage || ''))) {
		const trainer = run.node?.encounters[run.encounter]?.trainer;
		if (trainer) trainers.add(trainer.id);
		if (run.floor === 200 && run.node?.kind === 'boss') trainers.add('mewtwo');
	}
	if (run?.phase === 'story' && run.story?.stage === 'interlude') {
		const portrait = run.dialogue?.pages[run.story.page]?.portrait;
		if (portrait) trainers.add(portrait);
	}
	return { blessings: [...blessings].sort(), events: [...events].sort(), trainers: [...trainers].sort() };
}

export function recordRogueDiscoveries(account: RogueAccount) {
	const discovered = rogueDiscoveries(account);
	if (discovered.blessings.length || discovered.events.length || discovered.trainers.length || account.discoveries) {
		account.discoveries = discovered;
	}
}
