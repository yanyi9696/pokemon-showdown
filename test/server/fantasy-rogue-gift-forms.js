'use strict';
const assert = require('assert').strict;
const { Dex } = require('../../dist/sim/dex');
const { drawBlessingGift, gift, syncBlessingParty } = require('../../dist/server/fantasy-rogue/blessings');
const { createPreviewContent } = require('../../dist/server/fantasy-rogue/preview-content');
const { createRoguePokemon } = require('../../dist/server/fantasy-rogue/progression');
const { stats, set } = require('../fixtures/fantasy-rogue');

describe('Fantasy Rogue gift form exclusions', function () {
	this.timeout(20000);
	let content, run;
	before(() => { content = createPreviewContent(); });
	beforeEach(() => {
		run = { floor: 200, team: [], boosts: stats(0), bag: {}, caught: [], money: 0 };
		syncBlessingParty(run);
	});
	it('filters every native and fantasy Totem form from custom random pools', () => {
		const totems = Dex.mod('gen9fantasy').species.all().filter(s => s.forme.includes('Totem'));
		assert(totems.some(s => s.name.includes('Togedemaru')));
		for (const species of totems) {
			const mon = drawBlessingGift(run, content, () => 0, {
				pool: [species.name, 'Pikachu'], eligibleStage: false,
			});
			assert.equal(mon.set.species, 'Pikachu', species.name);
			assert.throws(() => drawBlessingGift(run, content, () => 0, {
				species: species.name, eligibleStage: false,
			}), /霸主/);
		}
	});
	it('rejects direct blessing gifts before touching capture credit or pending rewards', () => {
		const mon = createRoguePokemon(set('Togedemaru-Totem', 'Iron Barbs', 100), stats(0));
		const before = structuredClone(run);
		assert.throws(() => gift({}, run, content, mon, '电气鼠大家族'), /霸主/);
		assert.deepEqual(run, before);
	});
});
