import { toID } from '../../sim/dex';
import { recoveryCapacity } from './mechanics';

/** Mechanism-based priors, not usage statistics or access to the player's actual items. */
export function priorItems(
	dex: ModdedDex, format: string, species: Species, moves: readonly string[],
	ability: string, bulky: boolean, status: string,
): string[] {
	const pool = moves.map(id => dex.moves.get(id));
	const attacks = pool.filter(move => move.category !== 'Status');
	const physical = attacks.filter(move => move.category === 'Physical').length;
	const special = attacks.length - physical;
	const support = pool.length - attacks.length;
	const heals = pool.some(move => recoveryCapacity(move));
	const inaccurate = attacks.filter(move => typeof move.accuracy === 'number' && move.accuracy < 100).length;
	const charges = attacks.filter(move => move.flags.charge).length;
	const scores = new Map<string, number>();
	const add = (id: string, score: number) => scores.set(id, Math.max(scores.get(id) ?? -Infinity, score));
	add('leftovers', bulky ? 30 : support ? 16 : 8);
	add('heavydutyboots', 20 + dex.getEffectiveness('Rock', species.types) * 10);
	add('lifeorb', bulky ? 6 : 21);
	if (species.types.includes('Poison') && bulky) add('blacksludge', 29);
	if (!support) {
		if (physical) add('choiceband', physical * 7);
		if (special) add('choicespecs', special * 7);
		add('choicescarf', bulky ? 8 : species.baseStats.spe < 110 ? 27 : 16);
	}
	if (species.nfe && bulky) add('eviolite', 39);
	if (species.requiredItem) add(toID(species.requiredItem), 100);
	if (dex.currentMod === 'gen9fantasy') {
		add('fantasydefensegem', bulky ? 31 : 19);
		add('fantasysyrupyapple', bulky ? (heals ? 38 : 34) : 8);
		if (bulky || species.baseStats.spe < 65) add('fantasyprotector', 32);
		if (inaccurate) add('fantasypowerlens', 24 + inaccurate * 6);
		const critical = attacks.filter(move => move.willCrit || (move.critRatio || 1) > 1).length;
		add('fantasyscopelens', (bulky ? 5 : 14) + critical * 9 + attacks.filter(move => move.basePower <= 100).length * 3);
		if (!support && attacks.some(move => ['Normal', 'Fighting', 'Electric', 'Ground', 'Ghost', 'Psychic', 'Dragon']
			.includes(move.type))) add('fantasyringtarget', 29);
		if (charges) add('fantasymachobrace', 25 + charges * 10);
		if (status) add('fantasylifeorb', ['zhiliao', 'poisonheal'].includes(ability) ? 8 : 36);
		if (status === 'frz') add('fantasyicestone', 48);
		if (ability === 'zengfuxitong') add('fantasysyrupyapple', 48);
		if (species.id === 'lugiafantasy') add('shadowbottle', 35);
	}
	if (ability === 'zhiliao' || ability === 'guts' && physical) add('flameorb', 45);
	if (ability === 'poisonheal') add('toxicorb', 50);
	const rules = dex.formats.getRuleTable(dex.formats.get(format));
	return [...scores].filter(([id]) => {
		const item = dex.items.get(id);
		return item.exists && !rules.isBanned(`item:${id}`) &&
			(!item.itemUser || item.itemUser.includes(species.name) || item.itemUser.includes(species.baseSpecies));
	}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
}
