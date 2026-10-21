'use strict';
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');

const assert = require('assert').strict;
const { Dex } = require('../../dist/sim/dex');
const { RogueBiomes } = require('../../dist/server/fantasy-rogue/biome-data');
const { weightedPick, pickBiomeSlot, biomeTier, unlistedFamilies, MajorLegendaryPool } =
	require('../../dist/server/fantasy-rogue/biome-pools');
const { createBiomeRoutes } = require('../../dist/server/fantasy-rogue/biome-routes');
const { lowerToEligibleStage, evolutionChildren, wildStageAtLevel, partyEvolutionLevel } =
	require('../../dist/server/fantasy-rogue/evolution');
const { makeEncounterSet, randomEncounterIVs } = require('../../dist/server/fantasy-rogue/encounter-sets');
const { createRoguePokemon, levelMoves, evolutionOptions } = require('../../dist/server/fantasy-rogue/progression');
const { rogueStarterSpecies, rogueEffortYield } = require('../../dist/sim/fantasy-rogue-rules');
const { emptyRogueStats } = require('../../dist/sim/fantasy-rogue');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { randomUUID } = require('crypto');

describe('Fantasy Rogue ecology building blocks', () => {
	it('contains the corrected 70 pools of 20 slots, each totaling exactly 100 percent', () => {
		assert.equal(RogueBiomes.length, 14);
		for (const biome of RogueBiomes) {
			assert.equal(biome.tiers.length, 5);
			for (const tier of biome.tiers) {
				assert.equal(tier.length, 20);
				assert.equal(tier.reduce((sum, slot) => sum + slot.weight, 0), 100);
				assert.deepEqual([6, 4, 2].map(weight => tier.filter(slot => slot.weight === weight).length), [12, 6, 2]);
			}
		}
		assert.deepEqual(RogueBiomes[5].tiers[4].filter(slot => slot.weight === 6).flatMap(slot => slot.species),
			['Gengar', 'Dusknoir', 'Banette', 'Cursola', 'Mimikyu', 'Chandelure', 'Shedinja', 'Annihilape',
				'Aegislash', 'Zoroark-Hisui', 'Gholdengo', 'Dragapult']);
		assert.equal(RogueBiomes[2].tiers[3].filter(slot => slot.species.includes('Rhyperior')).length, 1);
		assert(RogueBiomes[2].tiers[3].some(slot => slot.species.includes('Excadrill')));
		assert(!RogueBiomes[13].tiers[2].some(slot => slot.species.includes('Palafin-Hero')));
	});
	it('maps floor boundaries to five tiers and caps the higher elite tier', () => {
		assert.deepEqual([1, 40, 41, 80, 81, 120, 121, 160, 161, 200].map(floor => biomeTier(floor)),
			[0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
		assert.deepEqual([1, 41, 81, 121, 161, 200].map(floor => biomeTier(floor, true)), [1, 2, 3, 4, 4, 4]);
	});
	it('assigns exactly 6/4/2 percent to each slot and shares slash alternatives', () => {
		const slots = RogueBiomes[0].tiers[0];
		for (const slot of slots) {
			assert.equal(Array.from({ length: 100 }, (_, roll) => weightedPick(slots, () => roll))
				.filter(drawn => drawn === slot).length, slot.weight);
		}
		const shared = [{ weight: 6, species: ['Huntail', 'Gorebyss'] }];
		assert.equal(pickBiomeSlot(shared, () => 0), 'Huntail');
		assert.equal(pickBiomeSlot(shared, max => max - 1), 'Gorebyss');
	});
	it('does not put an evolved elite below any explicit level requirement in its chain', () => {
		assert.equal(lowerToEligibleStage('Tyranitar', 27), 'Larvitar');
		assert.equal(lowerToEligibleStage('Tyranitar', 30), 'Pupitar');
		assert.equal(lowerToEligibleStage('Tyranitar', 55), 'Tyranitar');
		assert.equal(lowerToEligibleStage('Gengar', 20), 'Gastly');
		assert.equal(lowerToEligibleStage('Palafin-Hero', 37), 'Finizen');
		assert.equal(lowerToEligibleStage('Palafin-Hero', 38), 'Palafin-Hero');
		assert.deepEqual(evolutionChildren('Rockruff').map(species => species.name),
			['Lycanroc', 'Lycanroc-Midnight', 'Lycanroc-Dusk']);
	});
	it('uses 15-level gaps for unnumbered evolutions, with listed-form exceptions and all wild branches', () => {
		const forest = RogueBiomes[0];
		assert.equal(wildStageAtLevel('Treecko', 15, forest, 0, () => 0), 'Treecko');
		assert.equal(wildStageAtLevel('Treecko', 16, forest, 0, () => 0), 'Grovyle');
		assert.equal(wildStageAtLevel('Treecko', 36, forest, 1, () => 0), 'Sceptile');
		assert.equal(wildStageAtLevel('Scyther', 34, forest, 1, () => 0), 'Scyther');
		assert.equal(wildStageAtLevel('Scyther', 35, forest, 1, () => 0), 'Scizor');
		assert.equal(wildStageAtLevel('Scyther', 35, forest, 1, max => max - 1), 'Kleavor');
		assert.equal(wildStageAtLevel('Victreebel', 24, forest, 2, () => 0), 'Weepinbell');
		assert.equal(wildStageAtLevel('Victreebel', 30, forest, 2, () => 0), 'Victreebel');
		assert.equal(wildStageAtLevel('Victreebel', 20, forest, 2, () => 0), 'Bellsprout');
		assert.equal(wildStageAtLevel('Glalie', 26, RogueBiomes[6], 2, () => 0), 'Snorunt');
		assert.equal(wildStageAtLevel('Magneton', 44, RogueBiomes[4], 2, () => 0), 'Magneton');
		assert.equal(wildStageAtLevel('Magneton', 45, RogueBiomes[4], 2, () => 0), 'Magnezone');
		for (const [index, name] of ['Lycanroc', 'Lycanroc-Midnight', 'Lycanroc-Dusk'].entries()) {
			assert.equal(wildStageAtLevel('Rockruff', 25, RogueBiomes[2], 1, () => index), name);
		}
		assert.equal(partyEvolutionLevel('Crobat'), 37);
		assert.equal(partyEvolutionLevel('Rhyperior'), 57);
		const before = createRoguePokemon(makeEncounterSet('Golbat', 36), emptyRogueStats());
		before.set.happiness = 159;
		assert.deepEqual(evolutionOptions(before), []);
		before.set.happiness = 160;
		assert.deepEqual(evolutionOptions(before), [{ species: 'Crobat' }], 'party friendship evolution no longer uses the wild level gap');
		const rockruff = createRoguePokemon(makeEncounterSet('Rockruff', 25), emptyRogueStats());
		assert.equal(evolutionOptions(rockruff).length, 3);
	});
	it('excludes every mentioned family and major legendary from the extra pool', () => {
		const pool = unlistedFamilies();
		assert(pool.includes('Paras'));
		for (const absent of ['Meltan', 'Mewtwo', 'Cosmog', 'Regigigas', 'Teddiursa', 'Finizen', 'Pichu']) {
			assert(!pool.includes(absent), absent);
		}
		assert(MajorLegendaryPool.includes('Regigigas'));
		assert(MajorLegendaryPool.includes('Terapagos'));
		assert(!MajorLegendaryPool.includes('Cosmog'));
	});
	it('keeps named forms playable and resolves their real first-stage starters', () => {
		assert.equal(rogueStarterSpecies('Palafin-Hero').name, 'Finizen');
		assert.equal(rogueStarterSpecies('Ninetales-Alola').name, 'Vulpix-Alola');
		assert.equal(rogueStarterSpecies('Melmetal').name, 'Meltan');
		assert.equal(rogueStarterSpecies('Shaymin-Sky').name, 'Shaymin');
		const names = [...new Set(RogueBiomes.flatMap(biome => biome.tiers.flatMap(tier =>
			tier.flatMap(slot => slot.species))))];
		for (const name of names) {
			const set = makeEncounterSet(name, 50);
			const mon = createRoguePokemon(set, emptyRogueStats());
			assert.equal(mon.set.species, Dex.mod('gen9').species.get(name).name);
			assert(rogueEffortYield(name));
			makeEncounterSet(rogueStarterSpecies(name).name, 5);
		}
		assert.equal(makeEncounterSet('Ogerpon-Wellspring', 90).item, 'Wellspring Mask');
		assert(levelMoves('Rotom-Frost').some(move => move.move === 'thundershock'));
		assert.equal(rogueEffortYield('Indeedee-F').spd, 2);
		assert.equal(rogueEffortYield('Indeedee').spa, 2);
	});
	it('adds an independent fourth encounter without inventing an extra reward', () => {
		const template = { id: 'wild0', name: 'old', kind: 'wild', encounters: [], reward: { money: 100, items: {} } };
		const before = structuredClone(template);
		const [route] = createBiomeRoutes(1, [template], name => name, () => 0);
		assert.equal(route.name, '绿茵森林');
		assert.equal(route.encounters.length, 1);
		assert.equal(route.encounters[0].team.length, 4);
		assert.equal(route.encounters[0].catchable, true);
		assert.deepEqual(route.reward, template.reward);
		assert.deepEqual(template, before);
		const [ordinary] = createBiomeRoutes(1, [template], undefined, max => Math.min(1, max - 1));
		assert.equal(ordinary.encounters[0].team.length, 3);
	});
	it('rolls the six IVs independently from 20 through 31 and preserves them on rebuild', () => {
		const values = [0, 999, 420, 920, 140, 800];
		let calls = 0;
		const ivs = randomEncounterIVs(max => { assert.equal(max, 1000); return values[calls++]; });
		assert.equal(calls, 6);
		assert.deepEqual(ivs, { hp: 20, atk: 31, def: 23, spa: 28, spd: 21, spe: 26 });
		const set = makeEncounterSet('Bulbasaur', 5, ivs);
		assert.notEqual(set.ivs, ivs);
		const mon = createRoguePokemon(set, emptyRogueStats());
		const { rebuildMember } = require('../../dist/server/fantasy-rogue/progression');
		rebuildMember(mon, emptyRogueStats());
		assert.deepEqual(mon.set.ivs, ivs);
		const legacy = createRoguePokemon(makeEncounterSet('Bulbasaur', 5, 15), emptyRogueStats());
		rebuildMember(legacy, emptyRogueStats());
		assert(Object.values(legacy.set.ivs).every(iv => iv === 15), 'saved IVs are not retroactively raised');
	});
	it('uses weighted independent IVs for ordinary encounters and regional elites', () => {
		const template = { id: 'wild', name: 'old', kind: 'wild', encounters: [], reward: { money: 0, items: {} } };
		for (const value of [0, 999]) {
			const [route] = createBiomeRoutes(1, [template], name => name, max => max === 1000 ? value : 0);
			assert.equal(route.encounters[0].team.length, 4, 'the bonus member is included');
			for (const mon of route.encounters[0].team) {
				assert(Object.values(mon.ivs).every(iv => iv === (value ? 31 : 20)));
			}
		}
		for (const floor of [1, 100, 161, 181]) {
			const [route] = createBiomeRoutes(floor, [{ ...template, kind: 'elite' }], name => name, max => {
				return 0;
			});
			assert(Object.values(route.encounters[0].team[0].ivs).every(iv => iv === 25));
		}
	});
	it('permits legendary elite captures only from floor 161', () => {
		const template = { id: 'elite', name: 'old', kind: 'elite', encounters: [], reward: { money: 100, items: {} } };
		const [major] = createBiomeRoutes(162, [template], undefined, () => 0);
		assert.equal(major.encounters[0].team[0].species, 'Mewtwo');
		assert.equal(major.encounters[0].team[0].level, 86);
		assert.equal(major.encounters[0].catchable, true);
		let draws = 0;
		const [regional] = createBiomeRoutes(162, [template], undefined, () => ++draws === 2 ? 25 : 0);
		assert.equal(regional.encounters[0].team[0].species, 'Scolipede');
		const [early] = createBiomeRoutes(159, [template], undefined, () => 0);
		assert.equal(early.encounters[0].team[0].species, 'Scolipede');
	});
	it('uses exact 25/50 percent elite legendary chances, boosted to 50/75, across floor boundaries', () => {
		const template = { id: 'elite', name: 'old', kind: 'elite', encounters: [], reward: { money: 0, items: {} } };
		for (const spirit of [undefined, 'mew']) {
			for (const [floor, ordinary, boosted] of [[160, 0, 0], [161, 25, 50], [180, 25, 50], [181, 50, 75], [200, 50, 75]]) {
				let majors = 0;
				for (let roll = 0; roll < 100; roll++) {
					let calls = 0;
					const [route] = createBiomeRoutes(floor, [template], name => name,
						() => ++calls === 2 && floor >= 161 ? roll : 0, spirit);
					if (MajorLegendaryPool.includes(route.encounters[0].team[0].species)) majors++;
				}
				assert.equal(majors, spirit ? boosted : ordinary, `floor ${floor}, spirit ${spirit}`);
			}
		}
	});
	it('boosts both rare and uncommon slots while preserving ordinary slots and total draws', () => {
		const template = { id: 'wild', name: 'old', kind: 'wild', encounters: [], reward: { money: 0, items: {} } };
		const counts = new Map();
		for (let roll = 0; roll < 156; roll++) {
			const [route] = createBiomeRoutes(1, [template], name => name, max => max === 156 ? roll : 0, 'mew');
			const name = route.encounters[0].team[0].species;
			counts.set(name, (counts.get(name) || 0) + 1);
		}
		for (const slot of RogueBiomes[0].tiers[0]) {
			assert.equal(counts.get(slot.species[0]), slot.weight === 4 ? 12 : 6, slot.species[0]);
		}
	});
	it('adds one to five wild levels by 40-floor stage without exceeding 100 or changing trainers', () => {
		const wild = { id: 'wild', name: 'old', kind: 'wild', encounters: [], reward: { money: 0, items: {} } };
		for (const [floor, bonus] of [[1, 1], [40, 1], [41, 2], [80, 2], [81, 3], [120, 3], [121, 4], [160, 4], [161, 5], [200, 5]]) {
			for (const kind of ['wild', 'elite']) {
				const [route] = createBiomeRoutes(floor, [{ ...wild, kind }], name => name, () => 0, 'mew');
				assert.equal(route.biome.level, Math.min(100, Math.max(3, Math.ceil(floor / 2)) + bonus + (kind === 'elite' ? 5 : 0)));
			}
		}
		const trainer = { ...wild, kind: 'gym', encounters: [{ trainer: { id: 'brock' }, team: [{ species: 'Onix', level: 20 }] }] };
		assert.deepEqual(createBiomeRoutes(40, [trainer], undefined, () => 0, 'mew'), [trainer]);
	});
});

describe('Fantasy Rogue saved regional encounters', () => {
	let content, store, engine, draws;
	const user = 'biometest';
	const account = () => store.get(user);
	const cmd = (action, details = {}) => commandAfterOpening(engine, user, {
		id: randomUUID(), revision: account().revision, action, ...details,
	});
	before(() => { content = createPreviewContent(); });
	beforeEach(() => {
		draws = 0;
		store = new RogueStore(':memory:');
		engine = new RogueEngine(store, content, () => { draws++; return 0; });
		cmd('start', { starters: ['bulbasaur'] });
	});
	afterEach(() => store.close());
	it('persists visible routes, all opponents and the extra encounter across queries, losses and reloads', () => {
		const choices = account().run.choices;
		const drawn = draws;
		assert.equal(choices.find(node => node.id === 'wild0').encounters.length, 1);
		assert.equal(choices.find(node => node.id === 'wild0').encounters[0].team.length, 4);
		engine.migrate(user); engine.migrate(user);
		assert.equal(draws, drawn);
		assert.deepEqual(account().run.choices, choices);
		const request = { id: randomUUID(), revision: account().revision, action: 'select', value: 'wild0' };
		engine.command(user, request); engine.command(user, request);
		const selected = account().run.node;
		// Nature is assigned on route entry; the encounter identity, moves and promised loot are retained.
		const expected = structuredClone(choices.find(node => node.id === 'wild0'));
		expected.blessingPrepared = true;
		expected.encounters.forEach((encounter, i) => {
			encounter.blessingLevels = 0;
			encounter.team.forEach((set, j) => { set.nature = selected.encounters[i].team[j].nature; });
		});
		assert.deepEqual(selected, expected);
		cmd('battle');
		const run = account().run;
		run.team[0].hp = 0;
		engine.settle(user, run.battle.token, { encounterId: run.battle.encounterId, won: false, team: run.team, bag: run.bag });
		engine = new RogueEngine(store, content, () => { throw new Error('must not reroll'); });
		engine.migrate(user);
		assert.deepEqual(account().run.node, selected);
		assert.equal(account().run.encounter, 0);
		assert.equal(account().run.team[0].hp, 0);
	});
	it('pays three wild loot rolls for the continuous pack, with no fourth bonus drop', () => {
		cmd('select', { value: 'wild0' });
		const reward = account().run.node.reward;
		const money = account().run.money;
		const bag = structuredClone(account().run.bag);
		{
			cmd('battle'); const run = account().run;
			const result = { encounterId: run.battle.encounterId, won: true, team: run.team, bag: run.bag };
			engine.settle(user, run.battle.token, result);
			const settled = account();
			engine.settle(user, run.battle.token, result);
			assert.deepEqual(account(), settled);
			assert.equal(account().run.floor, 2);
			assert.equal(account().run.money, money + reward.money);
			assert.equal(account().run.bag.tinymushroom, 2);
		}
		assert.deepEqual(account().run.bag, { ...bag, tinymushroom: 2, oranberry: 1 });
	});
	it('retains a selected v4 encounter and initializes only unselected routes during migration', () => {
		cmd('select', { value: 'wild0' });
		store.change(user, saved => { saved.run.contentVersion = 'preview-2026-09-v4'; });
		const node = account().run.node;
		engine.migrate(user);
		assert.deepEqual(account().run.node, node);
		cmd('battle');
		assert.equal(account().run.contentVersion, content.version);
		assert.deepEqual(account().run.node, node);
		store.change(user, saved => {
			saved.run.contentVersion = 'preview-2026-09-v4';
			saved.run.phase = 'choose';
			delete saved.run.node; delete saved.run.battle; delete saved.run.choices;
		});
		engine.migrate(user);
		const migrated = account();
		engine.migrate(user);
		assert.deepEqual(account(), migrated);
		assert.notEqual(migrated.run.choices.find(node => node.kind === 'wild').biome.id, node.biome.id,
			'the ecology already offered on this floor remains in its saved cooldown');
	});
});
