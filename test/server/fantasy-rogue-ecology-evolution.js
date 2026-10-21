'use strict';
const assert = require('assert').strict;
const {randomUUID} = require('crypto');
const {Dex} = require('../../dist/sim/dex');
const {emptyRogueStats} = require('../../dist/sim/fantasy-rogue');
const {RogueStore} = require('../../dist/server/fantasy-rogue/store');
const {RogueEngine} = require('../../dist/server/fantasy-rogue/engine');
const {createPreviewContent} = require('../../dist/server/fantasy-rogue/preview-content');
const {createRoguePokemon, evolveMember} = require('../../dist/server/fantasy-rogue/progression');
const {makeEncounterSet} = require('../../dist/server/fantasy-rogue/encounter-sets');
const {partyEvolutions} = require('../../dist/server/fantasy-rogue/party-evolution');
const {evolutionChildren, possibleWildStages, wildStageLevels} = require('../../dist/server/fantasy-rogue/evolution');
const {RogueBiomes} = require('../../dist/server/fantasy-rogue/biome-data');
const {createBiomeRoutes} = require('../../dist/server/fantasy-rogue/biome-routes');
const {rogueCodex} = require('../../dist/server/fantasy-rogue/codex');
const {blessing} = require('../../dist/sim/rogue-blessing-data');
const {centerCare} = require('../../dist/server/fantasy-rogue/economy');
const {commandAfterOpening} = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue ecology collection and evolution conditions', function () {
	this.timeout(30000);
	let store, engine, content;
	const user = 'ecologytest';
	const account = () => store.get(user);
	const cmd = (action, data = {}) => commandAfterOpening(engine, user, {
		id: randomUUID(), revision: account().revision, action, ...data,
	});
	const member = (name, level = 100) => createRoguePokemon(makeEncounterSet(name, level), emptyRogueStats());
	before(() => { content = createPreviewContent(); });
	beforeEach(() => {
		store = new RogueStore(':memory:'); engine = new RogueEngine(store, content, () => 0);
		cmd('start', {starters: ['bulbasaur']});
	});
	afterEach(() => store.close());

	it('never labels genderless or already fixed-gender parents as needing a male/female evolution', () => {
		const dex = Dex.mod('gen9');
		for (const parent of dex.species.all().filter(s => s.num > 0 && s.num <= 1025 && !s.battleOnly && !s.isMega)) {
			if (!evolutionChildren(parent.name).length) continue;
			const mon = {set: {species: parent.name, gender: parent.gender || 'M', level: 100, moves: [], item: '', happiness: 255}, hp: 1};
			for (const option of partyEvolutions(mon)) {
				const child = dex.species.get(option.species);
				if (child.gender === 'N' || child.gender === parent.gender) {
					assert(!option.requirements.some(r => r.text.startsWith('性别为')), `${parent.name} → ${child.name}`);
				}
			}
		}
		const golett = member('Golett', 43);
		assert.deepEqual(partyEvolutions(golett)[0].requirements, [{text: '等级达到 Lv.43', met: true}]);
		assert(partyEvolutions(golett)[0].ready);
		const nincada = member('Nincada', 20); nincada.set.gender = 'M';
		evolveMember({team: [nincada], floor: 20, bag: {}, boosts: emptyRogueStats()}, nincada, 'Shedinja');
		assert.equal(nincada.set.gender, 'N', 'evolving into a genderless species does not retain the old sex');
	});
	it('retains true branching gender conditions for Gallade, Froslass, Vespiquen and Salazzle', () => {
		for (const [parent, child, gender] of [['Kirlia', 'Gallade', 'M'], ['Snorunt', 'Froslass', 'F'], ['Combee', 'Vespiquen', 'F'], ['Salandit', 'Salazzle', 'F']]) {
			const mon = member(parent), context = {floor: 1, bag: {dawnstone: 1}};
			mon.set.gender = gender === 'M' ? 'F' : 'M';
			assert(!partyEvolutions(mon, context).find(e => e.species === child).ready, child);
			mon.set.gender = gender;
			assert(partyEvolutions(mon, context).find(e => e.species === child).ready, child);
		}
	});
	it('consumes a real evolution-category Crest once to evolve Bisharp without a second level gate', () => {
		const crest = content.items.find(i => i.id === 'leaderscrest');
		assert.equal(crest.kind, content.items.find(i => i.id === 'blackaugurite').kind);
		assert.equal(crest.icon, 'leaderscrest');
		const mon = member('Bisharp', 52);
		assert(!partyEvolutions(mon, {floor: 100, bag: {}})[0].ready);
		store.change(user, a => {
			a.run.phase = 'ready'; a.run.team = [mon]; a.run.bag.leaderscrest = 1;
		});
		assert.deepEqual(partyEvolutions(mon, {floor: 100, bag: {leaderscrest: 1}})[0].requirements,
			[{text: '使用', name: '头领凭证', met: true, resource: true}]);
		const request = {id: randomUUID(), revision: account().revision, action: 'evolve', member: mon.id, value: 'kingambit'};
		engine.command(user, request); const saved = account(); engine.command(user, request);
		assert.deepEqual(account(), saved); assert.equal(saved.run.bag.leaderscrest, 0);
		assert.equal(saved.run.team[0].set.species, 'Kingambit');
		assert.equal(saved.run.team[0].set.level, 52);
	});
	it('excludes offered wild and elite ecologies for the following five floors', () => {
		const history = [], template = kind => ({id: kind, kind, name: '', encounters: [], reward: {money: 0, items: {}}});
		for (let floor = 1; floor <= 30; floor++) {
			const routes = createBiomeRoutes(floor, [template('wild'), template('elite')], undefined, () => 0, undefined, undefined, [], history);
			assert.notEqual(routes[0].biome.id, routes[1].biome.id, 'same-floor alternatives are diverse');
			for (const node of routes) {
				assert(!history.some(h => h.id === node.biome.id && floor - h.floor <= 5), `floor ${floor}: ${node.name}`);
				history.push({id: node.biome.id, floor});
			}
		}
	});
	it('saves the offer history once and never rerolls it on repeated state restoration', () => {
		const before = account();
		assert(before.run.biomeHistory.length);
		engine.migrate(user); engine.migrate(user);
		assert.deepEqual(account().run.biomeHistory, before.run.biomeHistory);
		assert.deepEqual(account().run.choices, before.run.choices);
	});
	it('recovers only retained current-floor ecologies from an old save', () => {
		store.change(user, a => { delete a.run.biomeHistory; });
		const before = account(); engine.migrate(user);
		const expected = [...new Set(before.run.choices.flatMap(n => n.biome ? [n.biome.id] : []))]
			.map(id => ({id, floor: before.run.floor}));
		assert.deepEqual(account().run.biomeHistory, expected);
		assert.deepEqual(account().run.choices, before.run.choices);
	});
	it('reveals only actual catches in that ecology, including releases, and retains them across runs', () => {
		const route = account().run.choices.find(n => n.biome);
		cmd('select', {value: route.id}); cmd('battle');
		const r = account().run;
		const caught = createRoguePokemon(r.node.encounters[0].team[0], emptyRogueStats(), `${r.battle.encounterId}:foe:0`);
		engine.capture(user, r.battle.token, caught); const saved = account();
		engine.capture(user, r.battle.token, caught); assert.deepEqual(account(), saved);
		const species = Dex.toID(caught.set.species);
		assert.deepEqual(saved.biomeCaptures[route.biome.id], [species]);
		const guide = rogueCodex(saved, 'events').entries.filter(e => e.category === 'ecology');
		const here = guide.find(b => b.id === route.biome.id);
		assert(here.pokemon.some(p => Dex.toID(p.species) === species && p.caught));
		assert(guide.filter(b => b !== here).every(b => [...b.pokemon, ...b.visitors].every(p => !p.caught)));
		store.change(user, a => { delete a.run; });
		cmd('start', {starters: ['bulbasaur']});
		assert.deepEqual(account().biomeCaptures, saved.biomeCaptures);
	});
	it('does not infer ecological captures from global captures or mutate records in local preview', () => {
		const a = account(); a.caughtSpecies = ['caterpie']; a.captures.caterpie = 10;
		const before = JSON.stringify(a);
		const ordinary = rogueCodex(a, 'events').entries.filter(e => e.category === 'ecology');
		assert.equal(ordinary.length, 14);
		assert(ordinary.every(b => b.pokemon.length && b.visitors.length));
		assert(ordinary.every(b => [...b.pokemon, ...b.visitors].every(p => !p.caught)));
		assert(rogueCodex(a, 'events', true).entries.filter(e => e.category === 'ecology').every(b => b.pokemon.every(p => p.caught)));
		assert.equal(JSON.stringify(a), before);
	});
	it('uses level boundaries without losing branching or early-stage ecology icons', () => {
		for (const biome of RogueBiomes) for (const tier of [0, 2, 4]) {
			for (const name of ['Eevee', 'Tyrogue', 'Rockruff', 'Scyther', 'Tyranitar', 'Bisharp', 'Porygon', 'Wurmple']) {
				const collect = levels => [...new Set(levels.flatMap(level => possibleWildStages(name, level, biome, tier)))].sort();
				assert.deepEqual(collect(wildStageLevels(name, biome, tier)), collect(Array.from({length: 98}, (_, i) => i + 3)), `${biome.id}:${tier}:${name}`);
			}
		}
	});
	it('states the independent HP thresholds and continuous defense curve in Pure Godrobe', () => {
		const text = blessing('puregodrobe').text;
		assert(text.includes('每场首次降至50% HP 及以下时'));
		assert(text.includes('50% HP 时 ×1.5') && text.includes('25% HP 时 ×3') && text.includes('上限 ×6'));
		assert(!text.includes('神衣鲜血') && !text.includes('半血时'));
	});
	it('does not bill an unhatched egg as a fainted partner at a recovery center', () => {
		const mon = member('Bulbasaur', 5), egg = {...member('Turtwig', 5), hp: 0, egg: {}};
		const run = {floor: 19, team: [mon, egg]};
		assert.equal(centerCare(run).cost, 0);
		assert.equal(centerCare(run).fainted, 0);
		mon.hp = 0;
		assert.equal(centerCare(run).fainted, 1);
		assert.equal(centerCare(run).cost, centerCare({...run, team: [mon]}).cost);
	});
});
