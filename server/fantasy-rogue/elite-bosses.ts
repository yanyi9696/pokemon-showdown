/** User-authored Fantasy elite pools. One equally likely opponent per floor, drawn when entering it. */
import { Dex } from '../../sim/dex';

type EliteSet = Pick<PokemonSet, 'species' | 'ability' | 'moves'> &
	Partial<Pick<PokemonSet, 'item' | 'gender' | 'teraType' | 'nature'>> & { ivs?: Partial<StatsTable> };
const mon = (species: string, ability: string, moves: string[], extra: Partial<EliteSet> = {}): EliteSet =>
	({ species, ability, moves, ...extra });

export const FantasyEliteBosses: Record<number, { level: number, candidates: EliteSet[] }> = {
	10: { level: 10, candidates: [
		mon('tyruntfantasy', 'Sand Rush', ['yaolan', 'Rock Tomb', 'Rock Polish']),
		mon('zoruahisuifantasy', 'shiyingli', ['Swift', 'Hex', 'Pain Split']),
		mon('duskullfantasy', 'Intimidate', ['Curse', 'Mean Look', 'Astonish']),
		mon('skittyfantasy', 'Pixilate', ['qingsumihun', 'Swift', 'Earth Power']),
		mon('rookideefantasy', 'zhengqiang', ['chuanyun', 'Foul Play', 'Roost']),
		mon('onixfantasy', 'mishi', ['Rock Throw', 'Avalanche', 'Body Press']),
	] },
	30: { level: 20, candidates: [
		mon('cherrimfantasy', 'Flower Gift', ['Giga Drain', 'Synthesis', 'Sunny Day', 'Weather Ball'], { ivs: { atk: 0 } }),
		mon('simipourfantasy', 'Gluttony', ['Bouncy Bubble', 'Scald'], { ivs: { atk: 0 } }),
		mon('simisagefantasy', 'Gluttony', ['Sappy Seed', 'Giga Drain']),
		mon('simisearfantasy', 'Gluttony', ['Sizzly Slide', 'Flamethrower']),
		mon('carnivinefantasy', 'Levitate', ['Wring Out', 'yaolan', 'Giga Drain', 'Leech Seed']),
		mon('illumisefantasy', 'Sweet Veil', ['Roost', 'Strength Sap', 'Encore', 'Spirit Break'], { gender: 'F' }),
	] },
	50: { level: 30, candidates: [
		mon('vikavoltfantasy', 'Levitate', ['Discharge', 'Air Slash', 'Energy Ball', 'Thunder Wave'], { ivs: { atk: 0 } }),
		mon('altariafantasy', 'Cloud Nine', ['Hyper Voice', 'Roost', 'Air Cutter', 'raoliangzhiyin']),
		mon('ribombeefantasy', 'Shield Dust', ['Agility', 'Sticky Web', 'Alluring Voice', 'Psychic']),
		mon('ampharosfantasy', 'Illuminate', ['Discharge', 'Dragon Pulse', 'Psybeam', 'Electroweb'], { gender: 'M' }),
		mon('tropiusfantasy', 'Chlorophyll', ['youzhipeiyu', 'Air Slash', 'Leech Seed', 'Substitute']),
		mon('golemalolafantasy', 'Magnet Pull', ['Rock Throw', 'Spark', 'Stealth Rock', 'Thunder Punch']),
	] },
	70: { level: 40, candidates: [
		mon('hawluchafantasy', 'Gale Wings', ['chuanyun', 'Flying Press', 'Detect', 'Low Kick']),
		mon('honchkrowfantasy', 'luojingxiashi', ['Fiery Wrath', 'Steel Wing', 'chuanyun', 'Night Slash']),
		mon('drednawfantasy', 'yanbuzhen', ['yaolan', 'Skull Bash', 'Super Fang', 'Waterfall']),
		mon('heatmorfantasy', 'Dry Skin', ['Fire Lash', 'yanjian', 'Throat Chop', 'Knock Off']),
		mon('beheeyemfantasy', 'qiyizhizaozhe', ['Trick Room', 'Future Sight', 'Psychic', 'Shadow Ball']),
		mon('crobatfantasy', 'jiqususheng', ['zhenxi', 'Acrobatics', 'yaolan', 'Stealth Rock']),
	] },
	90: { level: 50, candidates: [
		mon('ceruledgefantasy', 'Flash Fire', ['juenianpo', 'Bitter Blade', 'Throat Chop', 'Shadow Sneak']),
		mon('froslassfantasy', 'xuenv', ['Powder Snow', 'Ice Beam', 'Hex', 'Thunderbolt'], { gender: 'F' }),
		mon('gengarfantasy', 'Levitate', ['Bitter Malice', 'Dazzling Gleam', 'Mystical Fire', 'Sludge Bomb'], { ivs: { atk: 0 } }),
		mon('mienshaofantasy', 'Inner Focus', ['Fake Out', 'High Jump Kick', 'Play Rough', 'Knock Off']),
		mon('lopunnyfantasy', 'Hustle', ['Close Combat', 'Veevee Volley', 'Triple Axel', 'Fire Punch']),
		mon('absolfantasy', 'Sharpness', ['yuzhaozhijian', 'yaojingzhiya', 'Dire Claw', 'Detect']),
	] },
	110: { level: 60, candidates: [
		mon('electivirefantasy', 'Fluffy', ['Supercell Slam', 'Punishment', 'Knock Off', 'Obstruct']),
		mon('dragalgefantasy', 'Corrosion', ['Draco Meteor', 'Focus Blast', 'Sludge Wave', 'Synthesis']),
		mon('magmortarfantasy', 'Mega Launcher', ['yanzhibodong', 'Dragon Pulse', 'Lava Plume', 'Scorching Sands']),
		mon('weezingfantasy', 'Levitate', ['Recover', 'Obstruct', 'Gunk Shot', 'Explosion']),
		mon('aggronfantasy', 'Earth Eater', ['suilinggang', 'yanjian', 'Bullet Punch', 'Gyro Ball'], { ivs: { spe: 0 } }),
		mon('mamoswinefantasy', 'bingheshenqu', ['juenianpo', 'Earthquake', 'Ice Shard', 'Stealth Rock']),
	] },
	130: { level: 70, candidates: [
		mon('golurkfantasy', 'No Guard', ['yuannengshifang', 'Headlong Rush', 'Poltergeist', 'Stone Edge']),
		mon('aerodactylfantasy', 'Rock Head', ['Brave Bird', 'Dragon Dance', 'Head Smash', 'Earthquake']),
		mon('salamencefantasy', 'longzhihuxi', ['qibaoliuxing', 'Draco Meteor', 'Blood Moon', 'Fire Blast']),
		mon('toxtricityfantasy', 'Punk Rock', ['Overdrive', 'Boomburst', 'Sludge Wave', 'Clangorous Soul']),
		mon('vespiquenfantasy', 'fengchao', ['xianxingzhiling', 'Roost', 'Hurricane', 'Bug Buzz'], { gender: 'F' }),
		mon('gyaradosfantasy', 'Intimidate', ['Dragon Dance', 'chuanyun', 'Earthquake', 'Waterfall']),
	] },
	150: { level: 80, candidates: [
		mon('stakatakafantasy', 'Beast Boost', ['Trick Room', 'dongchadaji', 'Rock Throw', 'Body Press']),
		mon('ironthornsfantasy', 'jizhineng', ['Dragon Dance', 'Ice Beam', 'Rock Throw', 'Supercell Slam']),
		mon('sandyshocksfantasy', 'Magnet Pull', ['Nasty Plot', 'zhishareshe', 'Earth Power', 'Thunderbolt'], { ivs: { atk: 0 } }),
		mon('darkraifantasy', 'Bad Dreams', ['Dark Void', 'Dark Pulse', 'Shadow Ball', 'Sludge Bomb'], { ivs: { atk: 0 } }),
		mon('cresseliafantasy', 'meimenggongyou', ['Moonlight', 'Ice Beam', 'Moonblast', 'Psyshock'], { gender: 'F', ivs: { atk: 0 } }),
		mon('enteifantasy', 'huoshanxingzhe', ['fengxing', 'Burning Bulwark', 'Sacred Fire', 'Earthquake']),
	] },
	170: { level: 90, candidates: [
		mon('suicunefantasy', 'jiguangxingzhe', ['fengxing', 'Moonlight', 'Calm Mind', 'Scald'], { ivs: { atk: 0 } }),
		mon('raikoufantasy', 'leitingxingzhe', ['fengxing', 'Thunderclap', 'Thunderbolt', 'Calm Mind'], { ivs: { atk: 0 } }),
		mon('tapukokofantasy', 'Electric Surge', ["Nature's Madness", 'Rising Voltage', 'Dazzling Gleam', 'Spark']),
		mon('tapubulufantasy', 'Grassy Surge', ['Grassy Glide', 'Stone Edge', 'Close Combat', 'Swords Dance']),
		mon('tapufinifantasy', 'Misty Surge', ['Misty Explosion', 'Moonlight', 'Scald', "Nature's Madness"], { ivs: { atk: 0 } }),
		mon('tapulelefantasy', 'Psychic Surge', ['Expanding Force', 'Moonblast', "Nature's Madness", 'Shadow Ball'], { ivs: { atk: 0 } }),
	] },
};

export function eliteBossCandidates(floor: number): PokemonSet[] {
	const pool = FantasyEliteBosses[floor];
	if (!pool) return [];
	const dex = Dex.mod('gen9fantasy');
	return pool.candidates.map(set => {
		const species = dex.species.get(set.species);
		return {
			name: species.name, species: species.name, level: pool.level,
			ability: dex.abilities.get(set.ability).name, moves: set.moves.map(move => dex.moves.get(move).name),
			item: set.item || '', gender: set.gender || species.gender || '', nature: set.nature || 'Hardy',
			teraType: set.teraType || species.defaultTeraType,
			evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
			ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...set.ivs },
		};
	});
}
