import { COMPANIONS, COMPANION_PREFERENCES, COMPANION_REGIONS, companionGiftOptions, type CompanionID } from '../../sim/rogue-companions';
import { RIVALS, RIVAL_SNACK_GIFTS, RIVAL_FAREWELLS, CARMINE } from './rival-data';
import { COMPANION_DIALOGUE, COMPANION_GIFT_LINES } from './companion-dialogue';
import { TrainerBossData } from './trainer-boss-data';
import { Teams } from '../../sim/teams';

export interface TravellerProfile {
	id: string; name: string; region: string; preference: 'battle' | 'reward' | 'pokemon';
	areas: string[]; gifts: { id: string, name: string }[]; team: string[];
	greeting: string; farewell: string; thanks: string;
}
const GYM_PROFILES: Record<string, [string, TravellerProfile['preference'], string[], string, string, string]> = {
	brock: ['关都', 'pokemon', ['reward'], 'hardstone', '硬石头', '路上有没有好好照顾伙伴？训练也好，休息也好，都不能马虎。'],
	sabrina: ['关都', 'pokemon', ['event'], 'twistedspoon', '弯曲的汤匙', '你与伙伴的心意，让前方的道路有了新的可能。'],
	flannery: ['丰缘', 'battle', ['wild'], 'charcoal', '木炭', '来得正好！伙伴们精神这么好，不活动一下可惜了。'],
	viola: ['卡洛斯', 'pokemon', ['event'], 'silverpowder', '银粉', '先别动，这个和伙伴并肩的瞬间，值得好好拍下来！'],
	nessa: ['伽勒尔', 'battle', ['wild'], 'mysticwater', '神秘水滴', '每一场对战都像潮汐，得读懂它，才能走得更远。'],
	larry: ['帕底亚', 'reward', ['trade'], 'silkscarf', '丝绸围巾', '休息也是行程的一部分。补给足够，工作……旅行才做得下去。'],
	lorelei: ['关都', 'pokemon', ['event'], 'nevermeltice', '不融冰', '冷静观察伙伴的状态，比一味向前冲更重要。'],
	lance: ['关都', 'battle', ['elite'], 'dragonfang', '龙之牙', '力量应当用来保护伙伴。让我听听你的想法。'],
	steven: ['丰缘', 'reward', ['event'], 'metalcoat', '金属膜', '这条路上有许多值得留心的矿石。宝可梦也是，值得慢慢了解。'],
};
export function travellerProfiles(): TravellerProfile[] {
	const profiles = new Map<string, TravellerProfile>();
	for (const [id, c] of Object.entries(COMPANIONS)) {
		if (['sada', 'turo'].includes(id)) continue;
		const key = id as CompanionID, p = COMPANION_PREFERENCES[key];
		const preference = p === 'battle' || p === 'reward' ? p : 'pokemon';
		profiles.set(id, { id, name: c.name, region: COMPANION_REGIONS[c.region], preference,
			areas: p === 'battle' ? ['wild', 'elite'] : p === 'reward' ? ['reward', 'trade'] : ['event'],
			gifts: companionGiftOptions(key), team: [], greeting: COMPANION_DIALOGUE[key].chat[0],
			farewell: `${COMPANION_DIALOGUE[key].praise[0]} 接下来的路，我也会期待你的好消息。下次再见！`,
			thanks: COMPANION_GIFT_LINES[key] });
	}
	for (const [id, [region, preference, areas, item, name, greeting]] of Object.entries(GYM_PROFILES)) {
		profiles.set(id, { id, name: TrainerBossData.find(t => t.id === id)!.name.replace(/[（(].*$/, ''),
			region, preference, areas, gifts: [{ id: item, name }], team: [], greeting,
			farewell: `${greeting} 那就先在这里告别，记得照顾好你们自己。`,
			thanks: '一路同行，你的选择让我看见了你对伙伴的心意。这份礼物请收下。' });
	}
	for (const [id, r] of Object.entries(RIVALS)) {
		const key = id as keyof typeof RIVALS, gift = RIVAL_SNACK_GIFTS[key];
		const preference = ['marnie', 'penny', 'bede'].includes(id) ? 'reward' :
			['korrina', 'nemona', 'blue', 'silver', 'kieran'].includes(id) ? 'battle' : 'pokemon';
		profiles.set(id, { id, name: r.name, region: r.region, preference,
			areas: preference === 'battle' ? ['wild', 'elite'] : preference === 'reward' ? ['reward', 'trade'] : ['event'],
			team: [...r.team], gifts: [{ id: gift.item, name: gift.name }], greeting: r.lines[3],
			farewell: RIVAL_FAREWELLS[key], thanks: gift.line });
	}
	profiles.set('carmine', { id: 'carmine', name: CARMINE.name, region: '北上乡', preference: 'pokemon',
		areas: ['event'], team: CARMINE.team, gifts: [{ id: CARMINE.item, name: CARMINE.giftName }],
		greeting: CARMINE.lines[3], farewell: '我得先回北上乡看看了。你们可要好好照顾自己，下次见面再聊！',
		thanks: '这个是给你的，才不是顺手捡的！遇到麻烦别总是一个人硬撑。' });
	for (const profile of profiles.values()) if (!profile.team.length) {
		const roster = TrainerBossData.find(t => t.id === profile.id);
		profile.team = roster ? Teams.import(roster.team)!.map(set => set.species) :
			({ liko: ['Floragato', 'Hattrem', 'Terapagos'], guzma: ['Golisopod', 'Ariados', 'Pinsir'],
				lana: ['Araquanid', 'Lanturn', 'Wishiwashi'], iono: ['Wattrel', 'Bellibolt', 'Luxio'],
				canari: ['Eelektrik', 'Emolga', 'Ampharos'], lysandre: ['Pyroar', 'Gyarados', 'Honchkrow'],
				olivia: ['Lycanroc', 'Nosepass', 'Boldore'], grusha: ['Frosmoth', 'Beartic', 'Cetitan'],
				rika: ['Whiscash', 'Camerupt', 'Clodsire'], poppy: ['Copperajah', 'Bronzong', 'Tinkaton'],
			} as Record<string, string[]>)[profile.id] || ['Eevee', 'Pikachu', 'Growlithe'];
	}
	return [...profiles.values()];
}
export const TRAVELLERS = Object.fromEntries(travellerProfiles().map(profile => [profile.id, profile]));
