'use strict';
const assert = require('assert').strict;
const { Dex } = require('../../dist/sim');
const { Learnsets } = require('../../dist/data/learnsets');
const dex = Dex.mod('gen9fantasy');
const additions = {
	psychup: 'alakazam starmie mrmime mawile altaria drifblim absol roserade weavile rotom rotomheat rotomwash rotomfrost rotomfan rotommow liepard musharna audino cofagrigus slurpuff drampa annihilape',
	slackoff: 'emboar', roost: 'beedrill hydreigon', tailwind: 'emolga', wonderroom: 'umbreon',
	playrough: 'vaporeon jolteon flareon espeon umbreon leafeon glaceon',
};
const variants = {
	psychup: 'mawilefantasy mawilemegafantasy altariafantasy altariamegafantasy absolfantasy absolmegafantasy absolmegazfantasy roseradefantasy rotomfantasy audinofantasy audinomegafantasy',
	slackoff: 'emboarfantasy emboarmegafantasy',
};
describe('Fantasy announcement learnsets', () => {
	for (const [move, names] of Object.entries(additions)) for (const id of names.split(' ')) {
		it(`adds ${move} to ${id} without removing existing moves or official sources`, () => {
			assert(dex.species.getFullLearnset(id).some(l => l.learnset[move]?.includes('9M')));
			const official = Learnsets[id];
			if (official) {
				assert.deepEqual(Dex.mod('gen9').species.getLearnsetData(id).learnset, official.learnset);
				const updated = dex.species.getLearnsetData(id).learnset;
				for (const [oldMove, sources] of Object.entries(official.learnset)) {
					assert(updated[oldMove], `${id} lost ${oldMove}`);
					// Other pre-existing Fantasy overrides may change unrelated move sources.
					if (oldMove === move) for (const source of sources) assert(updated[move].includes(source));
				}
			}
		});
	}
	for (const [move, names] of Object.entries(variants)) for (const id of names.split(' ')) {
		it(`also teaches ${move} to Fantasy form ${id}`, () => {
			assert(dex.species.get(id).exists);
			assert(dex.species.getFullLearnset(id).some(l => l.learnset[move]?.includes('9M')));
		});
	}
	it('covers all existing Fantasy counterparts of the announced species', () => {
		for (const [move, names] of Object.entries(additions)) {
			const numbers = new Set(names.split(' ').map(id => dex.species.get(id).num));
			for (const s of dex.species.all().filter(s => s.id.endsWith('fantasy') && numbers.has(s.num))) {
				assert(variants[move]?.split(' ').includes(s.id), `missing fixture ${s.id}/${move}`);
			}
		}
	});
});
