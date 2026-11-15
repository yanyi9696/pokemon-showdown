'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Dex, PRNG } = require('../../dist/sim');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { EVENT_NAMES, eventView, chooseEventOption, settleEventBattle, forestTeams } = require('../../dist/server/fantasy-rogue/events');
const { beginJourneyActivity } = require('../../dist/server/fantasy-rogue/journey-activities');
const { beginExpedition, beginTeraSolo } = require('../../dist/server/fantasy-rogue/expedition-events');
const { normalizeBlessings, handleBlessingCommand } = require('../../dist/server/fantasy-rogue/blessings');
const { set, stats, commandAfterOpening } = require('../fixtures/fantasy-rogue');

// Special invitations, follow-ups and authored quests have dedicated fixture suites.
const special = new Set(['masterballgift', 'travellermeeting', 'rivalstory', 'companionrematch', 'policeassist',
	'policerevenge', 'honeymoon', 'honeymoonreturn', 'greninjatraining', 'greninjareturn', 'exclusiveclue',
	'exclusivechallenge', 'auction', 'legendarytracks']);
const partners = { stonegate: 'Yamask-Galar', invertedstars: 'Inkay', sweetdance: 'Milcery', peatmoon: 'Ursaring',
	unioncircle: 'Finizen', kubfuscroll: 'Kubfu', evolutiondojo: 'Primeape', fantasytutor: 'Tyranitar-Fantasy', feathers: 'Pidgeot' };

describe('Fantasy Rogue event lifecycle / reward / continuation sampling', function () {
	this.timeout(20000);
	const content = createPreviewContent();
	// The special story router is exercised separately; here continue must advance the event floor.
	const ordinaryContent = { ...content, story: undefined };
	for (const id of Object.keys(EVENT_NAMES).filter(id => !special.has(id))) {
		for (const seed of [1, 7, 19]) it(`${id} seed ${seed}: resolves legal choices, rejects replay and continues after reload`, () => {
			const rng = new PRNG([seed, 2, 8, 4]), random = n => rng.random(n);
			const store = new RogueStore(':memory:');
			const now = Date.now; let clock = 200000; Date.now = () => clock;
			try {
				const account = store.get('event-lifecycle');
				const species = partners[id] || 'Mew';
				const mon = createRoguePokemon(set(species, Dex.mod('gen9fantasy').species.get(species).abilities[0], 60), stats(0), 'event-mon');
				const run = account.run = { id: 'event-lifecycle', contentVersion: content.version, floor: 85, phase: 'event',
					encounter: 0, attempt: 0, difficulty: 0, difficultyRulesVersion: 4, startingSlots: 2,
					team: [mon], caught: [], boosts: stats(0), money: 50000,
					bag: { strawberrysweet: 1, peatblock: 1, helixfossil: 1, prettyfeather: 3, tinymushroom: 2 },
					node: { id, name: EVENT_NAMES[id], kind: 'event', encounters: [], reward: { money: 0, items: {} },
						event: { id, key: randomUUID(), stage: 'choice' } },
				};
				run.checkpoint = { team: structuredClone(run.team), money: run.money, bag: { ...run.bag } };
				normalizeBlessings(run); run.blessings.shards = 100;
				if (id === 'hatchhouse') mon.egg = { found: 80, hatch: 90 };
				beginJourneyActivity(run, random); beginExpedition(run);
				if (id === 'terasolo') beginTeraSolo(run, () => 0);
				if (id === 'forest') run.node.event.teams = forestTeams(40, random);
				if (id === 'mysteryball') run.node.event.ball = 'pokeball';
				const path = [];
				for (let step = 0; step < 80 && !run.node.event.settled; step++) {
					if (run.node.event.stage === 'battle') {
						run.encounter = run.node.encounters.length - 1;
						if (run.node.event.activity) Object.assign(run.node.event.activity, { lastTurns: 4, allySurvived: true });
						settleEventBattle(run, content, random, seed !== 7, false, account);
						path.push(seed === 7 ? 'battle-loss' : 'battle-win'); continue;
					}
					const view = eventView(run), options = [...(view.options || []), ...(view.picker?.options || [])].filter(o => !o.disabled);
					assert(options.length, `${id}: no legal choice after ${path.join(',')}`);
					const prefer = options.filter(o => !['leave', 'back'].includes(o.id));
					const ending = options.find(o => ['finish', 'fishfinish', 'stonefinish', 'leave'].includes(o.id));
					const choice = step > 12 && ending ? ending : (prefer.length ? prefer : options)[random((prefer.length ? prefer : options).length)];
					clock += 16000;
					const key = run.node.event.key;
					chooseEventOption(account, run, content, random, key, choice.id,
						view.evAllocation ? { ...stats(0), atk: view.evAllocation.total } : undefined);
					path.push(choice.id);
					assert(run.money >= 0 && Number.isFinite(run.money));
					assert(Object.values(run.bag).every(count => Number.isFinite(count) && count >= 0));
				}
				assert(run.node.event.settled, `${id}: did not settle: ${path.join(',')}`);
				const snapshot = structuredClone(run);
				assert.throws(() => chooseEventOption(account, run, content, random, run.node.event.key, path[0]));
				settleEventBattle(run, content, random, true, false, account);
				assert.deepEqual(run, snapshot, 'repeat choice / settlement must not pay twice');
				const settledPhase = run.phase;
				// Resolve the real reward queue, including a choice to keep newly gifted partners.
				for (let i = 0; run.blessings.pending.length && i < 20; i++) {
					run.phase = 'blessing';
					const reward = run.blessings.pending[0];
					handleBlessingCommand(account, run, content, { action: 'blessingreward', member: reward.id,
						value: reward.kind === 'gift' ? 'join' : reward.options[0] }, random);
				}
				assert.equal(run.blessings.pending.length, 0);
				run.phase = settledPhase;
				store.change('event-lifecycle', target => Object.assign(target, JSON.parse(JSON.stringify(account))));
				const engine = new RogueEngine(store, ordinaryContent, random);
				const cmd = (action, extra = {}) => commandAfterOpening(engine, 'event-lifecycle', {
					id: randomUUID(), revision: store.get('event-lifecycle').revision, action, ...extra,
				});
				while (store.get('event-lifecycle').run.pendingMoves?.length) {
					cmd('learn', { member: store.get('event-lifecycle').run.pendingMoves[0].member, value: 'skip' });
				}
				for (const member of store.get('event-lifecycle').run.team.filter(p => p.evolutionNotice)) cmd('evolutionnotice', { member: member.id });
				cmd('continue');
				const resumed = store.get('event-lifecycle').run;
				assert(resumed.floor === 86 || resumed.blessings.afterFloor, `${id}: ${resumed.phase}, ${resumed.floor}`);
			} finally { Date.now = now; store.close(); }
		});
	}
});
