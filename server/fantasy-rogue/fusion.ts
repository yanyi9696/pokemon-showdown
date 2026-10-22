import { randomUUID } from 'crypto';
import { Dex, toID } from '../../sim/dex';
import { experienceAtLevel, rogueSpeciesData } from '../../sim/fantasy-rogue-rules';
import { roguePartyLimit } from '../../sim/fantasy-rogue-spirits';
import { assignedExtraAbilities } from '../../sim/rogue-blessing-permanent';
import { blessingLearnChoices, syncBlessingParty } from './blessings';
import { canEditParty, healingLocked } from './team';
import { gainExperience, initializeExperience, ensureMemberMemory, rebuildMember } from './progression';
import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { RogueCommand, RogueRun } from './types';

const dex = Dex.mod('gen9fantasy');
function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export function fusionAbilities(mon: RoguePokemon, run?: RogueRun) {
	return [...new Set([toID(mon.set.ability), ...mon.abilityPool?.map(a => a.id) || [],
		...assignedExtraAbilities(mon, run?.team || [mon], run?.blessings)])];
}
export function editFusion(run: RogueRun, command: RogueCommand) {
	requireRule(run.blessings?.owned.some(b => b.family === 'potara') && canEditParty(run) && !healingLocked(run),
		'需要拥有波塔拉耳环，并在战斗外完成当前结算后操作。');
	const first = run.team.find(p => p.id === command.member);
	requireRule(first && !first.egg, '请选择队伍中的伙伴。');
	if (command.action === 'unfusion') {
		const data = first.fusion;
		requireRule(data, '这位伙伴尚未融合。');
		const full = run.team.length >= roguePartyLimit(run.spirit, run.blessings);
		ensureMemberMemory(first);
		const restored = structuredClone(data.first), second = structuredClone(data.second);
		const gained = Math.max(0, (first.experience || 0) - data.experienceStart);
		// Items and PP spent while fused stay spent. Splitting cannot heal or duplicate equipment.
		restored.set.item = first.set.item;
		restored.status = first.status; restored.statusState = structuredClone(first.statusState);
		restored.statuses = first.statuses && structuredClone(first.statuses);
		restored.hp = first.hp ? Math.max(1, restored.maxhp - (first.maxhp - first.hp)) : 0;
		for (const slot of [...restored.pp, ...restored.moveMemory || []]) {
			const current = [...first.pp, ...first.moveMemory || [], ...first.blessingPP || []].find(p => p.id === slot.id);
			if (current) slot.pp = Math.min(slot.pp, current.pp);
		}
		run.team.splice(run.team.indexOf(first), 1, restored);
		if (full && run.box && run.box.length < 30) run.box.push(second);
		else if (full) run.blessings!.pending.push({ id: randomUUID(), kind: 'gift', pokemon: second, title: '解除融合 · 安置归队伙伴' });
		else run.team.splice(run.team.indexOf(restored) + 1, 0, second);
		if (gained) gainExperience(run, restored, gained);
		rebuildMember(restored, run.boosts);
		run.blessings!.fusionReadyFloor = run.floor + 10;
		(run.notices ||= []).push('融合已解除。' + (full ? '队伍已满，请安置返回的伙伴；已有箱子且有空位时会自动暂存。' : '') + '再通关 10 层后可重新融合。');
	} else {
		const activity = run.node?.event?.activity;
		requireRule(!activity?.member && !activity?.solo || run.node?.event?.settled, '请先完成当前伙伴的事件互动，再进行融合。');
		requireRule(run.floor >= (run.blessings!.fusionReadyFloor || 0), '解除融合后需要再通关 10 层。');
		requireRule(![...run.team, ...run.box || []].some(p => p.fusion), '同一时间只能融合一对伙伴。');
		const second = run.team.find(p => p.id === command.value);
		requireRule(second && second !== first && !second.egg, '请选择两位不同的已孵化伙伴。');
		requireRule(first.hp > 0 && second.hp > 0, '请先复活参与融合的伙伴。');
		const ability = toID(command.fusionAbility);
		requireRule([...fusionAbilities(first, run), ...fusionAbilities(second, run)].includes(ability), '请选择这两位伙伴已有的特性。');
		requireRule(command.appearance === first.id || command.appearance === second.id, '请选择一位伙伴的外观。');
		initializeExperience(first); initializeExperience(second);
		const a = dex.species.get(first.set.species), b = dex.species.get(second.set.species);
		const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
		const selected = command.fusionStats;
		requireRule(Array.isArray(selected) && selected.length === 3 && new Set(selected).size === 3 &&
			selected.every(key => keys.includes(key)), '请恰好选择第一位伙伴提供的三项种族值。');
		const baseStats = Object.fromEntries(keys.map(key => [key, (selected.includes(key) ? a : b).baseStats[key]])) as StatsTable;
		const types = [...new Set([a.types[0], b.types[1] || b.types[0]])];
		const moves = [...new Set([first, second].flatMap(p => [
			...blessingLearnChoices({ ...p, set: { ...p.set, moves: [] }, moveMemory: [], blessingMoves: [] }),
			...p.set.moves.map(toID), ...p.moveMemory?.map(m => m.id) || [], ...p.blessingMoves || [],
		]))];
		const fused = structuredClone(first);
		const level = Math.max(first.set.level, second.set.level);
		fused.fusion = { first: structuredClone(first), second: structuredClone(second), baseStats, types, moves,
			experienceStart: experienceAtLevel(rogueSpeciesData(first.set.species).growth, level) };
		// Keep experience on the first partner's growth curve, regardless of the selected appearance.
		fused.set.species = command.appearance === second.id ? second.set.species : first.set.species;
		fused.set.name = fused.set.species;
		fused.set.level = level; fused.experience = fused.fusion.experienceStart;
		fused.set.ability = dex.abilities.get(ability).name;
		fused.abilityPool = [...new Set([...fusionAbilities(first, run), ...fusionAbilities(second, run)])].map(id => ({ id, hidden: false }));
		delete fused.compound;
		delete fused.fixedLevel;
		run.team = run.team.filter(p => p !== second).map(p => p === first ? fused : p);
		(run.notices ||= []).push('融合完成：可在可更换招式列表选择双方完整招式池；形态变化暂停，战斗外可解除。');
	}
	syncBlessingParty(run);
}
