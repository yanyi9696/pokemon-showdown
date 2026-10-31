'use strict';
const assert = require('assert').strict;
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {createRoguePokemon, initializeExperience, evolveMember, evolutionOptions} = require('../../dist/server/fantasy-rogue/progression');
const {partyEvolutions} = require('../../dist/server/fantasy-rogue/party-evolution');
const {floorFriendship, battleFriendship, changeFriendship} = require('../../dist/server/fantasy-rogue/friendship');
const {chooseEventOption, settleEventBattle, eventView} = require('../../dist/server/fantasy-rogue/events');
const {offerEventFragments} = require('../../dist/server/fantasy-rogue/event-fragments');
const {blessing, taskRewardTier} = require('../../dist/sim/rogue-blessing-data');
const {blessingDisplay} = require('../../dist/server/fantasy-rogue/blessing-text');
const b = require('../../dist/server/fantasy-rogue/blessings');
const {set, stats} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue midgame growth and intrinsic Meltan candy', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); });
	function setup(floor = 51, species = 'Bulbasaur') {
		const mon = createRoguePokemon(set(species), stats(0)); initializeExperience(mon);
		const run = {id: 'growth', floor, phase: 'event', team: [mon], bag: {}, money: 0, boosts: stats(0), caught: [],
			node: {id: 'room', name: '房间', kind: 'event', encounters: [], reward: {money: 0, items: {}},
				event: {id: 'room', key: 'once', stage: 'battle', battleReward: 'room'}}};
		const account = {run, captures: {}, unlocked: [], points: 0, slots: 1}; b.normalizeBlessings(run);
		return {run, account, mon};
	}
	for (const [floor, min, max, cap] of [[51, 10, 12, 30], [100, 20, 22, 60], [150, 28, 30, 80]]) {
		it(`persists a reward choice at floor ${floor}, excludes duplicate and incompatible payouts`, () => {
			let {run, account} = setup(floor);
			settleEventBattle(run, content, () => 0, true);
			assert.equal(run.node.event.stage, 'fragments'); assert.equal(run.blessings.shards, 0);
			assert.equal(run.blessings.pending.length, 0);
			const amount = run.node.event.fragmentOffer.amount; assert(amount >= min && amount <= max);
			run = JSON.parse(JSON.stringify(run)); account.run = run;
			assert.equal(eventView(run).options.length, 2);
			assert.throws(() => chooseEventOption(account, run, content, () => 0, 'once', 'leave'));
			chooseEventOption(account, run, content, () => 0, 'once', 'fragments');
			assert.equal(run.blessings.shards, amount); assert.equal(Object.values(run.eventFragments)[0], amount);
			assert.equal(run.blessings.pending.length, 0);
			const saved = structuredClone(run);
			assert.throws(() => chooseEventOption(account, run, content, () => 0, 'once', 'supplies'));
			settleEventBattle(run, content, () => 0, true); assert.deepEqual(run, saved);
			run.eventFragments[Object.keys(run.eventFragments)[0]] = cap;
			run.node.event = {id: 'room', key: 'next', stage: 'battle', battleReward: 'room'};
			settleEventBattle(run, content, () => 0, true);
			assert.equal(run.node.event.stage, 'result'); assert.equal(run.blessings.pending.length, 1);
		});
	}
	it('pays original supplies as an alternative and does not consume the extra-fragment quota', () => {
		const {run, account} = setup(); settleEventBattle(run, content, () => 0, true);
		chooseEventOption(account, run, content, () => 0, 'once', 'supplies');
		assert.equal(run.blessings.pending.length, 1); assert.equal(run.blessings.shards, 3); assert(!run.eventFragments);
	});
	it('never adds early, failed or escaped shard rewards and resets only the stage allowance', () => {
		for (const [floor, won, escaped] of [[50, true, false], [70, false, false], [70, false, true]]) {
			const {run} = setup(floor); settleEventBattle(run, content, () => 0, won, escaped);
			assert(!run.node.event.fragmentOffer); assert(!run.eventFragments);
		}
		const {run} = setup(99); run.eventFragments = {'80': 45}; assert(!offerEventFragments(run, 'forest', () => 0));
		run.floor = 100; assert(offerEventFragments(run, 'forest', () => 0)); assert.equal(run.node.event.fragmentOffer.amount, 16);
	});
	it('offers fragments in successful mediation and bandit victories, but not their negative outcomes', () => {
		for (const id of ['forest', 'bandits']) {
			const {run, account} = setup(70); run.node.event = {id, key: 'once', stage: id === 'forest' ? 'choice' : 'battle'};
			if (id === 'forest') chooseEventOption(account, run, content, n => n === 100 ? 40 : 0, 'once', 'mediate');
			else settleEventBattle(run, content, () => 0, true);
			assert.equal(run.node.event.stage, 'fragments'); assert.deepEqual(run.bag, {});
			chooseEventOption(account, run, content, () => 0, 'once', 'supplies');
			assert.equal(run.blessings.shards, 0); assert(Object.keys(run.bag).length || run.money);
		}
	});
	it('accumulates intrinsic candy for unique steel/non-steel defeats and captures, without the blessing', () => {
		const {run, account} = setup(5, 'Meltan');
		const result = {won: true, encounterId: 'battle', defeated: [
			{id: 'steel', species: 'Magnemite', participants: []}, {id: 'normal', species: 'Rattata', participants: [], captured: true}]};
		b.settleBlessingBattle(account, run, content, result, () => 0, true); assert.equal(run.blessings.candy, 0);
		b.settleBlessingBattle(account, run, content, { ...result, won: false }, () => 0); assert.equal(run.blessings.candy, 22);
		b.settleBlessingBattle(account, run, content, result, () => 0); assert.equal(run.blessings.candy, 22);
		b.settleBlessingBattle(account, run, content, { ...result, encounterId: 'retry' }, () => 0); assert.equal(run.blessings.candy, 22);
		assert.equal(run.blessings.owned.length, 0);
	});
	it('requires 400 candy through both normal and special evolution entry points regardless of level', () => {
		for (const special of [false, true]) {
			const {run, account, mon} = setup(5, 'Meltan'); run.phase = 'choose'; mon.set.level = 100;
			assert.equal(evolutionOptions(mon, run).length, 0); assert(!partyEvolutions(mon, run)[0].ready);
			run.blessings.candy = 400; mon.set.level = 5;
			assert(partyEvolutions(mon, run)[0].ready);
			if (special) b.handleBlessingCommand(account, run, content, {action: 'meltanevolve', member: mon.id}, () => 0);
			else evolveMember(run, mon, 'Melmetal');
			assert.equal(mon.set.species, 'Melmetal'); assert.equal(run.blessings.candy, 0); assert.equal(mon.set.level, 5);
		}
	});
	it('increases only initial-partner positive friendship by exactly 50%, retaining fractional carry', () => {
		const {run, mon} = setup(1); mon.initialPartner = true; mon.set.happiness = 70;
		run.blessings.owned = [{...blessing('bond'), floor: 1}];
		for (let i = 0; i < 2; i++) {floorFriendship(run); floorFriendship(run); run.floor++;}
		assert.equal(mon.set.happiness, 79);
		for (let i = 0; i < 2; i++) battleFriendship(run, {won: true, defeated: [{participants: [mon.id]}]}, 'b' + i, run.team);
		assert.equal(mon.set.happiness, 82);
		changeFriendship(mon, -5, run); assert.equal(mon.set.happiness, 77);
		mon.initialPartner = false; changeFriendship(mon, 2, run); assert.equal(mon.set.happiness, 79);
	});
	for (const family of ['battletask', 'eventtask']) for (const floor of [1, 50, 100, 150]) {
		it(`${family} ${floor} pays all three milestones once, with fixed candy despite delayed completion`, () => {
			const {run, account} = setup(floor); run.blessings.owned = [{...blessing(family), floor}];
			const reward = taskRewardTier(floor); run.node.kind = family === 'battletask' ? 'wild' : 'event';
			for (let progress = 1; progress <= 16; progress++) {
				run.floor = Math.min(199, floor + 33) + progress;
				b.completeBlessingFloor(account, run, content, () => 0);
				const copy = structuredClone(run); b.completeBlessingFloor(account, run, content, () => 0); assert.deepEqual(run, copy);
			}
			assert.equal(run.money, reward.coins);
			assert.equal(run.bag[reward.candy], reward.milestoneCandy + reward.candyCount);
			assert(blessingDisplay(blessing(family), floor).text.includes(`【经验糖果 ${reward.candy.slice(8).toUpperCase()}】×${reward.candyCount}`));
		});
	}
	it('settles a prepaid Fantasy reservation at floor 100 once instead of losing the reward', () => {
		const {run, account, mon} = setup(70, 'Melmetal'); run.phase = 'choose';
		run.blessings.owned = [{...blessing('reservation'), floor: 1, target: mon.id}]; run.blessings.shards = 100;
		b.handleBlessingCommand(account, run, content, {action: 'fantasize', member: mon.id}, () => 0);
		assert.equal(run.blessings.shards, 0); assert.equal(run.blessings.owned[0].reservedShards, 100);
		run.floor = 100; b.completeBlessingFloor(account, run, content, () => 0);
		assert.equal(run.blessings.shards, 100); assert(run.blessings.owned[0].completed);
		b.completeBlessingFloor(account, run, content, () => 0); assert.equal(run.blessings.shards, 100);
	});
	for (const id of ['reservation', 'reservemega', 'reservegmega', 'reservetera', 'reservez']) {
		it(`${id} grants 500 coins at selection without early system unlocks`, () => {
			const {run, account} = setup(1); run.phase = 'blessing';
			run.blessings.round = {floor: 1, tier: 'silver', remaining: 1, options: [{id, chosen: false, refreshes: 1}]};
			b.handleBlessingCommand(account, run, content, {action: 'blessing', slot: 0}, () => 0);
			assert.equal(run.money, 500); assert(!run.megaUnlocked && !run.gmegaUnlocked && !run.zUnlocked && !run.teraUnlocked);
			assert(blessingDisplay(blessing(id), 1).text.includes('500 金币'));
		});
	}
});
