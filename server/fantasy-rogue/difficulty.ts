import { ROGUE_STATS, type RoguePokemon } from '../../sim/fantasy-rogue';
import { difficultyIVs, difficultyLabel, isRogueDifficulty, type RogueDifficulty } from '../../sim/rogue-difficulty';
import { rogueSpirit } from '../../sim/fantasy-rogue-spirits';
import type { RogueAccount, RogueNode, RogueRun } from './types';
import { rebuildMember } from './progression';
import { randomInt } from 'crypto';
import { EASY_IV_LIMIT, rollEncounterIVs } from '../../sim/rogue-quality';
import { randomEncounterAbility } from './encounter-sets';
import { notifyUnlock, unlockStoryDifficulty } from './mainline-progress';

/** Kept independently of deletable cards. Migration uses retained evidence only. */
export function migrateDifficulty(account: RogueAccount) {
	if (account.difficulties) return;
	const cleared = [...account.cards || [], ...(account.pendingClear ? [account.pendingClear] : [])]
		.some(card => card.snapshot.floor === 200 && !card.snapshot.difficultyRulesVersion && !card.snapshot.difficultyTest) ||
		account.run?.floor === 200 && account.run.phase === 'complete' &&
		!account.run.difficultyRulesVersion && !account.run.difficultyTest;
	account.difficulties = { highest: cleared ? 1 : 0, cleared: cleared ? ['0'] : [],
		spirits: cleared || account.spiritUnlocked ? ['0'] : [] };
}
export function difficultySpiritUnlocked(account: RogueAccount, _tier: RogueDifficulty = 0) {
	migrateDifficulty(account);
	return !!account.spiritUnlocked || [...account.difficulties!.cleared, ...account.difficulties!.spirits]
		.some(tier => /^(easy|[0-5])$/.test(tier));
}

const spiritTierRank = (tier: RogueDifficulty) => tier === 'easy' ? -1 : tier;
export const SPIRIT_SELECTION_RULE = '使用某一塔灵通关 200 层后，仅可在该通关档位及更低档位指定它，护符档为最低档。' +
	'例如用某塔灵通关 5 档后，可在护符档及 0～5 档指定该塔灵；随机塔灵不受此限制。';

export function canSelectSpirit(account: RogueAccount, spirit: string, tier: RogueDifficulty) {
	const cleared = account.spiritClearTiers?.[spirit];
	return isRogueDifficulty(cleared) && spiritTierRank(tier) <= spiritTierRank(cleared);
}

function rememberSpiritClear(account: RogueAccount, spirit: string, tier: RogueDifficulty, announce: boolean) {
	if (!rogueSpirit(spirit) || !isRogueDifficulty(tier)) return;
	const tiers = account.spiritClearTiers ||= {};
	const previous = tiers[spirit];
	if (isRogueDifficulty(previous) && spiritTierRank(previous) >= spiritTierRank(tier)) return;
	tiers[spirit] = tier;
	account.unlockedSpirits = [...new Set([...account.unlockedSpirits || [], spirit])];
	if (announce) notifyUnlock(account, `spirit-select:${spirit}:${tier}`, '指定塔灵范围已解锁',
		`${rogueSpirit(spirit)!.name}：已通关${difficultyLabel(tier)}。${SPIRIT_SELECTION_RULE}`);
}

