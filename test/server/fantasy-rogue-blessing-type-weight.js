'use strict';
const assert = require('assert').strict;
const { blessing } = require('../../dist/sim/rogue-blessing-data');
const { strengthenedBlessingTypes, blessingEmblemWeight } = require('../../dist/server/fantasy-rogue/blessing-type-weight');
const owned = id => ({ ...blessing(id), floor: 1 });

describe('Fantasy Rogue emblem synergy weights', () => {
	it('uses only the selected companion branch, including both types of a genuine dual-type effect', () => {
		for (const [family, id, yes, no] of [
			['companionband', 'marnie', 'Dark', 'Poison'], ['companionband', 'roxie', 'Poison', 'Dark'],
			['companionwinter', 'grusha', 'Ice', 'Ground'], ['companionwinter', 'rika', 'Ground', 'Ice'],
		]) {
			const state = { owned: [owned(family)], companions: [{ id }] };
			const types = strengthenedBlessingTypes(state);
			assert.equal(blessingEmblemWeight(blessing('typexp' + yes.toLowerCase()), types), 1.2);
			assert.equal(blessingEmblemWeight(blessing('typexp' + no.toLowerCase()), types), 1);
		}
		assert.deepEqual([...strengthenedBlessingTypes({ owned: [owned('companionband')] })], []);
		assert.deepEqual([...strengthenedBlessingTypes({ owned: [owned('companionacerola')], companions: [{ id: 'acerola' }] })],
			['Ghost', 'Normal']);
		assert.deepEqual([...strengthenedBlessingTypes({ owned: [owned('dragonking')], companions: [{ id: 'iris' }] })],
			['Dragon']);
	});
	it('accepts typed boosts and dynamically shared Unity types, ignoring old locks and weather IDs', () => {
		const state = { owned: [owned('emissaryfire'), owned('typeevolutiongrass'), owned('overtimesunnyday'),
			{ ...owned('unity'), type: 'Water' }] };
		assert.deepEqual([...strengthenedBlessingTypes(state)].sort(), ['Fire', 'Grass']);
		assert.deepEqual([...strengthenedBlessingTypes(state, [['Fire', 'Fighting'], ['Fire', 'Fighting']])].sort(),
			['Fighting', 'Fire', 'Grass']);
		assert.deepEqual([...strengthenedBlessingTypes(state, [['Fire'], ['Water']])].sort(), ['Fire', 'Grass']);
		assert.equal(blessingEmblemWeight(blessing('lowhp'), new Set(['Fire'])), 1);
	});
	it('includes multi-option emblem rewards with one capped bonus and retains their original five regi types', () => {
		for (const type of ['Rock', 'Flying']) assert.equal(blessingEmblemWeight(blessing('monkeyking'), new Set([type])), 1.2);
		for (const type of ['Rock', 'Ice', 'Steel', 'Electric', 'Dragon']) {
			assert.equal(blessingEmblemWeight(blessing('regis'), new Set([type])), 1.2);
		}
		assert.equal(blessingEmblemWeight(blessing('regis'), new Set(['Normal'])), 1);
		assert.equal(blessingEmblemWeight(blessing('regis'), new Set(['Rock', 'Ice', 'Steel', 'Electric', 'Dragon'])), 1.2);
	});
});
