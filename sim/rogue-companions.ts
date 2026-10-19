import { toID } from './dex';
import type { RoguePokemon } from './fantasy-rogue';
import type { BlessingEffects } from './rogue-blessing-data';
import { assignedExtraAbilities, memberStatTotal, permanentMemberTypes } from './rogue-blessing-permanent';

export type CompanionID = keyof typeof COMPANIONS;
export interface RogueCompanion {
	id: CompanionID; member?: string; type?: string; ability?: string;
	rewardRemainder?: Record<string, number>;
	preferences: number; rewarded?: boolean; counted?: string[];
	giftPending?: boolean;
	chatSeen?: number[]; praiseSeen?: number[]; message?: string; smile?: 'chat' | 'approval';
	messageAt?: number; eventKey?: string; consulted?: string;
}
export const COMPANIONS = {
	marnie: { name: '玛俐', family: 'companionband', types: ['Dark'],
		abilities: { Dark: ['darkaura', 'intimidate'] }, region: 'galar' },
	roxie: { name: '霍米加', family: 'companionband', types: ['Poison'],
		abilities: { Poison: ['duwupifu', 'punkrock'] }, region: 'unova' },
	lacey: { name: '紫芋', family: 'companionlacey', types: ['Fairy'],
		abilities: { Fairy: ['fairyaura', 'tianlaizhiyin'] }, region: 'paldea' },
	kahili: { name: '卡希丽', family: 'companionkahili', types: ['Flying'],
		abilities: { Flying: ['aerilate', 'technician'] }, region: 'alola' },
	liko: { name: '莉可', family: 'companionliko', types: ['Grass'],
		abilities: { Grass: ['flowergift', 'grassysurge'] }, region: 'paldea' },
	giovanni: { name: '坂木', family: 'companiongiovanni', types: ['Psychic'],
		abilities: { Psychic: ['psychicsurge', 'sheerforce'] }, region: 'kanto' },
	lysandre: { name: '弗拉达利', family: 'companionlysandre', types: ['Fire'],
		abilities: { Fire: ['firemane', 'magmaarmor'] }, region: 'kalos' },
	olivia: { name: '莉兹', family: 'companionolivia', types: ['Rock'],
		abilities: { Rock: ['sandforce', 'sandstream'] }, region: 'alola' },
	grusha: { name: '古鲁夏', family: 'companionwinter', types: ['Ice'],
		abilities: { Ice: ['xuezhili', 'snowwarning'] }, region: 'paldea' },
	rika: { name: '辛俐', family: 'companionwinter', types: ['Ground'],
		abilities: { Ground: ['stamina', 'watercompaction'] }, region: 'paldea' },
	poppy: { name: '波琵', family: 'companionpoppy', types: ['Steel'],
		abilities: { Steel: ['steelyspirit', 'tiekai'] }, region: 'paldea' },
	iris: { name: '爱丽丝', family: 'dragonking', types: [], abilities: {}, region: 'unova' },
	guzma: { name: '古兹马', family: 'companionguzma', types: ['Bug'],
		abilities: { Bug: ['tintedlens', 'huibizaisheng'] }, region: 'alola' },
	iono: { name: '奇树', family: 'companionstreamer', types: ['Electric'],
		abilities: { Electric: ['galvanize', 'leitingxingzhe'] }, region: 'paldea' },
	canari: { name: '卡娜莉', family: 'companionstreamer', types: ['Electric'],
		abilities: { Electric: ['galvanize', 'leitingxingzhe'] }, region: 'kalos' },
	bea: { name: '彩豆', family: 'companionbea', types: ['Fighting'],
		abilities: { Fighting: ['guts', 'hustle'] }, region: 'galar' },
	acerola: { name: '阿塞罗拉', family: 'companionacerola', types: ['Ghost', 'Normal'],
		abilities: { Ghost: ['emengchanrao', 'guiying'], Normal: ['mindseye', 'moldbreaker'] }, region: 'alola' },
	lana: { name: '水莲', family: 'companionlana', types: ['Water'],
		abilities: { Water: ['chaojiyushui', 'swiftswim'] }, region: 'alola' },
	sada: { name: '奥琳 AI', family: 'companionai', types: [], abilities: {}, region: 'paldea' },
	turo: { name: '弗图 AI', family: 'companionai', types: [], abilities: {}, region: 'paldea' },
} as const;
export const COMPANION_REGIONS: Record<string, string> = {
	kanto: '关都', johto: '城都', hoenn: '丰缘', sinnoh: '神奥', unova: '合众',
	kalos: '卡洛斯', alola: '阿罗拉', galar: '伽勒尔', paldea: '帕底亚', hisui: '洗翠',
};
export const COMPANION_PREFERENCES: Record<CompanionID, 'battle' | 'pokemon' | 'reward' | 'fish' | 'stone' | 'explore'> = {
	bea: 'battle', guzma: 'battle', lysandre: 'battle', iono: 'battle', canari: 'battle', giovanni: 'battle', roxie: 'battle',
	acerola: 'pokemon', iris: 'pokemon', grusha: 'pokemon', rika: 'pokemon', kahili: 'pokemon',
	poppy: 'reward', marnie: 'reward', lacey: 'reward', liko: 'reward', lana: 'fish', olivia: 'stone', sada: 'explore', turo: 'explore',
};
export const TYPE_GIFTS: Record<string, { id: string, name: string }> = {
	Fire: { id: 'charcoal', name: '木炭' }, Rock: { id: 'hardstone', name: '硬石头' }, Ice: { id: 'nevermeltice', name: '不融冰' },
	Ground: { id: 'softsand', name: '柔软沙子' }, Steel: { id: 'metalcoat', name: '金属膜' }, Dragon: { id: 'dragonfang', name: '龙之牙' },
	Bug: { id: 'silverpowder', name: '银粉' }, Electric: { id: 'magnet', name: '磁铁' }, Fighting: { id: 'blackbelt', name: '黑带' },
	Ghost: { id: 'spelltag', name: '诅咒之符' }, Normal: { id: 'silkscarf', name: '丝绸围巾' }, Water: { id: 'mysticwater', name: '神秘水滴' },
	Dark: { id: 'blackglasses', name: '黑色眼镜' }, Poison: { id: 'poisonbarb', name: '毒针' }, Fairy: { id: 'fairyfeather', name: '妖精之羽' },
	Flying: { id: 'sharpbeak', name: '锐利鸟嘴' }, Grass: { id: 'miracleseed', name: '奇迹种子' }, Psychic: { id: 'twistedspoon', name: '弯曲的汤匙' },
};
export function companionGiftOptions(id: CompanionID) {
	return (id === 'iris' ? ['Dragon'] : [...COMPANIONS[id].types]).map(type => ({ type, ...TYPE_GIFTS[type] }));
}
export function companionPreferenceText(id: CompanionID) {
	const preference = { battle: '带有战斗', pokemon: '有宝可梦出现', reward: '带有奖励', fish: '进入钓鱼区域', stone: '参与赌石', explore: '调查与探索' }[COMPANION_PREFERENCES[id]];
	return `【${COMPANIONS[id].name}】偏好与${COMPANION_REGIONS[COMPANIONS[id].region]}相关、或${preference}的选项。`;
}
export const companionSource = (id: CompanionID) => `【同行训练家 - ${COMPANIONS[id].name}】`;
export const companionOwned = (effects: BlessingEffects | undefined, id: CompanionID) =>
	effects?.companions?.find(c => c.id === id);
