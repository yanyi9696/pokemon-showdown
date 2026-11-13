'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {set, stats, content} = require('../fixtures/fantasy-rogue');
const {createRoguePokemon} = require('../../dist/server/fantasy-rogue/progression');
const {normalizeBlessings} = require('../../dist/server/fantasy-rogue/blessings');
const {RIVALS} = require('../../dist/server/fantasy-rogue/rival-data');
const native = require('../../dist/server/fantasy-rogue/rivals');
const coop = require('../../dist/server/fantasy-rogue/coop-rivals');

function run(id, chapter = 1, score = 0) {
	const floor = [1, 31, 48, 65, 81, 99, 119, 139][chapter - 1];
	const result = {id: randomUUID(), contentVersion: 'test', floor, phase: 'event', encounter: 0, attempt: 0,
		money: 100, bag: {}, boosts: stats(0), team: [createRoguePokemon(set('Bulbasaur', 'Overgrow', 35), stats(0))],
		caught: [], startingSlots: 1, difficulty: 0, notices: [],
		node: {id: 'rival', kind: 'adventure', name: '相遇', encounters: [], reward: {money: 0, items: {}}}};
	normalizeBlessings(result);
	if (id) {
		result.rival = {id, completed: chapter - 1, lastFloor: Math.max(0, floor - 15), affection: score};
		result.trainerBonds = {[id]: {score, gifts: [], pending: []}};
	}
	return result;
}

function finish(runs, random = () => 0, won = true) {
	const battles = [];
	for (let turn = 0; turn < 40; turn++) {
		if (runs.every(r => r.node.event.settled)) return battles;
		if (runs.every(r => r.node.event.stage === 'battle')) {
			battles.push({encounter: runs[0].encounter, count: runs[0].node.encounters.length});
			assert.deepEqual(runs[0].node.encounters, runs[1].node.encounters);
			if (!coop.settleCoopRival(runs, random, won)) for (const r of runs) r.encounter++;
		} else {
			const options = coop.coopRivalOptions(runs).map(option => option.id);
			assert(options.length, 'the shared story must always have a next choice');
			const choice = ['solo', 'carmine:stay', 'shards', 'lusamine:trust', 'carmine:listen', 'greet:warm', 'warm', 'start']
				.find(id => options.includes(id)) || options[0];
			coop.chooseCoopRival(runs, content(), random, choice);
		}
	}
	assert.fail('rival chapter did not settle');
}

