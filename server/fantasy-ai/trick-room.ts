import type { Combatant } from './hypotheses';
import type { BattleMemory } from './memory';
import { effectiveAbility, effectiveItem } from './mechanics';

type RoomField = Pick<BattleMemory, 'weather' | 'terrain' | 'pseudoWeather'>;
export interface RoomMember {
	profile: Combatant;
	active: boolean;
	probability: number;
	/** Exact effective speed is available only inside the detached simulation. */
	speed?: number;
	tailwind?: boolean;
}
export interface RoomAssessment { value: number; benefits: number[] }

/** Public start/end messages are authoritative; Persistent announces its extension. */
export function trickRoomTurns(memory: BattleMemory): number {
	if (!memory.pseudoWeather.includes('trickroom')) return 0;
	const duration = memory.fieldDurations?.trickroom || 5;
	return Math.max(1, duration - Math.max(0, memory.turn - (memory.fieldTurns?.trickroom ?? memory.turn)));
}

function speed(member: RoomMember, field: RoomField): number {
	if (member.speed !== undefined) return member.speed;
	const mon = member.profile;
	const stage = mon.boosts.spe || 0;
	let value = mon.stats.spe * (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));
	const ability = effectiveAbility(mon);
	const item = effectiveItem(mon, field);
	if (mon.status === 'par' && ability !== 'quickfeet' && item !== 'fantasylifeorb') value *= 0.5;
	if (ability === 'quickfeet' && mon.status) value *= 1.5;
	if (item === 'choicescarf') value *= 1.5;
	if (['ironball', 'machobrace', 'poweranklet', 'powerband', 'powerbelt',
		'powerbracer', 'powerlens', 'powerweight'].includes(item)) {
		value *= 0.5;
	}
	if (member.tailwind) value *= 2;
	if (ability === 'chlorophyll' && ['sunnyday', 'desolateland'].includes(field.weather) ||
		ability === 'swiftswim' && ['raindance', 'primordialsea'].includes(field.weather) ||
		ability === 'sandrush' && field.weather === 'sandstorm' ||
		ability === 'slushrush' && ['hail', 'snowscape'].includes(field.weather) ||
		ability === 'surgesurfer' && field.terrain === 'electricterrain') value *= 2;
	return Math.max(1, Math.floor(value));
}

/** Cheap role estimate, not a replacement for native damage/entry probes. Priority-only users gain no room turns. */
function attackingPower(mon: Combatant, dex: ModdedDex, field: RoomField): number {
	const ability = effectiveAbility(mon);
	const item = effectiveItem(mon, field);
	const species = dex.species.get(mon.species);
	const types = mon.terastallized && mon.terastallized !== 'Stellar' ? [mon.terastallized] : mon.types || species.types;
	const best = Math.max(0, ...mon.moves.map(id => {
		const move = dex.moves.get(id);
		if (move.category === 'Status' || move.priority > 0) return 0;
		if (move.damage || move.damageCallback) return 12000;
		const stat = move.overrideOffensiveStat || (move.category === 'Physical' ? 'atk' : 'spa');
		const stage = mon.boosts[stat] || 0;
		let attack = mon.stats[stat] * (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));
		if (stat === 'atk') {
			if (['hugepower', 'purepower'].includes(ability)) attack *= 2;
			if (item === 'thickclub' && ['Cubone', 'Marowak'].includes(species.baseSpecies)) attack *= 2;
			if (item === 'choiceband' || ability === 'guts' && mon.status) attack *= 1.5;
		}
		if (stat === 'spa' && item === 'choicespecs') attack *= 1.5;
		return attack * Math.min(160, move.basePower || 60) * (types.includes(move.type) ? 1.5 : 1);
	}));
	return Math.min(1.6, best / 45000) * Math.min(1, mon.health.upper * 2);
}

/** Assess living offensive beneficiaries against allowed opponent hypotheses, including mixed fast/slow teams. */
export function assessTrickRoom(
	own: readonly RoomMember[], opponents: readonly RoomMember[], dex: ModdedDex, field: RoomField,
): RoomAssessment {
	const foes = opponents.filter(member => member.profile.health.upper > 0);
	const total = foes.reduce((sum, member) => sum + member.probability, 0);
	const benefits = own.map(member => {
		if (!member.profile.health.upper || !total) return 0;
		const ownSpeed = speed(member, field);
		const order = foes.reduce((sum, foe) => {
			const attacks = foe.profile.moves.map(id => dex.moves.get(id)).filter(move => move.category !== 'Status');
			// Reversing Speed never reverses priority brackets.
			const affected = attacks.length ? Number(attacks.some(move => move.priority <= 0)) : 0.65;
			return sum + Math.sign(speed(foe, field) - ownSpeed) * affected * foe.probability;
		}, 0) / total;
		return attackingPower(member.profile, dex, field) * order;
	});
	const gains = benefits.filter(value => value > 0).sort((a, b) => b - a).slice(0, 3);
	const losses = benefits.filter(value => value < 0).sort((a, b) => a - b).slice(0, 2);
	// Two strong breakers justify a room plan even with a fast support member.
	const value = gains.reduce((sum, gain) => sum + gain, 0) / 2 + losses.reduce((sum, loss) => sum + loss, 0) * 0.4;
	return { value: Math.max(-1.5, Math.min(1.5, value)), benefits };
}

/** A reserve needs a switch turn; the last room turn only benefits the active attacker. */
export function trickRoomPosition(assessment: RoomAssessment, activeIndex: number, turns: number): number {
	if (turns <= 0) return 0;
	return assessment.value * Math.min(1.4, Math.max(0, turns - 1) / 3) * 55 +
		(assessment.benefits[activeIndex] || 0) * 20;
}
