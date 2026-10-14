import type { Pokemon } from './pokemon';
import type { Battle } from './battle';
import { hasBlessing } from './fantasy-rogue-blessings';
import { ELECTRIC_MOUSE_FAMILY, inBlessingFamily } from './rogue-blessing-data';

export function mouseFamilyActive(mon: Pokemon) {
	return !!hasBlessing(mon, 'mousefamily') && mon.side.pokemon.length === 6 &&
		mon.side.pokemon.every(p => inBlessingFamily(p.baseSpecies.name, ELECTRIC_MOUSE_FAMILY));
}
export function shareableRogueItem(item: Item) {
	return item.exists && !item.megaStone && !item.zMove && !item.onPlate && !item.onMemory && !item.onDrive &&
		!['redorb', 'blueorb', 'rustedsword', 'rustedshield', 'griseousorb', 'griseouscore', 'adamantcrystal',
			'lustrousglobe', 'wellspringmask', 'hearthflamemask', 'cornerstonemask', 'gmegawishingstar'].includes(item.id);
}
function physicalItem(mon: Pokemon): ID { return mon.m.rogueItemContext?.id ?? mon.item; }
export function sharedRogueItems(mon: Pokemon): ID[] {
	if (!mouseFamilyActive(mon)) return [];
	return [...new Set(mon.side.pokemon.map(physicalItem).filter(id => shareableRogueItem(mon.battle.dex.items.get(id))))];
}
/** Borrow the native item callback context, without replacing the real carried item or its state. */
export function rogueItemCallback(mon: Pokemon, item: Item, callback: any): any {
	if (typeof callback !== 'function') return callback;
	return function (this: Battle, ...args: any[]) {
		if (!sharedRogueItems(mon).includes(item.id) || mon.m.rogueUsingItem === item.id) return;
		const originalItem = mon.item, originalState = mon.itemState, originalEffect = this.effect;
		const previousContext = mon.m.rogueItemContext;
		mon.m.rogueItemContext = previousContext || { id: originalItem, state: originalState };
		mon.item = item.id;
		mon.itemState = mon.volatiles[`item:${item.id}`];
		this.effect = item;
		try { return callback.apply(this, args); } finally {
			// Another shared effect may have consumed the actual carried item while this callback was active.
			mon.item = mon.m.rogueItemContext.id;
			mon.itemState = mon.m.rogueItemContext.state;
			if (previousContext) mon.m.rogueItemContext = previousContext;
			else delete mon.m.rogueItemContext;
			this.effect = originalEffect;
		}
	};
}
export function sharedRogueItemData(mon: Pokemon, item: Item): Item {
	if (item.id !== 'lightball' || !mouseFamilyActive(mon)) return item;
	return {
		...item,
		onModifyAtk(this: Battle) { return this.chainModify(2); },
		onModifySpA(this: Battle) { return this.chainModify(2); },
	};
}
/** Return true for renewable items; otherwise spend the shared charge for the entire family. */
export function consumeRogueItem(mon: Pokemon, item: Item): boolean {
	if (hasBlessing(mon, 'renewable')) return true;
	if (!mouseFamilyActive(mon) || !shareableRogueItem(item)) return false;
	for (const owner of mon.side.pokemon) {
		if (physicalItem(owner) !== item.id) continue;
		if (owner.m.rogueBlessing) owner.m.rogueBlessing.consumed = item.id;
		const state = owner.battle.initEffectState({ id: '', target: owner });
		if (owner.m.rogueItemContext) {
			owner.m.rogueItemContext.id = '';
			owner.m.rogueItemContext.state = state;
		} else { owner.item = '' as ID; owner.itemState = state; }
	}
	return false;
}
