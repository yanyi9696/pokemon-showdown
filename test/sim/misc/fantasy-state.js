'use strict';

const assert = require('assert').strict;
const common = require('../../common');
const { Battle } = require('../../../dist/sim/battle');
const { State } = require('../../../dist/sim/state');

describe('Fantasy state restoration', () => {
	let original;
	let restored;

	afterEach(() => {
		if (original) original.destroy();
		if (restored) restored.destroy();
		original = restored = null;
	});

	function create(teams) {
		original = common.createBattle({ formatid: 'gen9fcag' }, teams);
		original.makeChoices();
		return original;
	}

	function restore() {
		restored = Battle.fromJSON(JSON.stringify(original));
		restored.restart(original.send);
	}

	function compare() {
		assert.deepEqual(State.normalize(restored.toJSON()), State.normalize(original.toJSON()));
	}

	it('does not initialize a benched Pokemon from an Update event', () => {
		create([
			[
				{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
				{ species: 'Mewtwo-Fantasy', ability: 'Pressure', moves: ['splash'] },
			],
			[{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] }],
		]);
		const before = original.log.slice();
		original.format.onUpdate.call(original, original.p1.pokemon[1]);
		assert.deepEqual(original.log, before);
		assert.equal(original.p1.pokemon[1].m.fantasyVisualsInitialized, undefined);
		restore();
		original.makeChoices('switch 2', 'move 1');
		restored.makeChoices('switch 2', 'move 1');
		assert(original.p1.active[0].m.fantasyVisualsInitialized);
		compare();
	});

	it('keeps Fantasy Mega state, HP, requests and visual updates identical after restoring', () => {
		create([
			[{ species: 'Mewtwo-Fantasy', ability: 'Pressure', item: 'Mewtwonite X', moves: ['splash'] }],
			[{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] }],
		]);
		restore();
		original.makeChoices('move 1 mega', 'move 1');
		restored.makeChoices('move 1 mega', 'move 1');
		assert.equal(original.p1.active[0].species.id, 'mewtwomegaxfantasy');
		compare();
	});

	it('keeps Illusion reveals identical after restoring without exposing the disguise early', () => {
		create([
			[
				{ species: 'Zoroark', ability: 'Illusion', moves: ['splash'] },
				{ species: 'Mewtwo-Fantasy', ability: 'Pressure', moves: ['splash'] },
			],
			[{ species: 'Mew', ability: 'Synchronize', moves: ['tackle'] }],
		]);
		assert(original.p1.active[0].illusion);
		restore();
		original.makeChoices('move 1', 'move 1');
		restored.makeChoices('move 1', 'move 1');
		assert.equal(original.p1.active[0].illusion, null);
		compare();
	});

	it('preserves Transform and switching back to the original form', () => {
		create([
			[
				{ species: 'Ditto', ability: 'Limber', moves: ['transform'] },
				{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
			],
			[{ species: 'Mewtwo-Fantasy', ability: 'Pressure', moves: ['splash'] }],
		]);
		original.makeChoices('move 1', 'move 1');
		assert(original.p1.active[0].transformed);
		restore();
		for (const choice of ['switch 2', 'switch 2', 'move 1']) {
			original.makeChoices(choice, 'move 1');
			restored.makeChoices(choice, 'move 1');
			compare();
		}
	});

	it('preserves Aura Burst resource use and volatile state across subsequent restores', () => {
		create([
			[{ species: 'Marowak-Alola-Fantasy', ability: 'Rock Head', item: 'Firium Z', moves: ['flamewheel'] }],
			[{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] }],
		]);
		assert(original.p1.activeRequest.active[0].canUltraBurst);
		restore();
		original.makeChoices('move 1 ultra', 'move 1');
		restored.makeChoices('move 1 ultra', 'move 1');
		assert(original.p1.zMoveUsed);
		assert(original.p1.active[0].volatiles.auraburstspe);
		compare();
		restored.destroy();
		restore();
		original.makeChoices('move 1', 'move 1');
		restored.makeChoices('move 1', 'move 1');
		compare();
	});

	it('preserves a partially resolved turn and does not mutate the original branch', () => {
		create([
			[
				{ species: 'Mewtwo-Fantasy', ability: 'Pressure', moves: ['uturn'] },
				{ species: 'Mew', ability: 'Synchronize', moves: ['splash'] },
			],
			[{ species: 'Snorlax', ability: 'Immunity', moves: ['tackle'] }],
		]);
		original.makeChoices('move 1', 'move 1');
		assert.equal(original.requestState, 'switch');
		const before = JSON.stringify(original);
		restore();
		restored.makeChoices('switch 2', '');
		assert.equal(JSON.stringify(original), before);
		original.makeChoices('switch 2', '');
		compare();
	});
});
