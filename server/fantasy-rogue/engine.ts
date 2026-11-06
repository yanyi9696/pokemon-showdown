import { rogueSpeciesID, migrateRenamedSpeciesIds } from './species-eligibility';
import { openLakeQuestRound } from './lake-quest';
import { releasePartyMember } from './release';
import { grantCandyTraining } from './candy-rewards';
import { awardBattleExperience } from './battle-growth';
import { openStarterCrates, exchangeStarterCrate, emptyCrates } from './starter-crates';
import { submitDailyCup } from './daily-crate-cup';
import { replaceTreasureWithEmblem } from './emblem-loot';
import { applyRetryHealing, planRetryHealing } from './retry-healing';
import { restoreMember } from './recovery-items';
import { useInventoryItem } from './inventory-use';
import { confirmPartyEvolution } from './evolution-action';
import { assertNuzlockeCommand, nuzlockeBattle, nuzlockeResult, recordNuzlockeProgress, syncNuzlocke } from './nuzlocke';
import { beginRememberedOpening, reserveMainline, offerMainline, beginMainline, prepareElderMeeting,
	advanceMainline, reserveTrueEnding, beginMainlineEnding } from './mainline';
import { settleStoryPity, unlockStoryDifficulty, mainlineProgress } from './mainline-progress';
import { initializeFirstClears, awardFirstClears } from './first-clears';
import { affectionFloor, affectionCommand } from './affection';
import { addMasterBallRoute, selectMasterBallRoute, chooseMasterBall, repairMasterBallEvent } from './master-ball';
import { CHARM_DESCRIPTION, ROGUE_DIFFICULTY_VERSION, isRogueDifficulty } from '../../sim/rogue-difficulty';
import { collapseCount, validCollapseSelection } from '../../sim/rogue-collapse-data';
import { recordCollapseStart, recordCollapseBattle, recordCollapseClear, recordCollapseResource } from './collapse';
import { migrateDifficulty, migrateSpiritProgress, canSelectSpirit, preferredDifficulty, difficultySpiritUnlocked, awardRoguePoints,
	syncRunDifficulty } from './difficulty';
import { offerComeback, chooseComeback, completeComebackFloor, comebackExperience, comebackActive } from './comeback';
import { rogueStarterSlotCost } from '../../sim/rogue-species-identity';
import { catchupRoutes } from './late-support';
import { offerOptionalChallenge, prepareChallengePrizes, chooseChallengePrize,
	challengeRecord } from './optional-challenges';
import { recordShoppingSpend } from './shopping-upgrade';
import { claimCoverage } from './coverage';
import { prepareFloorEnvironment } from './floor-environment';
import { beginRival, rivalRoutes, rivalActive, rivalTeam, expireRival, activeRivalTraveller } from './rivals';
import { normalizeTravellers, chooseCompanionInvitation, socialCompanionCommand } from './travellers';
import { companionOptions } from './companions';
import { beginSocialEvent } from './social-events';
import { prepareTravellingTrainer } from './travelling-trainers';
import { beginTeraSolo } from './expedition-events';
import { hatchEggs } from './eggs';
import { rollRoutes, normalizeRouteHistory } from './routes';
import { migrateRetiredBalls } from './capture-items';
import { syncExclusiveItems } from './exclusive-items';
import { beginExclusiveEncounter } from './exclusive-events';
import { beginPoliceEncounter } from './police-events';
import { deferCompanionChallenge, opposingCompanion, settleRematch } from './companion-rematches';
import { healNarrativeParty, queueNarrative } from './narrative';
import { normalizeEcho, buyEcho, awardEcho, awardGodEcho, echoEligible, ECHO_INTRO } from './echo';
import { feedMushroom } from './mushroom-feeding';
import { companionCommand, companionExperience, companionPickup, deliverCompanionPickup, boostCompanionEventRewards, poppyRewardPickup, recordCompanionPreference } from './companions';
import { COMPANIONS, companionOwned, companionAbilityOptions } from '../../sim/rogue-companions';
import { editFusion } from './fusion';
import { useFormItem } from './form-items';
import { permanentMemberTypes } from '../../sim/rogue-blessing-permanent';
import { POWER_TRAINING_STATS } from '../../sim/rogue-pets';
import { eventView } from './events';
import { buyGrowth, syncGrowthParty, grantMushroomGrowth, grantJourneyGrowth } from './growth';
import { prepareRewardScene, chooseReward } from './reward-scenes';
import { randomInt, randomUUID } from 'crypto';
import { repairSavedEncounters } from './encounter-repair';
import { prepareEliteEscorts } from './elite-escorts';
import { Dex, toID } from '../../sim/dex';
import {
	ROGUE_STATS, type RogueBattleResult, type RogueBattleState, type RoguePokemon,
} from '../../sim/fantasy-rogue';
import { BOSS_FLOORS, ELITE_BOSS_FLOORS, fixedFloor, validateContent } from './content';
import type { RogueStore } from './store';
import type { RogueAccount, RogueCommand, RogueContent, RogueInventory, RogueNode, RogueRun } from './types';
import {
	createRoguePokemon, ensureMemberMemory,
	initializeExperience, rebuildMember, rememberMove, rememberPastLevelMoves, escapedMember,
} from './progression';
import { towerExperience, grantEventTraining, MENTOR_CARDS, mentorTier, emergencyCost, type MentorCard } from './early-balance';
import { prepareTrade, tradeRouteTemplates, shopStock } from './trading';
import { recycleItems } from './buyback';
import { canEditParty, inventoryItem, editParty, healingLocked, TEAM_ACTIONS } from './team';
import { dragonKingActive, dragonKingAbilityOptions, type DragonKingAbility } from '../../sim/rogue-blessing-permanent';
import { createBiomeRoutes } from './biome-routes';
import type { RogueRandom } from './biome-pools';
import { recordStarterMoves, recordStarterTraits, starterMoves, starterTraits, migrateZygardeStarter,
	recordShinyCapture, migrateShinyCaptures } from './starter-traits';
import { chooseTrainer, ELITE_FOUR_FLOORS, trainerBossCandidates } from './trainer-bosses';
import { centerCare, prepareEconomy } from './economy';
import { roguePartyLimit } from '../../sim/fantasy-rogue-spirits';
import {
	battleFriendship, changeFriendship, floorFriendship, friendship, rogueTime, ROGUE_INITIAL_FRIENDSHIP,
} from './friendship';
import { initializeSpirit, grantSpiritGift, prepareSpiritNode, spiritShopAvailable, hpPurchaseCost,
	convertSpiritItem, editSpiritBox, mergeSpiritPokemon, completeSpiritRegion } from './spirits';
import {
	ROGUE_STORY, afterSpirit, startCard, storyView, bossIntroPages, bossVictoryPages, bossDialogueKey, rememberBossDialogue,
} from './story';
import { recordClear, editClearCard } from './legacy';
import { arceusEncounter } from './final-bosses';
import { beginShopChallenge } from './shop-challenge';
import { beginEvent, chooseEventOption, eventRouteTemplates, settleEventBattle } from './events';
import { needsOnboarding } from './onboarding';
import { BEGINNER_GUIDE_VERSION } from './beginner-guide';
import { snapshotTravelBattle, restoreTravelBattle } from './event-travel';
import { settleServiceBattle } from './event-services';
import { normalizeBlessings, beginBlessingFloor, prepareOpeningBlessings, prepareEvolutionFloor,
	completeBlessingFloor, blessingRouteTemplates, migrateGodrobeGift,
	prepareBlessingEncounter, handleBlessingCommand, settleBlessingBattle, repairBlessingRound,
	syncBlessingParty, blessingExperience, blessingLoot,
	recordNegativeBlessingEvent, gymSystemGift, grantSystem } from './blessings';
export { createRoguePokemon } from './progression';

export const ROGUE_EMERGENCY_COST = 5000;

export function rogueSlotCost(slots: number) {
	return slots >= 6 ? 0 : slots * 20;
}
export function rogueStatCost(current: number) {
	return current >= 10 ? 0 : current + 1;
}

function requireRule(ok: unknown, message: string): asserts ok {
	if (!ok) throw new Error(message);
}
const inventory = (run: RogueInventory): RogueInventory => structuredClone({
	team: run.team, bag: run.bag, money: run.money, teraUnlocked: !!run.teraUnlocked,
	megaUnlocked: run.megaUnlocked, gmegaUnlocked: run.gmegaUnlocked, zUnlocked: run.zUnlocked,
	growth: run.growth && { ...run.growth },
	journeyGrowth: run.journeyGrowth && { ...run.journeyGrowth },
	...(run.box ? { box: run.box } : {}),
});