/** Preserve per-spirit evidence independently of deletable cards; never infer a higher tier from another spirit. */
export function migrateSpiritProgress(account: RogueAccount) {
	migrateDifficulty(account);
	const firstMigration = !account.spiritClearTiers;
	account.spiritClearTiers ||= {};
	// Untiered legacy unlocks prove a clear, but not which tier. Retain at least the lowest-tier entitlement.
	for (const spirit of account.unlockedSpirits || []) rememberSpiritClear(account, spirit, 'easy', false);
	const evidence = [...(account.cards || []).map(card => card.snapshot),
		...(account.pendingClear ? [account.pendingClear.snapshot] : []),
		...(account.run?.phase === 'complete' ? [account.run] : [])]
		.filter(clear => clear.floor === 200 && !clear.difficultyTest);
	for (const clear of evidence) {
		if (clear.spirit) rememberSpiritClear(account, clear.spirit, clear.difficulty ?? 0, !firstMigration);
	}
	account.unlockedSpirits = [...new Set([...account.unlockedSpirits || [], ...Object.keys(account.spiritClearTiers)])];
	if (!account.spiritUnlocked && (difficultySpiritUnlocked(account) || evidence.length ||
		Object.keys(account.spiritClearTiers).length)) {
		account.spiritUnlocked = true;
		notifyUnlock(account, 'spirit:global', '塔灵模式已全局解锁',
			'通关任意档位 200 层后，今后可在所有已解锁档位开启随机塔灵，包括护符档。难度档位仍按原条件解锁。');
	}
	if (firstMigration && Object.keys(account.spiritClearTiers).length) {
		notifyUnlock(account, 'spirit-select:rules', '指定塔灵按通关档位开放', SPIRIT_SELECTION_RULE +
		'旧记录按保留的通关证据恢复；仅有塔灵名称、没有档位证据的旧记录暂保留护符档指定资格。');
	}
	for (const notice of account.unlockNotices || []) {
		if (/^spirit:(easy|[0-5])$/.test(notice.id)) {
			notice.title = '塔灵模式已全局解锁';
			notice.text = '通关任意档位 200 层后，可在所有已解锁档位开启随机塔灵，包括护符档。';
		}
	}
}
/** Hidden local test preferences cannot silently select an unavailable tier on a new run. */
export function preferredDifficulty(account: RogueAccount, local = false) {
	migrateDifficulty(account);
	return account.preferredDifficulty !== undefined &&
		(local || account.preferredDifficulty === 'easy' || account.preferredDifficulty <= account.difficulties!.highest) ?
		account.preferredDifficulty : undefined;
}
export function clearDifficulty(account: RogueAccount, run: RogueRun) {
	migrateDifficulty(account);
	if (run.floor !== 200 || run.phase !== 'complete') return;
	const tier = run.difficulty || 0, key = String(tier), progress = account.difficulties!;
	if (run.difficultyTest) return;
	if (!progress.spirits.includes(key)) {
		progress.spirits.push(key);
	}
	const first = !progress.cleared.includes(key);
	if (first) progress.cleared.push(key);
	if (run.spirit) rememberSpiritClear(account, run.spirit, tier, true);
	migrateSpiritProgress(account);
	unlockStoryDifficulty(account);
	if (first) (run.notices ||= []).push(`${difficultyLabel(tier)}通关！所有已解锁档位均可开启随机塔灵。` +
		`${tier === 'easy' ? '本次不获得局外成长点。' : '通关与本档故事均完成后，可解锁下一档。'}`);
}
/** Apply a co-op 200-floor clear to personal eligibility without creating or changing story progress. */
export function clearCoopDifficulty(account: RogueAccount, tier: RogueRun['difficulty']) {
	migrateDifficulty(account);
	const key = String(tier || 0), progress = account.difficulties!;
	if (!progress.spirits.includes(key)) {
		progress.spirits.push(key);
	}
	if (!progress.cleared.includes(key)) progress.cleared.push(key);
	migrateSpiritProgress(account);
	// Co-op excludes the mainline, so only evaluate story requirements that already exist on this account.
	if (account.mainline) unlockStoryDifficulty(account);
}
/** Every permanent point award uses the same policy, including delayed rematches. */
export function awardRoguePoints(account: RogueAccount, run: RogueRun, amount: number) {
	const earned = run.difficulty === 'easy' ? 0 : amount * (run.nuzlocke ? 2 : 1);
	account.points += earned;
	return earned;
}
export function syncMemberDifficulty(mon: RoguePokemon, run: Pick<RogueRun,
 'difficulty' | 'difficultyRulesVersion' | 'floor' | 'boosts' | 'boostRuleVersion'>) {
	const tier = run.difficulty || 0;
	const version = run.difficultyRulesVersion || 1;
	let changed = mon.difficulty?.tier !== tier || mon.difficulty?.floor !== run.floor || mon.difficulty?.card ||
		mon.difficulty?.version !== version;
	// Tier 0 legacy partners retain their exact saved numbers until a normal rebuild is needed.
	if (!mon.difficulty && tier === 0) changed = false;
	if (run.boostRuleVersion === 2 && !mon.set.fantasyRogueBoostPercent) {
		mon.set.fantasyRogueBoostPercent = true; changed = true;
	}
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
