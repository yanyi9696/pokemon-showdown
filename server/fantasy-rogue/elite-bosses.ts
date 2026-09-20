/** User-authored Fantasy elite pools. One equally likely opponent per floor, drawn when entering it. */
import { Dex } from '../../sim/dex';

type EliteSet = Pick<PokemonSet, 'species' | 'ability' | 'moves'> &
	Partial<Pick<PokemonSet, 'item' | 'gender' | 'teraType' | 'nature'>> & { ivs?: Partial<StatsTable> };
const mon = (species: string, ability: string, moves: string[], extra: Partial<EliteSet> = {}): EliteSet =>
	({ species, ability, moves, ...extra });

export const FantasyEliteBosses: Record<number, { level: number, candidates: EliteSet[] }> = {
	10: { level: 10, candidates: [
		mon('duskullfantasy', 'Intimidate', ['Curse', 'Mean Look', 'Astonish']),
		mon('skittyfantasy', 'Pixilate', ['Swift', 'Disarming Voice', 'Icy Wind']),
		mon('rookideefantasy', 'Big Pecks', ['Power Trip', 'Hone Claws', 'Fury Attack']),
	] },
	30: { level: 20, candidates: [
		mon('onixfantasy', 'Refrigerate', ['Rock Throw', 'Glare', 'Headbutt']),
		mon('zoruahisuifantasy', 'shiyingli', ['Swift', 'Hex', 'Pain Split']),
		mon('tyruntfantasy', 'Sand Rush', ['yaolan', 'Rock Tomb', 'Rock Polish']),
		mon('mudkipfantasy', 'Simple', ['Yawn', 'Mud-Slap', 'Water Gun']),
	] },
	50: { level: 30, candidates: [
		mon('carnivinefantasy', 'Levitate', ['Wring Out', 'yaolan', 'Giga Drain', 'Leech Seed']),
		mon('altariafantasy', 'Cloud Nine', ['Hyper Voice', 'Roost', 'Air Cutter', 'raoliangzhiyin']),
		mon('ribombeefantasy', 'Shield Dust', ['Agility', 'Sticky Web', 'Alluring Voice', 'Psychic']),
		mon('ampharosfantasy', 'Illuminate', ['Discharge', 'Dragon Pulse', 'Psybeam', 'Electroweb'], { gender: 'M' }),
		mon('corvisquirefantasy', 'Big Pecks', ['chuanyun', 'Foul Play', 'Scary Face', 'Roost']),
	] },
	70: { level: 40, candidates: [
		mon('glaliefantasy', 'Mountaineer', ['Punishment', 'Rapid Spin', 'Dark Pulse', 'Ice Shard']),
		mon('golemalolafantasy', 'Magnet Pull', ['Rock Throw', 'Spark', 'Stealth Rock', 'Thunder Punch']),
		mon('hawluchafantasy', 'Gale Wings', ['chuanyun', 'Flying Press', 'Detect', 'Low Kick']),
		mon('honchkrowfantasy', 'luojingxiashi', ['Fiery Wrath', 'Steel Wing', 'chuanyun', 'Night Slash']),
		mon('drednawfantasy', 'yanbuzhen', ['yaolan', 'Skull Bash', 'Super Fang', 'Waterfall']),
	] },
	90: { level: 50, candidates: [
		mon('tropiusfantasy', 'Chlorophyll', ['youzhipeiyu', 'Air Slash', 'Leech Seed', 'Substitute']),
		mon('aggronfantasy', 'Sturdy', ['suilinggang', 'yanjian', 'Bullet Punch', 'Gyro Ball'], { item: 'Aggronite' }),
		mon('heatmorfantasy', 'Dry Skin', ['Fire Lash', 'yanjian', 'Throat Chop', 'Knock Off']),
		mon('illumisefantasy', 'Sweet Veil', ['Roost', 'Strength Sap', 'Encore', 'Spirit Break'], { gender: 'F' }),
		mon('beheeyemfantasy', 'qiyizhizaozhe', ['Trick Room', 'Future Sight', 'Psychic', 'Shadow Ball']),
	] },
	110: { level: 60, candidates: [
		mon('crobatfantasy', 'jiqususheng', ['zhenxi', 'Acrobatics', 'yaolan', 'Stealth Rock']),
		mon('ceruledgefantasy', 'Flash Fire', ['juenianpo', 'Bitter Blade', 'Throat Chop', 'Shadow Sneak']),
		mon('decidueyehisuifantasy', 'Scrappy', ['chuanyun', 'Thousand Arrows', 'Triple Arrows', 'Spikes']),
		mon('froslassfantasy', 'xuenv', ['Powder Snow', 'Ice Beam', 'Hex', 'Thunderbolt'], { gender: 'F' }),
		mon('gengarfantasy', 'Levitate', ['Bitter Malice', 'Dazzling Gleam', 'Mystical Fire', 'Sludge Bomb'], { ivs: { atk: 0 } }),
	] },
	130: { level: 70, candidates: [
		mon('mienshaofantasy', 'Inner Focus', ['Fake Out', 'High Jump Kick', 'Play Rough', 'Knock Off']),
		mon('absolfantasy', 'Sharpness', ['yuzhaozhijian', 'yaojingzhiya', 'Dire Claw', 'Detect']),
		mon('electivirefantasy', 'Fluffy', ['Supercell Slam', 'Punishment', 'Knock Off', 'Obstruct']),
		mon('dragalgefantasy', 'Corrosion', ['Draco Meteor', 'Focus Blast', 'Sludge Wave', 'Synthesis']),
		mon('magmortarfantasy', 'Mega Launcher', ['yanzhibodong', 'Dragon Pulse', 'Lava Plume', 'Scorching Sands']),
	] },
	150: { level: 80, candidates: [
		mon('weezingfantasy', 'Neutralizing Gas', ['Recover', 'Obstruct', 'Gunk Shot', 'Explosion']),
		mon('primarinafantasy', 'Liquid Voice', ['raoliangzhiyin', 'huanzhiwu', 'Psychic Noise', 'Moonblast']),
		mon('lopunnyfantasy', 'Hustle', ['Close Combat', 'Veevee Volley', 'Triple Axel', 'Fire Punch']),
		mon('mamoswinefantasy', 'bingheshenqu', ['juenianpo', 'Earthquake', 'Ice Shard', 'Stealth Rock']),
		mon('gyaradosfantasy', 'Intimidate', ['Dragon Dance', 'chuanyun', 'Earthquake', 'Waterfall']),
	] },
	170: { level: 90, candidates: [
		mon('golurkfantasy', 'No Guard', ['yuannengshifang', 'Headlong Rush', 'Poltergeist', 'Stone Edge']),
		mon('aerodactylfantasy', 'Rock Head', ['Brave Bird', 'Dragon Dance', 'Head Smash', 'Earthquake']),
		mon('salamencefantasy', 'Long Zhi Hu Xi', ['qibaoliuxing', 'Draco Meteor', 'Blood Moon', 'Fire Blast']),
		mon('toxtricityfantasy', 'Punk Rock', ['Overdrive', 'Boomburst', 'Sludge Wave', 'Clangorous Soul']),
		mon('Vespiquen-Fantasy', 'Feng Chao', ['Xian Xing Zhi Ling', 'Roost', 'Hurricane', 'Bug Buzz'], { gender: 'F' }),
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
