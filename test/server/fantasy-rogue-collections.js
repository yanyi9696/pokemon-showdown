'use strict';
const assert = require('assert').strict;
const { Dex } = require('../../dist/sim/dex');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { syncBlessingParty, blessingCandidates } = require('../../dist/server/fantasy-rogue/blessings');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { COMPANIONS, companionAvailable, companionAppearance } = require('../../dist/sim/rogue-companions');
const c = require('../../dist/server/fantasy-rogue/companions');
const { feedMushroom, mushroomGift } = require('../../dist/server/fantasy-rogue/mushroom-feeding');
const { randomSpeciesEligible } = require('../../dist/server/fantasy-rogue/species-eligibility');
const { featheredSpecies, mushroomSpecies } = require('../../dist/server/fantasy-rogue/nature-collections');
const { collectionView, chooseCollection, advanceSki } = require('../../dist/server/fantasy-rogue/collection-events');
const { candyAtFloor, eventRewardBudget } = require('../../dist/server/fantasy-rogue/early-balance');
const { rogueCodex } = require('../../dist/server/fantasy-rogue/codex');
const { prepareTrade } = require('../../dist/server/fantasy-rogue/trading');
const { stats, set } = require('../fixtures/fantasy-rogue');

describe('Rogue collections, companion eligibility and codex conditions', function () {
	this.timeout(20000);
	let content;
	before(() => { content = createPreviewContent(); });
	function party(names = ['Breloom', 'Parasect']) {
		const run = { id: 'collections', floor: 50, phase: 'event', boosts: stats(0), money: 20000, bag: {}, encounter: 0, caught: [],
			team: names.map(name => createRoguePokemon(set(name, 'No Ability', 50), stats(0))),
			node: { id: 'event', kind: 'event', name: '测试', encounters: [], reward: { money: 0, items: {} } } };
		syncBlessingParty(run); return run;
	}
	function event(run, id, key = id) { run.node.event = { id, key, stage: 'choice' }; run.phase = 'event'; }
	function own(run, family) { run.blessings.owned.push({ ...blessing(family), floor: run.floor }); }
	it('requires a relevant type and makes every companion family mutually exclusive', () => {
		for (const def of Object.values(COMPANIONS)) {
			const empty = party([]);
			assert.equal(companionAvailable(def.family, empty.team, empty.blessings), def.family === 'companionai');
			own(empty, 'companionai');
			assert(!companionAvailable(def.family, party(['Arceus']).team, empty.blessings));
		}
		const run = party(['Gastly', 'Eevee']);
		assert(companionAvailable('companionacerola', run.team, run.blessings));
		assert.equal(companionAppearance('companionacerola', run.team), 2);
		assert.equal(companionAppearance('companionacerola', party(['Zorua-Hisui']).team), 1);
		assert(blessingCandidates(run, content).some(b => b.family === 'companionacerola'));
		own(run, 'companionai');
		assert(!blessingCandidates(run, content).some(b => b.family.startsWith('companion') || b.family === 'dragonking'));
	});
	it('always lets Grusha/Rika be selected, deferring the missing-type grant', () => {
		const run = party(['Snorunt']); own(run, 'companionwinter');
		c.companionCommand(run, { value: 'choosewinter', member: 'rika' }, () => 0, []);
		assert.equal(run.blessings.companions[0].id, 'rika');
		assert(!run.blessings.companions[0].member);
		run.team.push(createRoguePokemon(set('Diglett'), stats(0))); syncBlessingParty(run);
		assert.equal(run.blessings.companions[0].member, run.team[1].id);
	});
	it('prefers home regions and counts exactly one modest gift after 15 events', () => {
		const run = party(['Charmander']); c.grantCompanion(run, 'lysandre');
		const options = [{ id: 'postcard:kalos', name: '卡洛斯' }, { id: 'fight', name: '挑战' }];
		for (let i = 0; i < 20; i++) {
			event(run, 'postcard', String(i));
			assert.equal(c.companionRecommendation(run, run.blessings.companions[0], options), 'postcard:kalos');
			c.recordCompanionPreference(run, options, 'postcard:kalos', () => 0);
			c.recordCompanionPreference(run, options, 'postcard:kalos', () => 0);
		}
		assert.equal(run.blessings.companions[0].preferences, 20);
		assert.equal(run.bag.charcoal, 1); assert.equal(run.money, 20000);
	});
	it('keeps mushroom feeding independent, diminishing, unlimited and batch-invariant', () => {
		const run = party(); own(run, 'mushroomsynthesis'); run.bag.tinymushroom = 100000;
		run.team[0].hp -= 10; const hp = run.team[0].hp;
		feedMushroom(run, run.team[0].id, 'tinymushroom', 10);
		const first = run.team[0].mushroomTraining.offense;
		feedMushroom(run, run.team[0].id, 'tinymushroom', 10);
		assert(run.team[0].mushroomTraining.offense - first < first);
		assert(!run.team[1].mushroomTraining); assert.equal(run.team[0].hp, hp);
		for (let i = 0; i < 20; i++) feedMushroom(run, run.team[1].id, 'tinymushroom', 1);
		assert(Math.abs(run.team[1].mushroomTraining.offense - run.team[0].mushroomTraining.offense) < 1e-6);
		feedMushroom(run, run.team[0].id, 'tinymushroom', 50000);
		assert(run.team[0].mushroomTraining.offense > 12000, 'No ordinary training cap on mushroom growth');
		assert.throws(() => feedMushroom(run, run.team[0].id, 'tinymushroom', 0));
		assert.throws(() => feedMushroom(run, run.team[0].id, 'tinymushroom', -1));
	});
	it('gates ordinary special species above 50 while retaining advertised rare rewards', () => {
		for (const name of ['Articuno', 'Mew', 'Xerneas', 'Buzzwole', 'Iron Valiant', 'Brute Bonnet', 'Lugia-Fantasy']) {
			assert(!randomSpeciesEligible(name, 50), name);
			assert(randomSpeciesEligible(name, 51), name);
			assert(randomSpeciesEligible(name, 5, true), name);
		}
		assert(randomSpeciesEligible('Bulbasaur', 5));
	});
	it('uses authored anatomy rather than Flying typing and recognizes mushroom families', () => {
		for (const name of ['Psyduck', 'Torchic', 'Flutter Mane', 'Roaring Moon', 'Decidueye-Hisui', 'Togekiss', 'Sneasler', 'Tornadus-Therian']) assert(featheredSpecies(name), name);
		for (const name of ['Butterfree', 'Noivern', 'Charizard', 'Salamence', 'Espurr', 'Drampa', 'Tornadus']) assert(!featheredSpecies(name), name);
		for (const name of ['Breloom', 'Parasect', 'Morelull', 'Brute Bonnet']) assert(mushroomSpecies(name));
		assert(!mushroomSpecies('Bulbasaur'));
	});
	it('makes every mushroom gift legal for its tier and delays Brute Bonnet to floor 100', () => {
		for (const floor of [1, 50, 100, 150]) for (let choice = 0; choice < 6; choice++) {
			const run = party(); run.floor = floor; own(run, 'mushroomsynthesis');
			const account = { captures: {}, unlocked: [], starterUnlocks: {}, discoveries: { blessings: [], events: [] } };
			mushroomGift(account, run, content, n => choice % n);
			const mon = run.blessings.pending.find(p => p.pokemon)?.pokemon || run.pendingCapture;
			assert(mon && mushroomSpecies(mon.set.species));
			assert.equal(mon.set.level, floor === 1 ? 5 : floor / 2);
			if (floor < 100) assert.notEqual(mon.set.species, 'Brute Bonnet');
		}
	});
	it('handles ski collisions authoritatively and pays once at the finish', () => {
		const ski = { started: 1000, checked: 0, lane: 1, obstacles: [{ at: 3000, lane: 1, kind: 'tree' }] };
		advanceSki(ski, 4500); assert.equal(ski.ended, 3000); assert(ski.crashed);
		advanceSki(ski, 40000); assert.equal(ski.ended, 3000);
		const run = party(); event(run, 'skiing');
		chooseCollection(run, content, () => 0, 'skistart', 1000);
		assert(!collectionView(run).options.some(o => o.id === 'leave'));
		chooseCollection(run, content, () => 0, 'skitick', 31000);
		assert(run.node.event.settled); assert.equal(run.bag.revive, 1);
		assert.equal(collectionView(run).options.length, 0);
		const money = run.money;
		assert.throws(() => chooseCollection(run, content, () => 0, 'skitick', 32000));
		assert.equal(run.money, money);
	});
	it('allows a recent delayed dodge, but cannot rewind committed collisions or fast-forward the finish', () => {
		function slope() {
			const r = party(); event(r, 'skiing'); chooseCollection(r, content, () => 0, 'skistart', 1000);
			r.node.event.ski.obstacles = [{ at: 3000, lane: 1, kind: 'tree' }]; return r;
		}
		const delayed = slope();
		chooseCollection(delayed, content, () => 0, 'skitick', 4000);
		chooseCollection(delayed, content, () => 0, 'skileft', 4100, 2950);
		chooseCollection(delayed, content, () => 0, 'skitick', 4400);
		assert(!delayed.node.event.ski.crashed); assert.equal(delayed.node.event.ski.lane, 0);
		const tooLate = slope();
		chooseCollection(tooLate, content, () => 0, 'skileft', 4400, 100);
		assert(tooLate.node.event.ski.crashed);
		const future = slope();
		chooseCollection(future, content, () => 0, 'skileft', 2000, 999999);
		assert.equal(future.node.event.ski.checked, 1000); assert(!future.node.event.settled);
		const legacy = slope(); delete legacy.node.event.ski.inputWindow;
		chooseCollection(legacy, content, () => 0, 'skileft', 4100, 2950);
		assert(legacy.node.event.ski.crashed, 'Existing saves retain the original collision timeline');
	});
	it('reduces ski density and increases both consolation and successful-run rewards', () => {
		for (const floor of [20, 80, 150]) for (const tier of [0, 1, 3, 5]) {
			const r = party(); r.floor = floor; event(r, 'skiing');
			chooseCollection(r, content, () => 0, 'skistart', 1000);
			assert.equal(r.node.event.ski.obstacles.length, 17);
			assert(r.node.event.ski.obstacles[0].at >= 2000);
			r.node.event.ski.obstacles = tier === 5 ? [] : [{ at: Math.max(500, tier * 3000), lane: 1, kind: 'rock' }];
			chooseCollection(r, content, () => 0, 'skitick', 16500);
			const expected = Math.round(eventRewardBudget(floor) * (0.125 + tier * 0.2));
			assert.equal(r.money - 20000, expected);
			assert.equal(r.bag[candyAtFloor(floor)] || 0, tier ? 1 + Math.max(1, tier - (floor < 60 && tier >= 3 ? 1 : 0)) : 0);
			assert.equal(r.bag.revive || 0, tier >= 4 ? 1 : 0);
		}
	});
	it('opens stones individually or in bulk and counts one completed visit for Olivia', () => {
		const run = party(['Rockruff']); event(run, 'stones'); c.grantCompanion(run, 'olivia');
		c.recordCompanionPreference(run, collectionView(run).options, 'stone:1', () => 0);
		assert.equal(run.blessings.companions[0].smile, 'approval');
		assert.equal(run.blessings.companions[0].preferences, 0);
		chooseCollection(run, content, () => 0, 'stone:5');
		assert.equal(run.money, 16250); assert.equal(run.node.event.stonesOpened, 5);
		assert.deepEqual(run.bag, {});
		const options = collectionView(run).options;
		c.recordCompanionPreference(run, options, 'stonefinish', () => 0);
		chooseCollection(run, content, () => 0, 'stonefinish');
		assert.equal(run.blessings.companions[0].preferences, 1);
	});
	it('exchanges feathers and introduces the collector before selling', () => {
		const run = party(['Torchic']); event(run, 'feathers'); run.bag.prettyfeather = 5;
		chooseCollection(run, content, () => 0, 'feathertrade');
		assert.equal(run.bag.prettyfeather, 0); assert.equal(run.bag.healthfeather, 6);
		run.node = { ...run.node, kind: 'trade', trade: {kind: 'mushroom', stock: [], purchases: 0} }; delete run.node.event;
		prepareTrade(run, content, () => 0); assert.equal(run.phase, 'event');
		assert.equal(run.node.event.id, 'mushroomcollector');
		chooseCollection(run, content, () => 0, 'collectorshop'); assert.equal(run.phase, 'rest');
	});
	it('documents hard prerequisites separately from effects and provides all companion codex entries', () => {
		const entries = rogueCodex(undefined, 'blessings', true).entries;
		for (const family of ['singer', 'dancer', 'swords', 'railgun', 'rulebreaker', 'topclearmind', 'companionwinter']) {
			assert(entries.find(e => e.family === family).availability.length, family);
		}
		assert(entries.find(e => e.family === 'companionlana').availability.some(s => s.includes('需有水系')));
		assert(entries.filter(e => e.family.startsWith('companion') && e.family !== 'companionai').every(e => e.text.includes('累计听从 15 次')));
		const companions = rogueCodex(undefined, 'events', true).entries.filter(e => e.category === 'companion');
		assert.equal(companions.length, Object.keys(COMPANIONS).length);
	});
});
