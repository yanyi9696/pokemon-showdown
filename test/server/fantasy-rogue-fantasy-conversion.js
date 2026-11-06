'use strict';
const assert = require('assert').strict;
const { Dex } = require('../../dist/sim');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { handleBlessingCommand, completeBlessingFloor, normalizeBlessings } = require('../../dist/server/fantasy-rogue/blessings');
const { fantasyConversionOptions, fullFantasyMoves } = require('../../dist/server/fantasy-rogue/fantasy-conversion');
const { fantasyTutorMoves } = require('../../dist/server/fantasy-rogue/fantasy-tutor');
const { set, stats, content } = require('../fixtures/fantasy-rogue');
const dex = Dex.mod('gen9fantasy');

describe('Fantasy Rogue explicit Fantasy conversion and added moves', () => {
	function setup(species, moves) {
		const mon = createRoguePokemon(set(species, dex.species.get(species).abilities[0], 50, moves), stats(0));
		const run = { phase: 'choose', floor: 70, team: [mon], boosts: stats(0), bag: {}, money: 0 };
		normalizeBlessings(run).shards = 100;
		return { mon, run, account: { unlocks: {}, points: 20 } };
	}
	for (const [base, target, old, replacement] of [
		['Urshifu', 'Urshifu-Fantasy', 'wickedblow', 'dianshanxunji'],
		['Urshifu', 'Urshifu-2-Fantasy', 'wickedblow', 'cunjinbengji'],
		['Urshifu-Rapid-Strike', 'Urshifu-Rapid-Strike-Fantasy', 'surgingstrikes', 'yishunqianji'],
		['Urshifu-Rapid-Strike', 'Urshifu-Rapid-Strike-2-Fantasy', 'surgingstrikes', 'xingyihuanda'],
	]) {
		it(`selects ${target}, requires confirmation and replaces the signature without a PP refill`, () => {
			const { mon, run, account } = setup(base, [old, 'closecombat']);
			const pp = mon.pp.find(slot => slot.id === old); pp.pp = 3;
			mon.moveMemory.find(slot => slot.id === old).pp = 3;
			const used = pp.maxpp - pp.pp;
			assert.equal(fantasyConversionOptions(mon).length, 2);
			assert.throws(() => handleBlessingCommand(account, run, content(), { action: 'fantasize', member: mon.id }, () => 0), /分支/);
			assert.throws(() => handleBlessingCommand(account, run, content(), { action: 'fantasize', member: mon.id, value: target }, () => 0), /确认/);
			assert.equal(run.blessings.shards, 100); assert.equal(mon.set.species, base);
			handleBlessingCommand(account, run, content(), { action: 'fantasize', member: mon.id, value: target, confirmed: true }, () => 0);
			assert.equal(run.blessings.shards, 0); assert.equal(mon.set.species, target);
			assert(!mon.set.moves.includes(old)); assert(!mon.moveMemory.some(slot => slot.id === old));
			assert(mon.set.moves.includes(replacement));
			const replaced = mon.pp.find(slot => slot.id === replacement);
			assert.equal(replaced.pp, Math.max(0, replaced.maxpp - used));
			assert(!fantasyTutorMoves(mon).includes(old));
		});
	}
	it('teaches added standard and custom moves, excluding the whole original pool and lost signatures', () => {
		const { mon } = setup('Urshifu-Fantasy', ['closecombat']);
		const moves = fantasyTutorMoves(mon);
		assert(moves.includes('plasmafists')); assert(moves.includes('dianshanxunji'));
		assert(!moves.includes('wickedblow')); assert(!moves.includes('bulkup')); assert(!moves.includes('detect'));
		mon.nuzlockeDead = true; assert.equal(fantasyTutorMoves(mon).length, 0);
		assert.equal(fantasyTutorMoves(setup('Urshifu', ['wickedblow']).mon).length, 0);
	});
	it('merges an already taught replacement with the old signature without a duplicate or free PP', () => {
		const { mon, run, account } = setup('Urshifu', ['wickedblow', 'dianshanxunji']);
		for (const memory of [mon.pp, mon.moveMemory]) {
			memory.find(slot => slot.id === 'wickedblow').pp = 3;
			memory.find(slot => slot.id === 'dianshanxunji').pp = 1;
		}
		handleBlessingCommand(account, run, content(), {
			action: 'fantasize', member: mon.id, value: 'Urshifu-Fantasy', confirmed: true,
		}, () => 0);
		assert.equal(mon.set.moves.filter(id => id === 'dianshanxunji').length, 1);
		for (const memory of [mon.pp, mon.moveMemory]) {
			assert.equal(memory.filter(slot => slot.id === 'dianshanxunji').length, 1);
			assert.equal(memory.find(slot => slot.id === 'dianshanxunji').pp, 1);
		}
	});
	it('requires the branch-change confirmation even before the original signature has been learned', () => {
		const { mon, run, account } = setup('Urshifu', ['closecombat']);
		assert.throws(() => handleBlessingCommand(account, run, content(), {
			action: 'fantasize', member: mon.id, value: 'Urshifu-Fantasy',
		}, () => 0), /确认/);
		assert.equal(run.blessings.shards, 100);
		handleBlessingCommand(account, run, content(), {
			action: 'fantasize', member: mon.id, value: 'Urshifu-Fantasy', confirmed: true,
		}, () => 0);
		assert.equal(mon.set.species, 'Urshifu-Fantasy');
	});
	it('keeps the reservation value as 100 fragments once, without automatic branch selection', () => {
		const { run, mon, account } = setup('Urshifu', ['wickedblow']);
		run.blessings.shards = 0; run.blessings.owned = [{ id: 'reservation', family: 'reservation', tier: 'silver', floor: 1, target: mon.id }];
		run.floor = 100;
		completeBlessingFloor(account, run, content(), () => 0);
		assert.equal(mon.set.species, 'Urshifu'); assert.equal(run.blessings.shards, 100);
		completeBlessingFloor(account, run, content(), () => 0); assert.equal(run.blessings.shards, 100);
	});
	it('reports the complete removed-move pool before conversion', () => {
		const { mon } = setup('Urshifu', ['wickedblow']);
		for (const option of fantasyConversionOptions(mon)) {
			assert(option.lostMoves.includes('wickedblow'));
			assert(!fullFantasyMoves(option.species).includes('wickedblow'));
		}
	});
});
