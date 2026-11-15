'use strict';

// Offline only. Freeze each published day; player requests never run AI or reroll a roster.
const fs = require('fs');
const path = require('path');
const { gzipSync } = require('zlib');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { runInNewContext } = require('vm');
const ts = require('typescript');
const { simulateDailyCupBattle } = require('../dist/server/fantasy-rogue/daily-cup-battle');
const { Dex } = require('../dist/sim/dex');
const { Teams } = require('../dist/sim/teams');
const { TrainerBossData } = require('../dist/server/fantasy-rogue/trainer-boss-data');
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
const pool = sets.map(([species, ability, , moves]) => {
	const physical = moves.filter(id => dex.moves.get(id).category === 'Physical').length >= 2;
	return { species, ability, item: '', moves, level: 50, nature: physical ? 'Adamant' : 'Modest',
		evs: { hp: 4, atk: physical ? 252 : 0, def: 0, spa: physical ? 0 : 252, spd: 0, spe: 252 },
		ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } };
});
// Reuse authored legal Fantasy configurations, without their held items or battle-only entry forms.
const seen = new Set(pool.map(set => set.species));
for (const entry of TrainerBossData) for (const set of Teams.import(entry.team) || []) {
	const species = dex.species.get(set.species);
	if (!species.forme.includes('Fantasy') || species.battleOnly || species.requiredItem || species.requiredItems ||
		set.moves.length !== 4 || seen.has(species.name)) continue;
	seen.add(species.name);
	pool.push({ ...set, name: '', species: species.name, level: 50, item: '' });
}
for (const set of pool) {
	if (!dex.species.get(set.species).exists || !dex.abilities.get(set.ability).exists ||
		set.moves.length !== 4 || set.moves.some(move => !dex.moves.get(move).exists)) throw new Error(`Invalid set: ${set.species}`);
}
function rng(day) {
	let seed = (0x73151702 ^ Math.imul(day + 1, 0x9e3779b9)) >>> 0;
	return max => {
		seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
		return (seed >>> 0) % max;
	};
}
function roster(day, previous) {
	const random = rng(day), recent = new Set(previous.slice(-2).flatMap(entry => entry.teams.flat()));
	const shuffled = pool.slice();
	for (let i = shuffled.length - 1; i > 0; i--) { const j = random(i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
	const available = shuffled.filter(set => !recent.has(set.species));
	const ordered = [...available, ...shuffled.filter(set => recent.has(set.species))];
	// At least one Fantasy participant, chosen from unused candidates whenever possible.
	const fantasy = ordered.find(set => dex.species.get(set.species).forme.includes('Fantasy'));
	if (!fantasy || ordered.length < 12) throw new Error('Insufficient daily cup candidates.');
	const picked = [fantasy, ...ordered.filter(set => set !== fantasy)].slice(0, 12);
	for (let i = picked.length - 1; i > 0; i--) { const j = random(i + 1); [picked[i], picked[j]] = [picked[j], picked[i]]; }
	return Array.from({ length: 4 }, (_, i) => structuredClone(picked.slice(i * 3, i * 3 + 3)));
}
function simulate(day, teams) {
	const random = rng(day), winners = [], replays = [], diagnostics = [];
	for (let match = 0; match < 3; match++) {
		const pair = match < 2 ? [match * 2, match * 2 + 1] : winners.slice(0, 2);
		let battle;
		for (let attempt = 0; attempt < 10; attempt++) {
			battle = simulateDailyCupBattle(pair.map(i => teams[i]), random);
			if (battle.winner !== null) break;
		}
		if (battle.winner === null) throw new Error(`Unresolved tournament ${day}/${match}`);
		winners.push(pair[battle.winner]); diagnostics.push({ decisions: battle.decisions, rollouts: battle.rollouts });
		const log = battle.log.join('\n').replaceAll('左边的队伍', `${'ABCD'[pair[0]]}队`)
			.replaceAll('右边的队伍', `${'ABCD'[pair[1]]}队`);
		replays.push(gzipSync(log, { level: 9 }).toString('base64'));
	}
	return { teams: teams.map(team => team.map(set => set.species)), sets: teams, winners, replays, diagnostics };
}
async function main() {
	const days = Number(process.argv[2] || 366);
	if (!Number.isInteger(days) || days < 1 || days > 3660) throw new Error('Choose 1–3660 calendar days.');
	const output = path.resolve(__dirname, '../server/fantasy-rogue/daily-cup-data.ts');
	const saved = {};
	if (fs.existsSync(output)) runInNewContext(ts.transpileModule(fs.readFileSync(output, 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS },
	}).outputText, { exports: saved });
	const schedule = saved.DAILY_CUP_V2 || [], existing = schedule.length;
	if (existing >= days) { console.log(`Kept ${existing} published days.`); return; }
	const planned = schedule.slice();
	for (let day = existing; day < days; day++) {
		const teams = roster(day, planned);
		planned.push({ teams: teams.map(team => team.map(set => set.species)), sets: teams });
	}
	const cache = process.argv[3];
	if (cache) fs.mkdirSync(cache, { recursive: true });
	let next = existing, completed = existing;
	async function worker() {
		while (next < days) {
			const day = next++, file = cache && path.join(cache, `${day}.json`);
			let result = file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
			if (result && JSON.stringify(result.sets) !== JSON.stringify(planned[day].sets)) throw new Error(`Stale cache ${day}`);
			if (!result) {
				result = await new Promise((resolve, reject) => {
					const w = new Worker(__filename, { workerData: { day, teams: planned[day].sets } });
					w.once('message', resolve); w.once('error', reject);
					w.once('exit', code => { if (code) reject(new Error(`Worker exit ${code}`)); });
				});
				if (file) fs.writeFileSync(file, JSON.stringify(result));
			}
			schedule[day] = result; completed++;
			console.log(`Completed ${completed}/${days} (day ${day})`);
		}
	}
	await Promise.all(Array.from({ length: Math.min(8, days - existing) }, worker));
	const text = '// Generated offline. Season 2 starts 2026-11-15 (Asia/Shanghai). Published days are immutable.\n' +
		'export const DAILY_CUP_V2: {\n\tteams: string[][],\n' +
		"\tsets: (Partial<PokemonSet> & Pick<PokemonSet, 'species' | 'ability' | 'item' | 'moves' | 'level'>)[][],\n" +
		'\twinners: number[],\n\treplays: string[],\n\tdiagnostics: { decisions: number, rollouts: number }[],\n' +
		'}[] = ' + JSON.stringify(schedule, null, '\t').replace(/(?<=[\w"\]}])(?=\n\t*[}\]])/g, ',') + ';\n';
	fs.writeFileSync(output, text);
	console.log(`Kept ${existing}; appended ${schedule.length - existing}; total ${schedule.length} tournaments.`);
}
if (!isMainThread) parentPort.postMessage(simulate(workerData.day, workerData.teams));
else main().catch(error => { console.error(error); process.exitCode = 1; });
