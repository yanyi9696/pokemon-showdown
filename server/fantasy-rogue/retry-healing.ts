import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueAccount, RogueContent, RogueItem, RogueRun } from './types';
import { collapseMedicine, recordCollapseResource } from './collapse';
import { cureMember, inventoryItem } from './team';

export interface RetryHealing {
	key: string;
	encounterId: string;
	purpose?: 'heal';
	member?: string;
}

function statuses(mon: RoguePokemon) {
	return [...new Set([mon.status, ...Object.keys(mon.statuses || {})].filter(Boolean))];
}

function eligible(mon: RoguePokemon) {
	return !mon.egg && !mon.nuzlockeDead;
}

function healthy(mon: RoguePokemon) {
	return mon.hp === mon.maxhp && !statuses(mon).length;
}

/** Pure quote: the same planner is used for confirmation inside the store transaction. */
export function planRetryHealing(run: RogueRun, content: RogueContent, member?: string) {
	const team = structuredClone(run.team), bag = { ...run.bag };
	const medicines = Object.keys(bag).map(id => inventoryItem(content, id))
		.filter((item): item is RogueItem => !!item && ['heal', 'cure', 'revive'].includes(item.kind));
	const used: Record<string, number> = {};
	let healingUses = 0;
	const available = (kind: RogueItem['kind']) => medicines.filter(item => item.kind === kind && bag[item.id] > 0);
	const spend = (item: RogueItem) => {
		bag[item.id]--;
		used[item.id] = (used[item.id] || 0) + 1;
	};
	for (const mon of team) {
		if (!eligible(mon) || member && mon.id !== member || healthy(mon)) continue;
		if (!mon.hp) {
			const revive = available('revive').sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
			if (!revive) continue;
			mon.hp = Math.min(mon.maxhp, Math.max(1, Math.floor(mon.maxhp * revive.amount!)));
			mon.status = ''; mon.statusState = {}; delete mon.statuses;
			if (run.blessings?.owned.some(entry => entry.family === 'insight')) {
				mon.insight ||= { points: 0, gain: 1 };
				mon.insight.points = Math.min(100, mon.insight.points + mon.insight.gain);
			}
			spend(revive);
		}
		while (statuses(mon).length) {
			// Save all-status cures when a matching single-status medicine is sufficient.
			const cures = available('cure').filter(item =>
				statuses(mon).some(status => !item.cureStatuses || item.cureStatuses.includes(status)));
			cures.sort((a, b) => (a.cureStatuses?.length || 99) - (b.cureStatuses?.length || 99));
			if (!cures.length) break;
			cureMember(mon, cures[0]); spend(cures[0]);
		}
		while (mon.hp < mon.maxhp) {
			const amount = (item: RogueItem) => collapseMedicine(run, Math.min(mon.maxhp, item.amount || 0));
			const heals = available('heal').filter(item => (item.amount || 0) > 0).sort((a, b) => amount(a) - amount(b));
			if (!heals.length) break;
			// Smallest sufficient dose, otherwise the strongest remaining dose; no free HP or PP.
			const heal = heals.find(item => amount(item) >= mon.maxhp - mon.hp) || heals[heals.length - 1];
			mon.hp = Math.min(mon.maxhp, mon.hp + amount(heal));
			spend(heal); healingUses++;
		}
	}
	return { team, bag, used, healingUses,
		complete: team.filter(mon => eligible(mon) && (!member || mon.id === member)).every(healthy),
		insufficientHP: team.some(mon => eligible(mon) && (!member || mon.id === member) && mon.hp < mon.maxhp),
	};
}

export function applyRetryHealing(account: RogueAccount, run: RogueRun, content: RogueContent, member?: string) {
	const plan = planRetryHealing(run, content, member);
	run.team = plan.team; run.bag = plan.bag;
	for (let i = 0; i < plan.healingUses; i++) recordCollapseResource(account, run, 'medicine');
	return plan;
}

export function retryHealingView(run: RogueRun, content: RogueContent) {
	if (!run.retryHealing || run.phase === 'battle') return;
	const quote = (member?: string) => {
		const plan = planRetryHealing(run, content, member);
		return { items: Object.entries(plan.used).map(([id, count]) =>
			({ id, name: inventoryItem(content, id)!.name, count })),
		insufficientHP: plan.insufficientHP,
		missingCures: plan.team.filter(mon => eligible(mon) && (!member || mon.id === member) && statuses(mon).length)
			.map(mon => ({ id: mon.id, species: mon.set.species, statuses: statuses(mon) })),
		};
	};
	return { key: run.retryHealing.key, purpose: run.retryHealing.purpose, member: run.retryHealing.member,
		...quote(run.retryHealing.member),
		members: run.team.map(mon => ({ id: mon.id, species: mon.set.species, hp: mon.hp, maxhp: mon.maxhp,
			statuses: statuses(mon), disabled: !eligible(mon) || healthy(mon), dead: !!mon.nuzlockeDead,
			...quote(mon.id),
		})),
	};
}
