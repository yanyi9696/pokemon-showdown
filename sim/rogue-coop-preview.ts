import type { Battle } from './battle';
import type { Side } from './side';

/** Only the two real players in the cooperative campaign use variable-size Team Preview. */
export function rogueCoopPreviewSide(side: Side) {
	return !!side.battle.fantasyRogue?.cooperative && !!side.battle.fantasyRogue.coopTeamPreview &&
		side.battle.format.id === 'gen9fantasyroguecoop' && (side.id === 'p1' || side.id === 'p3');
}

/** Native team actions have now removed the reserves; retain only participants in battle snapshots. */
export function finalizeRogueCoopPreview(battle: Battle) {
	const state = battle.fantasyRogue;
	if (!state?.coopTeamPreview || state.coopTeamSelected) return;
	if (!state.cooperative || !state.partner || !battle.p3) throw new Error('Missing cooperative preview state');
	const teams = [[battle.p1, state], [battle.p3, state.partner]] as const;
	for (const [side, saved] of teams) {
		const ids = side.pokemon.map(mon => mon.set.fantasyRogueId);
		if (!ids.length || ids.length > 3 || new Set(ids).size !== ids.length ||
			ids.some(id => !saved.team.some(mon => mon.id === id))) throw new Error('Invalid cooperative preview team');
	}
	for (const [side, saved] of teams) {
		saved.team = side.pokemon.map(mon => saved.team.find(entry => entry.id === mon.set.fantasyRogueId)!);
		battle.add('teamsize', side.id, side.pokemon.length);
	}
	state.coopTeamSelected = true;
}
