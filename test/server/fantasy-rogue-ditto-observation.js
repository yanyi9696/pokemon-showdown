'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Dex } = require('../../dist/sim/dex');
const { Format } = require('../../dist/sim/dex-formats');
const { TeamValidator } = require('../../dist/sim/team-validator');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { eventView, chooseEventOption } = require('../../dist/server/fantasy-rogue/events');
const { beginJourneyActivity } = require('../../dist/server/fantasy-rogue/journey-activities');
const { journeyCoins } = require('../../dist/server/fantasy-rogue/early-balance');
const { tradeItem, machineMoves } = require('../../dist/server/fantasy-rogue/trading');
const { drawObservation, observationPool, observationMachines, DITTO_SIGNATURE_MOVES } =
	require('../../dist/server/fantasy-rogue/ditto-observation');
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue varied Ditto observation', function () {
	this.timeout(20000);
	const dex = Dex.mod('gen9fantasy');
	const validator = new TeamValidator(new Format({ ...Dex.formats.get('gen9nationaldex'), name: 'Observation QA', mod: 'gen9fantasy' }));
	const legal = (species, move) => !validator.checkCanLearn(dex.moves.get(move), dex.species.get(species), undefined, { level: 100 });
	let store, engine, content;
	const account = () => store.get('observationqa');
	const command = (action, details = {}) => commandAfterOpening(engine, 'observationqa', {
		id: randomUUID(), revision: account().revision, action, ...details,
	});
	const choose = value => command('event', { member: account().run.node.event.key, value });
	const view = () => eventView(account().run);
	function enter(special = false, legacy) {
		store.change('observationqa', a => {
			const run = a.run;
			run.phase = 'event'; run.floor = 41;
			run.node = { id: 'observation', kind: 'event', name: '百变怪观察站', encounters: [], reward: { money: 0, items: {} },
				event: { id: 'dittoshow', key: randomUUID(), stage: 'choice' } };
			(run.eventHistory ||= []).push({ id: 'dittoshow', floor: run.floor });
			if (legacy !== undefined) run.node.event.activity = { index: legacy };
			beginJourneyActivity(run, n => special && n === 100 ? 99 : 0);
		});
	}
	before(() => { content = createPreviewContent(); });
	beforeEach(() => {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content, () => 0);
		command('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());

	it('uses a broad pool with genuinely legal uncommon coverage and only illegal plausible decoys', () => {
		const pool = observationPool(); assert.equal(pool.length, 30);
		assert(pool.find(model => model.species === 'Blastoise').legal.includes('focusblast'));
		const fakes = new Set();
		for (const model of pool) {
			assert(model.legal.length >= 2, model.species); assert(model.disguise.length > 0, model.species);
			for (const move of model.legal) assert(legal(model.species, move), `${model.species} ${move}`);
			for (const move of model.disguise) {
				assert(!legal(model.species, move), `${model.species} ${move}`);
				assert(!DITTO_SIGNATURE_MOVES.includes(move)); fakes.add(move);
			}
		}
		for (const move of fakes) {
			const learners = dex.species.all().filter(s => s.exists && s.num > 0 && !s.forme && s.id !== 'smeargle' &&
				!s.tags.some(tag => /Legendary|Mythical/.test(tag)) && legal(s.name, move));
			assert(learners.length >= 5, `${move} must not be an exclusive move`);
		}
	});
	it('has exactly five special outcomes among the hundred branch rolls', () => {
		let special = 0;
		for (let roll = 0; roll < 100; roll++) {
			const drawn = drawObservation([], n => n === 100 ? roll : 0);
			if (drawn.special) special++;
			assert.equal(drawn.special, roll >= 95);
		}
		assert.equal(special, 5);
	});
	it('generates unique trios, exactly one impossible move, and no adjacent repeated models across 1000 seeded visits', () => {
		let seed = 71718, previous = [];
		const signatures = new Set(), species = new Set();
		const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
		for (let visit = 0; visit < 1000; visit++) {
			const drawn = drawObservation(previous, random);
			assert.equal(new Set(drawn.models.map(model => model.species)).size, 3);
			drawn.models.forEach((model, i) => {
				if (model.species !== 'Smeargle') assert(!previous.includes(model.species));
				assert.equal(legal(model.species, model.move), drawn.special || i !== drawn.index);
				species.add(model.species);
			});
			if (drawn.special) signatures.add(drawn.models[drawn.index].move);
			previous = drawn.models.map(model => model.species);
		}
		assert(species.size >= 30); assert.equal(signatures.size, DITTO_SIGNATURE_MOVES.length);
	});
	it('persists all three demonstrations and omits an answer or tell from the public view', () => {
		enter(); const original = structuredClone(account().run.node.event.activity);
		assert.equal(view().observation.length, 3); assert.equal(view().options.filter(o => o.id.startsWith('identify:')).length, 3);
		assert.equal(view().paragraphs.filter(line => line.includes('使出了')).length, 3);
		assert(!JSON.stringify(view()).match(/index|disguise|偷看|瞄了|不协调|很自然/));
		for (let i = 0; i < 5; i++) { view(); engine.migrate('observationqa'); }
		assert.deepEqual(account().run.node.event.activity, original);
		store.change('observationqa', a => beginJourneyActivity(a.run, () => { throw new Error('must not reroll'); }));
		assert.deepEqual(account().run.node.event.activity, original);
		enter(); assert(!account().run.node.event.activity.observation.some(model => original.observation.some(old => old.species === model.species)));
	});
	for (const right of [true, false]) it(`settles a ${right ? 'correct' : 'wrong'} answer with the unchanged normal reward`, () => {
		enter(); const before = account().run, index = before.node.event.activity.index;
		choose('identify:' + (right ? index : (index + 1) % 3));
		const after = account().run;
		assert(after.node.event.settled); assert.equal(after.node.event.stage, 'result');
		if (right) {
			assert.equal(after.money - before.money, journeyCoins(41, 305));
			assert.equal(after.bag.ether, (before.bag.ether || 0) + 1);
			assert.equal(after.bag.oranberry, (before.bag.oranberry || 0) + 2);
			assert(view().paragraphs.join('').includes(`${before.node.event.activity.observation[index].species} 根本没有这样的招式`));
		} else { assert.deepEqual(after.bag, before.bag); assert.equal(after.money, before.money); }
		assert.equal(view().observation[index].species, 'Ditto');
		assert.throws(() => choose('identify:' + index), /已更新|无法/);
		command('continue'); assert.equal(account().run.floor, 42);
	});
	it('preserves all three already-open legacy questions and answers', () => {
		for (let index = 0; index < 3; index++) {
			enter(false, index); const question = account().run.node.event.activity;
			assert.equal(question.observation, undefined); assert.equal(question.index, index);
			assert.deepEqual(view().observation.map(model => model.species), ['Pikachu', 'Squirtle', 'Charmander']);
			choose('identify:' + index); assert(account().run.node.event.settled);
		}
	});
	it('keeps declining free and does not reveal an answer or grant a prize', () => {
		enter(); const before = account().run; choose('leave');
		assert.deepEqual(account().run.bag, before.bag); assert.equal(account().run.money, before.money);
		assert(!view().observation.some(model => model.disguise)); command('continue');
	});
	for (const signature of DITTO_SIGNATURE_MOVES) it(`replaces identification with the sole ${signature} surprise and grants one chosen TM`, () => {
		enter(true); store.change('observationqa', a => {
			const activity = a.run.node.event.activity; activity.observation[activity.index].move = signature;
		});
		const before = account().run;
		assert.deepEqual(view().options.map(o => o.id), ['astonished']);
		assert.equal(view().options[0].name, dex.moves.get(signature).name + '！？');
		assert.throws(() => choose('identify:0'), /已更新/);
		choose('astonished');
		assert(view().paragraphs.join('').includes('看来今天的百变怪状态很好嘛，但是这样的话就没办法判断啦'));
		assert.equal(view().observation[before.node.event.activity.index].species, 'Ditto');
		const picker = structuredClone(view().picker); assert(picker.options.length > 100);
		engine.migrate('observationqa'); assert.deepEqual(view().picker, picker);
		choose('machine:protect');
		assert.equal(account().run.bag.roguetmprotect, (before.bag.roguetmprotect || 0) + 1);
		assert.equal(account().run.money, before.money);
		assert.deepEqual(account().run.team, before.team, 'a TM is a bag item, not an immediate learned move');
		assert.throws(() => choose('machine:protect'), /已更新/);
		command('continue'); assert.equal(account().run.floor, 42);
	});
	it('rejects forged moves, premature rewards and a stale first-step key without mutations', () => {
		enter(true); assert.throws(() => choose('machine:protect'), /已更新/);
		const key = account().run.node.event.key; choose('astonished'); const before = account();
		for (const choice of ['machine:struggle', 'machine:notamove', 'machine:protect:2', 'identify:0']) {
			assert.throws(() => choose(choice), /已更新/); assert.deepEqual(account(), before);
		}
		assert.throws(() => command('event', { member: key, value: 'astonished' }), /已更新/);
	});
	it('handles a lost confirmation acknowledgement and replayed command exactly once', () => {
		enter(true); choose('astonished');
		const request = { id: randomUUID(), revision: account().revision, action: 'event', member: account().run.node.event.key, value: 'machine:protect' };
		engine.command('observationqa', request); const first = account();
		engine.migrate('observationqa'); engine.command('observationqa', request);
		assert.equal(account().run.bag.roguetmprotect, 1); assert.deepEqual(account(), first);
	});
	it('offers only existing machine-source moves and retains native learning eligibility', () => {
		const moves = observationMachines(); assert(moves.includes('protect')); assert(!moves.includes('roaroftime'));
		for (const move of moves) assert.equal(tradeItem('roguetm' + move).move, move);
		enter(true); choose('astonished'); choose('machine:icebeam');
		assert(!machineMoves(account().run.team[0]).includes('icebeam'));
		assert.equal(account().run.bag.roguetmicebeam, 1);
	});
	it('does not give the surprise reward through a direct invalid native choice', () => {
		enter(); const before = account().run;
		assert.throws(() => chooseEventOption(account(), before, content, () => 0, before.node.event.key, 'astonished'), /已更新/);
		assert.deepEqual(account().run.bag, before.bag);
	});
});
