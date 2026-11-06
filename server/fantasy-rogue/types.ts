import type { RogueBattleResult, RoguePokemon } from '../../sim/fantasy-rogue';
import type { TrainerStyle } from '../fantasy-ai/types';
import type { RogueStoryStage } from './story';
import type { RogueClearCard } from './legacy';

export type RogueNodeKind =
	'wild' | 'elite' | 'trainer' | 'rest' | 'boss' | 'reward' | 'event' | 'adventure' | 'encounter' | 'trade' | 'challenge' | 'story';
export interface RogueTrainer {
	id: string;
	name: string;
	avatar: string;
	role: 'gym' | 'elitefour' | 'champion' | 'rocket' | 'nurse' | 'merchant' | 'traveller';
	tera: boolean;
	/** Hidden Elite Four entry guaranteed by meeting this gym leader. */
	requiresGym?: string;
}
export interface RogueTrainerCandidate {
	trainer: RogueTrainer;
	team: PokemonSet[];
}
export interface RogueEncounter {
	escortCount?: number;
	blessingLevelOffsets?: number[];
	/** Authored trial guardians keep their stated levels. */
	fixedLevels?: boolean;
	cooperative?: { id: string, name: string, team: PokemonSet[] };
	forcedTera?: boolean;
	/** Stable identity for successive fights inside one event; retries reuse it. */
	key?: string;
	wildPack?: { lootRolls: number };
	environment?: { weather?: string, terrain?: string, name: string };
	boss?: import('../../sim/rogue-bosses').RogueBossState;
	blessingLevels?: number;
	/** Aligned with the saved opponent team; retries retain the same rolls. */
	stars?: number[];
	name: string;
	/** Independent per-battle Hoopa roll, fixed on retries. */
	spiritHazards?: string[];
	trainer?: RogueTrainer;
	/** Whole authored trainer teams, drawn once when entering the floor. */
	trainerCandidates?: RogueTrainerCandidate[];
	/** The independent 1% fourth encounter; no extra item drop is enabled yet. */
	bonus?: boolean;
	team: PokemonSet[];
	/** Single-Pokemon elite alternatives, drawn once and removed from the saved encounter. */
	candidates?: PokemonSet[];
	style: TrainerStyle;
	catchable: boolean;
	/** Per-ball probabilities; no default catch formula or implicit chance. */
	catchChances?: Record<string, number>;
}
export interface RogueNode {
	mainlineScene?: string;
	elderScene?: string;
	challenge?: import('./optional-challenges').OptionalChallenge;
	/** A companion let the player advance without winning; reward is held in the rematch ledger. */
	companionLoss?: boolean;
	/** Per-center purchases survive saves and retries; a new center starts a new quota. */
	restCandyPurchases?: Record<string, number>;
	trade?: { kind: 'mint' | 'candy' | 'machine' | 'growth' | 'auction' | 'balls' | 'crowns' | 'mushroom' | 'buyback', stock: (RogueItem & { remaining: number })[], purchases: number,
		services?: Partial<import('./growth').RogueGrowth>, trainingClaimed?: boolean, };
	rewardScene?: import('./reward-scenes').RewardScene;
	event?: import('./events').RogueEvent;
	blessingPrepared?: boolean;
	awakeningLegend?: string;
	originalDragonLegend?: string;
	regiBoss?: boolean;
	id: string;
	name: string;
	kind: RogueNodeKind;
	biome?: { id: string, name: string, tier: number, level: number };
	/** Once the first fight starts, supplies are locked until this continuous challenge ends. */
	noHealing?: boolean;
	spiritPrepared?: boolean;
	fogged?: boolean;
	rocket?: { cleared: boolean, reward: number };
	shopChallenge?: { rewards: Record<string, number>, closed: boolean };
	hpPurchases?: number;
	encounters: RogueEncounter[];
	/** Rolled once, saved with the route; each completed wild encounter pays its own entry. */
	wildLoot?: Record<string, number>[];
	/** Same encounter indices as wildLoot; absent on legacy prepared nodes. */
	wildCandyTraining?: number[];
	economyPrepared?: boolean;
	/** Additional training is rolled once when an eligible region is completed. */
	journeyGrowthResolved?: boolean;
	reward: { money: number, items: Record<string, number>, candyTraining?: number };
}
export interface RogueItem {
	id: string;
	name: string;
	singleMove?: boolean;
	teraType?: string;
	kind: 'terashard' | 'ball' | 'revive' | 'heal' | 'ether' | 'cure' | 'candy' | 'rarecandy' | 'evolution' | 'held' | 'emblem' | 'treasure' | 'effort' | 'mint' | 'machine' | 'tonic' | 'crown' | 'ability' | 'forme';
	nature?: string; move?: string; description?: string;
	/** Omitted on cure items means all persistent status conditions. */
	cureStatuses?: string[];
	price: number;
	/** false excludes an item from shops; omitted keeps custom packs compatible. */
	shopFloor?: number | false;
	/** Present for limited shop offers, including sold-out center candy. */
	remaining?: number;
	sellPrice?: number;
	recyclePrice?: number;
	stat?: StatID;
	/** Healing amount, or fraction of max HP for a revive. */
	amount?: number;
	multiplier?: number;
	ballRule?: import('../../sim/rogue-balls').RogueBallRule;
	icon?: string;
	category?: string;
}
export interface RogueStarter {
	id: string;
	set: PokemonSet;
	availableInitially: boolean;
}
export interface RogueContent {
	/** Enables the optional post-clear challenge only with all nineteen authored fourth moves. */
	arceusMoves?: Record<string, string>;
	routePools?: Record<number, RogueNode[]>;
	events?: boolean;
	rewardScenes?: boolean;
	blessings?: boolean;
	story?: boolean;
	spirits?: boolean;
	version: string;
	wildTreasures?: boolean;
	/** Draw the authored 14-region routes once per floor and persist them in the run. */
	biomeEncounters?: boolean;
	/** New adventures can opt into full-party doubles while legacy saves keep their original format. */
	doubleBattle?: boolean;
	/** Explicitly compatible saves retain their current encounter and use new content on later floors. */
	compatibleVersions?: string[];
	label?: string;
	progression?: 'mainline7';
	allowReplacement?: boolean;
	starters: RogueStarter[];
	initialMoney: number;
	initialBag: Record<string, number>;
	items: RogueItem[];
	/** Consecutive configured floors. Missing later floors pause the run, never auto-complete it. */
	floors: Record<number, RogueNode[]>;
	/** Explicit capture-species -> earliest form starter mapping, including regional forms. */
	unlocks: Record<string, { starter: string, captures: 1 | 10 }>;
}
export interface RogueInventory {
	growth?: import('./growth').RogueGrowth;
	journeyGrowth?: { offense: number, defense: number };
	team: RoguePokemon[];
	box?: RoguePokemon[];
	bag: Record<string, number>;
	money: number;
	/** Per-adventure event unlock; missing in old saves means locked. Included in floor rollback. */
	teraUnlocked?: boolean;
	megaUnlocked?: boolean;
	gmegaUnlocked?: boolean;
	zUnlocked?: boolean;
}
export interface RogueRun extends RogueInventory {
	/** Frozen at run creation so a content update never changes an existing save's battle mode. */
	doubleBattle?: boolean;
	nuzlocke?: import('./nuzlocke').NuzlockeRun;
	/** Missing on old adventures: preserve their additive stat rules. */
	boostRuleVersion?: 2;
	firstClearRewardsRecorded?: boolean;
	mainline?: { scene: string, floor?: number, offered?: boolean, completed?: boolean, pitySettled?: boolean, missedClears?: number };
	elderVisits?: string[];
	elderServices?: string[];
	elderStageLine?: string;
	mainlineEnding?: string;
	challengeHistory?: import('./optional-challenges').ChallengeRecord[];
	echo?: import('../../sim/rogue-echo').EchoUpgrades;
	echoAwarded?: number;
	echoIntroShown?: boolean;
	trainerBonds?: Record<string, import('./affection').TrainerBond>;
	affectionClaims?: string[];
	affectionVersion?: number;
	masterBallQuest?: import('./master-ball').MasterBallQuest;
	masterBallLedger?: { remaining: number; used: number };
	journey?: import('./history').JourneyLedger;
	collapse?: import('../../sim/rogue-collapse-data').CollapseID[];
	collapseClearRecorded?: boolean;
	futureBossFloor?: number;
	difficulty?: import('../../sim/rogue-difficulty').RogueDifficulty;
	difficultyRulesVersion?: number;
	/** Only runs actually using a local permission bypass cannot grant normal progress. */
	difficultyTest?: boolean;
	charmChoicePending?: boolean;
	/** Deferred until the final pre-tower confirmation, so practice cannot grant starter traits. */
	startingBuilds?: PokemonSet[];
	activityClaims?: string[];
	rareCandyEvents?: string[];
	environment?: import('./floor-environment').FloorEnvironment;
	/** Ecologies offered on recent floors, shared by wild and elite routes. */
	biomeHistory?: { id: string, floor: number }[];
	greninjaTraining?: import('./greninja-training').GreninjaTraining;
	socialCompanions?: import('./travellers').SocialCompanion[];
	companionInvitations?: import('./travellers').CompanionInvitation[];
	companionsVersion?: number;
	rival?: import('./rivals').RivalState;
	previousRival?: import('./rival-data').RivalID;
	honeymoon?: import('./honeymoon').HoneymoonTrip;
	exclusiveItems?: Record<string, { since: number, misses: number, cooldown: number, obtained?: boolean }>;
	/** Eligible event areas passed without an exclusive clue while an active partner still needs an item. */
	exclusiveEventMisses?: number;
	auction?: import('./auction').RogueAuction;
	companionPickups?: { settled: string[], items: Record<string, number> };
	emblemLoot?: import('./emblem-loot').EmblemLootProgress;
	preview?: { key: string, trainer: 'sada' | 'turo', stage: 'running' | 'result' | 'personal', result?: import('../../sim/fantasy-rogue').RogueBattleResult };
	rewardHistory?: string[];
	catchupCheckpoint?: number;
	shoppingSpend?: { total: number; rewards: number };
	/** Offered routes, not selected routes. Saved with the floor so reconnecting cannot reroll pity. */
	routeHistory?: {
		floor: number, factors: Record<string, number>, tradeSeen: boolean, eliteMisses: number, lastEliteFloor?: number,
	};
	/** Persisted claims prevent duplicate elder supplies on reconnect or repeated dialogue. */
	mentorGifts?: number[];
	mentorOffer?: number;
	mentorCard?: { floor: number, kind: import('./early-balance').MentorCard };
	postgame?: {
		stage: 'offer' | 'battle' | 'won' | 'lost' | 'declined',
		echoAwarded?: number,
		before: RogueInventory,
		node: RogueNode,
		encounter: number,
	};
	eventHistory?: { id: string, floor: number }[];
	/** Extra event fragments, independent of boss and blessing rewards. */
	eventFragments?: Record<string, number>;
	/** Missing means the legacy schedule; only new adventures opt into frontloaded rewards. */
	eventFragmentRuleVersion?: 1 | 2;
	eventBuff?: { battles: number };
	pendingSpiritGift?: boolean;
	gymGiftReceived?: boolean;
	/** Frozen at adventure creation; only the immediately previous adventure affects offers. */
	previousBlessings?: string[];
	blessings?: import('./blessings').RogueBlessings;
	blessingCheckpoint?: import('./blessings').RogueBlessings;
	owner?: { id: string, name: string };
	story?: { stage: RogueStoryStage, page: number, skip: boolean, canSkip: boolean };
	dialogue?: { key: string, pages: import('./narrative').NarrativePage[], resume: Exclude<RogueRun['phase'], 'battle' | 'story'> | 'advance' };
	rematches?: import('./companion-rematches').CompanionRematch[];
	police?: import('./police-events').PoliceProgress;
	/** Terminal receipt stays saved until explicitly acknowledged; distinct from a retryable challenge loss. */
	failure?: { key: string, floor: number, title: string, reason: string };
	/** Completed pre-battle openings, retained when a battle is retried. */
	seenBossDialogues?: string[];
	/** Persist identities/rosters before announcing them; levels are applied on entry. */
	bossPreviews?: Record<number, RogueNode>;
	leagueBriefingDone?: boolean;
	startCard?: string;
	comeback?: import('./comeback').ComebackState;
	coverageLessons?: { remaining: number; claimed: string[] };
	clearRecorded?: boolean;
	/** Per-floor friendship awards are not part of the inventory rollback. */
	friendshipProgress?: {
		floor: number, battles: Record<string, number>, fainted: Record<string, number>, settled: string[], completed?: boolean,
	};
	spirit?: string;
	spiritVersion?: number;
	spiritConversions?: Record<string, string>;
	id: string;
	contentVersion: string;
	/** Per-run identities; gym history also unlocks the two hidden Elite Four trainers. */
	trainerHistory?: { gyms: string[], eliteFour: string[], elitePlan?: Record<number, string> };
	floor: number;
	phase: 'intro' | 'story' | 'choose' | 'ready' | 'battle' | 'rest' | 'reward' | 'settlement' | 'failed' | 'defeated' | 'complete' | 'blessing' | 'event' | 'postgame';
	node?: RogueNode;
	/** Saved route candidates, including encounters, must survive reloads and reconnects. */
	choices?: RogueNode[];
	encounter: number;
	attempt: number;
	/** Failed/retreated encounters keep their index and all spent resources. */
	recovery?: 'defeat' | 'retreat';
	/** Receipt for one automatic rescue attempt at real defeat; never retried on refresh. */
	emergencyRecovery?: { cost: number, paid: boolean };
	boosts: StatsTable;
	startingSlots: number;
	pendingCapture?: RoguePokemon;
	pendingCaptures?: RoguePokemon[];
	captureResume?: 'ready' | 'failed' | 'shopclosed' | 'choose' | 'event';
	/** An out-of-band companion item choice returns to the exact interrupted screen. */
	blessingRewardResume?: RogueRun['phase'];
	pendingMoves?: { member: string, move: string }[];
	notices?: string[];
	lastReward?: {
		floor: number, encounter?: number, name: string, money: number, items: Record<string, number>, points: number,
		effect?: string,
	};
	/** Existing adventures and retried start requests do not announce again. */
	announced?: boolean;
	checkpoint: RogueInventory;
	/** Stable across retries. Only account-level catch counting uses this ledger. */
	caught: string[];
	retryHealing?: import('./retry-healing').RetryHealing;
	/** Defeated opponent identities already paid, retained across escape and retries. */
	experienceReceipts?: string[];
	battle?: { token: string, encounterId: string, roomid?: string, retreatRequested?: boolean,
		retryRequested?: boolean, eventBuff?: boolean,
		growthSequence?: number, growthRevision?: number, growthPaused?: boolean,
		checkpoint?: RogueBattleResult,
		/** Optional challenges still grant no progression when abandoned. */
		growthBaseline?: { team: RoguePokemon[], receipts: string[], pendingMoves?: { member: string, move: string }[] },
	};
}
export type RogueShopContext = Pick<RogueRun,
	'floor' | 'difficulty' | 'blessings' | 'team' | 'spirit' | 'collapse' | 'difficultyRulesVersion' | 'node'>;
