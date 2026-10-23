'use strict';

const assert = require('assert').strict;
const { execFileSync } = require('child_process');
const path = require('path');
const { Dex } = require('../../dist/sim/dex');
const { TeamValidator } = require('../../dist/sim/team-validator');
const { encounterSetProblems } = require('../../dist/server/fantasy-rogue/encounter-legality');

const set = (species, ability, moves, item = '') => ({
	species, ability, moves, item, level: 100, nature: 'Adamant', evs: { hp: 252, atk: 252, spd: 4 },
});
const validate = team => new TeamValidator('gen9fcag').validateTeam(structuredClone(team));

describe('Fantasy rule source coverage', () => {
	it('keeps Z-A Mega formes out of ordinary games while retaining Fantasy access', () => {
		const ids = (
			'raichumegax raichumegay clefablemega victreebelmega starmiemega dragonitemega meganiummega ' +
			'feraligatrmega skarmorymega chimechomega absolmegaz staraptormega garchompmegaz lucariomegaz ' +
			'froslassmega emboarmega excadrillmega scolipedemega scraftymega eelektrossmega chandeluremega ' +
			'golurkmega chesnaughtmega delphoxmega greninjamega pyroarmega floettemega meowsticmmega ' +
			'meowsticfmega malamarmega barbaraclemega dragalgemega hawluchamega zygardemega crabominablemega ' +
			'golisopodmega drampamega falinksmega scovillainmega glimmoramega baxcaliburmega'
		).split(' ');
		const fantasy = Dex.mod('gen9fantasy');
		for (const id of ids) {
			const native = Dex.species.get(id);
			const custom = fantasy.species.get(id);
			assert.equal(native.gen, 9, id);
			assert.equal(native.isNonstandard, 'Future', id);
			assert(custom.exists && !custom.isNonstandard, `Fantasy access: ${id}`);
			assert.equal(custom.gen, 9, id);
			assert.notEqual(Dex.data.Pokedex[id], fantasy.data.Pokedex[id], `Shared data: ${id}`);
			for (const mod of ['gen6', 'gen7', 'gen7letsgo', 'gen8', 'gen8bdsp']) {
				assert.equal(Dex.mod(mod).species.get(id).isNonstandard, 'Future', `${mod}: ${id}`);
			}
		}
		assert.equal(Dex.forGen(6).species.get('Charizard-Mega-X').isNonstandard, null);
	});

	for (const first of ['base', 'gen9fantasy']) {
		it(`keeps ordinary availability and tiers unchanged when loading ${first} first`, () => {
			const output = execFileSync(process.execPath, ['-e', `
				const {Dex} = require('./dist/sim/dex');
				Dex.mod(${JSON.stringify(first)}).includeData();
				const fantasy = Dex.mod('gen9fantasy');
				console.log(JSON.stringify({
					native: Dex.data.FormatsData.drapion,
					nativeAvailability: Dex.species.get('drapion').isNonstandard,
					fantasy: fantasy.data.FormatsData.drapion,
					fantasyAvailability: fantasy.species.get('drapion').isNonstandard,
					shared: Dex.data.FormatsData.drapion === fantasy.data.FormatsData.drapion,
				}));
			`], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', windowsHide: true });
			const data = JSON.parse(output);
			assert.equal(data.native.isNonstandard, 'Past');
			assert.equal(data.native.tier, 'Illegal');
			assert.equal(data.nativeAvailability, 'Past');
			assert.equal(data.fantasy.tier, data.native.natDexTier);
			assert(!data.fantasyAvailability);
			assert.equal(data.shared, false);
		});
	}

	it('resolves every configured Fantasy ruleset from the current source build', () => {
		const formats = Dex.formats.all().filter(format => format.mod === 'gen9fantasy');
		assert(formats.some(format => format.id === 'gen9fantasyrogue'));
		assert(formats.some(format => format.id === 'gen9fantasyroguecoop'));
		for (const format of formats) assert(Dex.forFormat(format).formats.getRuleTable(format));
	});

	it('accepts native and Fantasy abilities while rejecting unrelated abilities and moves', () => {
		assert.equal(validate([set('Absol', 'Super Luck', ['Night Slash'])]), null);
		assert.equal(validate([set('Absol-Fantasy', 'Sharpness', ['Night Slash'])]), null);
		assert(validate([set('Absol', 'Sharpness', ['Night Slash'])]).some(problem => problem.includes("can't have")));
		assert(validate([set('Absol-Fantasy', 'Wonder Guard', ['Night Slash'])]).some(problem => problem.includes("can't have")));
		assert(validate([set('Pikachu', 'Static', ['Spore'])]).some(problem => problem.includes("can't learn")));
	});

	it('validates required Mega items and both base and target-form ability exports', () => {
		for (const ability of ['Earth Eater', 'Heatproof', 'Heatproof+']) {
			assert.equal(validate([set('Steelix-Mega-Y-Fantasy', ability, ['Earthquake'], 'Steelixite Y')]), null);
		}
		assert(validate([set('Steelix-Mega-Y-Fantasy', 'Wonder Guard', ['Earthquake'], 'Steelixite Y')])
			.some(problem => problem.includes("can't have")));
		assert(validate([set('Steelix-Mega-Y-Fantasy', 'Earth Eater', ['Earthquake'], 'Leftovers')])
			.some(problem => problem.includes('Steelixite Y')));
	});

	it('checks generated Rogue teams before explicit blessing grants', () => {
		assert.deepEqual(encounterSetProblems(set('Cleffa', 'Magic Guard', ['Sing', 'Pound'])), []);
		assert(encounterSetProblems(set('Cleffa', 'Anger Shell', ['Sing', 'Pound'])).some(problem => problem.includes('特性')));
		assert(encounterSetProblems(set('Cleffa', 'Magic Guard', ['Spore'])).some(problem => problem.includes('招式')));
		assert.deepEqual(encounterSetProblems(set('Magnezone-Fantasy', 'Analytic', ['Hidden Power [Ice]'])), []);
	});
});
