'use strict';

// Offline release tool. Player requests never run a battle simulation.
const fs = require('fs');
const path = require('path');
const { gzipSync } = require('zlib');
const { runInNewContext } = require('vm');
const ts = require('typescript');
const { simulateForestBattle } = require('../dist/server/fantasy-rogue/event-battle');
const { Dex } = require('../dist/sim/dex');

const sets = [
	['Charizard', 'Blaze', 'Charcoal', ['flamethrower', 'airslash', 'dragonpulse', 'roost']],
	['Blastoise', 'Torrent', 'Mystic Water', ['surf', 'icebeam', 'darkpulse', 'aquajet']],
	['Venusaur', 'Overgrow', 'Black Sludge', ['gigadrain', 'sludgebomb', 'earthpower', 'sleeppowder']],
	['Garchomp', 'Rough Skin', 'Rocky Helmet', ['earthquake', 'dragonclaw', 'rockslide', 'swordsdance']],
	['Corviknight', 'Pressure', 'Leftovers', ['bravebird', 'bodypress', 'ironhead', 'roost']],
	['Rotom-Wash', 'Levitate', 'Sitrus Berry', ['hydropump', 'thunderbolt', 'shadowball', 'willowisp']],
	['Scizor', 'Technician', 'Metal Coat', ['bulletpunch', 'xscissor', 'closecombat', 'swordsdance']],
	['Arcanine', 'Intimidate', 'Sitrus Berry', ['flareblitz', 'extremespeed', 'crunch', 'morningsun']],
	['Gardevoir', 'Trace', 'Twisted Spoon', ['psychic', 'moonblast', 'thunderbolt', 'calmmind']],
	['Tyranitar', 'Sand Stream', 'Chople Berry', ['rockslide', 'crunch', 'earthquake', 'icepunch']],
	['Excadrill', 'Sand Rush', 'Soft Sand', ['earthquake', 'ironhead', 'rockslide', 'swordsdance']],
	['Milotic', 'Competitive', 'Leftovers', ['surf', 'icebeam', 'dragonpulse', 'recover']],
	['Dragonite', 'Multiscale', 'Lum Berry', ['dragonclaw', 'earthquake', 'extremespeed', 'dragondance']],
	['Mamoswine', 'Thick Fat', 'Never-Melt Ice', ['earthquake', 'iceshard', 'iciclecrash', 'rockslide']],
	['Magnezone', 'Sturdy', 'Magnet', ['thunderbolt', 'flashcannon', 'bodypress', 'thunderwave']],
	['Infernape', 'Blaze', 'Expert Belt', ['closecombat', 'flareblitz', 'machpunch', 'thunderpunch']],
	['Azumarill', 'Huge Power', 'Sitrus Berry', ['playrough', 'liquidation', 'aquajet', 'icepunch']],
	['Roserade', 'Natural Cure', 'Miracle Seed', ['gigadrain', 'sludgebomb', 'shadowball', 'sleeppowder']],
	['Gyarados', 'Intimidate', 'Lum Berry', ['waterfall', 'icefang', 'earthquake', 'dragondance']],
	['Metagross', 'Clear Body', 'Assault Vest', ['meteormash', 'zenheadbutt', 'bulletpunch', 'earthquake']],
	['Hydreigon', 'Levitate', 'Expert Belt', ['darkpulse', 'dragonpulse', 'flamethrower', 'flashcannon']],
	['Breloom', 'Technician', 'Focus Sash', ['bulletseed', 'machpunch', 'rocktomb', 'spore']],
	['Sylveon', 'Pixilate', 'Leftovers', ['hypervoice', 'shadowball', 'psyshock', 'calmmind']],
	['Lucario', 'Inner Focus', 'Life Orb', ['closecombat', 'bulletpunch', 'crunch', 'swordsdance']],
];
const dex = Dex.mod('gen9fantasy');
for (const [species, ability, item, moves] of sets) {
	if (!dex.species.get(species).exists || !dex.abilities.get(ability).exists || !dex.items.get(item).exists ||
		moves.some(move => !dex.moves.get(move).exists)) throw new Error(`Invalid set: ${species}`);
}
let seed = 0x61b31702;
function random(max) {
	seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
	return (seed >>> 0) % max;
}
function team(indices) {
	return indices.map(index => {
		const [species, ability, item, moves] = sets[index];
		const physical = moves.filter(id => dex.moves.get(id).category === 'Physical').length >= 2;
		return { species, ability, item, moves, level: 50, nature: physical ? 'Adamant' : 'Modest',
			evs: { hp: 4, atk: physical ? 252 : 0, def: 0, spa: physical ? 0 : 252, spd: 0, spe: 252 },
			ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } };
	});
}
const output = path.resolve(__dirname, '../server/fantasy-rogue/daily-cup-data.ts');
const days = Number(process.argv[2] || 366);
if (!Number.isInteger(days) || days < 1 || days > 3660) throw new Error('Choose 1–3660 calendar days.');
// Published results are immutable: releases may only append future tournaments.
const saved = {};
if (fs.existsSync(output)) {
	// Read the local generated module, including wrapped replay strings, without loading game code.
	const compiled = ts.transpileModule(fs.readFileSync(output, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS },
	}).outputText;
	runInNewContext(compiled, { exports: saved });
}
const schedule = saved.DAILY_CUP_V1 || [];
const existing = schedule.length;
for (let day = existing; day < days; day++) {
	seed = (0x61b31702 ^ Math.imul(day + 1, 0x9e3779b9)) >>> 0;
	const pool = sets.map((_, i) => i);
	for (let i = pool.length - 1; i > 0; i--) {
		const j = random(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]];
	}
	const teams = Array.from({ length: 4 }, (_, i) => team(pool.slice(i * 3, i * 3 + 3)));
	const winners = [], replays = [];
	for (let match = 0; match < 3; match++) {
		const pair = match === 0 ? [0, 1] : match === 1 ? [2, 3] : [winners[0], winners[1]];
		let battle;
		for (let attempt = 0; attempt < 10; attempt++) {
			battle = simulateForestBattle(pair.map(i => teams[i]), random);
			if (battle.winner !== null) break;
		}
		if (battle.winner === null) throw new Error(`Unresolved tournament ${day}/${match}`);
		winners.push(pair[battle.winner]);
		const log = battle.log.join('\n').replaceAll('左边的队伍', `${'ABCD'[pair[0]]}队`)
			.replaceAll('右边的队伍', `${'ABCD'[pair[1]]}队`).replaceAll('斗蛐蛐！', '每日对战竞猜');
		replays.push(gzipSync(log, { level: 9 }).toString('base64'));
	}
	schedule.push({ teams: teams.map(t => t.map(mon => mon.species)), winners, replays });
}
function quoted(value) {
	return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}
const text = '// Generated offline by tools/generate-rogue-daily-cup.js. Keep v1 immutable for submitted predictions.\n' +
	'export const DAILY_CUP_V1: { teams: string[][], winners: number[], replays: string[] }[] = [\n' +
	schedule.map(day => '\t{\n\t\tteams: [\n' +
		day.teams.map(teamNames => '\t\t\t[' + teamNames.map(quoted).join(', ') + '],').join('\n') +
		'\n\t\t],\n\t\twinners: [' + day.winners.join(', ') + '],\n\t\treplays: [\n' +
		day.replays.map(replay => replay.match(/.{1,96}/g).map(quoted).map(part => '\t\t\t' + part)
			.join(' +\n') + ',').join('\n') + '\n\t\t],\n\t},').join('\n') + '\n];\n';
if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== text) fs.writeFileSync(output, text);
console.log(`Kept ${existing}; appended ${schedule.length - existing}; total ${schedule.length} tournaments.`);
