import type { RogueBattleResult, RoguePokemon } from '../../sim/fantasy-rogue';
import type { NuzlockeBattle } from '../../sim/rogue-nuzlocke';
import type { RogueCommand, RogueRun } from './types';

export interface NuzlockeRun {
	version: 1;
	/** Outside inventory snapshots: retreat/retry cannot restore an allowance or a life. */
	encounters: Record<string, { token: string, encounterId: string, target: string }>;
	dead: string[];
}
export const nuzlockeSegment = (floor: number) => String(Math.floor((floor - 1) / 10));

export function nuzlockeBattle(run: RogueRun): NuzlockeBattle | undefined {
	if (!run.nuzlocke) return;
	const encounter = run.nuzlocke.encounters[nuzlockeSegment(run.floor)];
	return { captureAllowed: !encounter || encounter.token === run.battle?.token,
		target: encounter?.token === run.battle?.token ? encounter.target : undefined, dead: [] };
}

export function recordNuzlockeProgress(run: RogueRun, progress?: NuzlockeBattle, team?: RoguePokemon[]) {
	const rules = run.nuzlocke;
	if (!rules || !run.battle) return;
	if (progress?.target) {
		const key = nuzlockeSegment(run.floor), prior = rules.encounters[key];
		if (!prior) rules.encounters[key] = { token: run.battle.token,
			encounterId: run.battle.encounterId, target: progress.target };
	}
	const fainted = (team || []).filter(mon => !mon.egg && mon.hp <= 0).map(mon => mon.id);
	for (const id of [...(progress?.dead || []), ...fainted]) {
		if (!rules.dead.includes(id) && run.team.some(mon => mon.id === id && !mon.egg)) rules.dead.push(id);
	}
	syncNuzlocke(run);
}

/** Healing, checkpoint recovery and postgame restoration all pass this same invariant. */
export function syncNuzlocke(run: RogueRun) {
	if (!run.nuzlocke) return;
	const dead = new Set(run.nuzlocke.dead);
	const visit = (mon: RoguePokemon, inherited = false) => {
		if (inherited || mon.nuzlockeDead || dead.has(mon.id) || !mon.egg && mon.hp <= 0) {
			mon.nuzlockeDead = true;
			mon.hp = 0;
			if (!dead.has(mon.id)) { dead.add(mon.id); run.nuzlocke!.dead.push(mon.id); }
		}
		if (mon.fusion) { visit(mon.fusion.first, !!mon.nuzlockeDead); visit(mon.fusion.second, !!mon.nuzlockeDead); }
		if (mon.formFusion) visit(mon.formFusion.donor, !!mon.nuzlockeDead);
	};
	for (const mon of [...run.team, ...(run.box || []), ...(run.pendingCaptures || []),
		...(run.pendingCapture ? [run.pendingCapture] : [])]) visit(mon);
	if (run.pendingMoves) run.pendingMoves = run.pendingMoves.filter(move => !dead.has(move.member));
}

export function assertNuzlockeCommand(run: RogueRun, command: RogueCommand) {
	if (!run.nuzlocke) return;
	if (command.action === 'retry') throw new Error('Nuzlocke 模式不能通过重试恢复队伍；请使用存活伙伴继续挑战。');
	// Looking, reordering and explicit releases are allowed; event exchanges still cannot spend dead partners.
	if (['order', 'abandon', 'release'].includes(command.action)) return;
	if (command.confirmed && (command.action === 'replace' && command.member === run.pendingCapture?.id ||
		command.action === 'blessingreward' && command.member === run.blessings?.pending[0]?.id &&
		run.blessings?.pending[0]?.kind === 'gift')) return;
	const fields = Object.entries(command).filter(([key]) => key !== 'id' && key !== 'revision');
	const data = JSON.stringify(Object.fromEntries(fields));
	if (run.nuzlocke.dead.some(id => data.includes(id))) {
		throw new Error('这位伙伴已在本局永久死亡，只能查看或放生，不能复活、培养、融合或兑换奖励。');
	}
}

/** Event rewards must not silently spend a dead partner selected without a member ID. */
export function assertNuzlockeRoster(run: RogueRun, previous: string[], command?: RogueCommand) {
	if (!run.nuzlocke) return;
	const remaining = new Set([...run.team, ...(run.box || [])].map(mon => mon.id));
	if (previous.some(id => !remaining.has(id) && !(command?.action === 'release' && command.member === id) &&
		!(command?.confirmed && ['replace', 'blessingreward'].includes(command.action) && command.value === id))) {
		throw new Error('已经永久死亡的伙伴不能用于兑换或融合，请先在队伍详情中放生。');
	}
}

export function nuzlockeResult(run: RogueRun, result: RogueBattleResult) {
	recordNuzlockeProgress(run, result.nuzlocke, result.team);
}
