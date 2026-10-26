import { ROGUE_STATS, type RoguePokemon } from '../../sim/fantasy-rogue';
import { difficultyIVs, difficultyLabel, type RogueDifficulty } from '../../sim/rogue-difficulty';
import type { RogueAccount, RogueNode, RogueRun } from './types';
import { rebuildMember } from './progression';
import { randomInt } from 'crypto';
import { EASY_IV_LIMIT, rollEncounterIVs } from '../../sim/rogue-quality';
import { randomEncounterAbility } from './encounter-sets';

/** Kept independently of deletable cards. Migration uses retained evidence only. */
export function migrateDifficulty(account: RogueAccount) {
	if (account.difficulties) return;
	const cleared = [...account.cards || [], ...(account.pendingClear ? [account.pendingClear] : [])]
		.some(card => card.snapshot.floor === 200 && !card.snapshot.difficultyRulesVersion) ||
		account.run?.floor === 200 && account.run.phase === 'complete' && !account.run.difficultyRulesVersion;
	account.difficulties = { highest: cleared ? 1 : 0, cleared: cleared ? ['0'] : [],
		spirits: cleared || account.spiritUnlocked ? ['0'] : [] };
}
export function difficultySpiritUnlocked(account: RogueAccount, tier: RogueDifficulty = 0) {
	migrateDifficulty(account);
	return account.difficulties!.spirits.includes(String(tier));
}
export function clearDifficulty(account: RogueAccount, run: RogueRun) {
	migrateDifficulty(account);
	if (run.floor !== 200 || run.phase !== 'complete') return;
	const tier = run.difficulty || 0, key = String(tier), progress = account.difficulties!;
	if (run.difficultyTest) return;
	if (!progress.spirits.includes(key)) progress.spirits.push(key);
	if (tier === 0) account.spiritUnlocked = true;
	if (progress.cleared.includes(key)) return;
	progress.cleared.push(key);
	const advance = tier !== 'easy' && tier === progress.highest && tier < 5;
	if (advance) progress.highest++;
	(run.notices ||= []).push(`${difficultyLabel(tier)}通关！已解锁本档塔灵模式。` +
		`${advance ? `已解锁 ${progress.highest} 档。` : ''}${tier === 'easy' ? '本次不获得局外成长点。' : ''}`);
}
/** Every permanent point award uses the same policy, including delayed rematches. */
export function awardRoguePoints(account: RogueAccount, run: RogueRun, amount: number) {
	const earned = run.difficulty === 'easy' ? 0 : amount;
	account.points += earned;
	return earned;
}
export function syncMemberDifficulty(mon: RoguePokemon, run: Pick<RogueRun, 'difficulty' | 'difficultyRulesVersion' | 'floor' | 'boosts'>) {
	const tier = run.difficulty || 0;
	const version = run.difficultyRulesVersion || 1;
	let changed = mon.difficulty?.tier !== tier || mon.difficulty?.floor !== run.floor || mon.difficulty?.card ||
		mon.difficulty?.version !== version;
	// Tier 0 legacy partners retain their exact saved numbers until a normal rebuild is needed.
	if (!mon.difficulty && tier === 0) changed = false;
	if (tier === 'easy' && ROGUE_STATS.some(stat => mon.set.ivs[stat] > (version >= 4 ? EASY_IV_LIMIT : 10))) {
		mon.set.ivs = difficultyIVs(mon.set.ivs, tier, run.floor, version); changed = true;
	}
	if (changed) {
		mon.difficulty = { tier, floor: run.floor, version };
		rebuildMember(mon, run.boosts);
	}
	// Sealed donors must obey the same ceiling when later restored.
	for (const donor of [mon.formFusion?.donor, mon.fusion?.first, mon.fusion?.second]) {
		if (donor) syncMemberDifficulty(donor, run);
	}
}
/** Normalize newly created gifts/eggs and battle snapshots at the transaction boundary. No rerolls. */
export function syncRunDifficulty(run: RogueRun, random: (max: number) => number = randomInt) {
	for (const mon of [...run.team, ...(run.box || []), ...(run.pendingCaptures || []),
		...(run.pendingCapture ? [run.pendingCapture] : []), ...(run.checkpoint?.team || []), ...(run.checkpoint?.box || [])]) {
		syncMemberDifficulty(mon, run);
	}
	const version = run.difficultyRulesVersion || 1;
	if (!run.difficulty && version < 4) return;
	const prepare = (node: RogueNode, floor: number) => {
		for (const encounter of node.encounters || []) {
			for (const set of [...encounter.team || [], ...(encounter.candidates || []),
				...(encounter.trainerCandidates || []).flatMap(candidate => candidate.team || [])]) {
				if (set.fantasyRogueIVAdjusted) continue;
				const ivs = Object.fromEntries(ROGUE_STATS.map(stat => [stat, set.ivs?.[stat] ?? 31])) as StatsTable;
				// All capturable wild/event encounters share the same roll; authored bosses keep their IVs.
				const elite = node.kind === 'elite' || !!node.event?.exclusive?.battleElite || node.event?.id === 'terasolo';
				set.ivs = version >= 4 && encounter.catchable ? rollEncounterIVs(random, run.difficulty || 0, elite) :
					difficultyIVs(ivs, run.difficulty, floor, version);
				if (version >= 4 && encounter.catchable) set.ability = randomEncounterAbility(set.species, random, elite, run.difficulty || 0);
				set.fantasyRogueIVAdjusted = true;
			}
			for (const set of encounter.cooperative?.team || []) {
				if (run.difficulty === 'easy') {
					const ivs = Object.fromEntries(ROGUE_STATS.map(stat => [stat, set.ivs?.[stat] ?? 31])) as StatsTable;
					set.ivs = difficultyIVs(ivs, 'easy', floor, version);
				}
			}
		}
	};
	for (const node of [...run.choices || [], ...(run.node ? [run.node] : [])]) prepare(node, run.floor);
	for (const [floor, node] of Object.entries(run.bossPreviews || {})) prepare(node, Number(floor));
}
