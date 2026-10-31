'use strict';

const assert = require('assert').strict;
const { Battle } = require('../../dist/sim/battle');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { summitEncounter } = require('../../dist/server/fantasy-rogue/final-bosses');
const { stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue high-level nature calculations', () => {
	function actual(set, formatid = 'gen9fantasyrogue') {
		const battle = new Battle({ formatid, deserialized: true });
		try {
			battle.setPlayer('p1', { name: 'Stats', team: [structuredClone(set)] });
			return { ...battle.p1.pokemon[0].baseStoredStats };
		} finally {
			battle.destroy();
		}
	}
	it('keeps the summit special attacker growing through the old overflow boundary', () => {
		let previous = 0;
		for (const level of [100, 150, 160, 180, 200, 250]) {
			const set = summitEncounter(level).team[3];
			const result = actual(set);
			const neutral = actual({ ...set, nature: 'Hardy' });
			assert.equal(result.spa, Math.floor(neutral.spa * 110 / 100));
			assert.equal(result.atk, Math.floor(neutral.atk * 90 / 100));
			assert(result.spa > previous, `SpA must grow at level ${level}`);
			assert.equal(createRoguePokemon(set, stats(0)).stats.spa, result.spa);
			assert.deepEqual(actual(set, 'gen9fantasyrogueduel'), result);
			previous = result.spa;
		}
	});
	it('also avoids negative-nature wrapping for legal high-level Rogue partners', () => {
		const set = { ...summitEncounter(1000).team[3], nature: 'Adamant' };
		const result = actual(set), neutral = actual({ ...set, nature: 'Hardy' });
		assert.equal(result.spa, Math.floor(neutral.spa * 90 / 100));
		assert.equal(result.atk, Math.floor(neutral.atk * 110 / 100));
	});
	it('preserves ordinary cartridge truncation and the ordinary level-100 result', () => {
		const set = { ...summitEncounter(100).team[3], species: 'Xerneas' };
		assert.deepEqual(actual(set), actual(set, 'gen9customgame'));
		const battle = new Battle({ formatid: 'gen9ou', deserialized: true });
		try {
			const result = battle.natureModify(stats(1000), { nature: 'Modest' });
			assert.equal(result.spa, Math.floor((1000 * 110 % 65536) / 100));
			assert.equal(result.atk, Math.floor((1000 * 90 % 65536) / 100));
		} finally {
			battle.destroy();
		}
	});
});
