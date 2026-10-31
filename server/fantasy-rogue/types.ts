import type { RoguePokemon } from '../../sim/fantasy-rogue';
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
	economyPrepared?: boolean;
	/** Additional training is rolled once when an eligible region is completed. */
	journeyGrowthResolved?: boolean;
	reward: { money: number, items: Record<string, number> };
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
	/** Missing on old adventures: preserve their additive stat rules. */
	boostRuleVersion?: 2;
	firstClearRewardsRecorded?: boolean;
	mainline?: { scene: string; floor?: number; offered?: boolean; completed?: boolean; pitySettled?: boolean };
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
	battle?: { token: string, encounterId: string, roomid?: string, retreatRequested?: boolean, eventBuff?: boolean };
}
export interface RogueAccount {
	mainline?: import('./mainline-progress').MainlineProgress;
	mainlineDialogue?: import('./mainline').MainlineDialogue;
	firstClearSpecies?: string[];
	unlockNotices?: import('./mainline-progress').UnlockNotice[];
	echo?: import('../../sim/rogue-echo').CollapseEcho;
	masterBalls?: import('./master-ball').MasterBallCollection;
	collapseHistory?: Record<string, import('../../sim/rogue-collapse-data').CollapseHistory>;
	difficulties?: { highest: number, cleared: string[], spirits: string[] };
	/** Absent means the elder offers a charm each adventure; explicit zero skips the offer. */
	preferredDifficulty?: Exclude<import('../../sim/rogue-difficulty').RogueDifficulty, 'easy'>;
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
	revision: number;
	points: number;
	boosts: StatsTable;
	slots: number;
	captures: Record<string, number>;
	unlocked: string[];
	caughtSpecies?: string[];
	/** Permanent, per-starter-family choices. Missing on legacy saves. */
	starterTraits?: Record<string, RogueStarterTraits>;
	run?: RogueRun;
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
		'shopchallenge' | 'challenge' | 'event' | 'companion' | 'companioninvite' | 'socialcompanion' | 'previewresult' | 'comeback' | 'coverage' |
		'learn' | 'replace' | 'evolve' | 'order' | 'setmove' | 'moves' | 'equip' | 'equipemblem' | 'ability' | 'evs' |
		'spiritack' | 'trimparty' | 'box' | 'merge' | 'buyhp' | 'storynext' | 'storyskip' | 'startcard' | 'newstory' |
		'setdifficulty' | 'charm' | 'charmack' | 'confirmdifficulty' | 'restartsetup' | 'saveclear' | 'publishcard' | 'deletecard' | 'blessing' | 'blessingrefresh' | 'blessingquality' | 'blessingreward' | 'fantasize' | 'meltanevolve' | 'swordreward' | 'exchangeshards' | 'settera' | 'inheritrobe' | 'learnbonus' | 'catability' | 'usecompound';
	useSpirit?: boolean;
	/** A previously cleared spirit; validated against the account ledger on the server. */
	selectedSpirit?: string;
	/** Only the loopback preview may choose a specific enabled spirit. */
	testSpirit?: string;
	value?: string;
	starters?: string[];
	starterBuilds?: Record<string, RogueStarterBuild>;
	member?: string;
	/** Candy use only; omitted preserves single-item commands. */
	count?: number;
	order?: string[];
	slot?: number;
	evs?: StatsTable;
}
