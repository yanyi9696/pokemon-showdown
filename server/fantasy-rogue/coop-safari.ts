import { randomUUID } from 'crypto';
import { Dex } from '../../sim/dex';
import type { RogueAccount, RogueContent, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';
import { chooseEventOption, eventView } from './events';
import { rollSafariChoice } from './journey-safari';
import { safariTargets } from './journey-safari-pool';
import { sharedShinyEcho } from './coop-echo';

export function coopSafariTarget(runs: RogueRun[]) {
	const event = runs[0]?.node?.event, a = event?.activity;
	if (runs.length !== 2 || event?.id !== 'safaripark' || !a || a.safari?.length !== 3 ||
		a.safari.some(name => !Dex.mod('gen9fantasy').species.get(name).exists) ||
		!Number.isInteger(a.index) || a.index! < 0 || a.index! > 2 ||
		!Number.isInteger(a.balls) || a.balls! < 1 || a.balls! > 3 ||
		[a.wary || 0, a.bait || 0].some(value => !Number.isSafeInteger(value) || value < 0) ||
		(a.bait || 0) > 2 || runs.some(run => run.node?.kind !== 'event' || run.node.event?.id !== event.id ||
			run.node.event.key !== event.key || run.node.event.stage !== 'choice' || run.node.event.settled ||
			run.floor !== runs[0].floor || JSON.stringify(run.node.event.activity) !== JSON.stringify(a))) return null;
	return { key: event.key, id: `${event.key}:${a.index}`,
		name: safariTargets(runs[0].floor, a.safari)[a.index!], balls: a.balls! };
}

/** Only the negotiated capturer receives a partner and permanent unlocks; the ball stock is shared. */
export function settleCoopSafari(
	entries: { run: RogueRun, account: RogueAccount, changeAccount?: (update: (account: RogueAccount) => void) => void }[],
	content: RogueContent, random: RogueRandom, choice: string, ownerIndex?: number
) {
	const target = coopSafariTarget(entries.map(entry => entry.run));
	if (!target || !entries.every(entry => eventView(entry.run)?.options.some(o => o.id === choice && !o.disabled)) ||
		choice === 'ball' && (ownerIndex === undefined || ![0, 1].includes(ownerIndex) || !entries[ownerIndex].changeAccount)) {
		throw new Error('共同狩猎进度或捕捉归属已变化，请重新协商。');
	}
	const result = rollSafariChoice(entries[0].run.node!.event!.activity!, random, choice, entries[0].run.floor);
	const key = randomUUID();
	for (const [index, { run, account, changeAccount }] of entries.entries()) {
		const apply = (owner: RogueAccount) => {
			const personalEcho = run.echo;
			run.echo = sharedShinyEcho(entries.map(entry => entry.run));
			try {
				chooseEventOption(owner, run, content, random, run.node!.event!.key, choice,
					undefined, undefined, undefined, { safari: { result, receive: index === ownerIndex } });
			} finally {
				run.echo = personalEcho;
			}
		};
		if (result.caught && index === ownerIndex) changeAccount!(apply);
		else apply(account);
		run.node!.event!.key = key;
	}
}
