import type { RogueDifficulty } from './rogue-difficulty';

/** Rules, text and telemetry share these IDs. Never infer enemy permissions from a PokemonSet. */
export const COLLAPSE_PARAMETERS = {
	erosion: 0.5, adaptationStep: 0.05, adaptationCap: 3, emergencyThreshold: 0.5,
	emergencyHeal: 0.2, readinessTurns: 3, cleanseTurns: 5, criticalBonus: 0.5, environmentBonus: 0.5,
	secondaryPoints: 5, vigilance: 1.25,
	power: 1.2, vitalityHP: 1.15, vitalityHeal: 0.1, inflation: 1.25, medicine: 0.75,
	stats: 1.1, coverage: 0.75, gasTurns: 5,
} as const;
/** Version 2 adventures retain both their selected IDs and original effects. */
export const LEGACY_COLLAPSE_ENTRIES = [
	{ id: 'erosion', name: '侵蚀抵抗', text: '敌方受到的外部间接伤害降低 50%，自损代价不变。',
		detail: '包括中毒、剧毒、灼伤、天气、撒钉、【盐腌】、【寄生种子】、幽灵系【诅咒】、持续束缚和对手的接触反伤。不减免反作用力、生命宝珠、【挣扎】、混乱自伤、【替身】或【腹鼓】的消耗，也不减免【地球上投】等招式直接伤害。【寄生种子】按实际扣血回复；不改变持续时间或剧毒计数。' },
	{ id: 'adaptation', name: '属性适应', text: '敌方受到某属性的直接伤害后，该属性后续伤害降低 5%，最多 15%。',
		detail: '每只敌人、每种属性独立累计，换人保留。同属性连续四次攻击的减伤为 0%、5%、10%、15%。多段招式结束后才增加一层；【替身】、保护、免疫、零伤害、固定伤害和一击必杀不计层数，也不享受此减伤。' },
	{ id: 'statusshield', name: '异常护盾', text: '每只敌人每场首次受到玩家施加的异常状态、混乱或哈欠时，将其抵挡。',
		detail: '仅限中毒、剧毒、灼伤、麻痹、睡眠、冰冻、混乱和哈欠。哈欠在施加瞌睡时被抵挡。天然免疫、特性或场地阻挡、未命中及【替身】阻挡均不消耗；【睡觉】、自身道具和【逆鳞】后的混乱也不消耗。不抵挡冻伤、畏缩、挑衅等其他效果。' },
	{ id: 'attachment', name: '附着防护', text: '敌方免疫【盐腌】、【寄生种子】、幽灵系【诅咒】和持续束缚，直接伤害照常。',
		detail: '仅阻挡上述附着状态。【火焰旋涡】等仍有首次直接伤害，但不能附加持续扣血与束缚。不免疫其他异常、能力下降、【灭亡之歌】、【同命】、【黑色目光】或【踩影】，也不赋予自由换人。' },
	{ id: 'emergency', name: '应急恢复', text: '每只敌人每场首次受伤后存活且生命值低于 50% 时，回复最大生命值的 20%。',
		detail: '恰好 50% 不触发；多段招式全部结算后检查，被击倒不能回复。间接伤害可以触发，【替身】、【腹鼓】等主动支付不触发。触发即消耗机会，受到禁疗时也不会延期补发。' },
	{ id: 'readiness', name: '能力整备', text: '敌方每累计在场 3 个回合，在回合结束时清除全部负向能力等级。',
		detail: '每只敌人独立计数，换下暂停，重新上场继续。第 3、6、9……次存活在场的回合结束时触发。攻击、防御、特攻、特防、速度、命中、闪避的负等级归零，正等级保留；包括自身招式造成的下降。不清除异常、附着或永久面板调整。' },
	{ id: 'critical', name: '要害防护', text: '敌方受到的基础要害额外伤害减半，并免疫一击必杀招式。',
		detail: '基础要害倍率按 1 +（原倍率 − 1）× 50% 计算，通常由 1.5 倍变为 1.25 倍。仍视为要害，照常忽略相应能力等级，【狙击手】等修正照常。一击必杀按招式标记判定，不包括普通高伤害、【同命】或【灭亡之歌】。' },
	{ id: 'environment', name: '环境适应', text: '天气与场地对敌方不利的直接伤害倍率变化减半。',
		detail: '玩家攻击的环境增伤减半，例如 1.5 倍变为 1.25 倍、1.3 倍变为 1.15 倍；敌方攻击的环境减伤减半，例如 0.5 倍变为 0.75 倍。分别处理每项实际生效的修正。有利于敌方的倍率不变，不改变属性克制、防御加成、回复、速度、免疫或招式失败规则。' },
	{ id: 'secondary', name: '追加效应', text: '敌方招式自带的有利概率附加效果，基础触发率提高 5 个百分点。',
		detail: '例如 10% 变为 15%，在【天恩】等倍率前计算，最终不超过 100%。包括对手异常、畏缩、能力下降与自身能力提升。不增加自身负面副作用、命中率、要害率、道具或特性触发率，不创造新效果。【强行】移除的效果不会恢复；【鳞粉】、密探斗篷照常生效。' },
	{ id: 'vigilance', name: '强化警戒', text: '玩家的正向能力等级实际增加时，场上敌人下一次有效普通攻击伤害提高 25%。',
		detail: '警戒不可叠加，整次多段或多目标攻击结束后消耗；打中【替身】也消耗。未命中、保护、免疫、变化招式、固定伤害和一击必杀不享受加成，也不消耗。负等级恢复到 0 不触发，【接棒】带来正等级会触发。敌方换下即解除，新上场不会因已有强化获得警戒。' },
] as const;
export const VERSION_THREE_COLLAPSE_ENTRIES = [
	{ id: 'power', name: '力量增幅', text: '敌方普通伤害招式造成的直接伤害提高 20%。',
		detail: '只提高普通招式的直接伤害，包括对【替身】的伤害；固定伤害、一击必杀、间接伤害和自损不变。与其他伤害修正相乘，不提高速度，不占用特性或道具。' },
	{ id: 'vitality', name: '生机充盈', text: '敌方最大生命值提高 15%；每只每场首次受伤后存活且生命值低于一半时，回复最大生命值的 10%。',
		detail: '恰好一半不触发；多段招式结束后检查，被击倒不能回复。间接伤害可以触发，主动生命支付不触发。达到条件即消耗机会，禁疗不会退还机会。换人、变身或首领转阶段不刷新；捕捉后不继承生命值强化。' },
	{ id: 'steadfast', name: '绝境坚守', text: '每只敌人每场一次：满血时受到致命的直接伤害，保留 1 点生命值。',
		detail: '生命值大于 1 且为满血时生效，包括固定伤害和一击必杀。多段招式的后续命中仍能击倒；间接伤害、自损与生命支付不触发。回满血、换人、变身和首领转阶段不刷新。原有【结实】或气势披带已成功保命时，不额外消耗本词条。' },
	LEGACY_COLLAPSE_ENTRIES[0],
	{ id: 'cleanse', name: '净化屏障', text: '每只敌人每场一次：抵挡首次来自我方的异常状态、混乱、哈欠或能力下降。',
		detail: '异常名单为中毒、剧毒、灼伤、麻痹、睡眠、冰冻、混乱和【哈欠】。也抵挡同一次效果实际造成的七项能力下降，正向变化保留。天然免疫、未命中、【替身】、已到下降下限或自身副作用不消耗。不会抵挡冻伤、畏缩、挑衅、附着效果或【黑雾】直接清除等级。可以先用【威吓】等消耗屏障。' },
	LEGACY_COLLAPSE_ENTRIES[1], LEGACY_COLLAPSE_ENTRIES[7], LEGACY_COLLAPSE_ENTRIES[9],
	{ id: 'inflation', name: '物价上涨', text: '局内商店商品价格提高 25%。',
		detail: '在原有折扣后计算，向上取整。免费奖励、出售收入、局外成长和治疗服务收费不变。只影响本局购买，不修改道具基础价格；以商品价换算的血量支付也随之提高。' },
	{ id: 'medicine', name: '药效衰减', text: '从背包使用的恢复药品，生命值回复量降低 25%。',
		detail: '先取药品原回复量与目标最大生命值中的较小值，再乘 75%，向下取整且至少 1 点；实际回复不超过缺失生命值。复活、解除异常与 PP 回复不变；休整中心、剧情治疗，以及招式、特性和携带道具的恢复正常。' },
] as const;
/** No tier or floor escalation: tiers increase the number of selected restrictions. */
export function collapseParameters(version = 5): { [K in keyof typeof COLLAPSE_PARAMETERS]: number } {
	return version < 4 ? COLLAPSE_PARAMETERS : { ...COLLAPSE_PARAMETERS,
		power: version >= 5 ? 1.20 : 1.15, vitalityHP: version >= 5 ? 1.20 : 1.15,
		inflation: 1.20, medicine: 0.80 };
}
export const VERSION_FOUR_COLLAPSE_ENTRIES = VERSION_THREE_COLLAPSE_ENTRIES.map(entry => ({ ...entry,
	text: entry.id === 'cleanse' ? '敌方每累计在场 5 个回合，清除自身异常状态、负面附着和全部能力下降。' :
		entry.id === 'power' ? entry.text.replace('20%', '15%') :
		['inflation', 'medicine'].includes(entry.id) ? entry.text.replace('25%', '20%') : entry.text,
	detail: entry.id === 'cleanse' ? '每只敌人独立计数，换下暂停，再登场继续。在第 5、10、15……个存活在场的回合结束时，清除全部异常状态（包括冻伤与叠加异常）、混乱、瞌睡、【盐腌】、【寄生种子】、幽灵系【诅咒】、持续束缚及其他负面附着，并将七项能力的负等级归零。正等级与有利效果保留；不回复生命、不清除场地或撒钉。期间可以正常施加状态，净化后也能再次施加；换人、变身、首领转阶段不重置计数。' :
		entry.id === 'medicine' ? entry.detail.replace('75%', '80%') : entry.detail,
}));
const previous = (id: string) => VERSION_FOUR_COLLAPSE_ENTRIES.find(entry => entry.id === id)!;
export const COLLAPSE_ENTRIES = [
	{ id: 'statbloat', name: '数值膨胀', text: '所有敌方宝可梦的六项能力提高 10%。',
		detail: 'HP、攻击、防御、特攻、特防和速度均提高 10%，与其他修正相乘。不提升命中或闪避等级；捕捉后不保留，变身或复制也不会获得敌方词条权限。' },
	{ id: 'abilitygas', name: '特性超模', text: '每场战斗前 5 回合，只有我方宝可梦受到【化学变化气体】的特性压制。',
		detail: '从首次登场起至第 5 回合结束，压制我方可被【化学变化气体】抑制的特性，包括额外特性；敌方不受此词条影响。【特性护具】及原本不能被气体抑制的特性遵循原规则。换人和首领转阶段不会重置时限，第 6 回合起恢复正常。' },
	{ ...previous('power'), id: 'power', name: '威力过量', text: '敌方普通伤害招式造成的直接伤害提高 20%。' },
	{ ...previous('vitality'), id: 'vitality', name: '回复泛滥', text: '敌方最大生命值提高 20%；每只每场首次受伤后存活且生命值低于一半时，回复最大生命值的 10%。' },
	{ ...previous('vigilance'), id: 'vigilance', name: '增益无度' },
	{ id: 'coverage', name: '打击溢面', text: '敌方受到我方非本系招式的伤害降低 25%。',
		detail: '按招式实际结算属性与使用者当时的本系判定；太晶化保留的原本属性及太晶属性均按原引擎规则处理。星晶对非本系招式的一次增伤不会使其变成本系。作用于普通直接伤害，包括对【替身】的伤害；固定伤害、一击必杀和间接伤害不变。' },
	{ ...previous('steadfast'), id: 'steadfast', name: '机制恼人', text: '每只敌人每场一次：受到致命的直接伤害时，保留 1 点生命值。',
		detail: '无需满血，剩余 1 点生命值时也能抵挡一次致命命中；包括固定伤害和一击必杀。多段招式的后续命中仍能击倒。间接伤害、自损和生命支付不触发。换人、变身、回复和首领转阶段不刷新；原有【结实】或【气势披带】已成功保命时不消耗。' },
	{ ...previous('cleanse'), id: 'cleanse', name: '异常失控', text: '非招式造成的伤害降低 50%；敌方每累计在场 5 回合，清除异常状态、负面附着及能力下降。',
		detail: previous('cleanse').detail + '非招式伤害指中毒、灼伤、天气、撒钉、【盐腌】、【寄生种子】等持续扣血及对手的接触反伤；招式首次直接伤害与固定伤害不减免。反作用力、【生命宝珠】、混乱自伤、【替身】和【腹鼓】等自身代价不减免。' },
	{ ...previous('environment'), id: 'environment', name: '环境独霸' },
	{ ...previous('inflation'), id: 'inflation', name: '沉没成本' },
] as const;
export type CollapseID = typeof COLLAPSE_ENTRIES[number]['id'] | typeof VERSION_THREE_COLLAPSE_ENTRIES[number]['id'] | typeof LEGACY_COLLAPSE_ENTRIES[number]['id'];
export function collapseEntries(version = 5) {
	return version < 3 ? LEGACY_COLLAPSE_ENTRIES : version === 3 ? VERSION_THREE_COLLAPSE_ENTRIES :
		version === 4 ? VERSION_FOUR_COLLAPSE_ENTRIES : COLLAPSE_ENTRIES;
}
export const collapseCount = (tier: RogueDifficulty = 0) => tier === 'easy' ? 0 : tier * 2;
export function validCollapseSelection(tier: RogueDifficulty, value: unknown): value is CollapseID[] {
	return Array.isArray(value) && value.length === collapseCount(tier) && new Set(value).size === value.length &&
		value.every(id => COLLAPSE_ENTRIES.some(entry => entry.id === id));
}
export interface CollapseMetrics {
	triggers: Partial<Record<CollapseID, number>>;
}
export interface CollapseHistory {
	/** One record per started run; stored separately from battle settlements. */
	runs: number;
	battles: number;
	turns: number;
	wins: number;
	clears: number;
	selections: Partial<Record<CollapseID, number>>;
	triggers: Partial<Record<CollapseID, number>>;
}
