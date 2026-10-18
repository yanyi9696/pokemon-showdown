import { toID } from './dex';
import type { RoguePokemon } from './fantasy-rogue';
import type { BlessingEffects } from './rogue-blessing-data';
import { assignedExtraAbilities, memberStatTotal, permanentMemberTypes } from './rogue-blessing-permanent';

export type CompanionID = 'bea' | 'acerola' | 'lana' | 'sada' | 'turo' | 'iono' | 'canari' | 'poppy' | 'iris' | 'guzma';
export interface RogueCompanion {
	id: CompanionID; member?: string; type?: string; ability?: string;
	rewardRemainder?: Record<string, number>;
	preferences: number; rewarded?: boolean; counted?: string[];
	chatSeen?: number[]; praiseSeen?: number[]; message?: string; smile?: 'chat' | 'approval';
	messageAt?: number; eventKey?: string; consulted?: string;
}
export const COMPANIONS = {
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
	const count = (type: string) => team.filter(mon => permanentMemberTypes(mon).includes(type)).length;
	if (family === 'companionacerola') {
		return count('Ghost') && count('Normal') ? 1.5 : !count('Ghost') && !count('Normal') ? 0.35 : 1;
	}
	const type = ({
		dragonking: 'Dragon', companionbea: 'Fighting', companionlana: 'Water', companionstreamer: 'Electric',
		companionpoppy: 'Steel', companionguzma: 'Bug',
	} as Record<string, string>)[family];
	return type ? count(type) >= 2 ? 1.5 : count(type) ? 1 : 0.35 : 1;
}
