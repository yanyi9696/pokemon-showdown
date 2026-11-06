'use strict';
const assert = require('assert').strict;
const { ROGUE_DIFFICULTIES } = require('../../dist/sim/rogue-difficulty');
const { clearDifficulty, clearCoopDifficulty, difficultySpiritUnlocked, migrateSpiritProgress, canSelectSpirit } =
	require('../../dist/server/fantasy-rogue/difficulty');

describe('Fantasy Rogue global random spirits and tiered selection', () => {
	const account = () => ({ difficulties: { highest: 0, cleared: [], spirits: [] } });
	const run = (difficulty, spirit) => ({ floor: 200, phase: 'complete', difficulty, difficultyRulesVersion: 5, spirit });
	it('opens random spirits in every tier after any valid clear without granting higher difficulties', () => {
		for (const tier of ROGUE_DIFFICULTIES) {
			const a = account(); clearDifficulty(a, run(tier));
			for (const target of ROGUE_DIFFICULTIES) assert(difficultySpiritUnlocked(a, target));
			assert.equal(a.difficulties.highest, 0);
			assert(a.unlockNotices.some(n => n.text.includes('所有已解锁档位')));
		}
		const a = account(); clearCoopDifficulty(a, 2);
		assert(difficultySpiritUnlocked(a, 5)); assert(!a.mainline); assert.equal(a.difficulties.highest, 0);
	});
	it('keeps each spirit highest clear separately and permits exactly that tier and all lower tiers', () => {
		const a = account();
		clearDifficulty(a, run(5, 'kyogre')); clearDifficulty(a, run(2, 'jirachi')); clearDifficulty(a, run('easy', 'kyurem'));
		for (const tier of ROGUE_DIFFICULTIES) {
			assert(canSelectSpirit(a, 'kyogre', tier));
			assert.equal(canSelectSpirit(a, 'jirachi', tier), tier === 'easy' || tier <= 2);
			assert.equal(canSelectSpirit(a, 'kyurem', tier), tier === 'easy');
			assert(!canSelectSpirit(a, 'necrozma', tier));
		}
		assert(a.unlockNotices.some(n => n.id === 'spirit-select:kyogre:5' && n.text.includes('护符档及 0～5 档')));
		clearDifficulty(a, run(0, 'kyogre')); assert.equal(a.spiritClearTiers.kyogre, 5);
	});
	it('does not grant access or manual selection for local tests, unfinished runs or floors below 200', () => {
		const a = account();
		for (const r of [{ ...run(5, 'kyogre'), difficultyTest: true },
			{ ...run(5, 'kyogre'), floor: 199 }, { ...run(5, 'kyogre'), phase: 'ready' }]) clearDifficulty(a, r);
		assert(!difficultySpiritUnlocked(a)); assert(!canSelectSpirit(a, 'kyogre', 'easy'));
	});
	it('restores only proven per-spirit tiers without mutating cards or relying on another spirit clear', () => {
		const a = account(); a.unlockedSpirits = ['kyurem'];
		a.cards = [{ snapshot: run(3, 'kyogre') }, { snapshot: { ...run(5, 'jirachi'), difficultyTest: true } }];
		a.pendingClear = { snapshot: run(1, 'jirachi') }; a.run = run(4, 'kyogre');
		const before = JSON.stringify([a.cards, a.pendingClear, a.run]);
		migrateSpiritProgress(a);
		assert.deepEqual(a.spiritClearTiers, { kyurem: 'easy', kyogre: 4, jirachi: 1 });
		assert.equal(JSON.stringify([a.cards, a.pendingClear, a.run]), before);
		assert(difficultySpiritUnlocked(a));
		delete a.cards; delete a.pendingClear; delete a.run;
		a.unlockNotices = [];
		delete a.unlockedSpirits; migrateSpiritProgress(a);
		assert(canSelectSpirit(a, 'kyogre', 4)); assert(!canSelectSpirit(a, 'kyurem', 0));
		assert.deepEqual(a.unlockNotices, []); assert(a.unlockedSpirits.includes('kyogre'));
	});
	it('does not replay acknowledged notices on loading or repeated clears', () => {
		const a = account(); migrateSpiritProgress(a);
		clearDifficulty(a, run(0, 'kyogre')); assert(a.unlockNotices.length >= 2);
		a.unlockNotices = []; migrateSpiritProgress(a); clearDifficulty(a, run(0, 'kyogre'));
		assert.deepEqual(a.unlockNotices, []);
		clearDifficulty(a, run(2, 'kyogre'));
		assert.equal(a.unlockNotices.length, 1); assert.equal(a.unlockNotices[0].id, 'spirit-select:kyogre:2');
	});
});
