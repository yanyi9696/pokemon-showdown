'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {Battle, Dex} = require('../../dist/sim');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine, createRoguePokemon} = require('../../dist/server/fantasy-rogue/engine');
const {storyView, leaguePages} = require('../../dist/server/fantasy-rogue/story');
const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
const b = require('../../dist/server/fantasy-rogue/blessings');
const {blessing, ROGUE_BLESSINGS, FANTASY_BLESSING_ITEMS, STAGED_BLESSING_FAMILIES} = require('../../dist/sim/rogue-blessing-data');
const {sharedRogueItems} = require('../../dist/sim/fantasy-rogue-items');
const {set, stats, commandAfterOpening} = require('../fixtures/fantasy-rogue');
const owned = (id, floor = 50) => ({...blessing(id), floor});

describe('Fantasy Rogue recalibrated preparation and blessing rules', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); });
	function setup(floor = 50) {
		const run = {id: 'recalibration', floor, phase: 'blessing', team: [createRoguePokemon(set(), stats(0))],
			boosts: stats(0), bag: {}, money: 0, caught: [], startingSlots: 1};
		const account = {points: 0, slots: 1, captures: {}, unlocked: [], run};
		b.normalizeBlessings(run); return {run, account};
	}
	function pick(run, account, id) {
		run.blessings.round = {floor: run.floor, tier: blessing(id).tier, remaining: 1,
			options: [{id, refreshes: 0, chosen: false}], familiesSeen: [blessing(id).family]};
		b.handleBlessingCommand(account, run, content, {action: 'blessing', slot: 0}, () => 0);
	}
	it('publishes every floor restriction separately, including locked codex entries', () => {
		const entries = rogueCodex(undefined, 'blessings').entries;
		for (const def of ROGUE_BLESSINGS) assert.deepEqual(entries.find(e => e.id === def.id).floors,
			STAGED_BLESSING_FAMILIES.includes(def.family) ? [1] : def.floors);
		for (const floor of [1, 50, 100, 150]) {
			const {run} = setup(floor), candidates = b.blessingCandidates(run, content);
			for (const id of ['insight', 'hpgrowth']) assert.equal(candidates.some(e => e.id === id), floor === 1);
		}
		assert.equal(blessing('renewable').tier, 'prismatic');
	});
	it('gives ten usable max revives, and increases money and Pandora rewards', () => {
		const {run, account} = setup(1); pick(run, account, 'insight');
		assert.equal(run.bag.maxrevive, 10);
		assert.equal(content.items.find(i => i.id === 'maxrevive').amount, 1);
		run.floor = 50; pick(run, account, 'bigmoney'); assert.equal(run.money, 20000);
		pick(run, account, 'pandoragold');
		assert(FANTASY_BLESSING_ITEMS.some(id => run.bag[id]));
		assert.equal(run.blessings.pending.filter(r => r.kind === 'toolbox').length, 2);
	});
	it('each overtime gift is level-eligible and actually carries the setter ability or learned move', () => {
		for (const floor of [1, 50, 100, 150]) for (const def of ROGUE_BLESSINGS.filter(d => d.family === 'overtime')) {
			const {run, account} = setup(floor), pool = b.overtimeGiftPool(run, content, def.type);
			if (!pool.length) { assert(!b.blessingCandidates(run, content).some(b => b.id === def.id)); continue; }
			if (floor === 50 && def.type === 'sandstorm') assert(!pool.includes('Tyranitar'));
			pick(run, account, def.id);
			const gift = run.blessings.pending.find(r => r.kind === 'gift').pokemon;
			assert.equal(gift.set.level, floor === 1 ? 5 : floor / 2);
			assert(pool.includes(gift.set.species));
			if (b.OVERTIME_ABILITIES[def.type]) assert.equal(Dex.abilities.get(gift.set.ability).id, b.OVERTIME_ABILITIES[def.type]);
			else { assert(gift.set.moves.includes(def.type)); assert(gift.pp.some(m => m.id === def.type && m.pp > 0)); }
		}
	});
	it('fills initial-partner bond within ten healthy floors after friendship is full', () => {
		const {run, account} = setup(1);
		run.team[0].initialPartner = true; run.team[0].set.happiness = 255;
		pick(run, account, 'bond');
		for (let floor = 2; floor <= 11; floor++) {
			run.floor = floor; run.node = {kind: 'reward', encounters: []};
			b.completeBlessingFloor(account, run, content, () => 0);
		}
		assert.equal(run.team[0].bond, 100);
	});
	it('capture aid pays coins, supplies and a graded candy only once per captured individual', () => {
		const {run, account} = setup(50); run.blessings.owned.push(owned('capturebonus'));
		const result = {encounterId: 'c', won: true, captures: [{id: 'caught'}], defeated: [], team: []};
		b.settleBlessingBattle(account, run, content, result, () => 0);
		assert.equal(run.money, 550); assert.equal(run.bag.expcandym, 1);
		const snapshot = JSON.stringify(run);
		b.settleBlessingBattle(account, run, content, result, () => 0); assert.equal(JSON.stringify(run), snapshot);
	});
	it('persists announced bosses and the full league roster without recording them as already fought', () => {
		const store = new RogueStore(':memory:');
		try {
			let engine = new RogueEngine(store, content, () => 0);
			const user = 'previewqa', account = () => store.get(user);
			commandAfterOpening(engine, user, {id: randomUUID(), revision: 0, action: 'start', starters: ['bulbasaur']});
			content.story = true;
			engine = new RogueEngine(store, content, () => 0);
			const cmd = (action, extra = {}) => engine.command(user, {id: randomUUID(), revision: account().revision, action, ...extra});
			function enter(floor) {
				store.change(user, a => { a.run.floor = floor; a.run.phase = 'choose'; delete a.run.node; delete a.run.choices; delete a.run.story; });
				cmd('select', {value: content.floors[floor][0].id});
			}
			enter(19);
			const before = account().run;
			assert.equal(before.trainerHistory.gyms.length, 0);
			cmd('storynext', {value: storyView(account(), true, false).key});
			const announced = storyView(account(), true, false).roster;
			assert(announced.avatar && announced.pokemon.length);
			engine = new RogueEngine(store, content, () => { throw Error('unexpected reroll'); });
			engine.migrate(user);
			cmd('storyskip', {value: storyView(account(), true, false).key}); cmd('mentorcard', {value: 'guard'}); cmd('continue');
			assert.deepEqual(account().run.node.encounters[0].team.map(s => s.species), announced.pokemon);
			assert.equal(account().run.trainerHistory.gyms.length, 1);
			engine = new RogueEngine(store, content, () => 0);
			enter(160);
			store.change(user, a => {
				a.run.trainerHistory.gyms = ['brock', 'sabrina', 'flannery', 'roxie', 'viola', 'acerola', 'nessa', 'larry'];
				a.run.node.encounters[0].trainer = {id: 'larry', name: '道馆 · 青木', role: 'gym', avatar: 'larry'};
			});
			cmd('storyskip', {value: storyView(account(), true, false).key}); cmd('battle');
			const current = account().run;
			engine.settle(user, current.battle.token, {encounterId: current.battle.encounterId, won: true, team: current.team, bag: current.bag});
			assert.equal(account().run.story.stage, 'interlude');
			cmd('storyskip', {value: storyView(account(), true, false).key});
			assert.equal(account().run.story.stage, 'leaguebriefing');
			const pages = leaguePages(account().run); assert.equal(pages.length, 6); assert(pages[0].text.includes('兼着四天王'));
			assert.equal(new Set(Object.values(account().run.trainerHistory.elitePlan)).size, 4);
			assert(Object.values(account().run.trainerHistory.elitePlan).includes('larry'));
			assert(Object.values(account().run.trainerHistory.elitePlan).includes('acerola'));
			assert.equal(account().run.trainerHistory.eliteFour.length, 0);
			const points = account().points;
			cmd('storyskip', {value: storyView(account(), true, false).key});
			assert.equal(account().run.floor, 161); assert.equal(account().points, points);
			for (const floor of [165, 175, 180, 185, 190]) {
				const preview = account().run.bossPreviews[floor]; enter(floor);
				assert.equal(account().run.node.encounters[0].trainer.id, preview.encounters[0].trainer.id);
				assert.deepEqual(account().run.node.encounters[0].team.map(s => s.species), preview.encounters[0].team.map(s => s.species));
			}
		} finally { store.close(); }
	});
});

