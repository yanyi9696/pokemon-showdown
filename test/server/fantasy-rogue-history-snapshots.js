'use strict';

const assert = require('assert').strict;
const { trackJourney, journeyRecord } = require('../../dist/server/fantasy-rogue/history');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { clearMemberDetails } = require('../../dist/server/fantasy-rogue/clear-details');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue participant snapshots', () => {
	const member = id => createRoguePokemon(set(), stats(0), id);
	it('records living combatants once without admitting eggs, unused reserves or fainted newcomers', () => {
		const active = member('active'), fainted = member('fainted'), egg = member('egg'), reserve = member('reserve');
		fainted.hp = 0;
		egg.egg = { remainingFloors: 5 };
		const run = { id: 'snapshot-run', floor: 12, phase: 'battle', boosts: stats(0), team: [active, fainted, egg], box: [reserve] };
		trackJourney(run, {});
		assert.deepEqual(Object.keys(run.journey.participants), ['active']);
		assert.deepEqual(run.journey.participants.active.details, clearMemberDetails(active, run));
		assert.notStrictEqual(run.journey.participants.active.mon, active);
		active.hp--;
		assert.notEqual(run.journey.participants.active.mon.hp, active.hp);
	});
	it('updates HP, moves and bonuses after settlement and preserves boxed or departed participants', () => {
		const first = member('first'), boxed = member('boxed'), departed = member('departed');
		const run = { id: 'snapshot-run', floor: 12, phase: 'battle', boosts: stats(0), team: [first, boxed, departed] };
		trackJourney(run, {});
		const oldDeparted = structuredClone(run.journey.participants.departed);
		run.phase = 'ready'; run.floor++;
		first.hp = 0; first.set.moves = ['Growl']; first.stats.atk += 5;
		run.team = [first]; run.box = [boxed, member('unused')]; boxed.hp--;
		trackJourney(run, {});
		assert.equal(run.journey.participants.first.mon.hp, 0);
		assert.deepEqual(run.journey.participants.first.mon.set.moves, ['Growl']);
		assert.deepEqual(run.journey.participants.first.details, clearMemberDetails(first, run));
		assert.equal(run.journey.participants.boxed.mon.hp, boxed.hp);
		assert.deepEqual(run.journey.participants.departed, oldDeparted);
		assert(!run.journey.participants.unused);
		const record = journeyRecord(run, 'abandoned');
		assert.deepEqual(record.snapshot.box.map(mon => mon.id), ['boxed', 'departed']);
		assert.equal(record.snapshot.memberDetails.first.final.atk, first.stats.atk);
	});
});
