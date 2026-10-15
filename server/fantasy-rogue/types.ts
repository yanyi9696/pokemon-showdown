import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { TrainerStyle } from '../fantasy-ai/types';
import type { RogueStoryStage } from './story';
import type { RogueClearCard } from './legacy';

export type RogueNodeKind =
	'wild' | 'elite' | 'trainer' | 'rest' | 'boss' | 'reward' | 'event' | 'adventure' | 'encounter' | 'trade';
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
	trade?: { kind: 'mint' | 'candy' | 'machine', stock: (RogueItem & { remaining: number })[], purchases: number };
	event?: import('./events').RogueEvent;
	blessingPrepared?: boolean;
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
	reward: { money: number, items: Record<string, number> };
}
export interface RogueItem {
	id: string;
	name: string;
	singleMove?: boolean;
	kind: 'ball' | 'revive' | 'heal' | 'ether' | 'cure' | 'candy' | 'evolution' | 'held' | 'treasure' | 'effort' | 'mint' | 'machine' | 'tonic';
	nature?: string; move?: string; description?: string;
	/** Omitted on cure items means all persistent status conditions. */
	cureStatuses?: string[];
	price: number;
	/** false excludes an item from shops; omitted keeps custom packs compatible. */
	shopFloor?: number | false;
	sellPrice?: number;
	stat?: StatID;
	/** Healing amount, or fraction of max HP for a revive. */
	amount?: number;
	multiplier?: number;
	icon?: string;
	category?: string;
}
export interface RogueStarter {
	id: string;
	set: PokemonSet;
	availableInitially: boolean;
}
export interface RogueContent {
	routePools?: Record<number, RogueNode[]>;
	events?: boolean;
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
	eventHistory?: { id: string, floor: number }[];
	eventBuff?: { battles: number };
	pendingSpiritGift?: boolean;
	gymGiftReceived?: boolean;
	/** Frozen at adventure creation; only the immediately previous adventure affects offers. */
	previousBlessings?: string[];
	blessings?: import('./blessings').RogueBlessings;
	blessingCheckpoint?: import('./blessings').RogueBlessings;
	owner?: { id: string, name: string };
	story?: { stage: RogueStoryStage, page: number, skip: boolean, canSkip: boolean };
	startCard?: string;
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
	phase: 'intro' | 'story' | 'choose' | 'ready' | 'battle' | 'rest' | 'reward' | 'settlement' | 'failed' | 'complete' | 'blessing' | 'event';
	node?: RogueNode;
	/** Saved route candidates, including encounters, must survive reloads and reconnects. */
	choices?: RogueNode[];
	encounter: number;
	attempt: number;
	/** Failed/retreated encounters keep their index and all spent resources. */
	recovery?: 'defeat' | 'retreat';
	boosts: StatsTable;
	startingSlots: number;
	pendingCapture?: RoguePokemon;
	pendingCaptures?: RoguePokemon[];
	captureResume?: 'ready' | 'failed' | 'shopclosed' | 'choose';
	pendingMoves?: { member: string, move: string }[];
	notices?: string[];
	lastReward?: {
		floor: number, encounter?: number, name: string, money: number, items: Record<string, number>, points: number,
	};
	/** Existing adventures and retried start requests do not announce again. */
	announced?: boolean;
	checkpoint: RogueInventory;
	/** Stable across retries. Only account-level catch counting uses this ledger. */
	caught: string[];
	battle?: { token: string, encounterId: string, roomid?: string, retreatRequested?: boolean, eventBuff?: boolean };
}
export interface RogueAccount {
	/** Once discovered, the combination's description remains visible across adventures. */
	tonicSecret?: boolean;
	/** Permanent codex collection, independent of the current and previous adventures. */
	discoveries?: { blessings: string[], events: string[] };
	previousBlessings?: string[];
	adventures?: number;
	opening?: { page: number, skip: boolean };
	cards?: RogueClearCard[];
	pendingClear?: RogueClearCard;
	spiritUnlocked?: boolean;
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
	natures: string[];
	genders: string[];
	abilities: string[];
	moves: string[];
	ivs: { min: StatsTable, max: StatsTable };
}
export interface RogueStarterBuild {
	nature: string;
	ivs: StatsTable;
	gender?: string;
	ability?: string;
	moves?: string[];
}
export interface RogueCommand {
	id: string;
	revision: number;
	action: 'dragonking' | 'start' | 'select' | 'battle' | 'retreat' | 'emergency' | 'retry' | 'heal' | 'buy' | 'sell' | 'use' | 'continue' | 'upgrade' | 'abandon' |
		'shopchallenge' | 'event' |
		'learn' | 'replace' | 'evolve' | 'order' | 'setmove' | 'moves' | 'equip' | 'ability' | 'evs' |
		'spiritack' | 'trimparty' | 'box' | 'merge' | 'buyhp' | 'storynext' | 'storyskip' | 'startcard' | 'newstory' |
		'saveclear' | 'publishcard' | 'deletecard' | 'blessing' | 'blessingrefresh' | 'blessingreward' | 'fantasize' | 'meltanevolve' | 'swordreward' | 'exchangeshards' | 'settera' | 'learnbonus';
	useSpirit?: boolean;
	/** Only the loopback preview may choose a specific enabled spirit. */
	testSpirit?: string;
	value?: string;
	starters?: string[];
	starterBuilds?: Record<string, RogueStarterBuild>;
	member?: string;
	order?: string[];
	slot?: number;
	evs?: StatsTable;
}
