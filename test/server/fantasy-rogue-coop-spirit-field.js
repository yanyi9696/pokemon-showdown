'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue tower spirit battlefield rules in native Multi', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function begin(id, hazards) {
		const team = () => ['Snorlax', 'Blissey'].map(species =>
			createRoguePokemon(set(species, 'Shell Armor', 70, ['Dragon Rage', 'Splash', 'Trick Room']), stats(0)));
		const host = team(), guest = team(), foe = team(), otherFoe = team();
		battle = new Battle({ formatid: 'gen9fantasyroguecoop', seed: [1, 2, 3, 4],
			fantasyRogue: { encounterId: 'coop-field-spirit', team: host, boosts: stats(0), bag: {}, balls: [],
				partner: { team: guest, boosts: stats(0) }, partnerBag: {}, persistCoop: true,
				cooperative: { opponentOffset: 2 }, opponentCount: 4, opponentSlots: [0, 1, 2, 3],
				spirit: { id, floor: 100, hazards } },
			p1: { name: 'Host', team: host.map(mon => mon.set) }, p3: { name: 'Guest', team: guest.map(mon => mon.set) },
			p2: { name: 'Enemy One', team: foe.map(mon => mon.set) }, p4: { name: 'Enemy Two', team: otherFoe.map(mon => mon.set) } });
		for (const side of battle.sides) assert(battle.choose(side.id, 'team'));
	}
	function turn(choices = {}) {
		for (const side of battle.sides) assert(battle.choose(side.id, choices[side.id] || 'move 2'));
	}
	function restore() {
		const saved = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(saved);
	}
	it('adds precisely the two saved hazard rolls once per alliance and does not add fallback rocks for partners', () => {
		begin('hoopamischief', ['spikes', 'toxicspikes']);
		assert.equal(battle.p1.sideConditions.spikes.layers, 1);
		assert.equal(battle.p2.sideConditions.toxicspikes.layers, 1);
		assert(!battle.p1.sideConditions.stealthrock); assert(!battle.p2.sideConditions.stealthrock);
		assert.equal(battle.p3.sideConditions, battle.p1.sideConditions);
		assert.equal(battle.p4.sideConditions, battle.p2.sideConditions);
		restore(); turn();
		assert.equal(battle.p3.sideConditions.spikes.layers, 1);
		assert.equal(battle.p4.sideConditions.toxicspikes.layers, 1);
	});
	it('applies each saved screen once with the original five-turn lifetime', () => {
		begin('hoopamischief', ['reflect', 'lightscreen']);
		assert.deepEqual(Object.keys(battle.p1.sideConditions), ['reflect']);
		assert.deepEqual(Object.keys(battle.p2.sideConditions), ['lightscreen']);
		assert.equal(battle.p3.sideConditions.reflect.duration, 5);
		assert.equal(battle.p4.sideConditions.lightscreen.duration, 5);
		turn(); assert.equal(battle.p3.sideConditions.reflect.duration, 4);
	});
	it('alternates shared four-turn Tailwinds for the two alliances and restores their remaining duration', () => {
		begin('tornadus');
		assert.equal(battle.p3.sideConditions.tailwind.duration, 4); assert(!battle.p4.sideConditions.tailwind);
		turn(); restore(); assert.equal(battle.p3.sideConditions.tailwind.duration, 3);
		for (let i = 0; i < 3; i++) turn();
		assert(!battle.p1.sideConditions.tailwind); assert(!battle.p3.sideConditions.tailwind);
		assert.equal(battle.p2.sideConditions.tailwind.duration, 4);
		assert.equal(battle.p4.sideConditions.tailwind.duration, 4);
		for (let i = 0; i < 4; i++) turn();
		assert.equal(battle.p3.sideConditions.tailwind.duration, 4); assert(!battle.p4.sideConditions.tailwind);
	});
	it('restores its permanent weather after an ordinary override ends, without resetting it on reconnect', () => {
		begin('groudon'); assert.equal(battle.field.weather, 'sunnyday');
		assert.equal(battle.field.weatherState.duration, undefined);
		battle.field.setWeather('raindance', battle.p3.active[0]); battle.field.weatherState.duration = 2;
		turn(); restore(); assert.equal(battle.field.weather, 'raindance');
		assert.equal(battle.field.weatherState.duration, 1);
		turn(); assert.equal(battle.field.weather, 'sunnyday');
		assert.equal(battle.field.weatherState.duration, undefined);
	});
	it('lets the partner close permanent Trick Room without reopening it after a turn or reconnect', () => {
		begin('palkia'); assert.equal(battle.field.pseudoWeather.trickroom.duration, undefined);
		turn({ p3: 'move 3' }); assert(!battle.field.pseudoWeather.trickroom);
		restore(); turn(); assert(!battle.field.pseudoWeather.trickroom);
	});
	it('delays all four attackers and resolves their original target slots exactly once after reconnect', () => {
		begin('dialga'); const before = battle.sides.map(side => side.active[0].hp);
		turn({ p1: 'move 1 1', p2: 'move 1 1', p3: 'move 1 2', p4: 'move 1 2' });
		assert.deepEqual(battle.sides.map(side => side.active[0].hp), before);
		assert.equal(battle.fantasyRogue.futureAttacks.length, 4);
		restore(); turn();
		assert.deepEqual(battle.sides.map(side => side.active[0].hp), before);
		turn(); assert.deepEqual(battle.sides.map(side => side.active[0].hp), before.map(hp => hp - 40));
		assert.equal(battle.fantasyRogue.futureAttacks.length, 0);
		turn(); assert.deepEqual(battle.sides.map(side => side.active[0].hp), before.map(hp => hp - 40));
	});
	it('uses each human owner\'s money for coin damage and never borrows the host balance for a missing partner balance', () => {
		begin('gimmighoul'); battle.fantasyRogue.spirit.money = 500000;
		battle.fantasyRogue.partner.money = 2500000;
		const hit = (from, to) => battle.runEvent('ModifyDamage', battle[from].active[0], battle[to].active[0],
			battle.dex.getActiveMove('tackle'), 100);
		assert.equal(hit('p1', 'p2'), 110); assert.equal(hit('p3', 'p4'), 150);
		assert.equal(hit('p2', 'p1'), 100); assert.equal(hit('p4', 'p3'), 100);
		restore(); assert.equal(hit('p3', 'p4'), 150);
		delete battle.fantasyRogue.partner.money; assert.equal(hit('p3', 'p4'), 100);
	});
	it('gives both human attackers Darkrai growth but never boosts enemy or friendly damage', () => {
		begin('darkrai');
		const hit = (from, to) => battle.runEvent('ModifyDamage', battle[from].active[0], battle[to].active[0],
			battle.dex.getActiveMove('tackle'), 100);
		assert.equal(hit('p1', 'p2'), 150); assert.equal(hit('p3', 'p4'), 150);
		assert.equal(hit('p2', 'p1'), 100); assert.equal(hit('p4', 'p3'), 100);
		assert.equal(hit('p1', 'p3'), 100);
	});
	it('applies the Regigigas direct damage tradeoff equally to both players without changing fixed damage', () => {
		begin('regigigas');
		const hit = (from, to, name = 'tackle') => battle.runEvent('ModifyDamage', battle[from].active[0], battle[to].active[0],
			battle.dex.getActiveMove(name), 100);
		assert.equal(hit('p1', 'p2'), 200); assert.equal(hit('p3', 'p4'), 200);
		assert.equal(hit('p2', 'p1'), 50); assert.equal(hit('p4', 'p3'), 50);
		assert.equal(hit('p3', 'p4', 'dragonrage'), 100); assert.equal(hit('p1', 'p3'), 100);
	});
	it('heals both human attackers for half of actual damage and does not heal enemies or friendly fire', () => {
		begin('yveltal');
		for (const side of battle.sides) side.active[0].hp -= 100;
		const use = (from, to) => {
			const source = battle[from].active[0], hp = source.hp;
			battle.actions.useMove(battle.dex.getActiveMove('dragonrage'), source, { target: battle[to].active[0] });
			return source.hp - hp;
		};
		assert.equal(use('p1', 'p2'), 20); assert.equal(use('p3', 'p4'), 20);
		assert.equal(use('p2', 'p1'), 0); assert.equal(use('p4', 'p3'), 0);
		assert.equal(use('p1', 'p3'), 0);
	});
});
