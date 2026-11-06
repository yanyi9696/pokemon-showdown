import { createHash, randomInt, randomUUID } from 'crypto';
import { battlePreview, battleSelectionKey, clearBattleSelections } from './coop-battle-selection';
import { isCoopMasterBallRoute, prepareCoopMasterBallRoutes, selectCoopMasterBallRoute,
	coopMasterBallView, chooseCoopMasterBall } from './coop-master-ball';
import { offerCoopChallenge, beginCoopChallenge, coopChallengeView, chooseCoopChallenge,
	failedCoopChallengeResult, settleCoopChallenge } from './coop-challenges';
import { companionInvitationView, chooseCompanionInvitation, travellingRoster } from './travellers';
import { Dex, toID } from '../../sim/dex';
import { ROGUE_STATS, type RogueBattleResult, type RoguePokemon } from '../../sim/fantasy-rogue';
import { validCoopCheckpoint, type RogueCoopCheckpoint } from '../../sim/rogue-coop-checkpoint';
import { ROGUE_INITIAL_FRIENDSHIP } from './friendship';
import { migrateDifficulty } from './difficulty';
import { removeEarlyGymItems } from './encounter-repair';
import { releasePartyMember, releaseView } from './release';
import { syncGrowthParty, growthOffers, buyGrowth } from './growth';
import { grantCandyTraining, type CandyReward } from './candy-rewards';
import { TRAINING_ITEM_KINDS, trainingItemTargets, useInventoryItem } from './inventory-use';
import { universalItem } from '../../sim/rogue-universal-data';
import { universalOptions } from './universal-evolution';
import { partyEvolutions } from './party-evolution';
import { confirmPartyEvolution } from './evolution-action';
import { fantasyConversionOptions } from './fantasy-conversion';
import { formItemOptions, useFormItem } from './form-items';
import { formItem } from './form-item-data';
import { roguePartyLimit } from '../../sim/fantasy-rogue-spirits';
import { syncExclusiveItems } from './exclusive-items';
import { prepareSpiritNode } from './spirits';
import { rogueAccess, rogueCoopAccess } from './access';
import { recordShinyCapture, recordStarterMoves, recordStarterTraits, starterMoves, starterTraits } from './starter-traits';
import { rogueStarterSlotCost } from '../../sim/rogue-species-identity';
import { rogueSpeciesID } from './species-eligibility';
import { createRoguePokemon, ensureMemberMemory, evolveMember, evolutionOptions, initializeExperience, rebuildMember, rememberMove } from './progression';
import { awardBattleExperience } from './battle-growth';
import { centerCare, prepareEconomy, ROGUE_LINKING_CORD_PRICE } from './economy';
import { emergencyCost } from './early-balance';
import { editParty, healingLocked, inventoryItem } from './team';
import { claimCoverage, coverageView } from './coverage';
import { applyRecoveryItem, RECOVERY_ITEM_KINDS, recoveryItemOptions, restoreMember } from './recovery-items';
import { shopStock } from './trading';
import { recordShoppingSpend } from './shopping-upgrade';
import { BUYBACK_FLOOR, recycleOffers, recycleItems } from './buyback';
import { collectorRoute, collectorOptions, settleCollector } from './coop-collector';
import { COOP_COLLECTION_EVENTS, coopCollectionOptions, settleCoopCollection } from './coop-collections';
import { COOP_ACTIVITY_EVENTS, COOP_ACTIVITY_BATTLES, beginCoopActivity, coopActivityOptions,
	settleCoopActivity, rollCoopActivityGift } from './coop-activities';
import { coopSafariTarget, settleCoopSafari } from './coop-safari';
import { coopScrollOptions, beginCoopScroll, coopScrollView, chooseCoopScroll,
	readyCoopScroll, settleCoopScroll } from './coop-scroll';
import { COOP_EXPEDITION_SERVICES, coopExpeditionOptions, settleCoopExpedition } from './coop-expedition-services';
import {
	COOP_EVOLUTION_EVENTS, coopEvolutionOptions, beginCoopEvolution, coopEvolutionView,
} from './coop-evolution-scenes';
import { COOP_RHYTHM_EVENTS, coopRhythmOptions, coopRhythmView, chooseCoopRhythm,
	chooseCoopRhythmPersonal, readyCoopRhythm } from './coop-rhythm';
import { COOP_ADVENTURE_EVENTS, coopAdventureOptions, chooseCoopAdventure } from './coop-adventures';
import { COOP_HONEYMOON_EVENTS, beginCoopHoneymoon, coopHoneymoonOptions, coopHoneymoonView,
	chooseCoopHoneymoon, settleCoopHoneymoon } from './coop-honeymoon';
import { COOP_GRENINJA_EVENTS, coopGreninjaOptions, chooseCoopGreninja } from './coop-greninja';
import {
	activeCoopEscort, coopBattleParty, coopEscortOptions, beginCoopEscort, saveCoopEscortResult,
} from './coop-escort';
import { beginExpedition } from './expedition-events';
import { hatchEggs } from './eggs';
import { coopPartyPokemon, coopMemberName, canReceiveEgg } from './coop-eggs';
import { affectionFloor, affectionView, affectionCommand } from './affection';
import { sharedAffectionScene } from './coop-affection';
import { auctionRoute, beginCoopAuction, coopAuctionOptions, coopAuctionView, settleCoopAuction } from './coop-auction';
import { chooseServiceOption, serviceEventView, settleServiceBattle, type ServiceView } from './event-services';
import { snapshotTravelBattle } from './event-travel';
import { sharedTravelStep, sharedTravelGift, prepareTravelGift, restoreCoopTravel } from './coop-travel';
import { chooseEvent, chooseEventOption, eventView, rollMushroomOutcome, rollRoomSleepOutcome, rollSharedRoomPrize,
	sharedFragmentOffer,
	mysteryBallAtFloor, rollMysteryBallOutcome, rollEventBattleSupplies, forestTeams, rollSharedForestOutcome, settleEventBattle,
	type EventID, type RogueEvent } from './events';
import { EVENT_NAMES } from './event-text';
import { isLuckEvent, LUCK_EVENT_NAMES } from './luck-event-data';
import { rollLuck } from './luck-events';
import { ownsBlessing } from '../../sim/rogue-blessing-data';
import { blessingCandidates, blessingView, beginBlessingFloor, completeBlessingFloor, handleBlessingCommand,
	normalizeBlessings, syncBlessingParty, prepareBlessingEncounter, settleBlessingBattle, blessingLoot, blessingRouteTemplates } from './blessings';
import { trackJourney } from './history';
import { chooseBlessingOption, createBlessingRound, refreshBlessingOption, rerollBlessingQuality,
	type BlessingRound } from './blessing-selection';
import type { RogueEngine } from './engine';
import type {
	RogueCoopDifficulty, RogueCoopInvite, RogueCoopMemberState, RogueCoopSession, RogueRun, RogueShopContext, RogueAccount,
	RogueStarterBuild, RogueNode, RogueCommand,
} from './types';

const COOP_TRADE_SHOPS = new Set(['mint', 'candy', 'machine', 'balls', 'crowns']);
const COOP_EVENTS = new Set<EventID>([
	'martial', 'tutor', 'mushrooms', 'room', 'mysteryball', 'forest', 'travel', 'fantasytutor', 'coverageworkshop',
	...COOP_COLLECTION_EVENTS,
	...COOP_RHYTHM_EVENTS,
	...COOP_ADVENTURE_EVENTS,
	...COOP_HONEYMOON_EVENTS,
	...COOP_GRENINJA_EVENTS,
	'lostescort', 'kubfuscroll',
	...COOP_ACTIVITY_EVENTS,
	...COOP_EXPEDITION_SERVICES,
	...COOP_EVOLUTION_EVENTS,
	...Object.keys(LUCK_EVENT_NAMES) as EventID[],
]);
type CoopEventOption = { id: string, name: string, text: string, disabled: boolean };
type CoopEventView = {
	paragraphs?: string[], options?: CoopEventOption[], picker?: { options: CoopEventOption[] },
	teams?: { species: string, level: number }[][], support?: number, replay?: string[],
	preview?: ServiceView['preview'], exchange?: RogueEvent['exchange'],
	auction?: ReturnType<typeof coopAuctionView>['auction'],
	silhouette?: string,
	activity?: ReturnType<typeof coopRhythmView>['activity'],
	fishing?: RogueEvent['fishing'] & { now: number, width: number },
	evAllocation?: { member: string, species: string, total: number, current: StatsTable, minimum: StatsTable },
};

export interface RogueCoopCommand {
	action: 'search' | 'invite' | 'accept' | 'decline' | 'cancel' | 'leave' | 'refresh' | 'selectstarters' |
		'selectarea' | 'selectbattle' | 'previewbattle' | 'preparebattle' | 'learn' | 'continuebattle' | 'retrybattle' | 'heal' | 'finishroute' | 'buy' |
		'proposetrade' | 'respondtrade' | 'canceltrade' | 'proposecapture' | 'respondcapture' | 'cancelcapture' |
		'cancelarea' | 'eventchoice' | 'cancelevent' | 'delegate' | 'blessingchoice' | 'blessingreward' | 'useitem' | 'emergency' |
		'recoverbattle' | 'resume' | 'proposeexit' | 'respondexit' | 'recoverroute' | 'release' | 'replace' | 'coverage' | 'setmove' |
		'use' | 'equip' | 'equipemblem' | 'evolve' | 'configureuniversal' | 'fantasize' | 'forme' | 'buygrowth' | 'sell' | 'affection' |
		'challenge' | 'companioninvite';
	target?: string;
	difficulty?: number;
	starters?: string[];
	members?: string[];
	value?: string;
	starterBuilds?: Record<string, RogueStarterBuild>;
	id?: string;
	member?: string;
	move?: string;
	partnerMember?: string;
	owner?: string;
	ball?: string;
	captureTarget?: string;
	accept?: boolean;
	count?: number;
	evs?: StatsTable;
	aura?: StatIDExceptHP;
	slot?: number;
	confirmed?: boolean;
	visit?: string;
	quote?: string;
	trainingMembers?: string[];
	trainingStats?: StatIDExceptHP[];
	mode?: 'choose' | 'refresh' | 'quality';
}

function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function battleReady(mon: RoguePokemon) { return !mon.egg && !mon.nuzlockeDead && mon.hp > 0; }
function secretRoute(node?: RogueNode) { return !!node && (node.kind === 'story' || !!node.mainlineScene); }