describe('Fantasy Rogue cooperative rival state adapter', () => {
	it('selects one shared rival while excluding both parties existing companions and preserving affinity', () => {
		const runs = [run(), run()];
		runs[1].socialCompanions = [{id: 'nemona', origin: 'event', preferences: 0, counted: []}];
		coop.beginCoopRival(runs, () => 0);
		assert.equal(runs[0].rival.id, runs[1].rival.id); assert.notEqual(runs[0].rival.id, 'nemona');
		assert.equal(runs[0].node.event.key, runs[1].node.event.key);
		assert.equal(runs[0].rival.affection, 2); assert.equal(runs[1].rival.affection, 2);
		assert(runs[0].node.event.result.length > 0);
	});
	for (const id of ['silver', 'kieran', 'lillie', 'gladion']) {
		for (let chapter = 1; chapter <= 8; chapter++) it(`completes ${id} chapter ${chapter} for both personal states`, () => {
			const runs = [run(id, chapter, 0), run(id, chapter, 20)];
			coop.beginCoopRival(runs, () => 0); const battles = finish(runs);
			for (const r of runs) { assert.equal(r.rival.completed, chapter); assert(r.node.event.settled); }
			if (chapter === 2) assert.deepEqual(battles.map(b => b.encounter), [0, 1]);
			if (chapter === 7) assert.deepEqual(battles.map(b => b.encounter), [0, 1, 2]);
			if (chapter === 6) for (const r of runs) assert(r.blessings.shards >= 100);
			if (chapter === 8) for (const r of runs) {
				assert(r.rival.permanent || r.companionInvitations?.some(invite => invite.id === id && invite.permanent));
				assert(r.blessings.shards >= 150);
			}
		});
	}
	it('keeps a failed cooperative chapter incomplete but advances the native first friendly match', () => {
		for (const chapter of [1, 2, 3, 6, 7, 8]) {
			const runs = [run('silver', chapter), run('silver', chapter)];
			coop.beginCoopRival(runs, () => 0); finish(runs, () => 0, false);
			assert.equal(runs[0].rival.completed, [1, 6, 8].includes(chapter) ? chapter : chapter - 1);
			assert.equal(runs[0].rival.completed, runs[1].rival.completed);
		}
	});
	it('uses one shared search branch and answer while preserving different personal friendship', () => {
		const runs = [run('silver', 5, 0), run('silver', 5, 40)];
		coop.beginCoopRival(runs, () => 0); const calls = [];
		const random = max => { calls.push(max); return max - 1; };
		coop.chooseCoopRival(runs, content(), random, 'greet:warm');
		coop.chooseCoopRival(runs, content(), random, 'greet:honest');
		assert.deepEqual(calls, [2, 3]);
		assert.equal(runs[0].node.event.rival.task, 'search'); assert.equal(runs[0].node.event.rival.answer, 2);
		assert.deepEqual(runs[0].node.event.rival, runs[1].node.event.rival);
		assert(runs[1].rival.affection > runs[0].rival.affection);
		finish(runs, () => 0); assert.equal(runs[0].rival.completed, 5);
	});
	it('handles a shared invitation without renewing an exhausted personal temporary invite', () => {
		const runs = [run('silver', 4, 15), run('silver', 4, 15)];
		runs[1].rival.temporaryUsed = true;
		coop.beginCoopRival(runs, () => 0);
		for (const choice of ['greet:warm', 'greet:warm', 'warm', 'warm', 'warm']) {
			coop.chooseCoopRival(runs, content(), () => 0, choice);
		}
		assert(coop.coopRivalOptions(runs).some(option => option.id === 'join'));
		assert(runs[1].node.event.settled);
		coop.chooseCoopRival(runs, content(), () => 0, 'join');
		assert(runs[0].rival.temporaryUntil > runs[0].floor); assert(!runs[1].rival.temporaryUntil);
		assert(runs.every(r => r.node.event.settled));
	});
	it('expires each temporary companion once without changing the partner permanent friendship', () => {
		const runs = [run('silver', 4, 20), run('silver', 4, 60)];
		runs[0].rival.temporaryUntil = 65; runs[1].rival.permanent = true;
		coop.expireCoopRivals(runs, 66); const bags = runs.map(r => ({...r.bag}));
		assert(!runs[0].rival.temporaryUntil); assert(runs[0].rival.temporaryUsed);
		assert(runs[1].rival.permanent); assert.equal(runs[1].rival.affection, 60);
		assert(runs[0].notices.length); assert.deepEqual(runs[1].bag, {});
		coop.expireCoopRivals(runs, 67); assert.deepEqual(runs.map(r => r.bag), bags);
	});
	it('does not replace a different saved rival or chapter to force synchronization', () => {
		const runs = [run('silver', 3), run('kieran', 3)], before = structuredClone(runs);
		assert.throws(() => coop.beginCoopRival(runs, () => 0)); assert.deepEqual(runs, before);
		const routes = [{id: 'grass', kind: 'wild', encounters: [], reward: {money: 0, items: {}}}];
		assert.deepEqual(coop.coopRivalRoutes(runs, routes, () => 0), routes);
	});
	it('retains native route timing and chance when both chapter states agree', () => {
		const routes = [{id: 'grass', kind: 'wild', encounters: [], reward: {money: 0, items: {}}}];
		for (const chapter of [1, 2, 6, 8]) for (const roll of [0, 44, 84, 98]) {
			const runs = [run('silver', chapter), run('silver', chapter)];
			assert.deepEqual(coop.coopRivalRoutes(runs, routes, () => roll), native.rivalRoutes(runs[0], routes, () => roll));
		}
	});
	it('keeps reward quantities, healing and chapter progression equal to native chapters', () => {
		for (const chapter of [1, 2, 4, 5, 6, 7, 8]) {
			const runs = [run('silver', chapter), run('silver', chapter, 20)];
			const singles = structuredClone(runs);
			coop.beginCoopRival(runs, () => 0); finish(runs);
			for (const [index, single] of singles.entries()) {
				native.beginRival(single, () => 0);
				for (let turn = 0; turn < 40 && !single.node.event.settled; turn++) {
					if (single.node.event.stage === 'battle') {
						native.settleRival(single, () => 0, true);
						if (single.node.event.stage === 'battle') single.encounter++;
					} else {
						const options = native.rivalView(single).options.map(option => option.id);
						const choice = ['solo', 'shards', 'greet:warm', 'warm', 'start'].find(id => options.includes(id)) || options[0];
						native.chooseRival(single, content(), () => 0, choice);
					}
				}
				assert(single.node.event.settled);
				assert.equal(runs[index].money, single.money); assert.deepEqual(runs[index].bag, single.bag);
				assert.equal(runs[index].blessings.shards, single.blessings.shards);
				assert.equal(runs[index].rival.affection, single.rival.affection);
				assert.equal(runs[index].rival.completed, single.rival.completed);
			}
		}
	});
	it('rejects a diverged conversation cursor without applying either reply', () => {
		const runs = [run('silver'), run('silver')]; coop.beginCoopRival(runs, () => 0);
		runs[1].node.event.rival.conversationTurn = 1; const before = structuredClone(runs);
		assert.deepEqual(coop.coopRivalOptions(runs), []);
		assert.throws(() => coop.chooseCoopRival(runs, content(), () => 0, 'greet:warm'));
		assert.deepEqual(runs, before);
	});
	it('keeps both temporary companions personal when only one party may invite Carmine again', () => {
		const runs = [run('kieran', 4, 15), run('kieran', 4, 15)];
		for (const r of runs) r.rival.carmine = {affection: 15};
		runs[1].rival.carmine.temporaryUsed = true;
		coop.beginCoopRival(runs, () => 0);
		for (const r of runs) r.node.event.rival = {chapter: 4, step: 'invite'};
		coop.chooseCoopRival(runs, content(), () => 0, 'joinboth');
		assert(runs[0].rival.temporaryUntil); assert(runs[0].rival.carmine.temporaryUntil);
		assert(runs[1].rival.temporaryUntil); assert(!runs[1].rival.carmine.temporaryUntil);
		assert(runs[1].rival.carmine.temporaryUsed);
	});
	it('does not duplicate Lusamine when the shared invitation meets an existing personal companion', () => {
		const runs = [run('lillie', 4), run('lillie', 4)];
		runs[0].socialCompanions = [{id: 'lusamine', origin: 'event', preferences: 0, counted: []}];
		coop.beginCoopRival(runs, () => 0);
		for (const r of runs) r.node.event.rival = {chapter: 4, step: 'lusamine'};
		coop.chooseCoopRival(runs, content(), () => 0, 'lusamine:join');
		for (const r of runs) {
			assert.equal(r.socialCompanions.filter(c => c.id === 'lusamine' && !c.away).length, 1);
			assert.equal(r.trainerBonds.lusamine.score, 2);
		}
	});
	it('reduces repeat selection weight for either player previous rival', () => {
		const runs = [run(), run()]; runs[0].previousRival = 'silver'; runs[1].previousRival = 'kieran';
		const calls = []; coop.beginCoopRival(runs, max => {calls.push(max); return 0;});
		assert.deepEqual(calls, [Object.keys(RIVALS).length * 4 - 6]);
	});
});
