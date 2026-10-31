'use strict';
// Controlled native-battle probes. These are mechanism comparisons, not campaign wins.
const fs = require('fs');
const {Battle} = require('../dist/sim/battle');
const {Dex} = require('../dist/sim/dex');
const {blessing, blessingLevelCost} = require('../dist/sim/rogue-blessing-data');
const {syncBlessingParty} = require('../dist/server/fantasy-rogue/blessings');
const {createRoguePokemon} = require('../dist/server/fantasy-rogue/progression');
const {editFusion} = require('../dist/server/fantasy-rogue/fusion');
const {dogBoostCount} = require('../dist/sim/rogue-pets');
const stats = n => ({hp: n, atk: n, def: n, spa: n, spd: n, spe: n});
const dex = Dex.mod('gen9fantasy');
function set(species, moves, extra = {}) {
	return {species, ability: dex.species.get(species).abilities[0], level: 100, moves, nature: 'Hardy',
		item: '', evs: stats(0), ivs: stats(31), ...extra};
}
function party(sets, ids) {
	const run = {id: 'isolated-lab', floor: 100, phase: 'ready', money: 0, bag: {}, boosts: stats(0), notices: [],
		team: sets.map(s => createRoguePokemon(s, stats(0)))};
	syncBlessingParty(run); run.blessings.owned = ids.map(id => ({...blessing(id), floor: 1}));
	syncBlessingParty(run); return run;
}
function begin(run, foes, seed = 1) {
	const b = new Battle({formatid: 'gen9fantasyrogue', seed: [2026, 10, 22, seed],
		fantasyRogue: {encounterId: 'lab', team: structuredClone(run.team), blessings: structuredClone(run.blessings),
			boosts: stats(0), bag: {}, balls: [], catchable: false},
		p1: {name: 'Probe', team: run.team.map(m => m.set)}, p2: {name: 'Control', team: foes}});
	b.makeChoices('team ' + run.team.map((_, i) => i + 1).join(''), 'team ' + foes.map((_, i) => i + 1).join(''));
	return b;
}
const result = { date: new Date().toISOString(), scope: 'Controlled comparisons; no injected resources enter campaign saves', numbers: [], fusion: [], dogs: [], spinda: {}, soloFloorOnly: [], levelCosts: [] };
for (const family of [null, 'bignumber', 'supernumber']) {
	const r = party([set('Mew', ['Psychic'], {evs: {...stats(0), spa: 252, spe: 252}})], family ? [family] : []);
	const b = begin(r, [set('Blissey', ['Flamethrower'], {evs: {...stats(0), hp: 252, spd: 252}})]);
	b.randomizer = n => n; const a = b.p1.active[0], foe = b.p2.active[0];
	const original = Object.fromEntries(['atk', 'def', 'spa', 'spd', 'spe'].map(s => [s, a.getStat(s)]));
	let during;
	b.onEvent('BeforeMove', b.format, function (p) {
		if (p === a) during = Object.fromEntries(Object.keys(original).map(s => [s, p.getStat(s)]));
	});
	b.makeChoices((family ? 'roguenumber ' + (family === 'bignumber' ? 'spa' : 'all') + ' ' : '') + 'move psychic', 'move flamethrower');
	result.numbers.push({family: family || 'none', original, during, outgoing: foe.maxhp - foe.hp,
		incoming: a.maxhp - a.hp, foeMaxhp: foe.maxhp, ownMaxhp: a.maxhp,
		after: Object.fromEntries(Object.keys(original).map(s => [s, a.getStat(s)]))}); b.destroy();
}
// A naturally legal two-turn threshold setup, not a manually assigned +6 boost.
for (const family of ['bignumber', 'supernumber']) {
	const r = party([set('Azumarill', ['Belly Drum', 'Play Rough'], {ability: 'Huge Power', nature: 'Adamant', evs: {...stats(0), atk: 252}, item: 'Sitrus Berry'})], [family]);
	const b = begin(r, [set('Blissey', ['Soft-Boiled'])]);
	b.makeChoices('move bellydrum', 'move softboiled');
	const a = b.p1.active[0]; let attack;
	b.onEvent('BeforeMove', b.format, function (p) {if (p === a) attack = p.getStat('atk');});
	b.makeChoices('roguenumber ' + (family === 'bignumber' ? 'atk' : 'all') + ' move playrough', 'move softboiled');
	result.numbers.push({family, setup: 'Lv100 Adamant 252 Atk Huge Power Azumarill; Belly Drum then activate', attack,
		progress: b.fantasyRogue.blessingProgress}); b.destroy();
}
for (const [first, second, ability] of [['Slaking', 'Dragapult', 'clearbody'], ['Rhyperior', 'Alakazam', 'magicguard'], ['Slaking', 'Azumarill', 'hugepower']]) {
	const r = party([set(first, ['Tackle']), set(second, ['Tackle'], {ability: dex.abilities.get(ability).name})], ['potara']);
	const [a, c] = r.team;
	const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
	const fusionStats = keys.slice().sort((x, y) => (dex.species.get(first).baseStats[y] - dex.species.get(second).baseStats[y]) -
		(dex.species.get(first).baseStats[x] - dex.species.get(second).baseStats[x])).slice(0, 3);
	editFusion(r, {action: 'fusion', member: a.id, value: c.id, fusionAbility: ability, appearance: a.id, fusionStats});
	const b = begin(r, [set('Blissey', ['Soft-Boiled'])]);
	const p = b.p1.active[0];
	result.fusion.push({first, second, ability, fusionStats, baseStats: r.team[0].fusion.baseStats, types: p.getTypes(),
		actual: {hp: p.maxhp, ...Object.fromEntries(['atk', 'def', 'spa', 'spd', 'spe'].map(s => [s, p.getStat(s)]))},
		legalMovePool: r.team[0].blessingMoves.length, partySlots: r.team.length}); b.destroy();
}
for (let count = 1; count <= 6; count++) {
	const names = ['Arcanine', 'Lucario', 'Umbreon', 'Manectric', 'Lycanroc', 'Houndoom'].slice(0, count);
	const r = party(names.map(n => set(n, ['Protect'])), ['dogs']);
	const b = begin(r, [set('Blissey', ['Soft-Boiled'])]);
	result.dogs.push({count, boostCount: dogBoostCount(r.team), boosts: {...b.p1.active[0].boosts}}); b.destroy();
}
// Repeated lethal-hit test: measure the revival feature conditional on it activating.
let triggered = 0, woke = 0, dead = 0, totalConfusionSelfHits = 0;
for (let seed = 1; seed <= 512; seed++) {
	const r = party([set('Spinda', ['Return'], {ability: 'Own Tempo'})], ['spindance']);
	const b = begin(r, [set('Groudon', ['Earthquake'], {level: 300})], seed);
	let wasSleeping = false;
	for (let turn = 0; !b.ended && turn < 30; turn++) {
		b.makeChoices('move return', 'move earthquake');
		const p = b.p1.pokemon[0];
		if (p.volatiles.roguespindasleep && !wasSleeping) {wasSleeping = true; triggered++;}
		if (wasSleeping && !p.volatiles.roguespindasleep && p.hp === p.maxhp) {woke++; break;}
	}
	if (wasSleeping && !b.p1.pokemon[0].hp) dead++;
	totalConfusionSelfHits += b.log.filter(l => l.startsWith('|-damage|p2') && l.includes('confusion')).length;
	b.destroy();
}
result.spinda = {samples: 512, triggered, woke, dead, reviveRateGivenLethal: triggered ? woke / triggered : 0, totalConfusionSelfHits,
	note: 'Opponent is a deliberately overlevelled single-hit test attacker, not a generated campaign opponent; no support protects sleeping Spinda.'};
for (const floor of [20, 40, 80, 100, 150, 200]) {
	const cleared = floor - 1;
	result.soloFloorOnly.push({floor, minimumLevelBeforeBattle: cleared <= 96 ? 5 + cleared : 101 + Math.floor((cleared - 96) / 2)});
}
for (const floor of [1, 50, 100, 150]) for (const tier of ['silver', 'gold', 'prismatic']) result.levelCosts.push({floor, tier,
	normal: blessingLevelCost(tier, floor), boss: blessingLevelCost(tier, floor, true)});
fs.mkdirSync('docs/playtests/2026-10-22', {recursive: true});
fs.writeFileSync(process.argv[2] || 'docs/playtests/2026-10-22/blessing-probes.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
