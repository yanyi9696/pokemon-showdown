import type { OptionalChallengeDefinition } from './challenge-data';

/** Authored tower doubles teams. The first two members lead, including p2/p4 in Multi. */
export interface ChallengeDoublesPlan {
	hint: string;
	team: OptionalChallengeDefinition['team'];
}

// Keep each invitation's cast and signature forms. These are not VGC bring-six/pick-four teams:
// every member remains available, with reserves supporting the same weather/speed/control plan.
export const CHALLENGE_DOUBLES: Record<string, ChallengeDoublesPlan> = {
	dojoinvitation: {
		hint: '战舞郎以击掌奇袭与广域防守掩护飞腿郎输出；快拳郎负责先制收尾。不要让两只伙伴同时陷入被动。',
		team: [
			['Hitmontop', 'Intimidate', 'Sitrus Berry', ['fakeout', 'closecombat', 'wideguard', 'feint'], 'bulkyphysical'],
			['Hitmonlee', 'Reckless', 'Black Belt', ['closecombat', 'knockoff', 'rockslide', 'protect'], 'physical'],
			['Hitmonchan', 'Iron Fist', 'Expert Belt', ['drainpunch', 'icepunch', 'machpunch', 'protect'], 'bulkyphysical'],
		],
	},
	bridgeinvitation: {
		hint: '阿柏怪威吓并用大蛇瞪眼控速，叉字蝠以顺风、挑衅争取节奏；拉达的毅力攻击负责收尾。',
		team: [
			['Arbok', 'Intimidate', 'Sitrus Berry', ['glare', 'poisonjab', 'crunch', 'protect'], 'bulkyphysical'],
			['Crobat', 'Inner Focus', 'Covert Cloak', ['tailwind', 'bravebird', 'taunt', 'protect'], 'screens'],
			['Raticate', 'Guts', 'Flame Orb', ['facade', 'suckerpunch', 'uturn', 'protect'], 'physical'],
		],
	},
	silphsupply: {
		hint: '猫老大的击掌奇袭为顽皮雷弹开墙、撒电网争取时间；臭臭泥与双弹瓦斯接力消耗，避免盲目强化。',
		team: [
			['Persian', 'Technician', 'Sitrus Berry', ['fakeout', 'icywind', 'taunt', 'snarl'], 'screens'],
			['Electrode', 'Static', 'Light Clay', ['reflect', 'lightscreen', 'electroweb', 'thunderbolt'], 'screens'],
			['Weezing', 'Levitate', 'Black Sludge', ['sludgebomb', 'flamethrower', 'willowisp', 'protect'], 'bulkyspecial'],
			['Muk', 'Sticky Hold', 'Assault Vest', ['poisonjab', 'knockoff', 'brickbreak', 'shadowsneak'], 'bulkyphysical'],
		],
	},
	subwaytrial: {
		hint: '电蜘蛛用电网压低对方速度，水晶灯火灵紧接热风；岩殿居蟹提供广域防守，齿轮怪伺机提速。',
		team: [
			['Galvantula', 'Compound Eyes', 'Focus Sash', ['electroweb', 'thunder', 'bugbuzz', 'protect'], 'special'],
			['Chandelure', 'Flash Fire', 'Life Orb', ['heatwave', 'shadowball', 'energyball', 'protect'], 'special'],
			['Crustle', 'Sturdy', 'Sitrus Berry', ['wideguard', 'rockslide', 'xscissor', 'stompingtantrum'], 'bulkyphysical'],
			['Klinklang', 'Clear Body', 'Leftovers', ['shiftgear', 'geargrind', 'wildcharge', 'protect'], 'physical'],
		],
	},
	palmersinvitation: {
		hint: '克雷色利亚可用特性互换解除雷吉奇卡斯的慢启动，再以冰冻之风控速。其余伙伴兼顾威吓反制、先制收尾和范围输出。',
		team: [
			['Cresselia', 'Levitate', 'Sitrus Berry', ['skillswap', 'icywind', 'psychic', 'helpinghand'], 'wall'],
			['Regigigas', 'Slow Start', 'Clear Amulet', ['bodyslam', 'knockoff', 'rockslide', 'protect'], 'physical'],
			['Dragonite', 'Inner Focus', 'Lum Berry', ['dragonclaw', 'extremespeed', 'tailwind', 'protect'], 'bulkyphysical'],
			['Milotic', 'Competitive', 'Leftovers', ['scald', 'icebeam', 'recover', 'protect'], 'bulkyspecial'],
			['Rhyperior', 'Solid Rock', 'Assault Vest', ['highhorsepower', 'rockslide', 'icepunch', 'megahorn'], 'bulkyphysical'],
			['Heatran', 'Flash Fire', 'Firium Z', ['heatwave', 'earthpower', 'flashcannon', 'protect'], 'special'],
		],
	},
	acepivot: {
		hint: '大嘴鸥与刺龙王首发建立雨天、顺风和悠游自如输出；巨钳螳螂借雨减轻火系压力，并以子弹拳补刀。',
		team: [
			['Pelipper', 'Drizzle', 'Damp Rock', ['scald', 'hurricane', 'tailwind', 'protect'], 'bulkyspecial'],
			['Kingdra', 'Swift Swim', 'Life Orb', ['muddywater', 'dracometeor', 'icebeam', 'protect'], 'special'],
			['Scizor', 'Technician', 'Sitrus Berry', ['bulletpunch', 'bugbite', 'swordsdance', 'protect'], 'bulkyphysical'],
		],
	},
	rangercircuit: {
		hint: '巨蔓藤以愤怒粉掩护伙伴，风速狗用威吓和大声咆哮降低双攻；水伊布可帮助队友集火。草系及防尘伙伴不受愤怒粉影响。',
		team: [
			['Tangrowth', 'Regenerator', 'Rocky Helmet', ['ragepowder', 'gigadrain', 'sleeppowder', 'protect'], 'wall'],
			['Arcanine', 'Intimidate', 'Sitrus Berry', ['flamethrower', 'snarl', 'willowisp', 'protect'], 'bulkyspecial'],
			['Vaporeon', 'Water Absorb', 'Leftovers', ['scald', 'icebeam', 'helpinghand', 'protect'], 'bulkyspecial'],
		],
	},
	ruinssurvey: {
		hint: '河马兽开沙暴，龙头地鼠借拨沙抢攻；摇篮百合引水保护怕水的伙伴，长毛狗接续高速物攻。',
		team: [
			['Hippowdon', 'Sand Stream', 'Smooth Rock', ['highhorsepower', 'yawn', 'slackoff', 'protect'], 'bulkyphysical'],
			['Excadrill', 'Sand Rush', 'Life Orb', ['highhorsepower', 'ironhead', 'rockslide', 'protect'], 'physical'],
			['Cradily', 'Storm Drain', 'Leftovers', ['gigadrain', 'ancientpower', 'earthpower', 'protect'], 'bulkyspecial'],
			['Stoutland', 'Sand Rush', 'Silk Scarf', ['return', 'crunch', 'icefang', 'protect'], 'physical'],
		],
	},
	clubroom: {
		hint: '青铜钟开戏法空间，修建老匠直接施压并用广域防守掩护；人造细胞卵可续开空间，骑士蜗牛承担慢速爆发。',
		team: [
			['Bronzong', 'Levitate', 'Mental Herb', ['trickroom', 'gyroball', 'hypnosis', 'protect'], 'slowphysical'],
			['Conkeldurr', 'Guts', 'Flame Orb', ['drainpunch', 'machpunch', 'knockoff', 'wideguard'], 'slowphysical'],
			['Reuniclus', 'Magic Guard', 'Life Orb', ['trickroom', 'psychic', 'focusblast', 'protect'], 'slowspecial'],
			['Escavalier', 'Overcoat', 'Assault Vest', ['megahorn', 'ironhead', 'knockoff', 'drillrun'], 'slowphysical'],
		],
	},
	victoryroad: {
		hint: '姆克鹰以威吓和顺风带动烈咬陆鲨；地震可与飞行伙伴配合，其他伙伴在场时要留意误伤与守住。',
		team: [
			['Staraptor', 'Intimidate', 'Sitrus Berry', ['bravebird', 'closecombat', 'tailwind', 'protect'], 'physical'],
			['Garchomp', 'Rough Skin', 'Clear Amulet', ['earthquake', 'dragonclaw', 'rockslide', 'protect'], 'physical'],
			['Magnezone', 'Sturdy', 'Assault Vest', ['thunderbolt', 'electroweb', 'flashcannon', 'bodypress'], 'bulkyspecial'],
			['Starmie', 'Natural Cure', 'Life Orb', ['scald', 'icebeam', 'thunderbolt', 'protect'], 'special'],
			['Mamoswine', 'Thick Fat', 'Never-Melt Ice', ['highhorsepower', 'iciclecrash', 'iceshard', 'protect'], 'physical'],
		],
	},
	schoolfinal: {
		hint: '小猫怪以威吓和电磁波帮助泳圈鼬进攻，拉鲁拉丝用帮助与反射壁支援。先认识控速和集火，比盲目强化更重要。',
		team: [
			['Shinx', 'Intimidate', 'Oran Berry', ['spark', 'bite', 'thunderwave', 'protect'], 'bulkyphysical'],
			['Buizel', 'Swift Swim', 'Oran Berry', ['aquajet', 'waterfall', 'icepunch', 'protect'], 'physical'],
			['Ralts', 'Trace', 'Oran Berry', ['confusion', 'drainingkiss', 'helpinghand', 'reflect'], 'bulkyspecial'],
		],
	},
	dojofoundation: {
		hint: '玛沙那可用击掌奇袭替腕力争取出手机会；两只都能守住，但连续一起防守无法赢下对局。',
		team: [
			['Meditite', 'Pure Power', 'Oran Berry', ['fakeout', 'forcepalm', 'icepunch', 'protect'], 'physical'],
			['Machop', 'No Guard', 'Oran Berry', ['karatechop', 'rocktomb', 'knockoff', 'protect'], 'bulkyphysical'],
		],
	},
	capetide: {
		hint: '大嘴鸥降雨，莲帽小童以击掌奇袭与悠游自如配合；灯笼鱼的吸收电力可接电系招式，并用电磁波辅助。',
		team: [
			['Pelipper', 'Drizzle', 'Damp Rock', ['waterpulse', 'airslash', 'tailwind', 'protect'], 'bulkyspecial'],
			['Lombre', 'Swift Swim', 'Sitrus Berry', ['fakeout', 'gigadrain', 'scald', 'protect'], 'special'],
			['Chinchou', 'Volt Absorb', 'Eviolite', ['thunder', 'waterpulse', 'thunderwave', 'protect'], 'bulkyspecial'],
		],
	},
	greenhousesun: {
		hint: '六尾的日照加快妙蛙草；催眠粉与叶绿素进攻形成双重压力，火箭雀的顺风为晴天结束后留出接力。',
		team: [
			['Vulpix', 'Drought', 'Heat Rock', ['heatwave', 'willowisp', 'extrasensory', 'protect'], 'special'],
			['Ivysaur', 'Chlorophyll', 'Eviolite', ['gigadrain', 'sludgebomb', 'sleeppowder', 'protect'], 'special'],
			['Fletchinder', 'Gale Wings', 'Sitrus Berry', ['acrobatics', 'flamecharge', 'tailwind', 'protect'], 'physical'],
		],
	},
	quarryrelay: {
		hint: '地幔岩的广域防守掩护镰刀盔，二者以岩崩施压；大岩蛇通过岩石封锁控速，避免只撒钉而丢失进攻节奏。',
		team: [
			['Boldore', 'Sturdy', 'Eviolite', ['wideguard', 'rockslide', 'bodypress', 'protect'], 'wall'],
			['Kabutops', 'Weak Armor', 'Sitrus Berry', ['rockslide', 'waterfall', 'aquajet', 'protect'], 'physical'],
			['Onix', 'Sturdy', 'Eviolite', ['rocktomb', 'highhorsepower', 'bodypress', 'protect'], 'wall'],
		],
	},
	snowveil: {
		hint: '阿罗拉九尾开雪与极光幕，阿罗拉穿山王借拨雪进攻；象牙猪用冰砾收尾，地面招式选择不误伤队友的单体攻击。',
		team: [
			['Ninetales-Alola', 'Snow Warning', 'Light Clay', ['auroraveil', 'blizzard', 'moonblast', 'protect'], 'screens'],
			['Sandslash-Alola', 'Slush Rush', 'Life Orb', ['iciclecrash', 'ironhead', 'drillrun', 'protect'], 'physical'],
			['Mamoswine', 'Thick Fat', 'Sitrus Berry', ['highhorsepower', 'iciclecrash', 'iceshard', 'protect'], 'bulkyphysical'],
		],
	},
	auraguard: {
		hint: '叉字蝠顺风配合超级路卡利欧；巨金怪和圈圈熊接续物理输出。击掌奇袭难以阻止精神力首发，需选择其他突破方式。',
		team: [
			['Crobat', 'Inner Focus', 'Covert Cloak', ['tailwind', 'bravebird', 'taunt', 'protect'], 'screens'],
			['Lucario', 'Inner Focus', 'Lucarionite', ['aurasphere', 'flashcannon', 'vacuumwave', 'protect'], 'special'],
			['Metagross', 'Clear Body', 'Assault Vest',
				['meteormash', 'zenheadbutt', 'stompingtantrum', 'bulletpunch'], 'bulkyphysical'],
			['Ursaring', 'Guts', 'Flame Orb', ['facade', 'closecombat', 'crunch', 'protect'], 'bulkyphysical'],
		],
	},
	dragonenvoy: {
		hint: '赤面龙大蛇瞪眼配合七夕青鸟的顺风；物攻与特攻龙系伙伴轮换补盲，超级七夕青鸟的巨声能同时打击两名对手。',
		team: [
			['Druddigon', 'Rough Skin', 'Rocky Helmet', ['glare', 'dragonclaw', 'gunkshot', 'protect'], 'bulkyphysical'],
			['Altaria', 'Natural Cure', 'Altarianite', ['tailwind', 'hypervoice', 'flamethrower', 'protect'], 'bulkyspecial'],
			['Dragalge', 'Adaptability', 'Assault Vest', ['dracometeor', 'sludgebomb', 'hydropump', 'thunderbolt'], 'bulkyspecial'],
			['Kingdra', 'Sniper', 'Scope Lens', ['focusenergy', 'dracometeor', 'muddywater', 'protect'], 'special'],
			['Haxorus', 'Mold Breaker', 'Lum Berry', ['dragonclaw', 'closecombat', 'poisonjab', 'protect'], 'physical'],
		],
	},
	castletrial: {
		hint: '钢铠鸦顺风掩护坚盾剑怪的输出；伽勒尔双弹瓦斯开薄雾场地，洗衣机与沙奈朵补足特攻及速度压制。',
		team: [
			['Corviknight', 'Mirror Armor', 'Rocky Helmet',
				['tailwind', 'bravebird', 'bodypress', 'roost'], 'bulkyphysical'],
			['Aegislash', 'Stance Change', 'Weakness Policy',
				['kingsshield', 'shadowball', 'flashcannon', 'wideguard'], 'slowspecial'],
			['Weezing-Galar', 'Misty Surge', 'Black Sludge', ['strangesteam', 'flamethrower', 'taunt', 'protect'], 'bulkyspecial'],
			['Rotom-Wash', 'Levitate', 'Leftovers', ['hydropump', 'thunderbolt', 'electroweb', 'protect'], 'bulkyspecial'],
			['Gardevoir', 'Trace', 'Choice Scarf', ['moonblast', 'psychic', 'mysticalfire', 'dazzlinggleam'], 'special'],
		],
	},
	championexam: {
		hint: '超级大比鸟借顺风与热风施压，风速狗威吓掩护；后备兼具高速特攻、威吓轮换和重型物攻。',
		team: [
			['Arcanine', 'Intimidate', 'Sitrus Berry', ['flareblitz', 'snarl', 'extremespeed', 'protect'], 'bulkyphysical'],
			['Pidgeot', 'Keen Eye', 'Pidgeotite', ['hurricane', 'heatwave', 'tailwind', 'protect'], 'special'],
			['Gyarados', 'Intimidate', 'Lum Berry', ['waterfall', 'icefang', 'thunderwave', 'protect'], 'bulkyphysical'],
			['Alakazam', 'Magic Guard', 'Focus Sash', ['psychic', 'focusblast', 'shadowball', 'protect'], 'special'],
			['Exeggutor', 'Harvest', 'Sitrus Berry', ['gigadrain', 'psychic', 'sleeppowder', 'protect'], 'bulkyspecial'],
			['Rhyperior', 'Solid Rock', 'Assault Vest', ['highhorsepower', 'rockslide', 'icepunch', 'megahorn'], 'bulkyphysical'],
		],
	},
	starmaster: {
		hint: '师父鼬以击掌奇袭掩护艾路雷朵控速；修建老匠的广域防守与路卡利欧的神速提供不同的破局手段。',
		team: [
			['Mienshao', 'Regenerator', 'Focus Sash', ['fakeout', 'closecombat', 'wideguard', 'uturn'], 'physical'],
			['Gallade', 'Sharpness', 'Sitrus Berry', ['sacredsword', 'psychocut', 'thunderwave', 'protect'], 'bulkyphysical'],
			['Conkeldurr', 'Guts', 'Flame Orb', ['drainpunch', 'machpunch', 'knockoff', 'wideguard'], 'slowphysical'],
			['Lucario', 'Inner Focus', 'Life Orb', ['closecombat', 'meteormash', 'extremespeed', 'protect'], 'physical'],
		],
	},
	battlemetro: {
		hint: '电蜘蛛的电网为幻想龙头地鼠制造输出窗口；麻麻鳗鱼王浮游抵御地面招式，岩殿居蟹以广域防守保护后备。',
		team: [
			['Galvantula', 'Compound Eyes', 'Focus Sash', ['electroweb', 'thunder', 'bugbuzz', 'protect'], 'special'],
			['Excadrill-Fantasy', 'Mold Breaker', 'Steelium Z', ['highhorsepower', 'ironhead', 'rockslide', 'protect'], 'physical'],
			['Eelektross', 'Levitate', 'Assault Vest', ['thunderbolt', 'flamethrower', 'gigadrain', 'knockoff'], 'bulkyspecial'],
			['Chandelure', 'Flash Fire', 'Life Orb', ['heatwave', 'shadowball', 'energyball', 'protect'], 'special'],
			['Crustle', 'Sturdy', 'Sitrus Berry', ['wideguard', 'rockslide', 'xscissor', 'stompingtantrum'], 'bulkyphysical'],
			['Haxorus', 'Mold Breaker', 'Lum Berry', ['dragonclaw', 'closecombat', 'poisonjab', 'protect'], 'physical'],
		],
	},
	korrinafullpower: {
		hint: '师父鼬的击掌奇袭掩护超级路卡利欧；摔角鹰人用顺风接力，呆壳兽以电磁波和特攻覆盖物理队伍的弱点。',
		team: [
			['Mienshao', 'Regenerator', 'Focus Sash', ['fakeout', 'closecombat', 'wideguard', 'uturn'], 'physical'],
			['Lucario', 'Inner Focus', 'Lucarionite', ['closecombat', 'meteormash', 'bulletpunch', 'protect'], 'physical'],
			['Hawlucha', 'Unburden', 'Power Herb', ['skyattack', 'acrobatics', 'closecombat', 'tailwind'], 'physical'],
			['Slowbro', 'Regenerator', 'Rocky Helmet', ['scald', 'psychic', 'thunderwave', 'protect'], 'bulkyspecial'],
		],
	},
	nessafullpower: {
		hint: '蚊香蛙皇降雨并以帮助支援戽斗尖梭；坚果哑铃抵御水电攻击，暴鲤龙威吓轮换，暴噬龟接力雨天攻势。',
		team: [
			['Politoed', 'Drizzle', 'Damp Rock', ['scald', 'icywind', 'helpinghand', 'protect'], 'wall'],
			['Barraskewda', 'Swift Swim', 'Choice Band', ['liquidation', 'closecombat', 'psychicfangs', 'flipturn'], 'physical'],
			['Ferrothorn', 'Iron Barbs', 'Leftovers', ['powerwhip', 'gyroball', 'leechseed', 'protect'], 'slowphysical'],
			['Gyarados', 'Intimidate', 'Gyaradosite', ['waterfall', 'crunch', 'dragondance', 'protect'], 'physical'],
			['Drednaw', 'Swift Swim', 'Rockium Z', ['liquidation', 'rockslide', 'highhorsepower', 'protect'], 'physical'],
		],
	},
	stevenfullpower: {
		hint: '盔甲鸟顺风配合超级幻想巨金怪；摇篮百合引水、念力土偶开墙、化石翼龙广域防守，分别应对水攻、集火和范围招式。',
		team: [
			['Skarmory', 'Sturdy', 'Rocky Helmet', ['tailwind', 'bravebird', 'bodypress', 'roost'], 'wall'],
			['Metagross-Fantasy', 'Clear Body', 'Metagrossite',
				['meteormash', 'zenheadbutt', 'stompingtantrum', 'protect'], 'physical'],
			['Cradily', 'Storm Drain', 'Leftovers', ['gigadrain', 'earthpower', 'recover', 'protect'], 'bulkyspecial'],
			['Claydol', 'Levitate', 'Light Clay', ['earthpower', 'psychic', 'reflect', 'lightscreen'], 'screens'],
			['Aerodactyl', 'Unnerve', 'Rockium Z', ['rockslide', 'wideguard', 'taunt', 'protect'], 'physical'],
		],
	},
	dianthafullpower: {
		hint: '摔角鹰人用顺风与物攻掩护超级沙奈朵的巨声；南瓜怪人削弱物攻，黏美龙和怪颚龙承担不同方向的后备输出。',
		team: [
			['Hawlucha', 'Unburden', 'Power Herb', ['tailwind', 'skyattack', 'acrobatics', 'closecombat'], 'physical'],
			['Gardevoir', 'Trace', 'Gardevoirite', ['hypervoice', 'psyshock', 'mysticalfire', 'protect'], 'special'],
			['Goodra', 'Sap Sipper', 'Assault Vest', ['dracometeor', 'flamethrower', 'sludgebomb', 'thunderbolt'], 'bulkyspecial'],
			['Gourgeist-Super', 'Frisk', 'Sitrus Berry', ['willowisp', 'poltergeist', 'seedbomb', 'protect'], 'bulkyphysical'],
			['Tyrantrum', 'Rock Head', 'Choice Scarf', ['headsmash', 'dragonclaw', 'rockslide', 'closecombat'], 'physical'],
		],
	},
	cynthiafullpower: {
		hint: '波克基斯以看我嘛与顺风掩护超级幻想烈咬陆鲨，飞行属性也能避开地震；后备兼有催眠、烧伤和冰冻之风控速。',
		team: [
			['Togekiss', 'Serene Grace', 'Sitrus Berry', ['followme', 'tailwind', 'airslash', 'protect'], 'screens'],
			['Garchomp-Fantasy', 'Rough Skin', 'Garchompite', ['earthquake', 'dragonclaw', 'rockslide', 'protect'], 'physical'],
			['Spiritomb', 'Infiltrator', 'Leftovers', ['willowisp', 'foulplay', 'snarl', 'protect'], 'wall'],
			['Roserade', 'Natural Cure', 'Focus Sash', ['sleeppowder', 'leafstorm', 'sludgebomb', 'protect'], 'special'],
			['Milotic-Fantasy', 'Marvel Scale', 'Flame Orb', ['scald', 'icywind', 'recover', 'protect'], 'wall'],
			['Lucario', 'Inner Focus', 'Fightinium Z', ['closecombat', 'meteormash', 'extremespeed', 'protect'], 'physical'],
		],
	},
	leonfullpower: {
		hint: '轰擂金刚猩用击掌奇袭掩护超级喷火龙Y的晴天热风；多龙巴鲁托接续高速特攻，坚盾剑怪保护全队免受范围攻击。',
		team: [
			['Rillaboom', 'Grassy Surge', 'Assault Vest', ['fakeout', 'grassyglide', 'woodhammer', 'uturn'], 'bulkyphysical'],
			['Charizard', 'Blaze', 'Charizardite Y', ['heatwave', 'solarbeam', 'tailwind', 'protect'], 'special'],
			['Dragapult', 'Infiltrator', 'Choice Specs', ['shadowball', 'dracometeor', 'flamethrower', 'thunderbolt'], 'special'],
			['Aegislash', 'Stance Change', 'Leftovers', ['kingsshield', 'shadowball', 'flashcannon', 'wideguard'], 'slowspecial'],
			['Seismitoad', 'Water Absorb', 'Rocky Helmet', ['earthpower', 'scald', 'sludgebomb', 'protect'], 'bulkyspecial'],
			['Haxorus', 'Mold Breaker', 'Dragonium Z', ['dragonclaw', 'closecombat', 'poisonjab', 'protect'], 'physical'],
		],
	},
};
