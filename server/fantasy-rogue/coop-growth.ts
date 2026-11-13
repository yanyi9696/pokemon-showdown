import { toID } from '../../sim/dex';
import type { RogueBattleResult } from '../../sim/fantasy-rogue';
import type { RogueGrowthUpdate } from '../../sim/rogue-growth';
import { blessingPartyRoles } from '../../sim/rogue-blessing-permanent';
import { blessingMemberTypes } from './blessings';
import { escapedMember } from './progression';
import { activeCoopEscort, coopBattleParty } from './coop-escort';
import type { RogueCoopMemberState, RogueCoopSession } from './types';

export interface CoopBattleGrowth {
	token: string;
	sequence: number;
	revision: number;
	paused: boolean;
	discoveries?: Record<string, PokemonSet[]>;
	baseline?: Record<string, Pick<RogueCoopMemberState, 'team' | 'bag' | 'experienceReceipts' | 'pendingMoves'>>;
}

export function coopGrowthKey(session: RogueCoopSession) {
	const adventure = session.adventure, growth = adventure?.battleGrowth;
	return session.status === 'active' && adventure?.phase === 'battle' && growth?.paused &&
		growth.token === adventure.battleToken ? `${growth.token}:${growth.revision}` : undefined;
}

export function reviseCoopGrowth(session: RogueCoopSession) {
	const adventure = session.adventure!, growth = adventure.battleGrowth!;
	growth.paused = [session.hostUser, session.guestUser].some(userid =>
		!!adventure.members[userid].pendingMoves?.length ||
		adventure.members[userid].team.some(mon => mon.hp > 0 && mon.evolutionNotice));
	growth.revision++;
}

/** Only battle effects and compact personal roster data cross into the simulator. */
export function coopBattleBlessings(blessings: RogueCoopMemberState['blessings'], team: RogueCoopMemberState['team']) {
	return blessings && structuredClone({
		partyRoles: blessingPartyRoles(team, blessings),
		party: team.filter(mon => !mon.egg).map(mon => ({ id: mon.id, species: mon.set.species,
			types: blessingMemberTypes(mon), moves: mon.set.moves.map(toID), item: toID(mon.set.item) })),
		owned: blessings.owned, evolution: blessings.evolution, psychic: blessings.psychic,
		dragonKing: blessings.dragonKing, companions: blessings.companions,
		companionZ: blessings.companionZ, catAbilities: blessings.catAbilities,
		unityParty: blessings.owned.some(entry => entry.family === 'unity') ?
			team.filter(mon => !mon.egg).map(mon => ({ id: mon.id, types: blessingMemberTypes(mon) })) : undefined,
	});
}

export function coopGrowthAcknowledgement(session: RogueCoopSession): RogueGrowthUpdate | undefined {
	const adventure = session.adventure, growth = adventure?.battleGrowth;
	if (!adventure || !growth || growth.token !== adventure.battleToken) return;
	const owner = (userid: string) => {
		const member = adventure.members[userid];
		const effects = activeCoopEscort(adventure)?.owner === userid ? undefined :
			coopBattleBlessings(member.blessings, member.team);
		const party = coopBattleParty(adventure, userid);
		return {
			team: session.battleSelections[userid].map(id => {
				const mon = party.find(entry => entry.id === id);
				if (!mon) throw new Error('成长确认缺少原出战成员。');
				return structuredClone(mon);
			}), bag: { ...member.bag },
			blessingRoster: effects && { party: effects.party, partyRoles: effects.partyRoles, unityParty: effects.unityParty },
		};
	};
	return { sequence: growth.sequence, revision: growth.revision, paused: growth.paused,
		...owner(session.hostUser), partner: owner(session.guestUser) };
}

/** A retreat/capture packet can race the committed acknowledgement. Keep learned growth, but spend real resources. */
export function preserveCoopGrowthResult(session: RogueCoopSession, result: RogueBattleResult): RogueBattleResult {
	const adventure = session.adventure!, growth = adventure.battleGrowth;
	if (!growth || growth.token !== adventure.battleToken || (result.growthRevision || 0) >= growth.revision) return result;
	const merge = (userid: string, team: RogueBattleResult['team']) => team.map(mon => {
		const saved = adventure.members[userid].team.find(entry => entry.id === mon.id);
		return saved ? escapedMember(saved, mon) : mon;
	});
	return { ...result, team: merge(session.hostUser, result.team),
		partnerTeam: result.partnerTeam && merge(session.guestUser, result.partnerTeam) };
}

/** Failed trials discard provisional training and evolution, retaining damage and expenditure. */
export function restoreCoopChallengeGrowth(session: RogueCoopSession) {
	const adventure = session.adventure!, growth = adventure.battleGrowth;
	if (!growth || growth.token !== adventure.battleToken || !growth.baseline) return;
	for (const userid of [session.hostUser, session.guestUser]) {
		const member = adventure.members[userid], baseline = growth.baseline[userid];
		if (!baseline) throw new Error('挑战缺少本人的成长回滚记录。');
		member.team = baseline.team.map(original => {
			const current = member.team.find(mon => mon.id === original.id);
			const restored = current ? escapedMember(original, current) : structuredClone(original);
			if (toID(restored.set.item) !== toID(original.set.item)) restored.set.item = '';
			restored.evolutionProgress = structuredClone(original.evolutionProgress);
			return restored;
		});
		member.bag = Object.fromEntries(Object.entries(baseline.bag)
			.map(([id, count]) => [id, Math.min(count, member.bag[id] || 0)]));
		member.experienceReceipts = structuredClone(baseline.experienceReceipts || []);
		member.pendingMoves = structuredClone(baseline.pendingMoves || []);
	}
}
