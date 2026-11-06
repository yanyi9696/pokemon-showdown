import type { Pokemon } from './pokemon';
import { Species } from './dex-species';
import { canRogueSystem } from './fantasy-rogue';
import { universalItem, validUniversalBonus, universalAuraChoices, type UniversalKind } from './rogue-universal-data';

export function universalConfiguration(mon: Pokemon) {
	const state = mon.battle.fantasyRogue;
	if (!state || !mon.set.fantasyRogueId) return;
	const team = mon.side.id === 'p1' ? state.team : mon.side.id === 'p3' ? state.partner?.team :
		mon.side.id === 'p2' ? state.duel?.team : undefined;
	const saved = team?.find(p => p.id === mon.set.fantasyRogueId);
	const config = saved?.universalEvolution;
	return !saved?.nuzlockeDead && config?.version === 1 && config.item === mon.item &&
		validUniversalBonus(config.item, config.bonus) ? config : undefined;
}
export function universalKind(mon: Pokemon): UniversalKind | undefined {
	const config = universalConfiguration(mon);
	return config ? universalItem(config.item)?.kind : undefined;
}
export function canUniversalEvolution(mon: Pokemon, kind: UniversalKind): string | null {
	const config = universalConfiguration(mon), item = config && universalItem(config.item);
	const stats = { ...mon.species.baseStats };
	for (const stat of Object.keys(stats) as StatID[]) stats[stat] += mon.set.fantasyRogueModifiers?.baseStats?.[stat] || 0;
	if (item?.kind !== kind || mon.transformed || mon.terastallized || mon.m.rogueUniversalKind ||
		kind !== 'gmega' && mon.baseSpecies.nfe || mon.baseSpecies.isMega || !canRogueSystem(mon, kind) ||
		mon.battle.fantasyRogue?.evolutionUses?.[mon.side.id]?.[kind] ||
		kind === 'z' && (mon.side.zMoveUsed || !config?.aura ||
			!universalAuraChoices(stats, config.bonus).includes(config.aura) || !mon.getTypes().includes(item.type))) return null;
	return mon.species.name;
}
export function recordRogueEvolution(mon: Pokemon, kind: UniversalKind) {
	const state = mon.battle.fantasyRogue;
	if (!state) return;
	((state.evolutionUses ||= {})[mon.side.id] ||= {})[kind] = true;
}
export function runUniversalEvolution(mon: Pokemon): boolean {
	const kind = universalKind(mon);
	if (!mon.hp || !kind || !canUniversalEvolution(mon, kind)) return false;
	const config = universalConfiguration(mon)!, battle = mon.battle;
	const hp = mon.hp, maxhp = mon.maxhp, ability = mon.getAbility().name;
	const baseStats = { ...mon.species.baseStats };
	for (const stat of Object.keys(baseStats) as StatID[]) baseStats[stat] += config.bonus[stat];
	const species = new Species({ ...mon.species, baseStats, abilities: { 0: ability },
		isMega: kind !== 'z', isGMega: kind === 'gmega', mod: 'gen9fantasy' });
	// Keep the model/name; no synthetic species enters the shared Dex cache.
	if (!mon.formeChange(species, battle.format, true)) return false;
	mon.m.rogueUniversalKind = kind;
	mon.baseMaxhp = mon.baseStoredStats.hp;
	mon.maxhp = mon.baseMaxhp;
	mon.hp = Math.max(1, Math.min(mon.maxhp, mon.maxhp - (maxhp - hp)));
	mon.canTerastallize = null;
	recordRogueEvolution(mon, kind);
	if (kind === 'z') {
		mon.side.zMoveUsed = true;
		mon.addVolatile(`auraburst${config.aura!}`, mon, battle.format);
		for (const ally of mon.side.pokemon) ally.canUltraBurst = null;
	} else {
		for (const ally of mon.side.pokemon) if (ally.canMegaEvo &&
			(universalKind(ally) === 'gmega' || !!battle.dex.species.get(ally.canMegaEvo).isGMega) === (kind === 'gmega')) {
			ally.canMegaEvo = null;
		}
		battle.runEvent('AfterMega', mon);
	}
	battle.add('-heal', mon, mon.getHealth, '[silent]');
	battle.add('-message', `【${universalItem(config.item)!.name}】已发动；模型与主特性保持，特性重新生效。`);
	return true;
}
