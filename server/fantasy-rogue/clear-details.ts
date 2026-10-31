import { Dex, toID } from '../../sim/dex';
import { emptyRogueStats, ROGUE_STATS, type RoguePokemon } from '../../sim/fantasy-rogue';
import { rogueStarScale } from '../../sim/fantasy-rogue-spirits';
import { assignedExtraAbilities, monkeyKingBranch, permanentMemberTypes, tonicDescription } from '../../sim/rogue-blessing-permanent';
import { BLESSING_TYPES } from '../../sim/rogue-blessing-data';
import { companionSource } from '../../sim/rogue-companions';
import { COMPANION_Z } from '../../sim/rogue-companion-z';
import { robeMember, robeDurability, SPIRAL_SURVIVAL } from '../../sim/rogue-awakening';
import { createRoguePokemon } from './progression';
import { difficultyLabel, memberDifficultyScale } from '../../sim/rogue-difficulty';
import { growthPercent } from './growth';
import type { RogueRun } from './types';

export interface ClearMemberDetails {
	baseline: StatsTable;
	final: StatsTable;
	delta: StatsTable;
	percent: StatsTable;
	types: string[];
	sources: { name: string, text: string }[];
	extraAbilities: { id: string, source: string }[];
}
const labels: Record<StatID, string> = { hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' };
const statList = (stats: Partial<StatsTable>, percent = false) => ROGUE_STATS.filter(s => stats[s])
	.map(s => `${labels[s]} +${percent ? `${Number(((stats[s] || 0) * 100).toFixed(2))}%` : stats[s]}`).join('、');

/** Record comparisons now, so later balance updates cannot silently change the archived numbers. */
export function clearMemberDetails(mon: RoguePokemon, run: RogueRun): ClearMemberDetails {
	const baseline = createRoguePokemon(mon.set, emptyRogueStats(), mon.id, 1,
		mon.mintNature ? { nature: mon.mintNature } : undefined).stats!;
	const final = { ...mon.stats! }, delta = emptyRogueStats(), percent = emptyRogueStats();
	for (const stat of ROGUE_STATS) {
		delta[stat] = final[stat] - baseline[stat];
		percent[stat] = Math.round(delta[stat] / baseline[stat] * 10000) / 100;
	}
	const sources: ClearMemberDetails['sources'] = [], mod = mon.statModifiers;
	const add = (name: string, text: string) => sources.push({ name, text });
	if (run.blessings?.companionZ?.member === mon.id) {
		const grant = run.blessings.companionZ, move = COMPANION_Z[grant.companion];
		add(companionSource(grant.companion), `额外 Z【${move.name}】：${BLESSING_TYPES[move.type]}系、${move.category === 'Physical' ? '群攻物理' : '声音特殊'}，威力 185，命中后五项能力各 +1。` +
			`爬塔${grant.spent ? '已使用' : '尚未使用'}；通关卡每场对战重新获得一次机会，不占常规 Z 次数。`);
	}
	if (mon.difficulty) add(difficultyLabel(mon.difficulty.tier), `通关卡六维 ×${memberDifficultyScale(mon.difficulty)}（替代爬塔系数）`);
	if (Object.values(run.boosts).some(Boolean)) add('局外六维加成', run.boostRuleVersion === 2 ?
		ROGUE_STATS.filter(stat => run.boosts[stat]).map(stat => `${labels[stat]} +${run.boosts[stat]}%`).join('、') : statList(run.boosts));
	if ((mon.stars || 1) > 1) add('星级', `${mon.stars} 星，六维 ×${rogueStarScale(mon.stars)}`);
	const training = (name: string, value?: { offense?: number, defense?: number }) => {
		if (value?.offense || value?.defense) add(name,
			`双攻 +${growthPercent(value.offense || 0)}，双防 +${growthPercent(value.defense || 0)}`);
	};
	training('全队永久训练', run.growth);
	training('个人永久训练', mon.training);
	training('合成大蘑菇', mon.mushroomTraining);
	if (run.growth?.experience) add('经验心得', `战斗经验 +${growthPercent(run.growth.experience)}`);
	if (mon.compound) {
		const rules = mon.compound.reorganized ? '重组后保留原分配，不受新品种种族值总和限制，按新品种正常进化。' :
			`进化方向锁定为【${mon.compound.finalSpecies}】。当前形态原始种族值总和超过 500 时停用新增点数。`;
		add('五号化合物', `分配的新增种族值：${statList(mon.compound.bonus)}；${rules}主特性仍锁定为【化学之力】。`);
	}
	if (mod?.baseStats) {
		const other = Object.fromEntries(ROGUE_STATS.map(s => [s, (mod.baseStats?.[s] || 0) - (mon.compound?.bonus[s] || 0)]));
		if (Object.values(other).some(Boolean)) add('其他种族值增幅', statList(other));
	}
	if (mod?.smallFinal) {
		const species = Dex.mod('gen9fantasy').species.get(mon.set.species);
		const eligible = !species.evos.length &&
			species.bst + Object.values(mod.baseStats || {}).reduce((a, b) => a + b, 0) <= 400;
		add('谁说我到头了', eligible ? '符合条件，六项种族值 ×1.5。' : '当前形态不符合种族值总和不超过 400 的最终形态条件。');
	}
	if (mod?.stats && Object.values(mod.stats).some(Boolean)) add('属性进化',
		`${statList(mod.stats, true)}${mod.statsType ? `；适用于${BLESSING_TYPES[mod.statsType] || mod.statsType}属性伙伴` : ''}。`);
	if (mod?.hp) add('越打命越硬', `最大 HP +${mod.hp}`);
	if (mod?.swap) add('攻守交换', '攻击与防御、特攻与特防互换。');
	if (mon.bond) add('就决定是你了', `友好度 ${mon.bond} / 100`);
	const monkey = monkeyKingBranch(mon, run.team, run.blessings);
	if (monkey) add('大圣风采依旧', monkey === 'Rock' ? '受到对手招式的直接伤害降低 50%。' :
		`对战速度提升 50%；未计其他对战修正时：${mon.stats!.spe} → ${Math.floor(mon.stats!.spe * 1.5)}。`);
	if (mon.insight) add('濒死悟道', `领悟 ${mon.insight.points} / 100，每次积累 +${mon.insight.gain}`);
	if (run.blessings?.owned.some(b => b.family === 'spiral' && b.target === mon.id)) {
		const points = mon.spiral || 0;
		add('我的钻头是可以突破天际的', `螺旋力 ${Number(points.toFixed(2))} 点，对战攻击 +${Number((points / 10).toFixed(2))}%；` +
			`未计其他对战修正时：${mon.stats!.atk} → ${Math.floor(mon.stats!.atk * (1 + points / 1000))}。` +
			`每场首次致命伤保留 1 HP：${points >= SPIRAL_SURVIVAL ? '已解锁' : `尚需达到 ${SPIRAL_SURVIVAL} 点`}。`);
	}
	for (const [kind, name] of [['godrobe', '神衣鲜血'], ['puregodrobe', '神衣纯洁']] as const) {
		if (robeMember(run.team, run.blessings, kind)?.id !== mon.id) continue;
		const upgraded = !!run.blessings!.owned.find(b => b.family === kind)?.completed;
		const factor = robeDurability(mon.hp, mon.maxhp, upgraded);
		add(name, `${upgraded ? '已完成传说强化' : '尚未完成传说强化'}。通关 HP 下双防耐久 ×${factor.toFixed(3)}，` +
			`防御 ${mon.stats!.def} → ${Math.floor(mon.stats!.def * factor)}，特防 ${mon.stats!.spd} → ${Math.floor(mon.stats!.spd * factor)}（未计其他对战修正）。` +
			'约战开始恢复满血后，耐久随当场 HP 重新计算。');
	}
	if (mon.tonics?.wine) add('酒', tonicDescription('wine', true));
	if (mon.tonics?.cephalosporin) add('头孢', tonicDescription('cephalosporin', true));
	if (run.eventBuff?.battles) add('蘑菇的活力', '造成的招式伤害 +20%，受到的招式伤害 -10%。');
	const extras = assignedExtraAbilities(mon, run.team, run.blessings).filter(id => id !== toID(mon.set.ability));
	const extraAbilities = extras.map(id => {
		const companion = run.blessings?.companions?.find(c => !c.away && c.member === mon.id && c.ability === id);
		const king = run.blessings?.dragonKing;
		return { id, source: companion ? companionSource(companion.id) :
			king?.member === mon.id && king.ability === id ? companionSource('iris') :
			mon.extraAbilities?.includes(id) ? (mon.blessingExtraAbilities?.includes(id) ? '祝福赋予' : '已获得的额外特性') : '祝福效果' };
	});
	return { baseline, final, delta, percent, types: permanentMemberTypes(mon), sources, extraAbilities };
}
