'use strict';
const assert = require('assert').strict;
const { Dex } = require('../../dist/sim/dex');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { chooseEvent } = require('../../dist/server/fantasy-rogue/events');
const { evolutionEventReady, activityEligible } = require('../../dist/server/fantasy-rogue/journey-activities');
const { normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { rogueTime } = require('../../dist/server/fantasy-rogue/friendship');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue actionable evolution event priority', () => {
	function run(species, level = 50, floor = 65) {
		const s = Dex.mod('gen9fantasy').species.get(species);
		const value = { id: 'priority', floor, phase: 'choose', money: 10000, bag: {}, team: [
			createRoguePokemon(set(species, s.abilities[0], level), stats(0), 'priority-mon'),
		], boosts: stats(0), caught: [] };
		normalizeBlessings(value); return value;
	}
	for (const [id, species] of [['stonegate', 'Yamask-Galar'], ['invertedstars', 'Inkay'], ['sweetdance', 'Milcery'],
		['peatmoon', 'Ursaring'], ['unioncircle', 'Finizen'], ['kubfuscroll', 'Kubfu'], ['evolutiondojo', 'Primeape']]) {
		it(`${id} remains drawable after being seen and gets at least half the ordinary event weight`, () => {
			const r = run(species); while (rogueTime(r.floor) !== 'night') r.floor++;
			r.eventHistory = [{ id, floor: r.floor - 1 }, { id: 'forest', floor: r.floor }];
			assert(evolutionEventReady(r, id));
			let total;
			chooseEvent(r, n => { total = n; return 0; });
			let hits = 0;
			// Evenly sample the entire discrete weighted range, not one lucky seed.
			for (let i = 0; i < 200; i++) if (chooseEvent(r, () => Math.floor(total * (i + 0.5) / 200)) === id) hits++;
			assert(hits >= 99, `${id}: ${hits}/200`);
		});
	}
	it('does not suppress an already eligible high-level partner behind the early-floor pacing gate', () => {
		const r = run('Kubfu', 35, 10);
		assert.equal(chooseEvent(r, () => 0, new Set(['kubfuscroll'])), 'kubfuscroll');
	});
	it('uses personal partner readiness in co-op without combining bags or ignoring time', () => {
		const host = run('Bulbasaur'), guest = run('Ursaring');
		while (rogueTime(host.floor) !== 'night') host.floor++;
		guest.floor = host.floor;
		assert.equal(chooseEvent(host, () => 0, new Set(['peatmoon']), [guest]), 'peatmoon');
		guest.money = 0; guest.bag = {}; host.bag.peatblock = 1;
		assert(!evolutionEventReady(guest, 'peatmoon'));
		guest.money = 1600; while (rogueTime(guest.floor) === 'night') guest.floor++;
		assert(!activityEligible(guest, 'peatmoon'));
	});
	it('stops prioritizing completed, underlevelled, dead, egg and fused partners or unpaid rituals', () => {
		const r = run('Milcery'); r.money = 0;
		assert(!evolutionEventReady(r, 'sweetdance')); r.bag.strawberrysweet = 1;
		assert(evolutionEventReady(r, 'sweetdance'));
		r.team[0].evolutionProgress = { scenes: ['alcremie'] }; assert(!evolutionEventReady(r, 'sweetdance'));
		for (const patch of [{ hp: 0 }, { egg: {} }, { nuzlockeDead: true }, { fusion: {} }, { formFusion: {} }]) {
			const candidate = run('Milcery'); Object.assign(candidate.team[0], patch);
			assert(!evolutionEventReady(candidate, 'sweetdance'));
		}
		assert(!evolutionEventReady(run('Finizen', 37), 'unioncircle'));
		assert(evolutionEventReady(run('Finizen', 38), 'unioncircle'));
		assert(!evolutionEventReady(run('Kubfu', 34), 'kubfuscroll'));
	});
	it('still respects the co-op allowed pool, last-event exclusion and exclusive clue guarantee', () => {
		const r = run('Kubfu'); r.eventHistory = [{ id: 'kubfuscroll', floor: 64 }];
		for (let i = 0; i < 20; i++) assert.notEqual(chooseEvent(r, n => i % n), 'kubfuscroll');
		assert.equal(chooseEvent(r, () => 0, new Set(['forest'])), 'forest');
		r.team.push(...run('Pikachu').team); r.exclusiveEventMisses = 3;
		r.eventHistory = [{ id: 'forest', floor: 64 }];
		assert.equal(chooseEvent(r, () => 0), 'exclusiveclue');
		assert.equal(r.exclusiveEventMisses, 0);
	});
});
