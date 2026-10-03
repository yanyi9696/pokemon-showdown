import type { Battle } from '../../sim/battle';
import type { Pokemon } from '../../sim/pokemon';
import type { SinglesSide } from './memory';
import { hazardCost, hazardLayers, type HazardMember } from './hazards';
import { recoveryCapacity, statusCost } from './mechanics';
import { assessTrickRoom, trickRoomPosition, type RoomMember } from './trick-room';

function hazardMembers(battle: Battle, side: SinglesSide, keys: ReadonlySet<Pokemon>): HazardMember[] {
	return battle.getSide(side).pokemon.map(mon => ({
		profile: {
			species: mon.species.name, level: mon.level, stats: { hp: mon.maxhp, ...mon.storedStats },
			moves: mon.moveSlots.filter(slot => slot.pp > 0).map(slot => slot.id), ability: mon.ability, item: mon.item,
			health: { lower: mon.hp / mon.maxhp, upper: mon.hp / mon.maxhp }, status: mon.status,
			boosts: {}, volatiles: [], teraType: mon.teraType, terastallized: mon.terastallized || undefined,
		},
		active: mon.isActive, probability: 1, key: keys.has(mon),
	}));
}

function roomMembers(battle: Battle, side: SinglesSide, keys: ReadonlySet<Pokemon>): RoomMember[] {
	return hazardMembers(battle, side, keys).map((member, index) => {
		const mon = battle.getSide(side).pokemon[index];
		// Native inactive Pokemon suppress their item/ability; reserves must instead
		// be assessed for what they could do after entering (e.g. Thick Club/Scarf).
		return { ...member, speed: mon.isActive ? mon.getStat('spe') : undefined,
			tailwind: !!mon.side.sideConditions.tailwind,
			profile: {
				...member.profile, boosts: { ...mon.boosts }, volatiles: Object.keys(mon.volatiles), types: mon.getTypes(),
				ability: mon.isActive && mon.ignoringAbility() ? '' : mon.ability,
				item: mon.isActive && mon.ignoringItem() ? '' : mon.item,
			},
		};
	});
}

export function positionValue(
	battle: Battle, side: SinglesSide, keys: ReadonlySet<Pokemon>, switches: number,
	resources: ReadonlyMap<Pokemon, number>,
): number {
	const team = battle.getSide(side);
	let value = team.pokemon.reduce((sum, mon) => {
		if (mon.fainted) return sum;
		const conditionCost = statusCost({
			status: mon.status, item: mon.isActive && mon.ignoringItem() ? '' : mon.item,
			ability: mon.isActive && mon.ignoringAbility() ? '' : mon.ability, volatiles: Object.keys(mon.volatiles),
			moves: mon.moveSlots.filter(slot => slot.pp > 0).map(slot => slot.id),
			stats: { hp: mon.maxhp, ...mon.storedStats },
		}, { pseudoWeather: Object.keys(battle.field.pseudoWeather) }, battle.dex);
		const attacks = mon.moveSlots.filter(slot => slot.pp > 0 && battle.dex.moves.get(slot.id).category !== 'Status');
		let boosts = 0;
		if (mon.isActive) {
			for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) {
				if (stat === 'atk' && !attacks.some(slot => battle.dex.moves.get(slot.id).category === 'Physical')) continue;
				if (stat === 'spa' && !attacks.some(slot => battle.dex.moves.get(slot.id).category === 'Special')) continue;
				boosts += mon.boosts[stat] * (stat === 'atk' || stat === 'spa' ? 16 : 8);
			}
		}
		const exhausted = !attacks.length && mon.moves.some(id => battle.dex.moves.get(id).category !== 'Status');
		if (exhausted) boosts *= 0.2;
		// Healing now can otherwise look free forever in a one-turn horizon.
		const pp = mon.moveSlots.reduce((remaining, slot) => {
			const move = battle.dex.moves.get(slot.id);
			const recovery = recoveryCapacity(move);
			return remaining + slot.pp / Math.max(1, slot.maxpp) * (recovery ? 24 : 8);
		}, 0);
		const resource = resources.get(mon) || 0;
		return sum + 120 + (keys.has(mon) ? 30 : 0) + resource * 0.7 +
			mon.hp / mon.maxhp * ((keys.has(mon) ? 95 : 80) + resource * 0.3) -
			conditionCost + boosts + pp +
			(mon.volatiles.substitute ? 12 : 0) - (mon.isActive && exhausted ? 20 : 0);
	}, 0);
	for (const [id, condition] of Object.entries(team.sideConditions)) {
		if (condition && ['reflect', 'lightscreen', 'auroraveil', 'tailwind', 'safeguard'].includes(id)) {
			value += 12;
		}
	}
	const hazards = hazardLayers(team.sideConditions);
	if (Object.keys(hazards).length) {
		value -= hazardCost(hazards, hazardMembers(battle, side, keys),
			hazardMembers(battle, side === 'p1' ? 'p2' : 'p1', keys), battle.dex, {
				terrain: battle.field.terrain, weather: battle.field.weather, pseudoWeather: Object.keys(battle.field.pseudoWeather),
			}, switches);
	}
	const room = battle.field.pseudoWeather.trickroom;
	if (room) {
		const field = { weather: battle.field.weather, terrain: battle.field.terrain,
			pseudoWeather: Object.keys(battle.field.pseudoWeather) };
		const assessment = assessTrickRoom(roomMembers(battle, side, keys),
			roomMembers(battle, side === 'p1' ? 'p2' : 'p1', keys), battle.dex, field);
		value += trickRoomPosition(assessment, team.pokemon.findIndex(mon => mon.isActive), room.duration || 1);
	}
	if (team.zMoveUsed) value -= 15;
	if (team.pokemon.some(mon => mon.terastallized)) value -= 12;
	// Mega's permanent form is evaluated by native outcomes and the root's
	// strategic preference. Spending it alone is not a loss of position.
	return value;
}
