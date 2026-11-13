'use strict';
const assert = require('assert').strict;
const common = require('../../common');
const { Battle } = require('../../../dist/sim/battle');

describe('Multi shared side conditions after serialization', () => {
	let battle;
	afterEach(() => { battle?.destroy(); battle = null; });
	function begin(gameType) {
		battle = common.createBattle({ gameType }, Array.from({ length: 4 }, () => [
			{ species: 'Mew', ability: 'Synchronize', moves: ['Tailwind', 'Reflect', 'Splash'] },
		]));
	}
	function restore() {
		const saved = JSON.stringify(battle.toJSON()); battle.destroy(); battle = Battle.fromJSON(saved);
	}
	it('restores one table per alliance and expires player-cast support moves for both partners', () => {
		begin('multi'); battle.makeChoices('move tailwind', 'move splash', 'move reflect', 'move splash');
		restore();
		assert.equal(battle.p1.sideConditions, battle.p3.sideConditions);
		assert.equal(battle.p2.sideConditions, battle.p4.sideConditions);
		assert.notEqual(battle.p1.sideConditions, battle.p2.sideConditions);
		assert.equal(battle.p1.sideConditions.tailwind.duration, 3);
		for (let i = 0; i < 3; i++) battle.makeChoices('move splash', 'move splash', 'move splash', 'move splash');
		assert(!battle.p1.sideConditions.tailwind); assert(!battle.p3.sideConditions.tailwind);
		assert.equal(battle.p3.sideConditions.reflect.duration, 1);
		battle.p3.removeSideCondition('reflect'); assert(!battle.p1.sideConditions.reflect);
		battle.p4.addSideCondition('spikes', battle.p1.active[0]);
		assert.equal(battle.p2.sideConditions.spikes.layers, 1);
		restore(); battle.p2.addSideCondition('spikes', battle.p1.active[0]);
		assert.equal(battle.p4.sideConditions.spikes.layers, 2);
	});
	it('keeps free-for-all side conditions independent', () => {
		begin('freeforall'); battle.makeChoices('move tailwind', 'move splash', 'move reflect', 'move splash');
		restore();
		assert.notEqual(battle.p1.sideConditions, battle.p3.sideConditions);
		assert.notEqual(battle.p2.sideConditions, battle.p4.sideConditions);
		assert(battle.p1.sideConditions.tailwind); assert(!battle.p3.sideConditions.tailwind);
		assert(battle.p3.sideConditions.reflect); assert(!battle.p1.sideConditions.reflect);
	});
});
