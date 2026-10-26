'use strict';
const assert = require('assert').strict;
const { aggregateCollapseHistory } = require('../../tools/report-rogue-collapse');

describe('Fantasy Rogue collapse aggregate report', () => {
	it('reports version 4 selected modifiers without an unselected common mechanic', () => {
		const report = aggregateCollapseHistory([{collapseHistory: {
			'1:environment,vigilance:v4': {runs: 1, battles: 2, turns: 10,
				selections: {environment: 1, vigilance: 1}, triggers: {environment: 4, vigilance: 3}},
		}}]);
		assert.equal(report.tiers[0].entries.find(e => e.id === 'environment').triggers, 4);
		assert.equal(report.tiers[0].entries.find(e => e.id === 'vigilance').triggers, 3);
		assert.equal(report.tiers[0].entries.length, 10);
		assert.equal(report.tiers[0].averageBattleTurns, 5);
	});
	it('separates rule versions and resource-action counts from battle trigger rates', () => {
		const result = aggregateCollapseHistory([{collapseHistory: {
			'1:adaptation,erosion:v2': {runs: 1, battles: 2, turns: 8, selections: {adaptation: 1, erosion: 1}},
			'1:adaptation,erosion:v3': {runs: 2, battles: 4, turns: 20, selections: {adaptation: 2, erosion: 2}},
			'1:inflation,medicine:v3': {runs: 1, battles: 2, turns: 6,
				selections: {inflation: 1, medicine: 1}, triggers: {inflation: 3, medicine: 5}},
		}}]);
		assert.equal(result.tiers.length, 2); assert.equal(result.combinations.length, 3);
		const old = result.tiers.find(r => r.version === 2), current = result.tiers.find(r => r.version === 3);
		assert.equal(old.runs, 1); assert.equal(current.runs, 3);
		const medicine = current.entries.find(e => e.id === 'medicine');
		assert.equal(medicine.triggerUnit, 'resource-action'); assert.equal(medicine.triggersPerBattle, null);
		assert.equal(medicine.triggersPerRun, 5);
	});
	it('groups by tier and combination, using only battles with the selected entry as its trigger denominator', () => {
		const result = aggregateCollapseHistory([
			{ userid: 'private-name', collapseHistory: {
				'1:erosion,adaptation': { runs: 2, battles: 4, turns: 20, wins: 3, clears: 1,
					selections: { erosion: 2, adaptation: 2 }, triggers: { erosion: 8 } },
				'1:emergency,statusshield': { runs: 1, battles: 2, turns: 6, wins: 1, clears: 0,
					selections: { emergency: 1, statusshield: 1 }, triggers: { emergency: 2 } },
			} },
			{ collapseHistory: { '1:adaptation,erosion': { runs: 1, battles: 2, turns: 10, wins: 2, clears: 1,
				selections: { erosion: 1, adaptation: 1 }, triggers: { erosion: 4 } } } },
		]);
		const row = result.tiers[0];
		assert.equal(row.runs, 4); assert.equal(row.averageBattleTurns, 4.5);
		assert.equal(row.battleWinRate, 0.75); assert.equal(row.clearsPerStartedRun, 0.5);
		const erosion = row.entries.find(entry => entry.id === 'erosion');
		assert.equal(erosion.selectionRate, 0.75); assert.equal(erosion.triggersPerBattle, 2);
		assert.equal(result.combinations.length, 2);
		assert(!JSON.stringify(result).includes('private-name'));
	});
	it('reports no invented rates before a battle and omits invalid history combinations', () => {
		const result = aggregateCollapseHistory([{ collapseHistory: {
			'1:adaptation,erosion': { runs: 1, selections: { adaptation: 1, erosion: 1 } },
			'5:invalid': { runs: 100 },
		} }]);
		assert.equal(result.tiers.length, 1);
		assert.equal(result.tiers[0].averageBattleTurns, null);
		assert.equal(result.tiers[0].entries[0].triggersPerBattle, null);
	});
});
