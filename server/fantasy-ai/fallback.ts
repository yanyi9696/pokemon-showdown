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
export function emergencyChoice(
	observation: Observation, format: string, excluded: readonly string[] = [], smart = false
): string {
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
	if (moves.length && !smart) return moves[0];
	if (moves.length) {
		const boost = (stage = 0) => stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
		const attackStat = (category: string) => category === 'Physical' ? 'atk' : 'spa';
		const strongest = Math.max(own.stats.atk * boost(own.boosts.atk), own.stats.spa * boost(own.boosts.spa));
		const foeSide = memory.sides[side === 'p1' ? 'p2' : 'p1'];
		const score = (choice: string) => {
			const [kind, slot, event] = choice.split(' ');
			const move = dex.moves.get(request.active[0].moves[Number(slot) - 1]?.id);
			if (kind !== 'move' || !move.exists) return -100;
			if (move.id === 'fakeout' && (active?.activeMoveActions || 0) > 0) return -90;
			if (move.category !== 'Status') {
				const stat = attackStat(move.category);
				let power = move.basePower || (move.damage ? 70 : move.ohko ? 100 : 50);
				if (move.multihit) {
					power *= typeof move.multihit === 'number' ? move.multihit : (move.multihit[0] + move.multihit[1]) / 2;
				}
				if (move.flags.charge && !own.volatiles.includes(move.id)) power *= 0.65;
				if (move.selfdestruct) power *= 0.6;
				const stab = activeTypes(own, dex).includes(move.type) ? 1.5 : 1;
				const effectiveness = 2 ** dex.getEffectiveness(move.type, types);
				const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
				return power * stab * effectiveness * accuracy * own.stats[stat] * boost(own.boosts[stat]) / strongest +
					(move.priority > 0 && foe.health.upper < 0.25 ? 25 : 0) + (event ? 1 : 0);
			}
			if (['splash', 'celebrate', 'holdhands', 'happyhour', 'teleport'].includes(move.id)) return -100;
			if (move.heal || ['rest', 'strengthsap', 'wish'].includes(move.id)) {
				return own.health.upper > 0.75 ? -80 : (1 - own.health.upper) * 190;
			}
			if (move.status) {
				if (foe.status || !dex.getImmunity(move.status, types) ||
					move.ignoreImmunity !== true && !dex.getImmunity(move.type, types) ||
					foe.volatiles.includes('substitute') || foeSide.conditions.safeguard) return -80;
				return foe.health.upper < 0.25 ? 5 : 65;
			}
			if (move.boosts) {
				const self = move.target === 'self';
				const target = self ? own : foe;
				let value = 0;
				for (const [stat, amount] of Object.entries(move.boosts)) {
					const stage = target.boosts[stat as BoostID] || 0;
					if (amount > 0 && stage >= 2 || amount < 0 && stage <= -2) continue;
					if (self && ['atk', 'spa'].includes(stat) && !own.moves.some(id =>
						dex.moves.get(id).category === (stat === 'atk' ? 'Physical' : 'Special'))) continue;
					value += Math.min(2, Math.abs(amount)) * 30;
				}
				return own.health.upper < 0.4 || foe.health.upper < 0.3 ? -20 : value;
			}
			if (move.sideCondition) {
				const conditions = (move.target === 'allySide' ? memory.sides[side] : foeSide).conditions;
				const max = move.sideCondition === 'spikes' ? 3 : move.sideCondition === 'toxicspikes' ? 2 : 1;
				if ((conditions[move.sideCondition] || 0) >= max) return -50;
				return move.target === 'foeSide' && foeSide.preview.length <= 1 ? -20 : 55;
			}
			if (move.weather) return memory.weather === move.weather ? -50 : 20;
			if (move.terrain) return memory.terrain === move.terrain ? -50 : 20;
			if (move.volatileStatus) {
				const target = move.target === 'self' ? own : foe;
				if (target.volatiles.includes(move.volatileStatus)) return -50;
				if (move.volatileStatus === 'leechseed' && types.includes('Grass')) return -80;
				if (move.volatileStatus === 'protect') return own.lastMove === move.id ? -50 : foe.status ? 30 : 5;
				if (['encore', 'disable'].includes(move.volatileStatus) && !foe.lastMove) return -50;
				return 45;
			}
			return 5;
		};
		const best = moves.map(choice => ({ choice, value: score(choice) })).sort((a, b) => b.value - a.value)[0];
		if (best.value >= 0 || !available.some(choice => choice.startsWith('switch '))) return best.choice;
	}
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
