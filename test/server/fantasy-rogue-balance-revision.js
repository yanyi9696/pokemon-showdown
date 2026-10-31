'use strict';
const assert = require('assert').strict;
const { PRNG } = require('../../dist/sim/prng');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { chooseEvent, eventView } = require('../../dist/server/fantasy-rogue/events');
const { EVENT_NAMES } = require('../../dist/server/fantasy-rogue/event-text');
const { eventPacingWeight, PREPARATION_EVENTS } = require('../../dist/server/fantasy-rogue/event-pacing');
const { repairSavedEncounters } = require('../../dist/server/fantasy-rogue/encounter-repair');
const { eliteBossCandidates } = require('../../dist/server/fantasy-rogue/elite-bosses');
const { prepareBlessingEncounter } = require('../../dist/server/fantasy-rogue/blessings');
const master = require('../../dist/server/fantasy-rogue/master-ball');
const { set, stats } = require('../fixtures/fantasy-rogue');

const makeRun = floor => ({ id: 'balance-fixture', floor, phase: 'choose', money: 5000, bag: { helixfossil: 1, prettyfeather: 5 },
	team: [createRoguePokemon(set('Mew', 'Synchronize', 35, ['Flamethrower', 'Surf', 'Gust', 'Psychic']), stats(0))],
	blessings: { owned: [], levels: 0, bossLevels: 0, shards: 0 }, boosts: stats(0), eventHistory: [] });

describe('Fantasy Rogue October 27 pacing and boss regression', () => {
	it('excludes every preparation event through floor 30 and restores its weight gradually', () => {
		for (const id of PREPARATION_EVENTS) {
			for (const floor of [1, 20, 30]) assert.equal(eventPacingWeight(floor, id), 0);
			assert.equal(eventPacingWeight(31, id), 0.15);
			assert.equal(eventPacingWeight(50, id), 0.35);
			assert(eventPacingWeight(51, id) > 0.35 && eventPacingWeight(51, id) < 1);
			assert.equal(eventPacingWeight(60, id), 1);
		}
		for (const id of ['forest', 'identityquiz']) {
			assert.equal(eventPacingWeight(1, id), 1.8);
			assert.equal(eventPacingWeight(50, id), 1);
		}
	});
	it('keeps preparation events out of early draws even with inventory, moves, and event history', () => {
		const rng = new PRNG([2026, 10, 27, 1]);
		for (const floor of [1, 30]) {
			const run = makeRun(floor);
			for (let i = 0; i < 600; i++) {
				const id = chooseEvent(run, n => rng.random(n));
				assert(!PREPARATION_EVENTS.has(id), id); assert.notEqual(id, 'masterballgift');
				run.eventHistory.push({ id, floor: Math.max(1, floor - 10) });
			}
		}
	});
	it('does not force unseen preparation events after all simple events have been seen', () => {
		const run = makeRun(40), rng = new PRNG([2026, 10, 27, 2]);
		run.eventHistory = Object.keys(EVENT_NAMES).filter(id => !PREPARATION_EVENTS.has(id)).map(id => ({ id, floor: 1 }));
		const ids = new Set(Array.from({ length: 600 }, () => chooseEvent(run, n => rng.random(n))));
		assert([...ids].some(id => PREPARATION_EVENTS.has(id)));
		assert([...ids].some(id => !PREPARATION_EVENTS.has(id)));
		assert(!ids.has('masterballgift'));
	});
	it('keeps already selected early preparation events usable across reconnect', () => {
		const run = makeRun(12); run.phase = 'event';
		run.node = { id: 'event0', event: { id: 'feathers', key: 'saved', stage: 'choice' } };
		const view = eventView(run);
		assert(view.options.some(o => o.id === 'feathertrade' && !o.disabled));
	});
	it('uses level 15/20 at the first elite after gold/prismatic tax without applying the tax twice', () => {
		const content = createPreviewContent();
		for (const tax of [5, 10]) for (const candidate of eliteBossCandidates(10)) {
			const run = makeRun(10); run.phase = 'ready'; run.blessings.bossLevels = tax;
			run.node = structuredClone(content.floors[10][0]);
			run.node.encounters[0].team = [candidate];
			prepareBlessingEncounter(run, () => 0);
			assert.equal(run.node.encounters[0].team.at(-1).level, 10 + tax);
			repairSavedEncounters(run); prepareBlessingEncounter(run, () => 0);
			assert.equal(run.node.encounters[0].team.at(-1).level, 10 + tax);
		}
	});
	it('repairs cached and prepared legacy elite levels while preserving escorts, saves and active battles', () => {
		for (const tax of [5, 10]) {
			const run = makeRun(10); run.phase = 'ready';
			const elite = { ...eliteBossCandidates(10)[0], level: 8 + tax };
			run.node = { id: 'boss', kind: 'boss', blessingPrepared: true, encounters: [{ team: [set(), elite], escortCount: 1, blessingLevelOffsets: [0, tax] }] };
			run.bossPreviews = { 10: { id: 'boss', kind: 'boss', encounters: [{ team: [{ ...elite, level: 8 }], blessingLevelOffsets: [tax] }] } };
			const own = structuredClone(run.team), escort = structuredClone(run.node.encounters[0].team[0]);
			repairSavedEncounters(run);
			assert.equal(elite.level, 10 + tax); assert.equal(run.bossPreviews[10].encounters[0].team[0].level, 10);
			assert.deepEqual(run.team, own); assert.deepEqual(run.node.encounters[0].team[0], escort);
			const saved = structuredClone(run); repairSavedEncounters(run); assert.deepEqual(run, saved);
			elite.level = 8 + tax; run.phase = 'battle';
			repairSavedEncounters(run); assert.equal(elite.level, 8 + tax);
		}
	});
	it('recovers an orphaned legacy Master Ball event exactly once without granting duplicate inventory', () => {
		const run = makeRun(52); run.phase = 'event';
		run.node = { id: 'event0', kind: 'event', event: { id: 'masterballgift', key: 'legacy', stage: 'choice' } };
		const own = structuredClone(run.team);
		master.repairMasterBallEvent(run); master.repairMasterBallEvent(run);
		assert.equal(eventView(run).options[0].id, 'promise'); assert.deepEqual(run.team, own);
		const account = { run };
		master.chooseMasterBall(account, run, { member: eventView(run).key, value: 'promise' });
		assert(master.selectMasterBallRoute(run, 'masterballreward'));
		master.chooseMasterBall(account, run, { member: eventView(run).key, value: 'claim' });
		assert.equal(run.bag.masterball, 1);
		assert.equal(eventView(run).stage, 'result'); assert.equal(run.phase, 'event');
		run.phase = 'event'; run.node = { id: 'event1', kind: 'event', event: { id: 'masterballgift', key: 'legacy2', stage: 'choice' } };
		master.repairMasterBallEvent(run); master.repairMasterBallEvent(run);
		assert.equal(eventView(run).stage, 'result'); assert.deepEqual(eventView(run).options, []);
		assert.equal(run.bag.masterball, 1); assert.equal(account.masterBalls.obtained.length, 1);
	});
});
