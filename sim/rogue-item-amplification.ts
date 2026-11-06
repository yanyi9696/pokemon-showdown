import type { Pokemon, EffectState } from './pokemon';
import type { Battle } from './battle';

/** Campaign-only module; normal formats retain their existing ability/item behavior. */
export function hasRogueItemModule(mon: Pokemon | null | undefined): boolean {
	return !!mon?.battle.fantasyRogue && mon.hasAbility('rogueitemmodule') && !mon.battle.suppressingAbility(mon);
}
export function rogueItemBonusFactor(mon: Pokemon | null | undefined): number {
	return hasRogueItemModule(mon) ? (mon!.hasAbility('zengfuxitong') ? 4 : 2) : 1;
}
export const amplifyItemMultiplier = (multiplier: number, factor: number) =>
	multiplier > 1 ? 1 + (multiplier - 1) * factor : multiplier;

const EVENTS = new Set(['ModifyAtk', 'ModifyDef', 'ModifySpA', 'ModifySpD', 'ModifySpe',
	'BasePower', 'ModifyDamage', 'TryHeal']);
/** Amplify only the positive contribution of this item callback, before other sources combine. */
export function amplifyRogueItemEvent(
	battle: Battle, event: string, effect: Effect, holder: Pokemon, state: EffectState,
	beforeModifier: number, beforeValue: unknown, result: unknown
): any {
	if (!EVENTS.has(event) || battle.event.target !== holder) return result;
	const itemEffect = effect.effectType === 'Item' || state.sourceEffect?.effectType === 'Item';
	if (!itemEffect) return result;
	const factor = rogueItemBonusFactor(holder);
	if (factor === 1) return result;
	const multiplier = battle.event.modifier / beforeModifier;
	if (multiplier > 1) {
		battle.event.modifier = beforeModifier;
		battle.chainModify(amplifyItemMultiplier(multiplier, factor));
	}
	return typeof result === 'number' && typeof beforeValue === 'number' && result > beforeValue ?
		beforeValue + (result - beforeValue) * factor : result;
}
