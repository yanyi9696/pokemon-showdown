import { createHash, randomUUID } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import type { RogueRun, RogueAccount, RogueCommand, RogueInventory } from './types';
import { rebuildMember } from './progression';
import { rogueSpirit } from '../../sim/fantasy-rogue-spirits';
import { startCard } from './story';
import { blessing, blessingTitle, type BlessingEffects } from '../../sim/rogue-blessing-data';

export interface RogueClearCard {
	version: 1;
	id: string;
	runId: string;
	owner: string;
	name: string;
	completedAt: number;
	public: boolean;
	contentVersion: string;
	rulesVersion: string;
	snapshot: RogueInventory & {
		floor: 200, boosts: StatsTable, spirit?: string, startCard?: string,
		spiritName?: string, spiritText?: string, cardName?: string, cardText?: string,
		hazards?: string[], blessings: { id: string, text: string }[],
		blessingEffects?: BlessingEffects,
	};
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
	if (run.clearRecorded || !run.owner) return;
	run.clearRecorded = true;
	const team = structuredClone(run.team);
	for (const mon of team) if (!mon.stats) rebuildMember(mon, run.boosts);
	const card: RogueClearCard = {
		version: 1, id: randomUUID(), runId: run.id, owner: run.owner.id, name: run.owner.name,
		completedAt: Date.now(), public: false, contentVersion: run.contentVersion, rulesVersion: rogueRulesVersion(),
		snapshot: {
			team, box: structuredClone(run.box || []), bag: { ...run.bag }, money: run.money,
			floor: 200, boosts: { ...run.boosts }, spirit: run.spirit, startCard: run.startCard,
			spiritName: rogueSpirit(run.spirit)?.name, spiritText: rogueSpirit(run.spirit)?.text,
			cardName: startCard(run.startCard)?.name, cardText: startCard(run.startCard)?.text,
			hazards: structuredClone(run.node?.encounters[run.encounter - 1]?.spiritHazards),
			teraUnlocked: !!run.teraUnlocked,
			megaUnlocked: run.megaUnlocked, gmegaUnlocked: run.gmegaUnlocked, zUnlocked: run.zUnlocked,
			blessings: (run.blessings?.owned || []).map(entry => ({ id: entry.id, name: blessingTitle(entry), text: blessing(entry.id)!.text })),
			blessingEffects: run.blessings && structuredClone({ owned: run.blessings.owned, evolution: run.blessings.evolution, psychic: run.blessings.psychic }),
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
