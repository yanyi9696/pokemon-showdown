'use strict';
const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { Format } = require('../../dist/sim/dex-formats');
const { fantasyMovePowers } = require('../../dist/sim/fantasy-move-power');
const { calculateFantasyDamage: calc } = require('../../dist/server/fantasy-calc/engine');

describe('Fantasy Stalwart next-use preview', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function start(ability = 'Stalwart', item = '', move = 'Water Gun') {
		battle = new Battle({ format: new Format({ name: 'gen9fcag', mod: 'gen9fantasy', ruleset: [] }), seed: [1, 2, 3, 4],
			p1: { team: [{ species: 'Mew', level: 30, ability, item, moves: [move, 'Tackle', 'Splash', 'Fly'] },
				{ species: 'Mew', ability: 'No Ability', moves: ['Splash'] }] },
			p2: { team: [{ species: 'Blissey', ability: 'No Ability', moves: ['Splash', 'Protect'] }] } });
		return battle.p1.active[0];
	}
	it('previews each next multiplier up to the cap, without mutating the actual counter', () => {
		const mon = start();
		for (const expected of [0, 1, 2, 3, 4, 5, 5, 5]) {
			const before = mon.volatiles.stalwart.numConsecutive;
			for (let repeat = 0; repeat < 3; repeat++) {
				assert.equal(mon.getSwitchRequestData().mechanicPowers.watergun.stalwart, expected);
				assert.equal(mon.volatiles.stalwart.numConsecutive, before);
			}
			assert.equal(fantasyMovePowers(mon).tackle.stalwart, 0);
			assert(!mon.getSwitchRequestData(true).mechanicPowers);
			battle.makeChoices('move 1', 'move 1');
		}
	});
	it('resets after a failed hit, a different move and a switch, and restores the request after serialization', () => {
		let mon = start(); battle.makeChoices('move 1', 'move 1');
		const saved = battle.toJSON(); battle.destroy();
		battle = Battle.fromJSON(saved); mon = battle.p1.active[0];
		assert.equal(fantasyMovePowers(mon).watergun.stalwart, 1);
		battle.makeChoices('move 1', 'move 2');
		assert.equal(fantasyMovePowers(mon).watergun.stalwart, 0);
		battle.makeChoices('move 1', 'move 1'); battle.makeChoices('move 2', 'move 1');
		assert.equal(fantasyMovePowers(mon).watergun.stalwart, 0);
		battle.makeChoices('switch 2', 'move 1');
		battle.makeChoices(`switch ${battle.p1.pokemon.indexOf(mon) + 1}`, 'move 1');
		assert.equal(fantasyMovePowers(battle.p1.active[0]).watergun.stalwart, 0);
	});
	it('does not show a suppressed or replaced ability, or multiply a fixed-damage / status move', () => {
		const mon = start('Stalwart', '', 'Seismic Toss');
		assert(!fantasyMovePowers(mon).seismictoss); assert(!fantasyMovePowers(mon).splash);
		mon.addVolatile('gastroacid'); assert(!fantasyMovePowers(mon).tackle);
		mon.removeVolatile('gastroacid'); mon.setAbility('No Ability'); assert(!fantasyMovePowers(mon).tackle);
	});
	it('keeps its multiplier separate from native Metronome and preserves both actual effects', () => {
		const mon = start('Stalwart', 'Metronome');
		battle.makeChoices('move 1', 'move 1');
		assert.equal(fantasyMovePowers(mon).watergun.stalwart, 1);
		assert.equal(mon.volatiles.metronome.numConsecutive, 0);
		battle.makeChoices('move 1', 'move 1');
		assert.equal(mon.volatiles.stalwart.numConsecutive, 1);
		assert.equal(mon.volatiles.metronome.numConsecutive, 1);
	});
	it('previews two-turn attacks without consuming the charging-turn stack', () => {
		const mon = start(); battle.makeChoices('move 4', 'move 1');
		assert.equal(fantasyMovePowers(mon).fly.stalwart, 1);
		battle.makeChoices('move 1', 'move 1');
		assert.equal(mon.volatiles.stalwart.numConsecutive, 1);
	});
	it('uses the authoritative stack once in the native calculator and ignores it without the ability', () => {
		const input = { attacker: { species: 'Mew', ability: 'Stalwart' }, defender: { species: 'Blissey' }, move: 'Water Gun' };
		for (const count of [0, 1, 2, 3, 4, 5]) {
			const result = calc({ ...input, stalwartBoost: count }).damage;
			const expected = calc({ ...input, attacker: { ...input.attacker, ability: 'No Ability' }, moveOverrides: { basePower: 40 + count * 8 } }).damage;
			assert.deepEqual(result, expected, `count ${count}`);
		}
		const plain = { ...input, attacker: { ...input.attacker, ability: 'No Ability' } };
		assert.deepEqual(calc({ ...plain, stalwartBoost: 5 }).damage, calc(plain).damage);
	});
});
