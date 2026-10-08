import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { TrainerStyle } from '../fantasy-ai/types';

export type RogueNodeKind = 'wild' | 'elite' | 'trainer' | 'rest' | 'boss' | 'reward';
export interface RogueTrainer {
	id: string;
	name: string;
	avatar: string;
	role: 'gym' | 'elitefour' | 'champion' | 'rocket';
	tera: boolean;
	/** Hidden Elite Four entry guaranteed by meeting this gym leader. */
	requiresGym?: string;
}
export interface RogueTrainerCandidate {
	trainer: RogueTrainer;
	team: PokemonSet[];
}
export interface RogueEncounter {
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
	id: string;
	name: string;
	kind: RogueNodeKind;
	biome?: { id: string, name: string, tier: number, level: number };
	/** Once the first fight starts, supplies are locked until this continuous challenge ends. */
	noHealing?: boolean;
	spiritPrepared?: boolean;
	fogged?: boolean;
	rocket?: { cleared: boolean, reward: number };
	hpPurchases?: number;
	encounters: RogueEncounter[];
	/** Rolled once, saved with the route; each completed wild encounter pays its own entry. */
	wildLoot?: Record<string, number>[];
	reward: { money: number, items: Record<string, number> };
}
export interface RogueItem {
	id: string;
	name: string;
	kind: 'ball' | 'revive' | 'heal' | 'ether' | 'cure' | 'candy' | 'evolution' | 'held' | 'treasure' | 'effort';
	price: number;
	/** false excludes an item from shops; omitted keeps custom packs compatible. */
	shopFloor?: number | false;
	sellPrice?: number;
	stat?: StatID;
	/** Healing amount, or fraction of max HP for a revive. */
	amount?: number;
	multiplier?: number;
	icon?: string;
}
export interface RogueStarter {
	id: string;
	set: PokemonSet;
	availableInitially: boolean;
}
export interface RogueContent {
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
}
export interface RogueRun extends RogueInventory {
	spirit?: string;
	spiritVersion?: number;
	spiritConversions?: Record<string, string>;
	id: string;
	contentVersion: string;
	/** Per-run identities; gym history also unlocks the two hidden Elite Four trainers. */
	trainerHistory?: { gyms: string[], eliteFour: string[], elitePlan?: Record<number, string> };
	floor: number;
	phase: 'intro' | 'choose' | 'ready' | 'battle' | 'rest' | 'reward' | 'settlement' | 'failed' | 'complete';
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
	battle?: { token: string, encounterId: string, roomid?: string, retreatRequested?: boolean };
}
export interface RogueAccount {
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
	action: 'start' | 'select' | 'battle' | 'retreat' | 'emergency' | 'retry' | 'heal' | 'buy' | 'sell' | 'use' | 'continue' | 'upgrade' | 'abandon' |
		'learn' | 'replace' | 'evolve' | 'order' | 'setmove' | 'moves' | 'equip' | 'ability' | 'evs' |
		'spiritack' | 'trimparty' | 'box' | 'merge' | 'buyhp';
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
