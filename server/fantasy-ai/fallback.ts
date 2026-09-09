import { enumerateRequestChoices } from './actions';
import type { AbilityData } from '../../sim/dex-abilities';
import type { ItemData } from '../../sim/dex-items';
import { HypothesisBuilder, type Combatant } from './hypotheses';
import type { Observation } from './information';
import { effectiveAbility, effectiveItem } from './mechanics';
import { ownSeen, readBattleMemory } from './memory';
import { activeTypes, observedImmunity } from './strategy';

/**
 * Worker unavailable before its first result: use public evidence/static type rules only.
 * This runs on the server thread, so it must not create Battles or run a search.
 * Complex move/type callbacks are left uncertain and handled by the worker's native probes.
 */
export function emergencyChoice(observation: Observation, format: string, excluded: readonly string[] = []): string {
	const request = observation.request;
	if (request.wait || request.teamPreview || request.forceSwitch) {
		return enumerateRequestChoices(request).find(choice => !excluded.includes(choice)) || 'default';
	}
	const builder = new HypothesisBuilder(format);
	const dex = builder.dex;
	const memory = readBattleMemory(observation.publicLog, dex);
	const side = observation.ownSide;
	const choices = enumerateRequestChoices(request, memory.sides[side].resources)
		.filter(choice => !excluded.includes(choice));
	const active = memory.sides[side].active;
	const foe = memory.sides[side === 'p1' ? 'p2' : 'p1'].active;
	if (!foe) return choices[0] || 'default';
	const current = request.side.pokemon.find(mon => mon.active)!;
	const own = builder.own(current, active);
	const types = foe.teraType && foe.teraType !== 'Stellar' ? [foe.teraType] :
		foe.types || dex.species.get(foe.species).types;
	const typeImmune = (mon: Combatant, id: string) => {
		const move = dex.moves.get(id);
		const ability = effectiveAbility(mon);
		const item = effectiveItem(mon, memory);
		const abilityData: AbilityData = dex.abilities.get(ability);
		const itemData: ItemData = dex.items.get(item);
		if (move.category === 'Status' || move.onModifyType || move.onModifyMove || move.onTryHit ||
			abilityData.onModifyType || abilityData.onModifyMove) return false;
		if (itemData.onModifyMove && !['fantasypowerlens', 'fantasyscopelens', 'fantasymachobrace'].includes(item)) {
			return false;
		}
		if (item === 'fantasyringtarget' || foe.item === 'ringtarget' || move.ignoreImmunity === true ||
			typeof move.ignoreImmunity === 'object' && move.ignoreImmunity?.[move.type]) return false;
		if (['scrappy', 'mindseye'].includes(ability) && ['Normal', 'Fighting'].includes(move.type)) return false;
		return !dex.getImmunity(move.type, types);
	};
	const blocked = (choice: string) => {
		const [kind, slot, event] = choice.split(' ');
		if (kind !== 'move') return false;
		if (event && event !== 'terastallize') return false;
		const id = request.active[0].moves[Number(slot) - 1]?.id;
		if (!id) return false;
		if (!event && observedImmunity(memory, active, foe, id)) return true;
		return typeImmune(own, id);
	};
	const available = choices.filter(choice => !blocked(choice));
	const moves = available.filter(choice => choice.startsWith('move '));
	if (moves.length) return moves[0];
	const switches = available.filter(choice => choice.startsWith('switch ')).map(choice => {
		const mon = request.side.pokemon[Number(choice.split(' ')[1]) - 1];
		const profile = builder.own(mon, ownSeen(memory, side, mon.ident, false));
		const useful = profile.moves.filter(id => dex.moves.get(id).category !== 'Status' && !typeImmune(profile, id)).length;
		const weaknesses = Math.max(0, ...foe.moves.map(id =>
			dex.getEffectiveness(dex.moves.get(id).type, [...activeTypes(profile, dex)])));
		return { choice, value: profile.health.upper * 20 + useful * 8 - weaknesses * 10 };
	}).sort((a, b) => b.value - a.value || a.choice.localeCompare(b.choice));
	return switches[0]?.choice || choices[0] || 'default';
}
