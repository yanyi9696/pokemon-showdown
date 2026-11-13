import { prepareSpiritNode } from './spirits';
import type { RogueCoopAdventure, RogueContent, RogueNode, RogueRun } from './types';
import type { RogueRandom } from './biome-pools';

/** Route rewards belong to the shared adventure; never borrow an owner's purchase/capture ledger. */
export function prepareCoopSpiritNode(
	adventure: RogueCoopAdventure, run: RogueRun, node: RogueNode, content: RogueContent, random: RogueRandom
) {
	if (run.spirit !== 'hoopagift') return prepareSpiritNode(run, node, content, random);
	const personal = run.spiritConversions;
	run.spiritConversions = adventure.spiritConversions || {};
	try {
		prepareSpiritNode(run, node, content, random);
		if (Object.keys(run.spiritConversions).length) adventure.spiritConversions = run.spiritConversions;
	} finally {
		run.spiritConversions = personal;
	}
}
