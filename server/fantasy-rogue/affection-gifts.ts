import { TRAVELLERS } from './traveller-profiles';
import { COMPANIONS, companionGiftOptions, type CompanionID } from '../../sim/rogue-companions';
import { FANTASY_BLESSING_ITEMS } from '../../sim/rogue-blessing-data';

/** Authored upgrades: distinct from the first gift and suited to the trainer's battle style. */
const GIFTS: [string[], string, string][] = [
	[['marnie', 'giovanni', 'guzma', 'bea', 'lance', 'clair', 'kieran'], 'choiceband', '讲究头带'],
	[['roxie', 'liko', 'gardenia', 'n', 'lana', 'lusamine'], 'leftovers', '吃剩的东西'],
	[['lacey', 'diantha', 'valerie', 'bede', 'sabrina', 'lorelei'], 'choicespecs', '讲究眼镜'],
	[['lysandre', 'leon', 'cynthia', 'nemona', 'silver', 'kahili', 'winona', 'nessa'], 'lifeorb', '生命宝珠'],
	[['olivia', 'brock', 'clay'], 'rockyhelmet', '凸凸头盔'],
	[['grusha', 'candice'], 'heavydutyboots', '厚底靴'],
	[['rika', 'poppy', 'steven', 'jasmine'], 'assaultvest', '突击背心'],
	[['iris', 'korrina', 'ash', 'gladion'], 'expertbelt', '达人带'],
	[['iono', 'canari', 'larry', 'blue'], 'choicescarf', '讲究围巾'],
	[['acerola', 'nanu', 'carmine'], 'covertcloak', '密探斗篷'],
	[['flannery'], 'whiteherb', '白色香草'],
	[['penny', 'lillie', 'viola'], 'focussash', '气势披带'],
	[['sada', 'turo'], 'maxelixir', 'PP 全项大补剂'],
];
const advanced = Object.fromEntries(GIFTS.flatMap(([ids, id, name]) => ids.map(trainer => [trainer, { id, name }])));
export function affectionThemeGift(id: string, stage: number) {
	if (stage >= 100) {
		if (!advanced[id]) throw new Error(`同行训练家缺少进阶礼物：${id}`);
		return advanced[id];
	}
	return TRAVELLERS[id]?.gifts[0] || (id in COMPANIONS ? companionGiftOptions(id as CompanionID)[0] : undefined) ||
		{ id: 'elixir', name: 'PP 全项小补剂' };
}
/** Every item in the game's Fantasy equipment category, with no random shortlist. */
export const AFFECTION_FANTASY_CHOICES = [...FANTASY_BLESSING_ITEMS];
export const AFFECTION_ADVANCED_REWARDS = '神奇糖果 ×2、金色王冠 ×1、任意自选幻想道具 ×1';