export interface RogueAccount {
	crates?: import('./starter-crates').StarterCrates;
	/** Minimum persisted-data contract; unrelated to the SQL schema and per-run growth rule. */
	saveVersion?: 2 | 3;
	preferredNuzlocke?: boolean;
	mainline?: import('./mainline-progress').MainlineProgress;
	mainlineDialogue?: import('./mainline').MainlineDialogue;
	firstClearSpecies?: string[];
	unlockNotices?: import('./mainline-progress').UnlockNotice[];
	echo?: import('../../sim/rogue-echo').CollapseEcho;
	masterBalls?: import('./master-ball').MasterBallCollection;
	collapseHistory?: Record<string, import('../../sim/rogue-collapse-data').CollapseHistory>;
	difficulties?: { highest: number, cleared: string[], spirits: string[] };
	/** Absent means the elder offers a charm each adventure; explicit zero skips the offer. */
	preferredDifficulty?: import('../../sim/rogue-difficulty').RogueDifficulty;
	charmIntroduced?: boolean;
	/** Actual captures in each ecology; gifts and catches elsewhere never reveal an icon here. */
	biomeCaptures?: Record<string, string[]>;
	previousRival?: import('./rival-data').RivalID;
	honeymoon?: import('./honeymoon').HoneymoonTrip;
	/** Account-wide acknowledgement, independent of adventures and codex unlocks. */
	onboardingSeen?: boolean;
	onboardingVersion?: string;
	/** Once discovered, the combination's description remains visible across adventures. */
	tonicSecret?: boolean;
	/** Permanent codex collection, independent of the current and previous adventures. */
	discoveries?: { blessings: string[], events: string[], trainers?: string[] };
	previousBlessings?: string[];
	adventures?: number;
	opening?: { page: number, skip: boolean };
	cards?: RogueClearCard[];
	pendingClear?: RogueClearCard;
	spiritUnlocked?: boolean;
	/** Earned by full clears, independently of the optional spirit-mode access gate. */
	unlockedSpirits?: string[];
	/** Highest proven clear with each spirit; easy ranks below 0. Independent of retained cards. */
	spiritClearTiers?: Record<string, import('../../sim/rogue-difficulty').RogueDifficulty>;
	revision: number;
	points: number;
	boosts: StatsTable;
	slots: number;
	captures: Record<string, number>;
	unlocked: string[];
	caughtSpecies?: string[];
	/** Permanent, per-starter-family choices. Missing on legacy saves. */
	starterTraits?: Record<string, RogueStarterTraits>;
	/** Idempotency receipts for co-op captures, so reconnects cannot duplicate permanent unlocks. */
	coopCaptureReceipts?: string[];
	run?: RogueRun;
}

