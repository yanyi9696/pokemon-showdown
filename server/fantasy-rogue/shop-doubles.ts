import { makeEncounterSet } from './encounter-sets';

type Loadout = [string, string, string, string[], string];
const nurse: Record<string, Loadout> = {
	Audino: ['Audino', 'Regenerator', 'Sitrus Berry', ['hypervoice', 'icywind', 'helpinghand', 'protect'], 'Modest'],
	Clefairy: ['Clefairy', 'Friend Guard', 'Eviolite', ['followme', 'icywind', 'moonblast', 'protect'], 'Bold'],
	Happiny: ['Happiny', 'Natural Cure', 'Eviolite', ['helpinghand', 'charm', 'icywind', 'protect'], 'Bold'],
	Wigglytuff: ['Wigglytuff', 'Competitive', 'Sitrus Berry', ['hypervoice', 'dazzlinggleam', 'icebeam', 'protect'], 'Modest'],
	Blissey: ['Blissey', 'Natural Cure', 'Leftovers', ['seismictoss', 'icywind', 'helpinghand', 'softboiled'], 'Bold'],
	Comfey: ['Comfey', 'Triage', 'Sitrus Berry', ['drainingkiss', 'floralhealing', 'taunt', 'protect'], 'Bold'],
	Alomomola: ['Alomomola', 'Regenerator', 'Sitrus Berry', ['liquidation', 'icywind', 'healpulse', 'protect'], 'Impish'],
};
const merchant: Record<string, Loadout> = {
	Meowth: ['Meowth', 'Technician', 'Focus Sash', ['fakeout', 'bite', 'icywind', 'taunt'], 'Jolly'],
	Skwovet: ['Skwovet', 'Cheek Pouch', 'Sitrus Berry', ['tackle', 'bite', 'seedbomb', 'protect'], 'Adamant'],
	Delibird: ['Delibird', 'Vital Spirit', 'Focus Sash', ['icywind', 'aerialace', 'fakeout', 'protect'], 'Jolly'],
	Murkrow: ['Murkrow', 'Prankster', 'Eviolite', ['tailwind', 'foulplay', 'taunt', 'haze'], 'Calm'],
	Gholdengo: ['Gholdengo', 'Good as Gold', 'Sitrus Berry', ['makeitrain', 'shadowball', 'nastyplot', 'protect'], 'Modest'],
	Persian: ['Persian', 'Technician', 'Sitrus Berry', ['fakeout', 'icywind', 'snarl', 'taunt'], 'Timid'],
	Greedent: ['Greedent', 'Cheek Pouch', 'Sitrus Berry', ['bodyslam', 'crunch', 'seedbomb', 'protect'], 'Adamant'],
};
const rocket: Record<string, Loadout> = {
	Meowth: merchant.Meowth,
	Koffing: ['Koffing', 'Levitate', 'Eviolite', ['sludge', 'willowisp', 'clearsmog', 'protect'], 'Modest'],
	Arbok: ['Arbok', 'Intimidate', 'Sitrus Berry', ['glare', 'poisonjab', 'crunch', 'protect'], 'Adamant'],
	Golbat: ['Golbat', 'Inner Focus', 'Eviolite', ['tailwind', 'airslash', 'taunt', 'protect'], 'Timid'],
	Raticate: ['Raticate', 'Guts', 'Flame Orb', ['facade', 'crunch', 'quickattack', 'protect'], 'Adamant'],
	Persian: merchant.Persian,
	Weezing: ['Weezing', 'Levitate', 'Black Sludge', ['sludgebomb', 'flamethrower', 'willowisp', 'protect'], 'Modest'],
	Muk: ['Muk', 'Sticky Hold', 'Assault Vest', ['poisonjab', 'knockoff', 'brickbreak', 'shadowsneak'], 'Adamant'],
};

/** The first two lead in both native Doubles and split p2/p4 Multi. Keep the original levels, sizes and IV budgets. */
export function shopDoublesTeam(kind: 'nurse' | 'merchant' | 'rocket', floor: number, level: number): PokemonSet[] {
	let names: string[];
	if (kind === 'rocket') {
		const stage = Math.min(4, Math.floor((floor - 1) / 40));
		names = [
			['Meowth', 'Koffing'],
			['Arbok', 'Golbat', 'Raticate'],
			['Persian', 'Weezing', 'Golbat'],
			['Persian', 'Weezing', 'Golbat', 'Arbok'],
			['Persian', 'Weezing', 'Golbat', 'Arbok', 'Muk'],
		][stage];
	} else {
		names = kind === 'nurse' ? level < 32 ? ['Audino', 'Clefairy', 'Happiny'] :
			['Audino', 'Wigglytuff', 'Blissey', 'Comfey', 'Alomomola'] : level < 28 ?
			['Meowth', 'Skwovet', 'Delibird'] : ['Murkrow', 'Gholdengo', 'Persian', 'Greedent', 'Delibird'];
		names = names.slice(0, 3 + Math.floor((floor - 1) / 80));
	}
	const plans = kind === 'nurse' ? nurse : kind === 'merchant' ? merchant : rocket;
	return names.map(name => {
		const [species, ability, item, moves, nature] = plans[name];
		const set = makeEncounterSet(species, level, kind === 'rocket' ? 20 : 25);
		Object.assign(set, { ability, nature, item: level >= 25 ? item : '', moves: [...moves] });
		// Early helpers retain support, while their attacks grow with the shop's existing level curve.
		if (level < 20 && name === 'Audino') set.moves[0] = 'disarmingvoice';
		if (level < 20 && name === 'Clefairy') set.moves[2] = 'disarmingvoice';
		if (kind === 'nurse') set.gender = 'F';
		return set;
	});
}
