'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { activeRogueSpirits } = require('../../dist/sim/fantasy-rogue-spirits');
const { blessing, blessingLevelCost, ROGUE_BLESSINGS } = require('../../dist/sim/rogue-blessing-data');
const { blessingLevelsAt, activateBlessingLevels } = require('../../dist/server/fantasy-rogue/blessing-levels');
const { blessingCandidates, prepareBlessingEncounter, handleBlessingCommand,
	completeBlessingFloor, blessingView } = require('../../dist/server/fantasy-rogue/blessings');
const { recordClear, editClearCard } = require('../../dist/server/fantasy-rogue/legacy');
const { set, prepareCompanionParty } = require('../fixtures/fantasy-rogue');
const { companionFamily } = require('../../dist/sim/rogue-companions');
const { overtimeGiftPool } = require('../../dist/server/fantasy-rogue/blessings');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');

describe('Fantasy Rogue opening blessing and earned spirit selection', function () {
	this.timeout(20000);
	let store, engine, content;
	const user = 'openingqa';
	const account = () => store.get(user);
	const cmd = (action, extra = {}) => engine.command(user, {
		id: randomUUID(), revision: account().revision, action, ...extra,
	});
	before(() => { content = createPreviewContent(); });
	beforeEach(() => {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content, () => 0);
	});
	afterEach(() => store.close());
	function forceOption(id) {
		store.change(user, a => {
			a.run.phase = 'blessing';
			a.run.blessings.round = { floor: a.run.floor, tier: blessing(id).tier, remaining: 1,
				options: [{ id, chosen: false, refreshes: 1 }], familiesSeen: [], topClearMindEligible: false };
		});
	}
	function finishRewards() {
		for (let n = 0; account().run.blessings.pending.length || account().run.blessings.stage; n++) {
			assert(n < 12);
			const run = account().run, reward = run.blessings.pending[0];
			if (!reward) {
				cmd('blessing', { value: run.blessings.stage.options[0] });
				continue;
			}
			if (reward.kind === 'gift') assert.equal(reward.pokemon.set.level,
				reward.pokemon.set.species === 'Excadrill' ? 31 : 5, 'gift respects its required evolution stage');
			if (reward.kind === 'compound') { cmd('blessingreward', require('../fixtures/fantasy-rogue').compoundCommand(run, reward)); continue; }
			cmd('blessingreward', { member: reward.id, value: reward.kind === 'gift' ?
				run.team.length < 6 ? 'join' : 'release' : reward.options[0] });
		}
	}
	it('persists the first round before routes, blocks combat, and stays on floor one after claiming', () => {
		cmd('start', { starters: ['bulbasaur'] });
		assert.equal(account().run.phase, 'blessing'); assert.equal(account().run.blessings.round.floor, 1);
		assert(!account().run.choices); assert(!account().run.node);
		assert.throws(() => cmd('select', { value: 'wild0' })); assert.throws(() => cmd('battle'));
		const before = account(); engine = new RogueEngine(store, content, () => 99); engine.migrate(user);
		assert.deepEqual(account(), before);
		engine = new RogueEngine(store, content, () => 0);
		forceOption('fategold');
		const request = { id: randomUUID(), revision: account().revision, action: 'blessing', slot: 0 };
		engine.command(user, request); const claimed = account(); engine.command(user, request);
		assert.deepEqual(account(), claimed);
		finishRewards();
		assert.equal(account().run.floor, 1); assert.equal(account().run.phase, 'choose');
		assert.equal(account().run.blessings.levels, 0); assert.equal(account().run.blessings.bossLevels, 0);
		assert.equal(blessingLevelsAt(account().run, 11).boss, 5);
		assert.equal(account().run.blessings.owned.length, 2, 'one Fate and one free gold blessing');
		assert.equal(account().run.money, content.initialMoney + 1800);
		assert(!account().run.blessings.beforeAdventure);
		store.change(user, a => {
			a.run.phase = 'reward'; a.run.node = { id: 'supply', kind: 'reward', encounters: [], reward: { money: 0, items: {} } };
		});
		cmd('continue'); assert.equal(account().run.floor, 2);
		assert.equal(account().run.blessings.owned.length, 2); assert(!account().run.blessings.round);
	});
	it('offers all migrated opening-only blessings and excludes other restricted floors', () => {
		cmd('start', { starters: ['bulbasaur'] });
		const run = account().run, eligible = new Set(blessingCandidates(run, content).map(b => b.id));
		const requiresParty = new Set(['monkeyking', 'unity', 'detect', 'latebloom', 'singer', 'dancer', 'swords', 'topclearmind', 'dragonking', 'railgun', 'rulebreaker', 'compound', 'killlagirl', 'ghidorah', 'galarlegend', 'originaldragon']);
		assert(!eligible.has('unity'), 'one partner cannot form a unified team');
		assert(!eligible.has('killlagirl'), 'requires both robes and floor 150');
		assert(!eligible.has('ghidorah'), 'requires a Hydreigon in the party');
		assert(!eligible.has('galarlegend'), 'requires Eternatus in the party');
		assert(!eligible.has('originaldragon'), 'requires Kyurem in the party');
		for (const def of ROGUE_BLESSINGS) {
			if (companionFamily(def.family)) {
				assert.equal(eligible.has(def.id), ['companionai', 'companionband', 'companionliko'].includes(def.family), def.name);
				continue;
			}
			if (def.family === 'overtime') { assert.equal(eligible.has(def.id), !!overtimeGiftPool(run, content, def.type).length); continue; }
			if (def.floors) assert.equal(eligible.has(def.id), def.floors.includes(1), def.name);
			else if (!requiresParty.has(def.family)) assert(eligible.has(def.id), def.name);
		}
		for (const id of ['reservemega', 'reservegmega', 'reservetera', 'reservez', 'dice', 'reservation', 'starquest', 'meltan', 'typeevolutionfire']) {
			assert.deepEqual(blessing(id).floors, [1]);
			for (const floor of [50, 100, 150]) {
				run.floor = floor;
				assert(!blessingCandidates(run, content).some(def => def.id === id));
			}
		}
	});
	for (const def of ROGUE_BLESSINGS.filter(b => (!b.floors || b.floors.includes(1)) && !['singer', 'dancer', 'swords', 'topclearmind', 'dragonking', 'killlagirl'].includes(b.family))) {
		it(`claims the opening option ${def.id}, including any follow-up rewards`, () => {
			cmd('start', { starters: ['bulbasaur'] });
			if (def.family === 'overtime' && !overtimeGiftPool(account().run, content, def.type).length) {
				assert(!blessingCandidates(account().run, content).some(b => b.id === def.id)); return;
			}
			store.change(user, a => prepareCompanionParty(a.run, def.family, 5));
			if (def.family === 'monkeyking') store.change(user, a => {
				a.run.team[0] = createRoguePokemon(set('Infernape', 'Blaze', 36), a.run.boosts);
			});
			if (def.family === 'unity') store.change(user, a => {
				a.run.team.push(createRoguePokemon(set('Oddish', 'Chlorophyll', 5), a.run.boosts));
			});
			if (def.family === 'detect') store.change(user, a => {
				a.run.team[0] = createRoguePokemon(set('Meditite', 'Pure Power', 5, ['Detect']), a.run.boosts);
			});
			if (def.family === 'railgun') store.change(user, a => {
				a.run.team[0] = createRoguePokemon(set('Magnemite', 'Sturdy', 5), a.run.boosts);
			});
			if (def.family === 'rulebreaker') store.change(user, a => { a.run.team[0].extraAbilities = ['moldbreaker']; });
			if (def.family === 'latebloom') store.change(user, a => { a.run.team[0] = createRoguePokemon(set('Gible', 'Sand Veil', 5), a.run.boosts); });
			if (def.family === 'compound') store.change(user, a => { a.run.team[0] = createRoguePokemon(set('Paras', 'Effect Spore', 5), a.run.boosts); });
			if (def.family === 'ghidorah') store.change(user, a => {
				a.run.team[0] = createRoguePokemon(set('Hydreigon', 'Levitate', 64), a.run.boosts);
			});
			if (['galarlegend', 'originaldragon'].includes(def.family)) store.change(user, a => {
				a.run.team[0] = createRoguePokemon(set(def.family === 'galarlegend' ? 'Eternatus' : 'Kyurem', 'Pressure', 5), a.run.boosts);
			});
			forceOption(def.id);
			cmd('blessing', { slot: 0 }); finishRewards();
			const run = account().run;
			assert.equal(run.phase, 'choose'); assert.equal(run.floor, 1);
			assert(run.blessings.owned.some(entry => entry.id === def.id));
			assert.equal(run.blessings.levels, 0);
			assert.equal(run.blessings.bossLevels, 0);
			assert.equal(blessingLevelsAt(run, 11).boss, blessingLevelCost(def.tier, 1, true));
			assert(Number.isSafeInteger(run.money)); assert(!Object.hasOwn(run.bag, 'undefined'));
		});
	}
	it('keeps Jirachi two picks at all four rounds, while other spirits keep their quality and refresh rules', () => {
		for (const spirit of activeRogueSpirits()) {
			const id = 'spirit' + spirit.id;
			const local = new RogueEngine(store, content, () => 0, true);
			const send = (action, extra = {}) => local.command(id, { id: randomUUID(), revision: store.get(id).revision, action, ...extra });
			send('start', { starters: ['bulbasaur'], useSpirit: true, testSpirit: spirit.id });
			send('spiritack');
			const run = store.get(id).run, round = run.blessings.round;
			assert.equal(round.floor, 1); assert.equal(round.remaining, spirit.id === 'jirachi' ? 2 : 1);
			if (spirit.id === 'necrozma') assert.deepEqual(round.options.map(o => o.tier), ['silver', 'gold', 'prismatic']);
			if (spirit.id === 'victini') assert(round.options.every(o => o.refreshes === 2));
			send('blessingrefresh', { slot: 0 });
			assert.deepEqual(store.get(id).run.blessings.round.options.map(o => o.tier), round.options.map(o => o.tier));
		}
		const local = new RogueEngine(store, content, () => 0, true);
		engine = local; cmd('start', { starters: ['bulbasaur'], useSpirit: true, testSpirit: 'jirachi' }); cmd('spiritack');
		cmd('blessing', { slot: 0 }); assert.equal(account().run.phase, 'blessing');
		cmd('blessing', { slot: 1 }); finishRewards(); assert.equal(account().run.phase, 'choose');
		assert.equal(account().run.blessings.owned.length, 2);
	});
	it('applies the two cumulative cost tables, preserves capture offsets, and never double inflates an encounter', () => {
		assert.deepEqual([1, 50, 100, 150].map(f => blessingLevelCost('gold', f, true)), [5, 10, 15, 20]);
		assert.deepEqual([1, 50, 100, 150].map(f => blessingLevelCost('prismatic', f, true)), [10, 20, 30, 40]);
		assert.deepEqual([1, 50, 100, 150].map(f => blessingLevelCost('gold', f)), [0, 5, 10, 15]);
		assert.deepEqual([1, 50, 100, 150].map(f => blessingLevelCost('prismatic', f)), [0, 10, 20, 30]);
		cmd('start', { starters: ['bulbasaur'] }); forceOption('lifepower'); cmd('blessing', { slot: 0 });
		const a = account(), run = a.run;
		for (const [floor, id] of [[50, 'ascent'], [100, 'weaknessarmor'], [150, 'smallfinal']]) {
			run.floor = floor; run.phase = 'blessing';
			run.blessings.round = { floor, tier: 'gold', remaining: 1, options: [{ id }], familiesSeen: [] };
			handleBlessingCommand(a, run, content, { action: 'blessing', slot: 0 }, () => 0);
		}
		run.floor = 161; activateBlessingLevels(run);
		assert.equal(run.blessings.levels, 30); assert.equal(run.blessings.bossLevels, 50);
		for (const kind of ['wild', 'elite', 'event', 'encounter', 'boss']) {
			run.floor = 100; // Gym floor: this assertion isolates the level surcharge from Fantasy-elite escorts.
			run.node = { kind, encounters: [{ team: [set('Bulbasaur', 'Overgrow', 90)] }] };
			prepareBlessingEncounter(run, () => 0); prepareBlessingEncounter(run, () => 0);
			const encounter = run.node.encounters[0], cost = kind === 'boss' ? 50 : 30;
			assert.equal(encounter.team[0].level, 90 + cost);
			assert.equal(encounter.team[0].level - encounter.blessingLevels, 90);
		}
		assert.equal(blessingView(run).bossLevels, 50);
	});
	it('settles an opening task once at the earliest reward tier and keeps legacy saves at their existing costs', () => {
		cmd('start', { starters: ['bulbasaur'] }); forceOption('battletask'); cmd('blessing', { slot: 0 });
		const a = account(), run = a.run;
		for (let floor = 1; floor <= 15; floor++) {
			run.floor = floor; run.node = { kind: 'wild', id: 'task', encounters: [] };
			completeBlessingFloor(a, run, content, () => 0);
		}
		assert.equal(run.bag.expcandyxs, 19); completeBlessingFloor(a, run, content, () => 0);
		assert.equal(run.bag.expcandyxs, 19); assert(!Object.hasOwn(run.bag, 'undefined'));
		store.change(user, saved => {
			delete saved.run.blessings.beforeAdventure; delete saved.run.blessings.bossLevels;
			saved.run.blessings.levels = 15; saved.run.floor = 73;
		});
		engine.migrate(user); assert.equal(account().run.blessings.bossLevels, 15);
		assert(!account().run.blessings.beforeAdventure);
	});
	it('keeps the access gate, rejects unearned manual selection, and leaves uncleared spirits in the random pool', () => {
		assert.throws(() => cmd('start', { starters: ['bulbasaur'], useSpirit: true }), /通关当前难度/);
		cmd('start', { starters: ['bulbasaur'] }); assert(!account().run.spirit); cmd('abandon');
		store.change(user, a => { a.spiritUnlocked = true; a.difficulties.spirits.push('0'); a.unlockedSpirits = ['kyogre']; });
		assert.throws(() => cmd('start', { starters: ['bulbasaur'], useSpirit: true, selectedSpirit: 'jirachi' }), /通关 200 层/);
		assert.throws(() => cmd('start', { starters: ['bulbasaur'], selectedSpirit: 'kyogre' }));
		cmd('start', { starters: ['bulbasaur'], useSpirit: true, selectedSpirit: 'kyogre' });
		assert.equal(account().run.spirit, 'kyogre'); cmd('abandon');
		engine = new RogueEngine(store, content, max => Math.min(activeRogueSpirits().findIndex(s => s.id === 'jirachi'), max - 1));
		cmd('start', { starters: ['bulbasaur'], useSpirit: true });
		assert.equal(account().run.spirit, 'jirachi'); assert(!account().unlockedSpirits.includes('jirachi'));
	});
	it('earns a permanent unlock at a full clear even with full card slots, and recovers historical clear evidence', () => {
		cmd('start', { starters: ['bulbasaur'] });
		const a = account(), run = a.run;
		run.floor = 200; run.phase = 'complete'; recordClear(a, run);
		assert.equal(a.spiritUnlocked, true);
		for (const spirit of ['kyogre', 'jirachi', 'necrozma']) {
			run.spirit = spirit; run.id = randomUUID(); delete run.clearRecorded;
			recordClear(a, run);
		}
		assert.equal(a.cards.length, 3); assert(a.pendingClear);
		editClearCard(a, { action: 'saveclear', value: 'discard' });
		assert(a.unlockedSpirits.includes('necrozma'));
		recordClear(a, run); assert.equal(a.unlockedSpirits.filter(id => id === 'necrozma').length, 1);
		store.change(user, saved => {
			saved.cards = a.cards;
			delete saved.unlockedSpirits; delete saved.spiritUnlocked; delete saved.run;
		});
		engine.migrate(user); assert.deepEqual(account().unlockedSpirits, ['kyogre', 'jirachi']);
		assert.equal(account().spiritUnlocked, true);
	});
});
