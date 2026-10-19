import { Dex, toID } from './dex';
import type { RoguePokemon } from './fantasy-rogue';
import { emblemType, ownsBlessing, type BlessingEffects } from './rogue-blessing-data';

export const DRAGON_KING_ABILITIES = ['longzhihuxi', 'drizzle'] as const;
export type DragonKingAbility = typeof DRAGON_KING_ABILITIES[number];
export interface DragonKing { member: string; ability?: DragonKingAbility }
export interface RogueTonics { wine?: boolean; cephalosporin?: boolean; poison?: boolean }
export const TARGET_BLESSING_ABILITIES: Record<string, string> = { hazards: 'yanbuzhen', toxic: 'merciless' };
export const POWER_CHOICE_ABILITIES = ['hugepower', 'roguegreatmage'];
export function strongestBlessingMember(team: RoguePokemon[], baseSpecies: string) {
	const sum = (stats: Partial<StatsTable>) => Object.values(stats || {}).reduce((n, value) => n + (value || 0), 0);
	const species = baseSpecies.split('|').map(toID);
	return team.filter(mon => !mon.egg && species.includes(toID(Dex.mod('gen9fantasy').species.get(mon.set.species).baseSpecies).replace(/fantasy$/, '') as ID))
		.sort((a, b) => b.set.level - a.set.level || sum(b.set.evs) - sum(a.set.evs) ||
			sum(b.set.ivs) - sum(a.set.ivs) || (b.set.happiness || 0) - (a.set.happiness || 0) ||
			(a.joinOrder || 0) - (b.joinOrder || 0))[0];
}
/** All permanent and team-wide sources, used before granting another copy of an ability. */
export function assignedExtraAbilities(mon: RoguePokemon, team: RoguePokemon[], effects?: BlessingEffects, includeKing = true) {
	if (mon.egg) return [];
	const result = [...mon.extraAbilities || []].map(toID);
	const add = (...abilities: string[]) => result.push(...abilities.map(toID));
	for (const [family, ability] of Object.entries(TARGET_BLESSING_ABILITIES)) {
		if (ownsBlessing(effects, family)?.target === mon.id) add(ability);
	}
	if (team.includes(mon)) {
		for (const companion of effects?.companions || []) {
			if (companion.member === mon.id && companion.ability) add(companion.ability);
		}
		if (ownsBlessing(effects, 'arsenal')) add('bianhuanziyou');
		if (ownsBlessing(effects, 'restinball')) add('regenerator', 'naturalcure');
		if (ownsBlessing(effects, 'duck') && strongestBlessingMember(team, 'psyduck|golduck')?.id === mon.id) add('neuroforce');
		if (strongestBlessingMember(team, 'meloetta')?.id === mon.id) {
			if (ownsBlessing(effects, 'singer')) add('tianlaizhiyin', 'jizhineng');
			if (ownsBlessing(effects, 'dancer')) add('dancer');
		}
		if (includeKing && effects?.dragonKing?.member === mon.id && effects.dragonKing.ability) add(effects.dragonKing.ability);
	}
	return [...new Set(result)];
}
export function canGrantExtraAbility(mon: RoguePokemon, ability: string, team: RoguePokemon[], effects?: BlessingEffects, includeKing = true) {
	const id = toID(ability);
	return !mon.egg && id !== toID(mon.set.ability) && !assignedExtraAbilities(mon, team, effects, includeKing).includes(id);
}
export function dragonKingAbilityOptions(mon: RoguePokemon | undefined, team: RoguePokemon[], effects?: BlessingEffects) {
	return DRAGON_KING_ABILITIES.filter(ability => !mon || ability === effects?.dragonKing?.ability || canGrantExtraAbility(mon, ability, team, effects, false));
}
export function permanentMemberTypes(mon: RoguePokemon) {
	if (mon.egg) return [];
	const types = [...Dex.mod('gen9fantasy').species.get(mon.set.species).types];
	if (mon.statModifiers?.extraType) types[1] = mon.statModifiers.extraType;
	const emblem = emblemType(mon.emblem || toID(mon.set.item));
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
export const TONIC_SECRET = '同时使用【酒】与【头孢】后，副属性变为幽灵；原本为毒系的伙伴，毒属性招式威力永久提升 50%。';
export const TONIC_HINT = '【酒】与【头孢】同用会有特殊效果，尤其是毒系伙伴！';
export function tonicDescription(id: string, discovered = false) {
	const text = id === 'wine' ? '使用者每次登场陷入混乱；每场使出的第一个招式威力翻倍。' :
		'永久免疫中毒、剧毒、烧伤、麻痹、睡眠、冰冻与冻伤，不免疫混乱。';
	return text + (discovered ? TONIC_SECRET : TONIC_HINT);
}
