import type { Battle } from './battle';
import type { Pokemon } from './pokemon';

export interface RogueItemSource {
	key: string;
	item: string;
	/** Already belonged to either human before this encounter, including equipment later recovered. */
	owned: boolean;
}
const transfers = new WeakMap<Item, RogueItemSource>();

export function initializeRogueItemSources(battle: Battle) {
	const state = battle.fantasyRogue;
	if (state?.spirit?.id !== 'hoopagift') return;
	state.itemSourceVersion = 1;
	state.itemSourceSerial = 0;
	for (const side of battle.sides) for (const [index, mon] of side.pokemon.entries()) {
		if (!mon.item) continue;
		mon.m.rogueItemSource = { key: `initial:${side.id}:${index}:${mon.item}`, item: mon.item,
			owned: side.id === 'p1' || side.id === 'p3' && !!state.partner } satisfies RogueItemSource;
	}
}

/** Pure snapshot. Unknown/legacy origins must never reroll equipment already owned by a player. */
export function rogueItemSource(mon: Pokemon): RogueItemSource | undefined {
	if (!mon.battle.fantasyRogue?.itemSourceVersion || !mon.item) return;
	if (mon.m.rogueItemContext && mon.m.rogueItemContext.id !== mon.item) {
		return { key: `shared:${mon.side.id}:${mon.item}`, item: mon.item, owned: true };
	}
	const source = mon.m.rogueItemSource as RogueItemSource | undefined;
	return source?.item === mon.item ? { ...source } :
		{ key: `unknown:${mon.side.id}:${mon.set.fantasyRogueId}:${mon.item}`, item: mon.item, owned: true };
}

/** A transfer carries the physical item's identity without mutating global Dex item definitions. */
export function takenRogueItem(mon: Pokemon, item: Item): Item {
	const source = rogueItemSource(mon);
	if (!source) return item;
	const copy: Item = Object.assign(Object.create(Object.getPrototypeOf(item)), item);
	transfers.set(copy, source);
	return copy;
}

export function setRogueItemSource(mon: Pokemon, item: Item) {
	const state = mon.battle.fantasyRogue;
	if (!state?.itemSourceVersion || !item.id) return;
	const source = transfers.get(item);
	mon.m.rogueItemSource = source ? { ...source } : {
		key: `generated:${state.itemSourceSerial = (state.itemSourceSerial || 0) + 1}`,
		item: item.id, owned: false,
	} satisfies RogueItemSource;
}

export function rememberUsedRogueItem(mon: Pokemon, source: RogueItemSource | undefined) {
	if (source) mon.m.rogueLastItemSource = { ...source };
}

/** Pickup, Recycle, Harvest and Replenish restore an existing item, not a fresh prize. */
export function recoveredRogueItem(donor: Pokemon, id: string): Item {
	const item = donor.battle.dex.items.get(id);
	if (!donor.battle.fantasyRogue?.itemSourceVersion) return item;
	const old = donor.m.rogueLastItemSource as RogueItemSource | undefined;
	const source = old?.item === item.id ? old :
		{ key: `unknown-recovery:${donor.side.id}:${donor.set.fantasyRogueId}:${item.id}`, item: item.id, owned: true };
	const copy: Item = Object.assign(Object.create(Object.getPrototypeOf(item)), item);
	transfers.set(copy, { ...source });
	return copy;
}
