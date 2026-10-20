'use strict';
const assert = require('assert').strict;
const {
	blessingQualityWeights, drawBlessingTier, hasPrayerQualityBonus, canOfferTopClearMind,
	guaranteesTopClearMind, createBlessingRound, refreshBlessingOption, chooseBlessingOption, blessingSlotTier,
} = require('../../dist/server/fantasy-rogue/blessing-selection');

describe('Fantasy Rogue blessing selection rules', () => {
	const ordinary = { floor: 100 };
	const prayer = { floor: 100, prayerFloor: 50, prayerPartyChanged: false };
	const pool = ['silver', 'gold', 'prismatic'].flatMap(tier => Array.from({ length: 8 }, (_, i) => ({
		id: `${tier}${i}`, family: `${tier}${i}`, tier,
	})));
	pool.push({ id: 'topclearmind', family: 'topclearmind', tier: 'gold' });
	function countTiers(context) {
		const counts = { silver: 0, gold: 0, prismatic: 0, mixed: 0 };
		for (let i = 0; i < 100; i++) counts[drawBlessingTier(context, () => i)]++;
		return counts;
	}
	it('gives mixed offers 28 percent while retaining a 60 percent all-gold prayer chance', () => {
		assert.deepEqual(countTiers(ordinary), { silver: 24, gold: 26, prismatic: 22, mixed: 28 });
		assert.deepEqual(countTiers(prayer), { silver: 20, gold: 60, prismatic: 10, mixed: 10 });
		assert.deepEqual(countTiers({ ...prayer, floor: 150 }), countTiers(ordinary));
		assert.deepEqual(countTiers({ ...prayer, floor: 150, prayerFloor: 100 }), countTiers(prayer));
		assert.deepEqual(countTiers({ ...prayer, prayerPartyChanged: true }), countTiers(ordinary));
		assert.deepEqual(countTiers({ floor: 100, prayerFloor: 50 }), countTiers(ordinary));
		assert(!hasPrayerQualityBonus({ floor: 50, prayerFloor: 50, prayerPartyChanged: false }));
	});
	it('keeps fixed-quality spirits above prayer without consuming quality RNG', () => {
		for (const [spirit, tier] of [['terapagos', 'prismatic'], ['gholdengo', 'gold'], ['silvally', 'silver'], ['necrozma', 'mixed']]) {
			const context = { ...prayer, spirit };
			assert.equal(drawBlessingTier(context, () => { throw new Error('Unexpected quality roll'); }), tier);
			assert.equal(blessingQualityWeights(context)[tier], 100);
			assert.equal(guaranteesTopClearMind(context, tier), tier === 'gold');
		}
	});
	it('offers silver, gold and prismatic from left to right for natural mixed rolls and Necrozma', () => {
		for (const context of [ordinary, {...ordinary, spirit: 'necrozma'}]) {
			const round = createBlessingRound(context, pool, max => max === 100 ? 90 : 0);
			assert.equal(round.tier, 'mixed'); assert.equal(round.remaining, 1);
			assert.deepEqual(round.options.map(option => option.tier), ['silver', 'gold', 'prismatic']);
			assert(round.options.every(option => pool.find(entry => entry.id === option.id).tier === option.tier));
		}
	});
	it('refreshes each saved mixed slot only within its own tier and consumes only its own credit', () => {
		const original = createBlessingRound({floor: 50, spirit: 'necrozma'}, pool, () => 0);
		for (const slot of [0, 1, 2]) {
			const saved = JSON.parse(JSON.stringify(original));
			const next = refreshBlessingOption(saved, slot, pool, () => 0);
			assert.notEqual(next.options[slot].id, original.options[slot].id);
			assert.equal(pool.find(entry => entry.id === next.options[slot].id).tier, original.options[slot].tier);
			assert.deepEqual(next.options.map(option => option.refreshes), [0, 1, 2].map(i => i === slot ? 0 : 1));
			assert.deepEqual(saved, original);
			assert.equal(chooseBlessingOption(next, slot).remaining, 0);
		}
	});
	it('keeps Victini extra refreshes in mixed rounds and guarantees an eligible prayer in the gold slot', () => {
		const victini = createBlessingRound({floor: 100, spirit: 'victini'}, pool, max => max === 100 ? 95 : 0);
		assert.equal(victini.tier, 'mixed');
		assert.deepEqual(victini.options.map(option => option.refreshes), [2, 2, 2]);
		const round = createBlessingRound({...prayer, spirit: 'necrozma'}, pool, () => 0);
		assert.equal(round.options[1].id, 'topclearmind');
		assert.notEqual(refreshBlessingOption(round, 1, pool, () => 0).options[1].id, 'topclearmind');
		const ineligible = createBlessingRound({...prayer, prayerPartyChanged: true, spirit: 'necrozma'}, pool, () => 0);
		assert(ineligible.options.every(option => option.id !== 'topclearmind'));
	});
	it('restores older uniform saves without slot-tier fields or re-rolling their qualities', () => {
		const round = createBlessingRound({floor: 100, spirit: 'gholdengo'}, pool, () => 0);
		round.options.forEach(option => delete option.tier);
		assert.equal(blessingSlotTier(round, 2), 'gold');
		const refreshed = refreshBlessingOption(round, 2, pool, () => 0);
		assert.equal(refreshed.tier, 'gold');
		assert(refreshed.options.every(option => pool.find(entry => entry.id === option.id).tier === 'gold'));
	});
	it('requires unchanged-party evidence, and distinguishes the next-round guarantee from later eligibility', () => {
		assert(canOfferTopClearMind(prayer));
		assert(!canOfferTopClearMind({ ...prayer, prayerPartyChanged: true }));
		assert(!canOfferTopClearMind({ floor: 100 }));
		assert(!canOfferTopClearMind({ ...prayer, floor: 50 }));
		assert(canOfferTopClearMind({ ...prayer, floor: 150 }));
		assert(!guaranteesTopClearMind({ ...prayer, floor: 150 }, 'gold'));
		assert(!guaranteesTopClearMind(prayer, 'silver'));
	});
	it('guarantees Top Clear Mind only on the eligible initial gold offer and respects a deliberate refresh', () => {
		const round = createBlessingRound({ ...prayer, spirit: 'gholdengo' }, pool, () => 0);
		assert.equal(round.options[0].id, 'topclearmind');
		const refreshed = refreshBlessingOption(round, 0, pool, () => 0);
		assert.notEqual(refreshed.options[0].id, 'topclearmind');
		assert.equal(refreshed.tier, 'gold');
		assert.equal(round.options[0].id, 'topclearmind', 'the saved input must not be mutated');
		assert.throws(() => createBlessingRound({ ...prayer, spirit: 'gholdengo' },
			pool.filter(entry => entry.id !== 'topclearmind'), () => 0), /Top Clear Mind/);
	});
	it('never offers an ineligible Top Clear Mind through either initial draws or refreshes', () => {
		const first = [{ id: 'topclearmind', family: 'topclearmind', tier: 'gold' }, ...pool];
		const round = createBlessingRound({ floor: 100, spirit: 'gholdengo' }, first, () => 0);
		assert(round.options.every(option => option.id !== 'topclearmind'));
		const refreshed = refreshBlessingOption(round, 0, first, () => 0);
		assert(refreshed.options.every(option => option.id !== 'topclearmind'));
	});
	it('preserves tier, remaining picks and per-position refresh counts across serialization', () => {
		const round = createBlessingRound({ floor: 50, spirit: 'victini' }, pool, () => 0);
		assert(round.options.every(option => option.refreshes === 2));
		const saved = JSON.parse(JSON.stringify(round));
		const next = refreshBlessingOption(saved, 1, pool, () => 0);
		assert.equal(next.tier, round.tier);
		assert.equal(next.remaining, 1);
		assert.deepEqual(next.options.map(option => option.refreshes), [2, 1, 2]);
		assert.deepEqual(saved, round);
		const picked = chooseBlessingOption(next, 1);
		assert.equal(picked.remaining, 0);
		assert.throws(() => chooseBlessingOption(picked, 2));
		assert.throws(() => refreshBlessingOption(picked, 0, pool, () => 0));
	});
	it('gives Jirachi two independent choices and never chooses the same position twice', () => {
		assert.deepEqual(countTiers({floor: 50, spirit: 'jirachi'}), {silver: 40, gold: 35, prismatic: 25, mixed: 0});
		const round = createBlessingRound({ floor: 50, spirit: 'jirachi' }, pool, () => 0);
		assert.equal(round.options.length, 2);
		assert.equal(round.remaining, 2);
		assert.notEqual(round.options[0].id, round.options[1].id);
		const once = chooseBlessingOption(round, 0);
		assert.equal(once.remaining, 1);
		assert.throws(() => chooseBlessingOption(once, 0));
		assert.throws(() => refreshBlessingOption(once, 0, pool, () => 0));
		assert.equal(chooseBlessingOption(once, 1).remaining, 0);
	});
	it('draws families before variants and reduces an already seen family to 15 percent weight', () => {
		const candidates = [...Array.from({ length: 18 }, (_, i) => ({
			id: `type${i}`, family: 'typedfriend', tier: 'silver',
		})), ...pool.filter(entry => entry.tier === 'silver').slice(0, 3)];
		const draws = [];
		createBlessingRound({ floor: 50, spirit: 'silvally' }, candidates, max => { draws.push(max); return 0; });
		assert.deepEqual(draws, [40000, 18, 31500, 17, 31500, 16]);
	});
	it('cannot refresh an attribute evolution into another attribute, even after it has left the card', () => {
		const candidates = [
			{ id: 'typeevolutionfire', family: 'typeevolution', tier: 'prismatic' },
			{ id: 'typeevolutionwater', family: 'typeevolution', tier: 'prismatic' }, ...pool,
		];
		const round = createBlessingRound({ floor: 50, spirit: 'terapagos' }, candidates, () => 0);
		assert.equal(round.options[0].id, 'typeevolutionfire');
		const refreshed = refreshBlessingOption(round, 0, candidates, () => 0);
		assert(refreshed.options.every(option => !option.id.startsWith('typeevolution')));
		assert(refreshed.familiesSeen.includes('typeevolution'));
	});
	it('leaves the round untouched when no new same-quality option is available', () => {
		const candidates = pool.filter(entry => entry.tier === 'silver').slice(0, 3);
		const round = createBlessingRound({ floor: 50 }, candidates, () => 0);
		const original = JSON.stringify(round);
		assert.throws(() => refreshBlessingOption(round, 0, candidates, () => 0), /没有符合条件/);
		assert.equal(JSON.stringify(round), original);
		assert.throws(() => refreshBlessingOption(round, -1, candidates, () => 0));
		assert.throws(() => chooseBlessingOption(round, 0.5));
	});
	it('remembers discarded cards across different slots, repeated rerolls and reconnects', () => {
		let round = createBlessingRound({floor: 50, spirit: 'victini'}, pool, () => 0);
		const seen = new Set(round.options.map(o => o.id));
		for (const slot of [0, 1, 0, 2, 1]) {
			round = refreshBlessingOption(JSON.parse(JSON.stringify(round)), slot, pool, () => 0);
			assert(!seen.has(round.options[slot].id), `${round.options[slot].id} was already offered`);
			seen.add(round.options[slot].id);
			assert.deepEqual(new Set(round.idsSeen), seen);
		}
		const input = JSON.stringify(round);
		assert.throws(() => refreshBlessingOption(round, 2, pool, () => 0), /没有符合条件/);
		assert.equal(JSON.stringify(round), input);
	});
	it('seeds legacy reroll history from all visible slots and resets it for the next round', () => {
		const round = createBlessingRound({floor: 50, spirit: 'silvally'}, pool, () => 0);
		delete round.idsSeen;
		const next = refreshBlessingOption(round, 0, pool, () => 0);
		assert(round.options.every(o => next.idsSeen.includes(o.id)));
		assert.equal(createBlessingRound({floor: 100, spirit: 'silvally'}, pool, () => 0).options[0].id, round.options[0].id);
	});
});
