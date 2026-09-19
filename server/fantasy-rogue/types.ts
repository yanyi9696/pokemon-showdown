import type { RoguePokemon } from '../../sim/fantasy-rogue';
import type { TrainerStyle } from '../fantasy-ai/types';

export type RogueNodeKind = 'wild' | 'elite' | 'trainer' | 'rest' | 'boss' | 'reward';
export interface RogueEncounter {
	name: string;
	team: PokemonSet[];
	style: TrainerStyle;
	catchable: boolean;
	/** Per-ball probabilities; no default catch formula or implicit chance. */
	catchChances: Record<string, number>;
}
export interface RogueNode {
	id: string;
	name: string;
	kind: RogueNodeKind;
	encounters: RogueEncounter[];
	reward: { money: number, items: Record<string, number> };
}
export interface RogueItem {
	id: string;
	name: string;
	kind: 'ball' | 'revive' | 'heal';
	price: number;
	/** Healing amount, or fraction of max HP for a revive. */
	amount?: number;
}
export interface RogueStarter {
	id: string;
	set: PokemonSet;
	availableInitially: boolean;
}
export interface RogueContent {
	version: string;
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
	bag: Record<string, number>;
	money: number;
}
export interface RogueRun extends RogueInventory {
	id: string;
	contentVersion: string;
	floor: number;
	phase: 'choose' | 'ready' | 'battle' | 'rest' | 'reward' | 'failed' | 'complete';
	node?: RogueNode;
	encounter: number;
	attempt: number;
	boosts: StatsTable;
	startingSlots: number;
	checkpoint: RogueInventory;
	/** Stable across retries. Only account-level catch counting uses this ledger. */
	caught: string[];
	battle?: { token: string, encounterId: string, roomid?: string };
}
export interface RogueAccount {
	revision: number;
	points: number;
	boosts: StatsTable;
	slots: number;
	captures: Record<string, number>;
	unlocked: string[];
	run?: RogueRun;
}
export interface RogueCommand {
	id: string;
	revision: number;
	action: 'start' | 'select' | 'battle' | 'retry' | 'heal' | 'buy' | 'use' | 'continue' | 'upgrade' | 'abandon';
	value?: string;
	starters?: string[];
	member?: string;
}
