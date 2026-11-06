import type { Battle } from './battle';
import { rogueBattleResult, rogueGrowthNotice, type RoguePokemon } from './fantasy-rogue';
import { toID } from './dex';

export interface RogueGrowthUpdate {
	sequence: number;
	revision: number;
	team: RoguePokemon[];
	bag: Record<string, number>;
	paused: boolean;
}

/** Pause only between simulator decisions, never halfway through a move or faint queue. */
export function requestRogueGrowth(battle: Battle): boolean {
	const state = battle.fantasyRogue;
	if (!state?.liveProgression || battle.ended) return false;
	if (state.growthWaiting) return true;
	const sequence = state.defeated?.length || 0;
	if (sequence <= (state.growthSequence || 0)) return false;
	state.growthWaiting = true;
	for (const side of battle.sides) side.emitRequest({ wait: true, side: side.getRequestData() });
	battle.sendUpdates();
	battle.send('fantasyrogueprogress', JSON.stringify({ sequence, result: rogueBattleResult(battle, false) }));
	return true;
}

/** Trusted manager acknowledgement; no browser command accepts these snapshots. */
export function applyRogueGrowth(battle: Battle, update: RogueGrowthUpdate) {
	const state = battle.fantasyRogue;
	if (!state?.liveProgression || !state.growthWaiting || battle.ended ||
		update.sequence !== state.defeated?.length || update.revision <= (state.growthRevision || 0)) return;
	for (const saved of update.team) {
		if (saved.egg || saved.nuzlockeDead) continue;
		const original = state.team.find(mon => mon.id === saved.id);
		let mon = battle.p1.pokemon.find(pokemon => pokemon.set.fantasyRogueId === saved.id);
		if (!original || !mon) {
			// Only evolution-created partners (e.g. Shedinja) may join during this pause.
			const shedinjaEvolution = !original && toID(saved.set.species) === 'shedinja' && state.team.some(old =>
				toID(old.set.species) === 'nincada' && update.team.some(next =>
					next.id === old.id && toID(next.set.species) === 'ninjask'));
			if (shedinjaEvolution) {
				const template = battle.p1.pokemon[0].set;
				mon = battle.p1.addPokemon({ ...saved.set, fantasyRogueId: saved.id,
					fantasyRogueStats: template.fantasyRogueStats,
					fantasyRogueBoostPercent: template.fantasyRogueBoostPercent,
					fantasyRogueScale: 1, fantasyRogueModifiers: saved.statModifiers }) || undefined;
			}
			if (!mon) continue;
		}
		const previous = original || saved;
		const evolved = previous.set.species !== saved.set.species;
		const levelChanged = mon.level !== saved.set.level;
		const lostHP = mon.baseMaxhp - mon.getUndynamaxedHP();
		const alive = mon.hp > 0;
		const transformed = mon.transformed;
		const types = mon.types.slice(), addedType = mon.addedType;
		const apparentType = mon.apparentType, knownType = mon.knownType, weighthg = mon.weighthg;
		const currentSpecies = mon.species;
		const oldBaseStats = { ...mon.baseStoredStats }, oldStats = { ...mon.storedStats };
		const oldBaseSlots = mon.baseMoveSlots.slice(), oldSlots = mon.moveSlots.slice();
		Object.assign(mon.set, { ...saved.set, fantasyRogueModifiers: structuredClone(saved.statModifiers) });
		mon.level = saved.set.level;
		if (evolved) mon.baseSpecies = battle.dex.species.get(saved.set.species);
		// Recalculate the current battle form without restoring HP/PP or clearing volatiles.
		mon.setSpecies(transformed || evolved ? mon.baseSpecies : currentSpecies);
		if (transformed) {
			mon.species = currentSpecies;
			mon.weighthg = weighthg;
			Object.assign(mon.storedStats, oldStats);
		} else {
			// Power/Guard Split change the raw stats; Power Trick additionally swaps two axes.
			// Preserve these temporary effects while updating ordinary stats for level/EV gains.
			if (mon.volatiles.powertrick) [oldStats.atk, oldStats.def] = [oldStats.def, oldStats.atk];
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) {
				if (oldStats[stat] !== oldBaseStats[stat]) mon.storedStats[stat] = oldStats[stat];
			}
			if (mon.volatiles.powertrick) {
				[mon.storedStats.atk, mon.storedStats.def] = [mon.storedStats.def, mon.storedStats.atk];
			}
		}
		if (transformed || !evolved) {
			mon.types = types; mon.addedType = addedType;
			mon.apparentType = apparentType; mon.knownType = knownType;
		}
		mon.speed = mon.storedStats.spe;
		mon.baseMaxhp = mon.baseStoredStats.hp;
		const hpScale = mon.volatiles.dynamax && mon.baseMaxhp !== 1 ? 2 : 1;
		mon.maxhp = mon.baseMaxhp * hpScale;
		mon.hp = alive ? Math.max(1, Math.min(mon.maxhp, (mon.baseMaxhp - lostHP) * hpScale)) : 0;
		const slots = saved.pp.map(slot => {
			const move = battle.dex.moves.get(slot.id);
			return { move: move.name, id: move.id, pp: slot.pp, maxpp: slot.maxpp,
				target: move.target, disabled: false, disabledSource: '',
				used: oldBaseSlots.some(old => old.id === move.id && old.used) };
		});
		mon.baseMoveSlots.splice(0, mon.baseMoveSlots.length, ...slots);
		if (!transformed) mon.moveSlots = slots.map((slot, index) => {
			const old = oldSlots[index];
			if (!old || oldBaseSlots[index]?.id !== slot.id) return slot;
			// Mimic and similar temporary replacements last until switching out.
			if (old.id !== slot.id) return old;
			// Ordinary slots share the base slot so future PP deductions are saved too.
			Object.assign(slot, old, { pp: slot.pp, maxpp: slot.maxpp });
			return slot;
		});
		if (evolved) {
			// Keep the battle identity stable; detailschange updates the displayed species.
			mon.baseAbility = toID(saved.set.ability);
			if (!transformed) mon.setAbility(saved.set.ability);
		}
		if (mon.m.rogueBlessing) mon.m.rogueBlessing.bonusHP = 0;
		mon.details = mon.getUpdatedDetails();
		if (mon.isActive && (evolved || levelChanged)) {
			battle.add('detailschange', mon, mon.details);
			battle.add('-sethp', mon, mon.getHealth, '[silent]');
		}
		const notice = rogueGrowthNotice(previous, saved);
		if (notice) battle.add('-roguegrowth', JSON.stringify(notice));
	}
	state.team = structuredClone(update.team.filter(mon =>
		battle.p1.pokemon.some(pokemon => pokemon.set.fantasyRogueId === mon.id)));
	state.bag = { ...update.bag };
	state.growthSequence = update.sequence;
	state.growthRevision = update.revision;
	state.growthWaiting = update.paused;
	if (!update.paused) battle.makeRequest();
}
