import { Dex, toID } from '../../sim/dex';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueRun } from './types';
import type { EvolutionRequirement } from './party-evolution';
import { rogueTime } from './friendship';
import { permanentMemberTypes } from '../../sim/rogue-blessing-permanent';

export type EvolutionContext = Pick<RogueRun, 'floor' | 'bag'> & Partial<Pick<RogueRun, 'blessings' | 'money' | 'team' | 'environment'>>;
export const MODERN_EVOLUTION_ITEMS: Record<string, string> = {
	probopass: 'thunderstone', magnezone: 'thunderstone', vikavolt: 'thunderstone',
	leafeon: 'leafstone', glaceon: 'icestone', crabominable: 'icestone',
};
export const SCENE_EVOLUTIONS: Record<string, string> = {
	runerigus: '石门下的回响', malamar: '颠倒的星空', alcremie: '糖饰与旋转舞步',
	ursaluna: '满月下的泥炭', urshifu: '恶之卷轴', urshifurapidstrike: '水之卷轴',
	palafin: '海湾边的集友圈',
};
const dex = Dex.mod('gen9');
/** A stable hidden roll, never rerolled by opening the party or reconnecting. */
export function evolutionBranch(mon: RoguePokemon) {
	if (mon.evolutionProgress?.branch !== undefined) return mon.evolutionProgress.branch;
	let value = 2166136261;
	for (const ch of mon.id || mon.set.species) value = Math.imul(value ^ ch.charCodeAt(0), 16777619);
	return (value >>> 0) % 100;
}
export function evolutionBranchAllowed(mon: RoguePokemon, child: Species) {
	if (mon.compound) return true; // The explicit Compound V final-form choice takes precedence.
	const parent = toID(mon.set.species), roll = ['wurmple', 'dunsparce'].includes(parent) ? evolutionBranch(mon) : 0;
	if (parent === 'wurmple') return child.id === (roll < 50 ? 'silcoon' : 'cascoon');
	if (parent === 'dunsparce') return child.id === (roll === 0 ? 'dudunsparcethreesegment' : 'dudunsparce');
	if (parent === 'toxel') {
		const lowKey = ['Lonely', 'Bold', 'Relaxed', 'Timid', 'Serious', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Calm', 'Gentle', 'Careful'].includes(mon.set.nature);
		return child.id === (lowKey ? 'toxtricitylowkey' : 'toxtricity');
	}
	if (child.id === 'shedinja') return false; // Produced alongside Ninjask, never replaces Nincada.
	return true;
}
export function extraEvolutionRequirements(mon: RoguePokemon, child: Species, context: EvolutionContext): EvolutionRequirement[] {
	const requirements: EvolutionRequirement[] = [], progress = mon.evolutionProgress || {};
	const check = (text: string, met: boolean) => requirements.push({ text, met });
	const known = [...mon.set.moves, ...(mon.moveMemory || []).map(m => m.id)].map(toID);
	if (child.evoMove) check(`已学会 ${dex.moves.get(child.evoMove).name}`, known.includes(toID(child.evoMove)));
	const condition = child.evoCondition || '', time = rogueTime(context.floor);
	if (condition === 'at night') check('夜晚', time === 'night');
	if (condition === 'during the day') check('白天、黎明或黄昏', time !== 'night');
	if (child.id === 'lycanrocdusk') {
		check('特殊岩狗狗（我行我素）', ['rockruffdusk'].includes(toID(mon.set.species)) || toID(mon.set.ability) === 'owntempo');
		check('黄昏', time === 'dusk');
	}
	if (condition === 'during rain') check('本层下雨', context.environment?.weather === 'raindance');
	const region = child.evoRegion || ({ decidueyehisui: 'Hisui', typhlosionhisui: 'Hisui',
		lilliganthisui: 'Hisui', braviaryhisui: 'Hisui', avalugghisui: 'Hisui', sliggoohisui: 'Hisui' } as Record<string, string>)[child.id];
	if (region) check(`明信片旅行：${({ alola: '阿罗拉', galar: '伽勒尔', hisui: '洗翠' } as Record<string, string>)[region.toLowerCase()] || region}`,
		!!progress.scenes?.includes(`region:${region.toLowerCase()}`));
	if (child.id === 'mantine') check('队伍中有铁炮鱼', !!context.team?.some(p => !p.egg && toID(p.set.species) === 'remoraid'));
	if (child.id === 'pangoro') check('队伍中有恶属性伙伴', !!context.team?.some(p => permanentMemberTypes(p).includes('Dark')));
	if (['hitmonlee', 'hitmonchan', 'hitmontop'].includes(child.id)) {
		const atk = mon.stats?.atk || 0, def = mon.stats?.def || 0;
		check(child.id === 'hitmonlee' ? '攻击大于防御' : child.id === 'hitmonchan' ? '攻击小于防御' : '攻击等于防御',
			child.id === 'hitmonlee' ? atk > def : child.id === 'hitmonchan' ? atk < def : atk === def);
	}
	const action = ({ annihilape: 'ragefist', wyrdeer: 'psyshieldbash', overqwil: 'barbbarrage' } as Record<string, string>)[child.id];
	if (action) check(`使用 ${dex.moves.get(action).name} ${progress.moves?.[action] || 0} / 20 次（不限招式风格）`, (progress.moves?.[action] || 0) >= 20);
	if (child.id === 'sirfetchd') check(`单场击中要害 ${progress.criticals || 0} / 3 次`, (progress.criticals || 0) >= 3);
	if (child.id.startsWith('basculegion')) check(`未濒死前累计反伤 ${progress.recoil || 0} / 294 HP`, (progress.recoil || 0) >= 294);
	if (['pawmot', 'brambleghast', 'rabsca'].includes(child.id)) check(`随队前进 ${progress.followed || 0} / 15 层`, (progress.followed || 0) >= 15);
	if (SCENE_EVOLUTIONS[child.id]) check(`完成专属事件：${SCENE_EVOLUTIONS[child.id]}`, !!progress.scenes?.includes(child.id));
	return requirements;
}
