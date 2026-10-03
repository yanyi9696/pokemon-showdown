import { Battle } from '../../sim/battle';
import { Dex, toID } from '../../sim/dex';

export const EXTREME_CAPS: Readonly<Record<string, string>> = {
	gen9fcubersuu: 'OU', gen9fcou: 'UUBL', gen9fcuu: 'RUBL',
};
const TIERS = [
	'AG', 'Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PUBL', 'PU', 'ZUBL', 'ZU', 'NFE', 'LC Uber', 'LC',
];
// This custom form's Dex entry omits requiredAbility. Its native ability can
// transform it on a knockout (or immediately with Greninja-Ash-Z).
const CUSTOM_FORM_ABILITIES: Readonly<Record<string, string>> = {
	greninjaashfantasy: 'Chao Yue Qian Ban Bian Shen',
};

export function extremeDescription(format: string): string {
	const cap = EXTREME_CAPS[toID(format)];
	return cap ? `玩家仅可使用 ${cap} 及以下宝可梦；配置可触发超标的 Mega、超巨进化或其他进化形态时也禁止。` +
		`其他禁令沿用原挑战赛制，NPC 队伍不受这项额外分级限制。` : '这个赛制暂不支持极限挑战。';
}

/** Additional player-only species checks. Never import a lower format's item/ability bans. */
export function validateExtremeTeam(formatName: string, team: PokemonSet[]): string[] {
	const format = Dex.formats.get(formatName);
	const cap = EXTREME_CAPS[format.id];
	if (!cap) return ['这个赛制暂不支持极限挑战。'];
	const battle = new Battle({ formatid: format.id, seed: 'gen5,0000000000000000', deserialized: true,
		p1: { team: structuredClone(team) }, p2: { team: structuredClone(team) } });
	const problems: string[] = [];
	try {
		for (const [index, mon] of battle.p1.pokemon.entries()) {
			const set = team[index];
			const forms = new Set([mon.species.name]);
			for (const target of [mon.canMegaEvo, mon.canMegaEvoX, mon.canMegaEvoY, mon.canUltraBurst]) {
				if (target) forms.add(target);
			}
			// Required-item/ability forms include Primals and native/custom automatic
			// transformations. The native Mega checks above also cover no-stone moves.
			let added = true;
			while (added) {
				added = false;
				for (const target of battle.dex.species.all()) {
					if (forms.has(target.name)) continue;
					const from = target.battleOnly || target.changesFrom;
					const sources = Array.isArray(from) ? from : [from];
					if (!sources.some(source => source && forms.has(source))) continue;
					const items = target.requiredItems || (target.requiredItem ? [target.requiredItem] : []);
					const ability = target.requiredAbility || CUSTOM_FORM_ABILITIES[target.id];
					if (!items.length && !ability && !target.requiredMove) continue;
					if (items.length && !items.some(item => toID(item) === toID(set.item))) continue;
					if (ability && toID(ability) !== toID(set.ability)) continue;
					if (target.requiredMove && !set.moves.some(move => toID(move) === toID(target.requiredMove))) continue;
					if (target.isMega && ![mon.canMegaEvo, mon.canMegaEvoX, mon.canMegaEvoY].includes(target.name)) continue;
					forms.add(target.name);
					added = true;
				}
			}
			for (const name of forms) {
				const species = battle.dex.species.get(name);
				const rawTier = species.natDexTier;
				const tier = rawTier === '(PU)' ? 'ZU' : rawTier === '(NU)' ? 'PU' : rawTier.replace(/[()]/g, '');
				const rank = TIERS.indexOf(tier);
				const ability = species.requiredAbility || CUSTOM_FORM_ABILITIES[species.id];
				const trigger = [set.item && `道具：${set.item}`, species.requiredMove && `招式：${species.requiredMove}`,
					ability && `特性：${ability}`].filter(Boolean).join('，');
				const label = name === mon.species.name ? name : `${mon.species.name} 可变为 ${name}（${trigger || '配置触发'}）`;
				if (rank < 0) {
					problems.push(`第 ${index + 1} 只：${label} 的分级“${rawTier || '未定级'}”不能用于极限挑战。`);
				} else if (rank < TIERS.indexOf(cap)) {
					problems.push(`第 ${index + 1} 只：${label} 属于 ${tier}；本次极限挑战仅允许 ${cap} 及以下。`);
				}
			}
		}
	} finally {
		battle.destroy();
	}
	return problems;
}
