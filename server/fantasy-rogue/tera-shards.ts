import { BLESSING_TYPES } from '../../sim/rogue-blessing-data';
import type { RogueItem, RogueRun } from './types';

export const teraShardID = (type: string) => 'terashard' + type.toLowerCase();
export function teraShardItems(): RogueItem[] {
	return Object.entries(BLESSING_TYPES).map(([type, name]) => ({
		id: teraShardID(type), name: name + '太晶碎片', kind: 'terashard', teraType: type,
		price: 0, shopFloor: false, category: '太晶碎片',
		description: `集齐 50 片，可在战斗外将一名伙伴的太晶属性更改为${name}。使用后消耗 50 片；不会解锁太晶化系统。`,
	}));
}
/** Import the old blessing ledger exactly once, including its rollback copy. */
export function migrateTeraShards(run: RogueRun) {
	const importInto = (bag: Record<string, number>, state: RogueRun['blessings']) => {
		for (const [type, count] of Object.entries(state?.teraShards || {})) {
			if (!(type in BLESSING_TYPES) || !Number.isSafeInteger(count) || count <= 0) continue;
			const id = teraShardID(type); bag[id] = (bag[id] || 0) + count;
		}
		if (state) delete state.teraShards;
	};
	const legacy = run.blessings?.teraShards && { teraShards: { ...run.blessings.teraShards } };
	importInto(run.bag, run.blessings);
	if (run.checkpoint) importInto(run.checkpoint.bag, run.blessingCheckpoint);
	// The old postgame inventory omitted shards entirely; returning from that challenge must not erase them.
	if (run.postgame && legacy) importInto(run.postgame.before.bag, legacy as RogueRun['blessings']);
}
export function giveTeraShards(run: RogueRun, type: string, count: number) {
	if (!(type in BLESSING_TYPES) || !Number.isSafeInteger(count) || count <= 0) throw new Error('太晶碎片类型或数量无效。');
	migrateTeraShards(run);
	const id = teraShardID(type); run.bag[id] = (run.bag[id] || 0) + count;
}
