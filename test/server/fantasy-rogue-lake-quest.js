'use strict';
const assert = require('assert').strict;
const { randomUUID } = require('crypto');
const { RogueStore } = require('../../dist/server/fantasy-rogue/store');
const { RogueEngine } = require('../../dist/server/fantasy-rogue/engine');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { normalizeBlessings, beginBlessingFloor, blessingView, handleBlessingCommand } = require('../../dist/server/fantasy-rogue/blessings');
const { deferBlessingLevels, blessingLevelsAt } = require('../../dist/server/fantasy-rogue/blessing-levels');
const { openLakeQuestRound, settleLakeQuestRound, lakeQuestView } = require('../../dist/server/fantasy-rogue/lake-quest');
const { BLESSING_TYPES, blessing } = require('../../dist/sim/rogue-blessing-data');
const { permanentMemberTypes } = require('../../dist/sim/rogue-blessing-permanent');
const { activeRogueSpirits } = require('../../dist/sim/fantasy-rogue-spirits');
const { set, stats } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue lake guardians checkpoint quests', function () {
	this.timeout(30000);
	let content;
	before(() => { content = createPreviewContent(); });
	const mon = (species, ability = 'Overgrow') => createRoguePokemon(set(species, ability, 40), stats(0));
	function fixture() {
		const run = { id: 'lake-quest', floor: 1, spirit: 'lakeguardians', phase: 'blessing',
			team: [mon('Bulbasaur')], box: [], bag: {}, boosts: stats(0), money: 0, notices: [], caught: [] };
		normalizeBlessings(run);
		return run;
	}
	function charge(run, floor, tier = 'prismatic', types = ['Grass', 'Poison', 'Electric']) {
		run.floor = floor; deferBlessingLevels(run, tier); openLakeQuestRound(run, () => 0);
		const round = run.blessings.lakeQuest.rounds.find(entry => entry.floor === floor);
		if (types) round.types = [...types];
		return round;
	}
	function cover(run) { run.team = [mon('Bulbasaur'), mon('Pikachu', 'Static')]; }
	it('is selectable and draws three distinct missing types once, after a zero-cost silver node too', () => {
		assert(activeRogueSpirits().some(spirit => spirit.id === 'lakeguardians'));
		const run = fixture();
		charge(run, 1, 'silver', null);
		const round = run.blessings.lakeQuest.rounds[0];
		assert.equal(round.checkAt, 50); assert.equal(new Set(round.types).size, 3);
		assert(round.types.every(type => !['Grass', 'Poison'].includes(type)));
		assert.deepEqual([round.normal, round.boss], [0, 0]);
		const before = structuredClone(run);
		openLakeQuestRound(run, () => { throw Error('Rerolled the saved targets'); });
		assert.deepEqual(run, before);
		const restored = JSON.parse(JSON.stringify(run));
		openLakeQuestRound(restored, () => { throw Error('Rerolled on reconnect'); });
		assert.deepEqual(restored, before);
	});
	it('prioritizes missing types and fills from present types only when fewer than three are missing', () => {
		const run = fixture(), types = Object.keys(BLESSING_TYPES);
		// Exercise the fallback even with an unusually broad saved party (e.g. extra permanent types).
		run.team = types.slice(0, -1).map(type => {
			const member = mon('Ditto', 'Limber'); member.statModifiers = { firstType: type }; return member;
		});
		const round = charge(run, 1, 'gold', null);
		assert.equal(round.types[0], types.at(-1));
		assert.equal(new Set(round.types).size, 3);
	});
	it('checks the checkpoint team, not temporary coverage earlier in the cycle', () => {
		const run = fixture(); charge(run, 1); cover(run);
		run.floor = 49; beginBlessingFloor(run, () => 0);
		assert.equal(lakeQuestView(run).rounds[0].matched.length, 3);
		assert.equal(run.blessings.bossLevels, 10);
		assert.equal(run.blessings.lakeQuest.rounds[0].result, undefined);
		run.team.pop(); run.floor = 50; beginBlessingFloor(run, () => 0);
		assert.equal(run.blessings.lakeQuest.rounds[0].result, 'kept');
		assert.equal(run.blessings.bossLevels, 10);
		cover(run); settleLakeQuestRound(run);
		assert.equal(run.blessings.bossLevels, 10, 'a late party change cannot repair a failed checkpoint');
		assert.equal(lakeQuestView(run).rounds[0].matched.length, 2, 'history uses the checkpoint snapshot');
	});
	it('counts dual types and an equipped emblem but excludes eggs, boxed and Nuzlocke dead members', () => {
		const run = fixture(); charge(run, 1); run.team[0].emblem = 'rogueemblemelectric';
		assert(permanentMemberTypes(run.team[0]).includes('Electric'));
		run.team.push(mon('Oddish', 'Chlorophyll'));
		run.floor = 50; beginBlessingFloor(run, () => 0);
		assert.equal(run.blessings.lakeQuest.rounds[0].result, 'reverted');
		assert.equal(run.blessings.bossLevels, 0);
		for (const kind of ['egg', 'box', 'dead']) {
			const absent = fixture(); charge(absent, 1); const electric = mon('Pikachu', 'Static');
			if (kind === 'egg') electric.egg = { hatchFloor: 51 };
			if (kind === 'dead') electric.nuzlockeDead = true;
			(kind === 'box' ? absent.box : absent.team).push(electric);
			absent.floor = 50; beginBlessingFloor(absent, () => 0);
			assert.equal(absent.blessings.lakeQuest.rounds[0].result, 'kept', kind);
		}
	});
	it('permanently reverts successful stages and retains only failed-stage costs across all four checkpoints', () => {
		const run = fixture(); cover(run);
		charge(run, 1); run.floor = 50; beginBlessingFloor(run, () => 0);
		assert.deepEqual(blessingLevelsAt(run), { normal: 0, boss: 0 });
		charge(run, 50); run.team = [mon('Bulbasaur')]; run.floor = 100;
		beginBlessingFloor(run, () => 0);
		assert.deepEqual(blessingLevelsAt(run), { normal: 10, boss: 20 });
		charge(run, 100); cover(run); run.floor = 150;
		beginBlessingFloor(run, () => 0);
		assert.deepEqual(blessingLevelsAt(run), { normal: 10, boss: 20 });
		charge(run, 150); run.floor = 199; beginBlessingFloor(run, () => 0);
		assert.deepEqual(blessingLevelsAt(run), { normal: 40, boss: 60 });
		run.floor = 200; beginBlessingFloor(run, () => 0);
		assert.deepEqual(blessingLevelsAt(run), { normal: 10, boss: 20 });
		assert.deepEqual(run.blessings.lakeQuest.rounds.map(round => round.result), ['reverted', 'kept', 'reverted', 'reverted']);
		const saved = structuredClone(run); beginBlessingFloor(run, () => 0); normalizeBlessings(run);
		assert.deepEqual(run, saved, 'no double refund or repeated notice');
	});
	it('retains grace periods, does not settle forecasts and never reconstructs legacy costs from owned blessings', () => {
		const run = fixture(); run.blessings.levels = 7; run.blessings.bossLevels = 13;
		charge(run, 50); cover(run);
		assert.deepEqual(blessingLevelsAt(run, 60), { normal: 7, boss: 13 });
		assert.deepEqual(blessingLevelsAt(run, 61), { normal: 17, boss: 33 });
		const before = structuredClone(run);
		blessingLevelsAt(run, 200); blessingView(run); lakeQuestView(run);
		assert.deepEqual(run, before);
		run.floor = 100; beginBlessingFloor(run, () => 0);
		assert.deepEqual(blessingLevelsAt(run), { normal: 7, boss: 13 });
		assert.equal(run.blessings.lakeQuest.rounds.length, 1);
	});
	it('records a Fate selection once and leaves free granted blessings out of its stage cost', () => {
		const run = fixture(); run.floor = 50;
		const account = { run, captures: {}, unlocked: [], points: 0, slots: 2, boosts: stats(0) };
		run.blessings.round = { floor: 50, tier: 'gold', remaining: 1,
			options: [{ id: 'fategold', chosen: false, refreshes: 1 }], familiesSeen: [] };
		handleBlessingCommand(account, run, content, { action: 'blessing', slot: 0 }, () => 0);
		assert.equal(run.blessings.owned.length, 2);
		assert.deepEqual([run.blessings.lakeQuest.rounds[0].normal, run.blessings.lakeQuest.rounds[0].boss], [5, 10]);
	});
	it('leaves non-lake spirits and untracked older saves unchanged', () => {
		const run = fixture(); run.spirit = 'hooh'; deferBlessingLevels(run, 'gold');
		openLakeQuestRound(run, () => { throw Error('Unexpected target draw'); });
		assert.equal(run.blessings.lakeQuest, undefined);
		run.floor = 50; beginBlessingFloor(run, () => 0);
		assert.equal(run.blessings.bossLevels, 5);
		run.spirit = 'lakeguardians'; run.blessings.owned.push({ ...blessing('originaldragon'), floor: 1 });
		beginBlessingFloor(run, () => 0);
		assert.equal(run.blessings.bossLevels, 5); assert.equal(run.blessings.lakeQuest, undefined);
	});
	for (const [floor, checkAt] of [[1, 50], [50, 100], [100, 150], [150, 200]]) {
		it(`settles the ${floor} task before actual ${checkAt} floor content, and preserves it on retry/reload`, () => {
			const store = new RogueStore(':memory:');
			try {
				const engine = new RogueEngine(store, content, () => 0, true), user = 'lakeentry';
				const command = (action, extra = {}) => engine.command(user,
					{ id: randomUUID(), revision: store.get(user).revision, action, ...extra });
				command('start', { starters: ['bulbasaur'], useSpirit: true, testSpirit: 'lakeguardians' });
				command('spiritack');
				store.change(user, account => {
					account.run.blessings.round = { floor: 1, tier: 'prismatic', remaining: 1,
						options: [{ id: 'originaldragon', chosen: false, refreshes: 1 }], familiesSeen: [] };
				});
				command('blessing', { slot: 0 });
				assert.equal(store.get(user).run.blessings.lakeQuest.rounds[0].types.length, 3);
				store.change(user, account => {
					const run = account.run;
					if (floor > 1) charge(run, floor);
					else run.blessings.lakeQuest.rounds[0].types = ['Grass', 'Poison', 'Electric'];
					cover(run); run.floor = checkAt - 1; run.phase = 'reward';
					delete run.battle; delete run.story; delete run.choices;
					run.node = { id: 'checkpoint-test', name: '结算测试', kind: 'reward', encounters: [], reward: { money: 0, items: {} } };
				});
				const before = store.get(user).run, cost = before.blessings.lakeQuest.rounds.find(r => r.floor === floor);
				const expected = blessingLevelsAt(before, checkAt).boss - cost.boss;
				const request = { id: randomUUID(), revision: store.get(user).revision, action: 'continue' };
				engine.command(user, request);
				let run = store.get(user).run;
				assert.equal(run.floor, checkAt);
				assert.equal(run.blessings.lakeQuest.rounds.find(r => r.floor === floor).result, 'reverted');
				assert.equal(run.blessings.bossLevels, expected);
				assert(run.node, 'the actual checkpoint content has been generated');
				for (const encounter of run.node.encounters) assert.equal(encounter.blessingLevels, expected);
				assert.equal(run.blessingCheckpoint.lakeQuest.rounds.find(r => r.floor === floor).result, 'reverted');
				const saved = store.get(user); engine.command(user, request); engine.migrate(user);
				assert.deepEqual(store.get(user), saved);
				store.change(user, account => { account.run.phase = 'failed'; account.run.node.noHealing = true; });
				command('retry'); run = store.get(user).run;
				assert.equal(run.blessings.bossLevels, expected);
				assert.equal(run.blessings.lakeQuest.rounds.find(r => r.floor === floor).result, 'reverted');
			} finally { store.close(); }
		});
	}
});
