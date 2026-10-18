'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { fantasyMovePowers } = require('../../dist/sim/fantasy-move-power');
const { calculateFantasyDamage: calc } = require('../../dist/server/fantasy-calc/engine');

describe('Fantasy next-use power and half-HP Magma Armor', () => {
	let battle;
	afterEach(() => { battle?.destroy(); });
	function start(move) {
		battle = new Battle({format: new Format({name: 'Fantasy power test', mod: 'gen9fantasy', ruleset: []}), seed: [1, 2, 3, 4],
			p1: {team: [{species: 'Shuckle', ability: 'No Guard', level: 5, moves: [move, 'Splash']}]},
			p2: {team: [{species: 'Blissey', ability: 'No Ability', level: 100, moves: ['Splash']}]}});
		return battle.p1.active[0];
	}
	it('shows 40, 80, 160 for successive Fury Cutters without advancing the stack during a preview', () => {
		const mon = start('Fury Cutter');
		for (const power of [40, 80, 160, 160]) {
			assert.equal(fantasyMovePowers(mon).furycutter.power, power);
			assert.equal(mon.getSwitchRequestData().mechanicPowers.furycutter.power, power);
			assert.equal(fantasyMovePowers(mon).furycutter.power, power);
			battle.makeChoices('move 1', 'move 1');
		}
		battle.makeChoices('move 2', 'move 1');
		assert.equal(fantasyMovePowers(mon).furycutter.power, 40);
		assert(!mon.getSwitchRequestData(true).mechanicPowers, 'No private state added to allied requests');
	});
	it('previews Rollout, Ice Ball and Echoed Voice stacks and resets after the sequence', () => {
		for (const [move, id, powers] of [['Rollout', 'rollout', [30, 60, 120, 240, 480, 30]],
			['Ice Ball', 'iceball', [30, 60, 120, 240, 480, 30]], ['Echoed Voice', 'echoedvoice', [40, 80, 120, 160, 200, 200]]]) {
			const mon = start(move);
			for (const power of powers) { assert.equal(fantasyMovePowers(mon)[id].power, power, id); battle.makeChoices(); }
			battle.destroy(); battle = null;
		}
	});
	it('uses the supplied current power in native calculations without multiplying it a second time', () => {
		for (const move of ['Fury Cutter', 'Rollout', 'Ice Ball', 'Echoed Voice']) {
			const input = {attacker: {species: 'Mew', volatiles: ['defensecurl']}, defender: {species: 'Mew'}, move};
			assert.deepEqual(calc({...input, mechanicBasePower: 160}).damage, calc({...input, moveOverrides: {basePower: 160}}).damage);
		}
	});
	it('halves effective damage above half HP, stops at half, and works again after healing', () => {
		const input = {attacker: {species: 'Mew'}, defender: {species: 'Slugma', ability: 'Magma Armor', stats: {hp: 1000}}, move: 'Water Gun'};
		const normal = calc({...input, defender: {...input.defender, ability: 'No Ability'}}).damage;
		for (const hp of [1, 0.75, 0.51, 0.5, 0.3, 1]) {
			const result = calc({...input, defender: {...input.defender, hp}}).damage;
			if (hp > 0.5) assert(result.every((n, i) => Math.abs(n - normal[i] / 2) <= 1));
			else assert.deepEqual(result, normal);
		}
	});
});
