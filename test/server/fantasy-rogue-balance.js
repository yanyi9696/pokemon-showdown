'use strict';
const { commandAfterOpening } = require('../fixtures/fantasy-rogue');
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim');
const { PRNG } = require('../../dist/sim/prng');
const { InformationView } = require('../../dist/server/fantasy-ai/information');
const { emergencyChoice } = require('../../dist/server/fantasy-ai/fallback');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { rollRoutes, RED_ROUTES } = require('../../dist/server/fantasy-rogue/routes');
const { createBiomeRoutes } = require('../../dist/server/fantasy-rogue/biome-routes');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine, createRoguePokemon } = require('../../dist/server/fantasy-rogue/engine');
const { TYPE_BOOSTERS, BATTLE_GOODS, shopAvailable } = require('../../dist/server/fantasy-rogue/economy');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue route, shop and immediate AI balance', () => {
	let content;
	before(() => { content = createPreviewContent(); });
	it('always mixes red and blue routes, preserves task guarantees, and increases trade frequency by stage', () => {
		let previousTrade = 0;
		for (const floor of [1, 41, 81, 121, 161]) {
			const rng = new PRNG([3, 16, 25, 94]); let trades = 0;
			for (let i = 0; i < 4000; i++) {
				const choices = rollRoutes({ floor, routeHistory: {floor: floor - 1, factors: {}, tradeSeen: true, eliteMisses: 0} }, content.routePools[floor], n => rng.random(n));
				const red = choices.filter(node => RED_ROUTES.includes(node.kind)).length;
				assert(red >= 1 && red <= 2);
				assert.equal(new Set(choices.map(node => node.id)).size, 3);
				trades += choices.filter(node => node.kind === 'trade').length;
				for (const kind of ['elite', 'trainer', 'reward', 'trade']) assert(choices.filter(node => node.kind === kind).length <= 1);
			}
			assert(trades > previousTrade); previousTrade = trades;
			for (const owned of [[{ family: 'battletask' }], [{ family: 'eventtask' }], [{ family: 'battletask' }, { family: 'eventtask' }]]) {
				const choices = rollRoutes({ floor, blessings: { owned } }, content.routePools[floor], n => rng.random(n));
				for (const entry of owned) assert(choices.some(node => node.kind === (entry.family === 'battletask' ? 'wild' : 'event')));
				assert(choices.some(node => RED_ROUTES.includes(node.kind)) && choices.some(node => !RED_ROUTES.includes(node.kind)));
			}
		}
	});
	it('reduces repeated species within an area and resets the discount in the next area', () => {
		const rng = new PRNG([9, 18, 27, 36]); let repeats = 0, crossArea = 0, previous;
		const node = content.routePools[1].find(option => option.kind === 'wild');
		// A two-species ecology isolates the repeat weight from unrelated IV/move random rolls.
		for (let i = 0; i < 2000; i++) {
			const [result] = createBiomeRoutes(1, [node], (_name, _level, _biome, _tier, random) =>
				random(2) ? 'Pikachu' : 'Eevee', n => rng.random(n));
			const species = result.encounters[0].team.map(mon => mon.species);
			if (species[0] === species[1]) repeats++;
			if (previous === species[0]) crossArea++;
			previous = species[0];
		}
		assert(repeats > 300 && repeats < 500, `expected 20% repeated second draws, got ${repeats / 20}%`);
		assert(crossArea > 850 && crossArea < 1150, 'new areas must start with their original weights');
	});
	it('opens all stones, eighteen type boosters and battle goods at their requested thresholds', () => {
		const item = id => content.items.find(entry => entry.id === id);
		assert.equal(content.initialBag.ether, 6); assert(!content.initialBag.elixir);
		assert(shopAvailable(item('ether'), 9)); assert(!shopAvailable(item('fullheal'), 19)); assert(shopAvailable(item('fullheal'), 39));
		for (const prefix of ['fire', 'water', 'thunder', 'leaf', 'moon', 'sun', 'shiny', 'dusk', 'dawn', 'ice']) {
			assert.equal(item(prefix + 'stone').shopFloor, 39);
		}
		assert.equal(TYPE_BOOSTERS.length, 18);
		for (const [id] of TYPE_BOOSTERS) { assert.equal(item(id).shopFloor, 49); assert.equal(item(id).price, 4000); }
		for (const [id] of BATTLE_GOODS) assert.equal(item(id).shopFloor, 99);
		assert.equal(item('linkingcord').shopFloor, 89);
		assert.equal(item('healthfeather').price, 500); assert.equal(item('protein').price, 4000);
		for (const id of ['antidote', 'burnheal', 'iceheal', 'awakening', 'paralyzeheal']) assert.equal(item(id).price, 500);
	});
	it('restores only the chosen move with Ether, synchronizes memory, rejects invalid slots and keeps legacy Elixir', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content, () => 0);
			const cmd = (action, details = {}) => commandAfterOpening(engine, 'etherqa', { id: randomUUID(), revision: store.get('etherqa').revision, action, ...details });
			cmd('start', { starters: ['bulbasaur'] });
			store.change('etherqa', account => {
				const mon = account.run.team[0];
				for (const move of mon.pp) move.pp = 0;
				for (const move of mon.moveMemory) move.pp = 0;
				account.run.bag.elixir = 1;
			});
			const member = store.get('etherqa').run.team[0].id;
			const before = store.get('etherqa');
			assert.throws(() => cmd('use', { member, value: 'ether' }), /请选择/);
			assert.deepEqual(store.get('etherqa'), before);
			cmd('use', { member, value: 'ether', slot: 0 });
			let run = store.get('etherqa').run;
			assert.equal(run.bag.ether, 5); assert.equal(run.team[0].pp[0].pp, 10); assert.equal(run.team[0].pp[1].pp, 0);
			assert.equal(run.team[0].moveMemory.find(move => move.id === run.team[0].pp[0].id).pp, 10);
			cmd('use', { member, value: 'elixir' }); run = store.get('etherqa').run;
			assert.equal(run.bag.elixir, 0); assert(run.team[0].pp.every(move => move.pp > 0));
		} finally { store.close(); }
	});
	for (const [label, target, moves, choice, extra] of [
		['a type-immune attack', 'Gastly', ['Tackle', 'Bite'], 'move 2'],
		['a wasted full-health recovery', 'Eevee', ['Recover', 'Tackle'], 'move 2'],
		['a repeat poison', 'Eevee', ['Toxic', 'Tackle'], 'move 2', 'status'],
		['paralysis into a Ground type', 'Sandshrew', ['Thunder Wave', 'Tackle'], 'move 2'],
		['a harmless move', 'Eevee', ['Splash', 'Tackle'], 'move 2'],
		['Helping Hand without a singles ally', 'Eevee', ['Helping Hand', 'Tackle'], 'move 2'],
		['a resisted attack instead of super-effective coverage', 'Geodude', ['Tackle', 'Water Gun'], 'move 2'],
		['a capped setup', 'Eevee', ['Swords Dance', 'Tackle'], 'move 2', 'boost'],
		['physical resistance instead of a weak special defense', 'Onix', ['Tackle', 'Swift'], 'move 2'],
		['special bulk instead of Psystrike targeting defense', 'Blissey', ['Psychic', 'Psystrike'], 'move 2'],
		['Snore while awake', 'Eevee', ['Snore', 'Tackle'], 'move 2'],
		['powder into a Grass type', 'Bulbasaur', ['Sleep Powder', 'Tackle'], 'move 2'],
		['an undeveloped Stored Power', 'Eevee', ['Stored Power', 'Psychic'], 'move 2'],
		['a risky finish instead of an accurate one', 'Eevee', ['Fire Blast', 'Ember'], 'move 2', 'lowfoe'],
		['a revealed Water Absorb immunity', 'Eevee', ['Hydro Pump', 'Tackle'], 'move 2', 'waterabsorb'],
	]) {
		it(`immediately avoids ${label} from visible information`, () => {
			const member = createRoguePokemon(set(target, 'No Ability', 30, ['Splash']), stats(0));
			const battle = new Battle({ fantasyRogue: { encounterId: 'ai:quick', team: [member], boosts: stats(0), bag: {}, balls: [], catchable: true }, formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
				p1: { team: [member.set] }, p2: { team: [set('Mew', 'Synchronize', 30, moves)] } });
			try {
				battle.makeChoices('team 1', 'team 1');
				if (extra === 'status') battle.p1.active[0].setStatus('psn');
				if (extra === 'boost') battle.boost({ atk: 6 }, battle.p2.active[0]);
				if (extra === 'lowfoe') {
					battle.p1.active[0].hp = 1; battle.add('-damage', battle.p1.active[0], '1/100');
				}
				if (extra === 'waterabsorb') battle.add('-ability', battle.p1.active[0], 'Water Absorb');
				const view = new InformationView({ ownSide: 'p2', difficulty: 'normal' });
				view.receiveUpdate(battle.log.join('\n'));
				const start = performance.now();
				assert.equal(emergencyChoice(view.observe(battle.p2.activeRequest), 'gen9fantasyrogue', [], true), choice);
				assert(performance.now() - start < 150, 'no seconds-long search or artificial delay');
			} finally { battle.destroy(); }
		});
	}
});
