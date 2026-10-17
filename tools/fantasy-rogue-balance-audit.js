'use strict';
/** Offline, reproducible sensitivity checks. Never opens or edits player saves. */
const fs = require('fs');
const path = require('path');
const { Battle } = require('../dist/sim/battle');
const { Dex } = require('../dist/sim/dex');
const { createPreviewContent } = require('../dist/server/fantasy-rogue/preview-content');
const { createBiomeRoutes } = require('../dist/server/fantasy-rogue/biome-routes');
const { fixedFloor, ELITE_BOSS_FLOORS } = require('../dist/server/fantasy-rogue/content');
const { mentorSupplies, towerExperience, grantEventTraining } = require('../dist/server/fantasy-rogue/early-balance');
const { createRoguePokemon } = require('../dist/server/fantasy-rogue/progression');
const { experienceAtLevel, levelAtExperience, experienceYield, rogueSpeciesData } = require('../dist/sim/fantasy-rogue-rules');
const { ROGUE_BLESSINGS, blessing, blessingLevelCost } = require('../dist/sim/rogue-blessing-data');
const { sharedRogueItems } = require('../dist/sim/fantasy-rogue-items');
const dex = Dex.mod('gen9fantasy');
const stats = value => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });
const set = (species, moves, level = 100, item = '', ability) => ({ species, name: species,
	level, moves, item, ability: ability || dex.species.get(species).abilities[0], evs: stats(0), ivs: stats(20), nature: 'Hardy' });
