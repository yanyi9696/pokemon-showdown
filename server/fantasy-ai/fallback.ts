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
	observation: Observation, format: string, excluded: readonly string[] = [], smart = false, enhancedMoves = smart,
	tacticalSwitches = false
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
	const abilityImmune = (id: string) => {
		const move = dex.moves.get(id);
		if (['self', 'allySide', 'all', 'allyTeam'].includes(move.target) || move.onModifyType || foe.volatiles.includes('gastroacid')) return false;
		if (move.ignoreAbility || ['moldbreaker', 'teravolt', 'turboblaze'].includes(effectiveAbility(own))) return false;
		// Only revealed abilities are used, never the opponent's private set or selected move.
		const ability = foe.ability;
		return (move.type === 'Ground' && (ability === 'eartheater' || ability === 'levitate' && !memory.pseudoWeather.includes('gravity'))) ||
			(move.type === 'Water' && ['waterabsorb', 'stormdrain', 'dryskin'].includes(ability || '')) ||
			(move.type === 'Electric' && ['voltabsorb', 'lightningrod', 'motordrive'].includes(ability || '')) ||
			(move.type === 'Fire' && ability === 'flashfire') || (move.type === 'Grass' && ability === 'sapsipper') ||
			(!!move.flags.sound && ability === 'soundproof') || (!!move.flags.bullet && ability === 'bulletproof');
	};
	const blocked = (choice: string) => {
		const [kind, slot, event] = choice.split(' ');
		if (kind !== 'move') return false;
		// A legal singles choice can still have no recipient (e.g. Helping Hand).
		const target = request.active[0].moves[Number(slot) - 1]?.target;
		if (target === 'adjacentAlly' && request.active.length === 1) return true;
		if (event && event !== 'terastallize') return false;
		const id = request.active[0].moves[Number(slot) - 1]?.id;
		if (!id) return false;
		if (!event && observedImmunity(memory, active, foe, id)) return true;
		return typeImmune(own, id) || enhancedMoves && abilityImmune(id);
	};
	const available = choices.filter(choice => !blocked(choice));
	const moves = available.filter(choice => choice.startsWith('move '));
	if (moves.length && !smart) return moves[0];
	if (moves.length) {
		const boost = (stage = 0) => stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
		const attackStat = (category: string) => category === 'Physical' ? 'atk' : 'spa';
		const strongest = Math.max(own.stats.atk * boost(own.boosts.atk), own.stats.spa * boost(own.boosts.spa));
		const foeSide = memory.sides[side === 'p1' ? 'p2' : 'p1'];
		const species = dex.species.get(foe.species);
		const estimateStat = (stat: 'hp' | 'def' | 'spd' | 'spe') => Math.floor((2 * species.baseStats[stat] + 31) * foe.level / 100) +
			(stat === 'hp' ? foe.level + 10 : 5);
		const foeHP = estimateStat('hp') * foe.health.upper;
		const score = (choice: string) => {
			const [kind, slot, event] = choice.split(' ');
			const move = dex.moves.get(request.active[0].moves[Number(slot) - 1]?.id);
			if (kind !== 'move' || !move.exists) return -100;
			if (enhancedMoves && ['snore', 'sleeptalk'].includes(move.id) && own.status !== 'slp') return -90;
			if (enhancedMoves && own.status === 'slp' && !move.sleepUsable) return -90;
			if (move.id === 'fakeout' && (active?.activeMoveActions || 0) > 0) return -90;
			if (move.category !== 'Status') {
				const stat = attackStat(move.category);
				let power = move.basePower || (move.damage ? 70 : move.ohko ? 100 : 50);
				// Preserve the existing trainer policy; this revision targets wild opponents.
				if (!enhancedMoves) {
					if (move.multihit) power *= typeof move.multihit === 'number' ? move.multihit : (move.multihit[0] + move.multihit[1]) / 2;
					if (move.flags.charge && !own.volatiles.includes(move.id)) power *= .65;
					if (move.selfdestruct) power *= .6;
					return power * (activeTypes(own, dex).includes(move.type) ? 1.5 : 1) * 2 ** dex.getEffectiveness(move.type, types) *
						(move.accuracy === true ? 1 : move.accuracy / 100) * own.stats[stat] * boost(own.boosts[stat]) / strongest +
						(move.priority > 0 && foe.health.upper < .25 ? 25 : 0) + (event ? 1 : 0);
				}
				if (['storedpower', 'powertrip'].includes(move.id)) power = 20 + 20 * Object.values(own.boosts).reduce((n, stage) => n + Math.max(0, stage), 0);
				if (move.id === 'acrobatics' && !own.item) power *= 2;
				if (move.id === 'hex' && foe.status || move.id === 'venoshock' && ['psn', 'tox'].includes(foe.status) ||
					move.id === 'brine' && foe.health.upper <= .5 || move.id === 'facade' && own.status) power *= 2;
				if (['eruption', 'waterspout', 'dragonenergy'].includes(move.id)) power = Math.max(1, 150 * own.health.upper);
				if (['flail', 'reversal'].includes(move.id)) {
					const hp = own.health.upper; power = hp <= .04 ? 200 : hp <= .1 ? 150 : hp <= .2 ? 100 : hp <= .35 ? 80 : hp <= .7 ? 40 : 20;
				}
				if (move.id === 'gyroball') power = Math.min(150, 25 * estimateStat('spe') * boost(foe.boosts.spe) / (own.stats.spe * boost(own.boosts.spe)) + 1);
				if (move.ohko && (own.level < foe.level || foe.ability === 'sturdy')) return -90;
				if (move.multihit) {
					power *= typeof move.multihit === 'number' ? move.multihit : (move.multihit[0] + move.multihit[1]) / 2;
				}
				if (move.flags.charge && !own.volatiles.includes(move.id) && own.item !== 'powerherb' &&
					!(['solarbeam', 'solarblade'].includes(move.id) && ['sunnyday', 'desolateland'].includes(memory.weather))) power *= 0.55;
				if (move.self?.volatileStatus === 'mustrecharge') power *= 0.65;
				if (move.selfdestruct) power *= 0.6;
				const stab = activeTypes(own, dex).includes(move.type) ? 1.5 : 1;
				const effectiveness = 2 ** dex.getEffectiveness(move.type, types);
				const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
				const defensiveStat = move.overrideDefensiveStat || (stat === 'atk' ? 'def' : 'spd');
				const defense = estimateStat(defensiveStat === 'def' ? 'def' : 'spd') * boost(foe.boosts[defensiveStat]);
				let attack = own.stats[stat] * boost(own.boosts[stat]);
				if (stat === 'atk' && own.status === 'brn' && effectiveAbility(own) !== 'guts' && move.id !== 'facade') attack *= .5;
				let damage = ((2 * own.level / 5 + 2) * power * attack / defense / 50 + 2) * stab * effectiveness * .925;
				if (move.damage) damage = move.damage === 'level' ? own.level : Number(move.damage);
				if (['superfang', 'naturesmadness', 'ruination'].includes(move.id)) damage = foeHP / 2;
				if (move.id === 'endeavor') damage = Math.max(0, foeHP - own.stats.hp * own.health.upper);
				// Prefer a reliable finish over setup or a needlessly risky stronger move.
				if (damage * .85 >= foeHP && !move.flags.charge && !move.selfdestruct) return 500 + accuracy * 100 + Math.max(0, move.priority) * 5;
				return damage / Math.max(1, estimateStat('hp')) * 200 * accuracy +
					(move.priority > 0 && foe.health.upper < 0.25 ? 25 : 0) + (event ? 1 : 0);
			}
			if (['splash', 'celebrate', 'holdhands', 'happyhour', 'teleport'].includes(move.id)) return -100;
			if (move.heal || ['rest', 'strengthsap', 'wish'].includes(move.id)) {
				if (enhancedMoves && (own.volatiles.includes('healblock') || move.id === 'wish' && own.volatiles.includes('wish'))) return -80;
				return own.health.upper > 0.75 ? -80 : (1 - own.health.upper) * 190;
			}
			if (move.status) {
				if (foe.status || !dex.getImmunity(move.status, types) ||
					enhancedMoves && move.flags.powder && (types.includes('Grass') || foe.ability === 'overcoat' || foe.item === 'safetygoggles') ||
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
		if (tacticalSwitches && best.value < 500) {
			// Switch only against attacks already revealed in the public battle log.
			// A substantial resistance improvement avoids needless switching loops.
			const attacks = foe.moves.map(id => dex.moves.get(id)).filter(move => move.category !== 'Status');
			const threat = (profile: Combatant) => Math.max(0, ...attacks.map(move => {
				const targetTypes = [...activeTypes(profile, dex)];
				return dex.getImmunity(move.type, targetTypes) ? 2 ** dex.getEffectiveness(move.type, targetTypes) : 0;
			}));
			const danger = threat(own);
			const candidates = available.filter(choice => choice.startsWith('switch ')).map(choice => {
				const mon = request.side.pokemon[Number(choice.split(' ')[1]) - 1];
				const profile = builder.own(mon, ownSeen(memory, side, mon.ident, false));
				return { choice, profile, danger: threat(profile) };
			}).filter(candidate => candidate.profile.health.lower > 0.5 && candidate.danger <= 1 &&
				candidate.profile.moves.some(id => dex.moves.get(id).category !== 'Status' && !typeImmune(candidate.profile, id)))
				.sort((a, b) => a.danger - b.danger || b.profile.health.lower - a.profile.health.lower);
			if (danger >= 4 && candidates.length && !Object.values(own.boosts).some(stage => stage >= 2)) return candidates[0].choice;
		}
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
