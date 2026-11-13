/** Authored doubles teams for all Elite Four floors and the six final champions. */
const member = (species: string, ability: string, moves: string[], item: string, training: string) =>
	`${species}${item ? ` @ ${item}` : ''}\nAbility: ${ability}\n${training}\n${moves.map(move => `- ${move}`).join('\n')}`;
const team = (...members: string[]) => members.join('\n\n');

const loreleiFroslass = member(
	'Froslass-Mega-Fantasy (F)',
	'xuenv',
	['Blizzard', 'Shadow Ball', 'Aurora Veil', 'Protect'],
	'Froslassite', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);
const loreleiNinetales = member(
	'Ninetales-Alola',
	'Snow Warning',
	['Aurora Veil', 'Blizzard', 'Freeze-Dry', 'Protect'],
	'Light Clay', "EVs: 252 HP / 4 SpA / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);
const loreleiBaxcalibur = member(
	'Baxcalibur',
	'Thermal Exchange',
	['Icicle Spear', 'Glaive Rush', 'Ice Shard', 'Protect'],
	'Loaded Dice', "EVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature"
);
const loreleiFrosmoth = member(
	'Frosmoth-Fantasy',
	'Ice Scales',
	['Quiver Dance', 'Ice Beam', 'Bug Buzz', 'Protect'],
	'Heavy-Duty Boots', "EVs: 252 SpA / 4 SpD / 252 Spe\nModest Nature\nIVs: 0 Atk"
);
const loreleiChienPao = member(
	'Chien-Pao',
	'Sword of Ruin',
	['Ice Spinner', 'Sacred Sword', 'Sucker Punch', 'Protect'],
	'Focus Sash', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"
);
const loreleiMamoswine = member(
	'Mamoswine-Fantasy',
	'Slush Rush',
	['Icicle Crash', 'High Horsepower', 'Ice Shard', 'Protect'],
	'Life Orb', "EVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature"
);
const loreleiIronBundle = member(
	'Iron Bundle',
	'Quark Drive',
	['Freeze-Dry', 'Hydro Pump', 'Icy Wind', 'Protect'],
	'Booster Energy', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);
const loreleiArticuno = member(
	'Articuno',
	'Pressure',
	['Freeze-Dry', 'Hurricane', 'Tailwind', 'Protect'],
	'Covert Cloak', "EVs: 252 HP / 4 SpA / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);

const lanceDragonite = member(
	'Dragonite-Fantasy',
	'chaojiyushui',
	['Draco Meteor', 'Hurricane', 'Weather Ball', 'Protect'],
	'Leftovers', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"
);
const lanceGarchomp = member(
	'Garchomp-Fantasy',
	'Rough Skin',
	['Dragon Claw', 'Stomping Tantrum', 'Rock Slide', 'Protect'],
	'Dragon Gem', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"
);
const lanceGyarados = member(
	'Gyarados-Mega-Fantasy',
	'Intimidate',
	['Waterfall', 'Ice Fang', 'Tailwind', 'Protect'],
	'Gyaradosite', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature"
);
const lanceDragapult = member(
	'Dragapult-Fantasy',
	'Parental Bond',
	['Dragon Darts', 'Poltergeist', 'Tailwind', 'Protect'],
	'Clear Amulet', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"
);
const lanceRagingBolt = member(
	'Raging Bolt',
	'Protosynthesis',
	['Thunderclap', 'Thunderbolt', 'Dragon Pulse', 'Protect'],
	'Booster Energy', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"
);
const lanceGoodra = member(
	'Goodra-Hisui',
	'Shell Armor',
	['Shelter', 'Dragon Tail', 'Flash Cannon', 'Protect'],
	'Fantasy Protector', "EVs: 252 HP / 4 Def / 252 SpA\nQuiet Nature"
);
const lanceArchaludon = member(
	'Archaludon',
	'Stamina',
	['Electro Shot', 'Draco Meteor', 'Flash Cannon', 'Body Press'],
	'Assault Vest', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"
);
const lanceGougingFire = member(
	'Gouging Fire',
	'Protosynthesis',
	['Heat Crash', 'Breaking Swipe', 'Burning Bulwark', 'Dragon Claw'],
	'Booster Energy', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature"
);
const lanceWalkingWake = member(
	'Walking Wake',
	'Protosynthesis',
	['Hydro Steam', 'Draco Meteor', 'Flamethrower', 'Freeze-Dry'],
	'Choice Specs', "EVs: 252 SpA / 4 SpD / 252 Spe\nModest Nature\nIVs: 0 Atk"
);

const rikaClodsire = member(
	'Clodsire',
	'Water Absorb',
	['Recover', 'Haze', 'Helping Hand', 'Protect'],
	'Sitrus Berry', "EVs: 252 HP / 156 Def / 100 SpD\nCalm Nature\nIVs: 0 Atk"
);
const rikaHippowdon = member(
	'Hippowdon',
	'Sand Stream',
	['High Horsepower', 'Rock Slide', 'Yawn', 'Protect'],
	'Smooth Rock', "EVs: 252 HP / 252 Def / 4 SpD\nImpish Nature"
);
const rikaExcadrill = member(
	'Excadrill-Fantasy',
	'Sand Rush',
	['High Horsepower', 'Iron Head', 'Rock Slide', 'Protect'],
	'Life Orb', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"
);
const rikaSandyShocks = member(
	'Sandy Shocks-Fantasy',
	'Protosynthesis',
	['Earth Power', 'Thunderbolt', 'Volt Switch', 'Protect'],
	'Booster Energy', "EVs: 252 SpA / 4 SpD / 252 Spe\nModest Nature\nIVs: 0 Atk"
);
const rikaTyranitar = member(
	'Tyranitar-Fantasy',
	'Sand Stream',
	['Rock Slide', 'Knock Off', 'Low Kick', 'Ice Punch'],
	'Assault Vest', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature"
);
const rikaGolurk = member(
	'Golurk-Fantasy',
	'No Guard',
	['Headlong Rush', 'Poltergeist', 'Dynamic Punch', 'Protect'],
	'Focus Sash', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature"
);
const rikaLandorus = member(
	'Landorus-Therian',
	'Intimidate',
	['U-turn', 'Stomping Tantrum', 'Rock Slide', 'Protect'],
	'Clear Amulet', "EVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature"
);
const rikaGreatTusk = member(
	'Great Tusk',
	'Protosynthesis',
	['Close Combat', 'Headlong Rush', 'Rock Slide', 'Protect'],
	'Booster Energy', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"
);
const rikaUrsaluna = member(
	'Ursaluna-Bloodmoon (M)',
	"Mind's Eye",
	['Blood Moon', 'Earth Power', 'Hyper Voice', 'Protect'],
	'Leftovers', "EVs: 252 HP / 252 SpA / 4 SpD\nQuiet Nature\nIVs: 0 Atk / 0 Spe"
);

const laceyTapuFini = member(
	'Tapu Fini-Fantasy',
	'Misty Surge',
	['Moonblast', "Nature's Madness", 'Icy Wind', 'Protect'],
	'Misty Seed', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"
);
const laceyMagearna = member(
	'Magearna',
	'Soul-Heart',
	['Fleur Cannon', 'Flash Cannon', 'Volt Switch', 'Dazzling Gleam'],
	'Assault Vest', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"
);
const laceyMimikyu = member(
	'Mimikyu-Fantasy',
	'Disguise',
	['Play Rough', 'Trick Room', 'Shadow Sneak', 'Protect'],
	'Mental Herb', "EVs: 252 HP / 252 Atk / 4 SpD\nBrave Nature\nIVs: 0 Spe"
);
const laceyFloette = member(
	'Floette-Mega (F)',
	'Flower Veil',
	['Light of Ruin', 'Moonblast', 'Synthesis', 'Protect'],
	'Floettite', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"
);
const laceyDelphox = member(
	'Delphox-Fantasy',
	'Magic Bounce',
	['Heat Wave', 'Moonblast', 'Focus Blast', 'Protect'],
	'Focus Sash', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);
const laceyAudino = member(
	'Audino-Fantasy',
	'Regenerator',
	['Heal Pulse', 'Helping Hand', 'Moonblast', 'Protect'],
	'Sitrus Berry', "EVs: 252 HP / 156 Def / 100 SpD\nCalm Nature\nIVs: 0 Atk"
);
const laceyClefable = member(
	'Clefable',
	'Magic Guard',
	['Follow Me', 'Helping Hand', 'Moonblast', 'Protect'],
	'Rocky Helmet', "EVs: 252 HP / 156 Def / 100 SpD\nCalm Nature\nIVs: 0 Atk"
);
const laceyTapuLele = member(
	'Tapu Lele',
	'Psychic Surge',
	['Psychic', 'Moonblast', 'Dazzling Gleam', 'Protect'],
	'Choice Scarf', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);
const laceyTogekiss = member(
	'Togekiss',
	'Serene Grace',
	['Follow Me', 'Air Slash', 'Tailwind', 'Protect'],
	'Covert Cloak', "EVs: 252 HP / 156 Def / 100 SpD\nCalm Nature\nIVs: 0 Atk"
);

const acerolaMimikyu = member(
	'Mimikyu-Fantasy',
	'Disguise',
	['Trick Room', 'Play Rough', 'Shadow Sneak', 'Protect'],
	'Mental Herb', "EVs: 252 HP / 252 Atk / 4 SpD\nBrave Nature\nIVs: 0 Spe"
);
const acerolaDarkrai = member(
	'Darkrai-Mega-Fantasy',
	'Bad Dreams',
	['Dark Pulse', 'Dark Void', 'Shadow Ball', 'Protect'],
	'Darkranite', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);
const acerolaGholdengo = member(
	'Gholdengo',
	'Good as Gold',
	['Make It Rain', 'Shadow Ball', 'Nasty Plot', 'Protect'],
	'Leftovers', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"
);
const acerolaMarowak = member(
	'Marowak-Alola-Totem-Fantasy',
	'Gu Hun',
	['Shadow Bone', 'Flare Blitz', 'Shadow Sneak', 'Protect'],
	'Thick Club', "EVs: 252 HP / 252 Atk / 4 SpD\nBrave Nature\nIVs: 0 Spe"
);
const acerolaSableye = member(
	'Sableye',
	'Prankster',
	['Fake Out', 'Will-O-Wisp', 'Quash', 'Protect'],
	'Mental Herb', "EVs: 252 HP / 252 Def / 4 SpD\nBold Nature\nIVs: 0 Atk"
);
const acerolaZoroark = member(
	'Zoroark-Hisui-Fantasy',
	'Illusion',
	['Hyper Voice', 'Shadow Ball', 'Icy Wind', 'Protect'],
	'Normal Gem', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);
const acerolaFlutterMane = member(
	'Flutter Mane',
	'Protosynthesis',
	['Moonblast', 'Shadow Ball', 'Icy Wind', 'Protect'],
	'Booster Energy', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);
const acerolaMarshadow = member(
	'Marshadow',
	'Technician',
	['Spectral Thief', 'Shadow Sneak', 'Close Combat', 'Protect'],
	'Life Orb', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"
);
const acerolaSpectrier = member(
	'Spectrier',
	'Grim Neigh',
	['Shadow Ball', 'Snarl', 'Will-O-Wisp', 'Protect'],
	'Spell Tag', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);

const larryStaraptor = member(
	'Staraptor-Mega',
	'Intimidate',
	['Brave Bird', 'Close Combat', 'Knock Off', 'Protect'],
	'Staraptite', "EVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature"
);
const larryKingambit = member(
	'Kingambit',
	'Supreme Overlord',
	['Kowtow Cleave', 'Sucker Punch', 'Iron Head', 'Protect'],
	'Black Glasses', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature"
);
const larryDragonite = member(
	'Dragonite',
	'Multiscale',
	['Extreme Speed', 'Dragon Claw', 'Tailwind', 'Protect'],
	'Lum Berry', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature"
);
const larryLandorus = member(
	'Landorus-Therian',
	'Intimidate',
	['U-turn', 'Rock Slide', 'Earthquake', 'Stomping Tantrum'],
	'Choice Scarf', "EVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature"
);
const larryCorviknight = member(
	'Corviknight-Fantasy',
	'tiekai',
	['Body Press', 'Iron Defense', 'Tailwind', 'Protect'],
	'G-Mega Wishing Star', "EVs: 252 HP / 252 Def / 4 SpD\nImpish Nature\nIVs: 0 Atk"
);
const larryZapdosGalar = member(
	'Zapdos-Galar',
	'Defiant',
	['Brave Bird', 'Close Combat', 'Knock Off', 'Protect'],
	'Clear Amulet', "EVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature"
);
const larryTornadus = member(
	'Tornadus',
	'Prankster',
	['Tailwind', 'Bleakwind Storm', 'Taunt', 'Protect'],
	'Covert Cloak', "EVs: 252 HP / 4 SpA / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);
const larryMoltresGalar = member(
	'Moltres-Galar',
	'Berserk',
	['Fiery Wrath', 'Air Slash', 'Tailwind', 'Protect'],
	'Sitrus Berry', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"
);

export const TrainerBossDoublesHighTier: Record<string, string> = {
	'lorelei:165': team(loreleiFroslass, loreleiNinetales, loreleiBaxcalibur, loreleiFrosmoth, loreleiChienPao, loreleiMamoswine),
	'lorelei:175': team(loreleiFroslass, loreleiNinetales, loreleiBaxcalibur, loreleiFrosmoth, loreleiChienPao, loreleiIronBundle),
	'lorelei:180': team(loreleiFroslass, loreleiNinetales, loreleiBaxcalibur, loreleiChienPao, loreleiIronBundle, loreleiArticuno),
	'lorelei:185': team(loreleiFroslass, loreleiNinetales, loreleiFrosmoth, loreleiChienPao, loreleiIronBundle, loreleiArticuno),
	'lance:165': team(lanceDragonite, lanceGarchomp, lanceGyarados, lanceDragapult, lanceRagingBolt, lanceGoodra),
	'lance:175': team(lanceDragonite, lanceGarchomp, lanceGyarados, lanceDragapult, lanceRagingBolt, lanceArchaludon),
	'lance:180': team(lanceDragonite, lanceGarchomp, lanceGyarados, lanceGougingFire, lanceRagingBolt, lanceArchaludon),
	'lance:185': team(lanceDragonite, lanceGarchomp, lanceGyarados, lanceGougingFire, lanceWalkingWake, lanceRagingBolt),
	'rika:165': team(rikaClodsire, rikaHippowdon, rikaExcadrill, rikaSandyShocks, rikaTyranitar, rikaGolurk),
	'rika:175': team(rikaClodsire, rikaHippowdon, rikaExcadrill, rikaSandyShocks, rikaTyranitar, rikaLandorus),
	'rika:180': team(rikaClodsire, rikaHippowdon, rikaExcadrill, rikaSandyShocks, rikaLandorus, rikaGreatTusk),
	'rika:185': team(rikaClodsire, rikaHippowdon, rikaExcadrill, rikaLandorus, rikaGreatTusk, rikaUrsaluna),
	'lacey:165': team(laceyTapuFini, laceyMagearna, laceyMimikyu, laceyFloette, laceyDelphox, laceyAudino),
	'lacey:175': team(laceyTapuFini, laceyMagearna, laceyMimikyu, laceyFloette, laceyAudino, laceyClefable),
	'lacey:180': team(laceyTapuFini, laceyMagearna, laceyMimikyu, laceyFloette, laceyClefable, laceyTapuLele),
	'lacey:185': team(laceyTapuFini, laceyMagearna, laceyMimikyu, laceyFloette, laceyTapuLele, laceyTogekiss),
	'acerola:165': team(acerolaMimikyu, acerolaDarkrai, acerolaGholdengo, acerolaMarowak, acerolaSableye, acerolaZoroark),
	'acerola:175': team(acerolaMimikyu, acerolaDarkrai, acerolaGholdengo, acerolaMarowak, acerolaSableye, acerolaFlutterMane),
	'acerola:180': team(acerolaMimikyu, acerolaDarkrai, acerolaGholdengo, acerolaMarowak, acerolaFlutterMane, acerolaMarshadow),
	'acerola:185': team(acerolaMimikyu, acerolaDarkrai, acerolaGholdengo, acerolaMarowak, acerolaSpectrier, acerolaMarshadow),
	'larry:165': team(larryKingambit, larryStaraptor, larryDragonite, larryLandorus, larryCorviknight, larryZapdosGalar),
	'larry:175': team(larryStaraptor, larryDragonite, larryLandorus, larryCorviknight, larryZapdosGalar, larryTornadus),
	'larry:180': team(larryStaraptor, larryKingambit, larryDragonite, larryLandorus, larryCorviknight, larryMoltresGalar),
	'larry:185': team(larryStaraptor, larryKingambit, larryLandorus, larryCorviknight, larryTornadus, larryMoltresGalar),
	'steven:190': team(
		member('Metagross-Mega-Fantasy', 'Clear Body', ['Meteor Mash', 'Stomping Tantrum', 'Bullet Punch', 'Protect'], 'Metagrossite', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"),
		member('Necrozma-Dusk-Mane', 'Prism Armor', ['Sunsteel Strike', 'Photon Geyser', 'Earthquake', 'Protect'], 'Solganium Z', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature"),
		member('Kartana-Fantasy', 'Sharpness', ['Leaf Blade', 'Sacred Sword', 'Smart Strike', 'Protect'], 'Fantasy Ultra Energy', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"),
		member('Gholdengo', 'Good as Gold', ['Make It Rain', 'Shadow Ball', 'Nasty Plot', 'Protect'], 'Air Balloon', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"),
		member('Heatran', 'Flash Fire', ['Heat Wave', 'Earth Power', 'Taunt', 'Protect'], 'Leftovers', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"),
		member('Skarmory-Fantasy', 'tiekai', ['Tailwind', 'Body Press', 'Roost', 'Protect'], 'Fantasy Protector', "EVs: 252 HP / 252 Def / 4 SpD\nImpish Nature\nIVs: 0 Atk")
	),
	'leon:190': team(
		member('Charizard-Mega-Y', 'Blaze', ['Heat Wave', 'Solar Beam', 'Weather Ball', 'Protect'], 'Charizardite Y', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"),
		member('Zacian-Crowned', 'Intrepid Sword', ['Behemoth Blade', 'Play Rough', 'Sacred Sword', 'Protect'], 'Rusted Sword', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"),
		member('Urshifu-G-Mega-Fantasy', 'Unseen Fist', ['Ren Zhen Ou Da', 'Close Combat', 'U-turn', 'Ice Punch'], 'Choice Scarf', "EVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature"),
		member('Spectrier', 'Grim Neigh', ['Shadow Ball', 'Snarl', 'Will-O-Wisp', 'Protect'], 'Spell Tag', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"),
		member('Darmanitan-Fantasy', 'Gorilla Tactics', ['Flare Blitz', 'Icicle Crash', 'U-turn', 'Earthquake'], 'Choice Scarf', "EVs: 252 Atk / 4 SpD / 252 Spe\nAdamant Nature"),
		member('Venusaur', 'Chlorophyll', ['Sleep Powder', 'Sludge Bomb', 'Leaf Storm', 'Protect'], 'Wide Lens', "EVs: 252 SpA / 4 SpD / 252 Spe\nModest Nature\nIVs: 0 Atk")
	),
	'lance:190': team(
		member('Koraidon', 'Orichalcum Pulse', ['Collision Course', 'Flare Blitz', 'U-turn', 'Protect'], 'Clear Amulet', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"),
		member('Gouging Fire', 'Protosynthesis', ['Heat Crash', 'Breaking Swipe', 'Burning Bulwark', 'Dragon Claw'], 'Booster Energy', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature"),
		member('Walking Wake', 'Protosynthesis', ['Hydro Steam', 'Draco Meteor', 'Flamethrower', 'Freeze-Dry'], 'Choice Specs', "EVs: 252 SpA / 4 SpD / 252 Spe\nModest Nature\nIVs: 0 Atk"),
		member('Dragonite-Fantasy', 'chaojiyushui', ['Draco Meteor', 'Hurricane', 'Weather Ball', 'Protect'], 'Leftovers', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"),
		member('Raging Bolt', 'Protosynthesis', ['Thunderclap', 'Thunderbolt', 'Dragon Pulse', 'Protect'], 'Booster Energy', "EVs: 252 HP / 252 SpA / 4 SpD\nModest Nature\nIVs: 0 Atk"),
		member('Gyarados-Mega-Fantasy', 'Intimidate', ['Waterfall', 'Ice Fang', 'Tailwind', 'Protect'], 'Gyaradosite', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature")
	),
	'diantha:190': team(
		member('Gardevoir-Mega', 'Trace', ['Hyper Voice', 'Psyshock', 'Thunderbolt', 'Protect'], 'Gardevoirite', "EVs: 252 SpA / 4 SpD / 252 Spe\nModest Nature\nIVs: 0 Atk"),
		member('Xerneas-Fantasy', 'Fairy Aura', ['Geomancy', 'Moonblast', 'Dazzling Gleam', 'Protect'], 'Power Herb', "EVs: 252 SpA / 4 SpD / 252 Spe\nModest Nature\nIVs: 0 Atk"),
		member('Aegislash-Fantasy', 'Stance Change', ["King's Shield", 'Shadow Ball', 'Wide Guard', 'Secret Sword'], 'Leftovers', "EVs: 252 HP / 252 SpA / 4 SpD\nQuiet Nature\nIVs: 0 Atk / 0 Spe"),
		member('Hoopa-Unbound', 'Magician', ['Hyperspace Fury', 'Gunk Shot', 'Fire Punch', 'Protect'], 'Focus Sash', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"),
		member('Ferrothorn', 'Iron Barbs', ['Power Whip', 'Gyro Ball', 'Leech Seed', 'Protect'], 'Rocky Helmet', "EVs: 252 HP / 252 Atk / 4 SpD\nBrave Nature\nIVs: 0 Spe"),
		member('Audino-Fantasy', 'Regenerator', ['Heal Pulse', 'Helping Hand', 'Moonblast', 'Protect'], 'Sitrus Berry', "EVs: 252 HP / 156 Def / 100 SpD\nCalm Nature\nIVs: 0 Atk")
	),
	'cynthia:190': team(
		member('Garchomp-Mega-Fantasy', 'Rough Skin', ['Dragon Claw', 'Stomping Tantrum', 'Rock Slide', 'Protect'], 'Garchompite', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"),
		member('Giratina-Origin', 'Levitate', ['Poltergeist', 'Dragon Tail', 'Will-O-Wisp', 'Protect'], 'Griseous Core', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature"),
		member('Steelix-Fantasy', 'Earth Eater', ['Diamond Storm', 'Heavy Slam', 'Glare', 'Protect'], 'Sitrus Berry', "EVs: 252 HP / 252 Def / 4 SpD\nImpish Nature"),
		member('Ogerpon-Cornerstone (F)', 'Sturdy', ['Ivy Cudgel', 'Follow Me', 'Horn Leech', 'Spiky Shield'], 'Cornerstone Mask', "EVs: 252 HP / 4 Atk / 252 Spe\nJolly Nature"),
		member('Urshifu-Rapid-Strike-Fantasy', 'Unseen Fist', ['Surging Strikes', 'Close Combat', 'Aqua Jet', 'Protect'], 'Mystic Water', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"),
		member('Clefable', 'Friend Guard', ['Follow Me', 'Moonblast', 'Helping Hand', 'Protect'], 'Rocky Helmet', "EVs: 252 HP / 156 Def / 100 SpD\nCalm Nature\nIVs: 0 Atk")
	),
	'ash:190': team(
		member('Greninja-Ash-Fantasy (M)', 'chaoyueqianbanbianshen', ['Water Shuriken', 'Surf', 'Dark Pulse', 'Protect'], 'greninjaashz', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"),
		member('Gengar-G-Mega-Fantasy', 'Levitate', ['Nasty Plot', 'Shadow Ball', 'Sludge Bomb', 'Protect'], 'G-Mega Wishing Star', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"),
		member('Dragonite', 'Multiscale', ['Extreme Speed', 'Dragon Claw', 'Fire Punch', 'Protect'], 'Lum Berry', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature"),
		member('Lucario-Mega', 'Inner Focus', ['Close Combat', 'Meteor Mash', 'Bullet Punch', 'Protect'], 'Lucarionite', "EVs: 252 Atk / 4 SpD / 252 Spe\nJolly Nature"),
		member('Naganadel', 'Beast Boost', ['Draco Meteor', 'Sludge Bomb', 'Heat Wave', 'Protect'], 'Dragon Gem', "EVs: 252 SpA / 4 SpD / 252 Spe\nTimid Nature\nIVs: 0 Atk"),
		member('Melmetal', 'Iron Fist', ['Double Iron Bash', 'Superpower', 'Ice Punch', 'Thunder Punch'], 'Assault Vest', "EVs: 252 HP / 252 Atk / 4 SpD\nAdamant Nature")
	),
};
