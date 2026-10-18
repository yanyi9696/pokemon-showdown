import { toID } from './dex';
import type { RoguePokemon } from './fantasy-rogue';
import type { BlessingEffects } from './rogue-blessing-data';
import { assignedExtraAbilities, memberStatTotal, permanentMemberTypes } from './rogue-blessing-permanent';

export type CompanionID = keyof typeof COMPANIONS;
export interface RogueCompanion {
	id: CompanionID; member?: string; type?: string; ability?: string;
	rewardRemainder?: Record<string, number>;
	preferences: number; rewarded?: boolean; counted?: string[];
	chatSeen?: number[]; praiseSeen?: number[]; message?: string; smile?: 'chat' | 'approval';
	messageAt?: number; eventKey?: string; consulted?: string;
}
export const COMPANIONS = {
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
	companion: RogueCompanion, mon: RoguePokemon, team: RoguePokemon[], effects: BlessingEffects
) {
	const abilities = COMPANIONS[companion.id].abilities as Record<string, readonly string[]>;
	const other = { ...effects, companions: effects.companions?.filter(c => c !== companion) };
	return (abilities[companion.type || ''] || []).filter(id => id !== toID(mon.set.ability) &&
		!assignedExtraAbilities(mon, team, other).includes(toID(id)));
}
export function syncCompanions(effects: BlessingEffects, team: RoguePokemon[]) {
	for (const companion of effects.companions || []) {
		if (companion.id === 'acerola' && companion.ability === 'stalwart') companion.ability = 'moldbreaker';
		if (!companion.type) continue;
		const strongest = strongestTypedMember(team, companion.type);
		if (companion.member !== strongest?.id) {
			companion.member = strongest?.id;
			delete companion.ability;
		}
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