describe('Fantasy Rogue recalibration in native battles', () => {
	let battle;
	afterEach(() => battle?.destroy());
	function begin(ids, ours, options = {}) {
		const team = ours.map(s => createRoguePokemon(s, stats(0)));
		if (options.bond) team[0].bond = 100;
		const effects = {owned: ids.map(id => owned(id))};
		for (const entry of effects.owned) if (entry.target) entry.target = team[0].id;
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: {encounterId: 'native-recal', team, boosts: stats(0), bag: {}, balls: [], catchable: false,
				blessings: effects, systems: {player: {mega: true}}},
			p1: {team: team.map(m => m.set)}, p2: {team: [set('Blissey', 'Natural Cure', 100, ['Splash', 'Tackle'])]}});
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		return battle.p1.active[0];
	}
	it('grants Merciless to the chosen member and critically hits a poisoned opponent', () => {
		const a = begin(['toxic'], [set('Snorlax', 'Immunity', 50, ['Tackle'])]), foe = battle.p2.active[0];
		assert(a.hasAbility('merciless')); assert(!a.hasAbility('toxicdebris')); assert(a.hasAbility('immunity'));
		foe.setStatus('psn', a); battle.makeChoices('move 1', 'move 1');
		assert(battle.log.some(line => line.startsWith('|-crit|p2')));
	});
	it('resolves bond survival before Survive without switching or consuming its allowance', () => {
		const a = begin(['bond', 'survive'], [set('Snorlax', 'Immunity', 50, ['Splash']), set()], {bond: true});
		battle.randomChance = () => true;
		battle.damage(a.maxhp + 1, a, battle.p2.active[0], battle.dex.moves.get('tackle'));
		assert.equal(a.hp, 1); assert(!a.switchFlag); assert(!a.m.rogueBlessing.survived);
		assert(battle.log.some(line => line.includes('因为怕你担心，它挺住了这次攻击')));
	});
	it('extends own Tailwind by three turns without extending the opponent side', () => {
		const a = begin(['overtimetailwind'], [set('Talonflame', 'Flame Body', 50, ['Tailwind'])]);
		battle.p1.addSideCondition('tailwind', a); battle.p2.addSideCondition('tailwind', battle.p2.active[0]);
		assert.equal(battle.p1.sideConditions.tailwind.duration, 7); assert.equal(battle.p2.sideConditions.tailwind.duration, 4);
	});
	it('adds ordinary-team damage only while every saved member has at most 500 BST', () => {
		const a = begin(['ordinary'], [set('Pikachu', 'Static', 50, ['Tackle']), set()]);
		const move = battle.dex.getActiveMove('tackle');
		assert.equal(battle.runEvent('ModifyDamage', a, battle.p2.active[0], move, 100), 115);
		battle.fantasyRogue.team[1].set.species = 'Dragonite';
		assert.equal(battle.runEvent('ModifyDamage', a, battle.p2.active[0], move, 100), 100);
	});
	it('uses final Speed with a continuous five-percent-per-hundred damage-move power bonus', () => {
		const a = begin(['speedpower'], [set('Pikachu', 'Static', 50, ['Tackle'])]);
		a.storedStats.spe = 200;
		assert.equal(a.getStat('spe'), 300);
		assert.equal(Math.round(battle.runEvent('BasePower', a, battle.p2.active[0], battle.dex.getActiveMove('tackle'), 100)), 115);
	});
	for (const forme of ['X', 'Y']) it(`shares Fantasy Protector and Light Ball after Raichu Mega ${forme}`, () => {
		const team = ['Raichu', 'Pikachu', 'Plusle', 'Minun', 'Pachirisu', 'Dedenne'].map((name, i) =>
			({...set(name, 'Static', 100, ['Splash']), item: [`Raichunite ${forme}`, 'Fantasy Protector', 'Light Ball'][i] || ''}));
		const a = begin(['mousefamily'], team);
		assert(a.canMegaEvo); battle.actions.runMegaEvo(a);
		assert.equal(a.species.name, `Raichu-Mega-${forme}`);
		assert(sharedRogueItems(a).includes('fantasyprotector')); assert(sharedRogueItems(a).includes('lightball'));
		assert.equal(a.getStat('atk'), a.storedStats.atk * 2);
		assert(Math.abs(a.getStat('def') - a.storedStats.def * 1.2) <= 1);
	});
});
