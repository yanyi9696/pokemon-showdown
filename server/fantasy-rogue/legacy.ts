import { createHash, randomUUID } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import type { RogueRun, RogueAccount, RogueCommand, RogueInventory } from './types';
import { rebuildMember } from './progression';
import { rogueSpirit } from '../../sim/fantasy-rogue-spirits';
import { startCard } from './story';
import { blessing, type BlessingEffects } from '../../sim/rogue-blessing-data';
import { blessingDisplay } from './blessing-text';
import { clearMemberDetails, type ClearMemberDetails } from './clear-details';
import { eggView } from './eggs';
import type { RivalState } from './rivals';
import { RIVALS } from './rival-data';
import { clearDifficulty, syncRunDifficulty } from './difficulty';
import { difficultyCardScale, difficultyLabel, ROGUE_DIFFICULTY_VERSION, type RogueDifficulty } from '../../sim/rogue-difficulty';

export interface RogueClearCard {
	version: 1 | 2;
	id: string;
	runId: string;
	owner: string;
	name: string;
	completedAt: number;
	public: boolean;
	contentVersion: string;
	rulesVersion: string;
	snapshot: RogueInventory & {
		difficulty?: RogueDifficulty, difficultyRulesVersion?: number, difficultyLabel?: string,
		difficultyScale?: number, difficultyTest?: boolean,
		boostRuleVersion?: 2,
		floor: 200, boosts: StatsTable, spirit?: string, startCard?: string, eventBuff?: boolean,
		spiritName?: string, spiritText?: string, spiritSpecies?: string, cardName?: string, cardText?: string,
		hazards?: string[], blessings: { id: string, name?: string, floor?: number, text: string }[],
		memberDetails?: Record<string, ClearMemberDetails>,
		blessingEffects?: BlessingEffects,
		rival?: RivalState & { name: string },
		trainerBonds?: Record<string, import('./affection').TrainerBond>,
	};
}
/** Keep the original hatch roll in storage, never expose it in public clear cards. */
export function clearCardView(card: RogueClearCard) {
	const view = structuredClone(card);
	const display = (mon: RogueInventory['team'][number]) => mon.egg ? eggView(mon, 200) : mon;
	return { ...view, snapshot: { ...view.snapshot, team: view.snapshot.team.map(display), box: view.snapshot.box?.map(display) } };
}
let fingerprint: string | undefined;
/** A balance/engine change must not silently reinterpret an archived team. */
export function rogueRulesVersion() {
	if (fingerprint) return fingerprint;
	const hash = createHash('sha256');
	const visit = (path: string) => {
		for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			const next = join(path, entry.name);
			if (entry.isDirectory()) visit(next);
			else if (/\.(js|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
				hash.update(next.replace(/\\/g, '/').split('/dist/').pop()!);
				hash.update(readFileSync(next));
			}
		}
	};
	visit(resolve(__dirname, '../../sim'));
	visit(resolve(__dirname, '../../data'));
	const extension = __filename.endsWith('.ts') ? 'ts' : 'js';
	hash.update(readFileSync(resolve(__dirname, `../../config/formats.${extension}`)));
	fingerprint = `rogue-duel-v1:${hash.digest('hex')}`;
	return fingerprint;
}
export function recordClear(account: RogueAccount, run: RogueRun) {
	clearDifficulty(account, run);
	if (run.floor === 200 && run.phase === 'complete') {
		if (run.spirit && !run.difficultyTest) account.unlockedSpirits = [...new Set([...account.unlockedSpirits || [], run.spirit])];
		else if (!run.difficulty && !run.difficultyTest) account.spiritUnlocked = true;
	}
	if (run.clearRecorded || !run.owner) return;
	syncRunDifficulty(run);
	run.clearRecorded = true;
	const team = structuredClone(run.team);
	const box = structuredClone(run.box || []);
	for (const mon of [...team, ...box]) {
		mon.difficulty = { tier: run.difficulty || 0, floor: 200, card: true, version: ROGUE_DIFFICULTY_VERSION };
		rebuildMember(mon, run.boosts);
	}
	const detailsRun = { ...run, team, box };
	const card: RogueClearCard = {
		version: 2, id: randomUUID(), runId: run.id, owner: run.owner.id, name: run.owner.name,
		completedAt: Date.now(), public: false, contentVersion: run.contentVersion, rulesVersion: rogueRulesVersion(),
		snapshot: {
			difficulty: run.difficulty || 0, difficultyRulesVersion: ROGUE_DIFFICULTY_VERSION,
			difficultyLabel: difficultyLabel(run.difficulty), difficultyScale: difficultyCardScale(run.difficulty),
			difficultyTest: run.difficultyTest,
			team, box, bag: { ...run.bag }, money: run.money,
			memberDetails: Object.fromEntries([...team, ...box].filter(mon => !mon.egg).map(mon => [mon.id, clearMemberDetails(mon, detailsRun)])),
			growth: run.growth && { ...run.growth },
			rival: run.rival && { ...run.rival,
				affection: run.trainerBonds?.[run.rival.id]?.score ?? run.rival.affection,
				name: RIVALS[run.rival.id].name },
			trainerBonds: structuredClone(run.trainerBonds),
			floor: 200, boosts: { ...run.boosts }, boostRuleVersion: run.boostRuleVersion,
			spirit: run.spirit, startCard: run.startCard,
			eventBuff: !!run.eventBuff?.battles,
			spiritName: rogueSpirit(run.spirit)?.name, spiritText: rogueSpirit(run.spirit)?.text,
			spiritSpecies: rogueSpirit(run.spirit)?.species,
			cardName: startCard(run.startCard)?.name, cardText: startCard(run.startCard)?.text,
			hazards: structuredClone(run.node?.encounters[run.encounter - 1]?.spiritHazards),
			teraUnlocked: !!run.teraUnlocked,
			megaUnlocked: run.megaUnlocked, gmegaUnlocked: run.gmegaUnlocked, zUnlocked: run.zUnlocked,
			blessings: (run.blessings?.owned || []).map(entry => {
				const { name, text } = blessingDisplay(blessing(entry.id)!, entry.floor, account.tonicSecret, entry.type);
				return { id: entry.id, name, floor: entry.floor, text };
			}),
			blessingEffects: run.blessings && structuredClone({ owned: run.blessings.owned, evolution: run.blessings.evolution,
				psychic: run.blessings.psychic, dragonKing: run.blessings.dragonKing, companions: run.blessings.companions,
				companionZ: run.blessings.companionZ, catAbilities: run.blessings.catAbilities }),
		},
	};
	const cards = account.cards ||= [];
	if (cards.length < 3) cards.push(card);
	else account.pendingClear = card;
}
export function editClearCard(account: RogueAccount, command: RogueCommand) {
	const cards = account.cards ||= [];
	if (command.action === 'saveclear') {
		if (!account.pendingClear) throw new Error('没有待保存的通关卡。');
		if (command.value !== 'discard') {
			if (cards.length < 3 && !command.value) cards.push(account.pendingClear);
			else {
				const index = cards.findIndex(card => card.id === command.value);
				if (index < 0) throw new Error('请明确选择要替换的通关卡。');
				cards[index] = account.pendingClear;
			}
		}
		delete account.pendingClear;
		return;
	}
	const index = cards.findIndex(card => card.id === command.member);
	if (index < 0) throw new Error('通关卡不存在或不属于当前账号。');
	if (command.action === 'publishcard') {
		if (!['public', 'private'].includes(command.value || '')) throw new Error('展示状态无效。');
		cards[index].public = command.value === 'public';
	} else if (command.action === 'deletecard') {
		cards.splice(index, 1);
	}
}
