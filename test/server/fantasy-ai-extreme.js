'use strict';

const assert = require('assert').strict;
const { Dex, Teams } = require('../../dist/sim');
const { validateExtremeTeam } = require('../../dist/server/fantasy-ai/restrictions');
const { validatePlayerTeam, TrainerRegistry } = require('../../dist/server/fantasy-ai/trainers');
const { aiDifficulty } = require('../../dist/server/fantasy-ai/types');
const dex = Dex.mod('gen9fantasy');
const set = (species, extra = {}) => ({ species, ability: dex.species.get(species).abilities['0'],
	moves: ['protect'], evs: { hp: 252 }, ...extra });
const legalTeam = () => ['Gengar', 'Skarmory', 'Salamence', 'Porygon-Z', 'Tentacruel', 'Pidgeot'].map(name => set(name));

describe('Fantasy AI extreme player restrictions', () => {
	for (const [format, allowed, rejected, cap] of [
		['gen9fcubersuu', 'Audino-Fantasy', 'Urshifu-Rapid-Strike-G-Mega-Fantasy', 'OU'],
		['gen9fcou', 'Garchomp', 'Audino-Fantasy', 'UUBL'],
		['gen9fcuu', 'Gengar', 'Mew', 'RUBL'],
	]) {
		it(`${format}: accepts the exact ${cap} boundary and rejects higher species`, () => {
			assert.deepEqual(validateExtremeTeam(format, [set(allowed)]), []);
			const errors = validateExtremeTeam(format, [set(rejected), set(rejected)]);
			assert(errors.some(error => error.includes('第 1 只') && error.includes(cap)));
			assert(errors.some(error => error.includes('第 2 只') && error.includes(rejected)));
		});
	}
	it('checks actual Mega X/Y configuration without banning an unequipped base species', () => {
		assert.deepEqual(validateExtremeTeam('gen9fcou', [set('Charizard')]), []);
		assert.deepEqual(validateExtremeTeam('gen9fcou', [set('Charizard', { item: 'Charizardite X' })]), []);
		assert(/Charizard-Mega-Y.*Charizardite Y.*OU.*UUBL/.test(validateExtremeTeam('gen9fcou', [set('Charizard', { item: 'Charizardite Y' })]).join('\n')));
		assert(/Charizard-Mega-X.*UUBL.*RUBL/.test(validateExtremeTeam('gen9fcuu', [set('Charizard', { item: 'Charizardite X' })]).join('\n')));
	});
	it('rejects move-triggered G-Mega and direct imports, but permits the same base without its trigger', () => {
		const base = set('Urshifu-Rapid-Strike-Fantasy', { ability: 'Unseen Fist' });
		assert.deepEqual(validateExtremeTeam('gen9fcou', [base]), []);
		assert(/G-Mega-Fantasy.*招式：Yi Shun Qian Ji.*Uber/.test(validateExtremeTeam('gen9fcou', [{ ...base, moves: ['yishunqianji'] }]).join('\n')));
		assert(/G-Mega-Fantasy.*Uber/.test(validateExtremeTeam('gen9fcou', [set('Urshifu-Rapid-Strike-G-Mega-Fantasy')]).join('\n')));
	});
	it('includes Primal and Ultra Burst targets and refuses unresolved tiers', () => {
		assert(/Groudon-Primal/.test(validateExtremeTeam('gen9fcubersuu', [set('Groudon', { item: 'Red Orb' })]).join('\n')));
		assert(/Necrozma-Ultra/.test(validateExtremeTeam('gen9fcubersuu', [set('Necrozma-Dusk-Mane', { item: 'Ultranecrozium Z' })]).join('\n')));
		assert(/不能用于極限|不能用于极限/.test(validateExtremeTeam('gen9fcou', [set('MissingNo.')]).join('\n')));
	});
	it('includes the custom Ash-Greninja ability transformation even without its special Z item', () => {
		for (const item of ['', 'Greninja-Ash-Z']) {
			const errors = validateExtremeTeam('gen9fcubersuu', [set('Greninja-Bond-Fantasy', { item })]);
			assert(errors.some(error => error.includes('Greninja-Ash-Fantasy') && error.includes('Chao Yue Qian Ban Bian Shen')));
		}
	});
	it('uses original-format item and ability rules, including Drizzle, Drought and Light Clay', () => {
		const team = legalTeam();
		team[0] = set('Pelipper', { ability: 'Drizzle' });
		team[1] = set('Ninetales', { ability: 'Drought' });
		team[2] = set('Grimmsnarl', { item: 'Light Clay', ability: 'Prankster' });
		assert.deepEqual(validatePlayerTeam('gen9fcou', Teams.pack(team), 'extreme').problems, []);
		assert(validatePlayerTeam('gen9fcuu', Teams.pack(team), 'extreme').problems.length);
	});
	it('keeps original legality, normal/hard teams and NPC teams separate from the extra cap', () => {
		const team = legalTeam();
		team[0] = set('Audino-Fantasy', { ability: 'Regenerator' });
		for (const difficulty of ['normal', 'hard']) {
			assert.deepEqual(validatePlayerTeam('gen9fcou', Teams.pack(team), difficulty).problems, []);
		}
		assert(/Audino-Fantasy.*OU.*UUBL/.test(validatePlayerTeam('gen9fcou', Teams.pack(team), 'extreme').problems.join('\n')));
		team[0] = set('Gengar', { moves: ['notarealmove'] });
		assert(/move/.test(validatePlayerTeam('gen9fcou', Teams.pack(team), 'extreme').problems.join('\n')));
		const definitions = require('../../config/fantasy-ai-trainers.example.json');
		const registry = new TrainerRegistry(definitions, { enabled: true, allowDevelopmentTrainers: true });
		assert.equal(registry.list().length, definitions.length);
		assert.equal(aiDifficulty('extreme'), 'hard');
	});
	it('validates all six player members under each original FC format', () => {
		for (const format of ['gen9fcubersuu', 'gen9fcou', 'gen9fcuu']) {
			assert.deepEqual(validatePlayerTeam(format, Teams.pack(legalTeam()), 'extreme').problems, []);
		}
	});
});
