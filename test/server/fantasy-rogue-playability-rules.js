'use strict';
const assert = require('assert').strict;
const { Battle, Dex } = require('../../dist/sim');
const { set, stats } = require('../fixtures/fantasy-rogue');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { partyEvolutions } = require('../../dist/server/fantasy-rogue/party-evolution');
const { safariRare, safariRareChance, safariPools, drawSafariTargets, safariTargets } = require('../../dist/server/fantasy-rogue/journey-safari-pool');
const { rollSafariChoice } = require('../../dist/server/fantasy-rogue/journey-safari');
describe('Fantasy Rogue playability rule boundaries', function () {
	this.timeout(20000);
	it('never draws or restores a rare safari target on floors 1 through 50, including forced rare rolls', () => {
		for (let floor = 1; floor <= 50; floor++) {
			assert.equal(safariRareChance(floor), 0);
			for (const pick of [0, 1, 9999])
				assert(drawSafariTargets(floor, n => Math.min(pick, n - 1)).every(n => !safariRare(n)));
			const original = { safari: ['Kartana', 'Iron Hands', 'Raikou'], index: 0, balls: 3 };
			const displayed = safariTargets(floor, original.safari);
			assert(displayed.every(n => !safariRare(n)));
			assert.deepEqual(safariTargets(floor, original.safari), displayed);
			const result = rollSafariChoice(original, () => 0, 'ball', floor);
			assert.equal(result.caught, displayed[0]);
			assert.equal(result.activity.balls, 2);
			assert.deepEqual(original.safari, ['Kartana', 'Iron Hands', 'Raikou']);
		}
	});
	for (const [floor, chance] of [[51, 25], [99, 25], [100, 50], [149, 50], [150, 100], [200, 100]]) {
		it(`uses ${chance}/10000 per safari target at floor ${floor}, with deterministic multi-target sampling`, () => {
			assert.equal(safariRareChance(floor), chance);
			assert(safariPools(floor).rare.length);
			const rare = new Set(safariPools(floor).rare);
			let seed = 1700 + floor, hits = 0, parks = 0;
			const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
			const trials = 100000;
			for (let i = 0; i < trials; i++) {
				const count = drawSafariTargets(floor, random).filter(n => rare.has(n)).length;
				hits += count;
				parks += count > 0 ? 1 : 0;
			}
			const p = chance / 10000, regionP = 1 - (1 - p) ** 3;
			assert(Math.abs(hits - trials * 3 * p) < 6 * Math.sqrt(trials * 3 * p * (1 - p)));
			assert(Math.abs(parks - trials * regionP) < 6 * Math.sqrt(trials * regionP * (1 - regionP)));
		});
	}
	it('retains the learned-move requirement name and its independent status, including bench move memory', () => {
		const mon = createRoguePokemon(set('Mime Jr.', 'Soundproof', 30, ['Splash']), stats(0));
		mon.moveMemory = [];
		mon.set.moves = ['splash'];
		const choice = () => partyEvolutions(mon).find(e => e.species === 'Mr. Mime');
		let r = choice().requirements.find(c => c.text === '需要学会');
		assert.equal(r.name, 'Mimic');
		assert.equal(r.status, '未学会');
		assert(!r.met);
		assert(!choice().ready);
		mon.moveMemory = [{ id: 'mimic', pp: 1, maxpp: 10 }];
		r = choice().requirements.find(c => c.text === '需要学会');
		assert.equal(r.name, 'Mimic');
		assert.equal(r.status, '已学会');
		assert(r.met);
		assert(choice().ready);
	});
	for (const maximum of [1, 9, 10, 19, 100, 713])
		it(`heals Fantasy Syrupy Apple at 1/10 of ${maximum} base HP using native rounding and cap`, () => {
			const battle = new Battle({ format: new Dex.Format({ id: 'gen9fantasyappletest', name: 'Apple test', mod: 'gen9fantasy', ruleset: [] }),
				seed: [1, 2, 3, 4], p1: { team: [{ ...set('Mew', 'Synchronize', 50, ['Splash']), item: 'Fantasy Syrupy Apple' }] },
				p2: { team: [set('Blissey', 'Natural Cure', 50, ['Splash'])] } });
			try {
				const mon = battle.p1.active[0];
				mon.maxhp = mon.baseMaxhp = maximum;
				mon.hp = 1;
				const item = mon.getItem();
				battle.singleEvent('Residual', item, mon.itemState, mon);
				assert.equal(mon.hp, Math.min(maximum, 1 + Math.max(1, Math.floor(maximum / 10))));
				mon.hp = maximum;
				battle.singleEvent('Residual', item, mon.itemState, mon);
				assert.equal(mon.hp, maximum);
			} finally {
				battle.destroy();
			}
		});
});
