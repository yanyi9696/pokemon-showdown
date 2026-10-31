'use strict';

const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { Battle } = require('../../dist/sim/battle');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { rogueBattleResult } = require('../../dist/sim/fantasy-rogue');
const { set, stats, content, commandAfterOpening } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue prayer faint stat context', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = undefined; });
	function begin(sets, effects = ['prayer'], state = {}) {
		const team = sets.map(s => createRoguePokemon(s, stats(0)));
		battle = new Battle({
			formatid: 'gen9fantasyrogue', seed: [1, 2, 3, 4],
			fantasyRogue: {
				encounterId: 'prayer-faint', team, boosts: stats(0), bag: {}, balls: [], catchable: false,
				blessings: { owned: effects.map(id => ({ ...blessing(id), floor: 1 })) }, ...state,
			},
			p1: { name: 'Player', team: (state.team || team).map(mon => mon.set) },
			p2: { name: 'Foe', team: [set('Blissey', 'Natural Cure', 100, ['Splash', 'Dragon Rage'])] },
		});
		assert(battle.choose('p1', 'team 1'));
		assert(battle.choose('p2', 'team 1'));
		return battle.p1.active[0];
	}
	function faintDonor() {
		const donor = battle.p1.active[0];
		donor.hp = 1;
		battle.makeChoices('move splash', 'move dragonrage');
		assert(donor.fainted);
		return donor;
	}
	const abilities = [
		['Piplup', 'Torrent', 'Water', 1.5],
		['Bulbasaur', 'Overgrow', 'Grass', 1.5],
		['Chimchar', 'Blaze', 'Fire', 1.5],
		['Blipbug', 'Swarm', 'Bug', 1.5],
		['Dewpider', 'Water Bubble', 'Water', 2],
		['Phione', 'Steelworker', 'Steel', 1.5],
	];
	for (const [species, ability, type, factor] of abilities) {
		it(`finishes faint processing and transfers unboosted panel stats with ${ability}`, () => {
			const donor = begin([set(species, ability, 50, ['Splash']), set('Phione', 'Hydration', 50, ['Splash'])]);
			const expected = { atk: Math.floor(donor.storedStats.atk / 3), spa: Math.floor(donor.storedStats.spa / 3) };
			// Temporary stat stages must not become permanent inherited points.
			donor.boosts.atk = 6;
			donor.boosts.spa = -6;
			faintDonor();
			assert.equal(battle.p1.pokemonLeft, 1);
			assert(battle.p1.activeRequest.forceSwitch[0]);
			assert(battle.choose('p1', 'switch 2'));
			assert.deepEqual(battle.p1.active[0].m.rogueBlessing.prayer, expected);
			assert.equal(battle.p1.active[0].getStat('atk', true), battle.p1.active[0].storedStats.atk + expected.atk);
			assert.equal(battle.p1.active[0].getStat('spa', true), battle.p1.active[0].storedStats.spa + expected.spa);
		});
		it(`keeps ${ability}'s normal move-specific attack and special-attack modifiers`, () => {
			const mon = begin([set(species, ability, 50, ['Splash'])]);
			mon.hp = 1;
			const foe = battle.p2.active[0];
			const move = battle.dex.getActiveMove(type === 'Water' ? 'watergun' :
				type === 'Grass' ? 'vinewhip' : type === 'Fire' ? 'ember' : type === 'Bug' ? 'bugbite' : 'metalclaw');
			for (const event of ['ModifyAtk', 'ModifySpA']) {
				assert.equal(battle.runEvent(event, mon, foe, move, 100), 100 * factor);
				assert.equal(battle.runEvent(event, mon, foe, battle.dex.getActiveMove('tackle'), 100), 100);
			}
		});
	}
	it('preserves permanent training and chained prayer while excluding ability/item damage calculations', () => {
		const donor = begin([
			{ ...set('Bunnelby', 'Huge Power', 50, ['Splash']), item: 'Choice Band' },
			set('Phione', 'Hydration', 50, ['Splash']), set('Phione', 'Hydration', 50, ['Splash']),
		]);
		// storedStats already contains level, IVs, EVs, nature, meta growth and permanent training.
		donor.storedStats.atk += 30;
		donor.storedStats.spa += 60;
		donor.m.rogueBlessing.prayer = { atk: 21, spa: 42 };
		const expected = { atk: Math.floor((donor.storedStats.atk + 21) / 3),
			spa: Math.floor((donor.storedStats.spa + 42) / 3) };
		faintDonor();
		assert(battle.choose('p1', 'switch 2'));
		const second = battle.p1.active[0];
		assert.deepEqual(second.m.rogueBlessing.prayer, expected);
		faintDonor();
		assert(battle.choose('p1', 'switch 3'));
		assert.deepEqual(battle.p1.active[0].m.rogueBlessing.prayer, {
			atk: Math.floor((second.storedStats.atk + expected.atk) / 3),
			spa: Math.floor((second.storedStats.spa + expected.spa) / 3),
		});
	});
	it('retains move-independent Rogue stat bonuses without calling native attack callbacks', () => {
		const donor = begin([set('Piplup', 'Torrent', 50, ['Splash']), set('Phione', 'Hydration', 50, ['Splash'])],
			['prayer', 'entrance']);
		const expected = { atk: Math.floor(Math.floor(donor.storedStats.atk * 1.05) / 3),
			spa: Math.floor(Math.floor(donor.storedStats.spa * 1.05) / 3) };
		faintDonor();
		assert(battle.choose('p1', 'switch 2'));
		assert.deepEqual(battle.p1.active[0].m.rogueBlessing.prayer, expected);
	});
	it('can finish a loss and serialize the result when the final Torrent partner faints', () => {
		begin([set('Piplup', 'Torrent', 50, ['Splash'])]);
		faintDonor();
		assert(battle.ended);
		const result = rogueBattleResult(battle);
		assert.equal(result.won, false);
		assert.equal(result.team[0].hp, 0);
		assert.doesNotThrow(() => JSON.stringify(result));
	});
	it('finishes a win, saves the team and settles rewards exactly once after a Torrent faint', () => {
		const store = new RogueStore(':memory:');
		try {
			const engine = new RogueEngine(store, content());
			const user = 'prayerfainttest';
			commandAfterOpening(engine, user, { action: 'start', id: randomUUID(), revision: 0, starters: ['bulbasaur'] });
			engine.command(user, { action: 'select', id: randomUUID(), revision: store.get(user).revision, value: 'grass' });
			store.change(user, account => {
				account.run.node.encounters = account.run.node.encounters.slice(0, 1);
				account.run.team = [set('Piplup', 'Torrent', 50, ['Splash']), set('Phione', 'Hydration', 100, ['Tackle'])]
					.map(s => createRoguePokemon(s, stats(0)));
				normalizeBlessings(account.run);
				account.run.blessings.owned = [{ ...blessing('prayer'), floor: 1 }];
			});
			engine.command(user, { action: 'battle', id: randomUUID(), revision: store.get(user).revision });
			const run = store.get(user).run, token = run.battle.token;
			begin([], [], engine.battleState(user));
			faintDonor();
			assert(battle.choose('p1', 'switch 2'));
			battle.p2.active[0].hp = 1;
			battle.makeChoices('move tackle', 'move splash');
			assert(battle.ended);
			const result = rogueBattleResult(battle);
			assert(result.won);
			engine.settle(user, token, result);
			const saved = store.get(user);
			assert.equal(saved.run.team[0].hp, 0);
			assert.equal(saved.run.floor, 2);
			assert(saved.run.money > run.money);
			assert(saved.run.team[1].set.moves.includes('Tackle') || saved.run.team[1].set.moves.includes('tackle'));
			engine.settle(user, token, result);
			assert.deepEqual(store.get(user), saved);
		} finally {
			store.close();
		}
	});
});
