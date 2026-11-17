import { createHash } from 'crypto';
import { eventView } from './events';
import { storyView } from './story';
import { rewardSceneView } from './reward-scenes';
import { shopStock } from './trading';
import { blessingView } from './blessings';
import { affectionScene } from './affection';
import { optionalChallengeView } from './optional-challenges';
import type { RogueAccount, RogueContent } from './types';

/** Explicit public presentation only; never serialize the account, raw event or command tokens. */
export function journeyWatchView(account: RogueAccount, content: RogueContent, player: string) {
	const copy = structuredClone(account), run = copy.run;
	if (!run?.announced) return null;
	const event = eventView(run), story = storyView(copy, !!content.story, false);
	const reward = rewardSceneView(run), blessings = blessingView(run, false);
	const affection = affectionScene(run), challenge = optionalChallengeView(run);
	const options = (entries: readonly { id: string, name: string, text?: string, disabled?: boolean }[] | undefined) =>
		(entries || []).map(({ id, name, text, disabled }) => ({ id, name, text, disabled }));
	return {
		player, id: run.id, floor: run.floor, phase: run.phase, encounter: run.encounter,
		ended: ['complete', 'defeated'].includes(run.phase), area: run.node?.name,
		team: run.team.map(mon => ({ species: mon.set.species, level: mon.set.level, hp: mon.hp, maxhp: mon.maxhp,
			stars: mon.stars || 1, status: mon.status, egg: !!mon.egg })),
		choices: run.phase === 'choose' ? (run.choices || []).map(node => ({ id: node.id,
			name: node.fogged ? '迷雾区域' : node.kind === 'trainer' && !node.challenge ? '未知遭遇' : node.name })) : [],
		story: story && { title: story.title, text: story.text, portrait: 'portrait' in story ? story.portrait : undefined },
		event: event && { title: event.title, paragraphs: event.paragraphs, options: options(event.options),
			activity: 'activity' in event ? event.activity : undefined,
			silhouette: 'silhouette' in event ? event.silhouette : undefined,
			teams: 'teams' in event ? event.teams : undefined },
		affection: affection && { title: affection.title, text: affection.text, options: options(affection.options) },
		challenge: challenge && { title: challenge.name, paragraphs: challenge.paragraphs,
			options: challenge.prizes?.map(prize => ({ id: prize.id, name: prize.name })) },
		reward: reward && { title: reward.name, paragraphs: reward.paragraphs, options: options(reward.choices) },
		shop: run.node?.kind === 'trade' || run.node?.kind === 'rest' ? shopStock(content, run)
			.map(item => ({ id: item.id, name: item.name, price: item.price, remaining: item.remaining })) : [],
		blessings: blessings && { owned: blessings.owned.map(b => ({ name: b.name, text: b.text })),
			options: blessings.round?.options.map(b => ({ id: b.id, name: b.name, text: b.text })) },
		notices: run.notices?.slice(-16) || [],
	};
}

/** Per-owner bounded cache shares one serialization across spectators; no background timers or save writes. */
export class JourneyWatch {
	private cache = new Map<string, { at: number, value: unknown, version: string }>();
	private focus = new Map<string, { at: number, value: string }>();
	setFocus(owner: string, value: string, now = Date.now()) {
		if (now - (this.focus.get(owner)?.at || 0) < 300 || value.length > 120 || /[\r\n<>|]/.test(value)) return;
		this.focus.delete(owner); this.focus.set(owner, { at: now, value });
		if (this.focus.size > 256) this.focus.delete(this.focus.keys().next().value!);
		this.cache.delete(owner);
	}
	read(owner: string, previous: string, build: () => unknown, now = Date.now()) {
		let entry = this.cache.get(owner);
		if (!entry || now - entry.at >= 750) {
			const focus = this.focus.get(owner);
			const value = { view: build(), focus: focus && now - focus.at < 10000 ? focus.value : '' };
			const version = createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);
			entry = { at: now, value, version }; this.cache.delete(owner); this.cache.set(owner, entry);
			if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
		}
		return entry.version === previous ? { owner, version: entry.version, unchanged: true } :
			{ owner, version: entry.version, ...(entry.value as { view: unknown, focus: string }) };
	}
}

/** Public channel only, with chat, HTML, requests and private side data removed. */
export function publicJourneyBattle(log: string) {
	return log.split('\n').filter(line => /^\|(?:-|player\||teamsize\||gametype\||gen\||tier\||start\||turn\||move\||switch\||drag\||faint\||win\||tie\||poke\||clearpoke\||teampreview\||rule\|)/.test(line));
}
