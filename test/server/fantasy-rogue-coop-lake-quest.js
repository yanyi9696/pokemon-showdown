'use strict';

const assert = require('assert').strict;
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { normalizeBlessings, beginBlessingFloor } = require('../../dist/server/fantasy-rogue/blessings');
const { deferBlessingLevels, blessingLevelsAt } = require('../../dist/server/fantasy-rogue/blessing-levels');
const { openCoopLakeQuest, settleCoopLakeQuest } = require('../../dist/server/fantasy-rogue/coop-lake-quest');
const { lakeQuestView } = require('../../dist/server/fantasy-rogue/lake-quest');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue shared Lake Guardians checkpoints', () => {
	const mon = (species, ability = 'Overgrow') => createRoguePokemon(set(species, ability, 40), stats(0));
	const types = ['Grass', 'Poison', 'Electric'];
	function party() { return [mon('Bulbasaur'), mon('Pikachu', 'Static')]; }
	function fixtures() {
		return ['host', 'guest'].map(id => {
			const run = { id, floor: 1, spirit: 'lakeguardians', phase: 'ready', team: party(),
				box: [], bag: {}, boosts: stats(0), money: 0, notices: [], caught: [] };
			normalizeBlessings(run); return run;
		});
	}
	function charge(runs, floor = 1) {
		for (const run of runs) { run.floor = floor; deferBlessingLevels(run, 'prismatic'); }
		openCoopLakeQuest(runs, () => 0);
		for (const run of runs) run.blessings.lakeQuest.rounds.at(-1).types = [...types];
	}
	function enter(runs, floor) {
		for (const run of runs) { run.floor = floor; beginBlessingFloor(run, () => 0, false); }
		settleCoopLakeQuest(runs);
	}
	it('draws one common target set from types missing in both parties and preserves it on reload', () => {
		const runs = fixtures(); runs[1].team = [mon('Squirtle', 'Torrent')];
		for (const run of runs) deferBlessingLevels(run, 'silver');
		openCoopLakeQuest(runs, () => 0);
		const targets = runs[0].blessings.lakeQuest.rounds[0].types;
		assert.equal(new Set(targets).size, 3);
		assert(targets.every(type => ![...types, 'Water'].includes(type)));
		assert.deepEqual(runs[1].blessings.lakeQuest.rounds[0].types, targets);
		const before = structuredClone(runs), restored = JSON.parse(JSON.stringify(runs));
		openCoopLakeQuest(restored, () => { throw Error('unexpected reroll'); });
		assert.deepEqual(restored, before); runs.forEach(lakeQuestView); assert.deepEqual(runs, before);
	});
	it('never combines two incomplete parties or allows one qualified owner to refund alone', () => {
		for (const hostComplete of [false, true]) {
			const runs = fixtures(); charge(runs);
			if (!hostComplete) runs[0].team.pop();
			runs[1].team.shift(); enter(runs, 50);
			for (const run of runs) {
				assert.equal(run.blessings.lakeQuest.rounds[0].result, 'kept');
				assert.equal(run.blessings.bossLevels, 10);
			}
			assert.equal(runs[0].blessings.lakeQuest.rounds[0].partnerMatched.length, 1);
			runs[1].team = party(); enter(runs, 50);
			assert.equal(lakeQuestView(runs[1]).rounds[0].matched.length, 1, 'the checkpoint result stays frozen');
		}
	});
	it('requires coverage at entry and accepts dual types and permanent type emblems separately for each owner', () => {
		const runs = fixtures(); charge(runs); enter(runs, 49);
		assert(runs.every(run => !run.blessings.lakeQuest.rounds[0].result));
		for (const run of runs) {
			run.team.pop(); run.team[0].emblem = 'rogueemblemelectric';
			run.team.push(mon('Oddish', 'Chlorophyll'));
		}
		enter(runs, 50);
		assert(runs.every(run => run.blessings.lakeQuest.rounds[0].result === 'reverted'));
		assert(runs.every(run => run.blessings.bossLevels === 0));
	});
	it('excludes boxed, egg and Nuzlocke dead partners from either owner coverage', () => {
		for (const kind of ['box', 'egg', 'dead']) {
			const runs = fixtures(); charge(runs);
			const guest = runs[1], electric = guest.team[1];
			if (kind === 'box') guest.box.push(guest.team.pop());
			if (kind === 'egg') electric.egg = { hatch: 51 };
			if (kind === 'dead') electric.nuzlockeDead = true;
			enter(runs, 50); assert(runs.every(run => run.blessings.lakeQuest.rounds[0].result === 'kept'), kind);
		}
	});
	it('permanently removes only successful stage charges through all four checkpoints exactly once', () => {
		const runs = fixtures();
		for (const [floor, checkpoint] of [[1, 50], [50, 100], [100, 150], [150, 200]]) {
			charge(runs, floor); runs[1].team = floor === 50 ? [mon('Bulbasaur')] : party();
			enter(runs, checkpoint);
		}
		for (const run of runs) {
			assert.deepEqual(blessingLevelsAt(run), { normal: 10, boss: 20 });
			assert.deepEqual(run.blessings.lakeQuest.rounds.map(round => round.result), ['reverted', 'kept', 'reverted', 'reverted']);
		}
		const before = structuredClone(runs); enter(runs, 200); assert.deepEqual(runs, before);
	});
	it('rejects divergent saved targets before settling and leaves untracked legacy rounds intact', () => {
		const runs = fixtures(); charge(runs);
		runs[1].blessings.lakeQuest.rounds[0].types = ['Water', 'Fire', 'Ice'];
		assert.throws(() => openCoopLakeQuest(runs, () => 0), /共同目标不一致/);
		for (const run of runs) { run.floor = 50; beginBlessingFloor(run, () => 0, false); }
		const before = structuredClone(runs);
		assert.throws(() => settleCoopLakeQuest(runs), /共同周期不一致/); assert.deepEqual(runs, before);
		delete runs[1].blessings.lakeQuest;
		const legacy = structuredClone(runs); settleCoopLakeQuest(runs); assert.deepEqual(runs, legacy);
	});
});
