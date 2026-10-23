import type { Move } from '../../sim/dex-moves';

/** Categories describe the effective Fantasy move, including unchanged native moves. */
export const MOVE_CATEGORIES: Record<string, string> = {
	all: '全部招式', light: '光类', shooting: '射击类', contact: '接触类', multihit: '连续招式',
	recharge: '硬直类', charge: '蓄力类', heal: '回复类', drain: '吸取 HP 类', lower: '降低能力类',
	recoil: '反作用力类', explosion: '爆炸类', bite: '啃咬类', punch: '拳击类', pulse: '波动／波导类',
	sound: '声音类', powder: '粉末类', bullet: '球弹类', mental: '心神类', dance: '舞蹈类',
	wind: '风类', slicing: '切斩类', binding: '绑紧招式', signaturez: '专属 Z 招式',
};
const mental = new Set(['attract', 'disable', 'encore', 'healblock', 'taunt', 'torment']);
const explosions = new Set(['selfdestruct', 'explosion', 'mistyexplosion']);
const callbackDrops = new Set(['partingshot', 'strengthsap', 'tickle', 'venomdrench', 'octolock', 'captivate']);
const negative = (boosts?: SparseBoostsTable | null) => Object.values(boosts || {}).some(value => value < 0);
export function moveCategories(move: Move, signatureZ: ReadonlySet<string>): string[] {
	const groups = ['all'];
	for (const flag of ['light', 'shooting', 'contact', 'recharge', 'charge', 'heal', 'bite', 'punch',
		'pulse', 'sound', 'powder', 'bullet', 'dance', 'wind', 'slicing'] as const) if (move.flags[flag]) groups.push(flag);
	if (move.multihit) groups.push('multihit');
	if (move.drain) groups.push('drain');
	if (negative(move.boosts) && move.target !== 'self' || move.secondaries?.some(effect => negative(effect.boosts)) ||
		callbackDrops.has(move.id)) groups.push('lower');
	if (move.recoil || move.hasCrashDamage || move.struggleRecoil || ['steelbeam', 'mindblown', 'chloroblast'].includes(move.id)) groups.push('recoil');
	if (explosions.has(move.id)) groups.push('explosion');
	if (mental.has(move.id)) groups.push('mental');
	if (move.volatileStatus === 'partiallytrapped' || move.secondaries?.some(effect => effect.volatileStatus === 'partiallytrapped')) groups.push('binding');
	if (move.isZ && (signatureZ.has(move.id) || move.isNonstandard === 'Custom')) groups.push('signaturez');
	return groups;
}