const content = createPreviewContent();
const candies = Object.fromEntries(content.items.filter(i => i.kind === 'candy').map(i => [i.id, i.amount]));
function randomFor(seed) {
	let state = seed;
	return max => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 0x100000000 * max); };
}
function model(seed, revised, feed = 'weakest') {
	const random = randomFor(seed), snapshots = {}, team = [];
	const recruits = ['Mudkip', 'Rookidee', 'Shinx', 'Houndour', 'Oddish', 'Wooper'];
	const joined = [1, 3, 6, 12, 18, 24];
	const level = mon => levelAtExperience(mon.growth, mon.exp);
	const candy = (id, count) => {
		for (let i = 0; i < count; i++) {
			const sorted = team.slice().sort((a, b) => level(a) - level(b) || a.exp - b.exp);
			(feed === 'weakest' ? sorted[0] : sorted[sorted.length - 1]).exp += candies[id];
		}
	};
	for (let floor = 1; floor <= 200; floor++) {
		if (joined.includes(floor)) {
			const species = recruits[joined.indexOf(floor)], growth = rogueSpeciesData(species).growth;
			team.push({ species, growth, exp: experienceAtLevel(growth, floor === 1 ? 5 : Math.max(3, Math.ceil(floor / 2))) });
		}
		if (floor === 1) candy('expcandyxs', 3);
		if (fixedFloor(floor) === 'rest') {
			const oldCandy = floor < 29 ? 'expcandys' : floor < 79 ? 'expcandym' : 'expcandyl';
			const oldPerMember = floor < 19 ? 2 : floor < 29 ? 3 : floor < 39 ? 3 : floor < 49 ? 4 : floor < 69 ? 5 : floor < 79 ? 3 : 1;
			const supplies = revised ? mentorSupplies({floor, team}) : {[oldCandy]: floor < 100 ? Math.max(2, team.length) * oldPerMember : 2};
			for (const [id, count] of Object.entries(supplies)) if (candies[id]) candy(id, count);
			continue;
		}
		let node;
		if (fixedFloor(floor) === 'boss') {
			node = structuredClone(content.floors[floor][0]);
			const encounter = node.encounters[0];
			if (encounter.candidates) encounter.team = [encounter.candidates[random(encounter.candidates.length)]];
			if (encounter.trainerCandidates) encounter.team = encounter.trainerCandidates[random(encounter.trainerCandidates.length)].team;
			snapshots[floor] = team.map(m => ({ species: m.species, level: level(m) }));
		} else {
			const kind = ({ 1: 'wild', 2: 'wild', 3: 'event', 4: 'wild', 5: 'wild', 6: 'elite', 7: 'wild', 8: 'reward' })[floor % 10] || 'wild';
			const template = content.routePools[floor].find(n => n.kind === kind);
			node = createBiomeRoutes(floor, [template], undefined, random)[0];
		}
		// One gold at each available round. Same tax both sides; deliberately no blessing benefit.
		const cost = [1, 50, 100, 150].filter(f => f < floor || f === 1).reduce((sum, f) => sum + blessingLevelCost('gold', f, node.kind === 'boss'), 0);
		for (const encounter of node.encounters || []) for (const foe of encounter.team) {
			const base = rogueSpeciesData(foe.species).baseExperience, enemyLevel = foe.level + cost;
			const carry = team.reduce((a, b) => level(a) >= level(b) ? a : b);
			for (const mon of team) {
				const full = experienceYield(base, enemyLevel, level(mon), true);
				mon.exp += revised ? towerExperience(base, enemyLevel, level(mon), mon === carry, floor) :
					mon === carry || floor <= 60 ? full : floor <= 100 ? Math.max(1, Math.floor(full * 0.75)) :
						experienceYield(base, enemyLevel, level(mon), false);
			}
		}
		for (const [id, count] of Object.entries(node.reward?.items || {})) if (candies[id]) candy(id, count);
		if (node.kind === 'event') {
			if (revised) {
				const payout = {floor, bag: {}, node: {name: 'Model positive event', event: {settled: true}}};
				grantEventTraining(payout);
				for (const [id, count] of Object.entries(payout.bag)) candy(id, count);
			} else if (floor < 80) candy(floor < 40 ? 'expcandys' : 'expcandym', floor >= 20 && floor < 40 ? 2 : 1);
		}
		if (floor <= 70 && (node.kind === 'elite' || ELITE_BOSS_FLOORS.has(floor))) candy(floor <= 30 ? 'expcandys' : 'expcandym', floor <= 30 ? 2 : 1);
	}
	return snapshots;
}
function start(ids, ours, foes, extra = {}) {
	const team = ours.map(s => createRoguePokemon(s, stats(0)));
	const b = new Battle({ formatid: 'gen9fantasyrogue', seed: [10, 16, 20, 26],
		fantasyRogue: { encounterId: 'offline-audit', team, boosts: stats(0), bag: {}, balls: [], catchable: false,
			blessings: { owned: ids.map(id => ({ ...blessing(id), floor: 1 })) }, ...extra },
		p1: { name: 'Player', team: team.map(m => m.set) }, p2: { name: 'Opponent', team: foes } });
	b.choose('p1', 'team ' + team.map((_, i) => i + 1).join(''));
	b.choose('p2', 'team ' + foes.map((_, i) => i + 1).join(''));
	return b;
}
function blessingProbes() {
	const results = {};
	for (const ids of [[], ['renewable']]) {
		const b = start(ids, [set('Blissey', ['Splash'], 100, 'Sitrus Berry')], [set('Machamp', ['Seismic Toss'])]);
		const hp = [b.p1.active[0].hp];
		for (let n = 0; n < 10 && !b.ended; n++) { b.makeChoices('move 1', 'move 1'); hp.push(b.p1.pokemon[0].hp); }
		results[ids.length ? 'renewableSitrus' : 'singleSitrus'] = { hp };
		b.destroy();
	}
	for (const ids of [[], ['multihit']]) {
		const b = start(ids, [set('Tsareena', ['Triple Axel'])], [set('Toxapex', ['Splash'])]);
		b.randomizer = damage => damage; b.randomChance = () => false;
		const move = b.dex.getActiveMove('tripleaxel'); move.accuracy = true; move.willCrit = false;
		b.actions.runMove(move, b.p1.active[0], 1);
		results[ids.length ? 'sixAxel' : 'threeAxel'] = { damage: b.p2.active[0].maxhp - b.p2.active[0].hp,
			hits: b.log.find(l => l.startsWith('|-hitcount|')) };
		b.destroy();
	}
	for (const ids of [['stackstatus'], ['stackstatus', 'toxic']]) {
		const b = start(ids, [set('Venusaur', ['Poison Gas', 'Toxic', 'Splash'])], [set('Blissey', ['Splash'])]);
		b.randomChance = () => true;
		const hp = [b.p2.active[0].hp];
		for (const choice of ['move 1', 'move 2', 'move 3']) {
			if (b.ended) break;
			b.makeChoices(choice, 'move 1'); hp.push(b.p2.pokemon[0].hp);
		}
		results[ids.length === 1 ? 'stackedPoison' : 'stackedDoublePoison'] = { hp };
		b.destroy();
	}
	const mice = ['Pikachu', 'Raichu', 'Plusle', 'Minun', 'Pachirisu', 'Dedenne'];
	const items = ['', 'Light Ball', 'Choice Band', 'Choice Specs', 'Choice Scarf', 'Leftovers'];
	const b = start(['mousefamily'], mice.map((name, i) => set(name, ['Tackle', 'Thunderbolt'], 100, items[i])), [set('Blissey', ['Splash'])]);
	const p = b.p1.active[0];
	results.mouseEquipment = { items: sharedRogueItems(p), base: { ...p.storedStats },
		effective: { atk: p.getStat('atk'), spa: p.getStat('spa'), spe: p.getStat('spe') } };
	b.destroy();
	results.axelExpectedPower = { ordinary: [20, 40, 60].reduce((n, v, i) => n + v * 0.9 ** (i + 1), 0),
		doubled: [20, 40, 60, 80, 100, 120].reduce((n, v, i) => n + v * 0.9 ** (i + 1), 0) };
	return results;
}
const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const trajectories = {};
for (const feed of ['weakest', 'carry']) {
	const runs = Array.from({ length: 24 }, (_, i) => [model(1016 + i, false, feed), model(1016 + i, true, feed)]);
	trajectories[feed] = Object.fromEntries([10, 20, 30, 40, 50, 60, 80, 100, 150, 190, 200].map(floor => [floor,
		['before', 'after'].map((label, index) => ({ label,
			min: median(runs.map(pair => Math.min(...pair[index][floor].map(m => m.level)))),
			mean: Math.round(median(runs.map(pair => pair[index][floor].reduce((s, m) => s + m.level, 0) / pair[index][floor].length)) * 10) / 10,
			max: median(runs.map(pair => Math.max(...pair[index][floor].map(m => m.level)))),
		}))]));
}
const output = { method: 'No spirits/meta/stars. Offline growth potential, not win rate: all battles won, all six members survive; fixed 5 wild + 1 elite + 1 positive event + 1 reward per regular ten floors. Recruit at 1/3/6/12/18/24; real XP tables, biome rosters and boss teams. No bought candy, event battles, blessing effects or capture losses. Gold difficulty tax each round. Same seeds before/after.',
	trajectories, blessingProbes: blessingProbes(), catalog: ROGUE_BLESSINGS.map(b => ({ id: b.id, family: b.family, tier: b.tier, name: b.name, text: b.text, floors: b.floors })) };
output.method += ' Before = previous generous scaling gifts and full/75% early reserve XP; after = fixed gifts, half reserve XP and new event aid. Both use first elite base level 8.';
const folder = path.resolve('docs/playtests/2026-10-16/recalibration'); fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(folder, 'audit.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ trajectories, probes: output.blessingProbes, definitions: output.catalog.length,
	families: new Set(output.catalog.map(b => b.family)).size }, null, 2));
