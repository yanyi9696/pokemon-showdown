'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Dex } = require('../../dist/sim/dex');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { blessing, blessingLevelCost } = require('../../dist/sim/rogue-blessing-data');
const b = require('../../dist/server/fantasy-rogue/blessings');
const { blessingLevelsAt } = require('../../dist/server/fantasy-rogue/blessing-levels');

describe('Fantasy Rogue opening rewards and attribute evolution', function () {
	this.timeout(20000);
	let store, engine, content;
	const user = 'openinggrowth';
	const account = () => store.get(user);
	const cmd = (action, extra = {}) => engine.command(user, { id: randomUUID(), revision: account().revision, action, ...extra });
	before(() => { content = createPreviewContent(); });
	beforeEach(() => {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content, () => 0);
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());
	function choose(id) {
		store.change(user, saved => {
			saved.run.blessings.round = { floor: 1, tier: blessing(id).tier, remaining: 1,
				options: [{ id, refreshes: 1, chosen: false }], familiesSeen: [blessing(id).family] };
		});
		cmd('blessing', { slot: 0 });
	}
	function gift(value = 'join') {
		const reward = account().run.blessings.pending[0];
		assert.equal(reward.pokemon.set.level, 5);
		cmd('blessingreward', { member: reward.id, value });
	}
	function upgrade() {
		if (account().run.blessings.stage.kind === 'direction') cmd('blessing', { value: 'stats' });
		assert.equal(account().run.blessings.stage.kind, 'upgrade');
		cmd('blessing', { value: 'stat:hp' });
	}
	function complete(floor) {
		store.change(user, saved => {
			saved.run.floor = floor; saved.run.phase = 'reward';
			saved.run.node = { id: 'growth-checkpoint', name: '测试结算', kind: 'reward', encounters: [], reward: { money: 0, items: {} } };
		});
		cmd('continue');
	}
	it('grants a matching level-five gift without a matching starter and saves the immediate upgrade', () => {
		choose('typeevolutionfire');
		const reward = account().run.blessings.pending[0];
		assert(Dex.mod('gen9fantasy').species.get(reward.pokemon.set.species).types.includes('Fire'));
		assert(blessing('typeevolutionfire').text.includes('随机火属性宝可梦'));
		assert.throws(() => cmd('blessing', { value: 'stats' }), /领取/);
		gift();
		cmd('blessing', { value: 'stats' });
		const before = account(); engine.migrate(user); assert.deepEqual(account(), before);
		assert.equal(before.run.phase, 'blessing');
		const request = { id: randomUUID(), revision: account().revision, action: 'blessing', value: 'stat:hp' };
		engine.command(user, request); const claimed = account(); engine.command(user, request);
		assert.deepEqual(account(), claimed);
		assert.equal(claimed.run.floor, 1); assert.equal(claimed.run.phase, 'choose');
		assert.equal(claimed.run.blessings.evolution.stats.hp, 0.15);
		assert.equal(claimed.run.blessings.bossLevels, 0); assert.equal(claimed.run.blessings.levels, 0);
		assert.equal(blessingLevelsAt(claimed.run, 11).boss, 10);
		assert.equal(claimed.run.team.find(mon => mon.id === reward.pokemon.id).statModifiers.stats.hp, 0.15);
	});
	it('grants all 21 upgrades, charges later prism costs once, and archives the final upgrade before the ending', () => {
		choose('typeevolutiongrass'); gift(); upgrade();
		let upgrades = 1, normal = 0, boss = 10;
		for (let floor = 10; floor <= 200; floor += 10) {
			complete(floor);
			const run = account().run, direction = [50, 100, 150].includes(floor);
			assert.equal(run.phase, 'blessing'); assert(!run.blessings.round);
			assert.equal(run.blessings.stage.kind, direction ? 'direction' : 'upgrade');
			if (direction) {
				normal += blessingLevelCost('prismatic', floor); boss += blessingLevelCost('prismatic', floor, true);
			}
			assert.equal(blessingLevelsAt(run, 201).normal, normal); assert.equal(blessingLevelsAt(run, 201).boss, boss);
			const snapshot = account(); engine.migrate(user); assert.deepEqual(account(), snapshot);
			b.completeBlessingFloor(snapshot, run, content, () => 0);
			assert.deepEqual(run.blessings, snapshot.run.blessings, 'repeated settlement grants nothing');
			assert(!account().cards?.length);
			upgrade(); upgrades++;
			assert.equal(account().run.floor, floor === 200 ? 200 : floor + 1);
		}
		const saved = account();
		assert.equal(upgrades, 21); assert.equal(saved.run.phase, 'postgame');
		assert.equal(saved.run.blessings.levels, 60); assert.equal(saved.run.blessings.bossLevels, 100);
		assert.deepEqual(saved.run.blessings.evolutionCosts, [50, 100, 150]);
		assert(Math.abs(saved.run.blessings.evolution.stats.hp - 3.15) < 1e-9);
		assert.equal(saved.cards.length, 1);
		assert.deepEqual(saved.cards[0].snapshot.blessingEffects.evolution, saved.run.blessings.evolution);
		assert.deepEqual(saved.cards[0].snapshot.team, saved.run.team.map(mon => ({
			...mon, difficulty: { tier: 0, floor: 200, card: true, version: 5 },
		})));
	});

	it('gives Fighting 24 upgrades, preserving milestone upgrades across reloads and direction resets', () => {
		choose('typeevolutionfighting'); gift(); upgrade();
		let upgrades = 1;
		for (let floor = 10; floor <= 200; floor += 10) {
			complete(floor);
			assert.equal(account().run.blessings.stage.kind, 'upgrade');
			if ([50, 100, 150].includes(floor)) {
				const before = account(); engine.migrate(user); assert.deepEqual(account(), before);
				assert(account().run.blessings.evolutionResetPending);
				upgrade(); upgrades++;
				assert.equal(account().run.floor, floor);
				assert.equal(account().run.blessings.stage.kind, 'direction');
				assert(!account().run.blessings.evolutionResetPending);
				const after = account(); engine.migrate(user); assert.deepEqual(account(), after);
			}
			upgrade(); upgrades++;
		}
		const saved = account();
		assert.equal(upgrades, 24); assert.equal(saved.run.blessings.bossLevels, 100);
		assert.deepEqual(saved.run.blessings.evolutionCosts, [50, 100, 150]);
		assert(Math.abs(saved.run.blessings.evolution.stats.hp - 3.6) < 1e-9);
		assert.deepEqual(saved.cards[0].snapshot.blessingEffects.evolution, saved.run.blessings.evolution);
	});
	it('keeps an upgrade available after all resistance choices are exhausted', () => {
		choose('typeevolutionsteel'); gift();
		cmd('blessing', { value: 'resistance' });
		let changedDirection = false;
		for (let i = 0; i <= 20; i++) {
			if (i) complete(i * 10);
			if (account().run.blessings.stage.kind === 'direction') {
				const stage = account().run.blessings.stage;
				cmd('blessing', { value: stage.options.includes('resistance') ? 'resistance' : 'stats' });
			}
			if (account().run.blessings.stage.kind === 'direction') cmd('blessing', { value: 'stats' });
			const state = account().run.blessings;
			if (state.evolution.direction === 'stats') changedDirection = true;
			assert.equal(state.stage.kind, 'upgrade'); assert(state.stage.options.length);
			cmd('blessing', { value: state.stage.options[0] });
		}
		assert(changedDirection); assert.equal(account().run.phase, 'postgame');
	});
	it('adds fifty initial Meltan candy and twenty for defeating a Steel Pokemon', () => {
		store.change(user, saved => { saved.run.blessings.candy = 20; });
		choose('meltan'); gift();
		const saved = account(), run = saved.run;
		assert.equal(run.blessings.candy, 70);
		b.settleBlessingBattle(saved, run, content, { won: true, encounterId: 'steel',
			defeated: [{ species: 'Magnemite', participants: [] }] }, () => 0);
		assert.equal(run.blessings.candy, 90);
		assert(!blessing('meltan').text.includes('200'));
	});
	it('rewards 10, 90 and 180 unique knockouts and can raise an already boosted partner to five stars', () => {
		choose('starquest'); gift();
		const saved = account(), run = saved.run, entry = run.blessings.owned[0];
		const mon = run.team.find(member => member.id === entry.target);
		mon.stars = 2;
		for (let count = 1; count <= 181; count++) {
			const result = { won: true, encounterId: `battle-${count}`, blessingProgress: {
				kos: [{ id: `foe-${count}`, member: mon.id }], insight: {}, swords: 0,
			} };
			b.settleBlessingBattle(saved, run, content, result, () => 0);
			b.settleBlessingBattle(saved, run, content, result, () => 0);
			assert.equal(mon.stars, count < 10 ? 2 : count < 90 ? 3 : count < 180 ? 4 : 5);
			assert.equal(entry.progress, count);
		}
		assert.deepEqual(entry.milestones, [10, 90, 180]);
		assert(!blessing('starquest').text.includes('最高四星'));
	});
	it('maps previously paid star milestones without paying them again or downgrading the partner', () => {
		choose('starquest'); gift();
		const saved = account(), run = saved.run, entry = run.blessings.owned[0];
		const mon = run.team.find(member => member.id === entry.target);
		entry.milestones = [10, 60]; entry.progress = 89; mon.stars = 3;
		b.settleBlessingBattle(saved, run, content, { won: true, encounterId: 'legacy', blessingProgress: {
			kos: [{ id: 'new-foe', member: mon.id }], insight: {}, swords: 0,
		} }, () => 0);
		assert.deepEqual(entry.milestones, [10, 90]); assert.equal(entry.progress, 90); assert.equal(mon.stars, 3);
	});
	it('repairs obsolete floor-50 saved offers without spending or granting refreshes', () => {
		store.change(user, saved => {
			const run = saved.run; run.floor = 50; delete run.blessings.beforeAdventure;
			run.blessings.afterFloor = true;
			run.blessings.round = { floor: 50, tier: 'silver', remaining: 1,
				options: ['dice', 'reservation', 'reservemega'].map(id => ({ id, refreshes: 0, chosen: false })),
				familiesSeen: ['dice', 'reservation', 'reservemega'] };
		});
		engine.migrate(user);
		const run = account().run;
		for (const option of run.blessings.round.options) {
			assert.equal(option.refreshes, 0); assert.equal(blessing(option.id).tier, 'silver');
			assert(b.blessingCandidates(run, content).some(def => def.id === option.id));
		}
		const before = account(); engine.migrate(user); assert.deepEqual(account(), before);
		cmd('blessing', { slot: 0 });
		while (account().run.blessings.pending.length) {
			const reward = account().run.blessings.pending[0];
			assert.equal(reward.kind, 'toolbox');
			cmd('blessingreward', { member: reward.id, value: reward.options[0] });
		}
		assert.equal(account().run.floor, 51);
	});
});
