import type { Pokemon } from './pokemon';
import type { Side } from './side';
import type { BlessingEffects } from './rogue-blessing-data';
import type { RoguePokemon } from './fantasy-rogue';
import { permanentMemberTypes } from './rogue-blessing-permanent';
import { companionSource, type CompanionID } from './rogue-companions';

export const COMPANION_Z = {
	marnie: {
		type: 'Dark', base: 'snarl', move: 'roguecitydark', name: '熙熙攘攘我们的城市', category: 'Special', target: 'normal',
	},
	roxie: {
		type: 'Poison', base: 'sludgewave', move: 'roguecitypoison', name: '熙熙攘攘我们的城市', category: 'Special', target: 'normal',
	},
	lacey: {
		type: 'Fairy', base: 'playrough', move: 'rogueflawless', name: '致以，「无瑕之人」', category: 'Physical', target: 'allAdjacentFoes',
	},
} as const;
export function companionZDefinition(id: CompanionID) {
	return COMPANION_Z[id as keyof typeof COMPANION_Z];
}
export function companionZCandidates(effects: BlessingEffects, team: RoguePokemon[], id: CompanionID) {
	const def = companionZDefinition(id);
	return !def || effects.companionZ ? [] : team.filter(mon => permanentMemberTypes(mon).includes(def.type) &&
		mon.set.moves.some(move => move.toLowerCase().replace(/[^a-z0-9]/g, '') === def.base));
}
export function companionZRequest(mon: Pokemon | null | undefined) {
	if (!mon?.hp || !mon.isActive || mon.volatiles.dynamax || mon.getLockedMove()) return;
	const state = mon.battle.fantasyRogue;
	const effects = mon.side.id === 'p1' ? state?.blessings : state?.duel?.blessings;
	const grant = effects?.companionZ;
	if (!grant || grant.member !== mon.set.fantasyRogueId || state?.companionZUsed?.[mon.side.id] ||
		!state?.duel && grant.spent || !effects?.companions?.some(c => c.id === grant.companion)) return;
	const def = COMPANION_Z[grant.companion];
	const slot = mon.moveSlots.find(move => move.id === def.base);
	if (!slot || slot.pp <= 0 || slot.disabled) return;
	return { ...def, source: companionSource(grant.companion), power: 185, accuracy: true };
}
export function chooseCompanionZ(player: Side, target = '1') {
	const mon = player.active[player.choice.actions.length], def = companionZRequest(mon);
	const loc = Number(target);
	if (player.requestState !== 'move' || !def || !Number.isInteger(loc) ||
		(def.target === 'normal' && !player.battle.validTargetLoc(loc, mon, def.target))) {
		return player.emitChoiceError('当前不能使用同行训练家的额外 Z 招式，或目标已失效。');
	}
	player.choice.actions.push({
		choice: 'move', pokemon: mon, moveid: def.move, targetLoc: def.target === 'normal' ? loc : 0,
	});
	return true;
}
/** Called after BeforeMove, so sleep, flinching and full paralysis do not spend the opportunity. */
export function spendCompanionZ(mon: Pokemon, move: ActiveMove, target: Pokemon) {
	const def = companionZRequest(mon);
	if (!def || def.move !== move.id || !mon.deductPP(def.base)) return false;
	(mon.battle.fantasyRogue!.companionZUsed ||= {})[mon.side.id] = true;
	mon.moveUsed(move, mon.getLocOf(target));
	mon.battle.add('-message', `${def.source}${def.name}！本场已使用同行额外 Z，不占常规 Z 次数。`);
	return true;
}