export const companionHasGift = (id: CompanionID) => COMPANIONS[id].family !== 'companionai';
export const companionFamily = (family: string) => Object.values(COMPANIONS).some(c => c.family === family);
export function companionFamilyTypes(family: string): string[] {
	return family === 'dragonking' ? ['Dragon'] : [...new Set(Object.values(COMPANIONS)
		.filter(c => c.family === family).flatMap(c => [...c.types] as string[]))];
}
export function companionAvailable(family: string, team: RoguePokemon[], effects?: BlessingEffects) {
	if (!companionFamily(family)) return true;
	if (effects?.owned.some(b => companionFamily(b.family))) return false;
	const types = companionFamilyTypes(family);
	return !types.length || team.some(mon => permanentMemberTypes(mon).some(t => types.includes(t)));
}
export function strongestTypedMember(team: RoguePokemon[], type: string) {
	return team.filter(mon => permanentMemberTypes(mon).includes(type)).sort((a, b) =>
		memberStatTotal(b) - memberStatTotal(a) || (a.joinOrder || 0) - (b.joinOrder || 0))[0];
}
export function companionAbilityOptions(
	companion: RogueCompanion, mon: RoguePokemon | undefined, team: RoguePokemon[], effects: BlessingEffects
) {
	const abilities = COMPANIONS[companion.id].abilities as Record<string, readonly string[]>;
	const other = { ...effects, companions: effects.companions?.filter(c => c !== companion) };
	return (abilities[companion.type || ''] || []).filter(id => !mon || id === companion.ability ||
		id !== toID(mon.set.ability) && !assignedExtraAbilities(mon, team, other).includes(toID(id)));
}
export function syncCompanions(effects: BlessingEffects, team: RoguePokemon[]) {
	for (const companion of effects.companions || []) {
		if (companion.id === 'acerola' && companion.ability === 'stalwart') companion.ability = 'moldbreaker';
		if (!companion.type) continue;
		const strongest = strongestTypedMember(team, companion.type);
		// Guidance follows the strongest eligible partner; retain the player's chosen lesson while absent.
		companion.member = strongest?.id;
		if (strongest && companion.ability &&
			!companionAbilityOptions(companion, strongest, team, effects).includes(companion.ability)) {
			delete companion.ability;
		}
	}
}
export function companionAppearance(family: string, team: RoguePokemon[]) {
	const types = companionFamilyTypes(family);
	if (!types.length) return 1;
	const matches = team.map(mon => permanentMemberTypes(mon));
	if (!matches.some(member => types.some(type => member.includes(type)))) return 0;
	const pair = matches.some((a, i) => matches.some((b, j) => i !== j &&
		a.includes(types[0]) && b.includes(types[1] || types[0])));
	return pair ? 2 : 1;
}
