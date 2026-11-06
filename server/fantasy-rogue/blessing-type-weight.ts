import { blessing, BLESSING_TYPES, type BlessingDefinition, type BlessingEffects } from '../../sim/rogue-blessing-data';
import { COMPANIONS, companionFamilyTypes } from '../../sim/rogue-companions';
import { sharedPartyTypes } from '../../sim/rogue-unity';

export const REGI_EMBLEM_TYPES = ['Rock', 'Ice', 'Steel', 'Electric', 'Dragon'];

/** Owned effects establish this preference; Unity follows the currently shared party types. */
export function strengthenedBlessingTypes(state: BlessingEffects, partyTypes: string[][] = []): Set<string> {
	const types = new Set<string>();
	for (const entry of state.owned) {
		const def = blessing(entry.id);
		if (!def) continue;
		if (def.family === 'unity') for (const type of sharedPartyTypes(partyTypes)) types.add(type);
		const type = def.type;
		if (type && Object.prototype.hasOwnProperty.call(BLESSING_TYPES, type)) types.add(type);
		const selected = (state.companions || []).filter(c => COMPANIONS[c.id]?.family === def.family);
		if (selected.length) {
			for (const companion of selected) for (const t of COMPANIONS[companion.id].types) types.add(t);
			// Iris boosts Dragon partners without attaching a type ability to the companion herself.
			if (def.family === 'dragonking') types.add('Dragon');
		} else {
			// A two-way companion offer has no chosen type until the player settles its branch.
			const familyTypes = companionFamilyTypes(def.family);
			if (familyTypes.length === 1) types.add(familyTypes[0]);
		}
	}
	return types;
}

/** A single +20% relative weight; multiple matching effects never compound it. */
export function blessingEmblemWeight(def: BlessingDefinition, strengthened: ReadonlySet<string>) {
	const types = def.emblem && def.type ? [def.type] : def.family === 'regis' ? REGI_EMBLEM_TYPES :
		def.family === 'monkeyking' ? ['Rock', 'Flying'] : [];
	return types.some(type => strengthened.has(type)) ? 1.2 : 1;
}
