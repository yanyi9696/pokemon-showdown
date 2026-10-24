import { toID, type ModdedDex } from '../../sim/dex';
import type { Combatant } from './hypotheses';

type Member = Pick<Combatant, 'species' | 'ability' | 'item' | 'moves' | 'health'>;
const WEATHER: Record<string, string> = {
	drizzle: 'raindance', primordialsea: 'raindance', drought: 'sunnyday', desolateland: 'sunnyday',
	orichalcumpulse: 'sunnyday', snowwarning: 'snowscape', sandstream: 'sandstorm',
};
const TERRAIN: Record<string, string> = {
	grassysurge: 'grassyterrain', electricsurge: 'electricterrain', hadronengine: 'electricterrain',
	psychicsurge: 'psychicterrain', mistysurge: 'mistyterrain',
};
export function fieldID(id: string) {
	const fields: Record<string, string> = { hail: 'snowscape', primordialsea: 'raindance', desolateland: 'sunnyday' };
	return fields[id] || id;
}
/** Own team data only. No hidden opponent ability, move, item or queued action. */
export function teamFieldBenefit(field: string, team: readonly Member[], dex: ModdedDex): number {
	field = fieldID(field);
	const alive = team.filter(mon => mon.health.upper > 0);
	const total = alive.reduce((sum, mon) => {
		const ability = toID(mon.ability), item = toID(mon.item), moves = mon.moves.map(id => dex.moves.get(id));
		const attack = (type: string) => moves.some(move => move.type === type && move.category !== 'Status');
		const has = (...ids: string[]) => moves.some(move => ids.includes(move.id));
		const types = dex.species.get(mon.species).types;
		let value = 0;
		if (field === 'raindance') value = (ability === 'swiftswim' ? 3 : ['hydration', 'dryskin'].includes(ability) ? 1 : 0) +
			(attack('Water') ? 0.8 : 0) - (attack('Fire') && !has('hydrosteam') ? 0.8 : 0) +
			(has('thunder', 'hurricane') ? 1 : 0) + (has('electroshot') ? 2 : 0) + (has('weatherball') ? 0.6 : 0);
		if (field === 'sunnyday') value =
			(ability === 'chlorophyll' ? 3 : ['solarpower', 'protosynthesis'].includes(ability) ? 2 : 0) +
			(attack('Fire') ? 0.8 : 0) - (attack('Water') && !has('hydrosteam') ? 0.8 : 0) +
			(has('solarbeam', 'solarblade', 'growth', 'hydrosteam') ? 1.2 : 0) + (has('weatherball') ? 0.6 : 0);
		if (field === 'snowscape') value = (ability === 'slushrush' ? 3 : 0) + (types.includes('Ice') ? 0.8 : 0) +
			(has('blizzard') ? 1 : 0) + (has('auroraveil') ? 1.5 : 0);
		if (field === 'sandstorm') value = (ability === 'sandrush' ? 3 : ability === 'sandforce' ? 2 : 0) +
			(types.includes('Rock') ? 0.7 : types.some(type => ['Steel', 'Ground'].includes(type)) ? 0.2 : -0.3);
		const grounded = !types.includes('Flying') && ability !== 'levitate' && item !== 'airballoon';
		if (grounded) {
			if (field === 'grassyterrain') value =
				(has('grassyglide') ? 1.8 : attack('Grass') ? 0.8 : 0.2) - (has('earthquake') ? 0.6 : 0);
			if (field === 'electricterrain') value =
				(ability === 'surgesurfer' ? 3 : ability === 'quarkdrive' ? 2 : 0) + (attack('Electric') ? 0.8 : 0);
			if (field === 'psychicterrain') value = has('expandingforce') ? 2.5 : attack('Psychic') ? 0.8 : 0.1;
			if (field === 'mistyterrain') value = has('mistyexplosion') ? 1 : 0.3;
			const seed = field.replace('terrain', 'seed');
			if (item === seed) value += ability === 'unburden' ? 2.5 : 1;
		}
		return sum + value;
	}, 0);
	return total / Math.max(1, alive.length);
}
export function entryField(mon: Member, dex: ModdedDex, mega = false) {
	let ability = toID(mon.ability);
	if (mega) {
		const stone = dex.items.get(mon.item);
		if (stone.megaStone && dex.species.get(mon.species).baseSpecies === stone.megaEvolves) {
			ability = toID(dex.species.get(Array.isArray(stone.megaStone) ? stone.megaStone[0] : stone.megaStone).abilities[0]);
		}
	}
	return WEATHER[ability] || TERRAIN[ability] || '';
}
export function leadPlanScores(team: readonly Member[], dex: ModdedDex, genericSupport = false) {
	return team.map(mon => {
		const auto = entryField(mon, dex), mega = entryField(mon, dex, true);
		const fields = mon.moves.map(id => dex.moves.get(id)).filter(move => move.weather || move.terrain)
			.map(move => ({ id: move.weather || move.terrain!, reliability: 0.55 }));
		if (auto) fields.push({ id: auto, reliability: 1 });
		else if (mega) fields.push({ id: mega, reliability: 0.8 });
		let value = Math.max(0, ...fields.map(field => {
			const benefit = teamFieldBenefit(field.id, team, dex);
			return benefit > 0.2 ? Math.min(40, 8 + benefit * 14) * field.reliability : 0;
		}));
		const screens = mon.moves.filter(id => ['reflect', 'lightscreen', 'auroraveil'].includes(id));
		// Veil alone is not a snow setter. Set the weather before bringing the screen user in.
		if (screens.some(id => id !== 'auroraveil') || screens.length && auto === 'snowscape') {
			value += Math.min(12, screens.length * (toID(mon.item) === 'lightclay' ? 6 : 3));
		}
		if (genericSupport) {
			if (mon.moves.includes('stickyweb')) value += 12;
			else if (mon.moves.some(id => ['stealthrock', 'spikes', 'toxicspikes'].includes(id))) value += 6;
			if (mon.moves.includes('trickroom') &&
				team.filter(member => dex.species.get(member.species).baseStats.spe < 70).length > team.length / 2) value += 16;
		}
		return value;
	});
}
