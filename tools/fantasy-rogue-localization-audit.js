'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const client = path.resolve(process.argv[2] || '../pokemon-showdown-client/play.pokemonshowdown.com');
const source = fs.readFileSync(path.join(client, 'js/ps-china-translator.js'), 'utf8'), context = {};
vm.runInNewContext(source.slice(0, source.indexOf('(function() {')), context);
const mod = require(path.join(client, 'data/gen9fantasy.js'));
const report = {source: 'Actual client base data plus Fantasy overrides; official and Fantasy content, excluding CAP/Pokestar.', counts: {}, missing: []};
for (const [category, filename, baseKey, modKey] of [
	['species', 'pokedex', 'BattlePokedex', 'Gen9fantasydex'], ['moves', 'moves', 'BattleMovedex', 'Gen9fantasyMovedex'],
	['abilities', 'abilities', 'BattleAbilities', 'Gen9fantasyAbilities'], ['items', 'items', 'BattleItems', 'Gen9fantasyItems'],
]) {
	const base = require(path.join(client, `data/${filename}.js`))[baseKey];
	const ids = new Set([...Object.keys(base), ...Object.keys(mod[modKey])]);
	report.counts[category] = 0;
	for (const id of ids) {
		const entry = {...base[id], ...mod[modKey][id]};
		if (entry.num < 0 || entry.isNonstandard === 'CAP' || id.startsWith('pokestar') || id === 'missingno') continue;
		for (const [field, value] of [['name', entry.name], ...(category === 'species' ? [] : [['shortDesc', entry.shortDesc]])]) {
			if (!value) continue;
			report.counts[category]++;
			const translated = context.translateRogueName(value, category === 'moves' && field === 'name' ? 'move' : '');
			// Conventional PP/HP, form X/Y/Z, and already Chinese descriptions are not untranslated English prose.
			if (/[a-z]{3}/i.test(translated)) report.missing.push({category, id, field, value, translated});
		}
	}
}
const output = 'docs/playtests/2026-10-17/acquisition-revision';
fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(`${output}/localization.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.missing.length) process.exitCode = 1;
