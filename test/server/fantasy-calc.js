'use strict';
const assert = require('assert').strict;
const { calculateFantasyDamage: calc, normalizeInput } = require('../../dist/server/fantasy-calc/engine');
const { FantasyCalcPool } = require('../../dist/server/fantasy-calc/pool');
const base = { attacker: { species: 'Mew' }, defender: { species: 'Mew' }, move: 'Psychic' };

describe('Public-input Fantasy calculator', () => {
	it('uses native damage rounding and does not mutate inputs', () => {
		const before = JSON.stringify(base);
		assert.deepEqual(calc(base).damage, [48, 49, 49, 50, 51, 51, 52, 52, 53, 54, 54, 54, 55, 56, 57, 57]);
		assert.equal(JSON.stringify(base), before);
	});
	it('honors panel stats and boosts, including manual spreads and Transform HP', () => {
		const boosted = calc({ ...base, attacker: { species: 'Mew', boosts: { spa: 2 } } });
		const doubled = calc({ ...base, attacker: { species: 'Mew', stats: { spa: 472 } } });
		assert.deepEqual(boosted.damage, doubled.damage);
		assert(boosted.damage[0] > calc(base).damage[15]);
		assert.equal(calc({ ...base, defender: { species: 'Mew', stats: { hp: 404 } } }).maxhp, 404);
		assert.equal(calc({ ...base, defender: { species: 'Mew', stats: { hp: 404 }, dynamax: true } }).maxhp, 808);
	});
	it('handles Flying immunity, Thousand Arrows and Tera replacement', () => {
		const input = { ...base, move: 'Earthquake', defender: { species: 'Zapdos' } };
		assert(calc(input).damage.every(n => n === 0));
		assert(calc({ ...input, move: 'Thousand Arrows' }).damage.every(n => n > 0));
		assert(calc({ ...input, defender: { ...input.defender, teraType: 'Electric' } }).damage.every(n => n > 0));
	});
	it('uses only the supplied ability and respects Mold Breaker', () => {
		const input = { ...base, move: 'Earthquake', defender: { species: 'Gengar', ability: 'Levitate' } };
		assert(calc(input).damage.every(n => n === 0));
		assert(calc({ ...input, attacker: { species: 'Mew', ability: 'Mold Breaker' } }).damage.every(n => n > 0));
		assert(calc({ ...input, defender: { species: 'Gengar' } }).damage.every(n => n > 0));
	});
	it('automatically supports Fantasy species and rain weakness suppression', () => {
		const input = { ...base, move: 'Earthquake', defender: { species: 'Metagross-Mega-Fantasy', ability: 'Yuan Hai Yang Liu' } };
		assert.equal(calc(input).effectiveness, 2);
		assert.equal(calc({ ...input, weather: 'Rain Dance' }).effectiveness, 1);
	});
	it('applies Defense Gem once per independent roll and restores its public permanent boost', () => {
		const normal = calc(base);
		const gem = calc({ ...base, defender: { species: 'Mew', item: 'Fantasy Defense Gem' } });
		assert(gem.damage.every((n, i) => n < normal.damage[i]));
		assert.deepEqual(gem.damage, [34, 34, 34, 35, 36, 36, 36, 36, 37, 38, 38, 38, 38, 39, 40, 40]);
		const spent = calc({ ...base, defender: { species: 'Mew', volatiles: ['gemboostdefense'] } });
		assert(spent.damage.every((n, i) => n < normal.damage[i] && n > gem.damage[i]));
	});
	it('restores public offensive gem boosts', () => {
		assert(calc({ ...base, attacker: { species: 'Mew', volatiles: ['gemboostpsychic'] } }).damage[15] > calc(base).damage[15]);
	});
	it('applies spread reduction only when other targets are present', () => {
		const input = { ...base, move: 'Surf' };
		assert.deepEqual(calc({ ...input, gameType: 'doubles' }).damage, calc(input).damage);
		assert(calc({ ...input, gameType: 'doubles', defenderAlly: { species: 'Mew' } }).damage[15] < calc(input).damage[15]);
	});
	it('accounts for doubles partner abilities and screens', () => {
		const input = { ...base, gameType: 'doubles' };
		assert(calc({ ...input, defenderAlly: { species: 'Clefairy', ability: 'Friend Guard' } }).damage[15] < calc(input).damage[15]);
		assert(calc({ ...input, defenderSide: ['lightscreen'] }).damage[15] < calc(input).damage[15]);
	});
	it('clamps invalid inputs and discards hidden battle identifiers', () => {
		const normalized = normalizeInput({ ...base, roomid: 'battle-private', attacker: { species: 'Mew', hp: NaN, evs: { atk: 900 }, ability: 'not-real', types: ['Psychic', null] } });
		assert.equal(normalized.attacker.hp, 1);
		assert.equal(normalized.attacker.evs.atk, 252);
		assert.equal(normalized.attacker.ability, 'No Ability');
		assert.deepEqual(normalized.attacker.types, ['Psychic']);
		assert(!('roomid' in normalized));
		assert.throws(() => normalizeInput({ ...base, move: 'not-real' }));
	});
	it('supports powered moves and dynamax without weakening Max moves to one damage', () => {
		const normal = calc(base).damage[15];
		assert(calc({ ...base, useMax: true }).damage[15] > normal);
		assert(calc({ ...base, useZ: true }).damage[15] > normal);
	});
	it('computes in isolated workers and rejects after shutdown', async () => {
		const pool = new FantasyCalcPool();
		try {
			const result = await pool.query([base]);
			assert.deepEqual(result[0].result.damage, calc(base).damage);
			const repeated = await pool.query([base, base, base, base]);
			assert.equal(repeated.length, 4);
			assert.deepEqual(repeated[3].result.damage, result[0].result.damage);
		} finally { pool.destroy(); }
		await assert.rejects(pool.query([base]));
	});
	it('serves bounded public query batches and isolates bad requests', async () => {
		const plugin = require('../../dist/server/chat-plugins/fantasy-calc');
		const user = {};
		try {
			const denied = await plugin.crqHandlers.fantasycalc('{}', user, false);
			assert(denied.error);
			const tooMany = await plugin.crqHandlers.fantasycalc(JSON.stringify({ id: 'limit', inputs: Array(9).fill(base) }), user, true);
			assert(tooMany.error);
			const reply = await plugin.crqHandlers.fantasycalc(JSON.stringify({ id: 'correlation', inputs: [base] }), user, true);
			assert.equal(reply.id, 'correlation');
			assert.deepEqual(reply.results[0].result.damage, calc(base).damage);
			const next = await plugin.crqHandlers.fantasycalc(JSON.stringify({ id: 'again', inputs: [base] }), user, true);
			assert.equal(next.results.length, 1);
		} finally { plugin.destroy(); }
	});
});
