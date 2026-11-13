import type { Pokemon } from './pokemon';
import type { Battle } from './battle';
import type { ItemData } from './dex-items';
import { hasBlessing, blessingEffects } from './fantasy-rogue-blessings';
import { ELECTRIC_MOUSE_FAMILY, inBlessingFamily } from './rogue-blessing-data';

export function mouseFamilyActive(mon: Pokemon) {
	if (!hasBlessing(mon, 'mousefamily')) return false;
	// Item discovery also runs during type events: this species-only condition must not call getTypes().
	const party = blessingEffects(mon)?.party || mon.side.pokemon.map(p => ({ species: p.baseSpecies.name }));
	return party.length === 6 && party.every(p => inBlessingFamily(p.species, ELECTRIC_MOUSE_FAMILY));
}
export function shareableRogueItem(item: Item) {
	return item.exists && !item.id.startsWith('rogueuniversal') && !item.megaStone && !item.zMove &&
		!item.onPlate && !item.onMemory && !item.onDrive &&
		!['redorb', 'blueorb', 'rustedsword', 'rustedshield', 'griseousorb', 'griseouscore', 'adamantcrystal',
			'lustrousglobe', 'wellspringmask', 'hearthflamemask', 'cornerstonemask', 'gmegawishingstar'].includes(item.id);
}
function physicalItem(mon: Pokemon): ID { return mon.m.rogueItemContext?.id ?? mon.item; }
/** Selected owners use their real equipment; only unselected owners use the battle snapshot. */
function reserveItemOwners(mon: Pokemon) {
	const selected = new Set(mon.side.pokemon.map(owner => owner.set.fantasyRogueId));
	return blessingEffects(mon)?.party?.filter(owner => !selected.has(owner.id)) || [];
}
function familyItems(mon: Pokemon): string[] {
	return [...mon.side.pokemon.map(physicalItem), ...reserveItemOwners(mon).map(owner => owner.item || '')];
}
export function sharedRogueItems(mon: Pokemon): ID[] {
	if (!mouseFamilyActive(mon)) return [];
	return [...new Set(familyItems(mon).filter(id => shareableRogueItem(mon.battle.dex.items.get(id))))] as ID[];
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
/** Modify the effective item, preserving native suppression and secondary-effect handling. */
export function rogueItemData(mon: Pokemon, item: Item): Item & ItemData {
	if (item.id === 'lifeorb' && hasBlessing(mon, 'lifepower')) {
		return {
			...item,
			onModifyDamage(this: Battle) { return this.chainModify([6554, 4096]); },
			onAfterMoveSecondarySelf(this: Battle, source: Pokemon, target: Pokemon, move: ActiveMove) {
				if (source && source !== target && move && move.category !== 'Status' && !source.forceSwitchFlag) {
					this.damage(source.baseMaxhp / 5, source, source, this.dex.items.get('lifeorb'));
				}
			},
		};
	}
	if (item.id !== 'lightball' || !mouseFamilyActive(mon)) return item;
	return {
		...item,
		onModifyAtk(this: Battle) { return this.chainModify(2); },
		onModifySpA(this: Battle) { return this.chainModify(2); },
	};
}
/** Return true for renewable items; otherwise spend the shared charge for the entire family. */
export function consumeRogueItem(mon: Pokemon, item: Item): boolean {
	if (hasBlessing(mon, 'renewable') && !mon.m.rogueRenewableUsed) {
		mon.m.rogueRenewableUsed = true;
		return true;
	}
	const shared = mouseFamilyActive(mon) && shareableRogueItem(item);
	if (item.id === 'weaknesspolicy' && hasBlessing(mon, 'weakness')) {
		const count = shared ? familyItems(mon).filter(id => id === item.id).length : 1;
		const state = mon.battle.fantasyRogue!;
		if (mon.side.id === 'p1') state.weaknessPoliciesSpent = (state.weaknessPoliciesSpent || 0) + count;
		else if (mon.side.id === 'p3' && state.cooperative && state.partner) {
			state.partnerWeaknessPoliciesSpent = (state.partnerWeaknessPoliciesSpent || 0) + count;
		}
	}
	if (!shared) return false;
	for (const owner of reserveItemOwners(mon)) {
		if (owner.item !== item.id) continue;
		owner.consumedItem = item.id;
		owner.item = '';
	}
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