export class RogueCoopSessions {
	private readonly engine: RogueEngine;
	private readonly startBattle: (session: RogueCoopSession, token: string) => string;
	constructor(engine: RogueEngine, startBattle: (session: RogueCoopSession, token: string) => string) {
		this.engine = engine;
		this.startBattle = startBattle;
	}
	private authorize(user: User) {
		requireRule(user.connected && user.named && rogueAccess(user), '请先登录并确认当前账号可以进入幻想杯肉鸽。');
		requireRule(Config.fantasyailocal || user.registered, '双人联机需要使用已注册并登录的账号。');
		requireRule(rogueCoopAccess(user), '联机游玩暂未开放，请先体验单人冒险。');
	}
	private assertActionControl(user: User, session: RogueCoopSession | undefined, action: RogueCoopCommand['action']) {
		if (action === 'delegate' || action === 'leave' || action === 'resume') return;
		requireRule(!session?.delegatedTo || session.delegatedTo === user.id,
			'全部操作权已移交给队友；你可以随时撤销移交。');
	}
	private delegatedOwner(user: User, session: RogueCoopSession, requested?: string) {
		const owner = requested || user.id;
		if (session.delegatedTo) {
			requireRule(session.delegatedTo === user.id && [session.hostUser, session.guestUser].includes(owner),
				'只有操作权接收方可以替双方提交选择。');
		} else {
			requireRule(owner === user.id, '未移交操作权时只能提交自己的选择。');
		}
		return owner;
	}
	private setDelegation(user: User, value: string) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session && ['active', 'paused'].includes(session.status), '开始共同冒险后才能移交操作权。');
		requireRule(value === 'partner' || value === 'revoke', '请选择移交给队友或撤销移交。');
		const expectedRevision = session.revision;
		if (value === 'revoke') delete session.delegatedTo;
		else session.delegatedTo = session.hostUser === user.id ? session.guestUser : session.hostUser;
		if (session.adventure) {
			if (session.adventure.coopChallenge) session.adventure.coopChallenge.votes = {};
			if (session.adventure.captureProposal?.context === 'safari') delete session.adventure.captureProposal;
			if (session.adventure.phase === 'battle-selection') clearBattleSelections(session, undefined, true);
			delete session.adventure.coopAffection;
			if (isCoopMasterBallRoute(session.adventure.node)) {
				session.adventure.coopEventChoices = { [session.hostUser]: null, [session.guestUser]: null };
			}
			const eventId = session.adventure.node?.event?.id;
			if (eventId && (COOP_EXPEDITION_SERVICES.has(eventId) || COOP_ADVENTURE_EVENTS.has(eventId) ||
				COOP_HONEYMOON_EVENTS.has(eventId) ||
				COOP_GRENINJA_EVENTS.has(eventId) || eventId === 'lostescort' || eventId === 'kubfuscroll' ||
				COOP_ACTIVITY_EVENTS.has(eventId) || COOP_EVOLUTION_EVENTS.has(eventId) || COOP_RHYTHM_EVENTS.has(eventId))) {
				session.adventure.coopEventChoices = { [session.hostUser]: null, [session.guestUser]: null };
			}
		}
		if (!session.exitProposal?.confirmed) delete session.exitProposal;
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		if (session.roomid) Rooms.get(session.roomid)?.battle?.syncCoopControl();
		const partnerId = session.hostUser === user.id ? session.guestUser : session.hostUser;
		Users.get(partnerId)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
			session: session.id, delegation: true,
		})}`);
		return session;
	}
	delegatedController(sessionId: string) {
		const session = this.engine.store.coopSession(sessionId);
		return session?.status === 'active' ? session.delegatedTo : undefined;
	}
	private accountDifficulty(userid: string) {
		const account = this.engine.store.get(userid);
		migrateDifficulty(account);
		return account.difficulties!.highest;
	}
	private hasActiveBattle(user: User) {
		return [...user.games].some(id => {
			const battle = Rooms.get(id)?.battle;
			return !!battle && !battle.ended;
		});
	}
	private available(user: User) {
		this.authorize(user);
		requireRule(!this.hasActiveBattle(user), '玩家正在對战中，请结束后再邀请联机。');
		const inNpcCoop = [...user.games].some(id => Rooms.get(id)?.battle?.options.fantasyRogue?.cooperative);
		requireRule(!inNpcCoop, 'NPC 协战结束后才能开始双人联机。');
	}
	private blessingRun(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string): RogueRun {
		const member = adventure.members[userid];
		const account = this.engine.store.get(userid);
		const run = {
			id: `${adventure.id}:${userid}`, contentVersion: adventure.contentVersion, floor: adventure.floor,
			phase: 'blessing', difficulty: adventure.difficulty, doubleBattle: true, encounter: 0, attempt: 0,
			team: member.team, box: member.box, money: member.money, bag: member.bag, boosts: member.boosts,
			startingSlots: member.slots, node: adventure.node,
			checkpoint: { team: [], box: [], money: member.money, bag: {} }, caught: account.caughtSpecies || [],
			previousBlessings: account.previousBlessings, blessings: member.blessings, growth: member.growth,
			greninjaTraining: member.greninjaTraining,
			megaUnlocked: member.systems.mega, gmegaUnlocked: member.systems.gmega,
			zUnlocked: member.systems.z, teraUnlocked: member.systems.tera,
			notices: member.notices || [], pendingMoves: member.pendingMoves, coverageLessons: member.coverageLessons,
			shoppingSpend: member.shoppingSpend, exclusiveItems: member.exclusiveItems,
			trainerBonds: member.trainerBonds, affectionClaims: member.affectionClaims,
			socialCompanions: member.socialCompanions, companionInvitations: member.companionInvitations,
			rareCandyEvents: member.rareCandyEvents, activityClaims: member.activityClaims,
		} as RogueRun;
		normalizeBlessings(run);
		member.blessings = run.blessings;
		return run;
	}
	private previewBlessingRun(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string): RogueRun {
		const member = adventure.members[userid];
		return {
			id: `${adventure.id}:${userid}`, contentVersion: adventure.contentVersion, floor: adventure.floor,
			phase: 'blessing', difficulty: adventure.difficulty, doubleBattle: true, encounter: 0, attempt: 0,
			team: member.team, box: member.box, money: member.money, bag: member.bag, boosts: member.boosts,
			startingSlots: member.slots, node: adventure.node, checkpoint: { team: [], box: [], money: member.money, bag: {} },
			caught: [], blessings: member.blessings, growth: member.growth, coverageLessons: member.coverageLessons,
			greninjaTraining: member.greninjaTraining,
			notices: member.notices || [], pendingMoves: member.pendingMoves, shoppingSpend: member.shoppingSpend,
			exclusiveItems: member.exclusiveItems,
			trainerBonds: member.trainerBonds, affectionClaims: member.affectionClaims,
			socialCompanions: member.socialCompanions, companionInvitations: member.companionInvitations,
			rareCandyEvents: member.rareCandyEvents, activityClaims: member.activityClaims,
			megaUnlocked: member.systems.mega, gmegaUnlocked: member.systems.gmega,
			zUnlocked: member.systems.z, teraUnlocked: member.systems.tera,
		} as RogueRun;
	}
	private saveBlessingRun(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string, run: RogueRun) {
		const member = adventure.members[userid];
		member.team = run.team; member.box = run.box || [];
		member.money = run.money; member.bag = run.bag;
		member.blessings = run.blessings; member.growth = run.growth;
		member.notices = run.notices; member.pendingMoves = run.pendingMoves;
		member.coverageLessons = run.coverageLessons;
		member.shoppingSpend = run.shoppingSpend;
		member.exclusiveItems = run.exclusiveItems;
		member.trainerBonds = run.trainerBonds; member.affectionClaims = run.affectionClaims;
		member.socialCompanions = run.socialCompanions; member.companionInvitations = run.companionInvitations;
		member.rareCandyEvents = run.rareCandyEvents;
		member.activityClaims = run.activityClaims;
		member.systems = { tera: !!run.teraUnlocked, mega: !!run.megaUnlocked,
			gmega: !!run.gmegaUnlocked, z: !!run.zUnlocked };
	}
	private commonBlessingCandidates(adventure: NonNullable<RogueCoopSession['adventure']>, session: RogueCoopSession) {
		const members = [session.hostUser, session.guestUser].map(userid => {
			const run = this.blessingRun(adventure, userid);
			return new Map(blessingCandidates(run, this.engine.content!).map(candidate => [candidate.id, candidate]));
		});
		return [...members[0]].flatMap(([id, first]) => {
			const second = members[1].get(id);
			return second ? [{ ...first, appearanceWeight: Math.max(1, Math.round(
				((first.appearanceWeight || 100) + (second.appearanceWeight || 100)) / 2)) }] : [];
		});
	}
	/** Called only inside an agreed route/settlement transaction, once per owner. */
	private creditNodeReward(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string,
		reward: CandyReward & { money: number }) {
		const run = this.blessingRun(adventure, userid);
		const payout = grantCandyTraining(run, reward);
		run.money += reward.money;
		for (const [id, count] of Object.entries(payout.items)) run.bag[id] = (run.bag[id] || 0) + count;
		this.saveBlessingRun(adventure, userid, run);
		const receipt = { floor: adventure.floor, name: adventure.node!.name, money: reward.money,
			items: payout.items, effect: payout.effect, points: 0 };
		adventure.members[userid].coopLootReward = receipt;
		return receipt;
	}
	private prepareCoopBlessingRound(adventure: NonNullable<RogueCoopSession['adventure']>, session: RogueCoopSession,
		floor: 1 | 50 | 100 | 150, resume: 'opening' | 'advance') {
		const content = this.engine.content;
		requireRule(content?.blessings, '当前肉鸽配置未开放祝福系统。');
		const runs = [session.hostUser, session.guestUser].map(userid => this.blessingRun(adventure, userid));
		for (const run of runs) {
			if (resume === 'opening') run.blessings!.beforeAdventure = true;
			run.blessings!.round = undefined;
		}
		const states = runs.map(run => run.blessings!);
		const firstPrayer = states[0].prayer, secondPrayer = states[1].prayer;
		const sharedPrayer = firstPrayer?.floor === secondPrayer?.floor ? firstPrayer?.floor : undefined;
		const prayerChanged = !firstPrayer || !secondPrayer || !!firstPrayer.changed || !!secondPrayer.changed ||
			firstPrayer.floor !== secondPrayer.floor;
		const candidates = this.commonBlessingCandidates(adventure, session);
		let round: BlessingRound;
		try {
			round = createBlessingRound({ floor, prayerFloor: sharedPrayer,
				prayerPartyChanged: prayerChanged, killlaReady: runs.every(run =>
					!!run.blessings!.owned.find(entry => entry.family === 'godrobe') &&
					!!run.blessings!.owned.find(entry => entry.family === 'puregodrobe') && !run.blessings!.owned.find(entry => entry.family === 'killlagirl')) ?
					true : undefined }, candidates, max => randomInt(max));
		} catch {
			const eligible = candidates.filter(candidate => candidate.tier === 'silver');
			const pool = eligible.length ? eligible : candidates;
			requireRule(pool.length, '双方当前没有共同可选的祝福，无法生成相同的奖励选项。');
			const selected = [...pool];
			while (selected.length > 3) selected.splice(randomInt(selected.length), 1);
			const tier = selected[0].tier;
			round = { floor, tier, options: selected.map(candidate => ({ id: candidate.id, tier: candidate.tier,
				refreshes: 0, chosen: false })), remaining: 1, topClearMindEligible: false,
			familiesSeen: [], idsSeen: selected.map(candidate => candidate.id) };
		}
		adventure.coopBlessingRound = structuredClone(round);
		adventure.coopBlessingChoices = { [session.hostUser]: null, [session.guestUser]: null };
		adventure.coopBlessingResume = resume;
		for (const userid of [session.hostUser, session.guestUser]) {
			const run = this.blessingRun(adventure, userid);
			run.blessings!.round = structuredClone(round);
			this.saveBlessingRun(adventure, userid, run);
		}
		adventure.phase = 'blessing-selection';
	}
	private blessingFollowupsPending(adventure: NonNullable<RogueCoopSession['adventure']>) {
		return Object.values(adventure.members).some(member => member.blessings?.pending.length || member.blessings?.stage);
	}
	private advanceCoopAfterBlessings(session: RogueCoopSession, adventure: NonNullable<RogueCoopSession['adventure']>) {
		const resume = adventure.coopBlessingResume;
		if (resume === 'advance' && this.coopAffectionScene(session)) {
			adventure.phase = 'affection';
			return;
		}
		delete adventure.coopBlessingRound;
		delete adventure.coopBlessingChoices;
		delete adventure.coopBlessingResume;
		for (const userid of [session.hostUser, session.guestUser]) {
			const state = adventure.members[userid].blessings;
			if (!state) continue;
			delete state.beforeAdventure;
			delete state.afterFloor;
		}
		if (resume === 'opening') {
			adventure.phase = 'area-selection';
			return;
		}
		if (resume === 'battle') {
			adventure.phase = 'settlement';
			return;
		}
		if (resume === 'event') {
			adventure.phase = 'route-interaction';
			return;
		}
		if (adventure.floor >= 200) {
			adventure.phase = 'complete';
			session.status = 'complete';
			session.roomid = undefined;
			delete session.delegatedTo;
			return;
		}
		adventure.floor++;
		adventure.encounter = 0;
		adventure.node = undefined;
		delete adventure.coopChallenge;
		for (const userid of [session.hostUser, session.guestUser]) {
			const run = this.blessingRun(adventure, userid);
			if (![...run.team, ...(run.box || [])].some(mon => mon.egg && mon.egg.hatch <= run.floor)) continue;
			this.engine.store.change(userid, account => { hatchEggs(account, run, this.engine.content!); });
			this.saveBlessingRun(adventure, userid, run);
		}
		this.prepareRouteChoices(adventure);
		adventure.phase = 'area-selection';
		adventure.routeExitSelections = {};
		session.areaSelections = { [session.hostUser]: null, [session.guestUser]: null };
		clearBattleSelections(session);
		adventure.continueSelections = {};
		adventure.retrySelections = {};
		session.roomid = undefined;
	}
	private completeCoopFloor(session: RogueCoopSession, adventure: NonNullable<RogueCoopSession['adventure']>) {
		const content = this.engine.content;
		if (content?.blessings) {
			for (const owner of [session.hostUser, session.guestUser]) {
				const run = this.blessingRun(adventure, owner);
				this.engine.store.change(owner, account => {
					completeBlessingFloor(account, run, content, max => randomInt(max), true);
					affectionFloor(run, max => randomInt(max));
					syncExclusiveItems(run);
				});
				this.saveBlessingRun(adventure, owner, run);
			}
			if (this.blessingFollowupsPending(adventure)) {
				adventure.coopBlessingResume = 'advance';
				adventure.phase = 'blessing-reward';
				return;
			}
			if ([50, 100, 150].includes(adventure.floor)) {
				this.prepareCoopBlessingRound(adventure, session, adventure.floor as 50 | 100 | 150, 'advance');
				return;
			}
		}
		adventure.coopBlessingResume = 'advance';
		this.advanceCoopAfterBlessings(session, adventure);
	}
	private memberBlessingsSettled(adventure: NonNullable<RogueCoopSession['adventure']>) {
		return Object.values(adventure.members).every(member => !member.blessings?.pending.length && !member.blessings?.stage);
	}
	private applyCoopBlessingCommand(owner: string, adventure: NonNullable<RogueCoopSession['adventure']>, run: RogueRun,
		command: Omit<RogueCommand, 'id' | 'revision'>) {
		const account = this.engine.store.get(owner);
		const request: RogueCommand = { ...command, id: randomUUID(), revision: account.revision };
		this.engine.store.change(owner, savedAccount => handleBlessingCommand(savedAccount, run,
			this.engine.content!, request, max => randomInt(max)), request);
		this.saveBlessingRun(adventure, owner, run);
	}
	private memberShopContext(adventure: NonNullable<RogueCoopSession['adventure']>, member: RogueCoopMemberState): RogueShopContext {
		return {
			floor: adventure.floor, difficulty: adventure.difficulty, team: member.team, blessings: member.blessings,
			node: { ...structuredClone(adventure.node!), restCandyPurchases: { ...member.restCandyPurchases } },
		};
	}
	private routeAvailable(node: RogueNode, floor: number) {
		// Reject story content before the generic battle shortcut, including old/misclassified routes.
		if (secretRoute(node)) return false;
		if (node.encounters.length || node.kind === 'rest' || node.kind === 'reward') return true;
		if (node.kind === 'event') return floor >= 1;
		if (node.kind === 'trade' && node.trade?.kind === 'growth') return floor >= 51;
		if (node.kind === 'trade' && node.trade?.kind === 'buyback') return floor >= BUYBACK_FLOOR;
		if (collectorRoute(node)) return floor >= 1;
		if (auctionRoute(node)) return floor >= 31;
		return node.kind === 'trade' && !!node.trade && COOP_TRADE_SHOPS.has(node.trade.kind) &&
			node.trade.stock.some(item => item.remaining > 0);
	}
	private campRun(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string) {
		const run = this.previewBlessingRun(adventure, userid);
		run.phase = 'rest'; run.node = structuredClone(adventure.node);
		const visit = `${adventure.id}:${adventure.floor}:${adventure.node?.id}`;
		if (run.node?.trade) {
			run.node.trade.trainingClaimed = adventure.members[userid].campVisits?.includes(visit) || false;
			run.node.trade.purchases = run.node.trade.trainingClaimed ? 1 : 0;
		}
		return { run, visit };
	}
	private campView(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string) {
		if (adventure.phase !== 'route-interaction' || adventure.node?.kind !== 'trade' ||
			adventure.node.trade?.kind !== 'growth' || adventure.floor < 51) return null;
		const { run, visit } = this.campRun(adventure, userid);
		return { visit, money: run.money, offers: growthOffers(run), locked: this.partyEditLock(adventure, userid),
			members: run.team.filter(mon => !mon.egg && !mon.fusion).map(mon => ({ id: mon.id,
				set: { species: mon.set.species, level: mon.set.level }, campTraining: mon.campTraining })) };
	}
	private recoveryRun(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string): RogueRun {
		return { ...this.previewBlessingRun(adventure, userid), phase: 'ready', encounter: adventure.encounter,
			recovery: adventure.phase === 'settlement' && !adventure.battleResult?.won ? 'defeat' : undefined,
			pendingMoves: adventure.members[userid].pendingMoves };
	}
	private recycleView(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string) {
		const node = adventure.node, content = this.engine.content;
		const trade = node?.trade?.kind;
		const supported = node?.kind === 'rest' || node?.kind === 'trade' && trade &&
			(COOP_TRADE_SHOPS.has(trade) || trade === 'growth' && adventure.floor >= 51 ||
				trade === 'buyback' && adventure.floor >= BUYBACK_FLOOR || collectorRoute(node) &&
				adventure.coopEventBranchResolved && Object.values(adventure.members).every(member => member.coopEvent?.settled));
		if (!content || adventure.phase !== 'route-interaction' || !node || !supported || secretRoute(node)) return null;
		const run = this.previewBlessingRun(adventure, userid);
		const items = recycleOffers(run, content).filter(item => item.recyclePrice > 0).map(item => ({
			id: item.id, name: item.name, count: run.bag[item.id], price: item.recyclePrice,
		})).sort((a, b) => a.id.localeCompare(b.id));
		const quote = createHash('sha256').update(JSON.stringify([run.id, run.floor, node.id, node.kind,
			node.trade?.kind, items.map(item => [item.id, item.count, item.price])])).digest('hex');
		return { quote, fullPrice: node.trade?.kind === 'buyback', mushroomPremium: collectorRoute(node), money: run.money,
			items, locked: this.partyEditLock(adventure, userid) };
	}
	private releaseRun(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string): RogueRun {
		const run = this.recoveryRun(adventure, userid);
		if (adventure.members[userid].coopEvent && run.node) {
			run.node = { ...run.node, event: adventure.members[userid].coopEvent };
		}
		if (['battle', 'battle-starting', 'complete'].includes(adventure.phase)) run.phase = 'battle';
		return run;
	}
	private releaseMember(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure &&
			!['battle', 'battle-starting', 'complete'].includes(session.adventure.phase), '请在共同战斗之外放生或接纳伙伴。');
		const adventure = session.adventure, owner = this.delegatedOwner(user, session, command.owner);
		const member = adventure.members[owner], pending = member.pendingCaptures?.[0];
		requireRule(!adventure.tradeProposal, '请先完成或撤回交换请求。');
		const expectedRevision = session.revision;
		const run = this.releaseRun(adventure, owner);
		if (command.action === 'replace') {
			requireRule(pending && command.id === pending.id, '待接纳的伙伴已变化，请重新确认。');
			if (command.value === 'join') {
				requireRule(member.team.length < 6, '队伍已满，请先确认放生一位旧伙伴。');
				run.team.push(pending);
			} else if (command.value !== 'decline') {
				releasePartyMember(run, command.member || '', !!command.confirmed, pending);
			}
			member.pendingCaptures!.shift();
		} else {
			requireRule(!pending, '请先选择放生旧伙伴并接纳当前新伙伴。');
			releasePartyMember(run, command.member || '', !!command.confirmed);
		}
		syncBlessingParty(run); syncGrowthParty(run); syncExclusiveItems(run);
		this.saveBlessingRun(adventure, owner, run);
		clearBattleSelections(session, owner);
		for (const votes of [adventure.retrySelections, adventure.continueSelections, adventure.routeExitSelections]) {
			if (votes) delete votes[owner];
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser)?.send(
			`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, party: true })}`);
		return session;
	}
	private recoveryView(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string) {
		if (!['area-selection', 'battle-selection', 'route-interaction', 'settlement'].includes(adventure.phase)) return null;
		const run = this.recoveryRun(adventure, userid), content = this.engine.content!;
		const allFainted = !run.team.some(battleReady);
		const locked = healingLocked(run);
		const pendingLearning = !!run.pendingMoves?.length;
		const hasRevive = Object.entries(run.bag).some(([id, count]) => count > 0 && inventoryItem(content, id)?.kind === 'revive');
		const emergency = !locked && allFainted && !hasRevive && !run.pendingMoves?.length &&
			run.team.some(mon => !mon.egg && !mon.nuzlockeDead);
		return { locked, pendingLearning, allFainted, money: run.money, emergency, cost: emergencyCost(run.floor),
			items: locked || pendingLearning ? [] : recoveryItemOptions(run, content) };
	}
	private recoverMember(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure, '当前没有可恢复的共同冒险。');
		const adventure = session.adventure, owner = this.delegatedOwner(user, session, command.owner);
		const member = adventure.members[owner];
		requireRule(typeof command.id === 'string' && command.id.length >= 8 && command.id.length <= 80, '恢复请求标识无效。');
		if (member.recoveryReceipts?.includes(command.id)) return session;
		const quote = this.recoveryView(adventure, owner);
		requireRule(quote, '请在共同战斗之外使用恢复道具或急救。');
		requireRule(!quote.locked, '本层要求连续战斗，途中不能使用治疗和补给道具。');
		requireRule(!quote.pendingLearning, '请先处理这位玩家的待学招式，再进行场外恢复。');
		const run = this.recoveryRun(adventure, owner), expectedRevision = session.revision;
		let notice: string;
		if (command.action === 'emergency') {
			requireRule(quote.emergency, '仅在全队濒死、没有复活道具且允许场外治疗时可急救。');
			requireRule(member.money >= quote.cost, `急救需要 ${quote.cost} 金币，当前余额不足。`);
			const reserved = adventure.tradeProposal?.fromUser === owner ? adventure.tradeProposal.fee : 0;
			requireRule(member.money - quote.cost >= reserved, '请先处理或撤回交换请求，不能挪用已预留的交换费用。');
			member.money -= quote.cost;
			for (const mon of member.team) restoreMember(mon);
			notice = `已支付 ${quote.cost} 金币急救，恢复你的全队 HP、PP 和异常状态。`;
		} else {
			const item = inventoryItem(this.engine.content!, command.value || '');
			const mon = member.team.find(entry => entry.id === command.member);
			requireRule(item && RECOVERY_ITEM_KINDS.has(item.kind) && mon && member.bag[item.id] > 0,
				'恢复道具、库存或本人队伍目标无效。');
			requireRule(command.count === undefined || command.count === 1, '恢复道具每次使用一件。');
			requireRule(!adventure.tradeProposal || ![adventure.tradeProposal.fromMember, adventure.tradeProposal.toMember].includes(mon.id),
				'请先完成或撤回这位伙伴的交换请求。');
			applyRecoveryItem(run, mon, item, command.slot);
			member.bag[item.id]--;
			notice = `已使用 ${item.name} ×1，恢复所选伙伴，仅消耗该玩家的背包道具。`;
		}
		(member.notices ||= []).push(notice);
		(member.recoveryReceipts ||= []).push(command.id);
		if (member.recoveryReceipts.length > 256) member.recoveryReceipts.shift();
		if (adventure.phase === 'battle-selection') clearBattleSelections(session, owner);
		for (const votes of [adventure.retrySelections, adventure.continueSelections, adventure.routeExitSelections]) {
			if (votes) delete votes[owner];
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser)?.send(
			`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, recovery: true })}`);
		return session;
	}
	private eventRun(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string): RogueRun {
		const member = adventure.members[userid];
		const node = structuredClone(adventure.node!);
		node.event = structuredClone(member.coopEvent!);
		member.notices ||= [];
		member.pendingMoves ||= [];
		return {
			id: `${adventure.id}:${userid}`, contentVersion: adventure.contentVersion, floor: adventure.floor,
			phase: 'event', difficulty: adventure.difficulty, doubleBattle: true, encounter: adventure.encounter, attempt: 0,
			honeymoon: COOP_HONEYMOON_EVENTS.has(node.event.id) ?
				structuredClone(this.engine.store.get(userid).honeymoon) : undefined,
			greninjaTraining: member.greninjaTraining,
			megaUnlocked: member.systems.mega, gmegaUnlocked: member.systems.gmega,
			zUnlocked: member.systems.z, teraUnlocked: member.systems.tera,
			team: member.team, box: member.box, money: member.money, bag: member.bag, boosts: member.boosts,
			growth: member.growth, blessings: member.blessings, coverageLessons: member.coverageLessons,
			shoppingSpend: member.shoppingSpend, exclusiveItems: member.exclusiveItems, auction: adventure.coopAuction?.state,
			trainerBonds: member.trainerBonds, affectionClaims: member.affectionClaims,
			socialCompanions: member.socialCompanions, companionInvitations: member.companionInvitations,
			rareCandyEvents: member.rareCandyEvents, activityClaims: member.activityClaims,
			eventFragments: member.eventFragments, eventFragmentRuleVersion: adventure.eventFragmentRuleVersion ?? 2,
			startingSlots: member.slots, node, checkpoint: { team: [], box: [], money: member.money, bag: {} },
			caught: [], notices: member.notices, pendingMoves: member.pendingMoves, lastReward: member.coopEventReward,
		} as RogueRun;
	}
	private partyEditLock(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string) {
		if (!['area-selection', 'battle-selection', 'route-interaction', 'settlement'].includes(adventure.phase)) return null;
		const member = adventure.members[userid];
		return adventure.tradeProposal ? '请先完成或撤回交换请求。' :
			member.pendingCaptures?.length ? '请先安置待接纳的新伙伴。' :
			member.pendingMoves?.length ? '请先处理待学招式。' : '';
	}
	private moveTrainingView(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string) {
		const locked = this.partyEditLock(adventure, userid);
		if (locked === null) return null;
		const member = adventure.members[userid];
		const run = this.recoveryRun(adventure, userid);
		const coverage = locked ? { remaining: member.coverageLessons?.remaining || 0, members: [] } : coverageView(run);
		return { remaining: coverage.remaining, locked,
			maxMoves: member.blessings?.owned.some(entry => entry.family === 'learnall') ? 5 : 4,
			members: locked ? [] : member.team.filter(mon => !mon.egg).map(original => {
				const mon = structuredClone(original);
				ensureMemberMemory(mon);
				return { member: mon.id, species: mon.set.species, moves: mon.set.moves.map(toID),
					memory: [...new Set([...mon.moveMemory!.map(move => move.id), ...(mon.blessingMoves || [])])],
					coverage: coverage.members.find(entry => entry.member === mon.id)?.moves || [] };
			}),
		};
	}
	private trainMemberMoves(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure, '请在共同冒险中调整队伍。');
		const adventure = session.adventure, owner = this.delegatedOwner(user, session, command.owner);
		const view = this.moveTrainingView(adventure, owner);
		requireRule(view && !view.locked, view?.locked || '请在共同战斗之外调整队伍。');
		const expectedRevision = session.revision, member = adventure.members[owner];
		const run = this.recoveryRun(adventure, owner);
		run.notices = member.notices || [];
		const accountUpdates = new Map<string, (account: RogueAccount) => void>();
		if (command.action === 'coverage') {
			claimCoverage(this.engine.store.get(owner), run, this.engine.content!, command.member, command.value);
			const mon = run.team.find(entry => entry.id === command.member)!;
			accountUpdates.set(owner, account => recordStarterMoves(account, this.engine.content!,
				{ ...mon.set, moves: [command.value!] }, run));
		} else {
			// Equipment needs the same unlocked-system context as single-player party edits.
			Object.assign(run, { megaUnlocked: member.systems.mega, gmegaUnlocked: member.systems.gmega,
				zUnlocked: member.systems.z, teraUnlocked: member.systems.tera });
			editParty(run, { action: command.action, member: command.member, slot: command.slot,
				value: command.value, evs: command.evs, aura: command.aura } as RogueCommand, this.engine.content!);
			syncBlessingParty(run); syncGrowthParty(run); syncExclusiveItems(run);
		}
		member.team = run.team;
		member.coverageLessons = run.coverageLessons;
		member.notices = run.notices;
		member.bag = run.bag;
		member.blessings = run.blessings;
		member.growth = run.growth;
		if (adventure.phase === 'battle-selection') clearBattleSelections(session, owner);
		for (const votes of [adventure.retrySelections, adventure.continueSelections, adventure.routeExitSelections]) {
			if (votes) delete votes[owner];
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision, accountUpdates);
		Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser)?.send(
			`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, moves: true })}`);
		return session;
	}
	private inventoryView(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string) {
		const locked = this.partyEditLock(adventure, userid);
		if (locked === null) return null;
		const run = this.recoveryRun(adventure, userid), content = this.engine.content!;
		const suppliesLocked = locked || (healingLocked(run) ? '本层要求连续战斗，途中不能使用补给。' : '');
		const event = adventure.members[userid].coopEvent || run.node?.event;
		const formLocked = suppliesLocked || (!event?.settled && (event?.activity?.member || event?.activity?.solo) ?
			'请先完成当前伙伴的事件互动。' : '');
		const supplies = [];
		const equipment: { id: string, name: string, kind: string, count: number }[] = [];
		for (const [id, count] of Object.entries(run.bag)) {
			if (!(count > 0)) continue;
			const item = inventoryItem(content, id);
			if (!item) continue;
			const data = { id, name: item.name, kind: item.kind, count };
			if (['held', 'emblem'].includes(item.kind)) equipment.push(data);
			if (TRAINING_ITEM_KINDS.has(item.kind)) supplies.push({ ...data,
				targets: suppliesLocked ? [] : trainingItemTargets(run, content, item) });
		}
		return { locked, suppliesLocked, supplies, equipment, fantasyShards: run.blessings?.shards || 0,
			members: locked ? [] : run.team.filter(mon => !mon.egg).map(mon => ({
				member: mon.id, species: mon.set.species, item: toID(mon.set.item), emblem: mon.emblem || '',
				emblemSlot: mon.emblemSlot ?? 1,
				shiny: !!mon.set.shiny, gender: mon.set.gender,
				universalOptions: universalOptions(run, mon),
				fantasyOptions: content.blessings ? fantasyConversionOptions(mon) : [],
				fantasyReady: !!content.blessings && mon.hp > 0 && !suppliesLocked && (run.blessings?.shards || 0) >= 100,
				formOptions: formItemOptions(run, mon).map(option => {
					const reason = formLocked || (mon.hp <= 0 || mon.nuzlockeDead ? '请先复活伙伴。' :
						option.id === 'separate' && run.team.length >= roguePartyLimit(undefined, run.blessings) ?
							'队伍已满，请先按本局队伍上限留出位置，再解除合体。' : '');
					return { ...option, ready: !reason, reason, itemName: inventoryItem(content, option.item)?.name || option.item,
						consumed: !!formItem(option.item)?.consumed,
						donorSpecies: option.donor ? run.team.find(entry => entry.id === option.donor)?.set.species : undefined,
						returningSpecies: option.id === 'separate' ? mon.formFusion?.donor.set.species : undefined };
				}),
				evolutions: content.progression ? partyEvolutions(mon, run).map(option => ({ ...option,
					ready: option.ready && mon.hp > 0 && !mon.nuzlockeDead && !suppliesLocked })) : [],
				equipment: equipment.filter(item => !universalItem(item.id) || mon.universalEvolution?.item === item.id)
					.map(item => item.id),
			})),
		};
	}
	private useMemberSupply(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure, '当前没有可使用补给的共同冒险。');
		const adventure = session.adventure, owner = this.delegatedOwner(user, session, command.owner);
		const member = adventure.members[owner];
		requireRule(typeof command.id === 'string' && command.id.length >= 8 && command.id.length <= 80, '补给或形态调整请求标识无效。');
		const requestid = command.id;
		if (member.supplyReceipts?.includes(requestid)) return session;
		const view = this.inventoryView(adventure, owner);
		requireRule(view && !view.suppliesLocked, view?.suppliesLocked || '请在共同战斗之外使用补给。');
		if (command.action === 'forme') {
			const mon = view.members.find(entry => entry.member === command.member);
			const option = mon?.formOptions.find(entry => entry.id ===
				command.value?.replace(/:kyuremoriginal$/, ':kyuremoriginalfantasy'));
			requireRule(option?.ready, option?.reason || '当前没有该形态变化的本人道具或伙伴条件。');
		} else if (command.action === 'fantasize') {
			const mon = view.members.find(entry => entry.member === command.member);
			requireRule(mon?.fantasyReady && mon.fantasyOptions.some(option => option.species === command.value),
				'需要本人存活伙伴、100 幻想碎片及对应幻想分支，请刷新后重选。');
		} else if (command.action === 'evolve') {
			const mon = view.members.find(entry => entry.member === command.member);
			requireRule(mon?.evolutions.some(option => option.ready && toID(option.species) === command.value),
				'没有满足条件的进化，请刷新队伍后重选。');
		} else {
			const item = view.supplies.find(entry => entry.id === command.value);
			requireRule(item?.targets.some(target => target.member === command.member), '该补给、库存或本人队伍目标不可用。');
		}
		const expectedRevision = session.revision;
		const run = this.blessingRun(adventure, owner);
		Object.assign(run, { phase: 'ready', encounter: adventure.encounter,
			recovery: adventure.phase === 'settlement' && !adventure.battleResult?.won ? 'defeat' : undefined });
		if (command.action === 'forme' && member.coopEvent && run.node) {
			run.node = { ...run.node, event: member.coopEvent };
		}
		(member.supplyReceipts ||= []).push(requestid);
		if (member.supplyReceipts.length > 256) member.supplyReceipts.shift();
		if (adventure.phase === 'battle-selection') clearBattleSelections(session, owner);
		for (const votes of [adventure.retrySelections, adventure.continueSelections, adventure.routeExitSelections]) {
			if (votes) delete votes[owner];
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision, new Map([[owner, account => {
			if (command.action === 'evolve') confirmPartyEvolution(run, this.engine.content!, command.member, command.value);
			else if (command.action === 'forme') useFormItem(run, command.member!, command.value!);
			else if (command.action === 'fantasize') handleBlessingCommand(account, run, this.engine.content!,
				{ id: requestid, revision: account.revision, action: 'fantasize', member: command.member,
					value: command.value, confirmed: command.confirmed }, randomInt);
			else useInventoryItem(account, run, this.engine.content!, command);
			for (const mon of run.team.filter(entry => !entry.egg)) recordStarterMoves(account, this.engine.content!, mon.set, run);
			syncBlessingParty(run); syncGrowthParty(run); syncExclusiveItems(run);
			this.saveBlessingRun(adventure, owner, run);
		}]]));
		Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser)?.send(
			`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, supply: true })}`);
		return session;
	}
	private sharedEventOptions(adventure: NonNullable<RogueCoopSession['adventure']>, hostUser: string, guestUser: string) {
		const event = adventure.node?.event;
		if (auctionRoute(adventure.node)) {
			return adventure.coopAuction ? coopAuctionOptions([hostUser, guestUser].map(userid =>
				({ userid, run: this.eventRun(adventure, userid) })), adventure.coopAuction) : [];
		}
		if (collectorRoute(adventure.node)) {
			return collectorOptions([hostUser, guestUser].map(userid => ({ userid, run: this.eventRun(adventure, userid) })));
		}
		if (!event || !COOP_EVENTS.has(event.id)) return [];
		if (event.id === 'kubfuscroll') {
			return coopScrollOptions([hostUser, guestUser].map(userid => ({ userid, run: this.eventRun(adventure, userid) })));
		}
		if (event.id === 'lostescort') {
			return coopEscortOptions([hostUser, guestUser].map(userid => ({ userid, run: this.eventRun(adventure, userid) })));
		}
		if (COOP_COLLECTION_EVENTS.has(event.id)) {
			return coopCollectionOptions([hostUser, guestUser].map(userid => ({ userid, run: this.eventRun(adventure, userid) })));
		}
		if (COOP_ACTIVITY_EVENTS.has(event.id)) {
			return coopActivityOptions([hostUser, guestUser].map(userid => this.eventRun(adventure, userid)));
		}
		if (COOP_EXPEDITION_SERVICES.has(event.id)) {
			return coopExpeditionOptions([hostUser, guestUser].map(userid => ({ userid, run: this.eventRun(adventure, userid) })));
		}
		if (COOP_EVOLUTION_EVENTS.has(event.id)) {
			return coopEvolutionOptions([hostUser, guestUser].map(userid => this.eventRun(adventure, userid)));
		}
		if (COOP_RHYTHM_EVENTS.has(event.id)) {
			return coopRhythmOptions([hostUser, guestUser].map(userid => this.eventRun(adventure, userid)));
		}
		if (COOP_ADVENTURE_EVENTS.has(event.id)) {
			return coopAdventureOptions([hostUser, guestUser].map(userid => this.eventRun(adventure, userid)));
		}
		if (COOP_HONEYMOON_EVENTS.has(event.id)) {
			return coopHoneymoonOptions([hostUser, guestUser].map(userid => ({ userid, run: this.eventRun(adventure, userid) })));
		}
		if (COOP_GRENINJA_EVENTS.has(event.id)) {
			return coopGreninjaOptions([hostUser, guestUser].map(userid => this.eventRun(adventure, userid)));
		}
		const allowed = event.id === 'martial' ? ['skill', 'power', 'leave'] :
			event.id === 'tutor' ? ['ask', 'fantasy', 'leave'] : undefined;
		const views = [hostUser, guestUser].map(userid => eventView(this.eventRun(adventure, userid)) as CoopEventView | undefined);
		const ids = allowed || views[0]?.options?.map(option => option.id) || [];
		return ids.map(id => views.map(view => view?.options?.find(option => option.id === id))
			.filter((option): option is NonNullable<typeof option> => !!option))
			.filter(options => options.length === 2)
			.map(options => ({ ...options[0], disabled: options[0].id === 'fantasy' ?
				options.every(option => option.disabled) : options.some(option => option.disabled) }));
	}
	private prepareRouteChoices(adventure: NonNullable<RogueCoopSession['adventure']>, beginFloor = true) {
		const result = this.engine.prepareCoopRoutes(adventure.floor, adventure.difficulty,
			adventure.routeHistory, adventure.biomeHistory, Object.values(adventure.members).flatMap(member => member.team));
		let choices = result.choices;
		if (this.engine.content?.blessings) {
			for (const userid of beginFloor ? Object.keys(adventure.members) : []) {
				const run = this.blessingRun(adventure, userid);
				beginBlessingFloor(run, max => randomInt(max));
				this.saveBlessingRun(adventure, userid, run);
			}
			choices = blessingRouteTemplates(this.blessingRun(adventure, Object.keys(adventure.members)[0]), choices);
		}
		adventure.routeChoices = choices.filter(node => !secretRoute(node));
		if (this.engine.content?.events) offerCoopChallenge(adventure, Object.keys(adventure.members).map(userid =>
			({ userid, run: this.blessingRun(adventure, userid) })), max => randomInt(max));
		if (this.engine.content?.events) prepareCoopMasterBallRoutes(adventure, max => randomInt(max));
		adventure.routeHistory = result.routeHistory;
		adventure.biomeHistory = result.biomeHistory;
	}
	private visiblePlayers(user: User, query = '') {
		const needle = toID(query);
		const players = [];
		for (const target of Users.users.values()) {
			if (target.id === user.id || !target.connected || !target.named || target.id.startsWith('guest') ||
				(needle && !target.id.includes(needle) && !toID(target.name).includes(needle)) ||
				!rogueAccess(target) || this.hasActiveBattle(target) || this.engine.store.coopSessionForUser(target.id)) continue;
			players.push({ userid: target.id, name: target.name, maxDifficulty: this.accountDifficulty(target.id) });
		}
		players.sort((a, b) => toID(a.name).localeCompare(toID(b.name)));
		return players.slice(0, 50);
	}
	view(user: User, search = '') {
		this.authorize(user);
		this.migrateUnityChoices(user);
		const session = this.engine.store.coopSessionForUser(user.id);
		const account = this.engine.store.get(user.id);
		const content = this.engine.content;
		const starters = content ? content.starters.map(starter => {
			const species = Dex.mod('gen9fantasy').species.get(starter.set.species);
			return {
				id: starter.id, species: starter.set.species, level: starter.set.level, types: species.types,
				gen: species.gen, gender: species.gender,
				abilities: Object.entries(species.abilities).map(([slot, name]) => ({ id: toID(name), name, hidden: slot === 'H' })),
				slotCost: rogueStarterSlotCost(starter.set.species),
				available: starter.availableInitially || account.unlocked.includes(starter.id),
				traits: starterTraits(account, starter.id), defaultMoves: starter.set.moves.map(toID),
				moves: starterMoves(account, content, starter.id),
			};
		}) : [];
		return {
			userid: user.id,
			maxDifficulty: this.accountDifficulty(user.id),
			starterSlots: account.slots,
			natures: Dex.natures.all().map(nature => ({
				id: nature.id, name: nature.name, plus: nature.plus, minus: nature.minus,
			})),
			starters,
			players: session ? [] : this.visiblePlayers(user, search),
			invitations: this.engine.store.coopInvitations(user.id),
			session: session ? {
				id: session.id, hostUser: session.hostUser, guestUser: session.guestUser,
				hostName: session.hostName, guestName: session.guestName, difficulty: session.difficulty,
				status: session.status, revision: session.revision, updatedAt: session.updatedAt, roomid: session.roomid,
				battleRecovery: this.battleRecoveryView(session),
				storyRecovery: this.storyRecoveryView(session),
				exitProposal: session.exitProposal && (session.exitProposal.confirmed || session.exitProposal.expiresAt > Date.now()) ?
					{ id: session.exitProposal.id, kind: session.exitProposal.kind,
						proposer: session.exitProposal.proposer, confirmed: session.exitProposal.confirmed } : undefined,
				role: session.hostUser === user.id ? 'host' : 'guest',
				partnerUserId: session.hostUser === user.id ? session.guestUser : session.hostUser,
				partnerOnline: !!Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser)?.connected,
				delegatedTo: session.delegatedTo || null,
				delegatedToName: session.delegatedTo === session.hostUser ? session.hostName :
				session.delegatedTo === session.guestUser ? session.guestName : null,
				canControl: !session.delegatedTo || session.delegatedTo === user.id,
				starterSelection: session.starterSelections[user.id] || [],
				starterBuildSelection: session.starterBuildSelections?.[user.id] || {},
				partnerStarterSelection: session.starterSelections[
					session.hostUser === user.id ? session.guestUser : session.hostUser
				] || [],
				partnerStarterBuildSelection: session.starterBuildSelections?.[
					session.hostUser === user.id ? session.guestUser : session.hostUser
				] || {},
				adventure: session.adventure ? (() => {
					const adventure = session.adventure;
					const partnerId = session.hostUser === user.id ? session.guestUser : session.hostUser;
					const ownMember = adventure.members[user.id];
					const routeChoices = adventure.routeChoices || content?.floors[adventure.floor] || [];
					const phase = adventure.phase === 'battle-selection' && !adventure.node ? 'area-selection' : adventure.phase;
					const eventRoute = adventure.node?.kind === 'event' || collectorRoute(adventure.node) ||
						auctionRoute(adventure.node);
					const masterBallEvent = isCoopMasterBallRoute(adventure.node) ? coopMasterBallView(session, user.id) : undefined;
					const coopEvent = !secretRoute(adventure.node) && eventRoute && ownMember?.coopEvent ? (() => {
						const eventRun = this.eventRun(adventure, user.id);
						const privateView = (auctionRoute(adventure.node) && adventure.coopAuction ?
							coopAuctionView([session.hostUser, session.guestUser].map(userid =>
								({ userid, run: this.eventRun(adventure, userid) })), adventure.coopAuction) :
							ownMember.coopEvent.id === 'kubfuscroll' ? coopScrollView(eventRun) :
							COOP_RHYTHM_EVENTS.has(ownMember.coopEvent.id) ? coopRhythmView(eventRun) :
							COOP_HONEYMOON_EVENTS.has(ownMember.coopEvent.id) ? coopHoneymoonView(eventRun) :
							COOP_EVOLUTION_EVENTS.has(ownMember.coopEvent.id) ? coopEvolutionView(eventRun) :
							eventView(eventRun)) as CoopEventView | undefined;
						return {
							id: ownMember.coopEvent.id, key: ownMember.coopEvent.key, title: adventure.node!.name,
							partnerKey: session.delegatedTo === user.id ? adventure.members[partnerId].coopEvent?.key : undefined,
							stage: ownMember.coopEvent.stage, teams: privateView?.teams,
							support: privateView?.support, replay: privateView?.replay,
							auction: privateView?.auction,
							silhouette: privateView?.silhouette,
							activity: privateView?.activity,
							safari: ownMember.coopEvent.id === 'safaripark' ? this.safariTarget(session) : undefined,
							scrollPartners: ownMember.coopEvent.id === 'kubfuscroll' ? [session.hostUser, session.guestUser].map(userid => {
								const a = adventure.members[userid].coopEvent?.activity;
								return { owner: userid, name: userid === session.hostUser ? session.hostName : session.guestName,
									species: adventure.members[userid].team.find(mon => mon.id === a?.member)?.set.species,
									choice: a?.choice };
							}) : undefined,
							fishing: privateView?.fishing,
							sharedRhythm: COOP_RHYTHM_EVENTS.has(ownMember.coopEvent.id) && !adventure.coopEventBranchResolved,
							partnerActivity: session.delegatedTo === user.id && adventure.coopEventBranchResolved &&
								COOP_RHYTHM_EVENTS.has(ownMember.coopEvent.id) ?
								coopRhythmView(this.eventRun(adventure, partnerId)).activity : undefined,
							preview: privateView?.preview, exchange: privateView?.exchange,
							partnerPreview: session.delegatedTo === user.id ? (eventView(
								this.eventRun(adventure, partnerId)) as CoopEventView | undefined)?.preview : undefined,
							partnerExchange: session.delegatedTo === user.id ? adventure.members[partnerId].coopEvent?.exchange : undefined,
							paragraphs: privateView?.paragraphs || ownMember.coopEvent.result || [],
							branchResolved: !!adventure.coopEventBranchResolved,
							branchOptions: adventure.coopEventBranchResolved ? [] :
							this.sharedEventOptions(adventure, session.hostUser, session.guestUser),
							options: adventure.coopEventBranchResolved ? privateView?.options || [] : [],
							picker: adventure.coopEventBranchResolved ? privateView?.picker : undefined,
							evAllocation: adventure.coopEventBranchResolved ? privateView?.evAllocation : undefined,
							partnerOptions: adventure.coopEventBranchResolved ? (ownMember.coopEvent.id === 'kubfuscroll' ?
								coopScrollView(this.eventRun(adventure, partnerId))?.options || [] :
								COOP_RHYTHM_EVENTS.has(ownMember.coopEvent.id) ?
									coopRhythmView(this.eventRun(adventure, partnerId)).options :
									COOP_EVOLUTION_EVENTS.has(ownMember.coopEvent.id) ?
										coopEvolutionView(this.eventRun(adventure, partnerId))?.options || [] : (eventView(
											this.eventRun(adventure, partnerId)) as CoopEventView | undefined)?.options || []) : [],
							partnerPicker: adventure.coopEventBranchResolved ? (eventView(
								this.eventRun(adventure, partnerId)) as CoopEventView | undefined)?.picker : undefined,
							partnerEvAllocation: adventure.coopEventBranchResolved ? (eventView(
								this.eventRun(adventure, partnerId)) as CoopEventView | undefined)?.evAllocation : undefined,
							ownChoice: adventure.coopEventChoices?.[user.id] || null,
							partnerChoice: adventure.coopEventChoices?.[partnerId] || null,
							ownComplete: !!ownMember.coopEvent.settled,
							partnerComplete: !!adventure.members[partnerId]?.coopEvent?.settled,
						};
					})() : null;
					const blessingHostView = blessingView(this.previewBlessingRun(adventure, session.hostUser));
					const ownBlessingView = blessingView(this.previewBlessingRun(adventure, user.id),
						!!account.discoveries?.blessings?.length);
					const partnerBlessingView = session.delegatedTo === user.id ? blessingView(
						this.previewBlessingRun(adventure, partnerId), !!this.engine.store.get(partnerId).discoveries?.blessings?.length) : undefined;
					const coopBlessing = adventure.coopBlessingRound || adventure.phase === 'blessing-reward' ? {
						floor: adventure.coopBlessingRound?.floor ?? adventure.floor,
						round: blessingHostView?.round || adventure.coopBlessingRound || null,
						qualityLocked: !!blessingHostView?.qualityLocked,
						qualityRerolled: !!adventure.members[session.hostUser]?.blessings?.qualityRerolled ||
							!!adventure.members[session.guestUser]?.blessings?.qualityRerolled,
						ownChoice: adventure.coopBlessingChoices?.[user.id] ?? null,
						partnerChoice: adventure.coopBlessingChoices?.[partnerId] ?? null,
						ownPending: ownBlessingView?.pending || [], ownStage: ownBlessingView?.stage || null,
						partnerPending: partnerBlessingView?.pending || [], partnerStage: partnerBlessingView?.stage || null,
						ownComplete: !ownMember?.blessings?.pending.length && !ownMember?.blessings?.stage,
						partnerComplete: !adventure.members[partnerId]?.blessings?.pending.length && !adventure.members[partnerId]?.blessings?.stage,
					} : null;
					const memberView = (userid: string) => (adventure.members[userid]?.team || []).map(mon => ({
						...coopPartyPokemon(mon, adventure.floor),
						release: { ...releaseView(this.releaseRun(adventure, userid), mon),
							...(adventure.tradeProposal ? { reason: '请先处理交换请求。' } : {}) },
						replacementRelease: releaseView(this.releaseRun(adventure, userid), mon,
							adventure.members[userid].pendingCaptures?.[0] ||
							adventure.members[userid].blessings?.pending.find(reward => reward.kind === 'gift')?.pokemon),
					}));
					return {
						id: adventure.id, floor: adventure.floor, encounter: adventure.encounter ?? 0, phase,
						difficulty: adventure.difficulty, doubleBattle: adventure.doubleBattle,
						routeChoices: routeChoices.filter(node => !secretRoute(node)).map(node => ({
							id: node.id, name: node.name, kind: node.kind,
							biome: node.biome?.name || '', available: this.routeAvailable(node, adventure.floor) })),
						selectedRoute: adventure.node ? { id: adventure.node.id,
							name: adventure.node.name, kind: adventure.node.kind } : null,
						coopEvent: masterBallEvent || coopEvent, coopBlessing,
						coopChallenge: coopChallengeView(adventure, [session.hostUser, session.guestUser].map(userid =>
							({ userid, run: this.previewBlessingRun(adventure, userid) })), user.id),
						companionInvitation: companionInvitationView(this.previewBlessingRun(adventure, user.id)),
						partnerCompanionInvitation: companionInvitationView(this.previewBlessingRun(adventure, partnerId)),
						travellingRoster: travellingRoster(this.previewBlessingRun(adventure, user.id)),
						partnerTravellingRoster: travellingRoster(this.previewBlessingRun(adventure, partnerId)),
						coopAffection: (() => {
							const scene = this.coopAffectionScene(session);
							if (!scene) return null;
							const votes = adventure.coopAffection?.visit === scene.visit ? adventure.coopAffection.choices : {};
							return { ...scene, ownChoice: votes[user.id] || null, partnerChoice: votes[partnerId] || null };
						})(),
						trainerBonds: affectionView(this.previewBlessingRun(adventure, user.id)),
						partnerTrainerBonds: affectionView(this.previewBlessingRun(adventure, partnerId)),
						pendingCapture: ownMember.pendingCaptures?.[0] || null,
						partnerPendingCapture: adventure.members[partnerId].pendingCaptures?.[0] || null,
						battleResult: adventure.battleResult || null,
						lastReward: eventRoute ? ownMember.coopEventReward || null :
						adventure.lastReward ? (ownMember.coopLootReward?.floor === adventure.lastReward.floor ?
							ownMember.coopLootReward : adventure.lastReward) : null,
						centerCare: adventure.node?.kind === 'rest' ? centerCare({
							team: adventure.members[user.id]?.team || [], floor: adventure.floor, spirit: undefined,
						}) : null,
						partnerCenterCare: adventure.node?.kind === 'rest' ? centerCare({
							team: adventure.members[partnerId]?.team || [], floor: adventure.floor, spirit: undefined,
						}) : null,
						routeExitSelection: !!adventure.routeExitSelections?.[user.id],
						partnerRouteExitSelection: !!adventure.routeExitSelections?.[partnerId],
						tradeProposal: adventure.tradeProposal ? (() => {
							const proposal = adventure.tradeProposal;
							const fromMember = adventure.members[proposal.fromUser];
							const toMember = adventure.members[proposal.fromUser === session.hostUser ? session.guestUser : session.hostUser];
							const offered = fromMember?.team.find(mon => mon.id === proposal.fromMember);
							const requested = toMember?.team.find(mon => mon.id === proposal.toMember);
							return {
								id: proposal.id, fromUser: proposal.fromUser,
								toUser: proposal.fromUser === session.hostUser ? session.guestUser : session.hostUser,
								fromName: proposal.fromUser === session.hostUser ? session.hostName : session.guestName,
								toName: proposal.fromUser === session.hostUser ? session.guestName : session.hostName,
								offeredPokemon: coopMemberName(offered), requestedPokemon: coopMemberName(requested),
								fee: proposal.fee, isProposer: proposal.fromUser === user.id,
								canControlBoth: session.delegatedTo === user.id,
							};
						})() : null,
						captureProposal: adventure.captureProposal && adventure.captureProposal.expiresAt > Date.now() ? (() => {
							const proposal = adventure.captureProposal;
							const name = (userid: string) => userid === session.hostUser ? session.hostName : session.guestName;
							const ballName = proposal.context === 'safari' ? '狩猎用球' :
								content?.items.find(item => item.id === proposal.ball)?.name || proposal.ball;
							return {
								context: proposal.context,
								id: proposal.id, state: proposal.state, ownerUser: proposal.ownerUser, recipientUser: proposal.recipientUser,
								ownerName: name(proposal.ownerUser), recipientName: name(proposal.recipientUser),
								ball: proposal.ball, ballName, targetName: proposal.targetName, isOwner: proposal.ownerUser === user.id,
								isRecipient: proposal.recipientUser === user.id,
								canControlBoth: session.delegatedTo === user.id,
								handoffBalls: proposal.state === 'contested' && (proposal.ownerUser === user.id || session.delegatedTo === user.id) ?
									this.captureBallOptions(adventure, proposal.recipientUser) : [],
							};
						})() : null,
						pendingMove: (adventure.members[user.id]?.pendingMoves || []).length ? (() => {
							const pending = adventure.members[user.id].pendingMoves![0];
							const mon = adventure.members[user.id].team.find(entry => entry.id === pending.member);
							return mon ? { member: mon.id, species: mon.set.species, move: pending.move,
								moveName: Dex.mod('gen9fantasy').moves.get(pending.move).name,
								moves: mon.set.moves.map(move => ({ id: toID(move), name: Dex.mod('gen9fantasy').moves.get(move).name })) } : null;
						})() : null,
						partnerPendingMove: (adventure.members[partnerId]?.pendingMoves || []).length ? (() => {
							const pending = adventure.members[partnerId].pendingMoves![0];
							const mon = adventure.members[partnerId].team.find(entry => entry.id === pending.member);
							return mon ? { member: mon.id, species: mon.set.species, move: pending.move,
								moveName: Dex.mod('gen9fantasy').moves.get(pending.move).name,
								moves: mon.set.moves.map(move => ({ id: toID(move), name: Dex.mod('gen9fantasy').moves.get(move).name })) } : null;
						})() : null,
						notices: adventure.members[user.id]?.notices || [],
						continueSelection: !!adventure.continueSelections?.[user.id],
						partnerContinueSelection: !!adventure.continueSelections?.[partnerId],
						retrySelection: !!adventure.retrySelections?.[user.id],
						partnerRetrySelection: !!adventure.retrySelections?.[partnerId],
						escort: activeCoopEscort(adventure) ? {
							owner: activeCoopEscort(adventure)!.owner,
							name: activeCoopEscort(adventure)!.owner === session.hostUser ? session.hostName : session.guestName,
						} : undefined,
						scrollTrial: adventure.node?.event?.id === 'kubfuscroll' && adventure.node.event.stage === 'battle',
						canRetryBattle: coopBattleParty(adventure, user.id).some(battleReady),
						canRetryTogether: [session.hostUser, session.guestUser].every(userid =>
							coopBattleParty(adventure, userid).some(battleReady)),
						recovery: this.recoveryView(adventure, user.id),
						partnerRecovery: session.delegatedTo === user.id ? this.recoveryView(adventure, partnerId) : undefined,
						moveTraining: this.moveTrainingView(adventure, user.id),
						partnerMoveTraining: session.delegatedTo === user.id ? this.moveTrainingView(adventure, partnerId) : undefined,
						inventory: this.inventoryView(adventure, user.id),
						partnerInventory: session.delegatedTo === user.id ? this.inventoryView(adventure, partnerId) : undefined,
						areaSelection: session.areaSelections?.[user.id] || null,
						partnerAreaSelection: session.areaSelections?.[partnerId] || null,
						team: memberView(user.id), partnerTeam: memberView(partnerId),
						battleSelection: session.battleSelections[user.id] || [],
						partnerBattleSelection: session.battleSelections[partnerId] || [],
						battlePreview: battlePreview(session, user.id), partnerBattlePreview: battlePreview(session, partnerId),
						battleSelectionKey: battleSelectionKey(session),
						nativePreviewEnabled: true,
						nativeTeamPreview: !!adventure.nativeTeamPreview && !adventure.nativeTeamSelected,
						previewConfirmed: !!adventure.nativeTeamPreview && !adventure.nativeTeamSelected &&
							!!adventure.battleCheckpoint?.state.sides[user.id === session.hostUser ? 0 : 2]?.choice?.rogueTeamPreview?.length,
						partnerPreviewConfirmed: !!adventure.nativeTeamPreview && !adventure.nativeTeamSelected &&
							!!adventure.battleCheckpoint?.state.sides[user.id === session.hostUser ? 2 : 0]?.choice?.rogueTeamPreview?.length,
						money: session.adventure.members[user.id]?.money || 0,
						...(session.delegatedTo === user.id ? { partnerMoney: session.adventure.members[partnerId]?.money || 0 } : {}),
						bag: { ...(session.adventure.members[user.id]?.bag || {}) },
						tradePrice: ROGUE_LINKING_CORD_PRICE,
						trainingCamp: this.campView(adventure, user.id),
						partnerTrainingCamp: session.delegatedTo === user.id ? this.campView(adventure, partnerId) : null,
						recycling: this.recycleView(adventure, user.id),
						partnerRecycling: session.delegatedTo === user.id ? this.recycleView(adventure, partnerId) : null,
						shopItems: content && ['rest', 'trade'].includes(adventure.node?.kind || '') ?
							shopStock(content, this.memberShopContext(adventure, ownMember)).map(item => ({
								id: item.id, name: item.name, kind: item.kind, price: item.price,
								remaining: item.remaining ?? null, description: item.description || '',
							})) : [],
						partnerShopItems: content && session.delegatedTo === user.id &&
							['rest', 'trade'].includes(adventure.node?.kind || '') ?
							shopStock(content, this.memberShopContext(adventure, adventure.members[partnerId])).map(item => ({
								id: item.id, name: item.name, kind: item.kind, price: item.price,
								remaining: item.remaining ?? null, description: item.description || '',
							})) : [],
					};
				})() : null,
			} : null,
		};
	}
	private buildMemberState(
		userid: string, ids: string[], builds: Record<string, RogueStarterBuild>
	): RogueCoopMemberState {
		const account = this.engine.store.get(userid);
		const content = this.engine.content!;
		const dex = Dex.mod('gen9fantasy');
		const natures = Dex.natures.all();
		const team = ids.map(id => {
			const starter = content.starters.find(entry => entry.id === id)!;
			const traits = starterTraits(account, id);
			const build = builds[id] || {
				shiny: false, nature: 'random', gender: 'random', ability: 'random',
				ivs: traits.ivs.max, moves: starter.set.moves.map(toID),
			};
			const species = dex.species.get(starter.set.species);
			const normalAbilities = [...new Set([species.abilities[0], species.abilities[1]].filter(Boolean))];
			const nature = build.nature === 'random' ? natures[randomInt(natures.length)].name :
				Dex.natures.get(build.nature).name;
			const ability = build.ability === 'random' ? normalAbilities[randomInt(normalAbilities.length)]! :
				dex.abilities.get(build.ability).name;
			const gender = build.gender === 'random' ? (species.gender ||
				(randomInt(256) < species.genderRatio.F * 256 ? 'F' : 'M')) : build.gender || species.gender || 'N';
			const set = { ...structuredClone(starter.set), shiny: !!build.shiny,
				ivs: { ...build.ivs }, happiness: ROGUE_INITIAL_FRIENDSHIP,
				ability, nature, gender, moves: (build.moves || starter.set.moves).map(toID) };
			const mon = createRoguePokemon(set, account.boosts);
			mon.initialPartner = true;
			const availableMoves = starterMoves(account, content, id);
			mon.moveMemory = availableMoves.map(moveid => {
				const move = dex.moves.get(moveid);
				return { id: move.id, pp: move.pp, maxpp: move.pp };
			});
			mon.seenMoves = availableMoves.map(toID);
			if (content.progression) initializeExperience(mon);
			return mon;
		});
		const echo = account.echo?.unlocked ? account.echo.upgrades : undefined;
		return {
			team, box: [], money: content.initialMoney, bag: { ...content.initialBag },
			boosts: { ...account.boosts }, slots: account.slots,
			systems: { tera: !!echo?.systems.includes('tera'), mega: !!echo?.systems.includes('mega'),
				gmega: !!echo?.systems.includes('gmega'), z: !!echo?.systems.includes('z') },
			journey: { startedAt: Date.now(), blessings: [], participants: {} },
		};
	}
	private selectBattle(
		user: User, ids: string[], targetUser?: string, preview = false, visit?: string, nativePreview = false,
	) {
		const session = this.engine.store.coopSessionForUser(user.id);
		if (preview && session?.status === 'active' && session.adventure?.phase === 'battle' &&
			session.adventure.nativeTeamPreview && !session.adventure.nativeTeamSelected) {
			return this.previewNativeTeam(user, session, ids, targetUser, visit);
		}
		requireRule(session?.status === 'active' && session.adventure?.phase === 'battle-selection', '当前还没有可选出战伙伴的共同冒险。');
		requireRule(session.adventure.node?.kind !== 'story' && !session.adventure.node?.mainlineScene,
			'联机冒险不进入秘闻主线区域，已拒绝启动这场对战。');
		const owner = this.delegatedOwner(user, session, targetUser);
		const party = coopBattleParty(session.adventure, owner);
		requireRule((!preview && !nativePreview && visit === undefined) || visit === battleSelectionKey(session),
			'出战选择页面已更新，请刷新后重新选择。');
		requireRule(nativePreview || Array.isArray(ids) && ids.length >= (preview ? 0 : 1) && ids.length <= 3 &&
		ids.every(id => typeof id === 'string') &&
		new Set(ids).size === ids.length && ids.every(id => party.some(mon => mon.id === id && battleReady(mon))),
		'请从自己的健康队伍中选择 1～3 只不同的宝可梦。');
		const expectedRevision = session.revision;
		if (nativePreview) {
			requireRule(session.adventure.node && !session.adventure.tradeProposal, '请先完成当前互动，再进入战前准备。');
			for (const userid of [session.hostUser, session.guestUser]) {
				const candidates = coopBattleParty(session.adventure, userid).filter(battleReady).map(mon => mon.id);
				requireRule(candidates.length > 0, '双方都需要至少一只健康伙伴才能进入战前准备。');
				(session.battlePreviews ||= {})[userid] = battlePreview(session, userid)
					.filter(id => candidates.includes(id)).slice(0, 3);
				session.battleSelections[userid] = candidates;
			}
			session.adventure.nativeTeamPreview = true; delete session.adventure.nativeTeamSelected;
			session.battleSelectionVersion = (session.battleSelectionVersion || 0) + 1;
		} else {
			(session.battlePreviews ||= {})[owner] = [...ids];
			session.battleSelections[owner] = preview ? [] : [...ids];
			delete session.adventure.nativeTeamPreview; delete session.adventure.nativeTeamSelected;
		}
		let token: string | undefined;
		if (!preview && session.adventure.node && session.battleSelections[session.hostUser]?.length &&
			session.battleSelections[session.guestUser]?.length) {
			requireRule([session.hostUser, session.guestUser].every(userid =>
				session.battleSelections[userid].every(id =>
					coopBattleParty(session.adventure!, userid).some(mon => mon.id === id && battleReady(mon)))),
			'双方出战队伍已变化，请重新确认健康的伙伴。');
			removeEarlyGymItems(session.adventure.node, session.adventure.floor);
			token = randomUUID();
			session.adventure.phase = 'battle-starting';
			session.adventure.battleToken = token;
			session.adventure.battleLease = token;
			delete session.adventure.battleCheckpoint;
			delete session.adventure.battleRecoverySelections;
			session.adventure.encounterId = `coop-${session.id}-${session.adventure.floor}-${toID(session.adventure.node.id)}-${session.adventure.encounter}`;
			for (const userid of [session.hostUser, session.guestUser]) {
				session.adventure.members[userid].notices = [];
				if (session.adventure.node.event?.id === 'travel') {
					const run = this.eventRun(session.adventure, userid);
					snapshotTravelBattle(run);
					this.applyCoopEventRun(session.adventure, userid, run);
				}
			}
			delete session.adventure.battleResult;
			session.roomid = undefined;
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		if (token) {
			let roomid = '';
			try {
				roomid = this.startBattle(session, token);
				this.markBattleRoom(session.hostUser, session.id, token, roomid);
			} catch (error) {
				try {
					if (roomid) Rooms.get(roomid)?.destroy();
				} finally {
					this.resetBattleStart(session.hostUser, session.id, token);
				}
				throw error;
			}
		}
		const other = Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser);
		other?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
			session: session.id, battleSelection: true, battleStarted: !!token,
		})}`);
		const updated = this.engine.store.coopSessionForUser(user.id);
		requireRule(updated?.id === session.id, '联机进度已更新，请刷新后重试。');
		return updated;
	}
	private previewNativeTeam(user: User, session: RogueCoopSession, ids: string[], targetUser?: string, visit?: string) {
		const owner = this.delegatedOwner(user, session, targetUser);
		const room = session.roomid ? Rooms.get(session.roomid) : undefined;
		const player = room?.battle?.playerTable[owner];
		const request = player?.request.request && JSON.parse(player.request.request);
		requireRule(visit === battleSelectionKey(session) && request?.rogueCoopTeamPreview &&
			request.teamPreview && player?.request.isWait === false, '战前选队状态已变化；已确认时请先撤销确认。');
		requireRule(Array.isArray(ids) && ids.length <= 3 && new Set(ids).size === ids.length &&
			ids.every(id => typeof id === 'string' && session.battleSelections[owner].includes(id)),
		'请从自己的候选队伍中选择最多 3 只宝可梦。');
		const revision = session.revision;
		(session.battlePreviews ||= {})[owner] = [...ids];
		session.revision++; session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, revision);
		Users.get(owner === session.hostUser ? session.guestUser : session.hostUser)?.send(
			`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, battleSelection: true })}`);
		return session;
	}
	private markBattleRoom(hostUser: string, sessionId: string, token: string, roomid: string) {
		const session = this.engine.store.coopSessionForUser(hostUser);
		requireRule(session?.id === sessionId && session.adventure?.battleToken === token &&
			['battle-starting', 'battle', 'settlement'].includes(session.adventure.phase), '共同战斗已取消，无法保存房间。');
		const expectedRevision = session.revision;
		if (!session.adventure.nativeTeamPreview || session.adventure.nativeTeamSelected) {
			this.trackCoopJourneyBattlers(session);
		}
		session.roomid = roomid;
		if (session.adventure.phase === 'battle-starting') session.adventure.phase = 'battle';
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		for (const userid of [session.hostUser, session.guestUser]) {
			Users.get(userid)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
				session: session.id, battleStarted: true,
			})}`);
		}
	}
	private resetBattleStart(hostUser: string, sessionId: string, token: string) {
		const session = this.engine.store.coopSessionForUser(hostUser);
		if (session?.id !== sessionId || session.adventure?.battleToken !== token ||
			session.adventure.phase !== 'battle-starting') return;
		const expectedRevision = session.revision;
		if (session.adventure.battleCheckpoint) {
			session.adventure.phase = 'battle';
			session.adventure.battleRecoverySelections = {};
			session.adventure.battleLease = randomUUID();
		} else {
			session.adventure.phase = 'battle-selection';
			clearBattleSelections(session, undefined, true);
			delete session.adventure.battleToken;
			delete session.adventure.battleLease;
			delete session.adventure.encounterId;
		}
		session.roomid = undefined;
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
	}
	private growthRun(adventure: NonNullable<RogueCoopSession['adventure']>, member: RogueCoopMemberState): RogueRun {
		member.experienceReceipts ||= [];
		member.pendingMoves ||= [];
		member.notices ||= [];
		return {
			id: adventure.id, contentVersion: adventure.contentVersion, floor: adventure.floor, phase: 'settlement',
			difficulty: adventure.difficulty, doubleBattle: true, blessings: member.blessings, growth: member.growth,
			encounter: adventure.encounter, attempt: 0, boosts: member.boosts, startingSlots: member.slots,
			team: member.team, box: member.box, money: member.money, bag: member.bag,
			node: adventure.node, checkpoint: { team: [], box: [], money: member.money, bag: {} }, caught: [],
			experienceReceipts: member.experienceReceipts, pendingMoves: member.pendingMoves,
			notices: member.notices, shoppingSpend: member.shoppingSpend,
		} as RogueRun;
	}
	private awardMemberGrowth(
		userid: string, adventure: NonNullable<RogueCoopSession['adventure']>, result: RogueBattleResult, partner = false,
	) {
		const content = this.engine.content;
		if (!content?.progression) return;
		const member = adventure.members[userid];
		const run = this.growthRun(adventure, member);
		// The shared defeat receipt snapshots each owner's king at that moment. Older receipts
		// lack the partner field; undefined preserves the normal own-party fallback.
		awardBattleExperience(run, partner ? { ...result, defeated: result.defeated?.map(defeated => ({
			...defeated, dragonKing: defeated.partnerDragonKing,
		})) } : result);
		member.experienceReceipts = run.experienceReceipts;
		member.pendingMoves = run.pendingMoves;
		member.notices = run.notices;
		this.engine.store.change(userid, account => {
			for (const mon of member.team.filter(entry => !entry.egg)) {
				recordStarterMoves(account, content, mon.set, { difficulty: adventure.difficulty });
			}
		});
	}
	private resolveMemberMove(userid: string, adventure: NonNullable<RogueCoopSession['adventure']>, memberId: string, value: string) {
		const member = adventure.members[userid];
		const pending = member.pendingMoves?.[0];
		const mon = member.team.find(entry => entry.id === pending?.member);
		requireRule(pending && memberId === mon?.id, '没有对应的待学习招式。');
		rememberMove(mon, pending.move);
		if (value !== 'skip') {
			const slot = Number(value);
			requireRule(Number.isInteger(slot) && slot >= 0 && slot < mon.set.moves.length &&
				!mon.set.moves.some((move, index) => index !== slot && toID(move) === pending.move), '替换招式位置无效。');
			mon.set.moves[slot] = pending.move;
			rebuildMember(mon, member.boosts);
		}
		member.pendingMoves!.shift();
		return (account: RogueAccount) => recordStarterMoves(account, this.engine.content!,
			{ ...mon.set, moves: [pending.move] }, { difficulty: adventure.difficulty });
	}
	private captureMember(member: RogueCoopMemberState, captured: RoguePokemon) {
		if ([...member.team, ...member.box, ...(member.pendingCaptures || [])].some(mon => mon.id === captured.id)) return;
		const set = { ...structuredClone(captured.set),
			happiness: toID(captured.set.pokeball) === 'friendball' ? 150 : ROGUE_INITIAL_FRIENDSHIP };
		const mon = createRoguePokemon(set, member.boosts, captured.id, captured.stars);
		mon.hp = Math.max(1, mon.maxhp - (captured.maxhp - captured.hp));
		mon.pp = structuredClone(captured.pp);
		mon.status = captured.status;
		mon.statusState = { ...captured.statusState };
		mon.statuses = captured.statuses && structuredClone(captured.statuses);
		if (this.engine.content?.progression) initializeExperience(mon);
		if (member.team.length < 6) member.team.push(mon);
		else (member.pendingCaptures ||= []).push(mon);
	}
	private recordCaptureUnlock(
		userid: string, captured: RoguePokemon, biomeId: string | undefined, receipt: string, difficulty: RogueCoopDifficulty,
	) {
		const content = this.engine.content;
		requireRule(content, '幻想杯肉鸽捕捉内容尚未配置。');
		const species = rogueSpeciesID(captured.set.species);
		const rule = content.unlocks[species];
		requireRule(rule, '缺少捕捉解锁配置。');
		this.engine.store.change(userid, account => {
			account.coopCaptureReceipts ||= [];
			if (account.coopCaptureReceipts.includes(receipt)) return;
			account.caughtSpecies ||= [];
			if (!account.caughtSpecies.includes(species)) account.caughtSpecies.push(species);
			if (biomeId) {
				account.biomeCaptures ||= {};
				const captures = account.biomeCaptures[biomeId] ||= [];
				if (!captures.includes(species)) captures.push(species);
			}
			const count = account.captures[rule.starter] = (account.captures[rule.starter] || 0) + 1;
			if (count >= rule.captures && !account.unlocked.includes(rule.starter)) account.unlocked.push(rule.starter);
			recordStarterTraits(account, content, captured.set, true, { difficulty });
			recordShinyCapture(account, content, captured.set);
			recordStarterMoves(account, content, captured.set, { difficulty });
			account.coopCaptureReceipts.push(receipt);
			if (account.coopCaptureReceipts.length > 256) account.coopCaptureReceipts.splice(0, account.coopCaptureReceipts.length - 256);
		});
	}
	/** Persist successful co-op captures immediately; receipt IDs make reconnect replay idempotent. */
	recordCapture(sessionId: string, token: string, captured: RoguePokemon, result?: RogueBattleResult) {
		const { session, changed } = this.engine.store.commitCoopResult(() =>
			this.recordCaptureResult(sessionId, token, captured, result));
		if (changed) {
			for (const userid of [session.hostUser, session.guestUser]) {
				Users.get(userid)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
					session: session.id, captureResolved: true,
				})}`);
			}
		}
		return session;
	}
	private recordCaptureResult(sessionId: string, token: string, captured: RoguePokemon, result?: RogueBattleResult) {
		const session = this.engine.store.coopSession(sessionId);
		requireRule(session?.id === sessionId && session.status === 'active' && session.adventure &&
			['battle-starting', 'battle'].includes(session.adventure.phase) && session.adventure.battleToken === token,
		'共同捕捉已失效或当前战斗已经结束。');
		requireRule(result, '缺少共同捕获的战斗结果。');
		requireRule(result.encounterId === session.adventure.encounterId, '捕获结果与当前共同战斗不匹配。');
		const ownerSide = result.captureOwners?.[captured.id];
		requireRule(ownerSide === 'p1' || ownerSide === 'p3', '捕获归属缺失，无法保存到个人存档。');
		const ownerUser = ownerSide === 'p1' ? session.hostUser : session.guestUser;
		const receipt = `${token}:${captured.id}`;
		if (session.adventure.captureReceipts?.includes(receipt)) return { session, changed: false };
		const member = session.adventure.members[ownerUser];
		requireRule(member, '共同捕获归属玩家不存在。');
		this.recordCaptureUnlock(ownerUser, captured, session.adventure.node?.biome?.id, receipt, session.adventure.difficulty);
		const expectedRevision = session.revision;
		const snapshot = (userid: string, team: RogueBattleResult['team'], selected: string[]) => {
			requireRule(Array.isArray(team) && team.length === selected.length &&
				new Set(team.map(mon => mon.id)).size === selected.length && team.every(mon => selected.includes(mon.id)),
			'共同捕获时的队伍快照与出战队伍不匹配。');
			const byId = new Map(team.map(mon => [mon.id, structuredClone(mon)]));
			session.adventure!.members[userid].team = session.adventure!.members[userid].team.map(mon => byId.get(mon.id) || mon);
		};
		if (result.team && result.partnerTeam) {
			snapshot(session.hostUser, result.team, session.battleSelections[session.hostUser]);
			snapshot(session.guestUser, result.partnerTeam, session.battleSelections[session.guestUser]);
		}
		if (result.bag) session.adventure.members[session.hostUser].bag = { ...result.bag };
		if (result.partnerBag) session.adventure.members[session.guestUser].bag = { ...result.partnerBag };
		this.captureMember(member, captured);
		session.adventure.captureReceipts ||= [];
		if (!session.adventure.captureReceipts.includes(receipt)) session.adventure.captureReceipts.push(receipt);
		delete session.adventure.captureProposal;
		member.notices ||= [];
		member.notices.push(`已捕获 ${captured.set.species}，归入你的队伍。`);
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		return { session, changed: true };
	}
	private trackCoopJourneyBattlers(session: RogueCoopSession) {
		const adventure = session.adventure!;
		for (const userid of [session.hostUser, session.guestUser]) {
			const member = adventure.members[userid];
			const selected = new Set(session.battleSelections[userid]);
			const run = {
				id: adventure.id, contentVersion: adventure.contentVersion, floor: adventure.floor,
				phase: 'battle', difficulty: adventure.difficulty, doubleBattle: true, encounter: adventure.encounter, attempt: 0,
				team: member.team.filter(mon => selected.has(mon.id)), box: member.box, money: member.money, bag: member.bag,
				boosts: member.boosts, startingSlots: member.slots, node: adventure.node,
				checkpoint: { team: [], box: [], money: member.money, bag: {} }, caught: [], blessings: member.blessings,
				journey: member.journey,
			} as RogueRun;
			trackJourney(run, this.engine.store.get(userid));
			member.journey = run.journey;
		}
	}
	settleBattle(sessionId: string, token: string, result: RogueBattleResult) {
		const { session, changed } = this.engine.store.commitCoopResult(() => this.settleBattleResult(sessionId, token, result));
		if (changed) {
			for (const userid of [session.hostUser, session.guestUser]) {
				Users.get(userid)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
					session: session.id, battleResult: true, abandoned: session.status === 'abandoned',
				})}`);
				if (result.coopExit && session.roomid) Users.get(userid)?.sendTo(session.roomid as RoomID, '|fantasyrogueend|');
			}
		}
		return session;
	}
	private settleBattleResult(sessionId: string, token: string, result: RogueBattleResult) {
		let session = this.engine.store.coopSession(sessionId);
		requireRule(session?.id === sessionId && session.adventure, '共同冒险已经结束或不存在。');
		for (const captured of result.captures || []) {
			if (!session.adventure.captureReceipts?.includes(`${token}:${captured.id}`)) {
				this.recordCaptureResult(sessionId, token, captured, result);
			}
		}
		session = this.engine.store.coopSession(sessionId);
		requireRule(session?.id === sessionId && session.adventure, '共同冒险已经结束或不存在。');
		const adventure = session.adventure;
		if (adventure.battleResult && adventure.battleToken === token) return { session, changed: false };
		requireRule(['battle-starting', 'battle'].includes(adventure.phase) && adventure.battleToken === token,
			'这场战斗已经结算或已被新的战斗取代。');
		requireRule(result.encounterId === adventure.encounterId && typeof result.won === 'boolean', '战斗结果与当前联机战斗不匹配。');
		const failedChallenge = !!adventure.node?.challenge && (!result.won || !!result.coopExit);
		result = failedCoopChallengeResult(session, result);
		const memoryBattle = adventure.node?.event?.id === 'travel';
		const escort = activeCoopEscort(adventure);
		if (memoryBattle) requireRule([session.hostUser, session.guestUser].every(userid =>
			adventure.members[userid].coopEvent?.memory), '旅行战斗缺少双方的战前恢复记录。');
		const replaceMemberTeam = (userid: string, snapshots: RogueBattleResult['team'], selected: string[]) => {
			requireRule(Array.isArray(snapshots) && snapshots.length === selected.length &&
				new Set(snapshots.map(mon => mon.id)).size === selected.length && snapshots.every(mon => selected.includes(mon.id)),
			'战斗队伍快照与会话选出不匹配。');
			if (saveCoopEscortResult(adventure, userid, snapshots)) return;
			const snapshotById = new Map(snapshots.map(mon => [mon.id, structuredClone(mon)]));
			adventure.members[userid].team = adventure.members[userid].team.map(mon => snapshotById.get(mon.id) || mon);
		};
		replaceMemberTeam(session.hostUser, result.team, session.battleSelections[session.hostUser]);
		requireRule(Array.isArray(result.partnerTeam), '缺少队友战后队伍快照。');
		replaceMemberTeam(session.guestUser, result.partnerTeam, session.battleSelections[session.guestUser]);
		requireRule(result.partnerBag && typeof result.partnerBag === 'object', '缺少队友的战后道具背包快照。');
		adventure.members[session.hostUser].bag = { ...result.bag };
		adventure.members[session.guestUser].bag = { ...result.partnerBag };
		const ownerResults = [
			{ userid: session.hostUser, team: result.team, blessingProgress: result.blessingProgress,
				blessingEffects: result.blessingEffects,
				captures: (result.captures || []).filter(mon => result.captureOwners?.[mon.id] !== 'p3'),
				companionZUsed: result.companionZUsed },
			{ userid: session.guestUser, team: result.partnerTeam, blessingProgress: result.partnerBlessingProgress,
				blessingEffects: result.partnerBlessingEffects,
				captures: (result.captures || []).filter(mon => result.captureOwners?.[mon.id] === 'p3'),
				companionZUsed: result.partnerCompanionZUsed },
		];
		for (const ownerResult of ownerResults) {
			const member = adventure.members[ownerResult.userid];
			if (memoryBattle) {
				const run = this.eventRun(adventure, ownerResult.userid);
				if (result.coopExit) delete run.node!.event!.memory;
				else restoreCoopTravel(run, result, ownerResult.userid === session.guestUser);
				this.applyCoopEventRun(adventure, ownerResult.userid, run);
				continue;
			}
			if (ownerResult.blessingEffects && member.blessings) {
				Object.assign(member.blessings, structuredClone(ownerResult.blessingEffects));
			}
			if (this.engine.content?.blessings && member.blessings) {
				const run = this.blessingRun(adventure, ownerResult.userid);
				const memberResult: RogueBattleResult = {
					...result, team: ownerResult.team || [], blessingProgress: ownerResult.blessingProgress,
					partnerBlessingProgress: undefined, blessingEffects: undefined, partnerBlessingEffects: undefined,
					captures: ownerResult.captures, captured: ownerResult.captures.length ?
						ownerResult.captures[ownerResult.captures.length - 1] : undefined,
					companionZUsed: ownerResult.companionZUsed,
				};
				this.engine.store.change(ownerResult.userid, savedAccount => {
					settleBlessingBattle(savedAccount, run, this.engine.content!, memberResult,
						max => randomInt(max), !!result.coopExit || failedChallenge);
				});
				this.saveBlessingRun(adventure, ownerResult.userid, run);
			}
		}
		for (const captured of result.captures || []) this.captureMember(
			adventure.members[result.captureOwners?.[captured.id] === 'p3' ? session.guestUser : session.hostUser], captured);
		const rewards = [
			{ money: 0, items: {} as Record<string, number>, effect: '' },
			{ money: 0, items: {} as Record<string, number>, effect: '' },
		];
		if (result.won && !memoryBattle) {
			const baseLoot = adventure.node!.wildLoot?.[adventure.encounter] || {};
			const defeated = result.defeated || [];
			const rockFraction = defeated.filter(mon => Dex.mod('gen9fantasy').species.get(mon.species).types.includes('Rock')).length /
				Math.max(1, defeated.length);
			const owners = [session.hostUser, session.guestUser];
			for (const [index, userid] of owners.entries()) {
				const member = adventure.members[userid];
				const psychicFraction = defeated.filter(defeat => member.team.some(mon => mon.id === defeat.killer &&
					Dex.mod('gen9fantasy').species.get(mon.set.species).types.includes('Psychic'))).length /
					Math.max(1, defeated.length);
				const run = this.blessingRun(adventure, userid);
				const loot = this.engine.content?.blessings ? blessingLoot(run, baseLoot, max => randomInt(max),
					rockFraction, psychicFraction) : { ...baseLoot };
				const payout = grantCandyTraining(run, { items: loot,
					candyTraining: adventure.node!.wildLoot ? adventure.node!.wildCandyTraining?.[adventure.encounter] : 0 });
				rewards[index].effect = payout.effect;
				for (const [id, count] of Object.entries(payout.items)) {
					if (!Number.isSafeInteger(count) || count <= 0) continue;
					rewards[index].items[id] = count;
					member.bag[id] = (member.bag[id] || 0) + count;
				}
				this.saveBlessingRun(adventure, userid, run);
				member.coopLootReward = { floor: adventure.floor, name: adventure.node!.name,
					...structuredClone(rewards[index]), points: 0 };
			}
		}
		if (!result.coopExit && !memoryBattle && !failedChallenge) {
			this.awardMemberGrowth(session.hostUser, adventure, result);
			this.awardMemberGrowth(session.guestUser, adventure, result, true);
		}
		const escortResolved = !!escort && (!result.coopExit || result.coopExit === 'retreat' && escort.pokemon.hp <= 0);
		const scrollFailed = adventure.node?.event?.id === 'kubfuscroll' && result.coopExit === 'retreat' &&
			[session.hostUser, session.guestUser].some(userid =>
				coopBattleParty(adventure, userid).every(mon => !battleReady(mon)));
		const challengeResolved = settleCoopChallenge(adventure, result);
		const eventResolved = challengeResolved ||
			adventure.node?.kind === 'event' && adventure.node.event?.stage === 'battle' &&
			(['martial', 'tutor', 'room', 'mysteryball', 'forest'].includes(adventure.node.event.id) ||
				escortResolved || scrollFailed ||
				(['pokeflute', 'identityquiz', 'evolutiondojo', 'kubfuscroll'].includes(adventure.node.event.id) ||
					COOP_ACTIVITY_BATTLES.has(adventure.node.event.id) ||
					COOP_HONEYMOON_EVENTS.has(adventure.node.event.id) ||
					COOP_ADVENTURE_EVENTS.has(adventure.node.event.id)) && !result.coopExit ||
					memoryBattle && !result.coopExit);
		if (eventResolved && !challengeResolved) {
			const runs = [session.hostUser, session.guestUser].map(userid => ({ userid, run: this.eventRun(adventure, userid) }));
			const honeymoon = COOP_HONEYMOON_EVENTS.has(adventure.node!.event!.id);
			if (honeymoon) settleCoopHoneymoon(runs.map(entry => ({ ...entry,
				changeAccount: update => { this.engine.store.change(entry.userid, update); },
			})), this.engine.content!, randomInt, result.won);
			if (COOP_ACTIVITY_BATTLES.has(adventure.node!.event!.id)) {
				requireRule(typeof result.turns === 'number' && Number.isSafeInteger(result.turns) && result.turns >= 0,
					'活动战斗缺少可信回合数。');
			}
			const activityGift = result.won ?
				rollCoopActivityGift(runs.map(entry => entry.run), this.engine.content!, randomInt) : undefined;
			const roomPrize = adventure.node!.event!.id === 'room' && result.won && !result.coopExit ?
				rollSharedRoomPrize(runs.map(({ run }) => run), randomInt) : undefined;
			const banditPrize = adventure.node!.event!.id === 'bandits' && result.won && !result.coopExit ?
				sharedFragmentOffer(runs.map(({ run }) => run), 'bandits', randomInt) : null;
			const battleSupplies = ['mysteryball', 'forest'].includes(adventure.node!.event!.id) && result.won && !result.coopExit ?
				rollEventBattleSupplies(runs[0].run, this.engine.content!, randomInt) : undefined;
			for (const { userid, run } of runs) {
				if (roomPrize) run.node!.event!.roomBattlePrize = structuredClone(roomPrize);
				if (run.node!.event!.id === 'bandits') run.node!.event!.banditFragments = structuredClone(banditPrize);
				if (battleSupplies) run.node!.event!.battleSupplies = structuredClone(battleSupplies);
				if (honeymoon) {
					// Both account trips and the shared welcome were settled together above.
				} else if (run.node!.event!.id === 'kubfuscroll') {
					this.engine.store.change(userid, account => {
						settleCoopScroll({ userid, run, account }, this.engine.content!, randomInt, result.won);
						if (result.won) {
							const participant = run.node!.event!.coopScroll!.participants[userid];
							const mon = run.team.find(entry => entry.id === participant.member);
							if (participant.scroll && mon) recordStarterMoves(account, this.engine.content!, mon.set, run);
						}
					});
				} else if (memoryBattle) {
					settleServiceBattle(run, result.won, false, !!result.captures?.some(mon =>
						(result.captureOwners?.[mon.id] === 'p3' ? session.guestUser : session.hostUser) === userid));
					this.engine.store.change(userid, account => {
						for (const mon of run.team.filter(entry => !entry.egg)) {
							recordStarterMoves(account, this.engine.content!, mon.set, run);
						}
					});
				} else if (escortResolved || ['pokeflute', 'evolutiondojo'].includes(run.node!.event!.id) ||
					COOP_ACTIVITY_BATTLES.has(run.node!.event!.id)) {
					(run.node!.event!.activity ||= {}).lastTurns = result.turns;
					if (escortResolved) run.node!.event!.activity.allySurvived = escort.pokemon.hp > 0;
					this.engine.store.change(userid, account => {
						settleEventBattle(run, this.engine.content!, randomInt, result.won, false, account, activityGift);
					});
					if (escortResolved || run.node!.event!.id === 'evolutiondojo' || COOP_ACTIVITY_BATTLES.has(run.node!.event!.id)) {
						requireRule(Number.isSafeInteger(run.money) && run.money >= 0 && Object.values(run.bag)
							.every(count => Number.isSafeInteger(count) && count >= 0), '共同活动奖励超出可保存范围。');
					}
				} else {
					settleEventBattle(run, this.engine.content!, max => randomInt(max), result.won, !!result.coopExit);
				}
				if (COOP_ADVENTURE_EVENTS.has(run.node!.event!.id)) {
					requireRule(Number.isSafeInteger(run.money) && run.money >= 0 && Object.values(run.bag)
						.every(count => Number.isSafeInteger(count) && count >= 0), '共同事件奖励超出可保存范围。');
				}
				this.applyCoopEventRun(adventure, userid, run);
			}
			if (COOP_ADVENTURE_EVENTS.has(adventure.node!.event!.id) || honeymoon || escortResolved ||
				adventure.node!.event!.id === 'kubfuscroll') {
				adventure.node!.event = structuredClone(runs[0].run.node!.event!);
			}
			if (adventure.node!.event!.id === 'kubfuscroll') delete adventure.node!.noHealing;
			if (roomPrize?.fragments || banditPrize) {
				adventure.coopEventBranchResolved = false;
				adventure.coopEventChoices = { [session.hostUser]: null, [session.guestUser]: null };
			}
		}
		const expectedRevision = session.revision;
		adventure.battleResult = { won: result.won, turns: result.turns,
			reward: rewards[0], partnerReward: rewards[1], eventResolved: !!eventResolved, retreated: !!result.coopExit,
			...(memoryBattle && !result.coopExit ? { memoryRestored: true } : {}) };
		adventure.lastReward = result.won ? {
			floor: adventure.floor, name: adventure.node!.name, ...structuredClone(rewards[0]),
		} : undefined;
		adventure.continueSelections = {};
		adventure.retrySelections = {};
		delete adventure.captureProposal;
		delete adventure.battleCheckpoint;
		delete adventure.battleRecoverySelections;
		delete session.exitProposal;
		if (this.blessingFollowupsPending(adventure)) {
			adventure.coopBlessingResume = 'battle';
			adventure.phase = 'blessing-reward';
		} else {
			adventure.phase = 'settlement';
		}
		if (result.coopExit === 'abandon') {
			session.status = 'abandoned';
			delete session.delegatedTo;
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		return { session, changed: true };
	}
	private settleContinue(user: User, retry: boolean) {
		return this.commitProgress(user, 'battleContinue', () => this.settleContinueResult(user, retry));
	}
	private settleContinueResult(user: User, retry: boolean) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure?.phase === 'settlement' &&
			session.adventure.battleResult, '当前没有待确认的共同战斗结算。');
		const adventure = session.adventure;
		const result = adventure.battleResult;
		requireRule(result, '当前没有待确认的共同战斗结算。');
		requireRule(retry ? !result.won && !result.eventResolved : result.won || result.eventResolved,
			retry ? '本场战斗已结算，不能重试。' : '本场未获胜，请先选择再战。');
		const owners = session.delegatedTo === user.id ? [session.hostUser, session.guestUser] : [user.id];
		for (const owner of owners) {
			const member = adventure.members[owner];
			requireRule(!member.pendingMoves?.length, owner === user.id ? '请先处理自己队伍的待学习招式。' :
				'请先处理队友队伍的待学习招式。');
			if (retry) requireRule(coopBattleParty(adventure, owner).some(battleReady), '队伍中没有可出战的伙伴，先完成急救恢复。');
		}
		const expectedRevision = session.revision;
		const selections = retry ? adventure.retrySelections ||= {} : adventure.continueSelections ||= {};
		selections[user.id] = true;
		if (session.delegatedTo === user.id) selections[session.hostUser === user.id ? session.guestUser : session.hostUser] = true;
		const bothReady = [session.hostUser, session.guestUser].every(userid => selections[userid]);
		if (bothReady) {
			if (retry) {
				adventure.phase = 'battle-selection';
				delete adventure.battleToken;
				delete adventure.encounterId;
				delete adventure.battleResult;
				adventure.continueSelections = {};
				adventure.retrySelections = {};
				clearBattleSelections(session);
				session.roomid = undefined;
			} else if (result.eventResolved) {
				// Training/teaching grants belong to each owner's full party, including unselected members.
				// Keep this floor until both players finish their personal reward steps and confirm exit.
				adventure.phase = 'route-interaction';
				adventure.routeExitSelections = {};
				session.roomid = undefined;
			} else if (adventure.encounter + 1 < adventure.node!.encounters.length) {
				adventure.encounter++;
				adventure.phase = 'battle-selection';
				delete adventure.battleToken;
				delete adventure.encounterId;
				delete adventure.battleResult;
				adventure.continueSelections = {};
				adventure.retrySelections = {};
				clearBattleSelections(session);
				session.roomid = undefined;
			} else {
				const reward = adventure.node!.reward;
				for (const userid of [session.hostUser, session.guestUser]) {
					const receipt = this.creditNodeReward(adventure, userid, reward);
					if (userid === session.hostUser) adventure.lastReward = receipt;
				}
				this.completeCoopFloor(session, adventure);
			}
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		return session;
	}
	private commitProgress(
		user: User, notice: 'battleContinue' | 'blessingChoice' | 'blessingReward' | 'routeExit' | 'eventChoice' | 'affection',
		resolve: () => RogueCoopSession,
	) {
		const session = this.engine.store.commitCoopResult(resolve);
		const recipients = notice === 'battleContinue' ? [session.hostUser, session.guestUser] :
			[session.hostUser === user.id ? session.guestUser : session.hostUser];
		for (const userid of recipients) {
			Users.get(userid)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
				session: session.id, [notice]: true,
				...(notice === 'battleContinue' ? { completed: session.status === 'complete' } : {}),
			})}`);
		}
		return session;
	}
	private storyRecoveryView(session: RogueCoopSession) {
		const adventure = session.adventure;
		if (!adventure || !['active', 'paused'].includes(session.status)) return null;
		const choices = adventure.routeChoices || this.engine.content?.floors[adventure.floor] || [];
		const obsoleteChoices = adventure.phase === 'area-selection' && choices.some(secretRoute) &&
			!choices.some(node => this.routeAvailable(node, adventure.floor));
		if (!secretRoute(adventure.node) && !obsoleteChoices) return null;
		const key = createHash('sha256').update(JSON.stringify([adventure.floor, adventure.phase,
			adventure.node?.id, adventure.battleToken, choices.map(node => node.id)])).digest('hex').slice(0, 24);
		const room = session.roomid ? Rooms.get(session.roomid) : undefined;
		const checkpoint = adventure.battleCheckpoint;
		const battle = ['battle', 'battle-starting'].includes(adventure.phase);
		const pending = Object.values(adventure.members).some(member => member.pendingMoves?.length ||
			member.blessings?.pending?.length || member.blessings?.stage || member.blessings?.round);
		const message = adventure.contentVersion !== this.engine.content?.version ? '内容版本已变化，请保留存档等待恢复，或共同结束本局。' :
			room?.battle && !room.battle.ended ? '原战斗仍在进行，请先共同撤退，再返回普通区域。' :
			battle && (!checkpoint || !adventure.encounterId || !validCoopCheckpoint(checkpoint, adventure.encounterId)) ?
				'这场旧对局缺少可信检查点，暂不能迁移；可以保留存档或共同结束本局。' :
				pending ? '请先处理已有的招式／祝福选择，再共同返回普通区域。' : '';
		return { key, available: !message, pending: !!pending,
			message: message || '旧存档停在秘闻区域。联机不进入主线剧情，请共同返回同层普通区域。',
			selections: adventure.routeRecovery?.key === key ? { ...adventure.routeRecovery.selections } : {} };
	}
	private recoverStoryRoute(user: User, key: string, accept: boolean) {
		let session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.adventure, '当前没有需要恢复的共同区域。');
		const recovery = this.storyRecoveryView(session);
		requireRule(recovery?.key === key, '旧区域恢复请求已失效，请刷新。');
		requireRule(!accept || recovery.available, recovery.message);
		const adventure = session.adventure;
		const wasPaused = session.status === 'paused';
		adventure.routeRecovery = adventure.routeRecovery?.key === key ? adventure.routeRecovery : { key, selections: {} };
		const owners = session.delegatedTo === user.id ? [session.hostUser, session.guestUser] : [user.id];
		for (const owner of owners) adventure.routeRecovery.selections[owner] = accept;
		const agreed = [session.hostUser, session.guestUser].every(owner => adventure.routeRecovery!.selections[owner]);
		if (agreed) {
			// Prepare on a copy before any settlement: no normal route means no migration or resource change.
			const replacement = structuredClone(adventure);
			this.prepareRouteChoices(replacement, false);
			requireRule(replacement.routeChoices?.some(node => this.routeAvailable(node, replacement.floor)),
				'当前版本没有同层普通区域，已保留原进度。');
			if (['battle', 'battle-starting'].includes(adventure.phase)) {
				if (session.status === 'paused') {
					session.status = 'active'; session.revision++;
					this.engine.store.updateCoopSession(session, session.revision - 1);
				}
				this.settleBattle(session.id, adventure.battleToken!, {
					...adventure.battleCheckpoint!.result, won: false, coopExit: 'retreat',
				});
				session = this.engine.store.coopSession(session.id)!;
			}
			const current = session.adventure!;
			current.phase = 'area-selection'; current.encounter = 0;
			current.routeChoices = replacement.routeChoices;
			current.routeHistory = replacement.routeHistory; current.biomeHistory = replacement.biomeHistory;
			delete current.node; delete current.encounterId;
			delete current.battleToken; delete current.battleLease;
			delete current.battleCheckpoint; delete current.battleResult; delete current.battleRecoverySelections;
			delete current.continueSelections; delete current.retrySelections; delete current.routeExitSelections;
			delete current.captureProposal; delete current.tradeProposal; delete current.lastReward;
			delete current.coopEventChoices; delete current.coopEventBranchResolved; delete current.routeRecovery;
			for (const member of Object.values(current.members)) {
				delete member.coopEvent; delete member.coopEventReward;
			}
			session.areaSelections = { [session.hostUser]: null, [session.guestUser]: null };
			clearBattleSelections(session);
			delete session.roomid;
			if (wasPaused) session.status = 'paused';
			if (this.blessingFollowupsPending(current)) {
				current.phase = 'blessing-reward'; current.coopBlessingResume = 'opening';
			}
		}
		session.revision++; session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, session.revision - 1);
		for (const userid of [session.hostUser, session.guestUser]) {
			Users.get(userid)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
				session: session.id, routeRecovered: agreed,
			})}`);
		}
	}
	private notifyExit(session: RogueCoopSession) {
		for (const userid of [session.hostUser, session.guestUser]) {
			Users.get(userid)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
				session: session.id, exitChanged: true, abandoned: session.status === 'abandoned',
				exitRequest: session.exitProposal && !session.exitProposal.confirmed &&
					session.exitProposal.proposer !== userid ? session.exitProposal.kind : undefined,
			})}`);
		}
	}
	private proposeExit(user: User, kind: string) {
		const session = this.engine.store.coopSessionForUser(user.id), now = Date.now();
		requireRule(session?.adventure && ['active', 'paused'].includes(session.status), '当前没有可退出的共同冒险。');
		requireRule(kind === 'retreat' || kind === 'abandon', '请选择共同撤退或结束本局。');
		requireRule(!session.exitProposal || !session.exitProposal.confirmed && session.exitProposal.expiresAt <= now,
			'请先处理当前共同退出请求。');
		if (kind === 'retreat') {
			requireRule(session.status === 'active' && ['battle', 'battle-starting'].includes(session.adventure.phase),
				'只有共同战斗中可以撤退到场外。');
			const recovery = this.battleRecoveryView(session);
			requireRule(!recovery || recovery.available, '这场旧对局没有可安全读取的检查点；可以共同结束本局。');
		}
		const revision = session.revision;
		session.exitProposal = { id: randomUUID(), kind, proposer: user.id, phase: session.adventure.phase,
			battleToken: session.adventure.battleToken, expiresAt: now + 5 * 60 * 1000,
			confirmed: session.delegatedTo === user.id };
		session.revision++; session.updatedAt = now;
		this.engine.store.updateCoopSession(session, revision);
		this.notifyExit(session);
		if (session.exitProposal.confirmed) this.tryExecuteExit(session.id);
	}
	private respondExit(user: User, id: string, value: string) {
		const session = this.engine.store.coopSessionForUser(user.id), proposal = session?.exitProposal;
		requireRule(session?.adventure && proposal?.id === id &&
			(proposal.confirmed || proposal.expiresAt > Date.now()), '共同退出请求已失效，请刷新。');
		requireRule(value === 'accept' || value === 'cancel', '请选择同意或取消共同退出。');
		const revision = session.revision;
		if (value === 'cancel') {
			requireRule(!proposal.confirmed, '双方已经确认退出，正在保存结果。');
			delete session.exitProposal;
		} else {
			requireRule(proposal.confirmed || proposal.proposer !== user.id || session.delegatedTo === user.id,
				'等待队友确认；不能代替未移交操作权的队友。');
			requireRule(proposal.phase === session.adventure.phase && proposal.battleToken === session.adventure.battleToken,
				'冒险已经进入新的阶段，请重新发起退出请求。');
			proposal.confirmed = true;
		}
		session.revision++; session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, revision);
		this.notifyExit(session);
		if (value === 'accept') this.tryExecuteExit(session.id);
	}
	private tryExecuteExit(sessionId: string) {
		try {
			this.executeExit(sessionId);
		} catch (error) {
			// A failed preflight has performed no exit; do not leave an un-cancellable confirmed proposal.
			const session = this.engine.store.coopSession(sessionId)!;
			delete session.exitProposal;
			session.revision++; session.updatedAt = Date.now();
			this.engine.store.updateCoopSession(session, session.revision - 1);
			this.notifyExit(session);
			throw error;
		}
	}
	private executeExit(sessionId: string) {
		let session = this.engine.store.coopSession(sessionId)!;
		const proposal = session.exitProposal, adventure = session.adventure;
		requireRule(proposal?.confirmed && adventure && ['active', 'paused'].includes(session.status),
			'尚未共同确认退出。');
		const room = session.roomid ? Rooms.get(session.roomid) : undefined;
		if (room?.battle && !room.battle.ended) {
			requireRule(room.battle.options.cooperativeGuest &&
				room.battle.options.fantasyRogue?.state.encounterId === adventure.encounterId &&
				room.battle.p1.id === session.hostUser && room.battle.p3.id === session.guestUser,
			'房间与联机会话不匹配，未结束任何战斗。');
			const preview = [room.battle.p1, room.battle.p3].every(player => {
				try { return !!JSON.parse(player.request.request).teamPreview; } catch { return false; }
			});
			if (!preview) {
				// Read the result inside the simulator, after every earlier committed action and capture.
				void room.battle.stream.write(`>roguecoopexit ${proposal.kind}`);
				return;
			}
			room.destroy();
			session = this.engine.store.coopSession(sessionId)!;
			if (proposal.kind === 'retreat') {
				const current = session.adventure!;
				current.phase = 'battle-selection';
				delete current.battleToken; delete current.battleLease; delete current.encounterId;
				clearBattleSelections(session);
				delete session.roomid; delete session.exitProposal;
				session.revision++; session.updatedAt = Date.now();
				this.engine.store.updateCoopSession(session, session.revision - 1);
				this.notifyExit(session);
				return;
			}
		}
		const current = session.adventure!, checkpoint = current.battleCheckpoint;
		if (['battle', 'battle-starting'].includes(current.phase) && checkpoint && current.encounterId &&
			current.contentVersion === this.engine.content?.version && validCoopCheckpoint(checkpoint, current.encounterId)) {
			if (session.status === 'paused') {
				session.status = 'active'; session.revision++; session.updatedAt = Date.now();
				this.engine.store.updateCoopSession(session, session.revision - 1);
			}
			// A naturally finished battle keeps its earned result; it cannot be converted into a free retry.
			const result = checkpoint.state.ended ? checkpoint.result :
				{ ...checkpoint.result, won: false, coopExit: proposal.kind };
			this.settleBattle(session.id, current.battleToken!, result);
			if (proposal.kind === 'retreat' || result.coopExit === 'abandon') return;
			session = this.engine.store.coopSession(sessionId)!;
		} else {
			requireRule(proposal.kind === 'abandon', '这场旧对局没有可安全读取的检查点；可共同结束本局，或保留等待恢复。');
		}
		// Ending a legacy run remains possible without fabricating missing HP, bag or enemy state.
		session.status = 'abandoned';
		delete session.exitProposal; delete session.delegatedTo;
		session.revision++; session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, session.revision - 1);
		this.notifyExit(session);
	}
	/** Fence delayed packets from a room replaced after a crash without changing capture/reward identities. */
	ownsBattleRoom(sessionId: string, token: string, lease: string) {
		const session = this.engine.store.coopSession(sessionId);
		return session?.status === 'active' && session.adventure?.battleToken === token &&
			['battle-starting', 'battle'].includes(session.adventure.phase) &&
			(session.adventure.battleLease || token) === lease;
	}
	saveBattleCheckpoint(sessionId: string, token: string, lease: string, checkpoint: RogueCoopCheckpoint) {
		if (!this.ownsBattleRoom(sessionId, token, lease)) return;
		const session = this.engine.store.coopSession(sessionId)!, adventure = session.adventure!;
		if (!['battle-starting', 'battle'].includes(adventure.phase)) return;
		requireRule(!!adventure.encounterId && validCoopCheckpoint(checkpoint, adventure.encounterId),
			'共同对战检查点无效，不能覆盖已保存的状态。');
		if (checkpoint.sequence <= (adventure.battleCheckpoint?.sequence || 0)) return;
		const nativeSelected = !!adventure.nativeTeamPreview && !adventure.nativeTeamSelected &&
			checkpoint.state.fantasyRogue?.coopTeamSelected === true;
		for (const [userid, team, side] of [
			[session.hostUser, checkpoint.result.team, checkpoint.state.sides[0]],
			[session.guestUser, checkpoint.result.partnerTeam, checkpoint.state.sides[2]],
		] as const) {
			const candidates = session.battleSelections[userid] || [];
			const selected = nativeSelected && Array.isArray(team) ? team.map(mon => mon.id) : candidates;
			if (nativeSelected) requireRule(selected.length > 0 && selected.length <= 3 &&
				selected.every(id => candidates.includes(id)), '原生选队结果超出本场候选队伍。');
			const matches = (ids: string[]) => ids.length === selected.length && new Set(ids).size === selected.length &&
				ids.every(id => selected.includes(id));
			requireRule(Array.isArray(team) && matches(team.map(mon => mon.id)) && Array.isArray(side.pokemon) &&
				matches(side.pokemon.map((mon: AnyObject) => mon.set?.fantasyRogueId)), '检查点与双方出战队伍不匹配。');
			if (nativeSelected) session.battleSelections[userid] = [...selected];
			if (adventure.nativeTeamPreview && !adventure.nativeTeamSelected) {
				const confirmed = side.choice?.rogueTeamPreview;
				if (Array.isArray(confirmed) && confirmed.length > 0 && confirmed.length <= 3 &&
					new Set(confirmed).size === confirmed.length && confirmed.every(id => candidates.includes(id))) {
					(session.battlePreviews ||= {})[userid] = [...confirmed];
				}
			}
		}
		const expectedRevision = session.revision;
		if (nativeSelected) {
			adventure.nativeTeamSelected = true;
			this.trackCoopJourneyBattlers(session);
		}
		adventure.battleCheckpoint = structuredClone(checkpoint);
		adventure.battleRecoverySelections = {};
		session.revision++; session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		// Persist the checkpoint first: interrupted account/capture writes can be reconciled from it on recovery.
		for (const captured of checkpoint.result.captures || []) this.recordCapture(sessionId, token, captured, checkpoint.result);
		if (adventure.nativeTeamPreview && (!adventure.nativeTeamSelected || nativeSelected)) {
			for (const userid of [session.hostUser, session.guestUser]) Users.get(userid)?.send(
				`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, battleSelection: true })}`);
		}
	}
	private battleRecoveryView(session: RogueCoopSession) {
		const adventure = session.adventure;
		if (!adventure || !['battle', 'battle-starting'].includes(adventure.phase)) return null;
		const room = session.roomid ? Rooms.get(session.roomid) : undefined;
		if (room?.battle && !room.battle.ended) return null;
		const checkpoint = adventure.battleCheckpoint;
		const valid = !!checkpoint && !!adventure.encounterId && validCoopCheckpoint(checkpoint, adventure.encounterId);
		const currentVersion = adventure.contentVersion === this.engine.content?.version;
		return { available: valid && currentVersion,
			turn: checkpoint?.result.turns || 0, final: !!checkpoint?.state.ended,
			selections: { ...adventure.battleRecoverySelections },
			message: !currentVersion ? '内容版本已变化，暂不能直接恢复旧战斗。已保存的状态仍保留。' :
			valid ? '原房间已中断，可以从最后保存的战斗状态继续。' :
			'这场旧对局没有可用的战斗检查点，不能安全恢复。已保存的队伍与资源仍保留。' };
	}
	private recoverBattle(user: User) {
		let session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure, '当前没有可恢复的共同战斗。');
		const recovery = this.battleRecoveryView(session), adventure = session.adventure;
		requireRule(recovery?.available && adventure.battleCheckpoint && adventure.battleToken,
			'原战斗仍在进行，或没有可安全恢复的战斗检查点。');
		requireRule(adventure.contentVersion === this.engine.content?.version, '内容版本已变化，不能直接恢复旧战斗。');
		const token = adventure.battleToken, checkpoint = adventure.battleCheckpoint;
		for (const captured of checkpoint.result.captures || []) {
			this.recordCapture(session.id, token, captured, checkpoint.result);
		}
		if (checkpoint.state.ended) {
			this.settleBattle(session.id, token, checkpoint.result);
			return;
		}
		session = this.engine.store.coopSession(session.id)!;
		const current = session.adventure!, expectedRevision = session.revision;
		const owners = session.delegatedTo === user.id ? [session.hostUser, session.guestUser] : [user.id];
		current.battleRecoverySelections ||= {};
		for (const owner of owners) current.battleRecoverySelections[owner] = true;
		const ready = [session.hostUser, session.guestUser].every(userid => current.battleRecoverySelections![userid]);
		if (ready) {
			requireRule(Users.get(session.hostUser)?.connected && Users.get(session.guestUser)?.connected,
				'双方都需要在线才能恢复共同战斗。');
			current.phase = 'battle-starting';
			current.battleLease = randomUUID();
			delete current.captureProposal;
			session.roomid = undefined;
		}
		session.revision++; session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		if (ready) {
			let roomid = '';
			try {
				roomid = this.startBattle(session, token);
				this.markBattleRoom(session.hostUser, session.id, token, roomid);
			} catch (error) {
				try {
					if (roomid) Rooms.get(roomid)?.destroy();
				} finally {
					this.resetBattleStart(session.hostUser, session.id, token);
				}
				throw error;
			}
		}
		Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser)?.send(
			`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, battleRecovery: true, battleStarted: ready })}`);
	}
	abortBattle(sessionId: string, token: string) {
		const session = this.engine.store.coopSession(sessionId);
		if (session?.id !== sessionId || session.adventure?.battleToken !== token ||
			!['battle-starting', 'battle'].includes(session.adventure.phase)) return;
		const expectedRevision = session.revision;
		if (session.adventure.battleCheckpoint || session.adventure.phase === 'battle') {
			// A closed room is not evidence that spent items or caught opponents can be reset.
			session.adventure.phase = 'battle';
			session.adventure.battleLease = randomUUID();
			session.adventure.battleRecoverySelections = {};
		} else {
			session.adventure.phase = 'battle-selection';
			clearBattleSelections(session, undefined, true);
			delete session.adventure.battleToken;
			delete session.adventure.battleLease;
			delete session.adventure.encounterId;
		}
		session.roomid = undefined;
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
	}
	private selectArea(user: User, id: string) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure &&
			(session.adventure.phase === 'area-selection' ||
				session.adventure.phase === 'battle-selection' && !session.adventure.node),
		'当前没有等待双方确认的区域路线。');
		requireRule(typeof id === 'string' && id.length <= 80, '区域路线标识无效。');
		const adventure = session.adventure;
		const choices = adventure.routeChoices || this.engine.content?.floors[adventure.floor] || [];
		const selected = choices.find(node => node.id === id);
		requireRule(selected, '这条路线不在当前楼层的选项中，请刷新后重选。');
		requireRule(this.routeAvailable(selected, session.adventure.floor), '该区域的联机交互尚未接入，请选择已开放的战斗、补给或休整路线。');
		const partnerId = session.hostUser === user.id ? session.guestUser : session.hostUser;
		const expectedRevision = session.revision;
		session.areaSelections ||= { [session.hostUser]: null, [session.guestUser]: null };
		session.areaSelections[user.id] = id;
		if (session.delegatedTo === user.id) session.areaSelections[partnerId] = id;
		adventure.routeChoices ||= structuredClone(choices);
		if (session.areaSelections[partnerId] === id) {
			adventure.node = structuredClone(selected);
			delete adventure.coopAuction;
			adventure.encounter = 0;
			adventure.phase = selected.encounters.length ? 'battle-selection' : 'route-interaction';
			if (isCoopMasterBallRoute(selected)) {
				selectCoopMasterBallRoute(session, selected.id);
			} else if (selected.challenge) {
				beginCoopChallenge(adventure, [session.hostUser, session.guestUser].map(userid =>
					({ userid, run: this.blessingRun(adventure, userid) })), randomInt);
				delete adventure.lastReward;
				for (const member of Object.values(adventure.members)) {
					delete member.coopEvent; delete member.coopEventReward;
				}
			} else if (selected.kind === 'event') {
				const run = this.blessingRun(adventure, session.hostUser);
				const guestRun = this.previewBlessingRun(adventure, session.guestUser);
				const parties = [{ userid: session.hostUser, run }, { userid: session.guestUser, run: guestRun }];
				for (const entry of parties) entry.run.honeymoon = structuredClone(this.engine.store.get(entry.userid).honeymoon);
				run.eventHistory = adventure.coopEventHistory;
				const allowedEvents = this.engine.content?.blessings ? COOP_EVENTS :
					new Set([...COOP_EVENTS].filter(eventId =>
						!['room', 'mysteryball', 'forest', 'travel', 'grassegg', 'hatchhouse', 'fossillab',
							'duskbreeder', 'kubfumaster', 'safaripark'].includes(eventId)));
				const eventId = chooseEvent(run, max => randomInt(max), allowedEvents, [guestRun]);
				(adventure.coopEventHistory ||= []).push({ id: eventId, floor: adventure.floor });
				if (adventure.coopEventHistory.length > 64) adventure.coopEventHistory.shift();
				const event: RogueEvent = { id: eventId, key: randomUUID(), stage: 'choice' };
				if (COOP_HONEYMOON_EVENTS.has(eventId)) beginCoopHoneymoon(parties, event, randomInt);
				if (COOP_ACTIVITY_EVENTS.has(eventId) || COOP_EXPEDITION_SERVICES.has(eventId)) {
					run.node = { ...adventure.node, event };
					if (COOP_ACTIVITY_EVENTS.has(eventId)) beginCoopActivity(run, randomInt);
					else beginExpedition(run);
				}
				if (eventId === 'mysteryball') event.ball = mysteryBallAtFloor(adventure.floor, randomInt);
				if (eventId === 'forest') {
					const level = Math.max(3, Math.min(100, Math.ceil(adventure.floor / 2)));
					event.teams = forestTeams(level, randomInt);
				}
				adventure.node.name = EVENT_NAMES[eventId];
				adventure.node.event = structuredClone(event);
				adventure.node.encounters = [];
				adventure.node.reward = { money: 0, items: {} };
				adventure.phase = 'route-interaction';
				delete adventure.lastReward;
				for (const userid of [session.hostUser, session.guestUser]) {
					adventure.members[userid].coopEvent = structuredClone(event);
					delete adventure.members[userid].coopEventReward;
				}
				adventure.coopEventChoices = { [session.hostUser]: null, [session.guestUser]: null };
				adventure.coopEventBranchResolved = false;
			}
			if (collectorRoute(selected) || auctionRoute(selected)) {
				let event: RogueEvent = { id: 'mushroomcollector', key: randomUUID(), stage: 'choice' };
				if (auctionRoute(selected)) {
					const runs = [session.hostUser, session.guestUser].map(userid => ({
						userid, run: this.blessingRun(adventure, userid),
					}));
					const initial = beginCoopAuction(runs, this.engine.content!, randomInt);
					adventure.coopAuction = initial.auction; event = initial.event;
					for (const { userid, run } of runs) this.saveBlessingRun(adventure, userid, run);
				}
				adventure.node.name = EVENT_NAMES[event.id];
				adventure.node.event = structuredClone(event);
				adventure.node.encounters = [];
				adventure.node.reward = { money: 0, items: {} };
				adventure.phase = 'route-interaction';
				delete adventure.lastReward;
				for (const userid of [session.hostUser, session.guestUser]) {
					adventure.members[userid].coopEvent = structuredClone(event);
					delete adventure.members[userid].coopEventReward;
				}
				adventure.coopEventChoices = { [session.hostUser]: null, [session.guestUser]: null };
				adventure.coopEventBranchResolved = false;
			}
			if (this.engine.content?.blessings && selected.encounters.length) {
				const run = this.blessingRun(adventure, session.hostUser);
				prepareBlessingEncounter(run, max => randomInt(max));
				this.saveBlessingRun(adventure, session.hostUser, run);
			}
			if (selected.kind === 'reward' && !isCoopMasterBallRoute(selected)) {
				for (const userid of [session.hostUser, session.guestUser]) {
					const receipt = this.creditNodeReward(adventure, userid, selected.reward);
					if (userid === session.hostUser) adventure.lastReward = receipt;
				}
			}
			adventure.routeExitSelections = {};
			session.areaSelections[session.hostUser] = null;
			session.areaSelections[session.guestUser] = null;
			clearBattleSelections(session);
		} else {
			delete adventure.node;
			adventure.phase = 'area-selection';
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		Users.get(partnerId)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
			session: session.id, areaSelection: true,
		})}`);
		return session;
	}
	private cancelArea(user: User) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure?.phase === 'area-selection',
			'当前没有可撤回的区域预选。');
		const expectedRevision = session.revision;
		session.areaSelections[user.id] = null;
		if (session.delegatedTo === user.id) {
			const partnerId = session.hostUser === user.id ? session.guestUser : session.hostUser;
			session.areaSelections[partnerId] = null;
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		const partnerId = session.hostUser === user.id ? session.guestUser : session.hostUser;
		Users.get(partnerId)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
			session: session.id, areaSelection: true,
		})}`);
		return session;
	}
	private applyCoopEventRun(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string, run: RogueRun) {
		const member = adventure.members[userid];
		member.team = run.team;
		member.box = run.box || [];
		member.money = run.money;
		member.bag = run.bag;
		member.growth = run.growth;
		member.blessings = run.blessings;
		member.notices = run.notices;
		member.pendingMoves = run.pendingMoves;
		member.coopEvent = structuredClone(run.node!.event!);
		member.coopEventReward = run.lastReward;
		member.coverageLessons = run.coverageLessons;
		member.eventFragments = run.eventFragments;
		member.shoppingSpend = run.shoppingSpend;
		member.exclusiveItems = run.exclusiveItems;
		member.trainerBonds = run.trainerBonds; member.affectionClaims = run.affectionClaims;
		member.rareCandyEvents = run.rareCandyEvents;
		member.activityClaims = run.activityClaims;
		member.greninjaTraining = run.greninjaTraining;
		member.systems = { tera: !!run.teraUnlocked, mega: !!run.megaUnlocked,
			gmega: !!run.gmegaUnlocked, z: !!run.zUnlocked };
		if (run.pendingCapture && !member.pendingCaptures?.some(mon => mon.id === run.pendingCapture!.id)) {
			(member.pendingCaptures ||= []).push(run.pendingCapture);
		}
	}
	private coopAffectionScene(session: RogueCoopSession) {
		if (!session.adventure) return null;
		if (Object.values(session.adventure.members).some(member => member.companionInvitations?.length)) return null;
		return sharedAffectionScene(session, [session.hostUser, session.guestUser].map(userid => ({
			userid, run: this.previewBlessingRun(session.adventure!, userid),
		})));
	}
	private chooseCoopAffection(user: User, command: RogueCoopCommand) {
		return this.commitProgress(user, 'affection', () => {
			const session = this.engine.store.coopSessionForUser(user.id);
			requireRule(session?.status === 'active' && session.adventure, '请在共同冒险中回应同行对话。');
			const adventure = session.adventure, scene = this.coopAffectionScene(session);
			requireRule(scene && command.visit === scene.visit, '同行对话已变化，请刷新后重新选择。');
			requireRule(command.value === 'cancel' || scene.options.some(option => option.id === command.value),
				'请从当前同行对话的选项中选择。');
			const expectedRevision = session.revision;
			if (adventure.coopAffection?.visit !== scene.visit) adventure.coopAffection = { visit: scene.visit, choices: {} };
			const votes = adventure.coopAffection.choices;
			const owners = session.delegatedTo === user.id ? [session.hostUser, session.guestUser] : [user.id];
			for (const owner of owners) votes[owner] = command.value === 'cancel' ? null : command.value!;
			if (votes[session.hostUser] && votes[session.hostUser] === votes[session.guestUser]) {
				const run = this.blessingRun(adventure, scene.owner);
				affectionCommand(run, { id: scene.visit, revision: 0, action: 'affection', member: scene.id,
					value: votes[session.hostUser]! });
				this.saveBlessingRun(adventure, scene.owner, run);
				delete adventure.coopAffection;
				if (adventure.phase === 'affection') this.advanceCoopAfterBlessings(session, adventure);
			}
			session.revision++;
			session.updatedAt = Date.now();
			this.engine.store.updateCoopSession(session, expectedRevision);
			return session;
		});
	}
	private chooseChallenge(user: User, command: RogueCoopCommand) {
		return this.commitProgress(user, 'eventChoice', () => {
			const session = this.engine.store.coopSessionForUser(user.id);
			requireRule(session?.status === 'active' && session.adventure?.phase === 'route-interaction' &&
				session.adventure.node?.challenge && session.adventure.coopChallenge, '当前没有待处理的共同挑战。');
			const adventure = session.adventure, owner = this.delegatedOwner(user, session, command.owner);
			requireRule(command.visit === adventure.coopChallenge!.key, '挑战选项已更新，请刷新后重新选择。');
			requireRule(!adventure.tradeProposal && Object.values(adventure.members).every(member => !member.pendingMoves?.length),
				'请先完成双方的招式学习或交换请求。');
			const entries = [session.hostUser, session.guestUser].map(userid =>
				({ userid, run: this.blessingRun(adventure, userid) }));
			const result = chooseCoopChallenge(session, entries, owner, command.value || '', command.member);
			if (result === 'claimed') {
				for (const { userid, run } of entries) {
					this.saveBlessingRun(adventure, userid, run);
					adventure.members[userid].coopLootReward = run.lastReward;
				}
				adventure.lastReward = entries[0].run.lastReward;
			} else if (result === 'ready') {
				adventure.phase = 'battle-selection';
				delete adventure.battleToken; delete adventure.encounterId; delete adventure.battleResult;
				adventure.continueSelections = {}; adventure.retrySelections = {};
				session.roomid = undefined;
				clearBattleSelections(session);
			} else if (result === 'leave') {
				if (adventure.node!.challenge!.stage === 'closed') this.advanceCoopAfterBlessings(session, adventure);
				else this.completeCoopFloor(session, adventure);
			}
			session.revision++; session.updatedAt = Date.now();
			return this.engine.store.updateCoopSession(session, session.revision - 1);
		});
	}
	private chooseTravelInvitation(user: User, command: RogueCoopCommand) {
		return this.commitProgress(user, 'eventChoice', () => {
			const session = this.engine.store.coopSessionForUser(user.id);
			requireRule(session?.status === 'active' && session.adventure &&
				!['battle', 'battle-starting', 'complete'].includes(session.adventure.phase), '请在共同战斗之外处理同行邀请。');
			const adventure = session.adventure, owner = this.delegatedOwner(user, session, command.owner);
			const run = this.blessingRun(adventure, owner); run.phase = 'event';
			chooseCompanionInvitation(run, command.visit, command.value);
			for (const page of run.dialogue?.pages || []) (run.notices ||= []).push(`${page.speaker || page.title}：${page.text}`);
			this.saveBlessingRun(adventure, owner, run);
			session.revision++; session.updatedAt = Date.now();
			return this.engine.store.updateCoopSession(session, session.revision - 1);
		});
	}
	private chooseCoopEvent(
		user: User, choice?: string, cancel = false, evs?: StatsTable, targetUser?: string, visit?: string
	) {
		return this.commitProgress(user, 'eventChoice',
			() => this.chooseCoopEventResult(user, choice, cancel, evs, targetUser, visit));
	}
	private chooseCoopEventResult(
		user: User, choice?: string, cancel = false, evs?: StatsTable, targetUser?: string, visit?: string
	) {
		const session = this.engine.store.coopSessionForUser(user.id);
		if (session?.status === 'active' && session.adventure?.phase === 'route-interaction' &&
			isCoopMasterBallRoute(session.adventure.node)) {
			if (targetUser) this.delegatedOwner(user, session, targetUser);
			const view = coopMasterBallView(session, user.id);
			requireRule(view && visit === view.key && (cancel || view.branchOptions.some(option => option.id === choice)),
				'极境馈赠选项已经更新，请刷新后重新确认。');
			const revision = session.revision, adventure = session.adventure;
			const votes = adventure.coopEventChoices ||= { [session.hostUser]: null, [session.guestUser]: null };
			const owners = session.delegatedTo === user.id ? [session.hostUser, session.guestUser] : [user.id];
			for (const owner of owners) votes[owner] = cancel ? null : choice!;
			if (votes[session.hostUser] && votes[session.hostUser] === votes[session.guestUser]) {
				chooseCoopMasterBall(session, votes[session.hostUser]!, (userid, update) => {
					this.engine.store.change(userid, update);
				});
				clearBattleSelections(session);
			}
			session.revision++; session.updatedAt = Date.now();
			return this.engine.store.updateCoopSession(session, revision);
		}
		requireRule(session?.status === 'active' && session.adventure?.phase === 'route-interaction' &&
			!secretRoute(session.adventure.node) && (collectorRoute(session.adventure.node) ||
				auctionRoute(session.adventure.node) ||
				session.adventure.node?.kind === 'event' && session.adventure.node.event &&
				COOP_EVENTS.has(session.adventure.node.event.id)), '当前没有可处理的双人事件。');
		const adventure = session.adventure;
		if (COOP_COLLECTION_EVENTS.has(adventure.node!.event!.id)) {
			requireRule(visit && visit === adventure.node!.event!.key, '收集事件进度已变化，请刷新后重选。');
		}
		if (COOP_ACTIVITY_EVENTS.has(adventure.node!.event!.id)) {
			requireRule(visit && visit === adventure.node!.event!.key, '共同活动进度已变化，请刷新后重选。');
		}
		if (adventure.node!.event!.id === 'safaripark') {
			requireRule(!adventure.captureProposal || adventure.captureProposal.expiresAt <= Date.now(),
				'请先处理或撤回捕捉协商，再靠近、喂食或更换目标。');
			delete adventure.captureProposal;
		}
		if (COOP_ADVENTURE_EVENTS.has(adventure.node!.event!.id) || COOP_HONEYMOON_EVENTS.has(adventure.node!.event!.id) ||
			adventure.node!.event!.id === 'lostescort') {
			requireRule(visit && visit === adventure.node!.event!.key, '共同事件进度已变化，请刷新后重选。');
		}
		if (COOP_EXPEDITION_SERVICES.has(adventure.node!.event!.id)) {
			requireRule(visit && visit === adventure.node!.event!.key, '共同服务已变化，请刷新后重选。');
		}
		if (COOP_EVOLUTION_EVENTS.has(adventure.node!.event!.id) || COOP_RHYTHM_EVENTS.has(adventure.node!.event!.id) ||
			COOP_GRENINJA_EVENTS.has(adventure.node!.event!.id) || adventure.node!.event!.id === 'kubfuscroll') {
			const owner = adventure.coopEventBranchResolved ? this.delegatedOwner(user, session, targetUser) : user.id;
			requireRule(visit && visit === adventure.members[owner].coopEvent?.key,
				'进化事件的个人步骤已变化，请刷新后重选。');
		}
		if (collectorRoute(adventure.node)) {
			requireRule(visit && visit === adventure.node?.event?.key, '收藏家来访已变化，请刷新后重选。');
		}
		if (auctionRoute(adventure.node)) {
			requireRule(adventure.coopAuction && visit && visit === adventure.node?.event?.key,
				'拍卖进度或报价已变化，请刷新后重新确认。');
		}
		const partnerId = session.hostUser === user.id ? session.guestUser : session.hostUser;
		const expectedRevision = session.revision;
		let learnedMove: string | undefined;
		const accountUpdates = new Map<string, (account: RogueAccount) => void>();
		const delegated = session.delegatedTo === user.id;
		if (!adventure.coopEventBranchResolved) {
			adventure.coopEventChoices ||= { [session.hostUser]: null, [session.guestUser]: null };
			if (cancel) {
				adventure.coopEventChoices[user.id] = null;
				if (delegated) adventure.coopEventChoices[partnerId] = null;
			} else {
				const option = this.sharedEventOptions(adventure, session.hostUser, session.guestUser)
					.find(entry => entry.id === choice && !entry.disabled);
				requireRule(option, '该共同分支目前不能选择，请刷新后重选。');
				adventure.coopEventChoices[user.id] = choice!;
				if (delegated) adventure.coopEventChoices[partnerId] = choice!;
				if (adventure.coopEventChoices[partnerId] === choice ||
					choice === 'tap' && COOP_RHYTHM_EVENTS.has(adventure.node!.event!.id) ||
					choice === 'fishtap' && adventure.node!.event!.id === 'fishing') {
					const eventId = adventure.node!.event!.id;
					let rhythmPersonal = false;
					const mysteryBall = eventId === 'mysteryball' ? rollMysteryBallOutcome(
						structuredClone(this.eventRun(adventure, session.hostUser)), this.engine.content!, randomInt, choice) : undefined;
					const forest = eventId === 'forest' && !['fragments', 'supplies'].includes(choice) ? rollSharedForestOutcome(
						[session.hostUser, session.guestUser].map(userid => this.eventRun(adventure, userid)),
						this.engine.content!, randomInt, choice) : undefined;
					let eventBattle = eventId === 'martial' && choice === 'power' || eventId === 'tutor' && choice === 'fantasy' ||
						eventId === 'room' && choice === 'fight' || eventId === 'travel' && choice === 'road' ||
						eventId === 'pokeflute' && choice === 'challenge' ||
						eventId === 'identityquiz' && choice === 'fight' ||
						COOP_ACTIVITY_BATTLES.has(eventId) && choice === 'accept' ||
						mysteryBall?.kind === 'battle' || forest?.kind === 'battle';
					const sharedOutcome = eventId === 'mushrooms' ? rollMushroomOutcome(adventure.floor,
						this.engine.content!, max => randomInt(max), choice) : undefined;
					const roomSleep = eventId === 'room' && choice === 'sleep' ?
						rollRoomSleepOutcome(adventure.floor, this.engine.content!, randomInt) : undefined;
					const runs = (eventBattle && !COOP_ACTIVITY_EVENTS.has(eventId) ?
						[session.hostUser] : [session.hostUser, session.guestUser])
						.map(userid => ({ userid, run: this.eventRun(adventure, userid) }));
					if (eventId === 'kubfuscroll') {
						beginCoopScroll(runs.map(entry => ({ ...entry, account: this.engine.store.get(entry.userid) })),
							this.engine.content!, randomInt, choice);
						adventure.node!.event = structuredClone(runs[0].run.node!.event!);
					}
					if (eventId === 'lostescort') {
						beginCoopEscort(runs.map(entry => ({ ...entry, account: this.engine.store.get(entry.userid) })),
							this.engine.content!, randomInt, choice);
						adventure.node = structuredClone(runs[0].run.node);
						eventBattle = adventure.node!.event!.stage === 'battle';
					}
					if (COOP_GRENINJA_EVENTS.has(eventId)) {
						chooseCoopGreninja(runs.map(entry => ({ ...entry, account: this.engine.store.get(entry.userid),
							changeAccount: update => { this.engine.store.change(entry.userid, update); },
						})), this.engine.content!, randomInt, choice);
					}
					if (COOP_HONEYMOON_EVENTS.has(eventId)) {
						chooseCoopHoneymoon(runs.map(entry => ({ ...entry,
							changeAccount: update => { this.engine.store.change(entry.userid, update); },
						})), this.engine.content!, randomInt, choice);
						adventure.node = structuredClone(runs[0].run.node);
						eventBattle = adventure.node!.event!.stage === 'battle';
					}
					if (COOP_ADVENTURE_EVENTS.has(eventId)) {
						chooseCoopAdventure(runs.map(entry => ({ ...entry, account: this.engine.store.get(entry.userid),
							changeAccount: update => { this.engine.store.change(entry.userid, update); },
						})), this.engine.content!, randomInt, choice);
						adventure.node = structuredClone(runs[0].run.node);
						eventBattle = adventure.node!.event!.stage === 'battle';
					}
					if (COOP_ACTIVITY_EVENTS.has(eventId)) {
						settleCoopActivity(runs.map(entry => ({ ...entry, account: this.engine.store.get(entry.userid),
							changeAccount: update => { this.engine.store.change(entry.userid, update); },
						})), this.engine.content!, randomInt, choice);
						adventure.node!.event = structuredClone(runs[0].run.node!.event!);
					}
					if (COOP_EXPEDITION_SERVICES.has(eventId)) {
						settleCoopExpedition(runs.map(entry => ({ ...entry, account: this.engine.store.get(entry.userid),
							changeAccount: update => { this.engine.store.change(entry.userid, update); },
						})), this.engine.content!, randomInt, choice);
						adventure.node!.event = structuredClone(runs[0].run.node!.event!);
					}
					if (COOP_EVOLUTION_EVENTS.has(eventId)) {
						beginCoopEvolution(runs.map(entry => ({ ...entry, account: this.engine.store.get(entry.userid) })),
							this.engine.content!, randomInt, choice);
						if (eventId === 'evolutiondojo') {
							adventure.node = structuredClone(runs[0].run.node);
							eventBattle = adventure.node!.event!.stage === 'battle';
						}
					}
					if (COOP_RHYTHM_EVENTS.has(eventId)) {
						rhythmPersonal = chooseCoopRhythm(runs.map(entry => ({ ...entry, account: this.engine.store.get(entry.userid) })),
							this.engine.content!, randomInt, choice);
						adventure.node!.event = structuredClone(runs[0].run.node!.event!);
					}
					if (COOP_COLLECTION_EVENTS.has(eventId)) {
						settleCoopCollection(runs.map(entry => ({ ...entry, account: this.engine.store.get(entry.userid) })),
							this.engine.content!, randomInt, choice);
						adventure.node!.event = structuredClone(runs[0].run.node!.event!);
					}
					if (eventId === 'mushroomcollector') {
						settleCollector(runs.map(entry => ({ ...entry, account: this.engine.store.get(entry.userid) })),
							this.engine.content!, randomInt, choice);
					}
					if (eventId === 'auction') {
						const purchase = settleCoopAuction(runs.map(entry => ({ ...entry,
							account: this.engine.store.get(entry.userid) })), adventure.coopAuction!, this.engine.content!, randomInt, choice);
						const buyerRun = runs.find(entry => entry.userid === purchase.owner)!.run;
						if (purchase.spent > 0) {
							for (const [userid, update] of this.shoppingAccountUpdates(purchase.owner, buyerRun, purchase.spent) || []) {
								accountUpdates.set(userid, update);
							}
						}
						adventure.node!.event = structuredClone(runs[0].run.node!.event!);
					}
					const travelGift = eventId === 'travel' && choice === 'path' ?
						sharedTravelGift(runs.map(({ run }) => run), this.engine.content!, randomInt) : undefined;
					const sharedLuck = isLuckEvent(eventId) && choice !== 'leave' ?
						rollLuck((runs.find(({ run }) => ownsBlessing(run.blessings, 'dice')) || runs[0]).run,
							eventId, randomInt) : undefined;
					for (const { userid, run } of runs) {
						if (COOP_COLLECTION_EVENTS.has(eventId) || COOP_ACTIVITY_EVENTS.has(eventId) || COOP_ADVENTURE_EVENTS.has(eventId) ||
							COOP_HONEYMOON_EVENTS.has(eventId) ||
							COOP_GRENINJA_EVENTS.has(eventId) || eventId === 'lostescort' || eventId === 'kubfuscroll' ||
							COOP_EXPEDITION_SERVICES.has(eventId) || COOP_EVOLUTION_EVENTS.has(eventId) || COOP_RHYTHM_EVENTS.has(eventId) ||
							eventId === 'mushroomcollector' || eventId === 'auction') {
							// Shared progress and the appropriate personal rewards were resolved once above.
						} else if (eventId === 'mushrooms' || eventId === 'room' || eventId === 'mysteryball' || eventId === 'fantasytutor' ||
							eventId === 'forest' || eventId === 'coverageworkshop' || isLuckEvent(eventId)) {
							if (sharedOutcome) run.node!.event!.mushroomOutcome = structuredClone(sharedOutcome);
							if (roomSleep) run.node!.event!.roomSleepOutcome = structuredClone(roomSleep);
							if (sharedLuck) run.node!.event!.luck = structuredClone(sharedLuck);
							if (mysteryBall) run.node!.event!.mysteryBallOutcome = structuredClone(mysteryBall);
							if (forest) run.node!.event!.forestOutcome = structuredClone(forest);
							const apply = (account: RogueAccount) => chooseEventOption(account, run, this.engine.content!,
								max => randomInt(max), run.node!.event!.key, choice);
							if (mysteryBall?.kind === 'gift') this.engine.store.change(userid, apply);
							else apply(this.engine.store.get(userid));
						} else {
							if (travelGift) prepareTravelGift(run, travelGift);
							chooseServiceOption(this.engine.store.get(userid), run, this.engine.content!,
								max => randomInt(max), choice);
						}
						this.applyCoopEventRun(adventure, userid, run);
						if (eventBattle && userid === session.hostUser) {
							adventure.node = run.node;
							adventure.members[session.guestUser].coopEvent = structuredClone(run.node!.event!);
							adventure.encounter = 0;
							adventure.phase = 'battle-selection';
							clearBattleSelections(session);
							delete adventure.battleResult;
							delete adventure.battleToken;
							delete adventure.encounterId;
							if (this.engine.content?.blessings) {
								const battleRun = this.blessingRun(adventure, session.hostUser);
								battleRun.spiritVersion = 1;
								prepareSpiritNode(battleRun, adventure.node!, this.engine.content, randomInt);
								prepareBlessingEncounter(battleRun, max => randomInt(max));
								this.saveBlessingRun(adventure, session.hostUser, battleRun);
							}
							if (this.engine.content?.wildTreasures && eventId !== 'travel') {
								prepareEconomy(adventure.node!, adventure.floor, randomInt, adventure.difficulty);
							}
						}
					}
					adventure.coopEventBranchResolved = true;
					const sharedStep = eventId === 'auction' || COOP_COLLECTION_EVENTS.has(eventId) || COOP_ADVENTURE_EVENTS.has(eventId) ||
						COOP_ACTIVITY_EVENTS.has(eventId) || COOP_EXPEDITION_SERVICES.has(eventId) ||
						COOP_RHYTHM_EVENTS.has(eventId) && !rhythmPersonal;
					if (['watch', 'fragments'].includes(adventure.members[session.hostUser].coopEvent!.stage) ||
						sharedTravelStep(adventure.members[session.hostUser].coopEvent!) ||
						sharedStep && !eventBattle && !adventure.members[session.hostUser].coopEvent!.settled) {
						adventure.coopEventBranchResolved = false;
						adventure.coopEventChoices = { [session.hostUser]: null, [session.guestUser]: null };
					}
					adventure.routeExitSelections = {};
					if (this.blessingFollowupsPending(adventure)) {
						adventure.coopBlessingResume = 'event';
						adventure.phase = 'blessing-reward';
					}
				}
			}
		} else {
			const owner = this.delegatedOwner(user, session, targetUser);
			const run = this.eventRun(adventure, owner);
			const fantasyTutor = run.node!.event!.id === 'fantasytutor';
			const evolutionScene = COOP_EVOLUTION_EVENTS.has(run.node!.event!.id);
			const greninja = COOP_GRENINJA_EVENTS.has(run.node!.event!.id);
			const rhythm = COOP_RHYTHM_EVENTS.has(run.node!.event!.id);
			const scroll = run.node!.event!.id === 'kubfuscroll';
			const view = (scroll ? coopScrollView(run) : rhythm ? coopRhythmView(run) :
				evolutionScene ? coopEvolutionView(run) : fantasyTutor || greninja ?
					eventView(run) : serviceEventView(run)) as CoopEventView | undefined;
			const options = [...(view?.options || []), ...(view?.picker?.options || [])];
			const option = options.find(entry => entry.id === choice && !entry.disabled);
			requireRule(!cancel && option, '这个个人目标或训练选项已变化，请刷新后重选。');
			if (choice!.startsWith('move:')) learnedMove = choice!.slice(5);
			if (scroll) {
				chooseCoopScroll({ userid: owner, run, account: this.engine.store.get(owner) },
					this.engine.content!, randomInt, choice!);
			} else if (rhythm) {
				chooseCoopRhythmPersonal({ run, account: this.engine.store.get(owner) }, this.engine.content!, randomInt, choice!);
			} else if (fantasyTutor || evolutionScene || greninja) {
				if (choice!.startsWith('fantasymove:')) learnedMove = choice!.slice(12);
				chooseEventOption(this.engine.store.get(owner), run, this.engine.content!,
					max => randomInt(max), run.node!.event!.key, choice);
			} else if (run.node!.event!.id === 'travel') {
				this.engine.store.change(owner, account => {
					chooseServiceOption(account, run, this.engine.content!, randomInt, choice!, evs);
					if (choice === 'confirm') {
						const mon = run.team.find(entry => entry.id === run.node!.event!.exchange?.member);
						if (mon) recordStarterMoves(account, this.engine.content!, mon.set, run);
					}
				});
			} else {
				chooseServiceOption(this.engine.store.get(owner), run, this.engine.content!,
					max => randomInt(max), choice!, evs);
			}
			this.applyCoopEventRun(adventure, owner, run);
			if (scroll) {
				const entries = [session.hostUser, session.guestUser].map(userid => ({
					userid, run: this.eventRun(adventure, userid), account: this.engine.store.get(userid),
				}));
				if (readyCoopScroll(entries, this.engine.content!, randomInt)) {
					for (const entry of entries) this.applyCoopEventRun(adventure, entry.userid, entry.run);
					adventure.node = structuredClone(entries[0].run.node);
					adventure.encounter = 0; adventure.phase = 'battle-selection';
					clearBattleSelections(session);
					delete adventure.battleResult; delete adventure.battleToken; delete adventure.encounterId;
					if (this.engine.content?.blessings) {
						const battleRun = this.blessingRun(adventure, session.hostUser);
						battleRun.spiritVersion = 1;
						prepareSpiritNode(battleRun, adventure.node!, this.engine.content, randomInt);
						prepareBlessingEncounter(battleRun, randomInt);
						this.saveBlessingRun(adventure, session.hostUser, battleRun);
					}
				}
			}
			if (rhythm) {
				const prepared = [session.hostUser, session.guestUser]
					.map(userid => ({ userid, run: this.eventRun(adventure, userid) }));
				if (readyCoopRhythm(prepared.map(entry => entry.run))) {
					for (const entry of prepared) this.applyCoopEventRun(adventure, entry.userid, entry.run);
					adventure.node!.event = structuredClone(prepared[0].run.node!.event!);
					adventure.coopEventBranchResolved = false;
					adventure.coopEventChoices = { [session.hostUser]: null, [session.guestUser]: null };
				}
			}
			if (adventure.routeExitSelections) delete adventure.routeExitSelections[owner];
			if (this.blessingFollowupsPending(adventure)) {
				adventure.coopBlessingResume = 'event';
				adventure.phase = 'blessing-reward';
			}
		}
		session.revision++;
		session.updatedAt = Date.now();
		if (learnedMove) {
			const owner = this.delegatedOwner(user, session, targetUser);
			const targetId = adventure.members[owner].coopEvent?.service?.member;
			const mon = adventure.members[owner].team.find(member => member.id === targetId);
			if (mon) accountUpdates.set(owner, account => recordStarterMoves(account, this.engine.content!,
				{ ...mon.set, moves: [learnedMove] }, { difficulty: adventure.difficulty }));
		}
		this.engine.store.updateCoopSession(session, expectedRevision, accountUpdates);
		return session;
	}
	private chooseCoopBlessing(user: User, command: RogueCoopCommand) {
		return this.commitProgress(user, 'blessingChoice', () => this.chooseCoopBlessingResult(user, command));
	}
	private chooseCoopBlessingResult(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure?.phase === 'blessing-selection' &&
			session.adventure.coopBlessingRound && this.engine.content?.blessings,
		'当前没有待共同确认的祝福。');
		const adventure = session.adventure, round = adventure.coopBlessingRound!;
		const partnerId = session.hostUser === user.id ? session.guestUser : session.hostUser;
		const expectedRevision = session.revision;
		adventure.coopBlessingChoices ||= { [session.hostUser]: null, [session.guestUser]: null };
		const delegated = session.delegatedTo === user.id;
		if (command.value === 'cancel') {
			adventure.coopBlessingChoices[user.id] = null;
			if (delegated) adventure.coopBlessingChoices[partnerId] = null;
		} else {
			const mode = command.mode || 'choose';
			const slot = command.slot ?? Number(command.value);
			let vote: string;
			if (mode === 'quality') {
				const runs = [session.hostUser, session.guestUser].map(owner => this.blessingRun(adventure, owner));
				requireRule(runs.every(run => !run.blessings!.qualityRerolled) && round.remaining > 0 &&
					!round.options.some(option => option.chosen), '本局更换品阶的机会已使用，或本轮已有领取。');
				vote = 'quality';
			} else {
				requireRule(Number.isInteger(slot) && slot >= 0 && slot < round.options.length && !round.options[slot].chosen,
					'祝福选项已变化，请刷新后重选。');
				if (mode === 'refresh') {
					requireRule(round.remaining > 0 && round.options[slot].refreshes > 0,
						'这个祝福位置不能刷新。');
					vote = `refresh:${slot}`;
				} else {
					requireRule(mode === 'choose', '祝福操作无效。');
					const candidateIds = new Set(this.commonBlessingCandidates(adventure, session).map(candidate => candidate.id));
					requireRule(candidateIds.has(round.options[slot].id), '该祝福已不再同时适用于双方，请刷新共同选项。');
					vote = `choose:${slot}`;
				}
			}
			adventure.coopBlessingChoices[user.id] = vote;
			if (delegated) adventure.coopBlessingChoices[partnerId] = vote;
			if (adventure.coopBlessingChoices[partnerId] === vote) {
				const candidates = this.commonBlessingCandidates(adventure, session);
				let nextRound: BlessingRound | undefined;
				if (mode === 'refresh') {
					nextRound = refreshBlessingOption(round, slot, candidates, max => randomInt(max));
					for (const owner of [session.hostUser, session.guestUser]) {
						const run = this.blessingRun(adventure, owner);
						run.blessings!.round = structuredClone(nextRound);
						this.saveBlessingRun(adventure, owner, run);
					}
				} else if (mode === 'quality') {
					const runs = [session.hostUser, session.guestUser].map(owner => this.blessingRun(adventure, owner));
					const firstPrayer = runs[0].blessings!.prayer, secondPrayer = runs[1].blessings!.prayer;
					const samePrayer = firstPrayer?.floor === secondPrayer?.floor;
					const prayerChanged = !!(firstPrayer?.changed || secondPrayer?.changed || !firstPrayer || !secondPrayer || !samePrayer);
					const killlaReady = runs.every(run => !!run.blessings!.owned.find(entry => entry.family === 'godrobe') &&
						!!run.blessings!.owned.find(entry => entry.family === 'puregodrobe') && round.floor >= 150 &&
						!run.blessings!.owned.find(entry => entry.family === 'killlagirl'));
					nextRound = rerollBlessingQuality(round, { floor: round.floor,
						prayerFloor: samePrayer ? firstPrayer?.floor : undefined, prayerPartyChanged: prayerChanged,
						killlaReady: killlaReady ? true : undefined }, candidates, max => randomInt(max));
					for (const owner of [session.hostUser, session.guestUser]) {
						const run = this.blessingRun(adventure, owner);
						run.blessings!.round = structuredClone(nextRound);
						run.blessings!.qualityRerolled = true;
						this.saveBlessingRun(adventure, owner, run);
					}
				} else {
					const slotIndex = Number(vote.slice('choose:'.length));
					nextRound = chooseBlessingOption(round, slotIndex);
					for (const owner of [session.hostUser, session.guestUser]) {
						const run = this.blessingRun(adventure, owner);
						run.blessings!.round = structuredClone(round);
						this.applyCoopBlessingCommand(owner, adventure, run, { action: 'blessing', slot: slotIndex });
					}
				}
				requireRule(nextRound, '共同祝福选项没有生成。');
				adventure.coopBlessingRound = structuredClone(nextRound);
				if (mode === 'choose' && this.blessingFollowupsPending(adventure)) {
					adventure.phase = 'blessing-reward';
				} else if (nextRound.remaining > 0) {
					adventure.coopBlessingChoices = { [session.hostUser]: null, [session.guestUser]: null };
					adventure.phase = 'blessing-selection';
				} else {
					if (mode === 'choose' && this.blessingFollowupsPending(adventure)) adventure.phase = 'blessing-reward';
					else this.advanceCoopAfterBlessings(session, adventure);
				}
			}
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		return session;
	}
	private chooseCoopBlessingReward(user: User, command: RogueCoopCommand) {
		return this.commitProgress(user, 'blessingReward', () => this.chooseCoopBlessingRewardResult(user, command));
	}
	private migrateUnityChoices(user: User) {
		const session = this.engine.store.coopSessionForUser(user.id);
		if (!this.engine.content?.blessings || !session?.adventure || !['active', 'paused'].includes(session.status) ||
			!Object.values(session.adventure.members).some(member => member.blessings?.pending.some(r => r.kind === 'unity'))
		) return;
		this.commitProgress(user, 'blessingReward', () => {
			const adventure = session.adventure!;
			for (const userid of [session.hostUser, session.guestUser]) this.blessingRun(adventure, userid);
			if (adventure.phase === 'blessing-reward') this.finishCoopBlessingRewards(session, adventure);
			session.revision++;
			session.updatedAt = Date.now();
			this.engine.store.updateCoopSession(session, session.revision - 1);
			return session;
		});
	}
	private chooseCoopBlessingRewardResult(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure?.phase === 'blessing-reward' &&
			this.engine.content?.blessings, '当前没有待处理的个人祝福效果。');
		const adventure = session.adventure;
		const owner = this.delegatedOwner(user, session, command.owner);
		const run = this.blessingRun(adventure, owner);
		const action = run.blessings?.stage ? 'blessing' : 'blessingreward';
		requireRule(action === 'blessing' ?
			typeof command.value === 'string' && run.blessings!.stage!.options.includes(command.value) :
			typeof command.member === 'string' && run.blessings?.pending[0]?.id === command.member,
		'个人祝福步骤已变化，请刷新后重选。');
		this.applyCoopBlessingCommand(owner, adventure, run, { action, member: command.member,
			value: command.value, slot: command.slot, evs: command.evs, confirmed: command.confirmed });
		this.finishCoopBlessingRewards(session, adventure);
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, session.revision - 1);
		return session;
	}
	private finishCoopBlessingRewards(session: RogueCoopSession, adventure: NonNullable<RogueCoopSession['adventure']>) {
		if (this.memberBlessingsSettled(adventure)) {
			if (adventure.coopBlessingRound?.remaining) {
				adventure.coopBlessingChoices = { [session.hostUser]: null, [session.guestUser]: null };
				adventure.phase = 'blessing-selection';
			} else if (adventure.coopBlessingRound?.remaining === 0) {
				this.advanceCoopAfterBlessings(session, adventure);
			} else if (adventure.coopBlessingResume === 'battle') {
				this.advanceCoopAfterBlessings(session, adventure);
			} else if (!adventure.coopBlessingRound && [50, 100, 150].includes(adventure.floor)) {
				this.prepareCoopBlessingRound(adventure, session, adventure.floor as 50 | 100 | 150, 'advance');
			} else if (adventure.coopBlessingResume) {
				this.advanceCoopAfterBlessings(session, adventure);
			} else {
				adventure.phase = 'settlement';
			}
		}
	}
	private healRest(user: User, targetUser?: string) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure?.phase === 'route-interaction' &&
			session.adventure.node?.kind === 'rest', '只能在共同休整中心治疗。');
		const adventure = session.adventure;
		const owner = this.delegatedOwner(user, session, targetUser);
		const member = adventure.members[owner];
		const care = centerCare({ team: member.team, floor: adventure.floor, spirit: undefined });
		requireRule(care.needed, '你的队伍状态良好，无需治疗。');
		requireRule(member.money >= care.cost, `治疗需要 ${care.cost} 金币，余额不足。`);
		const reservedTradeFee = adventure.tradeProposal?.fromUser === owner ? adventure.tradeProposal.fee : 0;
		requireRule(member.money - care.cost >= reservedTradeFee,
			`请保留 ${reservedTradeFee} 金币处理交换，或先撤回交换请求。`);
		const expectedRevision = session.revision;
		member.money -= care.cost;
		for (const mon of member.team) restoreMember(mon);
		member.notices = [`宝可梦中心已恢复你的队伍，支付 ${care.cost} 金币。`];
		if (adventure.routeExitSelections) delete adventure.routeExitSelections[owner];
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		return session;
	}
	private finishRest(user: User) {
		return this.commitProgress(user, 'routeExit', () => this.finishRestResult(user));
	}
	private finishRestResult(user: User) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure?.phase === 'route-interaction' &&
			['rest', 'reward', 'trade', 'event'].includes(session.adventure.node?.kind || ''), '当前没有可共同离开的路线。');
		const adventure = session.adventure;
		requireRule(!isCoopMasterBallRoute(adventure.node), '请共同完成馈赠选择；随后仍可选择本层路线。');
		requireRule(!adventure.node?.challenge, '请通过挑战的共同选项领取奖励或离开。');
		requireRule(!adventure.tradeProposal, '请先接受、拒绝或撤回队伍交换请求，再离开休整中心。');
		requireRule(!Object.values(adventure.members).some(member => member.pendingMoves?.length),
			'请双方先处理待学习招式，再继续共同旅程。');
		if (adventure.node?.kind === 'event' || collectorRoute(adventure.node) || auctionRoute(adventure.node)) {
			requireRule(adventure.coopEventBranchResolved &&
				[session.hostUser, session.guestUser].every(userid => adventure.members[userid].coopEvent?.settled),
			'请先完成双方的目标步骤，或选择跳过，再共同离开事件。');
		}
		const expectedRevision = session.revision;
		adventure.routeExitSelections ||= {};
		const partnerId = session.hostUser === user.id ? session.guestUser : session.hostUser;
		adventure.routeExitSelections[user.id] = true;
		if (session.delegatedTo === user.id) adventure.routeExitSelections[partnerId] = true;
		const bothReady = [session.hostUser, session.guestUser].every(userid => adventure.routeExitSelections![userid]);
		if (bothReady) {
			if (adventure.node?.kind === 'event' || collectorRoute(adventure.node) || auctionRoute(adventure.node)) {
				adventure.node!.event = structuredClone(adventure.members[session.hostUser].coopEvent!);
			}
			for (const userid of [session.hostUser, session.guestUser]) delete adventure.members[userid].coopEvent;
			delete adventure.coopEventChoices;
			delete adventure.coopEventBranchResolved;
			delete adventure.coopAuction;
			this.completeCoopFloor(session, adventure);
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		return session;
	}
	private shoppingAccountUpdates(owner: string, run: RogueRun, spent: number) {
		const rewards = run.shoppingSpend?.rewards || 0;
		recordShoppingSpend(run, spent);
		if ((run.shoppingSpend?.rewards || 0) === rewards) return;
		syncBlessingParty(run); syncGrowthParty(run); syncExclusiveItems(run);
		return new Map<string, (account: RogueAccount) => void>([[owner, account => {
			for (const mon of run.team.filter(entry => !entry.egg)) {
				recordStarterMoves(account, this.engine.content!, mon.set, run);
			}
		}]]);
	}
	private buyCamp(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure, '当前没有进行中的共同冒险。');
		const adventure = session.adventure, owner = this.delegatedOwner(user, session, command.owner);
		const member = adventure.members[owner];
		requireRule(typeof command.id === 'string' && command.id.length >= 8 && command.id.length <= 80, '训练请求标识无效。');
		if (member.purchaseReceipts?.includes(command.id)) return session;
		const quote = this.campView(adventure, owner);
		requireRule(quote && quote.visit === command.visit, '训练营已变化，请刷新并重新安排训练。');
		requireRule(!quote.locked, quote.locked || '请先完成队伍的待处理步骤。');
		const expectedRevision = session.revision, { run, visit } = this.campRun(adventure, owner);
		const moneyBefore = run.money;
		buyGrowth(run, { id: command.id, revision: 0, action: 'buygrowth', value: command.value,
			trainingMembers: command.trainingMembers, trainingStats: command.trainingStats });
		const accountUpdates = this.shoppingAccountUpdates(owner, run, moneyBefore - run.money);
		this.saveBlessingRun(adventure, owner, run);
		(member.campVisits ||= []).push(visit);
		(member.purchaseReceipts ||= []).push(command.id);
		if (member.purchaseReceipts.length > 256) member.purchaseReceipts.shift();
		if (member.campVisits.length > 256) member.campVisits.shift();
		if (adventure.routeExitSelections) delete adventure.routeExitSelections[owner];
		session.revision++; session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision, accountUpdates);
		Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser)?.send(
			`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, shopPurchase: true })}`);
		return session;
	}
	private buyRest(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure?.phase === 'route-interaction' &&
			['rest', 'trade'].includes(session.adventure.node?.kind || ''), '只能在已开放的休整／交易路线购买。');
		requireRule(typeof command.id === 'string' && command.id.length >= 8 && command.id.length <= 80,
			'购买请求标识无效。');
		const adventure = session.adventure;
		const owner = this.delegatedOwner(user, session, command.owner);
		const member = adventure.members[owner];
		if (member.purchaseReceipts?.includes(command.id)) return session;
		requireRule(!member.pendingMoves?.length, '请先处理自己队伍的待学习招式，再继续购买。');
		const count = command.count ?? 1;
		requireRule(Number.isSafeInteger(count) && count > 0 && count <= 999, '购买数量须为 1～999 的整数。');
		const itemId = toID(command.value || '');
		const item = this.engine.content && shopStock(this.engine.content,
			this.memberShopContext(adventure, member)).find(entry => entry.id === itemId);
		requireRule(item, '该商品当前没有在休整商店出售。');
		requireRule(item.remaining === undefined || item.remaining >= count, '本人的休整商店库存不足。');
		const sharedStock = adventure.node?.kind === 'trade' && item.remaining !== undefined ?
			adventure.node.trade?.stock.find(entry => entry.id === item.id) : undefined;
		requireRule(!sharedStock || sharedStock.remaining >= count, '该商品库存已被队友买完，请刷新后重选。');
		const cost = item.price * count;
		requireRule(Number.isSafeInteger(cost) && cost >= 0 && member.money >= cost, '你的金币余额不足。');
		const reservedTradeFee = adventure.tradeProposal?.fromUser === owner ? adventure.tradeProposal.fee : 0;
		requireRule(member.money - cost >= reservedTradeFee,
			`请保留 ${reservedTradeFee} 金币处理交换，或先撤回交换请求。`);
		const expectedRevision = session.revision;
		member.money -= cost;
		member.bag[item.id] = (member.bag[item.id] || 0) + count;
		if (sharedStock) sharedStock.remaining -= count;
		if (item.kind === 'candy' && item.remaining !== undefined) {
			member.restCandyPurchases ||= {};
			member.restCandyPurchases[item.id] = (member.restCandyPurchases[item.id] || 0) + count;
		}
		member.purchaseReceipts ||= [];
		member.purchaseReceipts.push(command.id);
		if (member.purchaseReceipts.length > 256) member.purchaseReceipts.splice(0, member.purchaseReceipts.length - 256);
		member.notices = [`购买 ${item.name} ×${count}，支付 ${cost} 金币。`];
		const run = this.previewBlessingRun(adventure, owner);
		run.phase = 'rest';
		const accountUpdates = this.shoppingAccountUpdates(owner, run, cost);
		this.saveBlessingRun(adventure, owner, run);
		if (adventure.routeExitSelections) delete adventure.routeExitSelections[owner];
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision, accountUpdates);
		const partnerId = session.hostUser === user.id ? session.guestUser : session.hostUser;
		Users.get(partnerId)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
			session: session.id, shopPurchase: true,
		})}`);
		return session;
	}
	private sellItems(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure, '当前没有可回收物品的共同冒险。');
		const adventure = session.adventure, owner = this.delegatedOwner(user, session, command.owner);
		const member = adventure.members[owner];
		requireRule(typeof command.id === 'string' && command.id.length >= 8 && command.id.length <= 80, '回收请求标识无效。');
		if (member.purchaseReceipts?.includes(command.id)) return session;
		const quote = this.recycleView(adventure, owner);
		requireRule(quote && quote.quote === command.quote, '回收报价或背包已变化，请重新确认。');
		requireRule(!quote.locked, quote.locked || '请先完成队伍的待处理步骤。');
		requireRule(command.confirmed === true, '请先确认回收物品和所得金币。');
		const all = command.value === 'all';
		requireRule(!all || command.count === undefined, '全部回收不接受单项数量。');
		const selected = quote.items.filter(item => all || item.id === command.value);
		requireRule(selected.length > 0, '没有可兑换的物品。');
		const expectedRevision = session.revision, run = this.previewBlessingRun(adventure, owner);
		run.phase = 'rest';
		const moneyBefore = run.money;
		// Only the displayed, positively priced items belong to an "all" confirmation.
		for (const item of selected) recycleItems(run, this.engine.content!, item.id, command.count);
		member.money = run.money; member.bag = run.bag;
		member.notices = [`物品回收完成，获得 ${run.money - moneyBefore} 金币。`];
		(member.purchaseReceipts ||= []).push(command.id);
		if (member.purchaseReceipts.length > 256) member.purchaseReceipts.shift();
		if (adventure.routeExitSelections) delete adventure.routeExitSelections[owner];
		session.revision++; session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser)?.send(
			`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, recycling: true })}`);
		return session;
	}
	private proposeTrade(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure?.phase === 'route-interaction' &&
			session.adventure.node?.kind === 'rest', '只能在共同休整中心发起队伍交换。');
		const adventure = session.adventure;
		requireRule(!adventure.tradeProposal, '已有一项队伍交换等待处理。');
		const owner = this.delegatedOwner(user, session, command.owner);
		const partnerId = session.hostUser === owner ? session.guestUser : session.hostUser;
		const member = adventure.members[owner], partner = adventure.members[partnerId];
		const fromMember = member.team.find(mon => mon.id === command.member);
		const toMember = partner.team.find(mon => mon.id === command.partnerMember);
		requireRule(fromMember && toMember, '请选择双方当前队伍中的宝可梦。');
		requireRule(canReceiveEgg(member.team, fromMember, toMember) && canReceiveEgg(partner.team, toMember, fromMember),
			'交换后双方都需要保留至少一只已孵化、未永久死亡的伙伴。');
		requireRule(member.money >= ROGUE_LINKING_CORD_PRICE,
			`发起交换需要 ${ROGUE_LINKING_CORD_PRICE} 金币，余额不足。`);
		const expectedRevision = session.revision;
		adventure.tradeProposal = {
			id: randomUUID(), fromUser: owner, fromMember: fromMember.id, toMember: toMember.id,
			fee: ROGUE_LINKING_CORD_PRICE, createdAt: Date.now(),
		};
		adventure.routeExitSelections = {};
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		Users.get(partnerId)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
			session: session.id, tradeProposal: true,
		})}`);
		return session;
	}
	private cancelTrade(user: User, id: string, targetUser?: string) {
		const session = this.engine.store.coopSessionForUser(user.id);
		const proposal = session?.adventure?.tradeProposal;
		const owner = session ? this.delegatedOwner(user, session, targetUser) : user.id;
		requireRule(session?.status === 'active' && session.adventure?.phase === 'route-interaction' &&
			session.adventure.node?.kind === 'rest' && proposal?.id === id && proposal.fromUser === owner,
		'当前没有你发起、可撤回的交换请求。');
		const expectedRevision = session.revision;
		delete session.adventure.tradeProposal;
		session.adventure.members[owner].notices = ['你已撤回队伍交换请求。'];
		const partnerId = session.hostUser === owner ? session.guestUser : session.hostUser;
		session.adventure.members[partnerId].notices = ['队友已撤回队伍交换请求。'];
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		Users.get(partnerId)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
			session: session.id, tradeProposal: true,
		})}`);
		return session;
	}
	private safariTarget(session: RogueCoopSession) {
		const adventure = session.adventure;
		if (adventure?.phase !== 'route-interaction' || adventure.node?.event?.id !== 'safaripark' ||
			adventure.coopEventBranchResolved) return null;
		const target = coopSafariTarget([session.hostUser, session.guestUser].map(userid => this.eventRun(adventure, userid)));
		return target?.key === adventure.node.event.key ? target : null;
	}
	private settleSafariCapture(session: RogueCoopSession, owner: string) {
		const adventure = session.adventure!;
		const owners = [session.hostUser, session.guestUser];
		requireRule(owners.includes(owner) && this.safariTarget(session), '当前狩猎目标或捕捉者已经变化。');
		requireRule(!owners.some(userid => adventure.members[userid].pendingCaptures?.length ||
			adventure.members[userid].pendingMoves?.length) && !this.blessingFollowupsPending(adventure),
		'请先处理待接纳伙伴、招式或奖励，再进行狩猎。');
		const entries = owners.map(userid => ({ userid, run: this.eventRun(adventure, userid),
			account: this.engine.store.get(userid),
			changeAccount: (update: (account: RogueAccount) => void) => { this.engine.store.change(userid, update); },
		}));
		settleCoopSafari(entries, this.engine.content!, randomInt, 'ball', owners.indexOf(owner));
		for (const entry of entries) this.applyCoopEventRun(adventure, entry.userid, entry.run);
		adventure.node!.event = structuredClone(entries[0].run.node!.event!);
		adventure.coopEventBranchResolved = !!adventure.node!.event.settled;
		adventure.coopEventChoices = { [session.hostUser]: null, [session.guestUser]: null };
		adventure.routeExitSelections = {};
		delete adventure.captureProposal;
		if (this.blessingFollowupsPending(adventure)) {
			adventure.coopBlessingResume = 'event';
			adventure.phase = 'blessing-reward';
		}
	}
	private captureBallOptions(adventure: NonNullable<RogueCoopSession['adventure']>, userid: string) {
		if (adventure.phase === 'route-interaction' && adventure.node?.event?.id === 'safaripark') {
			const target = coopSafariTarget(Object.keys(adventure.members).map(owner => this.eventRun(adventure, owner)));
			return target && adventure.members[userid] ? [{ id: 'safariball', name: '共同狩猎用球', count: target.balls }] : [];
		}
		const content = this.engine.content;
		const member = adventure.members[userid];
		const encounter = adventure.node?.encounters[adventure.encounter ?? 0];
		if (!content || !member || !encounter) return [];
		return content.items.filter(item => item.kind === 'ball' &&
			(item.multiplier || item.id in (encounter.catchChances || {})) &&
			(item.id !== 'masterball' || !encounter.trainer && encounter.catchable) && (member.bag[item.id] || 0) > 0)
			.map(item => ({ id: item.id, name: item.name, count: member.bag[item.id] || 0 }));
	}
	private notifyCaptureProposal(session: RogueCoopSession) {
		for (const userid of [session.hostUser, session.guestUser]) {
			Users.get(userid)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
				session: session.id, captureProposal: true,
			})}`);
		}
	}
	private proposeCapture(user: User, ball: string, targetKey: string, targetUser?: string) {
		if (this.engine.store.coopSessionForUser(user.id)?.adventure?.node?.event?.id === 'safaripark') {
			return this.commitProgress(user, 'eventChoice', () => this.proposeSafariCapture(user, ball, targetKey, targetUser));
		}
		const session = this.engine.store.coopSessionForUser(user.id);
		const adventure = session?.adventure;
		const encounter = adventure?.node?.encounters[adventure.encounter];
		requireRule(session?.status === 'active' && adventure?.phase === 'battle' &&
			['wild', 'event'].includes(adventure.node?.kind || '') && !adventure.node?.challenge &&
			encounter?.catchable && !encounter.trainer && adventure.battleToken && session.roomid,
		'当前没有可共同捕捉的野生对战。');
		const owner = this.delegatedOwner(user, session, targetUser);
		if (adventure.captureProposal && adventure.captureProposal.expiresAt > Date.now()) {
			throw new Error('已有一项共同捕捉请求，请先处理或撤回。');
		}
		const ballId = toID(ball);
		requireRule(ballId, '请选择一种精灵球。');
		const battle = Rooms.get(session.roomid)?.battle;
		const target = battle?.getCoopCaptureTarget(targetKey);
		requireRule(target && battle?.canStartCoopCapture(owner, ballId, target.key, target.id),
			'当前出战阶段、目标或个人精灵球库存不允许发起捕捉。');
		if (session.delegatedTo === user.id) {
			battle!.beginCoopCapture(owner, ballId, target.key, target.id);
			return session;
		}
		const partnerId = session.hostUser === user.id ? session.guestUser : session.hostUser;
		const expectedRevision = session.revision;
		adventure.captureProposal = {
			id: randomUUID(), ownerUser: user.id, recipientUser: partnerId, ball: ballId,
			targetKey: target.key, targetId: target.id, targetName: target.name,
			state: 'requested', createdAt: Date.now(), expiresAt: Date.now() + 120_000,
		};
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		this.notifyCaptureProposal(session);
		return session;
	}
	private proposeSafariCapture(user: User, ball: string, targetKey: string, targetUser?: string) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure, '当前没有共同狩猎活动。');
		const adventure = session.adventure, target = this.safariTarget(session);
		requireRule(target?.key === targetKey && ball === 'safariball', '狩猎目标已变化，请刷新后重新发起捕捉。');
		requireRule(!adventure.captureProposal || adventure.captureProposal.expiresAt <= Date.now(),
			'已有一项共同捕捉请求，请先处理或撤回。');
		const owner = this.delegatedOwner(user, session, targetUser), expectedRevision = session.revision;
		if (session.delegatedTo === user.id) {
			this.settleSafariCapture(session, owner);
		} else {
			adventure.captureProposal = {
				context: 'safari', id: randomUUID(), ownerUser: owner,
				recipientUser: owner === session.hostUser ? session.guestUser : session.hostUser, ball,
				targetKey: target.key, targetId: target.id, targetName: target.name,
				state: 'requested', createdAt: Date.now(), expiresAt: Date.now() + 120_000,
			};
		}
		adventure.coopEventChoices = { [session.hostUser]: null, [session.guestUser]: null };
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		return session;
	}
	private cancelCapture(user: User, id: string) {
		const session = this.engine.store.coopSessionForUser(user.id);
		const proposal = session?.adventure?.captureProposal;
		const safari = proposal?.context === 'safari' && session?.adventure?.phase === 'route-interaction' &&
			session.adventure.node?.event?.id === 'safaripark';
		requireRule(session?.status === 'active' && session.adventure &&
			(session.adventure.phase === 'battle' || safari) && proposal?.id === id &&
			[proposal.ownerUser, proposal.recipientUser].includes(user.id), '当前没有可由你撤回的共同捕捉请求。');
		const expectedRevision = session.revision;
		delete session.adventure.captureProposal;
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		this.notifyCaptureProposal(session);
		return session;
	}
	private respondCapture(user: User, command: RogueCoopCommand) {
		if (this.engine.store.coopSessionForUser(user.id)?.adventure?.captureProposal?.context === 'safari') {
			return this.commitProgress(user, 'eventChoice', () => this.respondCaptureResult(user, command));
		}
		return this.respondCaptureResult(user, command);
	}
	private respondCaptureResult(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		const adventure = session?.adventure;
		const proposal = adventure?.captureProposal;
		const safari = session && proposal?.context === 'safari' ? this.safariTarget(session) : null;
		requireRule(session?.status === 'active' && adventure &&
			(safari || adventure.phase === 'battle' && !proposal?.context) && proposal &&
			proposal.id === command.id && proposal.expiresAt > Date.now(), '共同捕捉请求已撤回或过期。');
		if (safari) requireRule(proposal.targetKey === safari.key && proposal.targetId === safari.id &&
			proposal.ball === 'safariball', '狩猎目标已变化，请撤回后重新协商。');
		const expectedRevision = session.revision;
		const choice = command.value;
		const actingAs = session.delegatedTo === user.id ?
			(choice === 'accept' || choice === 'contest' ? proposal.recipientUser : proposal.ownerUser) : user.id;
		let capture: { ownerUser: string, ball: string, targetKey: string, targetId: string } | undefined;
		if (choice === 'accept' || choice === 'contest') {
			requireRule(actingAs === proposal.recipientUser && ['requested', 'returned'].includes(proposal.state),
				'当前没有等待你回应的捕捉请求。');
			if (choice === 'accept') capture = { ownerUser: proposal.ownerUser, ball: proposal.ball,
				targetKey: proposal.targetKey, targetId: proposal.targetId };
			else proposal.state = 'contested';
		} else if (choice === 'keep') {
			requireRule(actingAs === proposal.ownerUser && proposal.state === 'contested', '当前没有待你决定的捕捉争议。');
			proposal.state = 'returned';
		} else if (choice === 'give') {
			requireRule(actingAs === proposal.ownerUser && proposal.state === 'contested', '当前没有待你决定的捕捉争议。');
			const ball = toID(command.ball || '');
			requireRule(ball && this.captureBallOptions(adventure, proposal.recipientUser).some(option => option.id === ball),
				'队友背包中没有可用于这次捕捉的该类精灵球。');
			capture = { ownerUser: proposal.recipientUser, ball, targetKey: proposal.targetKey, targetId: proposal.targetId };
		} else {
			throw new Error('请选择同意、争取、保留或让出捕捉权。');
		}
		if (capture && safari) {
			this.settleSafariCapture(session, capture.ownerUser);
		} else if (capture) {
			const battle = session.roomid ? Rooms.get(session.roomid)?.battle : undefined;
			requireRule(battle?.canStartCoopCapture(capture.ownerUser, capture.ball, capture.targetKey, capture.targetId),
				'当前对战阶段、目标或捕捉者库存已经变化，请重新协商。');
			delete adventure.captureProposal;
		} else {
			proposal.expiresAt = Date.now() + 120_000;
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		if (capture && !safari) {
			const battle = session.roomid ? Rooms.get(session.roomid)?.battle : undefined;
			requireRule(battle, '共同战斗房间已经关闭，无法开始捕捉。');
			battle.beginCoopCapture(capture.ownerUser, capture.ball, capture.targetKey, capture.targetId);
		} else if (!safari) {
			this.notifyCaptureProposal(session);
		}
		return session;
	}
	private resolveTradeEvolution(adventure: NonNullable<RogueCoopSession['adventure']>, member: RogueCoopMemberState,
		pokemon: RogueCoopMemberState['team'][number]) {
		if (!this.engine.content?.progression || pokemon.egg || pokemon.fusion || pokemon.hp <= 0) return;
		const run = this.growthRun(adventure, member);
		// The shared swap fee equals one linking cord; expose that one cord only to the existing evolution validator.
		const quoteRun = { ...run, bag: { ...member.bag, linkingcord: (member.bag.linkingcord || 0) + 1 } };
		const option = evolutionOptions(pokemon, quoteRun).find(entry => entry.item === 'linkingcord');
		if (!option) return;
		evolveMember(run, pokemon, option.species);
		member.pendingMoves = run.pendingMoves;
		member.notices = run.notices;
	}
	private respondTrade(user: User, command: RogueCoopCommand) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'active' && session.adventure, '当前没有进行中的共同冒险。');
		const adventure = session.adventure;
		const owner = this.delegatedOwner(user, session, command.owner);
		requireRule(typeof command.id === 'string' && command.id.length >= 8 && command.id.length <= 80 &&
			typeof command.accept === 'boolean', '交换确认信息无效。');
		if (!adventure.tradeProposal && adventure.tradeReceipts?.includes(command.id)) return session;
		const proposal = adventure.tradeProposal;
		const partnerId = session.hostUser === owner ? session.guestUser : session.hostUser;
		requireRule(adventure.phase === 'route-interaction' && adventure.node?.kind === 'rest' &&
			proposal?.id === command.id && proposal.fromUser === partnerId,
		'这项交换请求已撤回、过期或不属于你。');
		const expectedRevision = session.revision;
		if (!command.accept) {
			delete adventure.tradeProposal;
			adventure.members[owner].notices = ['你拒绝了队友的队伍交换请求。'];
			adventure.members[partnerId].notices = ['队友拒绝了队伍交换请求。'];
			session.revision++;
			session.updatedAt = Date.now();
			this.engine.store.updateCoopSession(session, expectedRevision);
			Users.get(partnerId)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
				session: session.id, tradeProposal: true,
			})}`);
			return session;
		}
		const from = adventure.members[proposal.fromUser], to = adventure.members[owner];
		requireRule(from.money >= proposal.fee, `交换发起者需要 ${proposal.fee} 金币，余额不足。`);
		const fromIndex = from.team.findIndex(mon => mon.id === proposal.fromMember);
		const toIndex = to.team.findIndex(mon => mon.id === proposal.toMember);
		requireRule(fromIndex >= 0 && toIndex >= 0, '交换队伍已变化，请重新发起请求。');
		const offered = structuredClone(from.team[fromIndex]);
		const requested = structuredClone(to.team[toIndex]);
		requireRule(canReceiveEgg(from.team, offered, requested) && canReceiveEgg(to.team, requested, offered),
			'交换后双方都需要保留至少一只已孵化、未永久死亡的伙伴。');
		from.team[fromIndex] = requested;
		to.team[toIndex] = offered;
		const moveQueueFollows = (source: RogueCoopMemberState, destination: RogueCoopMemberState, memberId: string) => {
			const carried = (source.pendingMoves || []).filter(entry => entry.member === memberId);
			if (!carried.length) return;
			source.pendingMoves = (source.pendingMoves || []).filter(entry => entry.member !== memberId);
			destination.pendingMoves = [...(destination.pendingMoves || []), ...carried];
		};
		moveQueueFollows(to, from, requested.id);
		moveQueueFollows(from, to, offered.id);
		from.money -= proposal.fee;
		this.resolveTradeEvolution(adventure, from, requested);
		this.resolveTradeEvolution(adventure, to, offered);
		from.notices ||= [];
		to.notices ||= [];
		from.notices.push(`交换完成：收到 ${requested.egg ? '宝可梦蛋' : requested.set.species}，支付 ${proposal.fee} 金币。`);
		to.notices.push(`交换完成：收到 ${offered.egg ? '宝可梦蛋' : offered.set.species}；费用由队友支付。`);
		delete adventure.tradeProposal;
		adventure.tradeReceipts ||= [];
		adventure.tradeReceipts.push(proposal.id);
		if (adventure.tradeReceipts.length > 256) adventure.tradeReceipts.splice(0, adventure.tradeReceipts.length - 256);
		adventure.routeExitSelections = {};
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		const tradeCompleted = { id: proposal.id, offeredPokemon: coopMemberName(offered),
			requestedPokemon: coopMemberName(requested), fee: proposal.fee };
		for (const userid of [session.hostUser, session.guestUser]) {
			Users.get(userid)?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({
				session: session.id, tradeCompleted,
			})}`);
		}
		return session;
	}
	private selectStarters(user: User, ids: string[], suppliedBuilds?: Record<string, RogueStarterBuild>) {
		const session = this.engine.store.coopSessionForUser(user.id);
		requireRule(session?.status === 'lobby', '当前没有等待选初始队伍的联机大厅。');
		requireRule(Array.isArray(ids) && ids.length > 0 && ids.length <= 6 && ids.every(id => typeof id === 'string') &&
			new Set(ids).size === ids.length, '请选择不同的初始宝可梦。');
		const content = this.engine.content;
		requireRule(content, '幻想杯肉鸽初始队伍尚未配置。');
		const account = this.engine.store.get(user.id);
		const selected = ids.map(id => {
			const starter = content.starters.find(entry => entry.id === id);
			requireRule(starter && (starter.availableInitially || account.unlocked.includes(id)), '初始宝可梦尚未解锁。');
			return starter;
		});
		requireRule(selected.reduce((used, starter) => used + rogueStarterSlotCost(starter.set.species), 0) <= account.slots,
			'初始名额不足：普通伙伴占 1 格，传说宝可梦与幻之宝可梦占 4 格，一级神占 6 格。');
		requireRule(suppliedBuilds === undefined || (suppliedBuilds && typeof suppliedBuilds === 'object' &&
			!Array.isArray(suppliedBuilds) && Object.keys(suppliedBuilds).every(id => ids.includes(id))), '初始配置无效。');
		const builds: Record<string, RogueStarterBuild> = {};
		for (const starter of selected) {
			const id = starter.id;
			const source = suppliedBuilds?.[id];
			requireRule(source === undefined || (source && typeof source === 'object' && !Array.isArray(source)), '初始配置无效。');
			const build: Partial<RogueStarterBuild> = source || {};
			const traits = starterTraits(account, id);
			const species = Dex.mod('gen9fantasy').species.get(starter.set.species);
			const shiny = build.shiny ?? false;
			requireRule(typeof shiny === 'boolean' && (!shiny || traits.shiny), '请先捕捉该谱系的闪光宝可梦，才能选择闪光初始伙伴。');
			const nature = build.nature ?? 'random';
			requireRule(typeof nature === 'string' && (nature === 'random' || traits.natures.includes(toID(nature))), '这个性格尚未解锁。');
			const gender = build.gender ?? 'random';
			requireRule(gender === 'random' || (['M', 'F', 'N'].includes(gender) &&
				(traits.genders.includes(gender) || species.gender === 'N') && (!species.gender || gender === species.gender)),
			'这个性别尚未解锁或不适用于该物种。');
			const ability = build.ability ?? 'random';
			requireRule(typeof ability === 'string' && (ability === 'random' ||
				(traits.abilities.includes(toID(ability)) && Object.values(species.abilities)
					.some(value => toID(value) === toID(ability)))),
			'这个特性尚未解锁或不适用于该物种。');
			const ivs = build.ivs ?? traits.ivs.max;
			requireRule(ivs && typeof ivs === 'object' && !Array.isArray(ivs) &&
				ROGUE_STATS.every(stat => Number.isInteger(ivs[stat]) &&
					ivs[stat] >= traits.ivs.min[stat] && ivs[stat] <= traits.ivs.max[stat]),
			'个体值超出该伙伴已解锁的范围。');
			const moves = build.moves ?? starter.set.moves.map(toID);
			const availableMoves = starterMoves(account, content, id);
			requireRule(Array.isArray(moves) && moves.length >= 1 && moves.length <= 4 &&
				moves.every(move => typeof move === 'string' && availableMoves.includes(toID(move))) &&
				new Set(moves.map(toID)).size === moves.length, '请选择 1～4 个不重复、已解锁且初始形态可合法学习的招式。');
			builds[id] = { shiny, nature, gender, ability, ivs: { ...ivs }, moves: moves.map(toID) };
		}
		const expectedRevision = session.revision;
		session.starterSelections[user.id] = [...ids];
		session.starterBuildSelections ||= {};
		session.starterBuildSelections[user.id] = builds;
		if (session.starterSelections[session.hostUser] && session.starterSelections[session.guestUser]) {
			session.adventure = {
				id: randomUUID(), contentVersion: content.version, floor: 1, encounter: 0, phase: 'area-selection',
				difficulty: session.difficulty, doubleBattle: true, eventFragmentRuleVersion: 2,
				members: {
					[session.hostUser]: this.buildMemberState(session.hostUser, session.starterSelections[session.hostUser]!,
						session.starterBuildSelections[session.hostUser] || {}),
					[session.guestUser]: this.buildMemberState(session.guestUser, session.starterSelections[session.guestUser]!,
						session.starterBuildSelections[session.guestUser] || {}),
				},
			};
			this.prepareRouteChoices(session.adventure);
			session.status = 'active';
			if (content.blessings) this.prepareCoopBlessingRound(session.adventure, session, 1, 'opening');
		}
		session.revision++;
		session.updatedAt = Date.now();
		this.engine.store.updateCoopSession(session, expectedRevision);
		const other = Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser);
		other?.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, starters: true })}`);
		return session;
	}
	private requireUnlocked(userid: string, difficulty: RogueCoopDifficulty, message: string) {
		requireRule(difficulty <= this.accountDifficulty(userid), message);
	}
	command(user: User, command: RogueCoopCommand) {
		this.authorize(user);
		if (command.action === 'search' || command.action === 'refresh') {
			return this.view(user, command.action === 'search' ? command.target : '');
		}
		if (command.action === 'delegate') {
			this.setDelegation(user, command.value || '');
			return this.view(user);
		}
		this.assertActionControl(user, this.engine.store.coopSessionForUser(user.id), command.action);
		if (command.action === 'proposeexit') {
			this.proposeExit(user, command.value || '');
			return this.view(user);
		}
		if (command.action === 'respondexit') {
			this.respondExit(user, command.id || '', command.value || '');
			return this.view(user);
		}
		const exit = this.engine.store.coopSessionForUser(user.id)?.exitProposal;
		requireRule(!exit || !exit.confirmed && exit.expiresAt <= Date.now(), '请先同意或取消共同退出请求。');
		if (command.action === 'recoverroute') {
			this.recoverStoryRoute(user, command.id || '', command.accept !== false);
			return this.view(user);
		}
		const currentSession = this.engine.store.coopSessionForUser(user.id);
		requireRule(!currentSession || !this.coopAffectionScene(currentSession) ||
			['affection', 'leave', 'resume'].includes(command.action), '请先共同回应当前的同行对话。');
		if (command.action === 'affection') {
			this.chooseCoopAffection(user, command);
			return this.view(user);
		}
		if (['selectarea', 'selectbattle', 'previewbattle', 'preparebattle', 'continuebattle', 'retrybattle', 'finishroute',
			'eventchoice', 'challenge', 'blessingchoice', 'blessingreward', 'proposetrade', 'respondtrade'].includes(command.action)) {
			requireRule(!Object.values(currentSession?.adventure?.members || {}).some(member => member.pendingCaptures?.length),
				'请双方先安置满队时捕获的新伙伴，再继续共同旅程。');
			requireRule(!Object.values(currentSession?.adventure?.members || {})
				.some(member => member.companionInvitations?.length),
			'请双方先接受、替换或婉拒待处理的同行邀请。');
		}
		if (['selectbattle', 'previewbattle', 'preparebattle', 'eventchoice', 'blessingchoice', 'blessingreward']
			.includes(command.action)) {
			requireRule(!Object.values(currentSession?.adventure?.members || {}).some(member => member.pendingMoves?.length),
				'请双方先处理待学习招式，再继续共同旅程。');
		}
		requireRule(!currentSession || !this.storyRecoveryView(currentSession) ||
			['leave', 'resume', 'learn', 'blessingchoice', 'blessingreward'].includes(command.action),
		'联机冒险不进入秘闻，请先共同返回同层普通区域。');
		if (command.action === 'release' || command.action === 'replace') {
			this.releaseMember(user, command);
			return this.view(user);
		}
		if (['coverage', 'setmove', 'equip', 'equipemblem', 'configureuniversal'].includes(command.action)) {
			this.trainMemberMoves(user, command);
			return this.view(user);
		}
		if (['use', 'evolve', 'fantasize', 'forme'].includes(command.action)) {
			this.useMemberSupply(user, command);
			return this.view(user);
		}
		if (command.action === 'recoverbattle') {
			this.recoverBattle(user);
			return this.view(user);
		}
		if (command.action === 'selectbattle' || command.action === 'previewbattle') {
			this.selectBattle(user, command.members || [], command.owner, command.action === 'previewbattle', command.visit);
			return this.view(user);
		}
		if (command.action === 'preparebattle') {
			if (currentSession?.adventure?.nativeTeamPreview &&
				['battle-starting', 'battle'].includes(currentSession.adventure.phase)) return this.view(user);
			this.selectBattle(user, [], undefined, false, command.visit, true);
			return this.view(user);
		}
		if (command.action === 'selectarea') {
			this.selectArea(user, command.value || '');
			return this.view(user);
		}
		if (command.action === 'cancelarea') {
			this.cancelArea(user);
			return this.view(user);
		}
		if (command.action === 'eventchoice') {
			this.chooseCoopEvent(user, command.value || '', false, command.evs, command.owner, command.visit);
			return this.view(user);
		}
		if (command.action === 'challenge') {
			this.chooseChallenge(user, command);
			return this.view(user);
		}
		if (command.action === 'companioninvite') {
			this.chooseTravelInvitation(user, command);
			return this.view(user);
		}
		if (command.action === 'cancelevent') {
			this.chooseCoopEvent(user, undefined, true, undefined, command.owner, command.visit);
			return this.view(user);
		}
		if (command.action === 'blessingchoice') {
			this.chooseCoopBlessing(user, command);
			return this.view(user);
		}
		if (command.action === 'blessingreward') {
			this.chooseCoopBlessingReward(user, command);
			return this.view(user);
		}
		if (command.action === 'selectstarters') {
			this.selectStarters(user, command.starters || [], command.starterBuilds);
			return this.view(user);
		}
		if (command.action === 'heal') {
			this.healRest(user, command.owner);
			return this.view(user);
		}
		if (command.action === 'useitem' || command.action === 'emergency') {
			this.recoverMember(user, command);
			return this.view(user);
		}
		if (command.action === 'finishroute') {
			this.finishRest(user);
			return this.view(user);
		}
		if (command.action === 'buy') {
			this.buyRest(user, command);
			return this.view(user);
		}
		if (command.action === 'buygrowth') {
			this.buyCamp(user, command);
			return this.view(user);
		}
		if (command.action === 'sell') {
			this.sellItems(user, command);
			return this.view(user);
		}
		if (command.action === 'proposetrade') {
			this.proposeTrade(user, command);
			return this.view(user);
		}
		if (command.action === 'respondtrade') {
			this.respondTrade(user, command);
			return this.view(user);
		}
		if (command.action === 'canceltrade') {
			this.cancelTrade(user, command.id || '', command.owner);
			return this.view(user);
		}
		if (command.action === 'proposecapture') {
			this.proposeCapture(user, command.ball || '', command.captureTarget || '', command.owner);
			return this.view(user);
		}
		if (command.action === 'respondcapture') {
			this.respondCapture(user, command);
			return this.view(user);
		}
		if (command.action === 'cancelcapture') {
			this.cancelCapture(user, command.id || '');
			return this.view(user);
		}
		if (command.action === 'learn') {
			const session = this.engine.store.coopSessionForUser(user.id);
			const learningAllowed = ['area-selection', 'battle-selection', 'route-interaction', 'settlement',
				'blessing-selection', 'blessing-reward'].includes(session?.adventure?.phase || '');
			requireRule(session?.status === 'active' && session.adventure && learningAllowed &&
				typeof command.member === 'string' && typeof command.value === 'string', '没有待处理的共同队伍招式。');
			const expectedRevision = session.revision;
			const owner = this.delegatedOwner(user, session, command.owner);
			requireRule(command.move === undefined || command.move === session.adventure.members[owner].pendingMoves?.[0]?.move,
				'待学习招式已变化，请刷新后重新选择。');
			const updateAccount = this.resolveMemberMove(owner, session.adventure, command.member, command.value);
			if (session.adventure.phase === 'battle-selection') clearBattleSelections(session, owner);
			session.revision++;
			session.updatedAt = Date.now();
			this.engine.store.updateCoopSession(session, expectedRevision, new Map([[owner, updateAccount]]));
			Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser)?.send(
				`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, learned: true })}`);
			return this.view(user);
		}
		if (command.action === 'continuebattle' || command.action === 'retrybattle') {
			this.settleContinue(user, command.action === 'retrybattle');
			return this.view(user);
		}
		if (command.action === 'invite') {
			this.available(user);
			const difficulty = command.difficulty;
			requireRule(Number.isInteger(difficulty) && difficulty! >= 0 && difficulty! <= 5, '请选择 0～5 档。');
			this.requireUnlocked(user.id, difficulty as RogueCoopDifficulty, '你尚未解锁所选档位。');
			const target = Users.get(toID(command.target || ''));
			requireRule(target && target.id !== user.id, '请输入一位其他玩家的名称。');
			this.available(target);
			requireRule(!target.settings.blockChallenges || user.can('bypassblocks', target), '对方当前不接受挑战邀请。');
			this.requireUnlocked(target.id, difficulty as RogueCoopDifficulty, '对方不符合该档位游玩要求。');
			const now = Date.now();
			const invite: RogueCoopInvite = {
				id: randomUUID(), fromUser: user.id, toUser: target.id, fromName: user.name, toName: target.name,
				difficulty: difficulty as RogueCoopDifficulty, createdAt: now, expiresAt: now + 300000,
			};
			this.engine.store.createCoopInvitation(invite);
			target.popup(`${user.name} 邀请你进行幻想杯肉鸽双人联机，档位 ${difficulty}。请打开“联机游玩”查看并接受；邀请五分钟内有效。`);
			target.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ invitation: invite.id })}`);
			return this.view(user);
		}
		requireRule(typeof command.id === 'string' && command.id.length <= 80, '联机邀请标识无效。');
		if (command.action === 'decline') {
			const invite = this.engine.store.removeCoopInvitation(command.id, user.id, 'recipient');
			Users.get(invite.fromUser)?.send(
				`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ invitation: command.id, declined: true })}`
			);
			return this.view(user);
		}
		if (command.action === 'cancel') {
			const invite = this.engine.store.removeCoopInvitation(command.id, user.id, 'sender');
			Users.get(invite.toUser)?.send(
				`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ invitation: command.id, cancelled: true })}`
			);
			return this.view(user);
		}
		if (command.action === 'accept') {
			const invite = this.engine.store.coopInvitation(command.id);
			requireRule(invite?.toUser === user.id && invite.expiresAt > Date.now(), '联机邀请已过期或你无权处理。');
			this.available(user);
			const host = Users.get(invite.fromUser);
			requireRule(host, '邀请方目前不在线。');
			this.available(host);
			this.requireUnlocked(user.id, invite.difficulty, '你不符合该档位游玩要求。');
			this.requireUnlocked(host.id, invite.difficulty, '邀请方不符合该档位游玩要求。');
			const now = Date.now();
			const session: RogueCoopSession = {
				id: randomUUID(), hostUser: host.id, guestUser: user.id, hostName: host.name, guestName: user.name,
				difficulty: invite.difficulty, status: 'lobby', revision: 1, createdAt: now, updatedAt: now,
				starterSelections: { [host.id]: null, [user.id]: null },
				starterBuildSelections: { [host.id]: null, [user.id]: null },
				battleSelections: { [host.id]: [], [user.id]: [] },
				areaSelections: { [host.id]: null, [user.id]: null },
			};
			this.engine.store.acceptCoopInvitation(invite.id, user.id, session);
			host.send(`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id })}`);
			return this.view(user);
		}
		if (command.action === 'leave') {
			let session = this.engine.store.coopSessionForUser(user.id);
			requireRule(session?.id === command.id, '当前没有这场联机冒险。');
			const room = session.roomid ? Rooms.get(session.roomid) : undefined;
			if (room?.battle) {
				requireRule(room.battle.options.cooperativeGuest &&
					room.battle.options.fantasyRogue?.state.encounterId === session.adventure?.encounterId &&
					room.battle.p1.id === session.hostUser && room.battle.p3.id === session.guestUser,
				'房间与联机会话不匹配，未关闭任何房间。');
				room.destroy();
				session = this.engine.store.coopSession(session.id)!;
			}
			if (session.status === 'lobby') {
				session.status = 'abandoned';
			} else {
				session.status = 'paused';
				if (session.adventure?.phase === 'battle-selection') clearBattleSelections(session, undefined, true);
			}
			session.revision++;
			session.updatedAt = Date.now();
			this.engine.store.updateCoopSession(session, session.revision - 1);
			const other = Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser);
			other?.send(
				`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, paused: session.status === 'paused' })}`
			);
			return this.view(user);
		}
		if (command.action === 'resume') {
			const session = this.engine.store.coopSessionForUser(user.id);
			requireRule(session?.id === command.id && session.status === 'paused', '当前没有这场已暂停的共同冒险。');
			requireRule(Users.get(session.hostUser)?.connected && Users.get(session.guestUser)?.connected,
				'双方都需要在线才能继续共同冒险。');
			const revision = session.revision;
			session.status = 'active'; session.revision++; session.updatedAt = Date.now();
			this.engine.store.updateCoopSession(session, revision);
			Users.get(session.hostUser === user.id ? session.guestUser : session.hostUser)?.send(
				`|queryresponse|fantasyroguecoopnotice|${JSON.stringify({ session: session.id, resumed: true })}`);
			return this.view(user);
		}
		throw new Error('联机操作无效。');
	}
}
