'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {Battle} = require('../../dist/sim/battle');
const {Teams} = require('../../dist/sim/teams');
const {rogueBattleResult} = require('../../dist/sim/fantasy-rogue');
const {RogueEngine, createRoguePokemon} = require('../../dist/server/fantasy-rogue/engine');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {recordShinyCapture, starterTraits} = require('../../dist/server/fantasy-rogue/starter-traits');
const {content, set, stats, commandAfterOpening} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue shiny persistence and starter unlocks', function () {
	this.timeout(20000);
	let store, engine, battle;
	const user = 'shinyqa', account = () => store.get(user);
	const cmd = (action, data = {}) => commandAfterOpening(engine, user,
		{id: randomUUID(), revision: account().revision, action, ...data});
	beforeEach(() => {store = new RogueStore(':memory:'); engine = new RogueEngine(store, content(), () => 0);});
	afterEach(() => {battle?.destroy(); battle = undefined; store.close();});
	it('keeps a real capture shiny through settlement, the next floor, packing, battle entry and escape', () => {
		const config = content();
		config.starters.push({id: 'slugma', set: set('Slugma', 'Magma Armor', 5, ['Ember']), availableInitially: false});
		config.unlocks.slugma = {starter: 'slugma', captures: 1};
		config.floors[1][0].kind = 'elite';
		config.floors[1][0].encounters = [{name: '闪光熔岩虫', team: [
			{...set('Slugma', 'Magma Armor', 8, ['Ember']), shiny: true},
		], style: 'balanced', catchable: true, catchChances: {pokeball: 1}}];
		engine = new RogueEngine(store, config, () => 0);
		cmd('start', {starters: ['bulbasaur']}); cmd('select', {value: 'grass'}); cmd('battle');
		let run = account().run;
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: engine.battleState(user),
			p1: {name: user, team: Teams.pack(run.team.map(m => m.set))},
			p2: {name: 'Wild', team: Teams.pack(run.node.encounters[0].team)}});
		battle.choose('p1', 'team 1'); battle.choose('p2', 'team 1');
		battle.choose('p1', 'rogueball pokeball'); battle.choose('p2', 'move 1');
		assert(battle.ended);
		const result = rogueBattleResult(battle);
		assert.equal(result.captured.set.shiny, true);
		engine.capture(user, run.battle.token, result.captured);
		engine.settle(user, run.battle.token, result);
		battle.destroy(); battle = undefined;
		assert.equal(starterTraits(account(), 'slugma').shiny, true);
		assert.equal(account().run.floor, 2);
		engine = new RogueEngine(store, config, () => 0); engine.migrate(user);
		const captured = account().run.team.find(m => m.set.species === 'Slugma');
		assert.equal(captured.set.shiny, true); assert.equal(captured.set.level, 8);
		cmd('select', {value: 'grass'}); cmd('battle'); run = account().run;
		const state = engine.battleState(user);
		const slot = state.team.findIndex(m => m.id === captured.id);
		battle = new Battle({formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4], fantasyRogue: state,
			p1: {name: user, team: Teams.pack(state.team.map(m => m.set))},
			p2: {name: 'Wild', team: Teams.pack(run.node.encounters[0].team)}});
		battle.choose('p1', `team ${slot + 1}1`); battle.choose('p2', 'team 1');
		assert.equal(battle.p1.active[0].set.shiny, true);
		assert.equal(battle.p1.active[0].level, 8);
		assert(battle.log.some(line => /^\|switch\|p1a:/.test(line) && line.includes('Slugma, L8, M, shiny')));
		cmd('retreat'); battle.win('Wild');
		engine.settle(user, run.battle.token, rogueBattleResult(battle));
		assert.equal(account().run.team.find(m => m.id === captured.id).set.shiny, true);
	});
	it('unlocks shiny starters only on confirmed captures, persists after abandonment and allows normal selection', () => {
		const build = {nature: 'random', ivs: stats(20), shiny: true};
		assert.throws(() => cmd('start', {starters: ['bulbasaur'], starterBuilds: {bulbasaur: build}}), /先捕捉/);
		cmd('start', {starters: ['bulbasaur']}); cmd('select', {value: 'grass'}); cmd('battle');
		const token = account().run.battle;
		const captured = createRoguePokemon({...set('Magikarp', 'Swift Swim', 8, ['Splash']), shiny: true}, stats(0), token.encounterId);
		engine.capture(user, token.token, captured);
		assert.equal(starterTraits(account(), 'magikarp').shiny, true);
		engine.recover(user, token.token); cmd('abandon');
		cmd('start', {starters: ['magikarp'], starterBuilds: {magikarp: build}});
		assert.equal(account().run.team[0].set.shiny, true);
		cmd('abandon'); cmd('start', {starters: ['magikarp'], starterBuilds: {magikarp: {...build, shiny: false}}});
		assert.equal(account().run.team[0].set.shiny, false);
		cmd('abandon');
		assert.throws(() => cmd('start', {starters: ['magikarp'], starterBuilds: {magikarp: {...build, shiny: 'yes'}}}), /闪光配置/);
	});
	it('recovers retained old shiny captures, including boxed ones, without granting gifts or guessing lost history', () => {
		cmd('start', {starters: ['bulbasaur']});
		store.change(user, saved => {
			saved.run.box = [createRoguePokemon({...set('Gyarados', 'Intimidate'), shiny: true}, stats(0), 'caught-shiny')];
			saved.run.caught.push('caught-shiny');
			saved.run.team.push(createRoguePokemon({...set('Mew', 'Synchronize'), shiny: true}, stats(0), 'gift'));
			saved.captures.mew = 30;
		});
		engine.migrate(user);
		assert.equal(starterTraits(account(), 'magikarp').shiny, true);
		assert(!starterTraits(account(), 'mew').shiny);
	});
	it('shares evolution-chain shiny unlocks but keeps regional starter families distinct', () => {
		const saved = account(), config = createPreviewContent();
		recordShinyCapture(saved, config, {...set('Ninetales-Alola', 'Snow Warning'), shiny: true});
		assert.equal(starterTraits(saved, 'vulpixalola').shiny, true);
		assert(!starterTraits(saved, 'vulpix').shiny);
		recordShinyCapture(saved, config, set('Ninetales', 'Drought'));
		assert(!starterTraits(saved, 'vulpix').shiny);
	});
});