export class RogueEngine {
	readonly content: RogueContent | null;
	readonly store: RogueStore;
	readonly localSpirits: boolean;
	readonly continueOnly: boolean;
	private readonly random: RogueRandom;
	constructor(store: RogueStore, content: RogueContent | null, random: RogueRandom = max => randomInt(max),
		localSpirits = false, continueOnly = false) {
		this.localSpirits = localSpirits;
		this.continueOnly = continueOnly;
		this.random = random;
		this.store = store;
		this.content = content && validateContent(content);
	}
	private configured(): RogueContent {
		requireRule(this.content, '正式初始队伍、楼层和数值尚未配置，暂不能开始冒险。');
		return this.content;
	}
	private run(account: RogueAccount): RogueRun {
		requireRule(account.run && !['complete', 'defeated'].includes(account.run.phase), '没有进行中的冒险，请确认本局结算。');
		const content = this.configured();
		requireRule(
			account.run.contentVersion === content.version || content.compatibleVersions?.includes(account.run.contentVersion),
			'内容版本已变更，请由管理员恢复对应版本后继续存档。'
		);
		account.run.contentVersion = content.version;
		this.normalizeRun(account.run);
		return account.run;
	}
	private normalizeRun(run: RogueRun) {
		if (run.difficulty === 'easy' && run.postgame?.stage === 'offer') {
			// Retire an older unaccepted invitation without replaying settlement or changing its clear card.
			Object.assign(run, inventory(run.postgame.before));
			run.node = structuredClone(run.postgame.node);
			run.encounter = run.postgame.encounter;
			run.postgame.stage = 'declined';
			run.phase = 'complete';
			run.story = this.content?.story ? { stage: 'ending', page: 0, skip: false, canSkip: true } : undefined;
		}
		repairMasterBallEvent(run);
		this.prepareFutureSight(run);
		prepareEliteEscorts(run, this.random, true);
		repairSavedEncounters(run);
		if (this.content?.biomeEncounters && !run.biomeHistory) {
			// Legacy saves retain this floor's offers/opponent, but not older ecologies.
			// Recover only that evidence; never invent the missing preceding five floors.
			const known = [...(run.choices || []), ...(run.node ? [run.node] : [])];
			const ids = [...new Set(known.flatMap(node => node.biome ? [node.biome.id] : []))];
			if (ids.length) run.biomeHistory = ids.map(id => ({ id, floor: run.floor }));
		}
		normalizeTravellers(run);
		if (run.floor < 190 && run.bossPreviews?.[190]) this.prepareBossPreview(run, 190);
		migrateRetiredBalls(run);
		if (run.node?.trade?.kind === 'balls' && this.content) prepareTrade(run, this.content, this.random);
		if (run.phase !== 'battle' && run.eventBuff?.battles) {
			const effect = grantMushroomGrowth(run);
			delete run.eventBuff;
			run.notices = [effect];
		}
		if (this.content?.routePools) normalizeRouteHistory(run);
		if (run.story?.stage === 'restguide') this.prepareBossPreview(run, run.floor + 1);
		if (this.content?.blessings) {
			syncBlessingParty(run);
			repairBlessingRound(run, this.content, this.random);
			// Resume an unstarted legacy boss floor without changing its saved opponents.
			if (!run.story && ['choose', 'ready'].includes(run.phase)) {
				this.prepareFloorEvolution(run, run.phase as 'choose' | 'ready');
			}
		}
		syncGrowthParty(run);
		if (this.content && (run.contentVersion === this.content.version ||
			this.content.compatibleVersions?.includes(run.contentVersion))) this.prepareChoices(run);
		for (const mon of [...run.team, ...(run.box || []), ...run.checkpoint.team, ...(run.checkpoint.box || []),
			...(run.pendingCaptures || []), ...(run.pendingCapture ? [run.pendingCapture] : [])]) {
			const legacyMemory = !mon.moveMemory;
			ensureMemberMemory(mon);
			if (legacyMemory && run.team.includes(mon)) {
				for (const pending of run.pendingMoves || []) {
					if (pending.member !== mon.id || mon.set.moves.some(move => toID(move) === pending.move)) continue;
					rememberMove(mon, pending.move);
					const learned = mon.moveMemory!.find(move => move.id === pending.move)!;
					learned.pp = learned.maxpp;
				}
			}
			if (this.content?.progression) rememberPastLevelMoves(mon);
		}
		if (run.phase === 'failed' && !run.node?.noHealing) {
			// Older versions discarded the loss snapshot. Do not silently restore their pre-fight HP.
			for (const mon of run.team) mon.hp = 0;
			run.phase = 'ready';
			run.recovery = 'defeat';
			delete run.battle;
		}
	}
	migrate(userid: string) {
		return this.store.change(userid, account => {
			if (account.run && !account.run.owner) {
				account.run.owner = { id: userid, name: userid };
				account.adventures ||= 1;
			}
			this.normalizeAccount(account);
			if (account.run) {
				this.normalizeRun(account.run);
				this.presentNarrative(account.run);
				this.checkFailure(account.run);
			}
			if (account.run?.phase === 'complete' && account.run.floor === 200) recordClear(account, account.run);
		});
	}
	private normalizeAccount(account: RogueAccount) {
		account.caughtSpecies = migrateRenamedSpeciesIds(account.caughtSpecies);
		for (const biome in account.biomeCaptures) {
			account.biomeCaptures[biome] = migrateRenamedSpeciesIds(account.biomeCaptures[biome])!;
		}
		migrateDifficulty(account);
		migrateSpiritProgress(account);
		initializeFirstClears(account);
		unlockStoryDifficulty(account);
		if (this.content?.story) beginRememberedOpening(account);
		normalizeEcho(account);
		if (!this.content) return;
		// An old Unity type picker is no longer a decision. Resume its original next step once.
		if (this.content.blessings && account.run?.blessings?.pending.some(reward => reward.kind === 'unity')) {
			syncBlessingParty(account.run);
			this.finishBlessings(account, account.run);
		}
		// Old clients stopped at a redundant confirmation page. Resume that saved departure once.
		if (account.run?.story?.stage === 'difficultyconfirm') {
			if (account.run.difficulty === 'easy') {
				this.confirmStartingBuilds(account);
				account.run.story.stage = 'charmeffect';
			} else {
				this.finishDeparture(account);
			}
		}
		if (this.content.starters.some(starter => starter.id === 'zygarde10')) migrateZygardeStarter(account);
		if (!needsOnboarding(account)) account.onboardingSeen = true;
		if (account.run) migrateGodrobeGift(account, account.run, this.content, this.random);
		const requirements = new Map<string, number>();
		for (const rule of Object.values(this.content.unlocks)) {
			requirements.set(rule.starter, Math.max(requirements.get(rule.starter) || 0, rule.captures));
		}
		// Re-lock historical special starters below ten, without changing an existing party or checkpoint.
		account.unlocked = account.unlocked.filter(id =>
			requirements.get(id) !== 10 || (account.captures[id] || 0) >= 10 || account.crates?.unlocked.includes(id));
        if (!account.starterTraits) {
			account.starterTraits = {};
			const run = account.run;
			if (!run) return;
			// Older ledgers have counts but no nature/IV history. Recover only retained, proven captures.
			for (const mon of [...run.team, ...run.checkpoint.team, ...(run.pendingCapture ? [run.pendingCapture] : [])]) {
				if (mon.egg) continue;
				if (run.caught.includes(mon.id)) recordStarterTraits(account, this.content, mon.set, true);
				recordStarterMoves(account, this.content, mon.set);
			}
		}
		// Recover confirmed starting configurations after migrating old capture ledgers.
		migrateShinyCaptures(account, this.content);
		for (const mon of account.run?.team || []) {
			if (mon.initialPartner) recordStarterTraits(account, this.content, mon.set, true);
		}
	}
	canEmergency(run: RogueRun): boolean {
		return !run.nuzlocke && canEditParty(run) && !healingLocked(run) && !run.team.some(mon => mon.hp > 0) &&
			!this.configured().items.some(item => item.kind === 'revive' && run.bag[item.id] > 0);
	}
	private healMember(mon: RoguePokemon) {
		restoreMember(mon);
	}
	private autoEmergency(run: RogueRun, answered = false) {
		syncNuzlocke(run);
		if (run.nuzlocke) return;
		if (run.comeback?.pending || !answered && this.content?.story && offerComeback(run, this.configured())) return;
		if (run.node?.noHealing || run.postgame || run.team.some(mon => mon.hp > 0) ||
			this.configured().items.some(item => item.kind === 'revive' && run.bag[item.id] > 0)) return;
		const cost = emergencyCost(run.floor), paid = run.money >= cost;
		run.emergencyRecovery = { cost, paid };
		if (paid) {
			run.money -= cost;
			for (const mon of run.team) this.healMember(mon);
			(run.notices ||= []).push(`全队倒下且没有复活道具，已自动支付 ${cost} 金币急救，恢复全队 HP、PP 并解除异常状态。`);
		} else {
			(run.notices ||= []).push(`全队倒下且没有复活道具；急救需要 ${cost} 金币，余额不足，尚未扣款或复活。`);
		}
	}
	private prepareFloorEvolution(run: RogueRun, resume: 'enter' | 'choose' | 'ready') {
		if (!this.content?.blessings || run.postgame || run.battle || run.encounter || run.attempt || run.recovery ||
			run.blessings?.afterFloor || !prepareEvolutionFloor(run, this.random)) return false;
		run.blessings!.evolutionResume = resume;
		run.phase = 'blessing';
		return true;
	}
	private enterFloor(run: RogueRun) {
		syncRunDifficulty(run);
		if (run.pendingSpiritGift) grantSpiritGift(run, this.configured(), this.random);
		if (this.content?.blessings) beginBlessingFloor(run, this.random);
		run.checkpoint = inventory(run);
		run.blessingCheckpoint = structuredClone(run.blessings);
		run.encounter = 0;
		run.attempt = 0;
		delete run.battle;
		delete run.recovery;
		delete run.emergencyRecovery;
		delete run.node;
		delete run.choices;
		run.phase = 'choose';
		if (run.blessings?.beforeAdventure && run.pendingCapture) {
			run.captureResume = 'choose'; run.phase = 'settlement'; return;
		}
		if (this.content?.blessings && prepareOpeningBlessings(run, this.content, this.random)) return;
		if (this.prepareFloorEvolution(run, 'enter')) return;
		this.prepareChoices(run);
		const options = this.configured().floors[run.floor];
		if (options && fixedFloor(run.floor)) this.select(run, options[0].id);
		if (run.pendingCapture) { run.captureResume = 'choose'; run.phase = 'settlement'; }
	}
	private prepareChoices(run: RogueRun) {
		if (run.phase !== 'choose' || run.blessings?.beforeAdventure || run.choices || !this.content || fixedFloor(run.floor)) return;
		let templates = this.content.floors[run.floor];
		if (!templates) return;
		if (this.content.events && this.content.routePools?.[run.floor]) {
			templates = rollRoutes(run, this.content.routePools[run.floor], this.random);
		} else if (this.content.events) {
			templates = eventRouteTemplates(templates, this.random);
			templates = tradeRouteTemplates(templates, this.random, run.floor);
		}
		if (this.content.blessings) templates = blessingRouteTemplates(run, templates);
		if (this.content.events) templates = rivalRoutes(run, templates, this.random);
		if (this.content.rewardScenes) templates = catchupRoutes(run, templates, this.content.routePools?.[run.floor] || templates);
		run.choices = this.content.biomeEncounters ?
			createBiomeRoutes(run.floor, templates, undefined, this.random, run.spirit, run.startCard,
				(run.blessings?.owned || []).flatMap(b => b.family === 'godrobe' ? ['Yveltal'] : b.family === 'puregodrobe' ? ['Reshiram'] : []),
					run.biomeHistory, run) : structuredClone(templates);
		if (this.content.biomeEncounters) run.biomeHistory = [
			...(run.biomeHistory || []).filter(entry => run.floor - entry.floor <= 5),
			...run.choices.flatMap(node => node.biome ? [{ id: node.biome.id, floor: run.floor }] : []),
		];
		if (this.content.wildTreasures) {
			for (const node of run.choices) prepareEconomy(node, run.floor, this.random, run.difficulty);
		}
		for (const node of run.choices) prepareSpiritNode(run, node, this.content, this.random);
		if (this.content.biomeEncounters) prepareFloorEnvironment(run, this.random);
		if (this.content.events) offerOptionalChallenge(run, this.random);
		if (this.content.events) addMasterBallRoute(run, this.random);
		if (this.content.story) offerMainline(run);
		if (run.spirit === 'darkrai') {
			const pool = run.choices.filter(node => !node.challenge && node.kind !== 'story');
			for (let i = 0, count = Math.min(2, pool.length); i < count;
				i++) pool.splice(this.random(pool.length), 1)[0].fogged = true;
		}
	}
	/** Create the shared, persisted floor offers for a co-op adventure. Member-specific perks are intentionally excluded. */
	prepareCoopRoutes(floor: number, difficulty: RogueRun['difficulty'], routeHistory?: RogueRun['routeHistory'],
		biomeHistory: NonNullable<RogueRun['biomeHistory']> = [], team: RoguePokemon[] = []) {
		const content = this.configured();
		const floorTemplates = content.floors[floor];
		if (!floorTemplates) return { choices: [] as RogueNode[], routeHistory: structuredClone(routeHistory), biomeHistory };
		const routeRun = { floor, difficulty, routeHistory: structuredClone(routeHistory), biomeHistory,
			team, doubleBattle: true } as unknown as RogueRun;
		let templates = structuredClone(floorTemplates);
		if (content.events && content.routePools?.[floor]) {
			templates = rollRoutes(routeRun, structuredClone(content.routePools[floor]), this.random);
		} else if (content.events) {
			templates = tradeRouteTemplates(eventRouteTemplates(templates, this.random), this.random, floor);
		}
		if (content.biomeEncounters) {
			templates = createBiomeRoutes(floor, templates, undefined, this.random, undefined, undefined, [],
				routeRun.biomeHistory || [], routeRun);
			routeRun.biomeHistory = [
				...(routeRun.biomeHistory || []).filter(entry => floor - entry.floor <= 5),
				...templates.flatMap(node => node.biome ? [{ id: node.biome.id, floor }] : []),
			];
		}
		if (content.wildTreasures) {
			for (const node of templates) prepareEconomy(node, floor, this.random, difficulty || 0);
		}
		for (const node of templates) {
			if (node.kind !== 'trade' || !node.trade ||
				!['mint', 'candy', 'machine', 'balls', 'crowns'].includes(node.trade.kind)) continue;
			const run = { floor, difficulty, team, node } as RogueRun;
			prepareTrade(run, content, this.random);
		}
		return { choices: templates, routeHistory: routeRun.routeHistory, biomeHistory: routeRun.biomeHistory || [] };
	}
	private applyDoubleBossRoster(run: RogueRun, node: RogueNode) {
		if (!run.doubleBattle || node.kind !== 'boss' ||
			!['道馆', '四天王', '冠军'].includes(BOSS_FLOORS.get(run.floor) || '')) return;
		const encounter = node.encounters.find(entry => entry.trainer || entry.trainerCandidates);
		if (!encounter) return;
		const level = encounter.trainerCandidates?.[0]?.team[0]?.level || encounter.team[0]?.level;
		if (!level) throw new Error(`第 ${run.floor} 层双打训练家缺少等级配置。`);
		const candidates = trainerBossCandidates(run.floor, level, true);
		if (!candidates.length) throw new Error(`第 ${run.floor} 层缺少双打训练家阵容。`);
		encounter.trainerCandidates = candidates;
		encounter.team = candidates[0].team;
		delete encounter.trainer;
	}
	private select(run: RogueRun, id: string, account?: RogueAccount) {
		if (run.phase === 'choose' && selectMasterBallRoute(run, id)) return;
		requireRule(run.phase === 'choose', '本层已经选择了路线。');
		const node = (run.choices || this.configured().floors[run.floor])?.find(option => option.id === id);
		requireRule(node, '本层内容尚未配置或路线无效。');
		if (account && run.mainline?.offered) mainlineProgress(account).pity[String(run.difficulty || 0)] = false;
		recordCompanionPreference(run, [], id, this.random);
		run.node = structuredClone(run.bossPreviews?.[run.floor] || node);
		if (!run.bossPreviews?.[run.floor]) this.applyDoubleBossRoster(run, run.node);
		if (node.mainlineScene) {
			requireRule(account, '请通过本局的路线选项进入故事。');
			beginMainline(account, run, node); return;
		}
		if (run.node.challenge) {
			delete run.choices;
			prepareChallengePrizes(run, this.random);
			this.resolveOpponentGenders(run.node.encounters.flatMap(encounter => encounter.team));
			if (this.content?.blessings) prepareBlessingEncounter(run, this.random);
			run.phase = 'event';
			return;
		}
		if (node.id === 'rival') {
			delete run.choices; beginRival(run, this.random);
			if (run.node.encounters.length) {
				prepareSpiritNode(run, run.node, this.configured(), this.random);
				this.resolveOpponentGenders(run.node.encounters.flatMap(encounter => encounter.team));
				if (this.content?.blessings) prepareBlessingEncounter(run, this.random);
			}
			return;
		}
		if (node.kind === 'trainer' && this.content?.events && beginPoliceEncounter(run, this.random)) {
			if (run.node.event?.police?.revenge) {
				prepareSpiritNode(run, run.node, this.configured(), this.random);
				this.resolveOpponentGenders(run.node.encounters.flatMap(encounter => encounter.team));
				if (this.content.blessings) prepareBlessingEncounter(run, this.random);
			}
			delete run.choices; return;
		}
		if (node.kind === 'trainer' && this.content?.events && !beginTeraSolo(run, this.random)) beginExclusiveEncounter(run, this.random);
		if (node.kind === 'trainer' && this.content?.events && !run.node.event && this.random(100) < 12 &&
			beginSocialEvent(run, this.random)) { delete run.choices; return; }
		if (this.content?.events) prepareTravellingTrainer(run, this.random);
		const announced = run.bossPreviews?.[run.floor];
		if (announced) for (const encounter of announced.encounters) {
			const trainer = encounter.trainer;
			if (!trainer || !['gym', 'elitefour'].includes(trainer.role)) continue;
			const history = run.trainerHistory ||= { gyms: [], eliteFour: [] };
			const ids = trainer.role === 'gym' ? history.gyms : history.eliteFour;
			if (!ids.includes(trainer.id)) ids.push(trainer.id);
		}
		if (this.content?.events && node.kind === 'event') {
			delete run.choices;
			if (account && this.content.story && prepareElderMeeting(account, run, this.random)) return;
			beginEvent(run, this.random);
			return;
		}
		if (this.content?.wildTreasures) prepareEconomy(run.node, run.floor, this.random, run.difficulty);
		delete run.choices;
		for (const encounter of run.node.encounters) {
			if (encounter.trainerCandidates) {
				const selected = chooseTrainer(run, encounter.trainerCandidates, this.random);
				encounter.trainer = selected.trainer;
				encounter.team = selected.team;
				encounter.name = selected.trainer.name;
				run.node.name = selected.trainer.name;
				delete encounter.trainerCandidates;
			}
			if (node.kind === 'wild' || node.kind === 'elite') {
				const natures = Dex.natures.all();
				for (const set of encounter.team) set.nature = natures[this.random(natures.length)].name;
			}
			if (encounter.candidates) {
				encounter.team = [encounter.candidates[this.random(encounter.candidates.length)]];
				delete encounter.candidates;
			}
			this.resolveOpponentGenders(encounter.team);
		}
		if (node.kind === 'trainer' && !run.node.event && rivalActive(run) && this.random(100) < 40) {
			for (const encounter of run.node.encounters) if (encounter.team.length >= 2) {
				const traveller = activeRivalTraveller(run)!;
				encounter.cooperative = { id: traveller.id, name: traveller.name, team: rivalTeam(run, Math.min(100, Math.max(5, Math.ceil(run.floor / 2))), 3, true) };
				encounter.catchable = false;
			}
		}
		prepareTrade(run, this.configured(), this.random);
		prepareSpiritNode(run, run.node, this.configured(), this.random);
		if (this.content?.rewardScenes) prepareRewardScene(run, this.random);
		this.resolveOpponentGenders(run.node.encounters.flatMap(encounter => encounter.team));
		if (this.content?.blessings) prepareBlessingEncounter(run, this.random);
		run.phase = run.node.rocket && !run.node.rocket.cleared ? 'ready' :
			(run.node.trade?.kind === 'auction' || run.node.trade?.kind === 'mushroom' && !run.node.event?.settled) ? 'event' :
			['rest', 'trade'].includes(node.kind) ? 'rest' :
			['reward', 'event', 'adventure'].includes(node.kind) ? 'reward' : 'ready';
		this.beginBossDialogue(run);
		if (this.content?.story && run.phase === 'rest' && node.kind === 'rest' && !run.mentorGifts?.includes(run.floor)) {
			this.prepareBossPreview(run, run.floor + 1);
			run.phase = 'story';
			run.story = { stage: 'restguide', page: 0, skip: false, canSkip: true };
		}
	}
	private prepareFutureSight(run: RogueRun) {
		if (!run.blessings?.owned.some(b => b.family === 'futuresight')) return;
		const floors = Object.keys(this.content?.floors || {}).map(Number).sort((a, b) => a - b).filter(f =>
			f > run.floor && this.content!.floors[f].some(node => node.kind === 'boss'));
		run.futureBossFloor = floors[0];
		// Plan chronologically without marking unplayed trainers as defeated. Reuse saved forecasts.
		const planning = { ...run, bossPreviews: run.bossPreviews ||= {},
			trainerHistory: structuredClone(run.trainerHistory || { gyms: [], eliteFour: [] }) };
		for (const floor of floors) {
			this.prepareBossPreview(planning, floor);
			for (const encounter of planning.bossPreviews[floor]?.encounters || []) {
				const trainer = encounter.trainer;
				if (!trainer || !['gym', 'elitefour'].includes(trainer.role)) continue;
				const ids = trainer.role === 'gym' ? planning.trainerHistory.gyms : planning.trainerHistory.eliteFour;
				if (!ids.includes(trainer.id)) ids.push(trainer.id);
			}
		}
		if (planning.trainerHistory.elitePlan) {
			(run.trainerHistory ||= { gyms: [], eliteFour: [] }).elitePlan = planning.trainerHistory.elitePlan;
		}
	}
	private prepareBossPreview(run: RogueRun, floor: number) {
		const cached = run.bossPreviews?.[floor];
		if (cached) {
			const lance = run.trainerHistory?.eliteFour.includes('lance') ||
				Object.values(run.trainerHistory?.elitePlan || {}).includes('lance');
			// Repair only an unplayed legacy champion forecast, never an active opponent.
			if (floor !== 190 || run.floor >= 190 || !lance || cached.encounters[0]?.trainer?.id === 'lance') return;
		}
		const template = this.content?.floors[floor]?.find(node => node.kind === 'boss');
		if (!template) return;
		const shadow = structuredClone({ ...run, bossPreviews: undefined });
		shadow.floor = floor;
		shadow.encounter = 0; shadow.phase = 'ready';
		const node = shadow.node = structuredClone(template);
		this.applyDoubleBossRoster(shadow, node);
		for (const encounter of node.encounters) {
			if (encounter.trainerCandidates) {
				const selected = chooseTrainer(shadow, encounter.trainerCandidates, this.random);
				encounter.trainer = selected.trainer;
				encounter.team = selected.team;
				encounter.name = node.name = selected.trainer.name;
				delete encounter.trainerCandidates;
			}
			if (encounter.candidates) {
				encounter.team = [encounter.candidates[this.random(encounter.candidates.length)]];
				delete encounter.candidates;
			}
			this.resolveOpponentGenders(encounter.team);
		}
		prepareEliteEscorts(shadow, this.random);
		// Preserve quest replacements in the announcement, but defer costs and quest settlement until entry.
		if (this.content?.blessings) {
			prepareBlessingEncounter(shadow, this.random);
			for (const encounter of node.encounters) {
				for (const [index, set] of encounter.team.entries()) set.level -= encounter.blessingLevelOffsets?.[index] ?? encounter.blessingLevels ?? 0;
				delete encounter.blessingLevels;
			}
			delete node.blessingPrepared;
		}
		if (shadow.trainerHistory?.elitePlan) {
			(run.trainerHistory ||= { gyms: [], eliteFour: [] }).elitePlan = shadow.trainerHistory.elitePlan;
		}
		(run.bossPreviews ||= {})[floor] = node;
	}
	private advanceCompletedFloor(account: RogueAccount, run: RogueRun) {
		settleStoryPity(account, run, run.floor === 200);
		if (run.floor === 200) { this.finishAdventure(account, run); return; }
		if (this.content?.story && run.floor === 160 && !run.leagueBriefingDone &&
			run.node?.encounters[0]?.trainer?.role === 'gym') {
			for (const floor of [...ELITE_FOUR_FLOORS, 190]) this.prepareBossPreview(run, floor);
			run.phase = 'story';
			run.story = { stage: 'leaguebriefing', page: 0, skip: false, canSkip: true };
			return;
		}
		if (expireRival(run, run.floor + 1)) { this.presentNarrative(run); return; }
		run.floor++;
		for (const mon of run.team) if (!mon.egg) {
			const progress = mon.evolutionProgress ||= {};
			if (progress.lastFloor !== run.floor) { progress.followed = (progress.followed || 0) + 1; progress.lastFloor = run.floor; }
		}
		hatchEggs(account, run, this.configured());
		this.enterFloor(run);
		deliverCompanionPickup(run, this.random);
	}
	private startBattle(run: RogueRun, retry = false) {
		requireRule(run.phase === 'ready' && run.team.some(mon => mon.hp > 0), '当前不能进入战斗，请先复活至少一名队员。');
		if (run.node?.event?.activity?.solo) requireRule(run.team.some(mon =>
			mon.id === run.node!.event!.activity!.solo && !mon.egg && mon.hp > 0 && toID(mon.set.species) === 'kubfu' && mon.set.level >= 35),
		'请把选中的 Lv.35 以上熊徒弟带回队伍并恢复健康；卷轴试炼只允许它独自出战。');
		if (this.content?.blessings) syncBlessingParty(run);
		requireRule(!dragonKingActive(run.blessings) || !run.blessings?.dragonKing || run.blessings.dragonKing.ability ||
			!dragonKingAbilityOptions(run.team.find(mon => mon.id === run.blessings!.dragonKing!.member)!, run.team, run.blessings).length,
		'请先在队伍面板中选择龙王的额外特性。');
		// Old saves may predate persisted opponent gender; resolve it once before choosing the portrait.
		for (const owned of run.blessings?.owned || []) {
			const candidates = Object.entries(COMPANIONS).filter(([, c]) => c.family === owned.family).map(([id]) => id);
			requireRule(candidates.length < 2 || run.blessings?.companions?.some(c => candidates.includes(c.id)), '请先选择同行训练家。');
		}
		requireRule(!run.blessings?.owned.some(b => b.family === 'companionai') ||
			run.blessings.companions?.some(c => ['sada', 'turo'].includes(c.id)), '请先选择奥琳 AI 或弗图 AI。');
		requireRule(!run.blessings?.owned.some(b => b.family === 'companionstreamer') ||
			run.blessings.companions?.some(c => ['iono', 'canari'].includes(c.id)), '请先选择奇树或卡娜莉。');
		for (const c of run.blessings?.companions || []) {
			if (c.away) continue;
			const mon = run.team.find(p => p.id === c.member);
			requireRule(c.id !== 'acerola' || c.type || !run.team.some(p => permanentMemberTypes(p).some(t => ['Ghost', 'Normal'].includes(t))), '请先选择阿塞罗拉指导的属性。');
			requireRule(!mon || c.ability || !companionAbilityOptions(c, mon, run.team, run.blessings!).length, '请先选择同行训练家提供的额外特性。');
		}
		this.resolveOpponentGenders(run.node!.encounters[run.encounter].team);
		snapshotTravelBattle(run);
		run.battle = {
			token: randomUUID(), encounterId: run.postgame?.stage === 'battle' ? `${run.id}:godchallenge` :
			`${run.id}:${run.floor}:${run.node!.id}:${run.node!.encounters[run.encounter].key || run.encounter}`,
		};
		if (!retry) this.beginPreview(run);
		else if (run.preview) run.preview.stage = 'personal';
		if (run.eventBuff?.battles) { if (run.preview?.stage !== 'running') run.eventBuff.battles--; run.battle.eventBuff = true; }
		run.phase = 'battle';
		delete run.recovery;
		delete run.emergencyRecovery;
	}

