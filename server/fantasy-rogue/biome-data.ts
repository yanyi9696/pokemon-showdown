/** User-authored 14-region distribution, DOCX received 2026-10-06. See FANTASY-ROGUE-IMPLEMENTATION.md. */
export interface RogueBiomeSlot { weight: number; species: string[] }
export interface RogueBiome { id: string; name: string; weight: number; tiers: RogueBiomeSlot[][] }

export const RogueBiomes: RogueBiome[] = [
	{ id: 'biome01', name: '绿茵森林', weight: 4, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Caterpie'] }, // 绿毛虫
			{ weight: 6, species: ['Weedle'] }, // 独角虫
			{ weight: 6, species: ['Wurmple'] }, // 刺尾虫
			{ weight: 6, species: ['Oddish'] }, // 走路草
			{ weight: 6, species: ['Bellsprout'] }, // 喇叭芽
			{ weight: 6, species: ['Sewaddle'] }, // 虫宝包
			{ weight: 6, species: ['Grubbin'] }, // 强颚鸡母虫
			{ weight: 6, species: ['Burmy'] }, // 结草儿
			{ weight: 6, species: ['Kricketot'] }, // 园法师
			{ weight: 6, species: ['Rookidee'] }, // 稚山雀
			{ weight: 6, species: ['Pidgey'] }, // 波波
			{ weight: 6, species: ['Starly'] }, // 姆克儿
			{ weight: 4, species: ['Chespin'] }, // 哈力栗
			{ weight: 4, species: ['Turtwig'] }, // 草苗龟
			{ weight: 4, species: ['Venipede'] }, // 百足蜈蚣
			{ weight: 4, species: ['Shroomish'] }, // 蘑蘑菇
			{ weight: 4, species: ['Lotad'] }, // 莲叶童子
			{ weight: 4, species: ['Budew'] }, // 含羞苞
			{ weight: 2, species: ['Sprigatito'] }, // 新叶喵
			{ weight: 2, species: ['Rowlet'] }, // 木木枭
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Weepinbell'] }, // 口呆花
			{ weight: 6, species: ['Charjabug'] }, // 虫电宝
			{ weight: 6, species: ['Corvisquire'] }, // 蓝鸦
			{ weight: 6, species: ['Pidgeotto'] }, // 比比鸟
			{ weight: 6, species: ['Staravia'] }, // 姆克鸟
			{ weight: 6, species: ['Venipede'] }, // 百足蜈蚣
			{ weight: 6, species: ['Shroomish'] }, // 蘑蘑菇
			{ weight: 6, species: ['Bounsweet'] }, // 甜竹竹
			{ weight: 6, species: ['Foongus'] }, // 宝贝球菇
			{ weight: 6, species: ['Applin'] }, // 啃果虫
			{ weight: 6, species: ['Nuzleaf'] }, // 长鼻叶
			{ weight: 6, species: ['Lombre'] }, // 莲帽小童
			{ weight: 4, species: ['Bayleef'] }, // 月桂叶
			{ weight: 4, species: ['Ferroseed'] }, // 种子铁球
			{ weight: 4, species: ['Carnivine'] }, // 尖牙笼
			{ weight: 4, species: ['Pinsir'] }, // 凯罗斯
			{ weight: 4, species: ['Scyther'] }, // 飞天螳螂
			{ weight: 4, species: ['Heracross'] }, // 赫拉克罗斯
			{ weight: 2, species: ['Ivysaur'] }, // 妙蛙草
			{ weight: 2, species: ['Grovyle'] }, // 森林蜥蜴
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Victreebel'] }, // 大食花
			{ weight: 6, species: ['Scolipede'] }, // 蜈蚣王
			{ weight: 6, species: ['Breloom'] }, // 斗笠菇
			{ weight: 6, species: ['Tsareena'] }, // 甜冷美后
			{ weight: 6, species: ['Amoonguss'] }, // 败露球菇
			{ weight: 6, species: ['Ferrothorn'] }, // 坚果哑铃
			{ weight: 6, species: ['Carnivine'] }, // 尖牙笼
			{ weight: 6, species: ['Pinsir'] }, // 凯罗斯
			{ weight: 6, species: ['Scyther'] }, // 飞天螳螂
			{ weight: 6, species: ['Heracross'] }, // 赫拉克罗斯
			{ weight: 6, species: ['Orbeetle'] }, // 以欧路普
			{ weight: 6, species: ['Tropius'] }, // 热带龙
			{ weight: 4, species: ['Escavalier'] }, // 骑士蜗牛
			{ weight: 4, species: ['Accelgor'] }, // 敏捷虫
			{ weight: 4, species: ['Durant'] }, // 铁蚁
			{ weight: 4, species: ['Larvesta'] }, // 燃烧虫
			{ weight: 4, species: ['Scizor'] }, // 巨钳螳螂
			{ weight: 4, species: ['Roserade'] }, // 罗丝雷朵
			{ weight: 2, species: ['Serperior'] }, // 君主蛇
			{ weight: 2, species: ['Rillaboom'] }, // 轰擂金刚猩
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Scolipede'] }, // 蜈蚣王
			{ weight: 6, species: ['Amoonguss'] }, // 败露球菇
			{ weight: 6, species: ['Ferrothorn'] }, // 坚果哑铃
			{ weight: 6, species: ['Carnivine'] }, // 尖牙笼
			{ weight: 6, species: ['Pinsir'] }, // 凯罗斯
			{ weight: 6, species: ['Heracross'] }, // 赫拉克罗斯
			{ weight: 6, species: ['Drapion'] }, // 龙王蝎
			{ weight: 6, species: ['Tropius'] }, // 热带龙
			{ weight: 6, species: ['Escavalier'] }, // 骑士蜗牛
			{ weight: 6, species: ['Accelgor'] }, // 敏捷虫
			{ weight: 6, species: ['Gourgeist'] }, // 南瓜怪人
			{ weight: 6, species: ['Trevenant'] }, // 朽木妖
			{ weight: 4, species: ['Durant'] }, // 铁蚁
			{ weight: 4, species: ['Volcarona'] }, // 火神蛾
			{ weight: 4, species: ['Scizor'] }, // 巨钳螳螂
			{ weight: 4, species: ['Golisopod'] }, // 具甲武者
			{ weight: 4, species: ['Roserade'] }, // 罗丝雷朵
			{ weight: 4, species: ['Hydrapple'] }, // 密集大蛇
			{ weight: 2, species: ['Pheromosa'] }, // 费洛美螂 (2.0%, 究极异兽)
			{ weight: 2, species: ['Buzzwole'] }, // 爆肌蚊 (2.0%, 究极异兽)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Scolipede'] }, // 蜈蚣王
			{ weight: 6, species: ['Amoonguss'] }, // 败露球菇
			{ weight: 6, species: ['Ferrothorn'] }, // 坚果哑铃
			{ weight: 6, species: ['Pinsir'] }, // 凯罗斯
			{ weight: 6, species: ['Heracross'] }, // 赫拉克罗斯
			{ weight: 6, species: ['Drapion'] }, // 龙王蝎
			{ weight: 6, species: ['Durant'] }, // 铁蚁
			{ weight: 6, species: ['Scizor'] }, // 巨钳螳螂
			{ weight: 6, species: ['Golisopod'] }, // 具甲武者
			{ weight: 6, species: ['Roserade'] }, // 罗丝雷朵
			{ weight: 6, species: ['Volcarona'] }, // 火神蛾
			{ weight: 6, species: ['Hydrapple'] }, // 密集大蛇
			{ weight: 4, species: ['Celebi'] }, // 时拉比 (4.0%, 幻兽)
			{ weight: 4, species: ['Kartana'] }, // 纸御剑 (4.0%, 究极异兽)
			{ weight: 4, species: ['Zarude'] }, // 萨戮德 (4.0%, 幻兽)
			{ weight: 4, species: ['Brute Bonnet'] }, // 猛恶菇 (4.0%, 古代悖谬)
			{ weight: 4, species: ['Slither Wing'] }, // 爬地翅 (4.0%, 古代悖谬)
			{ weight: 4, species: ['Ogerpon'] }, // 厄鬼椪 (碧草面具)(4.0%, 二级神)
			{ weight: 2, species: ['Wo-Chien'] }, // 古简蜗 (2.0%, 二级神)
			{ weight: 2, species: ['Tapu Bulu'] }, // 卡璞・哞哞 (2.0%, 二级神)
		],
	] },
	{ id: 'biome02', name: '轻风海岸', weight: 4, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Magikarp'] }, // 鲤鱼王
			{ weight: 6, species: ['Tentacool'] }, // 玛瑙水母
			{ weight: 6, species: ['Wingull'] }, // 长翅鸥
			{ weight: 6, species: ['Wooper'] }, // 乌波
			{ weight: 6, species: ['Ducklett'] }, // 鸭宝宝
			{ weight: 6, species: ['Goldeen'] }, // 角金鱼
			{ weight: 6, species: ['Staryu'] }, // 海星星
			{ weight: 6, species: ['Wiglett'] }, // 海地鼠
			{ weight: 6, species: ['Buizel'] }, // 泳圈鼬
			{ weight: 6, species: ['Finneon'] }, // 荧光鱼
			{ weight: 6, species: ['Krabby'] }, // 大钳蟹
			{ weight: 6, species: ['Corsola'] }, // 太阳珊瑚
			{ weight: 4, species: ['Totodile'] }, // 小锯鳄
			{ weight: 4, species: ['Sobble'] }, // 泪眼蜥
			{ weight: 4, species: ['Horsea'] }, // 墨海马
			{ weight: 4, species: ['Shellos'] }, // 无壳海兔
			{ weight: 4, species: ['Corphish'] }, // 龙虾小兵
			{ weight: 4, species: ['Feebas'] }, // 丑丑鱼
			{ weight: 2, species: ['Popplio'] }, // 球球海狮
			{ weight: 2, species: ['Quaxly'] }, // 润水鸭
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Gyarados'] }, // 暴鲤龙
			{ weight: 6, species: ['Tentacool'] }, // 玛瑙水母
			{ weight: 6, species: ['Wingull'] }, // 长翅鸥
			{ weight: 6, species: ['Quagsire'] }, // 沼王
			{ weight: 6, species: ['Arrokuda'] }, // 刺梭鱼
			{ weight: 6, species: ['Slowpoke'] }, // 呆呆兽
			{ weight: 6, species: ['Carvanha'] }, // 利牙鱼
			{ weight: 6, species: ['Clauncher'] }, // 铁臂枪虾
			{ weight: 6, species: ['Binacle'] }, // 龟脚脚
			{ weight: 6, species: ['Shellder'] }, // 大舌贝
			{ weight: 6, species: ['Chinchou'] }, // 灯笼鱼
			{ weight: 6, species: ['Huntail', 'Gorebyss'] }, // 猎斑鱼/樱花鱼
			{ weight: 4, species: ['Wartortle'] }, // 卡咪龟
			{ weight: 4, species: ['Chewtle'] }, // 咬咬龟
			{ weight: 4, species: ['Feebas'] }, // 丑丑鱼
			{ weight: 4, species: ['Mareanie'] }, // 好坏星
			{ weight: 4, species: ['Cramorant'] }, // 古月鸟
			{ weight: 4, species: ['Azumarill'] }, // 玛力露丽
			{ weight: 2, species: ['Frogadier'] }, // 呱头蛙
			{ weight: 2, species: ['Dewott'] }, // 双刃丸
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Gyarados'] }, // 暴鲤龙
			{ weight: 6, species: ['Tentacruel'] }, // 毒刺水母
			{ weight: 6, species: ['Pelipper'] }, // 大嘴鸥
			{ weight: 6, species: ['Gastrodon'] }, // 海兔兽
			{ weight: 6, species: ['Slowbro'] }, // 呆壳兽
			{ weight: 6, species: ['Sharpedo'] }, // 巨牙鲨
			{ weight: 6, species: ['Starmie'] }, // 宝石海星
			{ weight: 6, species: ['Jellicent'] }, // 胖嘟嘟
			{ weight: 6, species: ['Poliwrath'] }, // 蚊香泳士
			{ weight: 6, species: ['Drednaw'] }, // 暴噬龟
			{ weight: 6, species: ['Mantine'] }, // 巨翅飞鱼
			{ weight: 6, species: ['Octillery'] }, // 章鱼桶
			{ weight: 4, species: ['Kingdra'] }, // 刺龙王
			{ weight: 4, species: ['Milotic'] }, // 美纳斯
			{ weight: 4, species: ['Toxapex'] }, // 超坏星
			{ weight: 4, species: ['Slowking'] }, // 呆呆王
			{ weight: 4, species: ['Lapras'] }, // 拉普拉斯
			{ weight: 4, species: ['Palafin-Hero'] }, // 海豚侠(全能形态)
			{ weight: 2, species: ['Empoleon'] }, // 帝王拿波
			{ weight: 2, species: ['Swampert'] }, // 巨沼怪
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Gyarados'] }, // 暴鲤龙
			{ weight: 6, species: ['Cloyster'] }, // 刺甲贝
			{ weight: 6, species: ['Kingdra'] }, // 刺龙王
			{ weight: 6, species: ['Milotic'] }, // 美纳斯
			{ weight: 6, species: ['Toxapex'] }, // 超坏星
			{ weight: 6, species: ['Lapras'] }, // 拉普拉斯
			{ weight: 6, species: ['Luvdisc'] }, // 爱心鱼
			{ weight: 6, species: ['Alomomola'] }, // 保姆曼波
			{ weight: 6, species: ['Bruxish'] }, // 磨牙彩皮鱼
			{ weight: 6, species: ['Crawdaunt'] }, // 铁螯龙虾
			{ weight: 6, species: ['Wailord'] }, // 吼鲸王
			{ weight: 6, species: ['Dondozo'] }, // 吃吼霸
			{ weight: 4, species: ['Dragalge'] }, // 毒藻龙
			{ weight: 4, species: ['Tatsugiri'] }, // 米粒龙
			{ weight: 4, species: ['Dracovish'] }, // 鳃鱼龙
			{ weight: 4, species: ['Arctovish'] }, // 鳃鱼海兽
			{ weight: 4, species: ['Wishiwashi-School'] }, // 弱丁鱼(鱼群)
			{ weight: 4, species: ['Palafin-Hero'] }, // 海豚侠(全能形态)
			{ weight: 2, species: ['Urshifu-Rapid-Strike'] }, // 武道熊师(连击流) (4.0%, 二级神)
			{ weight: 2, species: ['Manaphy'] }, // 玛纳霏 (2.0%, 幻兽)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Gyarados'] }, // 暴鲤龙
			{ weight: 6, species: ['Milotic'] }, // 美纳斯
			{ weight: 6, species: ['Toxapex'] }, // 超坏星
			{ weight: 6, species: ['Dondozo'] }, // 吃吼霸
			{ weight: 6, species: ['Basculegion'] }, // 幽尾玄鱼
			{ weight: 6, species: ['Dragalge'] }, // 毒藻龙
			{ weight: 6, species: ['Tatsugiri'] }, // 米粒龙
			{ weight: 6, species: ['Dracovish'] }, // 鳃鱼龙
			{ weight: 6, species: ['Arctovish'] }, // 鳃鱼海兽
			{ weight: 6, species: ['Wishiwashi-School'] }, // 弱丁鱼(鱼群)
			{ weight: 6, species: ['Palafin-Hero'] }, // 海豚侠(全能形态))
			{ weight: 6, species: ['Pyukumuku'] }, // 拳海参
			{ weight: 4, species: ['Suicune'] }, // 水君 (4.0%, 二级神)
			{ weight: 4, species: ['Tornadus'] }, // 龙卷云(4.0%, 二级神)
			{ weight: 4, species: ['Thundurus'] }, // 雷电云(4.0%, 二级神)
			{ weight: 4, species: ['Keldeo'] }, // 凯路迪欧 (4.0%, 幻兽)
			{ weight: 4, species: ['Ogerpon-Wellspring'] }, // 厄鬼椪 (水井面具)(4.0%, 二级神)
			{ weight: 4, species: ['Volcanion'] }, // 波尔凯尼恩 (4.0%, 幻兽)
			{ weight: 2, species: ['Tapu Fini'] }, // 卡璞・鳍鳍 (2.0%, 二级神)
			{ weight: 2, species: ['Walking Wake'] }, // 波荡水(2.0%, 二级神)
		],
	] },
	{ id: 'biome03', name: '攀岩峡谷', weight: 4, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Geodude', 'Geodude-Alola'] }, // 小拳石/阿罗拉小拳石
			{ weight: 6, species: ['Drilbur'] }, // 螺钉地鼠
			{ weight: 6, species: ['Machop'] }, // 腕力
			{ weight: 6, species: ['Onix'] }, // 大岩蛇
			{ weight: 6, species: ['Sandile'] }, // 黑眼鳄
			{ weight: 6, species: ['Dwebble'] }, // 石居蟹
			{ weight: 6, species: ['Rockruff'] }, // 岩狗狗
			{ weight: 6, species: ['Phanpy'] }, // 小小象
			{ weight: 6, species: ['Makuhita'] }, // 幕下力士
			{ weight: 6, species: ['Tyrogue'] }, // 无畏小子
			{ weight: 6, species: ['Bonsly'] }, // 盆才怪
			{ weight: 6, species: ['Diglett', 'Diglett-Alola'] }, // 地鼠/阿罗拉地鼠
			{ weight: 4, species: ['Mankey'] }, // 猴怪
			{ weight: 4, species: ['Nacli'] }, // 盐石宝
			{ weight: 4, species: ['Aron'] }, // 可可多拉
			{ weight: 4, species: ['Nincada'] }, // 土居忍士
			{ weight: 4, species: ['Timburr'] }, // 搬运小匠
			{ weight: 4, species: ['Shuckle'] }, // 壶壶
			{ weight: 2, species: ['Riolu'] }, // 利欧路
			{ weight: 2, species: ['Charcadet'] }, // 炭小侍
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Geodude', 'Geodude-Alola'] }, // 小拳石/阿罗拉小拳石
			{ weight: 6, species: ['Drilbur'] }, // 螺钉地鼠
			{ weight: 6, species: ['Machop'] }, // 腕力
			{ weight: 6, species: ['Onix'] }, // 大岩蛇
			{ weight: 6, species: ['Nacli'] }, // 盐石宝
			{ weight: 6, species: ['Aron'] }, // 可可多拉
			{ weight: 6, species: ['Hippopotas'] }, // 沙河马
			{ weight: 6, species: ['Cubone'] }, // 卡拉卡拉
			{ weight: 6, species: ['Rufflet'] }, // 毛头小鹰
			{ weight: 6, species: ['Klawf'] }, // 毛崖蟹
			{ weight: 6, species: ['Solrock'] }, // 太阳岩
			{ weight: 6, species: ['Lunatone'] }, // 月亮岩
			{ weight: 4, species: ['Gligar'] }, // 天蝎
			{ weight: 4, species: ['Growlithe-Hisui'] }, // 洗翠卡蒂狗
			{ weight: 4, species: ['Glimmet'] }, // 晶光芽
			{ weight: 4, species: ['Rhyhorn'] }, // 独角犀牛
			{ weight: 4, species: ['Silicobra'] }, // 沙包蛇
			{ weight: 4, species: ['Trapinch'] }, // 大颚蚁
			{ weight: 2, species: ['Larvitar'] }, // 幼基拉斯
			{ weight: 2, species: ['Gible'] }, // 圆陆鲨
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Golem', 'Golem-Alola'] }, // 隆隆岩/阿罗拉隆隆岩
			{ weight: 6, species: ['Excadrill'] }, // 龙头地鼠
			{ weight: 6, species: ['Machamp'] }, // 怪力
			{ weight: 6, species: ['Garganacl'] }, // 盐石巨灵
			{ weight: 6, species: ['Sandaconda'] }, // 沙螺蟒
			{ weight: 6, species: ['Vibrava'] }, // 超音波幼虫
			{ weight: 6, species: ['Krookodile'] }, // 流氓鳄
			{ weight: 6, species: ['Hawlucha'] }, // 摔角鹰人
			{ weight: 6, species: ['Falinks'] }, // 列阵兵
			{ weight: 6, species: ['Stonjourner'] }, // 巨石丁
			{ weight: 6, species: ['Sawk'] }, // 打击鬼
			{ weight: 6, species: ['Throh'] }, // 投摔鬼
			{ weight: 4, species: ['Gliscor'] }, // 天蝎王
			{ weight: 4, species: ['Glimmora'] }, // 晶光花
			{ weight: 4, species: ['Runerigus'] }, // 迭失板
			{ weight: 4, species: ['Lucario'] }, // 路卡利欧
			{ weight: 4, species: ['Aerodactyl'] }, // 化石翼龙
			{ weight: 4, species: ['Cradily'] }, // 摇篮百合
			{ weight: 2, species: ['Pupitar'] }, // 沙基拉斯
			{ weight: 2, species: ['Gabite'] }, // 尖牙陆鲨
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Rhyperior'] }, // 超甲狂犀
			{ weight: 6, species: ['Garganacl'] }, // 盐石巨灵
			{ weight: 6, species: ['Sandaconda'] }, // 沙螺蟒
			{ weight: 6, species: ['Flygon'] }, // 沙漠蜻蜓
			{ weight: 6, species: ['Gliscor'] }, // 天蝎王
			{ weight: 6, species: ['Glimmora'] }, // 晶光花
			{ weight: 6, species: ['Runerigus'] }, // 迭失板
			{ weight: 6, species: ['Aerodactyl'] }, // 化石翼龙
			{ weight: 6, species: ['Cradily'] }, // 摇篮百合
			{ weight: 6, species: ['Archeops'] }, // 始祖大鸟
			{ weight: 6, species: ['Excadrill'] }, // 龙头地鼠（用户 2026-10-06 更正）
			{ weight: 6, species: ['Coalossal'] }, // 巨炭山
			{ weight: 4, species: ['Kleavor'] }, // 劈斧螳螂
			{ weight: 4, species: ['Tyrantrum'] }, // 怪颚龙
			{ weight: 4, species: ['Arcanine-Hisui'] }, // 洗翠风速狗
			{ weight: 4, species: ['Ursaluna'] }, // 月月熊
			{ weight: 4, species: ['Tyranitar'] }, // 班基拉斯
			{ weight: 4, species: ['Garchomp'] }, // 烈咬陆鲨
			{ weight: 2, species: ['Great Tusk'] }, // 雄伟牙 (2.0%, 古代悖谬)
			{ weight: 2, species: ['Iron Treads'] }, // 铁辙迹 (2.0%, 未来悖谬)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Rhyperior'] }, // 超甲狂犀
			{ weight: 6, species: ['Lucario'] }, // 路卡利欧
			{ weight: 6, species: ['Aerodactyl'] }, // 化石翼龙
			{ weight: 6, species: ['Annihilape'] }, // 弃世猴
			{ weight: 6, species: ['Armarouge'] }, // 红莲铠骑
			{ weight: 6, species: ['Ceruledge'] }, // 苍炎刃鬼
			{ weight: 6, species: ['Kleavor'] }, // 劈斧螳螂
			{ weight: 6, species: ['Tyrantrum'] }, // 怪颚龙
			{ weight: 6, species: ['Arcanine-Hisui'] }, // 洗翠风速狗
			{ weight: 6, species: ['Ursaluna'] }, // 月月熊
			{ weight: 6, species: ['Tyranitar'] }, // 班基拉斯
			{ weight: 6, species: ['Garchomp'] }, // 烈咬陆鲨
			{ weight: 4, species: ['Zapdos-Galar'] }, // 伽勒尔闪电鸟 (4.0%, 二级神)
			{ weight: 4, species: ['Regirock'] }, // 雷吉洛克 (4.0%, 二级神)
			{ weight: 4, species: ['Cobalion'] }, // 勾帕路翁 (4.0%, 二级神)
			{ weight: 4, species: ['Virizion'] }, // 毕力吉翁 (4.0%, 二级神)
			{ weight: 4, species: ['Terrakion'] }, // 代拉基翁 (4.0%, 二级神)
			{ weight: 4, species: ['Iron Boulder'] }, // 铁磐岩 (4.0%, 未来悖谬)
			{ weight: 2, species: ['Ting-Lu'] }, // 古鼎鹿 (2.0%, 二级神)
			{ weight: 2, species: ['Landorus'] }, // 土地云 (2.0%, 二级神)
		],
	] },
	{ id: 'biome04', name: '熔岩矿脉', weight: 4, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Numel'] }, // 呆火驼
			{ weight: 6, species: ['Houndour'] }, // 戴鲁比
			{ weight: 6, species: ['Salandit'] }, // 夜盗火蜥
			{ weight: 6, species: ['Sizzlipede'] }, // 烧火蚣
			{ weight: 6, species: ['Rolycoly'] }, // 小炭仔
			{ weight: 6, species: ['Magby'] }, // 鸭嘴宝宝
			{ weight: 6, species: ['Vulpix'] }, // 六尾
			{ weight: 6, species: ['Litleo'] }, // 小狮狮
			{ weight: 6, species: ['Nosepass'] }, // 朝北鼻
			{ weight: 6, species: ['Roggenrola'] }, // 石丸子
			{ weight: 6, species: ['Ponyta'] }, // 小火马
			{ weight: 6, species: ['Slugma'] }, // 熔岩虫
			{ weight: 4, species: ['Tepig'] }, // 暖暖猪
			{ weight: 4, species: ['Cyndaquil'] }, // 火球鼠
			{ weight: 4, species: ['Charcadet'] }, // 炭小侍
			{ weight: 4, species: ['Torkoal'] }, // 煤炭龟
			{ weight: 4, species: ['Aron'] }, // 可可多拉
			{ weight: 4, species: ['Growlithe'] }, // 卡蒂狗
			{ weight: 2, species: ['Charmander'] }, // 小火龙
			{ weight: 2, species: ['Torchic'] }, // 火稚鸡
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Numel'] }, // 呆火驼
			{ weight: 6, species: ['Houndour'] }, // 戴鲁比
			{ weight: 6, species: ['Salandit'] }, // 夜盗火蜥
			{ weight: 6, species: ['Sizzlipede'] }, // 烧火蚣
			{ weight: 6, species: ['Carkol'] }, // 大炭车
			{ weight: 6, species: ['Fletchinder'] }, // 火箭雀
			{ weight: 6, species: ['Tinkatink'] }, // 小锻将
			{ weight: 6, species: ['Torkoal'] }, // 煤炭龟
			{ weight: 6, species: ['Cranidos'] }, // 头盖龙
			{ weight: 6, species: ['Shieldon'] }, // 盾甲龙
			{ weight: 6, species: ['Stunfisk-Galar'] }, // 伽勒尔泥巴鱼
			{ weight: 6, species: ['Slugma'] }, // 熔岩虫
			{ weight: 4, species: ['Monferno'] }, // 猛火猴
			{ weight: 4, species: ['Larvesta'] }, // 燃烧虫
			{ weight: 4, species: ['Litwick'] }, // 烛光灵
			{ weight: 4, species: ['Larvitar'] }, // 幼基拉斯
			{ weight: 4, species: ['Heatmor'] }, // 熔蚁兽
			{ weight: 4, species: ['Darumaka'] }, // 火红不倒翁
			{ weight: 2, species: ['Torracat'] }, // 炎热喵
			{ weight: 2, species: ['Braixen'] }, // 长尾火狐
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Camerupt'] }, // 喷火驼
			{ weight: 6, species: ['Houndoom'] }, // 黑鲁加
			{ weight: 6, species: ['Salazzle'] }, // 焰后蜥
			{ weight: 6, species: ['Centiskorch'] }, // 焚焰蚣
			{ weight: 6, species: ['Coalossal'] }, // 巨炭山
			{ weight: 6, species: ['Talonflame'] }, // 烈箭鹰
			{ weight: 6, species: ['Tinkaton'] }, // 巨锻将
			{ weight: 6, species: ['Magmar'] }, // 鸭嘴火兽
			{ weight: 6, species: ['Pyroar'] }, // 火炎狮
			{ weight: 6, species: ['Steelix'] }, // 大钢蛇
			{ weight: 6, species: ['Carbink'] }, // 小碎钻
			{ weight: 6, species: ['Heatmor'] }, // 熔蚁兽
			{ weight: 4, species: ['Larvesta'] }, // 燃烧虫
			{ weight: 4, species: ['Chandelure'] }, // 水晶灯火灵
			{ weight: 4, species: ['Pupitar'] }, // 沙基拉斯
			{ weight: 4, species: ['Turtonator'] }, // 爆焰龟兽
			{ weight: 4, species: ['Arcanine'] }, // 风速狗
			{ weight: 4, species: ['Marowak-Alola'] }, // 阿罗拉嘎啦嘎啦
			{ weight: 2, species: ['Cinderace'] }, // 闪焰王牌
			{ weight: 2, species: ['Skeledirge'] }, // 骨纹巨声鳄
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Camerupt'] }, // 喷火驼
			{ weight: 6, species: ['Salazzle'] }, // 焰后蜥
			{ weight: 6, species: ['Coalossal'] }, // 巨炭山
			{ weight: 6, species: ['Tinkaton'] }, // 巨锻将
			{ weight: 6, species: ['Magmortar'] }, // 鸭嘴炎兽
			{ weight: 6, species: ['Pyroar'] }, // 火炎狮
			{ weight: 6, species: ['Probopass'] }, // 大朝北鼻
			{ weight: 6, species: ['Gigalith'] }, // 庞岩怪
			{ weight: 6, species: ['Turtonator'] }, // 爆焰龟兽
			{ weight: 6, species: ['Arcanine'] }, // 风速狗
			{ weight: 6, species: ['Orthworm'] }, // 拖拖蚓
			{ weight: 6, species: ['Marowak-Alola'] }, // 阿罗拉嘎啦嘎啦
			{ weight: 4, species: ['Volcarona'] }, // 火神蛾
			{ weight: 4, species: ['Chandelure'] }, // 水晶灯火灵
			{ weight: 4, species: ['Tyranitar'] }, // 班吉拉斯
			{ weight: 4, species: ['Darmanitan'] }, // 达摩狒狒
			{ weight: 4, species: ['Aggron'] }, // 波士可多拉
			{ weight: 4, species: ['Arcanine-Hisui'] }, // 洗翠风速狗
			{ weight: 2, species: ['Diancie'] }, // 蒂安希(2.0%, 幻兽)
			{ weight: 2, species: ['Victini'] }, // 比克提尼 (2.0%, 幻兽)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Coalossal'] }, // 巨炭山
			{ weight: 6, species: ['Magmortar'] }, // 鸭嘴炎兽
			{ weight: 6, species: ['Pyroar'] }, // 火炎狮
			{ weight: 6, species: ['Gigalith'] }, // 庞岩怪
			{ weight: 6, species: ['Heatmor'] }, // 熔蚁兽
			{ weight: 6, species: ['Arcanine'] }, // 风速狗
			{ weight: 6, species: ['Volcarona'] }, // 火神蛾
			{ weight: 6, species: ['Chandelure'] }, // 水晶灯火灵
			{ weight: 6, species: ['Tyranitar'] }, // 班基拉斯
			{ weight: 6, species: ['Darmanitan'] }, // 达摩狒狒
			{ weight: 6, species: ['Aggron'] }, // 波士可多拉
			{ weight: 6, species: ['Arcanine-Hisui'] }, // 洗翠风速狗
			{ weight: 4, species: ['Moltres'] }, // 火焰鸟 (4.0%, 二级神)
			{ weight: 4, species: ['Entei'] }, // 炎帝 (4.0%, 二级神)
			{ weight: 4, species: ['Registeel'] }, // 雷吉斯奇鲁(4.0%, 二级神)
			{ weight: 4, species: ['Stakataka'] }, // 垒磊石 (4.0%, 究极异兽)
			{ weight: 4, species: ['Ogerpon-Hearthflame'] }, // 厄鬼椪 (火灶面具)(4.0%, 二级神)
			{ weight: 4, species: ['Heatran'] }, // 席多蓝恩 (4.0%, 二级神)
			{ weight: 2, species: ['Chi-Yu'] }, // 古玉鱼 (2.0%, 二级神)
			{ weight: 2, species: ['Gouging Fire'] }, // 破空焰(2.0%, 二级神)
		],
	] },
	{ id: 'biome05', name: '废弃电厂', weight: 4, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Magnemite'] }, // 小磁怪
			{ weight: 6, species: ['Voltorb', 'Voltorb-Hisui'] }, // 霹雳电球/洗翠霹雳电球
			{ weight: 6, species: ['Electrike'] }, // 落雷兽
			{ weight: 6, species: ['Mareep'] }, // 咩利羊
			{ weight: 6, species: ['Shinx'] }, // 小猫怪
			{ weight: 6, species: ['Klink'] }, // 齿轮儿
			{ weight: 6, species: ['Joltik'] }, // 电电虫
			{ weight: 6, species: ['Yamper'] }, // 来电汪
			{ weight: 6, species: ['Blitzle'] }, // 斑斑马
			{ weight: 6, species: ['Plusle'] }, // 正电拍拍
			{ weight: 6, species: ['Minun'] }, // 负电拍拍
			{ weight: 6, species: ['Pachirisu'] }, // 帕奇利兹
			{ weight: 4, species: ['Pikachu'] }, // 皮卡丘
			{ weight: 4, species: ['Helioptile'] }, // 伞电蜥
			{ weight: 4, species: ['Wattrel'] }, // 电海燕
			{ weight: 4, species: ['Pawmi'] }, // 布拔
			{ weight: 4, species: ['Elekid'] }, // 电击怪
			{ weight: 4, species: ['Toxel'] }, // 毒电婴
			{ weight: 2, species: ['Pincurchin'] }, // 啪嚓海胆
			{ weight: 2, species: ['Rotom'] }, // 洛托姆
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Magnemite'] }, // 小磁怪
			{ weight: 6, species: ['Voltorb', 'Voltorb-Hisui'] }, // 霹雳电球/洗翠霹雳电球
			{ weight: 6, species: ['Electrike'] }, // 落雷兽
			{ weight: 6, species: ['Tynamo'] }, // 麻麻小鱼
			{ weight: 6, species: ['Flaaffy'] }, // 茸茸羊
			{ weight: 6, species: ['Luxio'] }, // 勒克猫
			{ weight: 6, species: ['Helioptile'] }, // 伞电蜥
			{ weight: 6, species: ['Wattrel'] }, // 电海燕
			{ weight: 6, species: ['Emolga'] }, // 电飞鼠
			{ weight: 6, species: ['Togedemaru'] }, // 托戈德玛尔
			{ weight: 6, species: ['Dedenne'] }, // 咚咚鼠
			{ weight: 6, species: ['Morpeko'] }, // 莫鲁贝克
			{ weight: 4, species: ['Meowth-Galar'] }, // 加勒尔喵喵
			{ weight: 4, species: ['Stunfisk'] }, // 泥巴鱼
			{ weight: 4, species: ['Varoom'] }, // 噗隆隆
			{ weight: 4, species: ['Pawmo'] }, // 布土拔
			{ weight: 4, species: ['Elekid'] }, // 电击怪
			{ weight: 4, species: ['Toxel'] }, // 毒电婴
			{ weight: 2, species: ['Pawniard'] }, // 驹刀小兵
			{ weight: 2, species: ['Beldum'] }, // 铁哑铃
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Magneton'] }, // 三合一磁怪
			{ weight: 6, species: ['Electrode', 'Electrode-Hisui'] }, // 顽皮雷弹/洗翠顽皮雷弹
			{ weight: 6, species: ['Manectric'] }, // 雷电兽
			{ weight: 6, species: ['Eelektross'] }, // 麻麻鳗鱼王
			{ weight: 6, species: ['Ampharos'] }, // 电龙
			{ weight: 6, species: ['Klinklang'] }, // 齿轮怪
			{ weight: 6, species: ['Luxray'] }, // 伦琴猫
			{ weight: 6, species: ['Electivire'] }, // 电击魔兽
			{ weight: 6, species: ['Kilowattrel'] }, // 大电海燕
			{ weight: 6, species: ['Galvantula'] }, // 电蜘蛛
			{ weight: 6, species: ['Pawmot'] }, // 巴布土拔
			{ weight: 6, species: ['Bellibolt'] }, // 电肚蛙
			{ weight: 4, species: ['Rotom-Frost'] }, // 冰箱洛托姆
			{ weight: 4, species: ['Rotom-Fan'] }, // 风扇洛托姆
			{ weight: 4, species: ['Perrserker'] }, // 喵头目
			{ weight: 4, species: ['Skarmory'] }, // 盔甲鸟
			{ weight: 4, species: ['Revavroom'] }, // 普隆隆姆
			{ weight: 4, species: ['Toxtricity'] }, // 颤弦蝾螈
			{ weight: 2, species: ['Pawniard'] }, // 驹刀小兵
			{ weight: 2, species: ['Metang'] }, // 金属怪
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Magnezone'] }, // 自爆磁怪
			{ weight: 6, species: ['Manectric'] }, // 雷电兽
			{ weight: 6, species: ['Eelektross'] }, // 麻麻鳗鱼王
			{ weight: 6, species: ['Ampharos'] }, // 电龙
			{ weight: 6, species: ['Electivire'] }, // 电击魔兽
			{ weight: 6, species: ['Kilowattrel'] }, // 大电海燕
			{ weight: 6, species: ['Perrserker'] }, // 喵头目
			{ weight: 6, species: ['Skarmory'] }, // 盔甲鸟
			{ weight: 6, species: ['Revavroom'] }, // 普隆隆姆
			{ weight: 6, species: ['Toxtricity'] }, // 颤弦蝾螈
			{ weight: 6, species: ['Raichu-Alola'] }, // 阿罗拉雷丘
			{ weight: 6, species: ['Vikavolt'] }, // 锹农炮虫
			{ weight: 4, species: ['Rotom-Wash'] }, // 清洗洛托姆
			{ weight: 4, species: ['Rotom-Heat'] }, // 加热洛托姆
			{ weight: 4, species: ['Rotom-Mow'] }, // 切割洛托姆
			{ weight: 4, species: ['Duraludon'] }, // 铝钢龙
			{ weight: 4, species: ['Kingambit'] }, // 仆刀将军
			{ weight: 4, species: ['Metagross'] }, // 巨金怪
			{ weight: 2, species: ['Zeraora'] }, // 捷拉奥拉 (2.0%, 幻兽)
			{ weight: 2, species: ['Genesect'] }, // 盖诺赛克特 (2.0%, 幻兽)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Magnezone'] }, // 自爆磁怪
			{ weight: 6, species: ['Electivire'] }, // 电击魔兽
			{ weight: 6, species: ['Revavroom'] }, // 普隆隆姆
			{ weight: 6, species: ['Toxtricity'] }, // 颤弦蝾螈
			{ weight: 6, species: ['Archaludon'] }, // 铝钢桥龙
			{ weight: 6, species: ['Kingambit'] }, // 仆刀将军
			{ weight: 6, species: ['Metagross'] }, // 巨金怪
			{ weight: 6, species: ['Rotom-Frost'] }, // 冰箱洛托姆
			{ weight: 6, species: ['Rotom-Fan'] }, // 风扇洛托姆
			{ weight: 6, species: ['Rotom-Wash'] }, // 清洗洛托姆
			{ weight: 6, species: ['Rotom-Heat'] }, // 加热洛托姆
			{ weight: 6, species: ['Rotom-Mow'] }, // 切割洛托姆
			{ weight: 4, species: ['Raikou'] }, // 雷公 (4.0%, 二级神)
			{ weight: 4, species: ['Zapdos'] }, // 闪电鸟 (4.0%, 二级神)
			{ weight: 4, species: ['Regieleki'] }, // 雷吉艾勒奇 (4.0%, 二级神)
			{ weight: 4, species: ['Xurkitree'] }, // 电束木 (4.0%, 究极异兽)
			{ weight: 4, species: ['Iron Hands'] }, // 铁臂膀 (4.0%, 未来悖谬)
			{ weight: 4, species: ['Iron Thorns'] }, // 铁荆棘 (4.0%, 未来悖谬)
			{ weight: 2, species: ['Tapu Koko'] }, // 卡璞・鸣鸣 (2.0%, 二级神)
			{ weight: 2, species: ['Raging Bolt'] }, // 猛雷鼓(2.0%, 二级神)
		],
	] },
	{ id: 'biome06', name: '幽影墓地', weight: 4, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Gastly'] }, // 鬼斯
			{ weight: 6, species: ['Murkrow'] }, // 黑暗鸦
			{ weight: 6, species: ['Duskull'] }, // 夜巡灵
			{ weight: 6, species: ['Shuppet'] }, // 怨影娃娃
			{ weight: 6, species: ['Drifloon'] }, // 飘飘球
			{ weight: 6, species: ['Yamask', 'Yamask-Galar'] }, // 哭哭面具/加勒尔哭哭面具
			{ weight: 6, species: ['Sinistea'] }, // 来悲茶
			{ weight: 6, species: ['Poltchageist'] }, // 斯魔茶
			{ weight: 6, species: ['Houndour'] }, // 戴鲁比
			{ weight: 6, species: ['Nickit'] }, // 狡小狐
			{ weight: 6, species: ['Misdreavus'] }, // 梦妖
			{ weight: 6, species: ['Sandygast'] }, // 沙丘娃
			{ weight: 4, species: ['Impidimp'] }, // 捣蛋小妖
			{ weight: 4, species: ['Sableye'] }, // 勾魂眼
			{ weight: 4, species: ['Greavard'] }, // 墓仔狗
			{ weight: 4, species: ['Zorua'] }, // 索罗亚
			{ weight: 4, species: ['Litwick'] }, // 烛光灵
			{ weight: 4, species: ['Honedge'] }, // 独剑鞘
			{ weight: 2, species: ['Gimmighoul'] }, // 索财灵
			{ weight: 2, species: ['Zorua-Hisui'] }, // 洗翠索罗亚
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Gastly'] }, // 鬼斯
			{ weight: 6, species: ['Murkrow'] }, // 黑暗鸦
			{ weight: 6, species: ['Duskull'] }, // 夜巡灵
			{ weight: 6, species: ['Sinistea'] }, // 来悲茶
			{ weight: 6, species: ['Poltchageist'] }, // 斯魔茶
			{ weight: 6, species: ['Bramblin'] }, // 纳噬草
			{ weight: 6, species: ['Phantump'] }, // 小木灵
			{ weight: 6, species: ['Pumpkaboo'] }, // 南瓜精
			{ weight: 6, species: ['Corsola-Galar'] }, // 加勒尔太阳珊瑚
			{ weight: 6, species: ['Golett'] }, // 泥偶小人
			{ weight: 6, species: ['Sableye'] }, // 勾魂眼
			{ weight: 6, species: ['Greavard'] }, // 墓仔狗
			{ weight: 4, species: ['Marowak-Alola'] }, // 阿罗拉嘎啦嘎啦
			{ weight: 4, species: ['Absol'] }, // 阿勃梭鲁
			{ weight: 4, species: ['Spiritomb'] }, // 花岩怪
			{ weight: 4, species: ['Zorua'] }, // 索罗亚
			{ weight: 4, species: ['Litwick'] }, // 烛光灵
			{ weight: 4, species: ['Honedge'] }, // 独剑鞘
			{ weight: 2, species: ['Gimmighoul'] }, // 索财灵
			{ weight: 2, species: ['Mimikyu'] }, // 谜拟丘
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Gengar'] }, // 耿鬼
			{ weight: 6, species: ['Honchkrow'] }, // 乌鸦头头
			{ weight: 6, species: ['Banette'] }, // 诅咒娃娃
			{ weight: 6, species: ['Drifblim'] }, // 随风球
			{ weight: 6, species: ['Cofagrigus'] }, // 迭失棺
			{ weight: 6, species: ['Runerigus'] }, // 迭失板
			{ weight: 6, species: ['Polteageist'] }, // 怖思壶
			{ weight: 6, species: ['Sinistcha'] }, // 来悲粗茶
			{ weight: 6, species: ['Drapion'] }, // 龙王蝎
			{ weight: 6, species: ['Marowak-Alola'] }, // 阿罗拉嘎啦嘎啦
			{ weight: 6, species: ['Absol'] }, // 阿勃梭鲁
			{ weight: 6, species: ['Zoroark'] }, // 索罗亚克
			{ weight: 4, species: ['Shedinja'] }, // 脱壳忍者
			{ weight: 4, species: ['Spiritomb'] }, // 花岩怪
			{ weight: 4, species: ['Mimikyu'] }, // 谜拟丘
			{ weight: 4, species: ['Chandelure'] }, // 水晶灯火灵
			{ weight: 4, species: ['Aegislash'] }, // 坚盾剑怪
			{ weight: 4, species: ['Zoroark-Hisui'] }, // 洗翠索罗亚克
			{ weight: 2, species: ['Gholdengo'] }, // 赛富豪
			{ weight: 2, species: ['Dreepy'] }, // 多龙梅西亚
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Gengar'] }, // 耿鬼
			{ weight: 6, species: ['Dusknoir'] }, // 黑夜魔灵
			{ weight: 6, species: ['Banette'] }, // 诅咒娃娃
			{ weight: 6, species: ['Cofagrigus'] }, // 迭失棺
			{ weight: 6, species: ['Runerigus'] }, // 迭失板
			{ weight: 6, species: ['Polteageist'] }, // 怖思壶
			{ weight: 6, species: ['Sinistcha'] }, // 来悲粗茶
			{ weight: 6, species: ['Cursola'] }, // 魔灵珊瑚
			{ weight: 6, species: ['Absol'] }, // 阿勃梭鲁
			{ weight: 6, species: ['Spiritomb'] }, // 花岩怪
			{ weight: 6, species: ['Mimikyu'] }, // 谜拟丘
			{ weight: 6, species: ['Chandelure'] }, // 水晶灯火灵
			{ weight: 4, species: ['Shedinja'] }, // 脱壳忍者
			{ weight: 4, species: ['Annihilape'] }, // 弃世猴
			{ weight: 4, species: ['Aegislash'] }, // 坚盾剑怪
			{ weight: 4, species: ['Zoroark-Hisui'] }, // 洗翠索罗亚克
			{ weight: 4, species: ['Gholdengo'] }, // 赛富豪
			{ weight: 4, species: ['Dragapult'] }, // 多龙巴鲁托
			{ weight: 2, species: ['Darkrai'] }, // 达克莱伊 (2.0%, 幻兽)
			{ weight: 2, species: ['Hoopa'] }, // 胡帕 (2.0%, 幻兽)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Gengar'] }, // 耿鬼（本档高概率由用户 2026-10-06 补全）
			{ weight: 6, species: ['Dusknoir'] }, // 黑夜魔灵
			{ weight: 6, species: ['Banette'] }, // 诅咒娃娃
			{ weight: 6, species: ['Cursola'] }, // 魔灵珊瑚
			{ weight: 6, species: ['Mimikyu'] }, // 谜拟丘
			{ weight: 6, species: ['Chandelure'] }, // 水晶灯火灵
			{ weight: 6, species: ['Shedinja'] }, // 脱壳忍者
			{ weight: 6, species: ['Annihilape'] }, // 弃世猴
			{ weight: 6, species: ['Aegislash'] }, // 坚盾剑怪
			{ weight: 6, species: ['Zoroark-Hisui'] }, // 洗翠索罗亚克
			{ weight: 6, species: ['Gholdengo'] }, // 赛富豪
			{ weight: 6, species: ['Dragapult'] }, // 多龙巴鲁托
			{ weight: 4, species: ['Moltres-Galar'] }, // 伽勒尔火焰鸟 (4.0%, 二级神)
			{ weight: 4, species: ['Guzzlord'] }, // 恶食大王 (4.0%, 究极异兽)
			{ weight: 4, species: ['Blacephalon'] }, // 碰头小丑(4.0%, 究极异兽)
			{ weight: 4, species: ['Spectrier'] }, // 灵幽马 (4.0%, 二级神)
			{ weight: 4, species: ['Flutter Mane'] }, // 振翼发 (4.0%, 古代悖谬)
			{ weight: 4, species: ['Pecharunt'] }, // 桃歹郎 (4.0%, 幻兽)
			{ weight: 2, species: ['Chi-Yu'] }, // 古玉鱼 (2.0%, 二级神)
			{ weight: 2, species: ['Marshadow'] }, // 玛夏多 (2.0%, 幻兽)
		],
	] },
	{ id: 'biome07', name: '极光雪峰', weight: 4, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Snorunt'] }, // 雪童子
			{ weight: 6, species: ['Spheal'] }, // 海豹球
			{ weight: 6, species: ['Snover'] }, // 雪笠怪
			{ weight: 6, species: ['Cetoddle'] }, // 走鲸
			{ weight: 6, species: ['Vulpix-Alola'] }, // 阿罗拉六尾
			{ weight: 6, species: ['Sandshrew-Alola'] }, // 阿罗拉穿山鼠
			{ weight: 6, species: ['Bergmite'] }, // 冰宝
			{ weight: 6, species: ['Cubchoo'] }, // 喷嚏熊
			{ weight: 6, species: ['Vanillite'] }, // 迷你冰
			{ weight: 6, species: ['Smoochum'] }, // 迷唇娃
			{ weight: 6, species: ['Delibird'] }, // 信使鸟
			{ weight: 6, species: ['Mime Jr.'] }, // 魔尼尼
			{ weight: 4, species: ['Eiscue'] }, // 冰砌鹅
			{ weight: 4, species: ['Sneasel'] }, // 狃拉
			{ weight: 4, species: ['Sneasel-Hisui'] }, // 洗翠狃拉
			{ weight: 4, species: ['Amaura'] }, // 冰雪龙
			{ weight: 4, species: ['Snom'] }, // 雪吞虫
			{ weight: 4, species: ['Swinub'] }, // 小山猪
			{ weight: 2, species: ['Cleffa'] }, // 皮宝宝
			{ weight: 2, species: ['Ralts'] }, // 拉鲁拉丝
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Snorunt'] }, // 雪童子
			{ weight: 6, species: ['Spheal'] }, // 海豹球
			{ weight: 6, species: ['Snover'] }, // 雪笠怪
			{ weight: 6, species: ['Cetoddle'] }, // 走鲸
			{ weight: 6, species: ['Snom'] }, // 雪吞虫
			{ weight: 6, species: ['Sandshrew-Alola'] }, // 阿罗拉穿山鼠
			{ weight: 6, species: ['Bergmite'] }, // 冰宝
			{ weight: 6, species: ['Vulpix-Alola'] }, // 阿罗拉六尾
			{ weight: 6, species: ['Eiscue'] }, // 冰砌鹅
			{ weight: 6, species: ['Clobbopus'] }, // 拳拳鞘
			{ weight: 6, species: ['Cryogonal'] }, // 几何雪花
			{ weight: 6, species: ['Swinub'] }, // 小山猪
			{ weight: 4, species: ['Sneasel'] }, // 狃拉
			{ weight: 4, species: ['Sneasel-Hisui'] }, // 洗翠狃拉
			{ weight: 4, species: ['Amaura'] }, // 冰雪龙
			{ weight: 4, species: ['Clefairy'] }, // 皮皮
			{ weight: 4, species: ['Kirlia'] }, // 奇鲁莉安
			{ weight: 4, species: ['Zorua-Hisui'] }, // 洗翠索罗亚
			{ weight: 2, species: ['Frigibax'] }, // 凉脊龙
			{ weight: 2, species: ['Darumaka-Galar'] }, // 加勒尔火红不倒翁
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Glalie'] }, // 冰鬼护
			{ weight: 6, species: ['Froslass'] }, // 雪妖女
			{ weight: 6, species: ['Abomasnow'] }, // 暴雪王
			{ weight: 6, species: ['Frosmoth'] }, // 雪绒蛾
			{ weight: 6, species: ['Sandslash-Alola'] }, // 阿罗拉穿山王
			{ weight: 6, species: ['Avalugg', 'Avalugg-Hisui'] }, // 冰岩怪/洗翠冰岩怪
			{ weight: 6, species: ['Ninetales-Alola'] }, // 阿罗拉九尾
			{ weight: 6, species: ['Grapploct'] }, // 八爪武师
			{ weight: 6, species: ['Mamoswine'] }, // 象牙猪
			{ weight: 6, species: ['Aurorus'] }, // 冰雪巨龙
			{ weight: 6, species: ['Lapras'] }, // 拉普拉斯
			{ weight: 6, species: ['Dewgong'] }, // 白海狮
			{ weight: 4, species: ['Weavile'] }, // 玛狃拉
			{ weight: 4, species: ['Sneasler'] }, // 大狃拉
			{ weight: 4, species: ['Clefable'] }, // 皮可西
			{ weight: 4, species: ['Gardevoir'] }, // 沙奈朵
			{ weight: 4, species: ['Zoroark-Hisui'] }, // 洗翠索罗亚克
			{ weight: 4, species: ['Crabominable'] }, // 好胜毛蟹
			{ weight: 2, species: ['Arctibax'] }, // 冻脊龙
			{ weight: 2, species: ['Darmanitan-Galar'] }, // 加勒尔达摩狒狒
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Glalie'] }, // 冰鬼护
			{ weight: 6, species: ['Froslass'] }, // 雪妖女
			{ weight: 6, species: ['Abomasnow'] }, // 暴雪王
			{ weight: 6, species: ['Frosmoth'] }, // 雪绒蛾
			{ weight: 6, species: ['Avalugg', 'Avalugg-Hisui'] }, // 冰岩怪/洗翠冰岩怪
			{ weight: 6, species: ['Mamoswine'] }, // 象牙猪
			{ weight: 6, species: ['Clefable'] }, // 皮可西
			{ weight: 6, species: ['Gardevoir'] }, // 沙奈朵
			{ weight: 6, species: ['Aurorus'] }, // 冰雪巨龙
			{ weight: 6, species: ['Zoroark-Hisui'] }, // 洗翠索罗亚克
			{ weight: 6, species: ['Crabominable'] }, // 好胜毛蟹
			{ weight: 6, species: ['Mr. Rime'] }, // 踏冰人偶
			{ weight: 4, species: ['Weavile'] }, // 玛狃拉
			{ weight: 4, species: ['Sneasler'] }, // 大狃拉
			{ weight: 4, species: ['Arctozolt'] }, // 雷鸟海兽
			{ weight: 4, species: ['Arctovish'] }, // 鳃鱼海兽
			{ weight: 4, species: ['Baxcalibur'] }, // 戟脊龙
			{ weight: 4, species: ['Darmanitan-Galar'] }, // 加勒尔达摩狒狒
			{ weight: 2, species: ['Iron Valiant'] }, // 铁武者(2.0%, 未来悖谬)
			{ weight: 2, species: ['Iron Bundle'] }, // 铁包袱 (2.0%, 未来悖谬)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Abomasnow'] }, // 暴雪王
			{ weight: 6, species: ['Avalugg-Hisui'] }, // 洗翠冰岩怪
			{ weight: 6, species: ['Mamoswine'] }, // 象牙猪
			{ weight: 6, species: ['Zoroark-Hisui'] }, // 洗翠索罗亚克
			{ weight: 6, species: ['Crabominable'] }, // 好胜毛蟹
			{ weight: 6, species: ['Mr. Rime'] }, // 踏冰人偶
			{ weight: 6, species: ['Weavile'] }, // 玛狃拉
			{ weight: 6, species: ['Sneasler'] }, // 大狃拉
			{ weight: 6, species: ['Arctozolt'] }, // 雷鸟海兽
			{ weight: 6, species: ['Arctovish'] }, // 鳃鱼海兽
			{ weight: 6, species: ['Baxcalibur'] }, // 戟脊龙
			{ weight: 6, species: ['Darmanitan-Galar'] }, // 加勒尔达摩狒狒
			{ weight: 4, species: ['Articuno'] }, // 急冻鸟 (4.0%, 二级神)
			{ weight: 4, species: ['Articuno-Galar'] }, // 伽勒尔急冻鸟 (4.0%, 二级神)
			{ weight: 4, species: ['Regice'] }, // 雷吉艾斯 (4.0%, 二级神)
			{ weight: 4, species: ['Glastrier'] }, // 雪暴马 (4.0%, 二级神)
			{ weight: 4, species: ['Enamorus'] }, // 眷恋云 (4.0%, 二级神)
			{ weight: 4, species: ['Iron Jugulis'] }, // 铁脖颈 (4.0%, 未来悖谬)
			{ weight: 2, species: ['Chien-Pao'] }, // 古剑豹 (2.0%, 二级神)
			{ weight: 2, species: ['Celesteela'] }, // 铁火辉夜 (2.0%,究极异兽)
		],
	] },
	{ id: 'biome08', name: '郊外小径', weight: 4, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Pidgey'] }, // 波波
			{ weight: 6, species: ['Rattata', 'Rattata-Alola'] }, // 小拉达/阿罗拉小拉达
			{ weight: 6, species: ['Slakoth'] }, // 懒人懒
			{ weight: 6, species: ['Meowth'] }, // 喵喵
			{ weight: 6, species: ['Farfetch’d'] }, // 大葱鸭
			{ weight: 6, species: ['Doduo'] }, // 嘟嘟
			{ weight: 6, species: ['Lickitung'] }, // 大舌头
			{ weight: 6, species: ['Whismur'] }, // 咕妞妞
			{ weight: 6, species: ['Sentret'] }, // 尾立
			{ weight: 6, species: ['Hoothoot'] }, // 咕咕
			{ weight: 6, species: ['Starly'] }, // 姆克儿
			{ weight: 6, species: ['Trubbish'] }, // 破破袋
			{ weight: 4, species: ['Porygon'] }, // 多边兽
			{ weight: 4, species: ['Wooloo'] }, // 毛辫羊
			{ weight: 4, species: ['Skitty'] }, // 向尾喵
			{ weight: 4, species: ['Buneary'] }, // 卷卷耳
			{ weight: 4, species: ['Stufful'] }, // 童偶熊
			{ weight: 4, species: ['Zigzagoon', 'Zigzagoon-Galar'] }, // 蛇纹熊/伽勒尔蛇纹熊
			{ weight: 2, species: ['Ditto'] }, // 百变怪
			{ weight: 2, species: ['Dunsparce'] }, // 土龙弟弟
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Teddiursa'] }, // 熊宝宝
			{ weight: 6, species: ['Taillow'] }, // 傲骨燕
			{ weight: 6, species: ['Stantler'] }, // 惊角鹿
			{ weight: 6, species: ['Spinda'] }, // 晃晃斑
			{ weight: 6, species: ['Castform'] }, // 飘浮泡泡
			{ weight: 6, species: ['Kecleon'] }, // 变隐龙
			{ weight: 6, species: ['Aipom'] }, // 长尾怪手
			{ weight: 6, species: ['Bibarel'] }, // 大尾狸
			{ weight: 6, species: ['Jigglypuff'] }, // 胖丁
			{ weight: 6, species: ['Glameow'] }, // 魅力喵
			{ weight: 6, species: ['Gumshoos'] }, // 猫鼬探长
			{ weight: 6, species: ['Grafaiai'] }, // 涂标客
			{ weight: 4, species: ['Porygon2'] }, // 多边兽2型
			{ weight: 4, species: ['Miltank'] }, // 大奶罐
			// 肯泰罗/帕底亚肯泰罗（三种）
			{ weight: 4, species: ['Tauros', 'Tauros-Paldea-Combat', 'Tauros-Paldea-Blaze', 'Tauros-Paldea-Aqua'] },
			{ weight: 4, species: ['Chansey'] }, // 吉利蛋
			{ weight: 4, species: ['Indeedee'] }, // 爱管侍
			{ weight: 4, species: ['Furfrou'] }, // 多丽米亚
			{ weight: 2, species: ['Ditto'] }, // 百变怪
			{ weight: 2, species: ['Eevee'] }, // 伊布
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Lopunny'] }, // 长耳兔
			{ weight: 6, species: ['Chatot'] }, // 聒噪鸟
			{ weight: 6, species: ['Unfezant'] }, // 高傲雉鸡
			{ weight: 6, species: ['Stoutland'] }, // 长毛狗
			{ weight: 6, species: ['Cinccino'] }, // 奇诺栗鼠
			{ weight: 6, species: ['Sawsbuck'] }, // 萌芽鹿
			{ weight: 6, species: ['Bouffalant'] }, // 爆炸头水牛
			{ weight: 6, species: ['Diggersby'] }, // 掘地兔
			{ weight: 6, species: ['Maushold'] }, // 一家鼠
			{ weight: 6, species: ['Greedent'] }, // 藏饱栗鼠
			{ weight: 6, species: ['Bewear'] }, // 穿着熊
			{ weight: 6, species: ['Zangoose'] }, // 猫鼬斩
			{ weight: 4, species: ['Porygon-Z'] }, // 多边兽乙型
			{ weight: 4, species: ['Kangaskhan'] }, // 袋兽
			{ weight: 4, species: ['Indeedee'] }, // 爱管侍
			{ weight: 4, species: ['Farigiraf'] }, // 奇麒麟
			{ weight: 4, species: ['Drampa'] }, // 老翁龙
			{ weight: 4, species: ['Eevee'] }, // 伊布
			{ weight: 2, species: ['Ditto'] }, // 百变怪
			{ weight: 2, species: ['Ursaluna'] }, // 月月熊
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Braviary'] }, // 勇士雄鹰
			{ weight: 6, species: ['Oranguru'] }, // 智挥猩
			{ weight: 6, species: ['Audino'] }, // 差不多娃娃
			{ weight: 6, species: ['Snorlax'] }, // 卡比兽
			{ weight: 6, species: ['Toucannon'] }, // 铳嘴大鸟
			{ weight: 6, species: ['Wyrdeer'] }, // 诡角鹿
			{ weight: 6, species: ['Oinkologne'] }, // 飘香豚
			{ weight: 6, species: ['Fearow'] }, // 大嘴雀
			{ weight: 6, species: ['Arboliva'] }, // 奥利瓦
			{ weight: 6, species: ['Cyclizar'] }, // 摩托蜥
			{ weight: 6, species: ['Kangaskhan'] }, // 袋兽
			{ weight: 6, species: ['Indeedee'] }, // 爱管侍
			{ weight: 4, species: ['Blissey'] }, // 幸福蛋
			{ weight: 4, species: ['Ursaluna'] }, // 月月熊
			{ weight: 4, species: ['Ursaluna-Bloodmoon'] }, // 月月熊（赫月）
			{ weight: 4, species: ['Dudunsparce'] }, // 土龙节节
			{ weight: 4, species: ['Farigiraf'] }, // 奇麒麟
			{ weight: 4, species: ['Drampa'] }, // 老翁龙
			{ weight: 2, species: ['Melmetal'] }, // 美录梅塔(2.0%, 幻兽)
			{ weight: 2, species: ['Mew'] }, // 梦幻 (2.0%, 幻兽)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Audino'] }, // 差不多娃娃
			{ weight: 6, species: ['Snorlax'] }, // 卡比兽
			{ weight: 6, species: ['Arboliva'] }, // 奥利瓦
			{ weight: 6, species: ['Cyclizar'] }, // 摩托蜥
			{ weight: 6, species: ['Kangaskhan'] }, // 袋兽
			{ weight: 6, species: ['Indeedee'] }, // 爱管侍
			{ weight: 6, species: ['Blissey'] }, // 幸福蛋
			{ weight: 6, species: ['Ursaluna'] }, // 月月熊
			{ weight: 6, species: ['Ursaluna-Bloodmoon'] }, // 月月熊（赫月）
			{ weight: 6, species: ['Dudunsparce'] }, // 土龙节节
			{ weight: 6, species: ['Farigiraf'] }, // 奇麒麟
			{ weight: 6, species: ['Drampa'] }, // 老翁龙
			{ weight: 4, species: ['Entei'] }, // 炎帝 (4.0%, 二级神)
			{ weight: 4, species: ['Suicune'] }, // 水君 (4.0%, 二级神)
			{ weight: 4, species: ['Raikou'] }, // 雷公 (4.0%, 二级神)
			{ weight: 4, species: ['Ogerpon-Cornerstone'] }, // 厄鬼椪 (础石面具)(4.0%, 二级神)
			{ weight: 4, species: ['Silvally'] }, // 银伴战兽 (4.0%, 二级神)
			{ weight: 4, species: ['Meloetta'] }, // 美洛耶塔(2.0%, 幻兽)
			{ weight: 2, species: ['Arceus'] }, // 阿尔宙斯(2.0%, 幻兽)
			{ weight: 2, species: ['Regigigas'] }, // 雷吉奇卡斯 (2.0%, 一级神)
		],
	] },
	{ id: 'biome09', name: '污泥沼泽', weight: 4, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Zubat'] }, // 超音蝠
			{ weight: 6, species: ['Ekans'] }, // 阿柏蛇
			{ weight: 6, species: ['Koffing'] }, // 瓦斯弹
			{ weight: 6, species: ['Grimer', 'Grimer-Alola'] }, // 臭泥/阿罗拉臭泥
			{ weight: 6, species: ['Wooper-Paldea'] }, // 帕底亚乌波
			{ weight: 6, species: ['Oddish'] }, // 走路草
			{ weight: 6, species: ['Nidoran-F'] }, // 尼多兰
			{ weight: 6, species: ['Nidoran-M'] }, // 尼多郎
			{ weight: 6, species: ['Spinarak'] }, // 圆丝蛛
			{ weight: 6, species: ['Gulpin'] }, // 溶食兽
			{ weight: 6, species: ['Stunky'] }, // 臭鼬噗
			{ weight: 6, species: ['Tympole'] }, // 圆蝌蚪
			{ weight: 4, species: ['Toxel'] }, // 毒电婴
			{ weight: 4, species: ['Venipede'] }, // 百足蜈蚣
			{ weight: 4, species: ['Foongus'] }, // 哎呀球菇
			{ weight: 4, species: ['Skorupi'] }, // 钳尾蝎
			{ weight: 4, species: ['Croagunk'] }, // 不良蛙
			{ weight: 4, species: ['Shroodle'] }, // 滋汁鼹
			{ weight: 2, species: ['Sneasel-Hisui'] }, // 洗翠狃拉
			{ weight: 2, species: ['Skrelp'] }, // 垃垃藻
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Zubat'] }, // 超音蝠
			{ weight: 6, species: ['Ekans'] }, // 阿柏蛇
			{ weight: 6, species: ['Koffing'] }, // 瓦斯弹
			{ weight: 6, species: ['Grimer', 'Grimer-Alola'] }, // 臭泥/阿罗拉臭泥
			{ weight: 6, species: ['Clodsire'] }, // 土王
			{ weight: 6, species: ['Nidorina'] }, // 尼多娜
			{ weight: 6, species: ['Nidorino'] }, // 尼多力诺
			{ weight: 6, species: ['Qwilfish'] }, // 千针鱼
			{ weight: 6, species: ['Skorupi'] }, // 钳尾蝎
			{ weight: 6, species: ['Croagunk'] }, // 不良蛙
			{ weight: 6, species: ['Shroodle'] }, // 滋汁鼹
			{ weight: 6, species: ['Stunfisk'] }, // 泥巴鱼
			{ weight: 4, species: ['Toxel'] }, // 毒电婴
			{ weight: 4, species: ['Venipede'] }, // 百足蜈蚣
			{ weight: 4, species: ['Mareanie'] }, // 好坏星
			{ weight: 4, species: ['Foongus'] }, // 哎呀球菇
			{ weight: 4, species: ['Varoom'] }, // 噗隆隆
			{ weight: 4, species: ['Skrelp'] }, // 垃垃藻
			{ weight: 2, species: ['Qwilfish-Hisui'] }, // 洗翠千针鱼
			{ weight: 2, species: ['Gligar'] }, // 天蝎
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Crobat'] }, // 叉字蝠
			{ weight: 6, species: ['Weezing', 'Weezing-Galar'] }, // 双弹瓦斯/伽勒尔双弹瓦斯
			{ weight: 6, species: ['Muk', 'Muk-Alola'] }, // 臭臭泥/阿罗拉臭臭泥
			{ weight: 6, species: ['Clodsire'] }, // 土王
			{ weight: 6, species: ['Nidoqueen'] }, // 尼多后
			{ weight: 6, species: ['Nidoking'] }, // 尼多王
			{ weight: 6, species: ['Drapion'] }, // 龙王蝎
			{ weight: 6, species: ['Toxtricity'] }, // 颤弦蝾螈
			{ weight: 6, species: ['Scolipede'] }, // 蜈蚣王
			{ weight: 6, species: ['Amoonguss'] }, // 败露球菇
			{ weight: 6, species: ['Victreebel'] }, // 大食花
			{ weight: 6, species: ['Seviper'] }, // 饭匙蛇
			{ weight: 4, species: ['Garbodor'] }, // 垃圾山
			{ weight: 4, species: ['Overqwil'] }, // 万针鱼
			{ weight: 4, species: ['Toxapex'] }, // 超坏星
			{ weight: 4, species: ['Roserade'] }, // 罗丝雷朵
			{ weight: 4, species: ['Revavroom'] }, // 普隆隆姆
			{ weight: 4, species: ['Dragalge'] }, // 毒藻龙
			{ weight: 2, species: ['Galarian Slowbro'] }, // 伽勒尔呆壳兽
			{ weight: 2, species: ['Galarian Slowking'] }, // 伽勒尔呆呆王
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Clodsire'] }, // 土王
			{ weight: 6, species: ['Nidoqueen'] }, // 尼多后
			{ weight: 6, species: ['Nidoking'] }, // 尼多王
			{ weight: 6, species: ['Drapion'] }, // 龙王蝎
			{ weight: 6, species: ['Toxtricity'] }, // 颤弦蝾螈
			{ weight: 6, species: ['Scolipede'] }, // 蜈蚣王
			{ weight: 6, species: ['Amoonguss'] }, // 败露球菇
			{ weight: 6, species: ['Sneasler'] }, // 大狃拉
			{ weight: 6, species: ['Overqwil'] }, // 万针鱼
			{ weight: 6, species: ['Toxapex'] }, // 超坏星
			{ weight: 6, species: ['Roserade'] }, // 罗丝雷朵
			{ weight: 6, species: ['Seismitoad'] }, // 蟾蜍王
			{ weight: 4, species: ['Galarian Slowbro'] }, // 伽勒尔呆壳兽
			{ weight: 4, species: ['Galarian Slowking'] }, // 伽勒尔呆呆王
			{ weight: 4, species: ['Revavroom'] }, // 普隆隆姆
			{ weight: 4, species: ['Dragalge'] }, // 毒藻龙
			{ weight: 4, species: ['Gliscor'] }, // 天蝎王
			{ weight: 4, species: ['Mudsdale'] }, // 重泥挽马
			{ weight: 2, species: ['Ting-Lu'] }, // 古鼎鹿 (2.0%, 二级神)
			{ weight: 2, species: ['Landorus'] }, // 土地云 (2.0%, 二级神)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Clodsire'] }, // 土王
			{ weight: 6, species: ['Drapion'] }, // 龙王蝎
			{ weight: 6, species: ['Amoonguss'] }, // 败露球菇
			{ weight: 6, species: ['Sneasler'] }, // 大狃拉
			{ weight: 6, species: ['Overqwil'] }, // 万针鱼
			{ weight: 6, species: ['Toxapex'] }, // 超坏星
			{ weight: 6, species: ['Galarian Slowbro'] }, // 伽勒尔呆壳兽
			{ weight: 6, species: ['Galarian Slowking'] }, // 伽勒尔呆呆王
			{ weight: 6, species: ['Revavroom'] }, // 普隆隆姆
			{ weight: 6, species: ['Dragalge'] }, // 毒藻龙
			{ weight: 6, species: ['Gliscor'] }, // 天蝎王
			{ weight: 6, species: ['Mudsdale'] }, // 重泥挽马
			{ weight: 4, species: ['Brute Bonnet'] }, // 猛恶菇(4.0%, 古代悖谬)
			{ weight: 4, species: ['Nihilego'] }, // 虚吾伊德 (4.0%, 究极异兽）
			{ weight: 4, species: ['Iron Moth'] }, // 铁毒蛾 (4.0%, 未来悖谬)
			{ weight: 4, species: ['Fezandipiti'] }, // 吉雉鸡 (2.0%, 二级神)
			{ weight: 4, species: ['Okidogi'] }, // 够赞狗(4.0%, 二级神)
			{ weight: 4, species: ['Munkidori'] }, // 愿增猿(4.0%, 二级神)
			{ weight: 2, species: ['Pecharunt'] }, // 桃歹郎 (2.0%, 幻兽)
			{ weight: 2, species: ['Naganadel'] }, // 四颚针龙 (4.0%, 究极异兽)
		],
	] },
	{ id: 'biome10', name: '迷幻花海', weight: 4, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Cleffa'] }, // 皮宝宝
			{ weight: 6, species: ['Igglybuff'] }, // 宝宝丁
			{ weight: 6, species: ['Mime Jr.'] }, // 魔尼尼
			{ weight: 6, species: ['Flabébé'] }, // 花蓓蓓
			{ weight: 6, species: ['Swirlix'] }, // 绵绵泡芙
			{ weight: 6, species: ['Spritzee'] }, // 粉香香
			{ weight: 6, species: ['Milcery'] }, // 小仙奶
			{ weight: 6, species: ['Spoink'] }, // 跳跳猪
			{ weight: 6, species: ['Azurill'] }, // 露力丽
			{ weight: 6, species: ['Fidough'] }, // 狗仔包
			{ weight: 6, species: ['Exeggcute'] }, // 蛋蛋
			{ weight: 6, species: ['Dedenne'] }, // 咚咚鼠
			{ weight: 4, species: ['Comfey'] }, // 花疗环环
			{ weight: 4, species: ['Ralts'] }, // 拉鲁拉丝
			{ weight: 4, species: ['Cutiefly'] }, // 萌虻
			{ weight: 4, species: ['Impidimp'] }, // 捣蛋小妖
			{ weight: 4, species: ['Hatenna'] }, // 迷布莉姆
			{ weight: 4, species: ['Ponyta-Galar'] }, // 伽勒尔小火马
			{ weight: 2, species: ['Togepi'] }, // 波克比
			{ weight: 2, species: ['Eevee'] }, // 伊布
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Clefairy'] }, // 皮皮
			{ weight: 6, species: ['Jigglypuff'] }, // 胖丁
			{ weight: 6, species: ['Mr. Mime'] }, // 魔墙人偶
			{ weight: 6, species: ['Floette-Yellow'] }, // 花叶蒂
			{ weight: 6, species: ['Cottonee'] }, // 木棉球
			{ weight: 6, species: ['Alcremie'] }, // 霜奶仙
			{ weight: 6, species: ['Impidimp'] }, // 捣蛋小妖
			{ weight: 6, species: ['Hatenna'] }, // 迷布莉姆
			{ weight: 6, species: ['Ponyta-Galar'] }, // 伽勒尔小火马
			{ weight: 6, species: ['Snubbull'] }, // 布鲁
			{ weight: 6, species: ['Morelull'] }, // 睡睡菇
			{ weight: 6, species: ['Eldegoss'] }, // 白蓬蓬
			{ weight: 4, species: ['Comfey'] }, // 花疗环环
			{ weight: 4, species: ['Kirlia'] }, // 奇鲁莉安
			{ weight: 4, species: ['Espurr'] }, // 妙喵
			{ weight: 4, species: ['Cutiefly'] }, // 萌虻
			{ weight: 4, species: ['Eevee'] }, // 伊布
			{ weight: 4, species: ['Flittle'] }, // 飘飘雏
			{ weight: 2, species: ['Togepi'] }, // 波克比
			{ weight: 2, species: ['Oricorio', 'Oricorio-Pom-Pom', 'Oricorio-Pau', 'Oricorio-Sensu'] }, // 花舞鸟（四种风格）
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Clefable'] }, // 皮可西
			{ weight: 6, species: ['Wigglytuff'] }, // 胖可丁
			{ weight: 6, species: ['Florges'] }, // 花洁夫人
			{ weight: 6, species: ['Whimsicott'] }, // 风妖精
			{ weight: 6, species: ['Morgrem'] }, // 诈唬魔
			{ weight: 6, species: ['Hattrem'] }, // 提布莉姆
			{ weight: 6, species: ['Rapidash-Galar'] }, // 伽勒尔烈焰马
			{ weight: 6, species: ['Comfey'] }, // 花疗环环
			{ weight: 6, species: ['Ribombee'] }, // 蝶结萌虻
			{ weight: 6, species: ['Xatu'] }, // 天然鸟
			{ weight: 6, species: ['Lilligant'] }, // 裙儿小姐
			{ weight: 6, species: ['Meowstic'] }, // 超能妙喵
			{ weight: 4, species: ['Gardevoir'] }, // 沙奈朵
			{ weight: 4, species: ['Sylveon'] }, // 仙子伊布
			{ weight: 4, species: ['Espathra'] }, // 超能艳驼
			{ weight: 4, species: ['Oricorio', 'Oricorio-Pom-Pom', 'Oricorio-Pau', 'Oricorio-Sensu'] }, // 花舞鸟（四种风格）
			{ weight: 4, species: ['Lurantis'] }, // 兰螳花
			{ weight: 4, species: ['Sawsbuck'] }, // 萌芽鹿
			{ weight: 2, species: ['Togekiss'] }, // 波克基斯
			{ weight: 2, species: ['Lilligant-Hisui'] }, // 洗翠裙儿小姐
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Clefable'] }, // 皮可西
			{ weight: 6, species: ['Wigglytuff'] }, // 胖可丁
			{ weight: 6, species: ['Florges'] }, // 花洁夫人
			{ weight: 6, species: ['Whimsicott'] }, // 风妖精
			{ weight: 6, species: ['Grimmsnarl'] }, // 长毛巨魔
			{ weight: 6, species: ['Hatterene'] }, // 布莉姆温
			{ weight: 6, species: ['Comfey'] }, // 花疗环环
			{ weight: 6, species: ['Ribombee'] }, // 蝶结萌虻
			{ weight: 6, species: ['Gardevoir'] }, // 沙奈朵
			{ weight: 6, species: ['Oricorio', 'Oricorio-Pom-Pom', 'Oricorio-Pau', 'Oricorio-Sensu'] }, // 花舞鸟（四种风格）
			{ weight: 6, species: ['Meowstic'] }, // 超能妙喵
			{ weight: 6, species: ['Audino'] }, // 差不多娃娃
			{ weight: 4, species: ['Sylveon'] }, // 仙子伊布
			{ weight: 4, species: ['Espathra'] }, // 超能艳驼
			{ weight: 4, species: ['Lurantis'] }, // 兰螳花
			{ weight: 4, species: ['Sawsbuck'] }, // 萌芽鹿
			{ weight: 4, species: ['Togekiss'] }, // 波克基斯
			{ weight: 4, species: ['Lilligant-Hisui'] }, // 洗翠裙儿小姐
			{ weight: 2, species: ['Mew'] }, // 梦幻 (2.0%, 幻兽)
			{ weight: 2, species: ['Shaymin-Sky'] }, // 谢米（天空形态）  (2.0%, 幻兽)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Florges'] }, // 花洁夫人
			{ weight: 6, species: ['Grimmsnarl'] }, // 长毛巨魔
			{ weight: 6, species: ['Hatterene'] }, // 布莉姆温
			{ weight: 6, species: ['Comfey'] }, // 花疗环环
			{ weight: 6, species: ['Ribombee'] }, // 蝶结萌虻
			{ weight: 6, species: ['Gardevoir'] }, // 沙奈朵
			{ weight: 6, species: ['Oricorio', 'Oricorio-Pom-Pom', 'Oricorio-Pau', 'Oricorio-Sensu'] }, // 花舞鸟（四种风格）
			{ weight: 6, species: ['Sylveon'] }, // 仙子伊布
			{ weight: 6, species: ['Espathra'] }, // 超能艳驼
			{ weight: 6, species: ['Lurantis'] }, // 兰螳花
			{ weight: 6, species: ['Sawsbuck'] }, // 萌芽鹿
			{ weight: 6, species: ['Togekiss'] }, // 波克基斯
			{ weight: 4, species: ['Magearna'] }, // 玛机雅娜 (4.0%, 幻兽)
			{ weight: 4, species: ['Spectrier'] }, // 灵幽马 (4.0%, 二级神)
			{ weight: 4, species: ['Glastrier'] }, // 雪暴马 (4.0%, 二级神)
			{ weight: 4, species: ['Flutter Mane'] }, // 振翼发 (4.0%, 古代悖谬)
			{ weight: 4, species: ['Scream Tail'] }, // 吼叫尾 (4.0%, 古代悖谬)
			{ weight: 4, species: ['Cresselia'] }, // 克雷色利亚 (4.0%, 二级神)
			{ weight: 2, species: ['Tapu Lele'] }, // 卡璞・蝶蝶 (2.0%, 二级神)
			{ weight: 2, species: ['Calyrex'] }, // 蕾冠王 (2.0%, 一级神不完全体)
		],
	] },
	{ id: 'biome11', name: '天空之柱', weight: 3, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Venonat'] }, // 毛球
			{ weight: 6, species: ['Ledyba'] }, // 芭瓢虫
			{ weight: 6, species: ['Hoppip'] }, // 毽子草
			{ weight: 6, species: ['Surskit'] }, // 溜溜糖球
			{ weight: 6, species: ['Swablu'] }, // 青绵鸟
			{ weight: 6, species: ['Combee'] }, // 三蜜蜂
			{ weight: 6, species: ['Scatterbug'] }, // 粉蝶虫
			{ weight: 6, species: ['Woobat'] }, // 滚滚蝙蝠
			{ weight: 6, species: ['Yanma'] }, // 蜻蜻蜓
			{ weight: 6, species: ['Noibat'] }, // 嗡蝠
			{ weight: 6, species: ['Squawkabilly'] }, // 怒鹦哥
			{ weight: 6, species: ['Bombirdier'] }, // 下石鸟
			{ weight: 4, species: ['Sigilyph'] }, // 象征鸟
			{ weight: 4, species: ['Flamigo'] }, // 缠红鹤
			{ weight: 4, species: ['Minior'] }, // 小陨星
			{ weight: 4, species: ['Axew'] }, // 牙牙
			{ weight: 4, species: ['Goomy'] }, // 黏黏宝
			{ weight: 4, species: ['Jangmo-o'] }, // 心鳞宝
			{ weight: 2, species: ['Dratini'] }, // 迷你龙
			{ weight: 2, species: ['Bagon'] }, // 宝贝龙
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Ledian'] }, // 安瓢虫
			{ weight: 6, species: ['Skiploom'] }, // 毽子花
			{ weight: 6, species: ['Surskit'] }, // 溜溜糖球
			{ weight: 6, species: ['Swablu'] }, // 青绵鸟
			{ weight: 6, species: ['Combee'] }, // 三蜜蜂
			{ weight: 6, species: ['Vivillon'] }, // 彩粉蝶
			{ weight: 6, species: ['Swoobat'] }, // 心蝙蝠
			{ weight: 6, species: ['Yanma'] }, // 蜻蜻蜓
			{ weight: 6, species: ['Squawkabilly'] }, // 怒鹦哥
			{ weight: 6, species: ['Bombirdier'] }, // 下石鸟
			{ weight: 6, species: ['Flamigo'] }, // 缠红鹤
			{ weight: 6, species: ['Vullaby'] }, // 秃鹰丫头
			{ weight: 4, species: ['Goomy'] }, // 黏黏宝
			{ weight: 4, species: ['Jangmo-o'] }, // 心鳞宝
			{ weight: 4, species: ['Noibat'] }, // 嗡蝠
			{ weight: 4, species: ['Axew'] }, // 牙牙
			{ weight: 4, species: ['Druddigon'] }, // 赤面龙
			{ weight: 4, species: ['Dracozolt'] }, // 雷鸟龙
			{ weight: 2, species: ['Dratini'] }, // 迷你龙
			{ weight: 2, species: ['Bagon'] }, // 宝贝龙
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Venomoth'] }, // 摩鲁蛾
			{ weight: 6, species: ['Jumpluff'] }, // 毽子棉
			{ weight: 6, species: ['Masquerain'] }, // 雨翅蛾
			{ weight: 6, species: ['Altaria'] }, // 七夕青鸟
			{ weight: 6, species: ['Vespiquen'] }, // 蜂女王
			{ weight: 6, species: ['Vivillon'] }, // 彩粉蝶
			{ weight: 6, species: ['Swoobat'] }, // 心蝙蝠
			{ weight: 6, species: ['Yanmega'] }, // 远古巨蜓
			{ weight: 6, species: ['Vullaby'] }, // 秃鹰丫头
			{ weight: 6, species: ['Noibat'] }, // 嗡蝠
			{ weight: 6, species: ['Fraxure'] }, // 斧牙龙
			{ weight: 6, species: ['Druddigon'] }, // 赤面龙
			{ weight: 4, species: ['Sliggoo'] }, // 黏美儿
			{ weight: 4, species: ['Hakamo-o'] }, // 鳞甲龙
			{ weight: 4, species: ['Dragonair'] }, // 哈克龙
			{ weight: 4, species: ['Dracozolt'] }, // 雷鸟龙
			{ weight: 4, species: ['Bombirdier'] }, // 下石鸟
			{ weight: 4, species: ['Flamigo'] }, // 缠红鹤
			{ weight: 2, species: ['Shelgon'] }, // 甲壳龙
			{ weight: 2, species: ['Deino'] }, // 单首龙
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Altaria'] }, // 七夕青鸟
			{ weight: 6, species: ['Venomoth'] }, // 摩鲁蛾
			{ weight: 6, species: ['Jumpluff'] }, // 毽子棉
			{ weight: 6, species: ['Vespiquen'] }, // 蜂女王
			{ weight: 6, species: ['Yanmega'] }, // 远古巨蜓
			{ weight: 6, species: ['Swoobat'] }, // 心蝙蝠
			{ weight: 6, species: ['Mandibuzz'] }, // 秃鹰娜
			{ weight: 6, species: ['Noivern'] }, // 音波龙
			{ weight: 6, species: ['Haxorus'] }, // 双斧战龙
			{ weight: 6, species: ['Druddigon'] }, // 赤面龙
			{ weight: 6, species: ['Minior'] }, // 小陨星
			{ weight: 6, species: ['Flamigo'] }, // 缠红鹤
			{ weight: 4, species: ['Dragonite'] }, // 快龙
			{ weight: 4, species: ['Salamence'] }, // 暴飞龙
			{ weight: 4, species: ['Zweilous'] }, // 双首暴龙
			{ weight: 4, species: ['Goodra'] }, // 黏美龙
			{ weight: 4, species: ['Kommo-o'] }, // 杖尾鳞甲龙
			{ weight: 4, species: ['Dracozolt'] }, // 雷鸟龙
			{ weight: 2, species: ['Latias'] }, // 拉帝亚斯(2.0%, 二级神)
			{ weight: 2, species: ['Latios'] }, // 拉帝欧斯(2.0%, 二级神)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Altaria'] }, // 七夕青鸟
			{ weight: 6, species: ['Yanmega'] }, // 远古巨蜓
			{ weight: 6, species: ['Mandibuzz'] }, // 秃鹰娜
			{ weight: 6, species: ['Noivern'] }, // 音波龙
			{ weight: 6, species: ['Haxorus'] }, // 双斧战龙
			{ weight: 6, species: ['Druddigon'] }, // 赤面龙
			{ weight: 6, species: ['Dragonite'] }, // 快龙
			{ weight: 6, species: ['Salamence'] }, // 暴飞龙
			{ weight: 6, species: ['Hydreigon'] }, // 三首恶龙
			{ weight: 6, species: ['Goodra'] }, // 黏美龙
			{ weight: 6, species: ['Kommo-o'] }, // 杖尾鳞甲龙
			{ weight: 6, species: ['Dracozolt'] }, // 雷鸟龙
			{ weight: 4, species: ['Zapdos'] }, // 闪电鸟 (4.0%, 二级神)
			{ weight: 4, species: ['Articuno'] }, // 急冻鸟 (4.0%, 二级神)
			{ weight: 4, species: ['Moltres'] }, // 火焰鸟 (4.0%, 二级神)
			{ weight: 4, species: ['Regidrago'] }, // 雷吉铎拉戈 (4.0%, 二级神)
			{ weight: 4, species: ['Celesteela'] }, // 铁火辉夜 (4.0%,究极异兽)
			{ weight: 4, species: ['Roaring Moon'] }, // 轰鸣月(4.0%, 古代悖谬)
			{ weight: 2, species: ['Jirachi'] }, // 基拉祈 (2.0%, 幻兽)
			{ weight: 2, species: ['Deoxys'] }, // 代欧奇希斯 (2.0%, 幻兽)
		],
	] },
	{ id: 'biome12', name: '沙海龙窟', weight: 3, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Poochyena'] }, // 土狼犬
			{ weight: 6, species: ['Cacnea'] }, // 刺球仙人掌
			{ weight: 6, species: ['Maractus'] }, // 沙铃仙人掌
			{ weight: 6, species: ['Patrat'] }, // 探探鼠
			{ weight: 6, species: ['Purrloin'] }, // 扒手猫
			{ weight: 6, species: ['Baltoy'] }, // 天秤偶
			{ weight: 6, species: ['Barboach'] }, // 泥泥鳅
			{ weight: 6, species: ['Capsakid'] }, // 热辣娃
			{ weight: 6, species: ['Maschiff'] }, // 偶叫獒
			{ weight: 6, species: ['Sandile'] }, // 黑眼鳄
			{ weight: 6, species: ['Hippopotas'] }, // 沙河马
			{ weight: 6, species: ['Drilbur'] }, // 螺钉地鼠
			{ weight: 4, species: ['Omanyte'] }, // 菊石兽
			{ weight: 4, species: ['Kabuto'] }, // 化石盔
			{ weight: 4, species: ['Anorith'] }, // 太古羽虫
			{ weight: 4, species: ['Tirtouga'] }, // 原盖海龟
			{ weight: 4, species: ['Trapinch'] }, // 大颚蚁
			{ weight: 4, species: ['Scraggy'] }, // 滑滑小子
			{ weight: 2, species: ['Gible'] }, // 圆陆鲨
			{ weight: 2, species: ['Larvitar'] }, // 幼基拉斯
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Mightyena'] }, // 大狼犬
			{ weight: 6, species: ['Cacnea'] }, // 刺球仙人掌
			{ weight: 6, species: ['Maractus'] }, // 沙铃仙人掌
			{ weight: 6, species: ['Watchog'] }, // 步哨鼠
			{ weight: 6, species: ['Liepard'] }, // 酷豹
			{ weight: 6, species: ['Baltoy'] }, // 天秤偶
			{ weight: 6, species: ['Barboach'] }, // 泥泥鳅
			{ weight: 6, species: ['Capsakid'] }, // 热辣娃
			{ weight: 6, species: ['Maschiff'] }, // 偶叫獒
			{ weight: 6, species: ['Sandile'] }, // 黑眼鳄
			{ weight: 6, species: ['Hippopotas'] }, // 沙河马
			{ weight: 6, species: ['Drilbur'] }, // 螺钉地鼠
			{ weight: 4, species: ['Trapinch'] }, // 大颚蚁
			{ weight: 4, species: ['Scraggy'] }, // 滑滑小子
			{ weight: 4, species: ['Inkay'] }, // 好啦鱿
			{ weight: 4, species: ['Cufant'] }, // 铜象
			{ weight: 4, species: ['Anorith'] }, // 太古羽虫
			{ weight: 4, species: ['Tirtouga'] }, // 原盖海龟
			{ weight: 2, species: ['Gible'] }, // 圆陆鲨
			{ weight: 2, species: ['Larvitar'] }, // 幼基拉斯
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Mightyena'] }, // 大狼犬
			{ weight: 6, species: ['Cacturne'] }, // 梦歌仙人掌
			{ weight: 6, species: ['Flygon'] }, // 沙漠蜻蜓
			{ weight: 6, species: ['Krookodile'] }, // 流氓鳄
			{ weight: 6, species: ['Hippowdon'] }, // 河马兽
			{ weight: 6, species: ['Excadrill'] }, // 龙头地鼠
			{ weight: 6, species: ['Gliscor'] }, // 天蝎王
			{ weight: 6, species: ['Haxorus'] }, // 双斧战龙
			{ weight: 6, species: ['Tyrantrum'] }, // 怪颚龙
			{ weight: 6, species: ['Noivern'] }, // 音波龙
			{ weight: 6, species: ['Dracovish'] }, // 鳃鱼龙
			{ weight: 6, species: ['Dracozolt'] }, // 雷鸟龙
			{ weight: 4, species: ['Garchomp'] }, // 烈咬陆鲨
			{ weight: 4, species: ['Tyranitar'] }, // 班基拉斯
			{ weight: 4, species: ['Salamence'] }, // 暴飞龙
			{ weight: 4, species: ['Dragonite'] }, // 快龙
			{ weight: 4, species: ['Goodra', 'Goodra-Hisui'] }, // 黏美龙/洗翠黏美龙
			{ weight: 4, species: ['Zweilous'] }, // 双首暴龙
			{ weight: 2, species: ['Kommo-o'] }, // 杖尾鳞甲龙
			{ weight: 2, species: ['Drakloak'] }, // 多龙奇
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Flygon'] }, // 沙漠蜻蜓
			{ weight: 6, species: ['Krookodile'] }, // 流氓鳄
			{ weight: 6, species: ['Excadrill'] }, // 龙头地鼠
			{ weight: 6, species: ['Gliscor'] }, // 天蝎王
			{ weight: 6, species: ['Haxorus'] }, // 双斧战龙
			{ weight: 6, species: ['Tyrantrum'] }, // 怪颚龙
			{ weight: 6, species: ['Noivern'] }, // 音波龙
			{ weight: 6, species: ['Archaludon'] }, // 铝钢桥龙
			{ weight: 6, species: ['Kingambit'] }, // 仆刀将军
			{ weight: 6, species: ['Garchomp'] }, // 烈咬陆鲨
			{ weight: 6, species: ['Tyranitar'] }, // 班基拉斯
			{ weight: 6, species: ['Goodra', 'Goodra-Hisui'] }, // 黏美龙/洗翠黏美龙
			{ weight: 4, species: ['Salamence'] }, // 暴飞龙
			{ weight: 4, species: ['Dragonite'] }, // 快龙
			{ weight: 4, species: ['Hydreigon'] }, // 三首恶龙
			{ weight: 4, species: ['Kommo-o'] }, // 杖尾鳞甲龙
			{ weight: 4, species: ['Drakloak'] }, // 多龙奇
			{ weight: 4, species: ['Baxcalibur'] }, // 戟脊龙
			{ weight: 2, species: ['Brute Bonnet'] }, // 猛恶菇(2.0%, 古代悖谬)
			{ weight: 2, species: ['Regidrago'] }, // 雷吉铎拉戈(2.0%, 二级神)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Garchomp'] }, // 烈咬陆鲨
			{ weight: 6, species: ['Tyranitar'] }, // 班基拉斯
			{ weight: 6, species: ['Hydreigon'] }, // 三首恶龙
			{ weight: 6, species: ['Haxorus'] }, // 双斧战龙
			{ weight: 6, species: ['Kommo-o'] }, // 杖尾鳞甲龙
			{ weight: 6, species: ['Baxcalibur'] }, // 戟脊龙
			{ weight: 6, species: ['Salamence'] }, // 暴飞龙
			{ weight: 6, species: ['Dragonite'] }, // 快龙
			{ weight: 6, species: ['Goodra'] }, // 黏美龙
			{ weight: 6, species: ['Dragapult'] }, // 多龙巴鲁托
			{ weight: 6, species: ['Archaludon'] }, // 铝钢桥龙
			{ weight: 6, species: ['Kingambit'] }, // 仆刀将军
			{ weight: 4, species: ['Sandy Shocks'] }, // 沙铁皮(4.0%, 古代悖谬)
			{ weight: 4, species: ['Great Tusk'] }, // 雄伟牙(4.0%, 古代悖谬)
			{ weight: 4, species: ['Roaring Moon'] }, // 轰鸣月(4.0%, 古代悖谬)
			{ weight: 4, species: ['Raging Bolt'] }, // 猛雷鼓 (4.0%, 二级神)
			{ weight: 4, species: ['Gouging Fire'] }, // 破空焰 (4.0%, 二级神)
			{ weight: 4, species: ['Walking Wake'] }, // 波荡水 (4.0%, 二级神)
			{ weight: 2, species: ['Ting-Lu'] }, // 古鼎鹿(2.0%, 二级神)
			{ weight: 2, species: ['Guzzlord'] }, // 恶食大王 (2.0%,究极异兽)
		],
	] },
	{ id: 'biome13', name: '旧日遗迹', weight: 3, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Psyduck'] }, // 可达鸭
			{ weight: 6, species: ['Abra'] }, // 凯西
			{ weight: 6, species: ['Drowzee'] }, // 催眠貘
			{ weight: 6, species: ['Unown'] }, // 未知图腾
			{ weight: 6, species: ['Meditite'] }, // 玛沙那
			{ weight: 6, species: ['Chingling'] }, // 铃铛响
			{ weight: 6, species: ['Bronzor'] }, // 铜镜怪
			{ weight: 6, species: ['Munna'] }, // 食梦梦
			{ weight: 6, species: ['Gothita'] }, // 哥德宝宝
			{ weight: 6, species: ['Solosis'] }, // 单卵细胞球
			{ weight: 6, species: ['Elgyem'] }, // 小灰怪
			{ weight: 6, species: ['Rellor'] }, // 虫滚泥
			{ weight: 4, species: ['Wobbuffet'] }, // 果然翁
			{ weight: 4, species: ['Smeargle'] }, // 图图犬
			{ weight: 4, species: ['Mienfoo'] }, // 功夫鼬
			{ weight: 4, species: ['Pancham'] }, // 顽皮熊猫
			{ weight: 4, species: ['Klefki'] }, // 钥圈儿
			{ weight: 4, species: ['Passimian'] }, // 投掷猴
			{ weight: 2, species: ['Mawile'] }, // 大嘴娃
			{ weight: 2, species: ['Veluza'] }, // 轻身鳕
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Psyduck'] }, // 可达鸭
			{ weight: 6, species: ['Kadabra'] }, // 勇基拉
			{ weight: 6, species: ['Drowzee'] }, // 催眠貘
			{ weight: 6, species: ['Unown'] }, // 未知图腾
			{ weight: 6, species: ['Meditite'] }, // 玛沙那
			{ weight: 6, species: ['Chingling'] }, // 铃铛响
			{ weight: 6, species: ['Munna'] }, // 食梦梦
			{ weight: 6, species: ['Gothita'] }, // 哥德宝宝
			{ weight: 6, species: ['Solosis'] }, // 单卵细胞球
			{ weight: 6, species: ['Elgyem'] }, // 小灰怪
			{ weight: 6, species: ['Rellor'] }, // 虫滚泥
			{ weight: 6, species: ['Mienfoo'] }, // 功夫鼬
			{ weight: 4, species: ['Wobbuffet'] }, // 果然翁
			{ weight: 4, species: ['Smeargle'] }, // 图图犬
			{ weight: 4, species: ['Pancham'] }, // 顽皮熊猫
			{ weight: 4, species: ['Klefki'] }, // 钥圈儿
			{ weight: 4, species: ['Passimian'] }, // 投掷猴
			{ weight: 4, species: ['Mawile'] }, // 大嘴娃
			{ weight: 2, species: ['Veluza'] }, // 轻身鳕
			{ weight: 2, species: ['Bronzor'] }, // 铜镜怪
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Golduck'] }, // 哥达鸭
			{ weight: 6, species: ['Alakazam'] }, // 胡地
			{ weight: 6, species: ['Hypno'] }, // 引梦貘人
			{ weight: 6, species: ['Unown'] }, // 未知图腾
			{ weight: 6, species: ['Medicham'] }, // 恰雷姆
			{ weight: 6, species: ['Chimecho'] }, // 风铃铃
			{ weight: 6, species: ['Musharna'] }, // 梦梦蚀
			{ weight: 6, species: ['Gothorita'] }, // 哥德小童
			{ weight: 6, species: ['Duosion'] }, // 双卵细胞球
			{ weight: 6, species: ['Elgyem'] }, // 小灰怪
			{ weight: 6, species: ['Wobbuffet'] }, // 果然翁
			{ weight: 6, species: ['Smeargle'] }, // 图图犬
			{ weight: 4, species: ['Bronzong'] }, // 青铜钟
			{ weight: 4, species: ['Rabsca'] }, // 虫甲圣
			{ weight: 4, species: ['Mienfoo'] }, // 功夫鼬
			{ weight: 4, species: ['Pangoro'] }, // 流氓熊猫
			{ weight: 4, species: ['Klefki'] }, // 钥圈儿
			{ weight: 4, species: ['Passimian'] }, // 投掷猴
			{ weight: 2, species: ['Mawile'] }, // 大嘴娃
			{ weight: 2, species: ['Veluza'] }, // 轻身鳕
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Alakazam'] }, // 胡地
			{ weight: 6, species: ['Bronzong'] }, // 青铜钟
			{ weight: 6, species: ['Gothitelle'] }, // 哥德小姐
			{ weight: 6, species: ['Reuniclus'] }, // 人造细胞卵
			{ weight: 6, species: ['Beheeyem'] }, // 大宇怪
			{ weight: 6, species: ['Rabsca'] }, // 虫甲圣
			{ weight: 6, species: ['Mienshao'] }, // 师父鼬
			{ weight: 6, species: ['Pangoro'] }, // 流氓熊猫
			{ weight: 6, species: ['Passimian'] }, // 投掷猴
			{ weight: 6, species: ['Gardevoir'] }, // 沙奈朵
			{ weight: 6, species: ['Lucario'] }, // 路卡利欧
			{ weight: 6, species: ['Togekiss'] }, // 波克基斯
			{ weight: 4, species: ['Hatterene'] }, // 布莉姆温
			{ weight: 4, species: ['Aegislash'] }, // 坚盾剑怪
			{ weight: 4, species: ['Gholdengo'] }, // 赛富豪
			{ weight: 4, species: ['Mawile'] }, // 大嘴娃
			{ weight: 4, species: ['Klefki'] }, // 钥圈儿
			{ weight: 4, species: ['Veluza'] }, // 轻身鳕
			{ weight: 2, species: ['Marshadow'] }, // 玛夏多(2.0%, 幻兽)
			{ weight: 2, species: ['Meloetta'] }, // 美洛耶塔(2.0%, 幻兽)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Alakazam'] }, // 胡地
			{ weight: 6, species: ['Bronzong'] }, // 青铜钟
			{ weight: 6, species: ['Gothitelle'] }, // 哥德小姐
			{ weight: 6, species: ['Reuniclus'] }, // 人造细胞卵
			{ weight: 6, species: ['Beheeyem'] }, // 大宇怪
			{ weight: 6, species: ['Rabsca'] }, // 虫甲圣
			{ weight: 6, species: ['Mienshao'] }, // 师父鼬
			{ weight: 6, species: ['Pangoro'] }, // 流氓熊猫
			{ weight: 6, species: ['Gardevoir'] }, // 沙奈朵
			{ weight: 6, species: ['Lucario'] }, // 路卡利欧
			{ weight: 6, species: ['Hatterene'] }, // 布莉姆温
			{ weight: 6, species: ['Togekiss'] }, // 波克基斯
			{ weight: 4, species: ['Uxie'] }, // 由克希(2.0%, 二级神)
			{ weight: 4, species: ['Mesprit'] }, // 艾姆利多(2.0%, 二级神)
			{ weight: 4, species: ['Azelf'] }, // 亚克诺姆(2.0%, 二级神)
			{ weight: 4, species: ['Iron Leaves'] }, // 铁斑叶(2.0%, 二级神)
			{ weight: 4, species: ['Iron Crown'] }, // 铁头壳(2.0%, 二级神)
			{ weight: 4, species: ['Iron Boulder'] }, // 铁磐岩(2.0%, 二级神)
			{ weight: 2, species: ['Tapu Lele'] }, // 卡璞·蝶蝶(2.0%, 二级神)
			{ weight: 2, species: ['Hoopa'] }, // 胡帕(2.0%, 二级神)
		],
	] },
	{ id: 'biome14', name: '太晶空洞', weight: 2, tiers: [
		[ // Pool tier 1: Lv.0–20
			{ weight: 6, species: ['Glimmet'] }, // 晶光芽
			{ weight: 6, species: ['Nacli'] }, // 盐石宝
			{ weight: 6, species: ['Tinkatink'] }, // 小锻匠
			{ weight: 6, species: ['Charcadet'] }, // 炭小侍
			{ weight: 6, species: ['Gimmighoul'] }, // 索财灵
			{ weight: 6, species: ['Pawniard'] }, // 驹刀小兵
			{ weight: 6, species: ['Beldum'] }, // 铁哑铃
			{ weight: 6, species: ['Gible'] }, // 圆陆鲨
			{ weight: 6, species: ['Ralts'] }, // 拉鲁拉丝
			{ weight: 6, species: ['Riolu'] }, // 利欧路
			{ weight: 6, species: ['Rotom'] }, // 洛托姆
			{ weight: 6, species: ['Minior'] }, // 小陨星
			{ weight: 4, species: ['Eevee'] }, // 伊布
			{ weight: 4, species: ['Frigibax'] }, // 凉脊龙
			{ weight: 4, species: ['Dreepy'] }, // 多龙梅西亚
			{ weight: 4, species: ['Larvitar'] }, // 幼基拉斯
			{ weight: 4, species: ['Dratini'] }, // 迷你龙
			{ weight: 4, species: ['Bagon'] }, // 宝贝龙
			{ weight: 2, species: ['Deino'] }, // 单首龙
			{ weight: 2, species: ['Jangmo-o'] }, // 心鳞宝
		],
		[ // Pool tier 2: Lv.20–40
			{ weight: 6, species: ['Glimmet'] }, // 晶光芽
			{ weight: 6, species: ['Nacli'] }, // 盐石宝
			{ weight: 6, species: ['Tinkatink'] }, // 小锻匠
			{ weight: 6, species: ['Charcadet'] }, // 炭小侍
			{ weight: 6, species: ['Gimmighoul'] }, // 索财灵
			{ weight: 6, species: ['Pawniard'] }, // 驹刀小兵
			{ weight: 6, species: ['Beldum'] }, // 铁哑铃
			{ weight: 6, species: ['Gible'] }, // 圆陆鲨
			{ weight: 6, species: ['Kirlia'] }, // 奇鲁莉安
			{ weight: 6, species: ['Riolu'] }, // 利欧路
			{ weight: 6, species: ['Rotom'] }, // 洛托姆
			{ weight: 6, species: ['Minior'] }, // 小陨星
			{ weight: 4, species: ['Mimikyu'] }, // 谜拟丘
			{ weight: 4, species: ['Eevee'] }, // 伊布
			{ weight: 4, species: ['Frigibax'] }, // 凉脊龙
			{ weight: 4, species: ['Pupitar'] }, // 沙基拉斯
			{ weight: 4, species: ['Dreepy'] }, // 多龙梅西亚
			{ weight: 4, species: ['Dragonair'] }, // 哈克龙
			{ weight: 2, species: ['Deino'] }, // 单首龙
			{ weight: 2, species: ['Jangmo-o'] }, // 心鳞宝
		],
		[ // Pool tier 3: Lv.40–60
			{ weight: 6, species: ['Glimmora'] }, // 晶光花
			{ weight: 6, species: ['Garganacl'] }, // 盐石巨灵
			{ weight: 6, species: ['Tinkaton'] }, // 巨锻匠
			{ weight: 6, species: ['Armarouge', 'Ceruledge'] }, // 红莲铠骑/苍炎刃鬼
			{ weight: 6, species: ['Bisharp'] }, // 劈斩司令
			{ weight: 6, species: ['Metang'] }, // 金属怪
			{ weight: 6, species: ['Gabite'] }, // 尖牙陆鲨
			{ weight: 6, species: ['Gardevoir'] }, // 沙奈朵
			{ weight: 6, species: ['Lucario'] }, // 路卡利欧
			{ weight: 6, species: ['Rotom', 'Rotom-Heat', 'Rotom-Wash', 'Rotom-Frost', 'Rotom-Fan', 'Rotom-Mow'] }, // 洛托姆（形态随机）
			{ weight: 6, species: ['Mimikyu'] }, // 谜拟丘
			{ weight: 6, species: ['Minior'] }, // 小陨星
			{ weight: 4, species: ['Arctibax'] }, // 冻脊龙
			{ weight: 4, species: ['Pupitar'] }, // 沙基拉斯
			{ weight: 4, species: ['Shelgon'] }, // 甲壳龙
			{ weight: 4, species: ['Sliggoo'] }, // 黏美儿
			{ weight: 4, species: ['Volcarona'] }, // 火神蛾
			{ weight: 4, species: ['Drakloak'] }, // 多龙奇
			{ weight: 2, species: ['Zweilous'] }, // 双首暴龙
			{ weight: 2, species: ['Hakamo-o'] }, // 鳞甲龙
		],
		[ // Pool tier 4: Lv.60–80
			{ weight: 6, species: ['Glimmora'] }, // 晶光花
			{ weight: 6, species: ['Garganacl'] }, // 盐石巨灵
			{ weight: 6, species: ['Tinkaton'] }, // 巨锻匠
			{ weight: 6, species: ['Gholdengo'] }, // 赛富豪
			{ weight: 6, species: ['Garchomp'] }, // 烈咬陆鲨
			{ weight: 6, species: ['Metagross'] }, // 巨金怪
			{ weight: 6, species: ['Baxcalibur'] }, // 戟脊龙
			{ weight: 6, species: ['Dragapult'] }, // 多龙巴鲁托
			{ weight: 6, species: ['Kingambit'] }, // 仆刀将军
			{ weight: 6, species: ['Dragonite'] }, // 快龙
			{ weight: 6, species: ['Volcarona'] }, // 火神蛾
			{ weight: 6, species: ['Palafin-Hero'] }, // 海豚侠（全能形态）
			{ weight: 4, species: ['Tyranitar'] }, // 班基拉斯
			{ weight: 4, species: ['Hydreigon'] }, // 三首恶龙
			{ weight: 4, species: ['Salamence'] }, // 暴飞龙
			{ weight: 4, species: ['Goodra'] }, // 黏美龙
			{ weight: 4, species: ['Kommo-o'] }, // 杖尾鳞甲龙
			{ weight: 4, species: ['Archaludon'] }, // 铝钢桥龙
			{ weight: 2, species: ['Iron Valiant'] }, // 铁武者 (2.0%, 未来悖谬)
			{ weight: 2, species: ['Roaring Moon'] }, // 轰鸣月(2.0%, 古代悖谬)
		],
		[ // Pool tier 5: Lv.80–100
			{ weight: 6, species: ['Gholdengo'] }, // 赛富豪
			{ weight: 6, species: ['Kingambit'] }, // 仆刀将军
			{ weight: 6, species: ['Baxcalibur'] }, // 戟脊龙
			{ weight: 6, species: ['Dragapult'] }, // 多龙巴鲁托
			{ weight: 6, species: ['Garchomp'] }, // 烈咬陆鲨
			{ weight: 6, species: ['Dragonite'] }, // 快龙
			{ weight: 6, species: ['Volcarona'] }, // 火神蛾
			{ weight: 6, species: ['Metagross'] }, // 巨金怪
			{ weight: 6, species: ['Garganacl'] }, // 盐石巨灵
			{ weight: 6, species: ['Tinkaton'] }, // 巨锻匠
			{ weight: 6, species: ['Archaludon'] }, // 铝钢桥龙
			{ weight: 6, species: ['Palafin-Hero'] }, // 海豚侠（全能形态）
			{ weight: 4, species: ['Scream Tail'] }, // 吼叫尾(4.0%, 未来悖谬)
			{ weight: 4, species: ['Flutter Mane'] }, // 振翼发(4.0%, 古代悖谬)
			{ weight: 4, species: ['Iron Bundle'] }, // 铁包袱(4.0%, 未来悖谬)
			{ weight: 4, species: ['Iron Hands'] }, // 铁臂膀(4.0%, 未来悖谬)
			{ weight: 4, species: ['Iron Moth'] }, // 铁毒蛾 (4.0%, 未来悖谬)
			{ weight: 4, species: ['Silvally'] }, // 银伴战兽(4.0%, 二级神)
			{ weight: 2, species: ['Terapagos'] }, // 太乐巴戈斯(2.0%, 一级神)
			// 厄鬼椪（四面具随机）(2.0%, 二级神)
			{ weight: 2, species: ['Ogerpon', 'Ogerpon-Wellspring', 'Ogerpon-Hearthflame', 'Ogerpon-Cornerstone'] },
		],
	] },
];
