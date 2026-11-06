import { Dex, toID } from '../../sim/dex';

export interface DoublesLeadMember {
	species: string;
	ability: string;
	item?: string;
	moves: readonly string[];
	level?: number;
	nature?: string;
	evs?: Partial<StatsTable>;
	ivs?: Partial<StatsTable>;
	/** Own request stats, when available; never opposing private stats. */
	stats?: StatsExceptHPTable;
}
export interface DoublesLeadPlan {
	/** Full zero-based permutation: two leads followed by the remaining authored order. */
	order: number[];
	score: number;
	reasons: string[];
}

const WEATHER: Record<string, string> = {
	drought: 'sun', desolateland: 'sun', drizzle: 'rain', primordialsea: 'rain',
	sandstream: 'sand', snowwarning: 'snow',
};
const TERRAIN: Record<string, string> = {
	psychicsurge: 'psychic', electricsurge: 'electric', grassysurge: 'grass', mistysurge: 'misty',
};
const REDIRECT = new Set(['followme', 'ragepowder']);

function describe(member: DoublesLeadMember, dex: ModdedDex) {
	const species = dex.species.get(member.species), item = dex.items.get(member.item || '');
	const moves = member.moves.map(move => dex.moves.get(move));
	const ids = new Set(moves.map(move => move.id as string));
	const ability = toID(member.ability);
	const megaForms = typeof item.megaStone === 'string' ? [item.megaStone] : item.megaStone || [];
	const abilities = new Set<string>([ability, ...megaForms.flatMap(id =>
		Object.values(dex.species.get(id).abilities).map(toID))]);
	const nature = dex.natures.get(member.nature || 'Hardy');
	let speed = member.stats?.spe ?? Math.floor((2 * species.baseStats.spe + (member.ivs?.spe ?? 31) +
		Math.floor((member.evs?.spe || 0) / 4)) * (member.level || 100) / 100) + 5;
	if (!member.stats) speed = Math.floor(speed * (nature.plus === 'spe' ? 1.1 : nature.minus === 'spe' ? 0.9 : 1));
	if (item.id === 'choicescarf') speed *= 1.5;
	const attacks = moves.filter(move => move.category !== 'Status' &&
		!['fakeout', 'feint', 'rapidspin'].includes(move.id));
	const weather = [...abilities].map(id => WEATHER[id]).find(Boolean);
	const terrain = [...abilities].map(id => TERRAIN[id]).find(Boolean);
	const setup = moves.some(move => Object.entries(move.boosts || {}).some(([stat, value]) =>
		['atk', 'spa', 'spe'].includes(stat) && Number(value) > 0) && move.target === 'self');
	return { species, moves, ids, abilities, speed, attacks, weather, terrain, setup,
		room: ids.has('trickroom'), wind: ids.has('tailwind'), fakeout: ids.has('fakeout'),
		redirect: moves.some(move => REDIRECT.has(move.id)),
		physical: attacks.some(move => move.category === 'Physical'),
		special: attacks.some(move => move.category === 'Special'),
	};
}
type Member = ReturnType<typeof describe>;

function weatherBenefit(weather: string, member: Member) {
	const ability = (ids: string[]) => ids.some(id => member.abilities.has(id as ID));
	const moveType = (type: string) => member.attacks.some(move => move.type === type);
	if (weather === 'sun') return (ability(['chlorophyll', 'solarpower', 'protosynthesis']) ? 30 : 0) +
		(member.ids.has('solarbeam') || member.ids.has('solarblade') ? 14 : 0) +
		(moveType('Fire') ? 8 : 0) - (moveType('Water') && !moveType('Fire') ? 8 : 0);
	if (weather === 'rain') return (ability(['swiftswim', 'dryskin', 'hydration']) ? 30 : 0) +
		(member.ids.has('thunder') || member.ids.has('hurricane') ? 10 : 0) +
		(moveType('Water') ? 8 : 0) - (moveType('Fire') && !moveType('Water') ? 8 : 0);
	if (weather === 'sand') return (ability(['sandrush', 'sandforce']) ? 34 : 0) +
		(member.species.types.includes('Rock') ? 6 : 0);
	if (weather === 'snow') return (ability(['slushrush']) ? 30 : 0) +
		(member.ids.has('blizzard') ? 12 : 0) + (member.ids.has('auroraveil') ? 18 : 0);
	return 0;
}

/**
 * Experimental opening candidates using own roles, not base-stat totals or hidden enemies.
 * Benchmark only: role synergy alone regressed performance; game rooms retain authored leads.
 * Ties retain the original order, and no member is removed or its set changed.
 */
