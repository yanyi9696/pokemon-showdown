import type { Battle } from '../../sim/battle';
import type { Pokemon } from '../../sim/pokemon';
import type { Side } from '../../sim/side';
import type { Combatant } from './hypotheses';
import type { SeenPokemon, SeenSide } from './memory';
import { DELAYED_HEALING } from './mechanics';

export interface FantasyState {
	guiYingUsed?: boolean;
	/** Fantasy Sachet publicly replaces the base ability, surviving switches. */
	baseAbility?: string;
	gemTypes?: string[];
	/** Public rounded HP losses form an interval, not an exact hidden counter. */
	shadowBottle?: { lower: number, upper: number, ticks: number };
}

export const FANTASY_VOLATILES = new Set([
	'gempermanentboost', 'gemdefensepermanentboost', 'fantasyultraenergyboost', 'suppressability',
]);

export function gemType(effect: string): string | undefined {
	return ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
		'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy']
		.find(type => effect.toLowerCase() === `gemboost${type.toLowerCase()}`);
}

/** Restore public permanent state without re-firing an item's/ability's onStart callback. */
export function restoreFantasyState(battle: Battle, mon: Pokemon, profile: Combatant, seen?: SeenPokemon): void {
	const state = profile.fantasy;
	if (state?.baseAbility) mon.baseAbility = state.baseAbility as ID;
	if (state?.guiYingUsed) mon.m.guiYingUsed = true;
	if (state?.gemTypes?.length) {
		mon.m.gemBoosts = state.gemTypes.slice();
		mon.side.sideConditions.gemboost = battle.initEffectState({ id: 'gemboost', target: mon.side });
		if (mon.isActive) {
			mon.volatiles.gempermanentboost = battle.initEffectState({ id: 'gempermanentboost', target: mon });
		}
	}
	if ((seen?.persistentEffects || profile.persistentEffects)?.includes('gemdefensepermanentboost')) {
		mon.m.hasFantasyDefenseGem = true;
		mon.side.sideConditions.gemdefenseboost = battle.initEffectState({ id: 'gemdefenseboost', target: mon.side });
		if (mon.isActive) {
			mon.volatiles.gemdefensepermanentboost = battle.initEffectState({ id: 'gemdefensepermanentboost', target: mon });
		}
	}
	if (mon.item === 'shadowbottle' && state?.shadowBottle) {
		const counter = state.shadowBottle;
		// Prefer the native normal tick total when consistent with the public HP interval.
		// Other damage modifiers can change it: use an explicitly approximate midpoint then.
		const normal = Math.max(1, Math.floor(mon.maxhp / 16)) * counter.ticks;
		const lower = Math.max(0, Math.ceil(counter.lower * mon.maxhp - 1e-6));
		const upper = Math.max(lower, Math.floor(counter.upper * mon.maxhp + 1e-6));
		mon.itemState.damageTaken = normal >= lower && normal <= upper ? normal : Math.round((lower + upper) / 2);
	}
}

/** Slot effects survive switching; resolve their original public source across the full hypothetical team. */
export function restoreDelayedHealing(
	battle: Battle, side: Side, memory: SeenSide, resolve: (appearance: string, ident: string) => Pokemon | undefined,
	approximate = false,
): string[] {
	const diagnostics: string[] = [];
	for (const effect of Object.values(memory.slotConditions || {})) {
		const capacity = DELAYED_HEALING[effect.id];
		if (!capacity) continue;
		const duration = 2 - (battle.turn - effect.turn);
		if (duration <= 0) continue;
		let source = resolve(effect.source, effect.sourceIdent);
		let maxhp = source?.maxhp;
		if (!source) {
			if (!approximate) throw new Error(`missing-slot-source:${effect.id}`);
			// A two-Pokemon probe has no bench. Approximate the disclosed caster's HP,
			// not the replacement's HP; full-world reconstruction never uses this shortcut.
			const species = battle.dex.species.get(effect.sourceSpecies);
			maxhp = species.baseStats.hp === 1 ? 1 :
				Math.floor((2 * species.baseStats.hp + 94) * effect.sourceLevel / 100) + effect.sourceLevel + 10;
			source = side.active[0];
			diagnostics.push(`approximate-slot-source:${effect.id}`);
		}
		side.slotConditions[0][effect.id] = battle.initEffectState({
			id: effect.id, target: side, source, sourceSlot: source.getSlot(), isSlotCondition: true,
			duration, hp: Math.floor(maxhp! * capacity),
		});
	}
	return diagnostics;
}