export type RogueCoopDifficulty = 0 | 1 | 2 | 3 | 4 | 5;
export interface RogueCoopInvite {
	id: string;
	fromUser: string;
	toUser: string;
	fromName: string;
	toName: string;
	difficulty: RogueCoopDifficulty;
	createdAt: number;
	expiresAt: number;
}
export interface RogueCoopMemberState {
	socialCompanions?: RogueRun['socialCompanions'];
	companionInvitations?: RogueRun['companionInvitations'];
	/** Irreversible per-member Master Ball stock, outside battle and travel inventory snapshots. */
	masterBallLedger?: RogueRun['masterBallLedger'];
	/** Each member's party, reserve, currency and items remain private save data within the shared session. */
	team: RoguePokemon[];
	box: RoguePokemon[];
	/** Captures wait here when the party is full; admitting one requires a confirmed release. */
	pendingCaptures?: RoguePokemon[];
	money: number;
	bag: Record<string, number>;
	boosts: StatsTable;
	slots: number;
	systems: { tera: boolean, mega: boolean, gmega: boolean, z: boolean };
	/** Growth receipts and pending level-up choices are private to this member. */
	experienceReceipts?: string[];
	pendingMoves?: { member: string, move: string }[];
	notices?: string[];
	/** Shared workshop rewards remain available independently until each member spends them. */
	coverageLessons?: RogueRun['coverageLessons'];
	/** Center-candy quotas and purchase request receipts are private to the purchasing member. */
	restCandyPurchases?: Record<string, number>;
	purchaseReceipts?: string[];
	/** Only this member's qualifying purchases advance the shopping blessing. */
	shoppingSpend?: RogueRun['shoppingSpend'];
	/** Acquired exclusive-item history belongs to this player, including after selling or equipping it. */
	exclusiveItems?: RogueRun['exclusiveItems'];
	/** A paid training-camp visit is private to each member; the partner keeps their own opportunity. */
	campVisits?: string[];
	/** Retries of an already applied personal recovery request must not consume a second item or fee. */
	recoveryReceipts?: string[];
	/** Training supplies are consumed atomically with account unlocks and the shared session. */
	supplyReceipts?: string[];
	/** Shared blessing picks grant independent effects, inventories and follow-up choices to this member. */
	blessings?: import('./blessings').RogueBlessings;
	/** Run-wide stat growth is personal, even when granted by a shared event. */
	growth?: import('./growth').RogueGrowth;
	/** Companion progress and reward receipts stay with this member across shared steps and reconnects. */
	trainerBonds?: RogueRun['trainerBonds'];
	affectionClaims?: RogueRun['affectionClaims'];
	/** Native once-per-adventure activity rewards stay claimed after shared routes and reconnects. */
	rareCandyEvents?: RogueRun['rareCandyEvents'];
	activityClaims?: RogueRun['activityClaims'];
	/** The exact personal partner stays here while away and returns only to this owner. */
	greninjaTraining?: RogueRun['greninjaTraining'];
	/** Battle participants are archived into this member's personal journey history on a clear. */
	journey?: import('./history').JourneyLedger;
	/** The shared event keeps each member's private target/progress and event-local run effects. */
	eventFragments?: RogueRun['eventFragments'];
	coopEvent?: import('./events').RogueEvent;
	coopEventReward?: RogueRun['lastReward'];
	coopLootReward?: RogueRun['lastReward'];
}
export interface RogueCoopTradeProposal {
	id: string;
	fromUser: string;
	fromMember: string;
	toMember: string;
	fee: number;
	createdAt: number;
}
export interface RogueCoopCaptureProposal {
	context?: 'safari';
	id: string;
	ownerUser: string;
	recipientUser: string;
	ball: string;
	targetKey: string;
	targetId: string;
	targetName: string;
	state: 'requested' | 'contested' | 'returned';
	createdAt: number;
	expiresAt: number;
}
export interface RogueCoopAdventure {
	id: string;
	contentVersion: string;
	floor: number;
	/** Current encounter within the selected node; wild routes can contain several sequential fights. */
	encounter: number;
	phase: 'area-selection' | 'battle-selection' | 'battle-starting' | 'route-interaction' | 'battle' | 'settlement' | 'complete' |
		'blessing-selection' | 'blessing-reward' | 'affection';
	difficulty: RogueCoopDifficulty;
	doubleBattle: true;
	members: Record<string, RogueCoopMemberState>;
	/** Server-authored options are frozen in the session so both users see the same route after reconnecting. */
	routeChoices?: RogueNode[];
	/** A rare additional route; it does not replace or consume the floor's ordinary route. */
	masterBallQuest?: RogueRun['masterBallQuest'];
	masterBallRollFloor?: number;
	challengeHistory?: RogueRun['challengeHistory'];
	coopChallenge?: import('./coop-challenges').CoopChallenge;
	/** Shared route pity and ecology history for the co-op run; never taken from either personal save. */
	routeHistory?: RogueRun['routeHistory'];
	biomeHistory?: RogueRun['biomeHistory'];
	/** Shared consent to leave a legacy secret-area node without progressing personal mainline. */
	routeRecovery?: { key: string, selections: Record<string, boolean> };
	/** The agreed route is persisted before party selection or room creation. */
	node?: RogueNode;
	encounterId?: string;
	battleToken?: string;
	/** Full candidates are submitted to native Team Preview before selecting 1–3 battlers. */
	nativeTeamPreview?: boolean;
	nativeTeamSelected?: boolean;
	/** A fresh room incarnation fences callbacks while the logical battle/capture receipt token stays stable. */
	battleLease?: string;
	battleCheckpoint?: import('../../sim/rogue-coop-checkpoint').RogueCoopCheckpoint;
	battleRecoverySelections?: Record<string, boolean>;
	battleResult?: {
		won: boolean, turns?: number, reward?: { money: number, items: Record<string, number>, effect?: string },
		partnerReward?: { money: number, items: Record<string, number>, effect?: string }, eventResolved?: boolean, retreated?: boolean,
		memoryRestored?: boolean,
	};
	/** Both members must confirm settlement before the shared adventure advances. */
	continueSelections?: Record<string, boolean>;
	retrySelections?: Record<string, boolean>;
	/** Both members confirm leaving a non-battle shared route such as a rest center. */
	routeExitSelections?: Record<string, boolean>;
	/** A single pending party swap; the proposer pays the one-time linking-cord-equivalent fee. */
	tradeProposal?: RogueCoopTradeProposal;
	tradeReceipts?: string[];
	/** Capture ownership stays undecided until both players agree in the shared wild battle. */
	captureProposal?: RogueCoopCaptureProposal;
	captureReceipts?: string[];
	/** Both members must choose the same opening branch before private target steps begin. */
	coopEventChoices?: Record<string, string | null>;
	coopEventBranchResolved?: boolean;
	coopEventHistory?: RogueRun['eventHistory'];
	/** One catalogue/NPC bidding process; each winning player's purchase remains personal. */
	coopAuction?: import('./coop-auction').CoopAuction;
	/** Coincides with the single-player fragment schedule; old co-op sessions had no fragment-offer events. */
	eventFragmentRuleVersion?: 1 | 2;
	/** One shared draft; each confirmed blessing is applied separately to both member states. */
	coopBlessingRound?: import('./blessing-selection').BlessingRound;
	coopBlessingChoices?: Record<string, string | null>;
	/** Votes are scoped to one owner's current companion milestone, never reused for the next dialogue. */
	coopAffection?: { visit: string, choices: Record<string, string | null> };
	coopBlessingResume?: 'opening' | 'advance' | 'battle' | 'event';
	lastReward?: { floor: number, name: string, money: number, items: Record<string, number>, effect?: string };
}
export interface RogueCoopSession {
	id: string;
	hostUser: string;
	guestUser: string;
	hostName: string;
	guestName: string;
	difficulty: RogueCoopDifficulty;
	status: 'lobby' | 'active' | 'paused' | 'complete' | 'abandoned';
	revision: number;
	createdAt: number;
	updatedAt: number;
	/** Each owner will select and keep their own starter, team, wallet and save. */
	starterSelections: Record<string, string[] | null>;
	/** Initial builds use the same server-validated nature, gender, ability, IV and shiny rules as solo starts. */
	starterBuildSelections: Record<string, Record<string, RogueStarterBuild> | null>;
	/** Explicitly confirmed battle teams; changing a preview revokes that owner's confirmation. */
	battleSelections: Record<string, string[]>;
	/** Live picks are independent of confirmation, so an empty array is a meaningful cancellation. */
	battlePreviews?: Record<string, string[]>;
	battleSelectionVersion?: number;
	/** A separate shared-run save; never stored in either member's personal account.run. */
	adventure?: RogueCoopAdventure;
	/** The same route choice must be submitted by both participants before it advances. */
	areaSelections: Record<string, string | null>;
	/** Only the transfer target may act while delegation is active. Either member can revoke it. */
	delegatedTo?: string;
	/** A scoped shared decision; a stale confirmation cannot end a different encounter or phase. */
	exitProposal?: {
		id: string, kind: 'retreat' | 'abandon', proposer: string, phase: RogueCoopAdventure['phase'],
		battleToken?: string, expiresAt: number, confirmed?: boolean,
	};
	roomid?: string;
}
export interface RogueStarterTraits {
	/** Unlocked only by a confirmed shiny capture in this starter's evolution family. */
	shiny?: boolean;
	natures: string[];
	genders: string[];
	abilities: string[];
	moves: string[];
	ivs: { min: StatsTable, max: StatsTable };
}
export interface RogueStarterBuild {
	shiny?: boolean;
	nature: string;
	ivs: StatsTable;
	gender?: string;
	ability?: string;
	moves?: string[];
}
export interface RogueCommand {
	collapse?: import('../../sim/rogue-collapse-data').CollapseID[];
	difficulty?: import('../../sim/rogue-difficulty').RogueDifficulty;
	id: string;
	revision: number;
	/** Milliseconds seen on the ski clock when pressed; server bounds the transit allowance. */
	skiAt?: number;
	fusionAbility?: string;
	fusionStats?: StatID[];
	trainingMembers?: string[];
	trainingStats?: StatIDExceptHP[];
	appearance?: string;
	action: 'mainlinechoice' | 'unlockack' | 'echo' | 'affection' | 'forme' | 'fusion' | 'unfusion' | 'ackfailure' | 'feedmushroom' | 'rewardchoice' | 'buygrowth' | 'onboarding' | 'mentorcard' | 'evolutionnotice' | 'godchallenge' | 'dragonking' | 'start' | 'select' | 'battle' | 'retreat' | 'emergency' | 'retry' | 'heal' | 'buy' | 'sell' | 'use' | 'continue' | 'upgrade' | 'abandon' |
		'rematch' | 'retryheal' | 'retrycancel' | 'partyheal' | 'opencrate' | 'exchangecrate' | 'crateprediction' |
		'shopchallenge' | 'challenge' | 'event' | 'companion' | 'companioninvite' | 'socialcompanion' | 'previewresult' | 'comeback' | 'coverage' |
		'learn' | 'replace' | 'evolve' | 'order' | 'setmove' | 'moves' | 'equip' | 'equipemblem' | 'ability' | 'evs' | 'configureuniversal' |
		'spiritack' | 'trimparty' | 'box' | 'merge' | 'buyhp' | 'storynext' | 'storyskip' | 'startcard' | 'newstory' |
		'setnuzlocke' | 'release' | 'setdifficulty' | 'charm' | 'charmack' | 'confirmdifficulty' | 'restartsetup' | 'saveclear' | 'publishcard' | 'deletecard' | 'blessing' | 'blessingrefresh' | 'blessingquality' | 'blessingreward' | 'fantasize' | 'meltanevolve' | 'swordreward' | 'exchangeshards' | 'settera' | 'inheritrobe' | 'learnbonus' | 'catability' | 'usecompound';
	useSpirit?: boolean;
	/** A previously cleared spirit; validated against the account ledger on the server. */
	selectedSpirit?: string;
	/** Only the loopback preview may choose a specific enabled spirit. */
	testSpirit?: string;
	value?: string;
	starters?: string[];
	starterBuilds?: Record<string, RogueStarterBuild>;
	member?: string;
	/** Candy quantity, or 1/10 for starter crates; omitted preserves single-item commands. */
	count?: number;
	order?: string[];
	slot?: number;
	evs?: StatsTable;
	aura?: StatIDExceptHP;
	confirmed?: boolean;
}