export function rankDoublesLeads(team: readonly DoublesLeadMember[], mod = 'gen9fantasy'): DoublesLeadPlan[] {
	if (!team.length || team.length > 6) throw new Error('双打首发规划需要一到六只本队宝可梦。');
	if (team.length === 1) return [{ order: [0], score: 0, reasons: ['only-member'] }];
	const dex = Dex.mod(mod), members = team.map(member => describe(member, dex));
	const speeds = members.map(member => member.speed).sort((a, b) => a - b);
	const median = (speeds[Math.floor((speeds.length - 1) / 2)] + speeds[Math.floor(speeds.length / 2)]) / 2;
	const plans: DoublesLeadPlan[] = [];
	for (let first = 0; first < members.length; first++) for (let second = first + 1; second < members.length; second++) {
		const pair = [members[first], members[second]], reasons = new Set<string>();
		let score = 0;
		const add = (amount: number, reason: string) => { score += amount; reasons.add(reason); };
		const field = pair.find(member => member.terrain)?.terrain;
		// A support pair still needs enough ways to exert pressure while the plan is established.
		add(pair.reduce((total, member) => total + Math.min(3, member.attacks.length) * 6, 0), 'offensive-options');
		if (!pair.some(member => member.attacks.length)) add(-50, 'no-immediate-offense');
		if (pair.every(member => member.weather) && pair[0].weather !== pair[1].weather) add(-44, 'conflicting-weather');
		if (pair.every(member => member.terrain) && pair[0].terrain !== pair[1].terrain) add(-30, 'conflicting-terrain');
		if (pair.every(member => member.weather) && pair[0].weather === pair[1].weather) add(-10, 'redundant-setters');
		for (const [index, member] of pair.entries()) {
			const ally = pair[1 - index];
			if (member.weather) {
				const benefit = weatherBenefit(member.weather, ally);
				if (benefit) add(benefit, `weather-${member.weather}-partner`);
			}
			if (member.terrain === 'psychic' && ally.ids.has('expandingforce')) add(34, 'psychic-terrain-spread');
			if (member.terrain === 'electric' && (ally.abilities.has('quarkdrive') || ally.ids.has('risingvoltage'))) {
				add(28, 'electric-terrain-partner');
			}
			if (member.terrain === 'grass' && ally.ids.has('grassyglide')) add(24, 'grassy-priority');
			if (member.room && ally.speed <= median && ally.attacks.length) add(18, 'room-with-slow-attacker');
			if (member.wind && ally.attacks.length && ally.speed >= median * 0.65) add(18, 'tailwind-with-attacker');
			if ((member.ids.has('icywind') || member.ids.has('electroweb')) && ally.attacks.length) add(8, 'speed-control');
			if (member.redirect && (ally.room || ally.setup)) add(34, 'redirect-establish-core');
			if (member.fakeout && field !== 'psychic' && (ally.room || ally.wind || ally.setup)) {
				add(28, 'fake-out-establish-core');
			}
			if (member.fakeout && field === 'psychic') add(-12, 'psychic-terrain-blocks-fake-out');
			if (member.ids.has('afteryou') && ally.speed * 1.5 < member.speed &&
				(ally.ids.has('eruption') || ally.ids.has('waterspout'))) add(36, 'after-you-spread-core');
			if (member.ids.has('helpinghand') && ally.attacks.length) add(8, 'helping-hand-offense');
			if (member.abilities.has('friendguard') && ally.attacks.length) add(10, 'friend-guard-core');
			if (member.ids.has('reflect') && member.ids.has('lightscreen') && ally.attacks.length) add(14, 'screens-with-offense');
			if (member.abilities.has('intimidate') && ally.attacks.length) add(8, 'intimidate-opening');
			if (member.abilities.has('beadsofruin') && ally.special) add(14, 'special-ruin-partner');
			if (member.abilities.has('swordofruin') && ally.physical) add(14, 'physical-ruin-partner');
			if (member.attacks.some(move => move.target === 'allAdjacent' && move.type === 'Ground') &&
				(ally.species.types.includes('Flying') || ally.abilities.has('levitate'))) add(8, 'immune-spread-partner');
		}
		plans.push({ order: [first, second, ...team.map((_, i) => i).filter(i => i !== first && i !== second)],
			score, reasons: [...reasons] });
	}
	return plans.sort((a, b) => b.score - a.score || a.order[0] - b.order[0] || a.order[1] - b.order[1]);
}