	private beginPreview(run: RogueRun) {
		const trainer = run.blessings?.companions?.find(c => !c.away && (c.id === 'sada' || c.id === 'turo'));
		if (!trainer || !run.battle) return;
		const key = `${run.battle.encounterId}:${run.attempt}`;
		if (run.preview?.key !== key) run.preview = { key, trainer: trainer.id as 'sada' | 'turo', stage: 'running' };
	}
	private beginBossDialogue(run: RogueRun) {
		if (run.phase !== 'ready' || run.story || run.postgame) return false;
		const gift = run.floor === 100 && run.node?.encounters[run.encounter]?.trainer?.role === 'gym' && !run.gymGiftReceived;
		if (!gift && (!this.content?.story || !bossIntroPages(run).length ||
			run.seenBossDialogues?.includes(bossDialogueKey(run)))) return false;
		run.phase = 'story';
		run.story = { stage: gift ? 'gymgift' : 'bossintro', page: 0, skip: false, canSkip: true };
		return true;
	}
	private resolveOpponentGenders(team: PokemonSet[]) {
		for (const set of team) {
			if (set.gender) continue;
			const species = Dex.mod('gen9fantasy').species.get(set.species);
			set.gender = species.gender || (this.random(256) < species.genderRatio.F * 256 ? 'F' : 'M');
		}
	}
	private completeFloor(account: RogueAccount, run: RogueRun) {
		if (run.node?.kind === 'boss' && run.mentorCard?.floor === run.floor) delete run.mentorCard;
		if (this.content?.events) {
			const before = { money: run.money, bag: { ...run.bag } };
			grantEventTraining(run);
			const credited = run.money;
			boostCompanionEventRewards(run, before);
			if (run.lastReward?.floor === run.floor) run.lastReward.money += run.money - credited;
		}
		completeSpiritRegion(run);
		completeComebackFloor(run);
		if (this.configured().progression) floorFriendship(run);
		const reward = run.node!.reward;
		const candyPayout = grantCandyTraining(run, reward);
		run.money += reward.money;
		for (const [id, count] of Object.entries(candyPayout.items)) run.bag[id] = (run.bag[id] || 0) + count;
		const points = awardRoguePoints(account, run, run.node!.kind === 'boss' && !run.node!.companionLoss ? 1 : 0);
		if (run.node!.wildLoot || run.node!.shopChallenge || run.node!.event ||
			run.node!.challenge || run.node!.mainlineScene || run.node!.elderScene) {
			// Wild drops have already been credited per encounter; the final receipt only adds the Boss point.
			if (run.lastReward?.floor === run.floor) run.lastReward.points += points;
		} else {
			run.lastReward = { floor: run.floor, name: run.node!.name, money: reward.money, items: candyPayout.items, points,
				...(run.node!.rewardScene?.result ? { effect: run.node!.rewardScene.result } : {}) };
		}
		if (candyPayout.effect && run.lastReward?.floor === run.floor) {
			run.lastReward.effect = [run.lastReward.effect, candyPayout.effect].filter(Boolean).join(' ');
		}
		delete run.battle;
		if (this.content?.events) grantJourneyGrowth(run, this.random);
		if (this.content?.blessings) completeBlessingFloor(account, run, this.configured(), this.random);
		affectionFloor(run, this.random);
		poppyRewardPickup(run, this.random);
		if (['wild', 'trainer', 'elite'].includes(run.node!.kind) && companionOwned(run.blessings, 'lysandre')) {
			const item = run.floor < 50 ? 'potion' : run.floor < 100 ? 'superpotion' : 'hyperpotion';
			run.bag[item] = (run.bag[item] || 0) + 1;
			(run.notices ||= []).push('【同行训练家 - 弗拉达利】留下了一瓶伤药，已放入背包。');
		}
		if (this.pendingBlessings(run)) {
			run.blessings!.afterFloor = true;
			run.phase = 'blessing';
			return;
		}
		this.advanceCompletedFloor(account, run);
	}
	private finishAdventure(account: RogueAccount, run: RogueRun) {
		if (echoEligible(run) && !account.echo?.introSeen && !run.echoIntroShown) {
			run.echoIntroShown = true;
			queueNarrative(run, ECHO_INTRO, 'advance');
			this.presentNarrative(run);
			return;
		}
		awardEcho(account, run);
		if (run.echoIntroShown && account.echo) account.echo.introSeen = true;
		recordCollapseClear(account, run);
		for (const mon of run.team) this.healMember(mon);
		run.phase = 'complete';
		awardFirstClears(account, run);
		if (!run.spirit && !run.difficulty && !run.difficultyTest) account.spiritUnlocked = true;
		recordClear(account, run);
		const trueEnding = this.content?.story && reserveTrueEnding(account, run);
		if (run.difficulty !== 'easy' && this.content?.arceusMoves && !run.postgame) {
			run.postgame = { stage: 'offer', before: inventory(run), node: structuredClone(run.node!), encounter: run.encounter };
			run.phase = 'postgame';
			if (trueEnding) beginMainlineEnding(account, run);
			else run.story = { stage: 'godinvite', page: 0, skip: false, canSkip: true };
			return;
		}
		if (this.content?.story) beginMainlineEnding(account, run);
	}
	private finishGodChallenge(account: RogueAccount, run: RogueRun, outcome: 'won' | 'lost' | 'declined') {
		const challenge = run.postgame!;
		if (['won', 'lost', 'declined'].includes(challenge.stage)) return;
		Object.assign(run, inventory(challenge.before));
		run.node = structuredClone(challenge.node);
		run.encounter = challenge.encounter;
		challenge.stage = outcome;
		delete run.battle;
		delete run.recovery;
		run.phase = 'complete';
		if (outcome === 'won') {
			const points = awardRoguePoints(account, run, 20);
			awardGodEcho(account, run);
			run.lastReward = { floor: 200, name: '神之挑战', money: 0, items: {}, points };
		}
		run.notices = [outcome === 'won' ? (run.difficulty === 'easy' ?
			'神之挑战成功！护符庇佑下不获得局外点数，通关卡保持原有成果。' :
			`神之挑战成功，额外获得 ${run.lastReward!.points} 点局外成长点数${challenge.echoAwarded ? `与【崩坏适性】×${challenge.echoAwarded}` : ''}。通关卡保持原有成果。`) :
			'200 层通关成果已保留，这次旅程即将迎来结局。'];
		if (this.content?.story && run.mainlineEnding !== 'true-seen') beginMainlineEnding(account, run);
	}
	private finishSettlement(account: RogueAccount, run: RogueRun) {
		if (run.comeback?.pending) return;
		if (run.dialogue) { this.presentNarrative(run); return; }
		if (!run.pendingCapture && run.pendingCaptures?.length) run.pendingCapture = run.pendingCaptures.shift();
		if (run.phase !== 'settlement' || run.pendingCapture || run.pendingMoves?.length) return;
		if (run.captureResume) {
			const resume = run.captureResume;
			delete run.captureResume;
			if (resume === 'shopclosed') this.completeFloor(account, run);
			else if (resume === 'choose' && run.blessings?.beforeAdventure) this.enterFloor(run);
			else run.phase = resume;
			return;
		}
		if (this.pendingBlessings(run)) { run.phase = 'blessing'; return; }
		if (run.node?.challenge && run.node.challenge.stage !== 'battle') { run.phase = 'event'; return; }
		if (run.node?.event && run.node.event.stage !== 'battle') { run.phase = 'event'; return; }
		if (run.encounter < run.node!.encounters.length) run.phase = 'ready';
		else if (run.node!.rocket && !run.node!.rocket.cleared) {
			const rocket = run.node!.rocket;
			rocket.cleared = true;
			run.money += rocket.reward;
			run.lastReward = { floor: run.floor, name: '击退火箭队', money: rocket.reward, items: {}, points: 0 };
			run.phase = 'rest';
		} else this.completeFloor(account, run);
	}
	private pendingBlessings(run: RogueRun) {
		return !!(run.blessings?.pending.length || run.blessings?.stage || run.blessings?.round?.remaining);
	}
	private presentAffectionReward(run: RogueRun) {
		if (run.story || run.dialogue || run.pendingMoves?.length ||
			!['choose', 'ready', 'rest', 'reward', 'event', 'failed'].includes(run.phase) ||
			!run.blessings?.pending.some(reward => reward.kind === 'item')) return;
		run.blessingRewardResume = run.phase;
		run.phase = 'blessing';
	}
	private finishBlessings(account: RogueAccount, run: RogueRun) {
		if (run.phase !== 'blessing' || this.pendingBlessings(run)) return;
		openLakeQuestRound(run, this.random);
		if (run.blessingRewardResume) {
			run.phase = run.blessingRewardResume;
			delete run.blessingRewardResume;
			return;
		}
		if (run.blessings?.beforeAdventure) {
			delete run.blessings.beforeAdventure;
			this.enterFloor(run);
			return;
		}
		if (run.blessings?.beforeGym) {
			delete run.blessings.beforeGym;
			run.checkpoint = inventory(run);
			run.blessingCheckpoint = structuredClone(run.blessings);
			run.phase = 'ready';
			return;
		}
		if (run.blessings?.evolutionResume) {
			const resume = run.blessings.evolutionResume;
			delete run.blessings.evolutionResume;
			if (resume === 'enter') this.enterFloor(run);
			else {
				run.phase = resume;
				run.checkpoint = inventory(run);
				run.blessingCheckpoint = structuredClone(run.blessings);
				this.prepareChoices(run);
			}
			return;
		}
		if (run.blessings?.afterFloor) {
			delete run.blessings.afterFloor;
			this.advanceCompletedFloor(account, run);
		} else { run.phase = 'settlement'; this.finishSettlement(account, run); }
	}
	command(userid: string, command: RogueCommand, name = userid) {
		const updateAccount = (account: RogueAccount) => {
			// Inside the receipt transaction: a retry of a successful pre-maintenance start stays idempotent.
			requireRule(!this.continueOnly || !['start', 'newstory', 'opencrate', 'exchangecrate', 'crateprediction'].includes(command.action),
				'当前处于应急续玩模式，暂不开放新冒险；已有冒险、剧情与奖励可继续处理。');
			this.normalizeAccount(account);
			if (command.action === 'crateprediction') {
				submitDailyCup(account.crates ||= emptyCrates(), command.id, command.value || '');
				return;
			}
			if (command.action === 'opencrate') {
				openStarterCrates(account, this.configured(), command.id, command.count!, command.value || 'none', this.random);
				return;
			}
			if (command.action === 'exchangecrate') {
				exchangeStarterCrate(account, this.configured(), command.id, command.value || '', this.random);
				return;
			}
			if (account.run) assertNuzlockeCommand(account.run, command);
			if (command.action === 'unlockack') {
				account.unlockNotices = (account.unlockNotices || []).filter(notice => notice.id !== command.value);
				return;
			}
			if (account.mainlineDialogue && ['storynext', 'storyskip', 'mainlinechoice'].includes(command.action)) {
				const kind = advanceMainline(account, this.configured(), this.random, command.value,
					command.action === 'mainlinechoice' ? command.member : undefined, command.action === 'storyskip');
				if (kind === 'ending' && account.run?.mainlineEnding === 'ending-true') {
					account.run.mainlineEnding = 'true-seen';
					if (account.run.postgame?.stage === 'offer') account.run.story = { stage: 'godinvite',
						page: 0, skip: false, canSkip: true };
				}
				return;
			}
			requireRule(!account.mainlineDialogue || ['onboarding', 'saveclear', 'publishcard',
				'deletecard'].includes(command.action) ||
				command.action === 'abandon' && account.mainlineDialogue.kind !== 'ending',
			'请先读完当前对话并作出回应。');
			requireRule(command.action === 'start' || command.difficulty === undefined, '本局难度已锁定，只能在新一局开始前选择。');
			requireRule(command.action === 'start' || command.collapse === undefined, '幻想崩坏词条已锁定，只能在新一局开始前选择。');
			if (command.action === 'comeback') {
				const run = this.run(account);
				if (chooseComeback(run, command.member, command.value)) {
					this.autoEmergency(run, true);
					this.finishSettlement(account, run);
				}
				return;
			}
			requireRule(!account.run?.comeback?.pending || command.action === 'abandon', '请先回应黑袍老人。');
			if (command.action === 'companioninvite') {
				requireRule(account.run, '当前没有进行中的冒险。');
				chooseCompanionInvitation(account.run, command.member, command.value);
				if (account.run.blessings) syncBlessingParty(account.run);
				this.presentNarrative(account.run);
				return;
			}
			requireRule(!account.run?.companionInvitations?.length ||
				['storynext', 'storyskip', 'abandon'].includes(command.action), '请先处理同行邀请，选择保留的两位伙伴。');
			if (command.action === 'ackfailure') {
				requireRule(account.run?.phase === 'defeated' && account.run.failure?.key === command.value,
					'本局结算已更新，请刷新后确认。');
				account.previousBlessings = account.run.blessings?.owned.filter(entry => !entry.grantedBy).map(entry => entry.id) || [];
				account.previousRival = account.run?.rival?.id || account.previousRival;
				settleStoryPity(account, account.run);
				delete account.run; account.opening = { page: 0, skip: false };
				if (this.content?.story) beginRememberedOpening(account);
				return;
			}
			if (command.action === 'onboarding') {
				account.onboardingSeen = true;
				account.onboardingVersion = BEGINNER_GUIDE_VERSION;
				return;
			}
			if (['saveclear', 'publishcard', 'deletecard'].includes(command.action)) {
				editClearCard(account, command);
				return;
			}
			if (command.action === 'newstory') {
				requireRule(account.run?.phase === 'complete' && !account.run.story &&
					!account.mainlineDialogue && !account.pendingClear,
				'请先读完终章并处理待保存的通关卡。');
				account.previousBlessings = account.run.blessings?.owned.filter(entry => !entry.grantedBy).map(entry => entry.id) || [];
				account.previousRival = account.run?.rival?.id || account.previousRival;
				delete account.run;
				account.opening = { page: 0, skip: false };
				if (this.content?.story) beginRememberedOpening(account);
				return;
			}
			if (command.action === 'storynext' || command.action === 'storyskip') {
				const view = storyView(account, !!this.content?.story, this.localSpirits);
				requireRule(view && 'key' in view && command.value === view.key, '剧情进度已更新，请刷新后继续。');
				const skip = command.action === 'storyskip';
				requireRule(!skip || view.canSkip, '首次冒险请先阅读序章。');
				const length = view.total;
				if (view.stage === 'opening') {
					account.opening = { page: skip ? length : view.index + 1, skip };
				} else {
					const run = account.run!;
					const story = run.story!;
					if (skip) story.skip = true;
					story.page = skip ? length : story.page + 1;
					if (story.page >= length) {
						story.page = 0;
						if (story.stage === 'spirit') story.stage = 'spiritEffect';
						else if (story.stage === 'climb') story.stage = 'cards';
						else {
							delete run.story;
							if (view.stage === 'interlude') {
								const resume = run.dialogue!.resume; delete run.dialogue;
								if (resume === 'advance') this.advanceCompletedFloor(account, run);
								else {
									run.phase = resume;
									if (resume === 'settlement') this.finishSettlement(account, run);
								}
							}
							if (view.stage === 'portal') this.enterFloor(run);
							if (view.stage === 'gymgift' || view.stage === 'bossintro') rememberBossDialogue(run);
							if (view.stage === 'gymgift') gymSystemGift(run);
							if (view.stage === 'bossintro') run.phase = 'ready';
							if (view.stage === 'leaguebriefing') {
								run.leagueBriefingDone = true;
								this.advanceCompletedFloor(account, run);
							}
							if (view.stage === 'restguide') {
								if (!run.mentorGifts?.includes(run.floor)) run.mentorOffer = run.floor + 1;
								run.phase = 'rest';
							}
						}
					}
				}
				return;
			}
			if (command.action === 'setdifficulty') {
				requireRule(!account.run || account.run.phase === 'complete', '本局难度已锁定，请结束或放弃本局后再选择。');
				requireRule(command.value === 'default' || command.value === 'easy' || /^[0-5]$/.test(command.value || ''), '难度档位无效。');
				if (command.value === 'default') {
					delete account.preferredDifficulty;
					delete account.preferredNuzlocke;
				} else {
					const tier = command.value === 'easy' ? 'easy' : Number(command.value) as NonNullable<RogueAccount['preferredDifficulty']>;
					requireRule(tier === 'easy' || tier <= account.difficulties!.highest || this.localSpirits, '请先通关上一档 200 层，并完成该档故事。');
					account.preferredDifficulty = tier;
					if (tier === 'easy') delete account.preferredNuzlocke;
				}
				return;
			}
			if (command.action === 'echo') {
				buyEcho(account, command.value || '', this.localSpirits);
				return;
			}
			if (command.action === 'setnuzlocke') {
				requireRule(!account.run || account.run.phase === 'complete', '本局规则已锁定，请结束或放弃本局后再选择。');
				requireRule(typeof preferredDifficulty(account, this.localSpirits) === 'number', '请先选择 0—5 档，才能开启 Nuzlocke。');
				requireRule(command.value === 'on' || command.value === 'off', 'Nuzlocke 选项无效。');
				account.preferredNuzlocke = command.value === 'on';
				return;
			}
			if (command.action === 'upgrade') {
				requireRule(!account.run || account.run.phase === 'complete', '进行中的冒险不能花费成长点数，请结束或放弃本局后再加点。');
				if (command.value === 'slot') {
					const cost = rogueSlotCost(account.slots);
					requireRule(account.slots < 6, '初始栏位已满。');
					requireRule(account.points >= cost, `成长点数不足，本次扩展需要 ${cost} 点。`);
					account.points -= cost;
					account.slots++;
				} else {
					const stat = command.value as StatID;
					requireRule(ROGUE_STATS.includes(stat) && account.boosts[stat] < 10, '属性已满或属性无效。');
					const cost = rogueStatCost(account.boosts[stat]);
					requireRule(account.points >= cost, `成长点数不足，本次提升需要 ${cost} 点。`);
					account.points -= cost;
					account.boosts[stat]++;
				}
				return;
			}
			if (command.action === 'start') {
				const content = this.configured();
				const chosenDifficulty = command.difficulty ?? preferredDifficulty(account, this.localSpirits);
				const difficulty = chosenDifficulty ?? 0;
				requireRule(!account.preferredNuzlocke || typeof chosenDifficulty === 'number', 'Nuzlocke 仅支持明确选择的 0—5 档。');
				requireRule(isRogueDifficulty(difficulty), '难度档位无效。');
				const collapse = command.collapse ?? [];
				requireRule(validCollapseSelection(difficulty, collapse), `本档必须选择 ${collapseCount(difficulty)} 条不同的幻想崩坏词条。`);
				const unlocked = difficulty === 'easy' || difficulty <= account.difficulties!.highest;
				requireRule(unlocked || this.localSpirits, '请先通关上一档 200 层。');
				requireRule(!account.pendingClear, '请先选择保存或放下本次通关卡。');
				requireRule(!content.story || (!account.run && account.opening?.page === ROGUE_STORY.opening!.length),
					'请先完成开场阅读，再选择初始伙伴。');
				requireRule(command.useSpirit === undefined || typeof command.useSpirit === 'boolean', '塔灵选项无效。');
				const spiritAllowed = difficultySpiritUnlocked(account);
				requireRule(!command.useSpirit || (content.spirits && (this.localSpirits || spiritAllowed)),
					'请先通关任意档位的 200 层，即可在所有已解锁档位开启随机塔灵。');
				requireRule(!command.testSpirit || (this.localSpirits && command.useSpirit), '指定塔灵仅在本地测试开放。');
				requireRule(command.selectedSpirit === undefined || typeof command.selectedSpirit === 'string', '塔灵选项无效。');
				requireRule(!command.selectedSpirit || (command.useSpirit && !command.testSpirit &&
					canSelectSpirit(account, command.selectedSpirit, difficulty)),
					'需要使用这个塔灵通关本档或更高档的 200 层，才能在本档指定；仅护符档通关的塔灵，请先选择护符档。');
				requireRule(!account.run || account.run.phase === 'complete', '请先继续或明确放弃已有冒险。');
				const selected = command.starters;
				requireRule(Array.isArray(selected) && selected.length > 0 && selected.length <= account.slots &&
					new Set(selected).size === selected.length, '请选择已解锁栏位内的不同初始宝可梦。');
				requireRule(selected.reduce((used, id) => used + rogueStarterSlotCost(content.starters.find(s => s.id === id)?.set.species || ''), 0) <= account.slots,
					'初始名额不足：普通伙伴占 1 格，传说宝可梦与幻之宝可梦占 4 格，一级神占 6 格。');
				requireRule(command.starterBuilds === undefined || (command.starterBuilds &&
					typeof command.starterBuilds === 'object' && !Array.isArray(command.starterBuilds) &&
					Object.keys(command.starterBuilds).every(id => selected.includes(id))), '初始配置无效。');
				const team = selected.map(id => {
					const starter = content.starters.find(entry => entry.id === id);
					requireRule(starter && (starter.availableInitially || account.unlocked.includes(id)), '初始宝可梦尚未解锁。');
					const traits = starterTraits(account, id);
					const build = command.starterBuilds?.[id];
					requireRule(build?.shiny === undefined || typeof build.shiny === 'boolean', '闪光配置无效。');
					requireRule(!build?.shiny || traits.shiny, '请先捕捉该谱系的闪光宝可梦，才能选择闪光初始伙伴。');
					const nature = build?.nature ?? 'random';
					requireRule(typeof nature === 'string' && (nature === 'random' || traits.natures.includes(toID(nature))),
						'这个性格尚未解锁。');
					const ivs = build?.ivs ?? traits.ivs.max;
					requireRule(ivs && typeof ivs === 'object' && !Array.isArray(ivs) && ROGUE_STATS.every(stat =>
						Number.isInteger(ivs[stat]) && ivs[stat] >= traits.ivs.min[stat] && ivs[stat] <= traits.ivs.max[stat]),
					'个体值超出该伙伴已解锁的范围。');
					const natures = Dex.natures.all();
					const species = Dex.mod('gen9fantasy').species.get(starter.set.species);
					const ability = build?.ability ?? 'random';
					requireRule(typeof ability === 'string' && (ability === 'random' ||
						(traits.abilities.includes(toID(ability)) && Object.values(species.abilities).some(a => toID(a) === toID(ability)))),
					'这个特性尚未解锁或不适用于该物种。');
					const normalAbilities = [...new Set([species.abilities[0], species.abilities[1]].filter(Boolean))];
					const gender = build?.gender ?? 'random';
					requireRule(gender === 'random' || (['M', 'F', 'N'].includes(gender) &&
						(traits.genders.includes(gender) || species.gender === 'N') && (!species.gender || gender === species.gender)),
					'这个性别尚未解锁或不适用于该物种。');
					const moves = build?.moves ?? starter.set.moves.map(toID);
					const availableMoves = starterMoves(account, content, id);
					requireRule(Array.isArray(moves) && moves.length >= 1 && moves.length <= 4 &&
						moves.every(move => typeof move === 'string' && availableMoves.includes(toID(move))) &&
						new Set(moves.map(toID)).size === moves.length, '请选择 1～4 个不重复、已解锁且初始形态可合法学习的招式。');
					const set = { ...structuredClone(starter.set), shiny: !!build?.shiny, ivs: { ...ivs }, happiness: ROGUE_INITIAL_FRIENDSHIP,
						ability: ability === 'random' ? normalAbilities[this.random(normalAbilities.length)]! :
						Dex.mod('gen9fantasy').abilities.get(ability).name,
						moves: moves.map(toID),
						gender: gender === 'random' ? species.gender || (this.random(256) < species.genderRatio.F * 256 ? 'F' : 'M') : gender,
						nature: nature === 'random' ? natures[this.random(natures.length)].name : Dex.natures.get(nature).name };
					const mon = createRoguePokemon(set, account.boosts);
					mon.initialPartner = true;
					// Confirming the charm later must not leak this configuration into permanent growth.
					// All unlocked legal moves are available immediately in the in-run editor.
					mon.moveMemory = availableMoves.map(moveid => {
						const move = Dex.mod('gen9fantasy').moves.get(moveid);
						return { id: move.id, pp: move.pp, maxpp: move.pp };
					});
					mon.seenMoves = availableMoves.map(toID);
					if (content.progression) initializeExperience(mon);
					return mon;
				});
				const echo = account.echo?.unlocked ? structuredClone(account.echo.upgrades) : undefined;
				const initial = { team, bag: { ...content.initialBag }, money: content.initialMoney,
					teraUnlocked: !!echo?.systems.includes('tera'), megaUnlocked: !!echo?.systems.includes('mega'),
					zUnlocked: !!echo?.systems.includes('z'), gmegaUnlocked: !!echo?.systems.includes('gmega') };
				if (account.run) {
					account.previousBlessings = account.run.blessings?.owned
						.filter(entry => !entry.grantedBy).map(entry => entry.id) || [];
				}
				account.run = {
					nuzlocke: account.preferredNuzlocke ? { version: 1, encounters: {}, dead: [] } : undefined,
					doubleBattle: !!content.doubleBattle,
					echo,
					difficulty, difficultyRulesVersion: ROGUE_DIFFICULTY_VERSION,
					collapse: [...collapse],
					difficultyTest: !unlocked || !!(command.useSpirit && !difficultySpiritUnlocked(account, difficulty)),
					charmChoicePending: !!content.story && chosenDifficulty === undefined,
					startingBuilds: team.map(mon => structuredClone(mon.set)),
					honeymoon: account.honeymoon && { ...account.honeymoon },
					...initial, id: randomUUID(), contentVersion: content.version, floor: 1, phase: 'choose',
					owner: { id: userid, name },
					companionsVersion: 1,
					previousBlessings: [...account.previousBlessings || []],
					previousRival: account.run?.rival?.id || account.previousRival,
					encounter: 0, attempt: 0, boosts: { ...account.boosts }, boostRuleVersion: 2, startingSlots: account.slots,
					eventFragmentRuleVersion: 2,
					checkpoint: inventory(initial), caught: [], trainerHistory: { gyms: [], eliteFour: [] },
				};
				if (!content.story) this.confirmStartingBuilds(account);
				recordCollapseStart(account, account.run);
				if (this.content?.story) reserveMainline(account, account.run, this.random);
				syncRunDifficulty(account.run);
				if (account.run.previousRival) account.previousRival = account.run.previousRival;
				if (content.routePools) normalizeRouteHistory(account.run);
				if (content.spirits) account.run.spiritVersion = 1;
				if (content.blessings) normalizeBlessings(account.run).beforeAdventure = true;
				if (command.useSpirit) initializeSpirit(account.run, content, this.random, command.selectedSpirit || command.testSpirit);
				if (content.blessings) syncBlessingParty(account.run);
				if (content.story) {
					account.run.story = { stage: command.useSpirit ? account.opening?.skip ? 'spiritEffect' : 'spirit' : 'climb',
						page: 0, skip: !!account.opening?.skip, canSkip: this.localSpirits || !!account.adventures };
					if (!command.useSpirit) afterSpirit(account.run);
				} else if (!command.useSpirit) this.enterFloor(account.run);
				account.adventures = (account.adventures || 0) + 1;
				account.onboardingSeen = true;
				delete account.opening;
				return;
			}
			const run = this.run(account);
			if (run.retryHealing) {
				requireRule(['retryheal', 'retrycancel', 'learn', 'abandon'].includes(command.action), '请先确认再战治疗，或取消再战。');
			}
			if (command.action === 'release') {
				requireRule(canEditParty(run), '当前不能放生伙伴，请先处理战斗或待接纳的新伙伴。');
				releasePartyMember(run, command.member || '', !!command.confirmed);
				if (this.content?.blessings) syncBlessingParty(run);
				syncGrowthParty(run); syncExclusiveItems(run);
				this.checkFailure(run);
				return;
			}
			requireRule(run.preview?.stage !== 'result' || ['previewresult', 'abandon'].includes(command.action),
				'请先接受预演结果，或选择亲自挑战。');
			if (['blessing', 'blessingrefresh', 'blessingquality', 'blessingreward', 'fantasize', 'meltanevolve',
				'swordreward', 'exchangeshards', 'settera', 'inheritrobe', 'learnbonus', 'catability', 'usecompound'].includes(command.action)) {
				requireRule(this.content?.blessings || (command.action === 'blessingreward' && (run.blessings?.beforeGym ||
					run.blessings?.pending.some(reward => reward.id === command.member))),
					'祝福系统尚未开放。');
				handleBlessingCommand(account, run, this.configured(), command, this.random);
				this.finishBlessings(account, run);
				return;
			}
			if (command.action === 'abandon') {
				requireRule(run.phase !== 'battle', '请先结束当前战斗，再放弃冒险。');
				if (run.postgame?.stage === 'offer') { this.finishGodChallenge(account, run, 'declined'); return; }
				account.previousBlessings = run.blessings?.owned.filter(entry => !entry.grantedBy).map(entry => entry.id) || [];
				account.previousRival = account.run?.rival?.id || account.previousRival;
				settleStoryPity(account, run);
				delete account.mainlineDialogue;
				delete account.run;
				if (this.content?.story && account.mainline?.completed.length) {
					account.opening = { page: 0, skip: false }; beginRememberedOpening(account);
				}
				return;
			}
			requireRule(!run.pendingMoves?.length || ['learn', 'replace'].includes(command.action), '请先处理待学习的招式。');
			if (command.action === 'fusion' || command.action === 'unfusion') {
				editFusion(run, command); return;
			}
			if (command.action === 'forme') {
				useFormItem(run, command.member || '', command.value || '');
				syncBlessingParty(run); syncExclusiveItems(run); return;
			}
			if (TEAM_ACTIONS.includes(command.action)) {
				editParty(run, command, this.configured());
				if (this.content?.blessings) syncBlessingParty(run);
				for (const mon of run.team.filter(member => !member.egg)) recordStarterMoves(account, this.configured(), mon.set);
				syncExclusiveItems(run);
				return;
			}
			const shopMoneyBefore = run.money;
			const shoppingTransaction = ['trade', 'rest'].includes(run.node?.kind || '') && ['buy', 'buygrowth', 'event'].includes(command.action);
			switch (command.action) {
			case 'godchallenge': {
				requireRule(run.difficulty !== 'easy', '护符庇佑的旅程在第 200 层结束。');
				requireRule(run.phase === 'postgame' && run.postgame?.stage === 'offer' && !run.story,
					'请先读完神之挑战邀请。');
				requireRule(command.value === 'accept' || command.value === 'decline', '挑战选项无效。');
				if (command.value === 'decline') { this.finishGodChallenge(account, run, 'declined'); break; }
				requireRule(this.content?.arceusMoves, '神之挑战配置尚未完成。');
				Object.assign(run, inventory(run.postgame.before));
				run.node = { id: 'godchallenge', name: '神之挑战 · 阿尔宙斯', kind: 'boss',
					encounters: [arceusEncounter(100, this.content.arceusMoves)], reward: { money: 0, items: {} } };
				run.encounter = 0;
				prepareSpiritNode(run, run.node, this.configured(), this.random);
				if (this.content?.blessings) prepareBlessingEncounter(run, this.random);
				run.postgame.stage = 'battle';
				run.battle = { token: randomUUID(), encounterId: `${run.id}:godchallenge`, eventBuff: !!run.eventBuff?.battles };
				this.beginPreview(run);
				run.phase = 'battle';
				break;
			}
			case 'event':
				if (chooseMasterBall(account, run, command)) break;
				chooseEventOption(account, run, this.configured(), this.random, command.member, command.value, command.evs, command.skiAt);
				if (run.phase === 'ready') {
					if (!run.node?.event?.police && !run.node?.event?.rematch) prepareEconomy(run.node!, run.floor, this.random, run.difficulty);
					prepareSpiritNode(run, run.node!, this.configured(), this.random);
					this.resolveOpponentGenders(run.node!.encounters.flatMap(encounter => encounter.team));
					if (this.content?.blessings) prepareBlessingEncounter(run, this.random);
				}
				if (this.pendingBlessings(run)) run.phase = 'blessing';
				break;
			case 'affection':
				affectionCommand(run, command); break;
			case 'companion':
				companionCommand(run, command, this.random, eventView(run)?.options || []);
				break;
			case 'socialcompanion':
				socialCompanionCommand(run, command, companionOptions(run, eventView(run)?.options || []));
				break;
			case 'previewresult': {
				const preview = run.preview;
				requireRule(run.phase === 'ready' && preview?.stage === 'result' && preview.result, '预演结果已经处理。');
				const result = preview.result;
				requireRule(command.value === 'personal' || command.value === 'accept' && result.won, '只能接受获胜的预演结果。');
				preview.stage = 'personal'; delete preview.result;
				if (command.value === 'accept') {
					run.battle = { token: randomUUID(), encounterId: result.encounterId };
					run.phase = 'battle';
					if (run.eventBuff?.battles) run.eventBuff.battles--;
					this.settleResult(account, run, result);
				} else run.notices = ['预演已经结束。队伍、背包和成长保持预演前状态，请准备后亲自挑战。'];
				break;
			}
			case 'startcard':
				requireRule(run.phase === 'story' && run.story?.stage === 'cards' && !run.startCard && startCard(command.value),
					'当前不能选择这张开局卡片。');
				run.startCard = command.value;
				if (run.charmChoicePending) {
					run.story.stage = 'charm'; run.story.page = 0;
				} else {
					this.finishDeparture(account);
				}
				break;
			case 'charm': {
				requireRule(run.phase === 'story' && run.story?.stage === 'charm' && run.charmChoicePending, '现在不能领取护符。');
				requireRule(command.value === 'accept' || command.value === 'decline', '护符选项无效。');
				const tier = command.value === 'accept' ? 'easy' : 0;
				requireRule(!run.spirit || this.localSpirits || difficultySpiritUnlocked(account, tier),
					'请先通关任意档位的 200 层，才能开启塔灵。');
				run.difficulty = tier;
				run.difficultyTest = !!run.spirit && !difficultySpiritUnlocked(account, tier);
				delete run.charmChoicePending;
				account.charmIntroduced = true;
				if (tier === 'easy') {
					this.confirmStartingBuilds(account);
					syncRunDifficulty(run);
					run.story.stage = 'charmeffect';
				} else this.finishDeparture(account);
				break;
			}
			case 'charmack':
				requireRule(run.phase === 'story' && run.story?.stage === 'charmeffect', '当前没有待收下的护符。');
				this.finishDeparture(account);
				break;
			case 'restartsetup':
				requireRule(run.phase === 'story' && run.story?.stage === 'difficultyconfirm' && run.startingBuilds, '本局已经开始。');
				delete account.run;
				account.adventures = Math.max(0, (account.adventures || 1) - 1);
				account.opening = { page: ROGUE_STORY.opening!.length, skip: !!run.story.skip };
				// Do not run the old adventure's move-recording tail after removing it.
				return;
			case 'confirmdifficulty':
				requireRule(run.phase === 'story' && run.story?.stage === 'difficultyconfirm' && run.startingBuilds, '本局难度已确认。');
				this.confirmStartingBuilds(account);
				if (run.story.skip) { delete run.story; this.enterFloor(run); }
				else { run.story.stage = 'portal'; run.story.page = 0; }
				break;
			case 'spiritack':
				requireRule(run.phase === 'intro' && !run.pendingCapture && run.team.length <= roguePartyLimit(run.spirit, run.blessings),
					'请先安置赠送伙伴或将队伍缩减至塔灵允许的数量。');
				requireRule(!run.story || run.story.stage === 'spiritEffect', '请先读完塔灵现身的剧情。');
				if (!afterSpirit(run)) this.enterFloor(run);
				break;
			case 'trimparty':
				requireRule(run.phase === 'intro' && run.spirit === 'regigigas' && run.team.length > 3 &&
					run.team.some(mon => mon.id === command.member), '当前无需精简队伍。');
				run.team = run.team.filter(mon => mon.id !== command.member);
				break;
			case 'box': editSpiritBox(run, command.member || '', command.value); break;
			case 'merge': mergeSpiritPokemon(run, command.member || '', command.order); break;
			case 'learn': {
				const pending = run.pendingMoves?.[0];
				const mon = run.team.find(entry => entry.id === pending?.member);
				requireRule(pending && mon && command.member === mon.id, '没有对应的待学习招式。');
				rememberMove(mon, pending.move);
				if (command.value !== 'skip') {
					const slot = Number(command.value);
					requireRule(Number.isInteger(slot) && slot >= 0 && slot < mon.set.moves.length, '替换招式位置无效。');
					mon.set.moves[slot] = pending.move;
					rebuildMember(mon, run.boosts);
				}
				if (!run.battle?.growthBaseline) recordStarterMoves(account, this.configured(), { ...mon.set, moves: [pending.move] });
				run.pendingMoves!.shift();
				this.finishSettlement(account, run);
				break;
			}
			case 'replace': {
				requireRule(['settlement', 'intro'].includes(run.phase) && run.pendingCapture, '没有待安置的捕获成员。');
				requireRule(command.member === run.pendingCapture.id, '待接纳的伙伴已变化，请重新确认。');
				if (command.value !== 'release') {
					if (command.value === 'join') {
						requireRule(run.team.length < roguePartyLimit(run.spirit, run.blessings), '队伍已满，请先确认放生一位旧伙伴。');
						run.team.push(run.pendingCapture);
					} else releasePartyMember(run, command.value || '', !!command.confirmed, run.pendingCapture);
				}
				delete run.pendingCapture;
				if (this.content?.blessings) syncBlessingParty(run);
				syncGrowthParty(run); syncExclusiveItems(run);
				this.finishSettlement(account, run);
				break;
			}
			case 'evolve': {
				confirmPartyEvolution(run, this.configured(), command.member, command.value);
				if (this.content?.blessings) syncBlessingParty(run);
				break;
			}
			case 'dragonking': {
				requireRule(canEditParty(run) || run.phase === 'blessing', '请在战斗外选择龙王的额外特性。');
				requireRule(dragonKingActive(run.blessings), '请在爱丽丝同行时选择龙王的额外特性。');
				syncBlessingParty(run);
				const king = run.blessings?.dragonKing;
				requireRule(king && king.member === command.member &&
					dragonKingAbilityOptions(run.team.find(mon => mon.id === king.member)!, run.team, run.blessings)
					.includes(command.value as DragonKingAbility), '龙王或特性选项已经变化；已有同名特性不能重复赋予。');
				king.ability = command.value as DragonKingAbility;
				break;
			}
			case 'select':
				this.select(run, command.value || '', account);
				// Legacy route saves may predate environments. Resolve their actual opponents first.
				if (this.content?.biomeEncounters) prepareFloorEnvironment(run, this.random);
				break;
			case 'mentorcard':
				requireRule(run.phase === 'rest' && run.mentorOffer === run.floor + 1 &&
					Object.prototype.hasOwnProperty.call(MENTOR_CARDS, command.value || ''), '请在老人给出的卡片中选择一张。');
				run.mentorCard = { floor: run.mentorOffer, kind: command.value as MentorCard };
				(run.mentorGifts ||= []).push(run.floor);
				delete run.mentorOffer;
				break;
			case 'challenge': {
				const challenge = run.node?.challenge;
				requireRule(run.phase === 'event' && challenge && !run.pendingMoves?.length, '请先完成当前步骤，再处理挑战。');
				if (command.value === 'accept' || command.value === 'skip') {
					requireRule(challenge.stage === 'offer', '本次挑战已经作出决定。');
					const record = challengeRecord(run);
					if (command.value === 'accept') {
						challenge.stage = 'battle'; run.phase = 'ready';
						if (record) record.accepted = true;
					} else {
						challenge.stage = 'closed'; challenge.outcome = 'skipped';
						if (record) record.outcome = 'skipped';
					}
				} else if (command.value === 'retry') {
					requireRule(challenge.stage === 'paused', '请先退出当前战斗。');
					challenge.stage = 'battle'; run.phase = 'ready';
					delete challenge.outcome;
				} else if (command.value === 'leave') {
					requireRule(['paused', 'closed', 'claimed'].includes(challenge.stage), '请先领取奖励或结束挑战。');
					if (challenge.stage === 'paused') {
						challenge.stage = 'closed';
						challenge.outcome = 'skipped';
						const record = challengeRecord(run);
						if (record) record.outcome = 'skipped';
					}
					if (challenge.stage === 'closed') this.advanceCompletedFloor(account, run);
					else this.completeFloor(account, run);
				} else {
					chooseChallengePrize(run, command.value || '');
				}
				break;
			}
			case 'evolutionnotice': {
				requireRule(canEditParty(run) || run.battle?.growthPaused, '请在战斗结束后决定是否进化。');
				const mon = run.team.find(member => member.id === command.member);
				requireRule(mon, '伙伴已不在队伍中。');
				delete mon.evolutionNotice;
				break;
			}
			case 'shopchallenge':
				beginShopChallenge(run, this.configured(), this.random);
				// falls through: the challenge begins immediately after confirmation.
			case 'battle':
				if (run.phase === 'story' && run.story?.stage === 'bossintro') {
					const view = storyView(account, !!this.content?.story, this.localSpirits);
					requireRule(view && 'key' in view && view.battleReady && command.value === view.key,
						'请先读完战前对话，再选择开始或返回准备。');
					rememberBossDialogue(run);
					delete run.story;
					run.phase = 'ready';
				} else if (this.beginBossDialogue(run)) break;
				if (run.phase === 'ready' && this.prepareFloorEvolution(run, 'ready')) break;
				this.startBattle(run);
				break;
			case 'rematch':
				requireRule(run.preview?.stage !== 'running', '预演不消耗道具，请先选择亲自挑战。');
				requireRule(run.phase === 'battle' && run.battle && !run.battle.retreatRequested, '当前没有可以再战的战斗。');
				run.battle.retryRequested = true;
				// falls through: persist the actual battle losses before quoting medicine.
			case 'retreat':
				requireRule(run.phase === 'battle' && run.battle, '当前没有可以逃跑的战斗。');
				run.battle.retreatRequested = true;
				break;
			case 'partyheal': {
				requireRule(canEditParty(run) && !healingLocked(run), '请在允许治疗的战斗外使用。');
				const mon = run.team.find(member => member.id === command.member);
				requireRule(mon && !mon.egg && !mon.nuzlockeDead, '该伙伴不能接受治疗。');
				run.retryHealing = { key: randomUUID(), encounterId: '', purpose: 'heal', member: mon.id };
				break;
			}
			case 'retrycancel':
				requireRule(run.retryHealing && command.value === run.retryHealing.key, '再战请求已变化，请刷新。');
				delete run.retryHealing;
				break;
			case 'retryheal': {
				const pending = run.retryHealing;
				requireRule(pending && command.value === pending.key &&
					(pending.purpose === 'heal' ? canEditParty(run) :
						run.phase === 'ready' || run.phase === 'event' && run.node?.challenge?.stage === 'paused'),
				'再战治疗已变化，请刷新后确认。');
				requireRule(!healingLocked(run) && !run.pendingCapture && !run.pendingMoves?.length, '请先完成队伍结算。');
				if (pending.purpose === 'heal') {
					requireRule(command.member === pending.member, '治疗对象已变化，请重新确认。');
					const plan = applyRetryHealing(account, run, this.configured(), pending.member);
					run.notices = Object.entries(plan.used).map(([id, count]) =>
						`治疗消耗：${inventoryItem(this.configured(), id)!.name} ×${count}`);
					if (!plan.complete) run.notices.push('背包缺少适用药物，已完成当前能够进行的治疗。');
					delete run.retryHealing;
					break;
				}
				if (command.member) {
					const mon = run.team.find(member => member.id === command.member);
					requireRule(mon && !mon.egg && !mon.nuzlockeDead, '该伙伴不能接受治疗。');
					requireRule(Object.keys(planRetryHealing(run, this.configured(), mon.id).used).length,
						'该伙伴无需治疗或缺少适用药物，尚未消耗道具。');
				} else {
					const quote = planRetryHealing(run, this.configured());
					requireRule(!quote.insufficientHP || !Object.keys(quote.used).length,
						'药品不足以恢复全队，请先选择需要治疗的伙伴。');
				}
				const plan = applyRetryHealing(account, run, this.configured(), command.member);
				run.notices = Object.entries(plan.used).map(([id, count]) =>
					`再战治疗：${inventoryItem(this.configured(), id)!.name} ×${count}`);
				const remaining = planRetryHealing(run, this.configured());
				if (Object.keys(remaining.used).length) {
					pending.key = randomUUID();
				} else if (run.team.some(mon => !mon.egg && !mon.nuzlockeDead && mon.hp > 0)) {
					if (run.node?.challenge) run.node.challenge.stage = 'battle';
					run.phase = 'ready';
					this.startBattle(run, true);
					requireRule(run.battle?.encounterId === pending.encounterId, '当前对手已变化，治疗未执行。');
					delete run.retryHealing;
				} else {
					delete run.retryHealing;
					run.notices.push('没有可出战的伙伴，且背包缺少适用的复活道具；已留在战斗外。');
				}
				break;
			}
			case 'emergency':
				requireRule(this.canEmergency(run), '仅在全队濒死、没有复活道具且允许场外治疗时可急救。');
				requireRule(run.money >= emergencyCost(run.floor), `急救需要 ${emergencyCost(run.floor)} 金币，当前余额不足。`);
				run.money -= emergencyCost(run.floor);
				delete run.emergencyRecovery;
				for (const mon of run.team) this.healMember(mon);
				run.notices = [`已花费 ${emergencyCost(run.floor)} 金币急救全队，HP、PP 和异常状态已恢复。`];
				break;
			case 'retry': {
				requireRule(run.phase === 'failed' && run.node?.noHealing, '只有连续挑战全队倒下后可重试整层；普通战斗请治疗后继续当前场次。');
				const friendships = new Map(run.team.map(mon => [mon.id, friendship(mon)]));
				Object.assign(run, inventory(run.checkpoint));
				if (run.blessingCheckpoint) run.blessings = structuredClone(run.blessingCheckpoint);
				for (const mon of run.team) {
					if (friendships.has(mon.id)) mon.set.happiness = friendships.get(mon.id)!;
				}
				run.encounter = 0;
				run.attempt++;
				run.phase = 'ready';
				delete run.battle;
				delete run.pendingCapture;
				delete run.pendingMoves;
				delete run.recovery;
				run.notices = ['已恢复进入本层时的队伍、经验、道具和货币。'];
				delete run.lastReward;
				break;
			}
			case 'heal': {
				requireRule(run.phase === 'rest' && run.node?.kind === 'rest', '只能在休整中心恢复。');
				const care = centerCare(run);
				requireRule(care.needed, '全队状态良好，无需支付治疗费。');
				requireRule(run.money >= care.cost, `治疗需要 ${care.cost} 金币，余额不足。`);
				run.money -= care.cost;
				for (const mon of run.team) {
					if (!mon.hp && !care.revives) continue;
					const hp = mon.hp;
					this.healMember(mon);
					if (run.spirit === 'yveltal') mon.hp = hp;
				}
				break;
			}
			case 'rewardchoice':
				if (command.value !== 'show') recordCompanionPreference(run, [], command.value || '', this.random);
				chooseReward(run, this.configured(), this.random, command.value || '', command.member);
				break;
			case 'coverage':
				claimCoverage(account, run, this.configured(), command.member, command.value);
				break;
			case 'buygrowth':
				buyGrowth(run, command);
				break;
			case 'buy': case 'buyhp': {
				requireRule(run.phase === 'rest', '只能在休整商店购买。');
				const item = shopStock(this.configured(), run).find(entry => entry.id === command.value);
				requireRule(item && spiritShopAvailable(item, run.floor), '商品尚未解锁或不在商店售卖。');
				const count = command.count ?? 1;
				requireRule(Number.isSafeInteger(count) && count > 0 && count <= 999, '购买数量须为 1～999 的整数。');
				requireRule(command.action !== 'buyhp' || count === 1, '血量支付每次只能购买一件。');
				requireRule(item.remaining === undefined || item.remaining >= count, '本店该商品库存不足或已售罄。');
				if (command.action === 'buyhp') {
					const mon = run.team.find(entry => entry.id === command.member);
					requireRule(run.spirit === 'yveltal' && (run.node!.hpPurchases || 0) < 3 && mon,
						'本商店的血量购买限额已用完，或目标无效。');
					const cost = hpPurchaseCost(item, mon.maxhp);
					requireRule(mon.hp > cost, `需要 ${cost} HP，支付后至少保留 1 HP。`);
					mon.hp -= cost;
					run.node!.hpPurchases = (run.node!.hpPurchases || 0) + 1;
				} else {
					const cost = item.price * count;
					requireRule(Number.isSafeInteger(cost) && cost >= 0 && run.money >= cost, '金币余额不足。');
					run.money -= cost;
				}
				if (run.node?.trade) {
					run.node.trade.stock.find(entry => entry.id === item.id)!.remaining -= count;
					run.node.trade.purchases += count;
				} else if (run.node?.kind === 'rest' && item.kind === 'candy' && item.remaining !== undefined) {
					run.node.restCandyPurchases ||= {};
					run.node.restCandyPurchases[item.id] = (run.node.restCandyPurchases[item.id] || 0) + count;
				}
				const converted: string[] = [];
				for (let n = 0; n < count; n++) {
					const received = convertSpiritItem(run, this.configured(), item.id, `purchase:${command.id}:${n}`, this.random);
					run.bag[received] = (run.bag[received] || 0) + 1;
					if (received !== item.id) converted.push(Dex.mod('gen9fantasy').items.get(received).name);
				}
				if (converted.length) run.notices = [`胡帕变出了：${[...new Set(converted)].join('、')}。`];
				if (item.price > 0) recordCollapseResource(account, run, 'inflation');
				break;
			}
			case 'feedmushroom': {
				feedMushroom(run, command.member || '', command.value || '', command.count ?? 1); break;
			}
			case 'sell': {
				recycleItems(run, this.configured(), command.value || '', command.count);
				break;
			}
			case 'use': {
				useInventoryItem(account, run, this.configured(), command);
				break;
			}
			case 'continue':
				requireRule(!run.mentorOffer, '请先收下一张首领卡。');
				requireRule(!run.node?.rewardScene || run.node.rewardScene.claimed, '请先挑选一份奖励。');
				requireRule(run.phase === 'rest' || run.phase === 'reward' ||
					run.phase === 'event' && run.node?.event?.stage === 'result', '请先完成本层。');
				if (run.node?.event) requireRule(run.team.some(mon => mon.hp > 0), '请先复活至少一名伙伴，再继续前进。');
				this.completeFloor(account, run);
				break;
			default: throw new Error('未知的肉鸽操作。');
			}
			if (shoppingTransaction) recordShoppingSpend(run, shopMoneyBefore - run.money);
			if (!run.battle?.growthBaseline) {
				for (const mon of run.team.filter(member => !member.egg)) recordStarterMoves(account, this.configured(), mon.set);
			}
			if (this.content?.blessings) syncBlessingParty(run);
			syncGrowthParty(run);
			syncExclusiveItems(run);
		};
		return this.store.change(userid, account => {
			updateAccount(account);
			if (account.run) this.presentAffectionReward(account.run);
			if (account.run) this.prepareFutureSight(account.run);
			if (account.run) { this.presentNarrative(account.run); this.checkFailure(account.run); }
		}, command);
	}
	private confirmStartingBuilds(account: RogueAccount) {
		if (!account.run?.startingBuilds) return;
		const run = account.run, sets = run.startingBuilds || [];
		delete run.startingBuilds;
		for (const set of sets) {
			recordStarterTraits(account, this.configured(), set, true);
			recordStarterMoves(account, this.configured(), set);
		}
		if (run.difficulty === 'easy') (run.notices ||= []).push(`获得【替身护符】：${CHARM_DESCRIPTION}`);
	}
	private finishDeparture(account: RogueAccount) {
		const run = account.run!;
		this.confirmStartingBuilds(account);
		if (run.story!.skip) {
			delete run.story; this.enterFloor(run);
		} else {
			run.story!.stage = 'portal'; run.story!.page = 0;
		}
	}
	battleState(userid: string): RogueBattleState {
		const account = this.store.get(userid);
		const run = this.run(account);
		requireRule(run.phase === 'battle' && run.battle, '当前没有待建立的战斗。');
		syncRunDifficulty(run);
		const encounter = run.node!.encounters[run.encounter];
		return {
			liveProgression: !!this.configured().progression && !run.postgame && run.preview?.stage !== 'running' && !run.node?.event?.memory,
			opponentCount: encounter.team.length,
			opponentSlots: encounter.team.map((_, i) => i).filter(i =>
				!run.caught.includes(`${run.battle!.encounterId}:foe:${i}`) &&
				!(encounter.team.length === 1 && run.caught.includes(run.battle!.encounterId))),
			difficulty: { tier: run.difficulty || 0, floor: run.floor, version: run.difficultyRulesVersion || 1 },
			nuzlocke: nuzlockeBattle(run),
			collapse: (run.difficultyRulesVersion || 1) >= 2 ? run.collapse?.slice() : undefined,
			cooperative: encounter.cooperative && { opponentOffset: Math.ceil(encounter.team.length / 2) },
			boss: encounter.boss && structuredClone(encounter.boss),
			wild: !encounter.trainer && run.node!.kind !== 'trainer' && encounter.boss?.kind !== 'summit',
			escortCount: encounter.escortCount,
			environment: run.environment || encounter.environment ? { ...run.environment, ...encounter.environment,
				name: encounter.environment?.name || run.environment?.name || '天气平稳' } : undefined,
			echo: run.echo && structuredClone(run.echo),
			mentorCard: run.node!.kind === 'boss' && run.mentorCard?.floor === run.floor ? run.mentorCard.kind : undefined,
			mentorTier: run.node!.kind === 'boss' ? mentorTier(run.floor) : undefined,
			fishingElite: run.node!.event?.id === 'fishing',
			eventBuff: !!run.battle.eventBuff,
			comebackCard: comebackActive(run) && run.comeback!.floor === run.floor,
			blessings: run.blessings && structuredClone({
				owned: run.blessings.owned, evolution: run.blessings.evolution, psychic: run.blessings.psychic,
				dragonKing: run.blessings.dragonKing,
				companions: structuredClone(run.blessings.companions),
				companionZ: run.blessings.companionZ,
				catAbilities: structuredClone(run.blessings.catAbilities),
			}),
			blessingDefeated: run.blessings?.defeated.slice(),
			blessingPsychicLosses: run.blessings?.psychicLosses?.slice(),
			...(run.spirit ? { spirit: { id: run.spirit, floor: run.floor, hazards: encounter.spiritHazards,
				money: run.spirit === 'gimmighoul' ? run.money : undefined } } : {}),
			opponentStars: encounter.stars && [...encounter.stars],
			encounterId: run.battle.encounterId, team: structuredClone(run.team.filter(mon => !mon.egg && !mon.nuzlockeDead &&
				(!run.node!.event?.activity?.solo || mon.id === run.node!.event.activity.solo))), boosts: { ...run.boosts }, bag: { ...run.bag },
			catchable: !run.node?.challenge && (encounter.catchable ||
				!!(run.blessings?.owned.some(entry => entry.family === 'rocketcatch') &&
					run.node!.kind !== 'boss' && !run.node!.regiBoss &&
					!['gym', 'elitefour', 'champion'].includes(encounter.trainer?.role || ''))),
			npcCapture: !run.node?.challenge && !!encounter.trainer &&
				!!run.blessings?.owned.some(entry => entry.family === 'rocketcatch'),
			systems: { player: { mega: !!run.megaUnlocked, gmega: !!run.gmegaUnlocked, z: !!run.zUnlocked } },
			forcedTera: encounter.forcedTera,
			tera: { player: !!run.teraUnlocked, opponent: !!encounter.forcedTera || encounter.boss?.kind === 'summit' || !!encounter.trainer?.tera ||
				(run.node!.kind === 'boss' && ELITE_BOSS_FLOORS.has(run.floor)) },
			progression: !run.postgame && !!this.configured().progression, allowReplacement: this.configured().allowReplacement,
			caughtSpecies: account.caughtSpecies?.length || 0, caughtSpeciesIds: [...(account.caughtSpecies || [])],
			captureEnvironment: { fishing: run.node!.event?.id === 'fishing', water: run.node!.event?.id === 'fishing' || ['biome02', 'biome09'].includes(run.node!.biome?.id || ''),
				dark: rogueTime(run.floor) === 'night' || ['biome04', 'biome12', 'biome14'].includes(run.node!.biome?.id || '') },
			balls: this.configured().items.filter(item => item.kind === 'ball' && (item.id !== 'masterball' || !encounter.trainer && encounter.catchable) &&
				(item.multiplier || item.id in (encounter.catchChances || {})))
				.map(item => ({
					id: item.id, name: item.name, chance: encounter.catchChances?.[item.id], multiplier: item.multiplier, rule: item.ballRule,
				})),
		};
	}
	private recordCatch(account: RogueAccount, run: RogueRun, captured: RoguePokemon) {
		requireRule(!run.node?.challenge, '这场训练挑战不开放捕捉。');
		const encounterId = run.battle?.encounterId;
		requireRule(encounterId && (captured.id === encounterId || run.node!.encounters[run.encounter].team.some((_, i) =>
			captured.id === `${encounterId}:foe:${i}`)), '捕捉对象与当前战斗不符。');
		if (run.caught.includes(captured.id)) return;
		if (run.nuzlocke) {
			const capture = nuzlockeBattle(run);
			// Single-opponent captures retain the legacy encounter ID; battle targets include a slot suffix.
			const target = captured.id === encounterId ? `${encounterId}:foe:0` : captured.id;
			requireRule(capture?.captureAllowed && capture.target === target, '本十层只能捕捉首次遇见的可捕捉对手。');
		}
		const rule = this.configured().unlocks[rogueSpeciesID(captured.set.species)];
		requireRule(rule, '缺少捕捉解锁配置。');
		run.caught.push(captured.id);
		if (toID(captured.set.pokeball) === 'masterball') run.bag.masterball = Math.max(0, (run.bag.masterball || 0) - 1);
		account.caughtSpecies ||= [];
		const species = rogueSpeciesID(captured.set.species);
		if (!account.caughtSpecies.includes(species)) account.caughtSpecies.push(species);
		if (run.node?.biome) {
			account.biomeCaptures ||= {};
			const catches = account.biomeCaptures[run.node.biome.id] ||= [];
			if (!catches.includes(species)) catches.push(species);
		}
		const count = account.captures[rule.starter] = (account.captures[rule.starter] || 0) + 1;
		if (count >= rule.captures && !account.unlocked.includes(rule.starter)) account.unlocked.push(rule.starter);
		recordStarterTraits(account, this.configured(), captured.set, true);
		recordShinyCapture(account, this.configured(), captured.set);
		recordStarterMoves(account, this.configured(), captured.set);
	}
	nuzlockeProgress(userid: string, token: string, progress: import('../../sim/rogue-nuzlocke').NuzlockeBattle) {
		this.store.change(userid, account => {
			const run = account.run;
			if (run?.phase === 'battle' && run.battle?.token === token && run.preview?.stage !== 'running') {
				recordNuzlockeProgress(run, progress);
			}
		});
	}
	capture(userid: string, token: string, captured: RoguePokemon, result?: RogueBattleResult) {
		this.store.change(userid, account => {
			const run = account.run;
			if (run?.phase !== 'battle' || run.battle?.token !== token || run.preview?.stage === 'running') return;
			this.recordCatch(account, run, captured);
			if (result?.encounterId === run.battle.encounterId && !run.node?.challenge) {
				run.battle.checkpoint = structuredClone(result);
			}
		});
	}
	/** A simulator-only checkpoint: the browser cannot submit experience or battle snapshots. */
	progressBattle(userid: string, token: string, sequence: number, result: RogueBattleResult) {
		return this.store.change(userid, account => {
			const run = account.run;
			if (run?.phase !== 'battle' || run.battle?.token !== token || run.battle.encounterId !== result.encounterId ||
				run.battle.retreatRequested || !this.configured().progression || run.postgame ||
				run.preview?.stage === 'running' || run.node?.event?.memory ||
				sequence <= (run.battle.growthSequence || 0) || sequence !== result.defeated?.length) return;
			if (run.node?.challenge && !run.battle.growthBaseline) {
				run.battle.growthBaseline = { team: structuredClone(run.team), receipts: [...(run.experienceReceipts || [])],
					pendingMoves: run.pendingMoves && structuredClone(run.pendingMoves) };
			}
			run.team = run.team.map(saved => structuredClone(result.team.find(mon => mon.id === saved.id) || saved));
			run.bag = { ...result.bag };
			nuzlockeResult(run, result);
			run.notices = [];
			awardBattleExperience(run, result);
			if (this.content?.blessings) syncBlessingParty(run);
			syncGrowthParty(run);
			run.battle.growthSequence = sequence;
			run.battle.growthPaused = !!run.pendingMoves?.length || run.team.some(mon => mon.hp > 0 && mon.evolutionNotice);
			run.battle.checkpoint = { ...structuredClone(result), team: structuredClone(run.team) };
			if (!run.battle.growthBaseline) {
				for (const mon of run.team.filter(member => !member.egg)) recordStarterMoves(account, this.configured(), mon.set);
			}
		});
	}
	settle(userid: string, token: string, result: RogueBattleResult,
		onGrowth?: (notices: import('../../sim/fantasy-rogue').RogueGrowthNotice[]) => void) {
		const notices: import('../../sim/fantasy-rogue').RogueGrowthNotice[] = [];
		const saved = this.store.change(userid, account => {
			const run = account.run;
			if (run?.phase !== 'battle' || run.battle?.token !== token || run.battle.encounterId !== result.encounterId) return;
			if (run.preview?.stage === 'running') {
				run.preview.stage = run.battle.retreatRequested ? 'personal' : 'result';
				if (!run.battle.retreatRequested) run.preview.result = structuredClone(result);
				delete run.battle;
				run.phase = 'ready';
				run.notices = ['【同行训练家 - ' + (run.preview.trainer === 'sada' ? '奥琳 AI' : '弗图 AI') + '】预演结束；尚未结算任何消耗或成长。'];
				return;
			}
			const retryRequested = run.battle.retryRequested;
			this.settleResult(account, run, result, notices);
			this.presentNarrative(run); this.checkFailure(run);
			if (retryRequested && account.run?.phase !== 'defeated' && run.recovery === 'retreat') {
				run.retryHealing = { key: randomUUID(), encounterId: result.encounterId };
				run.recovery = 'retreat';
				(run.notices ||= []).push('已退出本场战斗。请确认背包药品消耗，再重新挑战同一场对手。');
			}
		});
		// Emit only after the database transaction commits; failed/repeated settlements emit nothing.
		if (notices.length) onGrowth?.(notices);
		return saved;
	}
	private settleResult(account: RogueAccount, run: RogueRun, result: RogueBattleResult,
		notices?: import('../../sim/fantasy-rogue').RogueGrowthNotice[]) {
		nuzlockeResult(run, result);
		const token = run.battle!.token;
		const retreated = !!run.battle!.retreatRequested;
		const failedChallenge = !!run.node?.challenge && (retreated || !result.won);
		recordCollapseBattle(account, run, retreated ? { ...result, won: false } : result);
		// Memory encounters and postgame challenges bypass ordinary blessing payouts,
		// but an actual release still consumes the one campaign opportunity.
		if (!retreated && result.companionZUsed && run.blessings?.companionZ) run.blessings.companionZ.spent = true;
		if (run.postgame?.stage === 'battle' && !retreated) {
			this.finishGodChallenge(account, run, result.won ? 'won' : 'lost');
			return;
		}
		// Escape is not a win, including when a late win packet races the escape request.
		if (retreated && result.won) result = { ...result, won: false };
		const captures = result.captures || (result.captured ? [result.captured] : []);
		for (const captured of captures) this.recordCatch(account, run, captured);
		const memoryBattle = run.node?.event?.id === 'travel' && !!run.node.event.memory;
		if (failedChallenge && run.battle!.growthBaseline) {
			const baseline = run.battle!.growthBaseline;
			run.team = baseline.team;
			run.experienceReceipts = baseline.receipts;
			run.pendingMoves = baseline.pendingMoves;
			result = { ...result, team: result.team.filter(mon => baseline.team.some(old => old.id === mon.id)) };
			nuzlockeResult(run, result);
		}
		const previousTeam = run.team;
		if (run.node?.event?.activity) {
			run.node.event.activity.lastTurns = result.turns;
			run.node.event.activity.allySurvived = result.allySurvived;
		}
		const previousItems = new Map(run.team.map(mon => [mon.id, toID(mon.set.item)]));
		delete run.battle;
		// Preserve committed growth on retreat; failed trials restore their provisional growth baseline.
		run.team = retreated || failedChallenge ? result.team.map(mon => {
			const original = previousTeam.find(member => member.id === mon.id);
			const restored = original ? escapedMember(original, mon) : structuredClone(mon);
			if (failedChallenge && original) {
				// Stolen items and permanent progress cannot be banked by abandoning a trial.
				if (toID(restored.set.item) !== toID(original.set.item)) restored.set.item = '';
				restored.evolutionProgress = structuredClone(original.evolutionProgress);
			}
			return restored;
		}) : structuredClone(result.team);
		for (const mon of run.team) {
			const item = toID(mon.set.item);
			if (item && previousItems.get(mon.id) !== item) {
				mon.set.item = convertSpiritItem(run, this.configured(), item,
					`battle:${result.encounterId}:${mon.id}:${item}`, this.random);
			}
		}
		if (previousTeam.some(mon => mon.egg || mon.nuzlockeDead)) {
			const joined = run.team.filter(mon => !previousTeam.some(old => old.id === mon.id));
			run.team = [...previousTeam.map(old => run.team.find(mon => mon.id === old.id) ||
				(old.egg || old.nuzlockeDead ? old : undefined)).filter((mon): mon is RoguePokemon => !!mon), ...joined];
		}
		if (run.node?.event?.activity?.solo) run.team = previousTeam.map(old => run.team.find(p => p.id === old.id) || old);
		run.bag = failedChallenge ? Object.fromEntries(Object.entries(run.bag).map(([id, count]) =>
			[id, Math.min(count, result.bag[id] || 0)])) : { ...result.bag };
		migrateRetiredBalls(run);
		for (const mon of run.team) ensureMemberMemory(mon);
		run.notices = [];
		if (memoryBattle && !retreated) restoreTravelBattle(run, result);
		else if (!memoryBattle && !run.postgame) {
			if (this.configured().progression && !failedChallenge) battleFriendship(run, result, token, previousTeam);
			if (this.content?.blessings) settleBlessingBattle(account, run, this.configured(), result,
				this.random, retreated || failedChallenge);
		}
		for (const captured of captures) {
			if ([...run.team, ...(run.box || []), ...(run.pendingCaptures || [])].some(mon => mon.id === captured.id)) continue;
			requireRule(run.team.length < roguePartyLimit(run.spirit, run.blessings) || this.configured().allowReplacement, '队伍已满。');
			const mon = createRoguePokemon(
				{ ...captured.set, level: captured.set.level - (run.node!.encounters[run.encounter].blessingLevels || 0),
					happiness: captured.set.pokeball === 'friendball' ? 150 : ROGUE_INITIAL_FRIENDSHIP }, run.boosts, captured.id, captured.stars
			);
			mon.hp = Math.max(1, mon.maxhp - (captured.maxhp - captured.hp));
			mon.pp = structuredClone(captured.pp);
			mon.status = captured.status;
			mon.statusState = { ...captured.statusState };
			mon.statuses = captured.statuses && structuredClone(captured.statuses);
			if (this.configured().progression) initializeExperience(mon);
			if (mon.set.item) {
				mon.set.item = convertSpiritItem(run, this.configured(), toID(mon.set.item), `capture:${mon.id}`, this.random);
			}
			if (run.team.length < roguePartyLimit(run.spirit, run.blessings)) run.team.push(mon);
			else (run.pendingCaptures ||= []).push(mon);
		}
		if (this.content?.blessings) syncBlessingParty(run);
		syncGrowthParty(run);
		syncExclusiveItems(run);
		if (this.configured().progression && !memoryBattle && !run.postgame && !failedChallenge) {
			const growth = awardBattleExperience(run, result);
			notices?.push(...growth);
			for (const mon of run.team.filter(member => !member.egg)) recordStarterMoves(account, this.configured(), mon.set);
		}
		if (run.node?.challenge) {
			const challenge = run.node.challenge;
			challenge.outcome = retreated ? 'retreated' : result.won ? 'won' : 'lost';
			const record = challengeRecord(run);
			if (record) { record.outcome = challenge.outcome; record.turns = result.turns; }
			if (failedChallenge) {
				challenge.stage = 'paused'; run.phase = 'event';
				run.recovery = 'retreat';
				run.attempt++;
				run.notices = ['已退出战斗，仍停留在挑战区域。可调整队伍后重试，或选择逃离这一层；本次未获奖励，HP、PP 和道具消耗保留。'];
				run.lastReward = { floor: run.floor, name: run.node.name, money: 0, items: {}, points: 0 };
				if (!retreated) this.autoEmergency(run);
				return;
			}
		}
		if (retreated) {
			// Keep the saved enemy and story branch. Only the player's battle losses persist.
			if (memoryBattle) delete run.node!.event!.memory;
			run.recovery = 'retreat';
			run.phase = 'ready';
			run.attempt++;
			run.notices = ['已逃跑，HP、PP、异常状态和道具消耗已保留；本场叠层恢复至开战前，同行额外 Z 次数已返还。可使用道具、调整队伍后再次挑战本场。'];
			if (run.pendingCaptures?.length) {
				run.captureResume = 'ready';
				run.phase = 'settlement';
				this.finishSettlement(account, run);
			}
			return;
		}
		if (memoryBattle) {
			companionPickup(run, result.encounterId, this.random);
		deliverCompanionPickup(run);
			settleServiceBattle(run, result.won, retreated, !!captures.length);
			for (const mon of run.team.filter(member => !member.egg)) recordStarterMoves(account, this.configured(), mon.set);
			run.encounter++;
			run.phase = 'settlement'; this.finishSettlement(account, run);
			return;
		}
		companionPickup(run, result.encounterId, this.random);
		deliverCompanionPickup(run);
		const finishShop = () => {
			if (!run.node!.shopChallenge || run.node!.shopChallenge.closed) return false;
			const challenge = run.node!.shopChallenge;
			challenge.closed = true;
			if (result.won) for (const [item, count] of Object.entries(challenge.rewards)) {
				const received = convertSpiritItem(run, this.configured(), item, `shopchallenge:${run.floor}:${item}`, this.random);
				run.bag[received] = (run.bag[received] || 0) + count;
			}
			run.lastReward = { floor: run.floor, name: result.won ? '零元购 · 挑战成功' : '零元购 · 商店关闭',
				money: 0, items: result.won ? { ...challenge.rewards } : {}, points: 0 };
			run.node!.reward = { money: 0, items: {} };
			run.captureResume = 'shopclosed';
			run.phase = 'settlement';
			const emergencyRecovery = run.emergencyRecovery;
			this.checkFailure(run);
			if (run.failure) return true;
			this.finishSettlement(account, run);
			// Closing the shop can enter the next floor; keep the defeat receipt for the battle popup.
			if (emergencyRecovery) run.emergencyRecovery = emergencyRecovery;
			return true;
		};
		if (!result.won) {
			run.recovery = 'defeat';
			if (run.node?.event?.rematch) {
				settleRematch(account, run, false); run.phase = 'settlement';
				this.finishSettlement(account, run); return;
			}
			const companion = opposingCompanion(run, run.node!.encounters[run.encounter]?.trainer);
			if (companion && !run.node?.event?.police) {
				deferCompanionChallenge(run, companion); run.phase = 'settlement';
				this.finishSettlement(account, run); return;
			}
			if (run.node!.shopChallenge) {
				this.autoEmergency(run);
				if (finishShop()) return;
			}
			if (run.node!.event) {
				settleEventBattle(run, this.configured(), this.random, false, retreated, account);
				this.autoEmergency(run);
				run.phase = 'settlement'; this.finishSettlement(account, run);
				return;
			}
			run.recovery = 'defeat';
			const encounterLoss = run.node!.kind === 'trainer' ? Math.min(run.money, 500 + run.floor * 20) : 0;
			if (encounterLoss) { run.money -= encounterLoss; recordNegativeBlessingEvent(run, 'outcome'); }
			run.phase = run.node!.noHealing && !run.team.some(mon => mon.hp > 0) ? 'failed' : 'ready';
			if (run.pendingCaptures?.length) {
				run.captureResume = run.phase;
				run.phase = 'settlement';
				this.finishSettlement(account, run);
			}
			run.attempt++;
			run.notices = ['本场战斗未通过，队伍当前状态已保存。'];
			if (encounterLoss) run.notices.push(`这次遭遇损失了 ${encounterLoss} 金币。`);
			this.autoEmergency(run);
			return;
		}
		delete run.recovery;
		const baseLoot = run.node!.wildLoot?.[run.encounter];
		const psychicFraction = (result.defeated || []).filter(d => !d.captured && run.team.some(mon => mon.id === d.killer && permanentMemberTypes(mon).includes('Psychic'))).length / Math.max(1, result.defeated?.length || 0);
		const loot = baseLoot && blessingLoot(run, baseLoot, this.random, (result.defeated || []).filter(m => Dex.mod('gen9fantasy').species.get(m.species).types.includes('Rock')).length / Math.max(1, result.defeated?.length || 0), psychicFraction);
		if (loot && rivalActive(run)) for (const item of Object.keys(loot)) {
			if (this.random(100) < 10) loot[item]++;
		}
		if (loot) {
			const candyPayout = grantCandyTraining(run, { items: loot,
				candyTraining: run.node!.wildCandyTraining?.[run.encounter] });
			Object.assign(loot, candyPayout.items);
			replaceTreasureWithEmblem(run, loot, this.random);
			const before = { money: run.money, bag: { ...run.bag } };
			for (const [id, count] of Object.entries(loot)) run.bag[id] = (run.bag[id] || 0) + count;
			boostCompanionEventRewards(run, before);
			run.lastReward = { floor: run.floor, encounter: run.encounter + 1, name: run.node!.name,
				money: 0, items: Object.fromEntries(Object.keys(loot).map(id => [id, run.bag[id] - (before.bag[id] || 0)])),
				points: 0, effect: candyPayout.effect };
		}
		if (run.node!.challenge) run.node!.challenge.stage = 'won';
		if (finishShop()) return;
		if (run.node!.event?.rematch) settleRematch(account, run, true);
		else if (run.node!.event) settleEventBattle(run, this.configured(), this.random, true, false, account);
		else {
			const pages = bossVictoryPages(run);
			if (pages.length) {
				healNarrativeParty(run);
				if (this.content?.story) queueNarrative(run, pages, 'settlement');
			}
		}
		run.encounter++;
		run.phase = 'settlement';
		this.finishSettlement(account, run);
	}
	private presentNarrative(run: RogueRun) {
		if (run.comeback?.pending) return;
		if (!run.dialogue || run.story || run.phase === 'battle' || run.phase === 'defeated') return;
		run.story = { stage: 'interlude', page: 0, skip: false, canSkip: true }; run.phase = 'story';
	}
	/** Only close a genuinely stranded run. Dialogues and unresolved rewards retain their recovery opportunities. */
	private checkFailure(run: RogueRun) {
		syncNuzlocke(run);
		if (run.nuzlocke && !['battle', 'complete', 'defeated', 'postgame'].includes(run.phase) && !run.postgame &&
			![...run.team, ...(run.box || []), ...(run.pendingCaptures || []), ...(run.pendingCapture ? [run.pendingCapture] : [])]
				.some(mon => !mon.egg && !mon.nuzlockeDead && mon.hp > 0)) {
			run.failure = { key: randomUUID(), floor: run.floor, title: 'Nuzlocke 挑战结束',
				reason: '本局已没有可以出战的存活伙伴。已获得的解锁与局外成长点保留，新一局仍可选择这些物种。' };
			run.phase = 'defeated'; delete run.battle;
			return;
		}
		if (run.comeback?.pending) return;
		if (['battle', 'intro', 'story', 'complete', 'defeated', 'postgame', 'blessing'].includes(run.phase) ||
			run.postgame || !run.team.length || run.team.some(mon => mon.hp > 0) || run.dialogue) return;
		if ([...(run.box || []), ...(run.pendingCaptures || []), ...(run.pendingCapture ? [run.pendingCapture] : [])].some(mon => mon.hp > 0)) return;
		// A scripted continuous challenge still has its existing checkpoint retry.
		if (run.node?.noHealing && run.phase === 'failed') return;
		if (!healingLocked(run) && this.configured().items.some(item => item.kind === 'revive' && run.bag[item.id] > 0)) return;
		if (!healingLocked(run) && run.money >= emergencyCost(run.floor)) return;
		if (run.phase === 'choose' || run.phase === 'reward' || run.pendingMoves?.length || run.pendingCapture) return;
		if (run.node?.event?.stage === 'choice' || run.node?.event?.stage === 'fragments') return;
		if (run.phase === 'rest') {
			// Accessible shop sales can finance a revive or center treatment; do not discard that option.
			const saleValue = this.configured().items.reduce((sum, item) => sum + (run.bag[item.id] || 0) * (item.sellPrice || 0), 0);
			const availableMoney = run.money + saleValue;
			const care = centerCare(run);
			if (run.node?.kind === 'rest' && care.revives && availableMoney >= care.cost) return;
			if (shopStock(this.configured(), run).some(item => item.kind === 'revive' && item.remaining !== 0 && availableMoney >= item.price)) return;
		}
		run.failure = { key: randomUUID(), floor: run.floor, title: '爬塔已无法推进',
			reason: '全队伙伴都已倒下，没有可用的复活道具或其他恢复途径，金币也不足以支付急救费用。本局爬塔失败；已获得的解锁与局外成长点会保留。' };
		run.phase = 'defeated'; delete run.battle;
	}
	/** Future event handlers call these methods; the public command API cannot grant unlocks. */
	adjustEventFriendship(userid: string, member: string, amount: number) {
		return this.store.change(userid, account => {
			const run = this.run(account);
			const mon = run.team.find(entry => entry.id === member);
			requireRule(mon && canEditParty(run) && Number.isInteger(amount) && Math.abs(amount) <= 255,
				'当前不能调整亲密度。');
			changeFriendship(mon, amount, run);
			if (amount < 0) recordNegativeBlessingEvent(run, 'outcome');
		});
	}
	setEventIVs(userid: string, member: string, ivs: Partial<StatsTable>) {
		return this.store.change(userid, account => {
			this.normalizeAccount(account);
			const run = this.run(account);
			const mon = run.team.find(entry => entry.id === member);
			requireRule(mon && canEditParty(run), '当前不能调整个体值。');
			requireRule(ivs && Object.keys(ivs).length > 0 && Object.entries(ivs).every(([stat, value]) =>
				ROGUE_STATS.includes(stat as StatID) && Number.isInteger(value) && value >= 0 && value <= 31),
			'个体值必须为 0～31 的整数。');
			if (Object.entries(ivs).some(([stat, value]) => value < mon.set.ivs[stat as StatID])) {
				recordNegativeBlessingEvent(run, 'outcome');
			}
			Object.assign(mon.set.ivs, ivs);
			rebuildMember(mon, run.boosts);
			recordStarterTraits(account, this.configured(), mon.set, false);
		});
	}
	unlockTerastallization(userid: string) {
		return this.store.change(userid, account => {
			const run = this.run(account);
			requireRule(canEditParty(run), '当前不能解锁太晶化。');
			grantSystem(run, 'tera', '太晶化赠礼', false);
			if (run.blessings?.pending.length) { run.blessingRewardResume = run.phase; run.phase = 'blessing'; }
		});
	}
	unlockAbility(userid: string, member: string, ability: string) {
		return this.store.change(userid, account => {
			const run = this.run(account);
			const mon = run.team.find(entry => entry.id === member);
			const dex = Dex.mod('gen9fantasy');
			const entry = dex.abilities.get(ability);
			requireRule(mon && canEditParty(run) && entry.exists, '当前不能解锁该特性。');
			ensureMemberMemory(mon);
			if (!mon.abilityPool!.some(known => known.id === entry.id)) {
				mon.abilityPool!.push({ id: entry.id, hidden: toID(dex.species.get(mon.set.species).abilities.H) === entry.id });
			}
		});
	}
	unlockEVRespec(userid: string, member: string) {
		return this.store.change(userid, account => {
			const run = this.run(account);
			const mon = run.team.find(entry => entry.id === member);
			requireRule(mon && canEditParty(run), '当前不能调整努力值。');
			mon.evRespec = { total: ROGUE_STATS.reduce((sum, stat) => sum + mon.set.evs[stat], 0) };
		});
	}
	/** Resume the latest trusted simulator checkpoint, or the pre-battle save for older rooms. */
	recover(userid: string, token: string) {
		return this.store.change(userid, account => {
			const run = account.run;
			if (run?.phase === 'battle' && run.battle?.token === token) {
				if (run.preview?.stage === 'running') {
					run.preview.stage = 'personal';
					run.phase = 'ready';
					delete run.battle;
					run.notices = ['预演中断，未结算任何消耗或成长。请亲自挑战本场。'];
					return;
				}
				if (run.postgame?.stage === 'battle') {
					if (run.difficulty === 'easy') { this.finishGodChallenge(account, run, 'declined'); return; }
					Object.assign(run, inventory(run.postgame.before));
					run.node = structuredClone(run.postgame.node);
					run.encounter = run.postgame.encounter;
					run.postgame.stage = 'offer';
					run.phase = 'postgame';
					delete run.battle;
					return;
				}
				if (run.battle.checkpoint) {
					const checkpoint = structuredClone(run.battle.checkpoint);
					// Only a simulator-confirmed last capture can complete a disconnected battle.
					if (!checkpoint.won) run.battle.retreatRequested = true;
					this.settleResult(account, run, checkpoint);
					this.presentNarrative(run);
					this.checkFailure(run);
					return;
				}
				run.phase = 'ready';
				// A missing room has no battle result: restore its unused charge before retrying.
				if (run.battle.eventBuff) (run.eventBuff ||= { battles: 0 }).battles++;
				delete run.battle;
			}
		});
	}
}
