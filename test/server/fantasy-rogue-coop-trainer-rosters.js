'use strict';
const assert = require('assert').strict;
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { trainerBossCandidates } = require('../../dist/server/fantasy-rogue/trainer-bosses');
const { BOSS_FLOORS } = require('../../dist/server/fantasy-rogue/content');

describe('Fantasy Rogue co-op authored trainer route selection', function () {
	this.timeout(30000);
	for (const legacyDoublesContent of [false, true]) {
		for (const [floor, kind] of BOSS_FLOORS) {
			if (!['道馆', '四天王', '冠军'].includes(kind)) continue;
			it(`uses complete doubles rosters at floor ${floor} with content doubles=${legacyDoublesContent}`, () => {
				const content = createPreviewContent({ doubleBattle: legacyDoublesContent });
				const store = new RogueStore(':memory:');
				try {
					const engine = new RogueEngine(store, content, () => 0);
					const before = structuredClone(engine.content.floors[floor]);
					const routes = engine.prepareCoopRoutes(floor, 0).choices;
					const encounter = routes.find(node => node.kind === 'boss').encounters[0];
					const level = before.find(node => node.kind === 'boss').encounters[0].team[0].level;
					assert.deepEqual(encounter.trainerCandidates, trainerBossCandidates(floor, level, true));
					assert.deepEqual(encounter.team, encounter.trainerCandidates[0].team);
					if (kind === '道馆') for (const candidate of encounter.trainerCandidates) {
						assert.equal(candidate.team.length, floor === 20 ? 2 : floor < 120 ? 4 : 6);
						if (floor <= 40) assert(candidate.team.every(mon => !mon.item));
					}
					assert.deepEqual(engine.content.floors[floor], before, 'Shared content and singles must not be rewritten');
					const saved = structuredClone(routes);
					engine.prepareCoopRoutes(floor, 0);
					assert.deepEqual(routes, saved, 'Preparing later offers must not mutate an existing saved route');
				} finally {
					store.close();
				}
			});
		}
	}
});
