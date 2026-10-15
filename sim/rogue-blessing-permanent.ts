import { Dex, toID } from './dex';
import type { RoguePokemon } from './fantasy-rogue';
import { emblemType } from './rogue-blessing-data';

export const DRAGON_KING_ABILITIES = ['longzhihuxi', 'drizzle'] as const;
export type DragonKingAbility = typeof DRAGON_KING_ABILITIES[number];
export interface DragonKing { member: string; ability?: DragonKingAbility }
export interface RogueTonics { wine?: boolean; cephalosporin?: boolean; poison?: boolean }
export function permanentMemberTypes(mon: RoguePokemon) {
	const types = [...Dex.mod('gen9fantasy').species.get(mon.set.species).types];
	if (mon.statModifiers?.extraType) types[1] = mon.statModifiers.extraType;
	const emblem = emblemType(toID(mon.set.item));
	if (emblem) types[types.length > 1 ? 1 : types[0] === emblem ? 0 : 1] = emblem;
	if (mon.tonics?.wine && mon.tonics.cephalosporin) types[1] = 'Ghost';
	return [...new Set(types)];
}
export function memberStatTotal(mon: RoguePokemon) {
	return mon.maxhp + (['atk', 'def', 'spa', 'spd', 'spe'] as const)
		.reduce((sum, stat) => sum + (mon.stats?.[stat] || 0), 0);
}
export function strongestDragon(team: RoguePokemon[]) {
	return team.filter(mon => permanentMemberTypes(mon).includes('Dragon'))
		.sort((a, b) => memberStatTotal(b) - memberStatTotal(a) || (a.joinOrder || 0) - (b.joinOrder || 0))[0];
}
export const TONIC_SECRET = '同时使用酒与头孢后，第二属性变为幽灵；改属性前为毒系的伙伴，毒属性招式威力永久 ×1.5。';
export const TONIC_HINT = '酒与头孢都喂给同一只伙伴后会有特殊效果，尤其是毒系伙伴！';
export function tonicDescription(id: string, discovered = false) {
	const text = id === 'wine' ? '每次登场陷入混乱；每场首个实际使出的招式威力 ×2，变化招式或打空也消耗机会。' :
		'永久免疫中毒、剧毒、烧伤、麻痹、睡眠、冰冻与冻伤，不免疫混乱。';
	return text + (discovered ? TONIC_SECRET : TONIC_HINT);
}
