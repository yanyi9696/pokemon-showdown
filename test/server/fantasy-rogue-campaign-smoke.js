'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { PRNG } = require('../../dist/sim/prng');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { storyView } = require('../../dist/server/fantasy-rogue/story');
const { eventView } = require('../../dist/server/fantasy-rogue/events');
const { rewardSceneView } = require('../../dist/server/fantasy-rogue/reward-scenes');
const { chooseCompanions } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue continuous 200-floor campaign smoke', function () {
	this.timeout(60000);
	// Exercise every floor transition and native battle setup/settlement, with controlled wins.
	// Move mechanics, event branches and balance are covered by their dedicated suites.
	for (const spirit of [undefined, 'necrozma', 'jirachi']) {
		it(`finishes the prologue, 200 floors and a saved clear under ${spirit || 'no spirit'}`, () => {
			const store = new RogueStore(':memory:');
			const content = { ...createPreviewContent(), story: true };
			const rng = new PRNG([10, 15, 20, 26]);
			const random = max => rng.random(max);
			let engine = new RogueEngine(store, content, random, true);
			const user = 'campaignsmoke';
			const account = () => store.get(user);
			const cmd = (action, extra = {}) => engine.command(user, {
				id: randomUUID(), revision: account().revision, action, ...extra,
			});
			const view = () => storyView(account(), true, engine.localSpirits);
			const floors = new Set(), restored = new Set(), refreshed = new Set(), checkpoints = new Set();
			let battles = 0;
			try {
				while (view()?.key) cmd('storynext', { value: view().key });
				cmd('start', { starters: ['bulbasaur'], useSpirit: !!spirit, testSpirit: spirit });
				for (let steps = 0; steps < 3000; steps++) {
					const run = account().run;
					floors.add(run.floor);
					if (view()?.key) {
						cmd('storynext', { value: view().key });
						continue;
					}
					if (run.story?.stage === 'cards') {
						cmd('startcard', { value: 'grass' });
						continue;
					}
					if (run.story?.stage === 'spiritEffect') {
						cmd('spiritack');
						continue;
					}
					if (run.phase === 'complete') break;
					if (run.floor % 25 === 0 && !restored.has(run.floor)) {
						restored.add(run.floor);
						engine = new RogueEngine(store, content, random, true);
						engine.migrate(user);
						assert.equal(account().run.floor, run.floor);
						assert.equal(account().run.phase, run.phase);
						assert.deepEqual(account().run.choices, run.choices, 'restoration must not reroll routes');
					}
					if (run.pendingMoves?.length) {
						cmd('learn', { member: run.pendingMoves[0].member, value: 'skip' });
						continue;
					}
					switch (run.phase) {
					case 'postgame':
						cmd('godchallenge', { value: 'decline' });
						break;
					case 'choose': {
						const options = run.choices.filter(node => node.kind !== 'event');
						assert(options.length, `route set at ${run.floor}: ${run.choices.map(node => node.kind).join(', ')}`);
						cmd('select', { value: options[run.floor % options.length].id });
						break;
					}
					case 'ready': {
						chooseCompanions(engine, user, cmd);
						const king = run.blessings?.dragonKing;
						if (king && !king.ability) cmd('dragonking', { member: king.member, value: 'drizzle' });
						cmd('battle');
						const current = account().run;
						if (current.phase !== 'battle') break;
						const encounter = current.node.encounters[current.encounter], cooperative = encounter.cooperative;
						const team = engine.battleState(user).team;
						const battle = new Battle({
							formatid: cooperative ? 'gen9fantasyroguecoop' : 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: engine.battleState(user),
							p1: { name: 'Player', team: team.map(mon => mon.set) },
							p2: { name: 'Opponent', team: cooperative ? encounter.team.slice(0, Math.ceil(encounter.team.length / 2)) : encounter.team },
							...(cooperative ? {p3: {name: cooperative.name, team: cooperative.team},
								p4: {name: 'Opponent2', team: encounter.team.slice(Math.ceil(encounter.team.length / 2))}} : {}),
						});
						try {
							assert(battle.choose('p1', 'default'));
							assert(battle.choose('p2', 'default'));
							if (cooperative) { assert(battle.choose('p3', 'default')); assert(battle.choose('p4', 'default')); }
							battle.win(battle.p1);
							const result = rogueBattleResult(battle);
							assert(result.won);
							engine.settle(user, current.battle.token, result);
							const settled = account();
							engine.settle(user, current.battle.token, result);
							assert.deepEqual(account(), settled, 'a repeated result must not grant rewards twice');
							if (account().run.preview?.stage === 'result') cmd('previewresult', {value: 'accept'});
							battles++;
						} finally {
							battle.destroy();
						}
						break;
					}
					case 'rest': case 'reward':
						if (run.node.rewardScene && !run.node.rewardScene.claimed) {
							const choices = rewardSceneView(run).choices;
							cmd('rewardchoice', {value: choices.find(o => o.id === 'experience')?.id || choices[0].id}); break;
						}
						if (account().run.mentorOffer) cmd('mentorcard', {value: 'balanced'}); cmd('continue');
						break;
					case 'event': {
						const event = run.node.event;
						assert(['auction', 'exclusivechallenge', 'mushroomcollector', 'policeassist', 'policerevenge', 'terasolo', 'rivalstory'].includes(event.id), event.id);
						if (event.police?.choices) { cmd('event', {member: event.key, value: 'police:' + event.police.choices[0]}); break; }
						if (event.id === 'mushroomcollector') { cmd('event', {member: event.key, value: 'collectorshop'}); break; }
						if (event.stage === 'result') cmd('continue');
						else if (event.rival) {
							const choices = eventView(run).options;
							cmd('event', {member: event.key, value: choices.find(o => ['warm', 'join', 'shards'].includes(o.id))?.id || choices[0].id});
						}
						else cmd('event', {member: event.key, value: run.auction.entered ? 'pass' : 'enter'});
						break;
					}
					case 'blessing': {
						const state = run.blessings;
						if (state.pending.length) {
							const reward = state.pending[0];
							const value = reward.kind === 'gift' ? (run.team.length < 6 ? 'join' : 'release') : reward.options?.[0];
							cmd('blessingreward', reward.kind === 'compound' ? require('../fixtures/fantasy-rogue').compoundCommand(run, reward) : { member: reward.id, value });
						} else if (state.stage) {
							if ([50, 100, 150].includes(run.floor)) checkpoints.add(run.floor);
							cmd('blessing', { value: state.stage.options[0] });
						} else {
							assert(state.round, 'blessing checkpoint must have a resolvable choice');
							checkpoints.add(run.floor);
							const slot = state.round.options.findIndex(option => !option.chosen);
							if (!refreshed.has(run.floor) && state.round.options[slot].refreshes) {
								refreshed.add(run.floor);
								cmd('blessingrefresh', { slot });
							} else {
								cmd('blessing', { slot });
							}
						}
						break;
					}
					default:
						assert.fail(`unhandled campaign phase at ${run.floor}: ${run.phase}`);
					}
				}
				const completed = account();
				assert.equal(completed.run.phase, 'complete');
				assert(!completed.run.story, 'ending dialogue must finish');
				assert.deepEqual([...floors], Array.from({ length: 200 }, (_, i) => i + 1));
				assert.deepEqual([...checkpoints], [1, 50, 100, 150]);
				assert(battles > 100, 'include wild chains, elites and all fixed bosses');
				assert(completed.run.gymGiftReceived);
				assert.equal(completed.cards.length, 1);
				const card = completed.cards[0];
				assert.equal(card.snapshot.spirit, spirit);
				assert.equal(card.snapshot.startCard, 'grass');
				assert.deepEqual(card.snapshot.team, completed.run.team);
				cmd('publishcard', { member: card.id, value: 'public' });
				assert.equal(store.gallery()[0].id, card.id);
				cmd('newstory');
				assert.equal(view().stage, 'opening');
				assert.equal(account().cards[0].id, card.id);
			} finally {
				store.close();
			}
		});
	}
});
